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
exports.listarContas = listarContas;
exports.lancamentosConta = lancamentosConta;
exports.criarConta = criarConta;
exports.atualizarConta = atualizarConta;
exports.excluirConta = excluirConta;
exports.listarCartoes = listarCartoes;
exports.lancamentosCartao = lancamentosCartao;
exports.criarCartao = criarCartao;
exports.atualizarCartao = atualizarCartao;
exports.excluirCartao = excluirCartao;
exports.listarFaturas = listarFaturas;
exports.saldoCartao = saldoCartao;
exports.detalheFatura = detalheFatura;
exports.pagarFatura = pagarFatura;
exports.reabrirFatura = reabrirFatura;
exports.listarVencimentos = listarVencimentos;
exports.resumoFaturas = resumoFaturas;
exports.expandirParcelasFatura = expandirParcelasFatura;
exports.moverLancamentoFatura = moverLancamentoFatura;
exports.recalcularFaturasCartao = recalcularFaturasCartao;
const faturaPf = __importStar(require("../services/fatura-pf.service"));
const contas = __importStar(require("../services/conta-bancaria.service"));
const db_1 = require("../db");
const drizzle_orm_1 = require("drizzle-orm");
const storage_1 = require("../storage");
const mover_meio_service_1 = require("../services/mover-meio.service");
const parcelas_grupo_service_1 = require("../services/parcelas-grupo.service");
const fatura_core_1 = require("../services/fatura-core");
/**
 * Contas, cartões e faturas do PF.
 */
// ── Contas bancárias ──────────────────────────────────────────────
async function listarContas(req, res) {
    try {
        const de = req.query.de || undefined;
        const ate = req.query.ate || undefined;
        return res.json(await contas.listarContasComSaldoPf(req.user.id, de, ate));
    }
    catch (e) {
        return res.status(500).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao listar contas" });
    }
}
async function lancamentosConta(req, res) {
    try {
        const contaId = Number(req.params.id);
        const de = req.query.de || undefined;
        const ate = req.query.ate || undefined;
        const lista = await contas.listarLancamentosContaPf(req.user.id, contaId, de, ate);
        const mov = await contas.movimentoContaPeriodo(contaId, de, ate);
        return res.json({
            conta_id: contaId,
            periodo: { de: de || null, ate: ate || null },
            saldo: mov.movimento,
            entradas: mov.entradas,
            saidas: mov.saidas,
            lancamentos: lista,
        });
    }
    catch (e) {
        return res.status(500).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao listar lançamentos" });
    }
}
async function criarConta(req, res) {
    try {
        const conta = await contas.criarContaPf(req.user.id, req.body || {});
        return res.status(201).json(conta);
    }
    catch (e) {
        return res.status(400).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao criar conta" });
    }
}
async function atualizarConta(req, res) {
    try {
        const conta = await contas.atualizarContaPf(req.user.id, Number(req.params.id), req.body || {});
        if (!conta)
            return res.status(404).json({ error: "Conta não encontrada" });
        return res.json(conta);
    }
    catch (e) {
        return res.status(400).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao atualizar conta" });
    }
}
async function excluirConta(req, res) {
    try {
        const r = await contas.excluirContaPf(req.user.id, Number(req.params.id));
        if (!r.ok)
            return res.status(404).json({ error: r.error || "Conta não encontrada" });
        return res.json({ success: true });
    }
    catch (e) {
        return res.status(400).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao excluir conta" });
    }
}
// ── Cartões (formas_pagamento com limite) ─────────────────────────
async function listarCartoes(req, res) {
    try {
        const de = req.query.de || undefined;
        const ate = req.query.ate || undefined;
        return res.json(await faturaPf.listarCartoesComSaldoPf(req.user.id, de, ate));
    }
    catch (e) {
        return res.status(500).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao listar cartões" });
    }
}
async function lancamentosCartao(req, res) {
    try {
        const cartaoId = Number(req.params.id);
        const cartao = await faturaPf.cartaoPfDoUsuario(cartaoId, req.user.id);
        if (!cartao || Number(cartao.usuario_id) !== req.user.id) {
            return res.status(404).json({ error: "Cartão não encontrado" });
        }
        const de = req.query.de || undefined;
        const ate = req.query.ate || undefined;
        const lista = await faturaPf.listarLancamentosCartaoPf(req.user.id, cartaoId, de, ate);
        const mov = await faturaPf.movimentoCartaoPeriodo(cartaoId, de, ate);
        return res.json({
            cartao_id: cartaoId,
            cartao_nome: cartao.nome,
            periodo: { de: de || null, ate: ate || null },
            saldo: mov.usado,
            usado: mov.usado,
            lancamentos: lista,
        });
    }
    catch (e) {
        return res.status(500).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao listar lançamentos" });
    }
}
async function criarCartao(req, res) {
    try {
        const b = req.body || {};
        const nome = String(b.nome || "").trim();
        const diaFech = Number(b.dia_fechamento);
        const diaVenc = Number(b.dia_vencimento);
        if (!nome)
            return res.status(400).json({ error: "Nome é obrigatório" });
        if (!(diaFech >= 1 && diaFech <= 31))
            return res.status(400).json({ error: "Dia de fechamento deve ser 1–31" });
        if (!(diaVenc >= 1 && diaVenc <= 31))
            return res.status(400).json({ error: "Dia de vencimento deve ser 1–31" });
        const limite = b.limite != null && b.limite !== "" ? Number(b.limite) : null;
        const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
      INSERT INTO formas_pagamento
        (usuario_id, nome, global, ativo, limite, dia_fechamento, dia_vencimento, bandeira, cor)
      VALUES
        (${req.user.id}, ${nome}, false, true,
         ${limite != null && Number.isFinite(limite) ? limite.toFixed(2) : null},
         ${diaFech}, ${diaVenc},
         ${b.banco || b.bandeira || null},
         ${b.cor || null})
      RETURNING *
    `);
        return res.status(201).json(r[0]);
    }
    catch (e) {
        return res.status(400).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao criar cartão" });
    }
}
async function atualizarCartao(req, res) {
    try {
        const cartaoId = Number(req.params.id);
        const cartao = await faturaPf.cartaoPfDoUsuario(cartaoId, req.user.id);
        if (!cartao || cartao.usuario_id !== req.user.id) {
            return res.status(404).json({ error: "Cartão não encontrado" });
        }
        const b = req.body || {};
        const nome = b.nome != null ? String(b.nome).trim() : cartao.nome;
        const diaFech = b.dia_fechamento != null ? Number(b.dia_fechamento) : cartao.dia_fechamento;
        const diaVenc = b.dia_vencimento != null ? Number(b.dia_vencimento) : cartao.dia_vencimento;
        if (!(diaFech >= 1 && diaFech <= 31) || !(diaVenc >= 1 && diaVenc <= 31)) {
            return res.status(400).json({ error: "Dias de fechamento/vencimento devem ser 1–31" });
        }
        const limite = b.limite !== undefined
            ? (b.limite === null || b.limite === "" ? null : Number(b.limite).toFixed(2))
            : cartao.limite;
        const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
      UPDATE formas_pagamento
      SET nome = ${nome},
          dia_fechamento = ${diaFech},
          dia_vencimento = ${diaVenc},
          limite = ${limite},
          bandeira = ${b.banco !== undefined || b.bandeira !== undefined ? (b.banco || b.bandeira) : cartao.bandeira},
          cor = ${b.cor !== undefined ? b.cor : cartao.cor},
          ativo = ${b.ativo != null ? !!b.ativo : cartao.ativo}
      WHERE id = ${cartaoId} AND usuario_id = ${req.user.id}
      RETURNING *
    `);
        return res.json(r[0]);
    }
    catch (e) {
        return res.status(400).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao atualizar cartão" });
    }
}
async function excluirCartao(req, res) {
    try {
        const cartaoId = Number(req.params.id);
        const cartao = await faturaPf.cartaoPfDoUsuario(cartaoId, req.user.id);
        if (!cartao || cartao.usuario_id !== req.user.id) {
            return res.status(404).json({ error: "Cartão não encontrado" });
        }
        await db_1.db.execute((0, drizzle_orm_1.sql) `
      UPDATE formas_pagamento SET ativo = false
      WHERE id = ${cartaoId} AND usuario_id = ${req.user.id}
    `);
        return res.json({ success: true });
    }
    catch (e) {
        return res.status(400).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao excluir cartão" });
    }
}
async function listarFaturas(req, res) {
    try {
        const cartaoId = Number(req.params.id);
        const cartao = await faturaPf.cartaoPfDoUsuario(cartaoId, req.user.id);
        if (!cartao)
            return res.status(404).json({ error: "Cartão não encontrado" });
        return res.json({ cartao, faturas: await faturaPf.listarFaturasPf(cartaoId) });
    }
    catch (e) {
        return res.status(500).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao listar faturas" });
    }
}
async function saldoCartao(req, res) {
    try {
        const cartaoId = Number(req.params.id);
        const cartao = await faturaPf.cartaoPfDoUsuario(cartaoId, req.user.id);
        if (!cartao)
            return res.status(404).json({ error: "Cartão não encontrado" });
        return res.json(await faturaPf.getSaldoCartaoPf(cartaoId));
    }
    catch (e) {
        return res.status(400).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao calcular saldo" });
    }
}
async function detalheFatura(req, res) {
    try {
        const faturaId = Number(req.params.id);
        const fatura = await faturaPf.getFaturaPfById(faturaId);
        if (!fatura || fatura.usuario_id !== req.user.id) {
            return res.status(404).json({ error: "Fatura não encontrada" });
        }
        return res.json(await faturaPf.detalheFaturaPf(faturaId));
    }
    catch (e) {
        return res.status(500).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao obter fatura" });
    }
}
async function pagarFatura(req, res) {
    var _a, _b, _c;
    try {
        const faturaId = Number(req.params.id);
        const fatura = await faturaPf.getFaturaPfById(faturaId);
        if (!fatura || fatura.usuario_id !== req.user.id) {
            return res.status(404).json({ error: "Fatura não encontrada" });
        }
        if (fatura.status === "paga")
            return res.status(400).json({ error: "Fatura já está paga" });
        const contaId = Number((_a = req.body) === null || _a === void 0 ? void 0 : _a.conta_bancaria_id);
        if (!contaId)
            return res.status(400).json({ error: "Escolha a conta de onde sai o pagamento." });
        const contasUser = await contas.listarContasPf(req.user.id);
        if (!contasUser.find((c) => c.id === contaId)) {
            return res.status(400).json({ error: "Conta não encontrada" });
        }
        const cartao = await faturaPf.cartaoPfDoUsuario(fatura.forma_pagamento_id, req.user.id);
        if (!cartao)
            return res.status(404).json({ error: "Cartão da fatura não encontrado" });
        const r = await faturaPf.pagarFaturaPf(fatura, cartao, {
            conta_bancaria_id: contaId,
            data_pagamento: (_b = req.body) === null || _b === void 0 ? void 0 : _b.data_pagamento,
            categoria_id: ((_c = req.body) === null || _c === void 0 ? void 0 : _c.categoria_id) ? Number(req.body.categoria_id) : undefined,
            usuario_id: req.user.id,
        });
        return res.json(r);
    }
    catch (e) {
        return res.status(400).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao pagar fatura" });
    }
}
async function reabrirFatura(req, res) {
    try {
        const faturaId = Number(req.params.id);
        const fatura = await faturaPf.getFaturaPfById(faturaId);
        if (!fatura || fatura.usuario_id !== req.user.id) {
            return res.status(404).json({ error: "Fatura não encontrada" });
        }
        const r = await faturaPf.reabrirFaturaPf(fatura);
        return res.json(r);
    }
    catch (e) {
        return res.status(400).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao reabrir fatura" });
    }
}
/** Faturas em aberto no período (para tela Vencimentos). */
async function listarVencimentos(req, res) {
    try {
        const userId = req.user.id;
        const de = req.query.de || undefined;
        const ate = req.query.ate || undefined;
        const status = req.query.status || "aberta"; // aberta | paga | todas
        let statusFilter = (0, drizzle_orm_1.sql) `f.status IN ('aberta', 'fechada')`;
        if (status === "paga")
            statusFilter = (0, drizzle_orm_1.sql) `f.status = 'paga'`;
        else if (status === "todas")
            statusFilter = (0, drizzle_orm_1.sql) `true`;
        const faturas = await db_1.db.execute((0, drizzle_orm_1.sql) `
      SELECT f.*, fp.nome AS cartao_nome, fp.cor AS cartao_cor,
             COALESCE((
               SELECT SUM(t.valor::numeric) FROM transacoes t
               WHERE t.fatura_id = f.id AND COALESCE(t.movimenta_caixa, false) = false
             ), 0) AS total
      FROM faturas f
      JOIN formas_pagamento fp ON fp.id = f.forma_pagamento_id
      WHERE f.usuario_id = ${userId}
        AND ${statusFilter}
        ${de ? (0, drizzle_orm_1.sql) `AND f.data_vencimento >= ${de}` : (0, drizzle_orm_1.sql) ``}
        ${ate ? (0, drizzle_orm_1.sql) `AND f.data_vencimento <= ${ate}` : (0, drizzle_orm_1.sql) ``}
      ORDER BY f.data_vencimento ASC
    `);
        const wallet = await storage_1.storage.getWalletByUserId(userId);
        let boletos = [];
        if (wallet) {
            const st = status === "paga" ? "Efetivada" : "Pendente";
            const rows = await db_1.db.execute((0, drizzle_orm_1.sql) `
        SELECT t.id, t.descricao, t.valor, t.data_vencimento, t.data_transacao, t.status, t.tipo,
               t.fatura_id, t.movimenta_caixa, fp.nome AS forma_pagamento, c.nome AS categoria
        FROM transacoes t
        LEFT JOIN formas_pagamento fp ON fp.id = t.forma_pagamento_id
        LEFT JOIN categorias c ON c.id = t.categoria_id
        WHERE t.carteira_id = ${wallet.id}
          AND t.status = ${st}
          AND t.tipo = 'Despesa'
          AND COALESCE(t.reembolsavel, false) = false
          AND t.fatura_id IS NULL
          AND COALESCE(t.movimenta_caixa, true) = true
          AND (t.data_vencimento IS NOT NULL OR t.data_transacao IS NOT NULL)
          ${de ? (0, drizzle_orm_1.sql) `AND COALESCE(t.data_vencimento, t.data_transacao) >= ${de}` : (0, drizzle_orm_1.sql) ``}
          ${ate ? (0, drizzle_orm_1.sql) `AND COALESCE(t.data_vencimento, t.data_transacao) <= ${ate}` : (0, drizzle_orm_1.sql) ``}
        ORDER BY COALESCE(t.data_vencimento, t.data_transacao) ASC
      `);
            boletos = rows;
        }
        return res.json({ faturas, boletos });
    }
    catch (e) {
        return res.status(500).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao listar vencimentos" });
    }
}
/**
 * Resumo de faturas do PF — compacto e pronto para a IA (WhatsApp) responder
 * "qual o saldo/valor da minha fatura". Autenticável por apikey (MasterToken).
 * GET /api/cartoes/resumo
 */
async function resumoFaturas(req, res) {
    try {
        const userId = req.user.id;
        const cartoes = await faturaPf.listarCartoesPf(userId);
        let totalGeral = 0;
        const out = [];
        for (const c of cartoes) {
            const saldo = await faturaPf.getSaldoCartaoPf(c.id);
            const faturas = await faturaPf.listarFaturasPf(c.id);
            const abertas = faturas
                .filter((f) => f.status !== "paga")
                .map((f) => ({
                competencia: f.competencia,
                total: Math.round((Number(f.total) || 0) * 100) / 100,
                vencimento: f.data_vencimento,
                status: f.status,
            }))
                .sort((a, b) => String(a.competencia).localeCompare(String(b.competencia)));
            const totalAberto = abertas.reduce((s, f) => s + f.total, 0);
            totalGeral += totalAberto;
            const limiteDisponivel = saldo.sem_limite
                ? null
                : Math.round(((Number(saldo.limite) || 0) - totalAberto) * 100) / 100;
            out.push({
                cartao: c.nome,
                limite: saldo.limite,
                sem_limite: saldo.sem_limite,
                total_em_aberto: Math.round(totalAberto * 100) / 100,
                limite_disponivel: limiteDisponivel,
                proxima_fatura: abertas[0] || null,
                faturas_abertas: abertas,
            });
        }
        return res.json({
            cartoes: out,
            total_geral_em_aberto: Math.round(totalGeral * 100) / 100,
        });
    }
    catch (e) {
        return res.status(500).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao gerar resumo de faturas" });
    }
}
/**
 * Preview: quais lançamentos seriam incluídos (todas as parcelas da compra).
 * POST /api/faturas/expandir-parcelas  { transacao_ids: number[] }
 */
async function expandirParcelasFatura(req, res) {
    var _a, _b, _c;
    try {
        const userId = req.user.id;
        const ids = (0, mover_meio_service_1.idsLimpos)((_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a.transacao_ids) !== null && _b !== void 0 ? _b : (_c = req.body) === null || _c === void 0 ? void 0 : _c.transacao_id);
        if (!ids.length)
            return res.status(400).json({ error: "Informe transacao_ids." });
        const wallet = await storage_1.storage.getWalletByUserId(userId);
        if (!wallet)
            return res.status(404).json({ error: "Carteira não encontrada" });
        const exp = await (0, parcelas_grupo_service_1.expandirIdsComParcelasPf)(wallet.id, ids);
        return res.json({
            ids_originais: ids,
            ids: exp.ids,
            extra: Math.max(0, exp.ids.length - ids.length),
            lancamentos: exp.linhas.map((l) => ({
                id: l.id,
                descricao: l.descricao,
                parcela: l.parcela_num && l.parcela_total ? `${l.parcela_num}/${l.parcela_total}` : null,
            })),
        });
    }
    catch (e) {
        return res.status(400).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao expandir parcelas" });
    }
}
/**
 * Move um ou vários lançamentos de cartão para outro CARTÃO.
 * POST /api/faturas/mover-lancamento
 * { transacao_id | transacao_ids, cartao_id, competencia?, todas_parcelas? }
 *
 * competencia (YYYY-MM): vale para o item escolhido; as outras parcelas da mesma
 * compra andam mês a mês. Se omitida, recalcula pela data + fechamento do cartão.
 * todas_parcelas (default true): inclui irmãs da compra (grupo ou texto 4/7).
 */
async function moverLancamentoFatura(req, res) {
    var _a, _b, _c, _d, _e, _f;
    try {
        const userId = req.user.id;
        const idsIn = (0, mover_meio_service_1.idsLimpos)((_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a.transacao_ids) !== null && _b !== void 0 ? _b : (_c = req.body) === null || _c === void 0 ? void 0 : _c.transacao_id);
        const cartaoId = Number((_d = req.body) === null || _d === void 0 ? void 0 : _d.cartao_id);
        const competenciaIn = String(((_e = req.body) === null || _e === void 0 ? void 0 : _e.competencia) || "").slice(0, 7);
        const temComp = /^\d{4}-\d{2}$/.test(competenciaIn);
        const todasParcelas = ((_f = req.body) === null || _f === void 0 ? void 0 : _f.todas_parcelas) !== false;
        if (!idsIn.length || !cartaoId) {
            return res.status(400).json({ error: "Informe transacao_id(s) e cartao_id." });
        }
        const cartao = await faturaPf.cartaoPfDoUsuario(cartaoId, userId);
        if (!cartao || Number(cartao.usuario_id) !== userId) {
            return res.status(404).json({ error: "Cartão não encontrado" });
        }
        const wallet = await storage_1.storage.getWalletByUserId(userId);
        if (!wallet)
            return res.status(404).json({ error: "Carteira não encontrada" });
        const exp = await (0, parcelas_grupo_service_1.expandirIdsComParcelasPf)(wallet.id, idsIn);
        const linhasBase = todasParcelas ? exp.linhas : exp.linhas.filter((l) => idsIn.includes(l.id));
        if (!linhasBase.length) {
            return res.status(404).json({ error: "Lançamento não encontrado" });
        }
        const faturaIds = linhasBase.map((l) => l.fatura_id).filter((x) => !!x);
        let ignoradosPagos = 0;
        const pagas = new Set();
        if (faturaIds.length) {
            const listaF = drizzle_orm_1.sql.join(faturaIds.map((i) => (0, drizzle_orm_1.sql) `${i}`), (0, drizzle_orm_1.sql) `, `);
            const rPagas = (await db_1.db.execute((0, drizzle_orm_1.sql) `
        SELECT id FROM faturas WHERE id IN (${listaF}) AND status = 'paga'
      `));
            for (const p of rPagas)
                pagas.add(Number(p.id));
        }
        const linhasOk = linhasBase.filter((l) => {
            if (l.fatura_id && pagas.has(l.fatura_id)) {
                ignoradosPagos++;
                return false;
            }
            return true;
        });
        if (!linhasOk.length) {
            return res.status(400).json({
                error: "Todos os lançamentos estão em fatura já paga. Reabra a fatura antes de mover.",
            });
        }
        const diaF = Number(cartao.dia_fechamento) || 1;
        const diaV = Number(cartao.dia_vencimento) || 10;
        const ancoraGrupo = new Map();
        if (temComp) {
            const selecionadas = new Set(idsIn);
            const porGrupo = new Map();
            for (const l of linhasOk) {
                const k = (0, parcelas_grupo_service_1.chaveGrupoParcela)(l);
                const arr = porGrupo.get(k) || [];
                arr.push(l);
                porGrupo.set(k, arr);
            }
            for (const [k, arr] of porGrupo) {
                const noOrigem = arr.filter((l) => selecionadas.has(l.id) || selecionadas.has(l.origem));
                const ancora = [...(noOrigem.length ? noOrigem : arr)].sort((a, b) => (a.parcela_num || 1) - (b.parcela_num || 1))[0];
                ancoraGrupo.set(k, { parcela: ancora.parcela_num || 1, competencia: competenciaIn });
            }
        }
        const faturas = new Set();
        for (const l of linhasOk) {
            let competencia;
            if (temComp) {
                const anc = ancoraGrupo.get((0, parcelas_grupo_service_1.chaveGrupoParcela)(l));
                if (anc && l.parcela_num && l.parcela_total) {
                    competencia = (0, fatura_core_1.competenciaMaisMeses)(anc.competencia, (l.parcela_num || 1) - anc.parcela);
                }
                else {
                    competencia = competenciaIn;
                }
            }
            else {
                const grupo = linhasOk
                    .filter((x) => (0, parcelas_grupo_service_1.chaveGrupoParcela)(x) === (0, parcelas_grupo_service_1.chaveGrupoParcela)(l))
                    .sort((a, b) => (a.parcela_num || 1) - (b.parcela_num || 1));
                const primeira = grupo[0] || l;
                const base = (0, fatura_core_1.competenciaDaCompra)(String(primeira.data_transacao).slice(0, 10), diaF, diaV).competencia;
                if (l.parcela_num && primeira.parcela_num && l.id !== primeira.id) {
                    competencia = (0, fatura_core_1.competenciaMaisMeses)(base, (l.parcela_num || 1) - (primeira.parcela_num || 1));
                }
                else {
                    competencia = (0, fatura_core_1.competenciaDaCompra)(String(l.data_transacao).slice(0, 10), diaF, diaV).competencia;
                }
            }
            const { fatura, competencia: comp } = await faturaPf.resolverFaturaPfPorCompetencia(userId, wallet.id, cartao, competencia);
            faturas.add(comp);
            await db_1.db.execute((0, drizzle_orm_1.sql) `
        UPDATE transacoes
        SET forma_pagamento_id = ${cartaoId},
            fatura_id = ${fatura.id},
            competencia = ${comp},
            conta_bancaria_id = NULL,
            movimenta_caixa = false
        WHERE id = ${l.id} AND carteira_id = ${wallet.id} AND tipo = 'Despesa'
      `);
        }
        return res.json({
            success: true,
            movidos: linhasOk.length,
            extra_parcelas: Math.max(0, (todasParcelas ? exp.ids.length : idsIn.length) - idsIn.length),
            ignorados_pagos: ignoradosPagos,
            competencias: Array.from(faturas).sort(),
            ids: linhasOk.map((l) => l.id),
        });
    }
    catch (e) {
        return res.status(400).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao mover lançamento" });
    }
}
/**
 * Recalcula todas as faturas de um cartão pelas datas atuais do cartão.
 * POST /api/cartoes/:id/recalcular-faturas
 */
async function recalcularFaturasCartao(req, res) {
    try {
        const userId = req.user.id;
        const cartaoId = Number(req.params.id);
        const cartao = await faturaPf.cartaoPfDoUsuario(cartaoId, userId);
        if (!cartao || Number(cartao.usuario_id) !== userId) {
            return res.status(404).json({ error: "Cartão não encontrado" });
        }
        if (cartao.dia_fechamento == null || cartao.dia_vencimento == null) {
            return res.status(400).json({ error: "Defina o dia de fechamento e de vencimento do cartão antes de recalcular." });
        }
        const wallet = await storage_1.storage.getWalletByUserId(userId);
        if (!wallet)
            return res.status(404).json({ error: "Carteira não encontrada" });
        const r = await faturaPf.recalcularFaturasCartaoPf(userId, wallet.id, cartao);
        return res.json(Object.assign({ success: true }, r));
    }
    catch (e) {
        return res.status(400).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao recalcular faturas" });
    }
}
