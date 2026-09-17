"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.idsLimpos = idsLimpos;
exports.acharPorNome = acharPorNome;
exports.moverLancamentosPf = moverLancamentosPf;
exports.moverLancamentosPj = moverLancamentosPj;
/**
 * Mover lançamentos JÁ REGISTRADOS para outra conta ou cartão — PF e PJ.
 *
 * É a correção que faltava no agente: quando a compra entra na forma errada
 * (o usuário disse "Nubank" e caiu na forma solta, não no "CC Nubank PF"), o
 * conserto não é só trocar `forma_pagamento_id`. Sair de conta para cartão vira
 * competência (fatura, sem caixa); sair de cartão para conta vira caixa. As duas
 * pontas precisam ser reescritas juntas, senão o lançamento fica meio no caixa e
 * meio na fatura.
 *
 * Regras que o serviço garante:
 * - só mexe no que é do usuário (carteira PF / empresa PJ);
 * - cartão só recebe Despesa;
 * - fatura já PAGA não perde nem ganha compra (quebraria o pagamento feito);
 * - parcelamento mantém uma parcela por fatura, ancorando na 1ª parcela do
 *   grupo — nunca reaplicando a regra de fechamento parcela a parcela.
 */
const db_1 = require("../db");
const drizzle_orm_1 = require("drizzle-orm");
const fatura_core_1 = require("./fatura-core");
const norm = (s) => String(s || "").trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
function idsLimpos(ids) {
    const arr = Array.isArray(ids) ? ids : [ids];
    const out = arr.map((x) => Number(x)).filter((n) => Number.isInteger(n) && n > 0);
    return Array.from(new Set(out));
}
/** Casa pelo nome: exato primeiro, depois "contém", sempre o nome mais específico. */
function acharPorNome(lista, texto) {
    const alvo = norm(texto);
    if (!alvo)
        return undefined;
    const nomes = (x) => [norm(x.nome || ""), norm(x.banco || "")].filter(Boolean);
    const exato = lista.find((x) => nomes(x).some((n) => n === alvo));
    if (exato)
        return exato;
    const contem = lista.filter((x) => nomes(x).some((n) => n.includes(alvo) || alvo.includes(n)));
    return contem.sort((a, b) => Math.max(...nomes(b).map((n) => n.length)) - Math.max(...nomes(a).map((n) => n.length)))[0];
}
/**
 * Competência de cada linha, ancorada na 1ª parcela do grupo.
 * Devolve um mapa id → competência (AAAA-MM).
 */
async function competenciasAncoradas(linhas, diaFech, diaVenc, tabela) {
    const mapa = new Map();
    const grupos = new Map();
    for (const l of linhas) {
        const dataISO = String(l.data_transacao).slice(0, 10);
        const grupo = l.compra_grupo || null;
        const parcela = Number(l.parcela_num) || 0;
        if (!grupo || !parcela) {
            mapa.set(l.id, (0, fatura_core_1.competenciaDaCompra)(dataISO, diaFech, diaVenc).competencia);
            continue;
        }
        let ancora = grupos.get(grupo);
        if (!ancora) {
            // A 1ª parcela do grupo manda, mesmo que não esteja entre as selecionadas.
            const r = tabela === "transacoes"
                ? await db_1.db.execute((0, drizzle_orm_1.sql) `
              SELECT data_transacao, parcela_num FROM transacoes
              WHERE compra_grupo = ${grupo} ORDER BY parcela_num ASC LIMIT 1
            `)
                : await db_1.db.execute((0, drizzle_orm_1.sql) `
              SELECT data_transacao, parcela_num FROM empresas_transacoes
              WHERE compra_grupo = ${grupo} ORDER BY parcela_num ASC LIMIT 1
            `);
            const primeira = r[0];
            const dataBase = primeira ? String(primeira.data_transacao).slice(0, 10) : dataISO;
            const parcelaBase = primeira ? Number(primeira.parcela_num) || 1 : parcela;
            ancora = {
                competencia: (0, fatura_core_1.competenciaDaCompra)(dataBase, diaFech, diaVenc).competencia,
                parcelaBase,
            };
            grupos.set(grupo, ancora);
        }
        mapa.set(l.id, (0, fatura_core_1.competenciaMaisMeses)(ancora.competencia, Math.max(0, parcela - ancora.parcelaBase)));
    }
    return mapa;
}
/** Recusa mexer em compra que está numa fatura já paga. */
async function faturaPagaBloqueia(faturaIds, tabela) {
    const ids = faturaIds.filter((x) => Number.isInteger(x) && x > 0);
    if (!ids.length)
        return null;
    const lista = drizzle_orm_1.sql.join(ids.map((i) => (0, drizzle_orm_1.sql) `${i}`), (0, drizzle_orm_1.sql) `, `);
    const r = tabela === "faturas"
        ? await db_1.db.execute((0, drizzle_orm_1.sql) `SELECT competencia FROM faturas WHERE id IN (${lista}) AND status = 'paga'`)
        : await db_1.db.execute((0, drizzle_orm_1.sql) `SELECT competencia FROM empresas_faturas WHERE id IN (${lista}) AND status = 'paga'`);
    const pagas = r.map((f) => f.competencia);
    if (!pagas.length)
        return null;
    return `A fatura de ${pagas.join(", ")} já está paga. Reabra a fatura antes de mover estes lançamentos.`;
}
// =====================================================================
// PF
// =====================================================================
async function moverLancamentosPf(userId, walletId, idsBrutos, destinoTexto) {
    const ids = idsLimpos(idsBrutos);
    if (!ids.length)
        return { ok: false, error: "Informe os códigos dos lançamentos a mover." };
    if (!String(destinoTexto || "").trim()) {
        return { ok: false, error: "Informe para qual conta ou cartão os lançamentos vão." };
    }
    const lista = drizzle_orm_1.sql.join(ids.map((i) => (0, drizzle_orm_1.sql) `${i}`), (0, drizzle_orm_1.sql) `, `);
    const rows = (await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT id, data_transacao, tipo, status, compra_grupo, parcela_num, fatura_id, forma_pagamento_id
    FROM transacoes
    WHERE id IN (${lista}) AND carteira_id = ${walletId}
  `));
    const achados = new Set(rows.map((r) => Number(r.id)));
    const faltando = ids.filter((i) => !achados.has(i));
    if (faltando.length) {
        return { ok: false, error: `Não achei estes códigos na sua carteira: ${faltando.join(", ")}.` };
    }
    const { listarContasPf } = await Promise.resolve().then(() => __importStar(require("./conta-bancaria.service")));
    const cartoesRows = (await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT id, nome FROM formas_pagamento
    WHERE usuario_id = ${userId} AND ativo = true
      AND dia_fechamento IS NOT NULL AND dia_vencimento IS NOT NULL
  `));
    const contas = await listarContasPf(userId);
    const cartao = acharPorNome(cartoesRows, destinoTexto);
    const conta = cartao ? undefined : acharPorNome(contas, destinoTexto);
    if (!cartao && !conta) {
        return {
            ok: false,
            error: `Não achei "${destinoTexto}" entre os cartões e contas cadastrados.`,
            cartoes: cartoesRows.map((c) => c.nome),
            contas: contas.map((c) => c.nome || c.banco).filter(Boolean),
        };
    }
    const bloqueio = await faturaPagaBloqueia(rows.map((r) => Number(r.fatura_id)).filter(Boolean), "faturas");
    if (bloqueio)
        return { ok: false, error: bloqueio };
    // ---- destino: cartão ----
    if (cartao) {
        const naoDespesa = rows.filter((r) => String(r.tipo) !== "Despesa");
        if (naoDespesa.length) {
            return {
                ok: false,
                error: `Cartão de crédito só recebe despesa. Fora do padrão: ${naoDespesa.map((r) => r.id).join(", ")}.`,
            };
        }
        const { cartaoPfDoUsuario, resolverFaturaPfPorCompetencia } = await Promise.resolve().then(() => __importStar(require("./fatura-pf.service")));
        const c = await cartaoPfDoUsuario(cartao.id, userId);
        if (!c)
            return { ok: false, error: "Cartão não encontrado." };
        const comps = await competenciasAncoradas(rows, Number(c.dia_fechamento) || 1, Number(c.dia_vencimento) || 10, "transacoes");
        const faturas = new Set();
        for (const r of rows) {
            const competencia = comps.get(Number(r.id));
            const { fatura } = await resolverFaturaPfPorCompetencia(userId, walletId, c, competencia);
            faturas.add(competencia);
            await db_1.db.execute((0, drizzle_orm_1.sql) `
        UPDATE transacoes SET
          forma_pagamento_id = ${c.id},
          conta_bancaria_id = NULL,
          fatura_id = ${fatura.id},
          competencia = ${competencia},
          movimenta_caixa = false,
          status = ${String(r.status) === "Efetivada" ? "Pendente" : r.status}
        WHERE id = ${r.id}
      `);
        }
        return {
            ok: true,
            afetados: rows.length,
            destino: c.nome,
            tipo_destino: "cartao",
            faturas: Array.from(faturas).sort(),
            ids: rows.map((r) => Number(r.id)),
        };
    }
    // ---- destino: conta bancária ----
    const cartaoIds = new Set(cartoesRows.map((c) => Number(c.id)));
    for (const r of rows) {
        const eraCartao = r.forma_pagamento_id != null && cartaoIds.has(Number(r.forma_pagamento_id));
        await db_1.db.execute((0, drizzle_orm_1.sql) `
      UPDATE transacoes SET
        conta_bancaria_id = ${conta.id},
        forma_pagamento_id = ${eraCartao ? null : r.forma_pagamento_id},
        fatura_id = NULL,
        competencia = NULL,
        movimenta_caixa = true
      WHERE id = ${r.id}
    `);
    }
    return {
        ok: true,
        afetados: rows.length,
        destino: conta.nome || conta.banco,
        tipo_destino: "conta",
        faturas: [],
        ids: rows.map((r) => Number(r.id)),
    };
}
// =====================================================================
// PJ
// =====================================================================
async function moverLancamentosPj(empresaId, userId, idsBrutos, destinoTexto) {
    const ids = idsLimpos(idsBrutos);
    if (!ids.length)
        return { ok: false, error: "Informe os códigos dos lançamentos a mover." };
    if (!String(destinoTexto || "").trim()) {
        return { ok: false, error: "Informe para qual conta bancária ou cartão os lançamentos vão." };
    }
    const lista = drizzle_orm_1.sql.join(ids.map((i) => (0, drizzle_orm_1.sql) `${i}`), (0, drizzle_orm_1.sql) `, `);
    const rows = (await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT id, data_transacao, tipo, status, compra_grupo, parcela_num, fatura_id, cartao_id
    FROM empresas_transacoes
    WHERE id IN (${lista}) AND empresa_id = ${empresaId}
  `));
    const achados = new Set(rows.map((r) => Number(r.id)));
    const faltando = ids.filter((i) => !achados.has(i));
    if (faltando.length) {
        return { ok: false, error: `Não achei estes códigos nesta empresa: ${faltando.join(", ")}.` };
    }
    const { resolverMeioPorNomePj } = await Promise.resolve().then(() => __importStar(require("./meio-pagamento-pj")));
    const meio = await resolverMeioPorNomePj(empresaId, userId, destinoTexto);
    if (!meio.ok) {
        return { ok: false, error: meio.mensagem, cartoes: meio.sugestoes, contas: [] };
    }
    const bloqueio = await faturaPagaBloqueia(rows.map((r) => Number(r.fatura_id)).filter(Boolean), "empresas_faturas");
    if (bloqueio)
        return { ok: false, error: bloqueio };
    // ---- destino: cartão ----
    if (meio.cartao_id) {
        const naoDespesa = rows.filter((r) => String(r.tipo) !== "Despesa");
        if (naoDespesa.length) {
            return {
                ok: false,
                error: `Cartão de crédito só recebe despesa. Fora do padrão: ${naoDespesa.map((r) => r.id).join(", ")}.`,
            };
        }
        const { cartaoDoUsuario, resolverFaturaPorCompetencia } = await Promise.resolve().then(() => __importStar(require("./fatura-pj.service")));
        const c = await cartaoDoUsuario(meio.cartao_id, userId);
        if (!c || c.empresa_id !== empresaId) {
            return { ok: false, error: "Cartão não encontrado nesta empresa." };
        }
        const comps = await competenciasAncoradas(rows, Number(c.dia_fechamento) || 1, Number(c.dia_vencimento) || 10, "empresas_transacoes");
        const faturas = new Set();
        for (const r of rows) {
            const competencia = comps.get(Number(r.id));
            const { fatura, metodo } = await resolverFaturaPorCompetencia(empresaId, c, competencia);
            faturas.add(competencia);
            await db_1.db.execute((0, drizzle_orm_1.sql) `
        UPDATE empresas_transacoes SET
          cartao_id = ${c.id},
          conta_bancaria_id = NULL,
          fatura_id = ${fatura.id},
          competencia = ${competencia},
          movimenta_caixa = false,
          metodo_pagamento = ${metodo}
        WHERE id = ${r.id}
      `);
        }
        return {
            ok: true,
            afetados: rows.length,
            destino: c.nome,
            tipo_destino: "cartao",
            faturas: Array.from(faturas).sort(),
            ids: rows.map((r) => Number(r.id)),
        };
    }
    // ---- destino: conta bancária ----
    const { getContasBancariasByEmpresa } = await Promise.resolve().then(() => __importStar(require("../storage")));
    const contas = (await getContasBancariasByEmpresa(empresaId));
    const conta = contas.find((c) => c.id === meio.conta_bancaria_id);
    if (!conta)
        return { ok: false, error: "Conta bancária não encontrada nesta empresa." };
    for (const r of rows) {
        await db_1.db.execute((0, drizzle_orm_1.sql) `
      UPDATE empresas_transacoes SET
        conta_bancaria_id = ${conta.id},
        cartao_id = NULL,
        fatura_id = NULL,
        competencia = NULL,
        movimenta_caixa = true,
        metodo_pagamento = ${conta.nome || conta.banco || "Conta"}
      WHERE id = ${r.id}
    `);
    }
    return {
        ok: true,
        afetados: rows.length,
        destino: conta.nome || conta.banco,
        tipo_destino: "conta",
        faturas: [],
        ids: rows.map((r) => Number(r.id)),
    };
}
