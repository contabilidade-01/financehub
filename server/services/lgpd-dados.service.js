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
exports.DIAS_CARENCIA_EXCLUSAO = void 0;
exports.exportarDadosUsuario = exportarDadosUsuario;
exports.statusExclusao = statusExclusao;
exports.solicitarExclusao = solicitarExclusao;
exports.cancelarExclusao = cancelarExclusao;
exports.expurgarUsuario = expurgarUsuario;
exports.expurgarExclusoesVencidas = expurgarExclusoesVencidas;
/**
 * LGPD — portabilidade (exportar) e eliminação (excluir) dos dados do titular.
 *
 * Duas regras que guiam tudo aqui:
 *
 * 1. CANCELAR ≠ EXCLUIR. Cancelar a assinatura só tira o acesso no fim do
 *    ciclo; os dados continuam intactos para quando o cliente voltar. Excluir
 *    é outra coisa, pedida explicitamente, e é irreversível.
 *
 * 2. EXCLUIR = ANONIMIZAR, não "DELETE em tudo". O conteúdo financeiro pessoal
 *    é apagado, mas o registro de cobrança precisa sobreviver (obrigação fiscal
 *    e para o MRR histórico não virar mentira). Por isso a linha do usuário é
 *    anonimizada em vez de removida: as chaves estrangeiras continuam válidas
 *    e não sobra nada que identifique a pessoa.
 *
 * A CARÊNCIA é a rede de segurança: durante ela nada foi apagado e dá para
 * desistir. Depois dela o expurgo é real e não guardamos cópia — guardar uma
 * "cópia de backup" do titular que pediu exclusão anularia o próprio pedido.
 */
const db_1 = require("../db");
const drizzle_orm_1 = require("drizzle-orm");
const XLSX = __importStar(require("xlsx"));
/** Dias entre o pedido de exclusão e o expurgo definitivo. */
exports.DIAS_CARENCIA_EXCLUSAO = 30;
// ============================================
// PORTABILIDADE — exportar os dados do titular
// ============================================
async function linhas(consulta) {
    try {
        const r = await db_1.db.execute(consulta);
        return r;
    }
    catch (_a) {
        // Tabela ainda não migrada neste ambiente: a aba sai vazia, sem derrubar
        // a exportação inteira.
        return [];
    }
}
/**
 * Planilha com tudo que é do usuário, uma aba por assunto.
 * É portabilidade (LGPD art. 18) e, na prática, é o que a maior parte de quem
 * pede exclusão realmente quer: levar os próprios dados embora.
 */
async function exportarDadosUsuario(userId) {
    const cadastro = await linhas((0, drizzle_orm_1.sql) `
    SELECT id, nome, email, telefone, tipo_pessoa, tipo_usuario, ativo,
           data_cadastro, ultimo_acesso, status_assinatura, ciclo_assinatura,
           data_expiracao_assinatura
    FROM usuarios WHERE id = ${userId}
  `);
    const lancamentos = await linhas((0, drizzle_orm_1.sql) `
    SELECT t.id, t.data_transacao AS data, t.descricao, t.tipo, t.valor, t.status,
           c.nome AS categoria, fp.nome AS forma_pagamento, cb.nome AS conta,
           t.parcela_num, t.parcela_total, t.competencia, t.data_vencimento, t.data_pagamento
    FROM transacoes t
    JOIN carteiras w ON w.id = t.carteira_id AND w.usuario_id = ${userId}
    LEFT JOIN categorias c ON c.id = t.categoria_id
    LEFT JOIN formas_pagamento fp ON fp.id = t.forma_pagamento_id
    LEFT JOIN contas_bancarias cb ON cb.id = t.conta_bancaria_id
    ORDER BY t.data_transacao, t.id
  `);
    const contas = await linhas((0, drizzle_orm_1.sql) `
    SELECT id, nome, banco, tipo, saldo_inicial, ativo
    FROM contas_bancarias WHERE usuario_id = ${userId} AND empresa_id IS NULL ORDER BY nome
  `);
    const cartoes = await linhas((0, drizzle_orm_1.sql) `
    SELECT id, nome, bandeira, limite, dia_fechamento, dia_vencimento, ativo
    FROM formas_pagamento
    WHERE usuario_id = ${userId} AND dia_fechamento IS NOT NULL AND dia_vencimento IS NOT NULL
    ORDER BY nome
  `);
    const faturas = await linhas((0, drizzle_orm_1.sql) `
    SELECT f.id, fp.nome AS cartao, f.competencia, f.data_fechamento, f.data_vencimento,
           f.status, f.data_pagamento
    FROM faturas f
    LEFT JOIN formas_pagamento fp ON fp.id = f.forma_pagamento_id
    WHERE f.usuario_id = ${userId}
    ORDER BY f.competencia DESC
  `);
    const categorias = await linhas((0, drizzle_orm_1.sql) `
    SELECT id, nome, tipo FROM categorias WHERE usuario_id = ${userId} ORDER BY tipo, nome
  `);
    const metas = await linhas((0, drizzle_orm_1.sql) `
    SELECT id, titulo, tipo, valor_alvo, valor_atual, prazo, ativo
    FROM metas_financeiras WHERE usuario_id = ${userId} ORDER BY id
  `);
    const empresas = await linhas((0, drizzle_orm_1.sql) `
    SELECT id, razao_social, nome_fantasia, cnpj, regime_tributario, segmento, ativo
    FROM empresas WHERE usuario_id = ${userId} ORDER BY id
  `);
    const lancamentosPj = await linhas((0, drizzle_orm_1.sql) `
    SELECT t.id, e.razao_social AS empresa, t.data_transacao AS data, t.descricao,
           t.tipo, t.valor, t.status, ec.codigo AS conta_codigo, ec.nome AS conta_nome,
           t.competencia, t.data_vencimento
    FROM empresas_transacoes t
    JOIN empresas e ON e.id = t.empresa_id AND e.usuario_id = ${userId}
    LEFT JOIN empresas_contas ec ON ec.id = t.categoria_id
    ORDER BY t.data_transacao, t.id
  `);
    const pagamentos = await linhas((0, drizzle_orm_1.sql) `
    SELECT id, amount AS valor, status, due_date AS vencimento, description AS descricao,
           payment_method AS forma, created_at AS criado_em
    FROM payment_transactions WHERE usuario_id = ${userId} ORDER BY created_at
  `);
    const abas = [
        ["Cadastro", cadastro],
        ["Lançamentos", lancamentos],
        ["Contas", contas],
        ["Cartões", cartoes],
        ["Faturas", faturas],
        ["Categorias", categorias],
        ["Metas", metas],
        ["Empresas", empresas],
        ["Lançamentos PJ", lancamentosPj],
        ["Pagamentos", pagamentos],
    ];
    const wb = XLSX.utils.book_new();
    for (const [nome, dados] of abas) {
        // Aba vazia ainda entra, com o cabeçalho, para o titular ver que aquele
        // assunto existe e está sem dado — em vez de sumir sem explicação.
        const ws = XLSX.utils.json_to_sheet(dados.length ? dados : [{ "(sem registros)": "" }]);
        XLSX.utils.book_append_sheet(wb, ws, nome.slice(0, 31));
    }
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    const hoje = new Date().toISOString().slice(0, 10);
    return { buffer, nome: `meus-dados-${hoje}.xlsx` };
}
async function statusExclusao(userId) {
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT exclusao_solicitada_em, exclusao_efetiva_em
    FROM usuarios WHERE id = ${userId} LIMIT 1
  `);
    const u = r[0];
    if (!(u === null || u === void 0 ? void 0 : u.exclusao_solicitada_em)) {
        return { solicitada: false, solicitada_em: null, efetiva_em: null, dias_restantes: null };
    }
    const efetiva = u.exclusao_efetiva_em ? new Date(u.exclusao_efetiva_em) : null;
    const dias = efetiva
        ? Math.max(0, Math.ceil((efetiva.getTime() - Date.now()) / 86400000))
        : null;
    return {
        solicitada: true,
        solicitada_em: new Date(u.exclusao_solicitada_em).toISOString(),
        efetiva_em: efetiva ? efetiva.toISOString() : null,
        dias_restantes: dias,
    };
}
/**
 * Marca a conta para exclusão. NADA é apagado agora: o titular tem a carência
 * inteira para desistir, e é isso que faz o pedido ser seguro.
 */
async function solicitarExclusao(userId, motivo) {
    const efetiva = new Date();
    efetiva.setDate(efetiva.getDate() + exports.DIAS_CARENCIA_EXCLUSAO);
    await db_1.db.execute((0, drizzle_orm_1.sql) `
    UPDATE usuarios
    SET exclusao_solicitada_em = NOW(),
        exclusao_efetiva_em = ${efetiva.toISOString()},
        exclusao_motivo = ${motivo || null}
    WHERE id = ${userId}
  `);
    return statusExclusao(userId);
}
async function cancelarExclusao(userId) {
    await db_1.db.execute((0, drizzle_orm_1.sql) `
    UPDATE usuarios
    SET exclusao_solicitada_em = NULL, exclusao_efetiva_em = NULL, exclusao_motivo = NULL
    WHERE id = ${userId} AND anonimizado_em IS NULL
  `);
    return statusExclusao(userId);
}
async function tentar(consulta) {
    try {
        await db_1.db.execute(consulta);
    }
    catch (e) {
        // Tabela inexistente neste ambiente não pode abortar o expurgo das demais.
        console.warn("[LGPD] passo do expurgo ignorado:", e === null || e === void 0 ? void 0 : e.message);
    }
}
/**
 * Expurgo definitivo de UM usuário. Apaga o conteúdo pessoal e anonimiza o
 * cadastro; preserva o rastro de cobrança (sem identificação) por obrigação
 * fiscal. Idempotente: rodar de novo num usuário já anonimizado não faz nada.
 */
async function expurgarUsuario(userId) {
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT id, anonimizado_em FROM usuarios WHERE id = ${userId} LIMIT 1
  `);
    const u = r[0];
    if (!u || u.anonimizado_em)
        return false;
    // 1) Conteúdo financeiro pessoal (PF)
    await tentar((0, drizzle_orm_1.sql) `
    DELETE FROM transacoes WHERE carteira_id IN (SELECT id FROM carteiras WHERE usuario_id = ${userId})
  `);
    await tentar((0, drizzle_orm_1.sql) `DELETE FROM transacoes_lixeira WHERE usuario_id = ${userId}`);
    await tentar((0, drizzle_orm_1.sql) `DELETE FROM faturas WHERE usuario_id = ${userId}`);
    await tentar((0, drizzle_orm_1.sql) `DELETE FROM contas_bancarias WHERE usuario_id = ${userId} AND empresa_id IS NULL`);
    await tentar((0, drizzle_orm_1.sql) `DELETE FROM carteiras WHERE usuario_id = ${userId}`);
    await tentar((0, drizzle_orm_1.sql) `DELETE FROM categorias WHERE usuario_id = ${userId}`);
    await tentar((0, drizzle_orm_1.sql) `DELETE FROM formas_pagamento WHERE usuario_id = ${userId}`);
    await tentar((0, drizzle_orm_1.sql) `DELETE FROM metas_financeiras WHERE usuario_id = ${userId}`);
    await tentar((0, drizzle_orm_1.sql) `DELETE FROM lembretes WHERE usuario_id = ${userId}`);
    // 2) Empresas do usuário (o resto do PJ cai por cascade da FK empresa_id)
    await tentar((0, drizzle_orm_1.sql) `DELETE FROM empresas WHERE usuario_id = ${userId}`);
    // 3) Rastros do agente e de acesso
    await tentar((0, drizzle_orm_1.sql) `DELETE FROM conversa_historico WHERE usuario_id = ${userId}`);
    await tentar((0, drizzle_orm_1.sql) `DELETE FROM memoria_usuario WHERE usuario_id = ${userId}`);
    await tentar((0, drizzle_orm_1.sql) `DELETE FROM api_tokens WHERE usuario_id = ${userId}`);
    await tentar((0, drizzle_orm_1.sql) `DELETE FROM password_reset_tokens WHERE usuario_id = ${userId}`);
    await tentar((0, drizzle_orm_1.sql) `DELETE FROM whatsapp_onboarding_states WHERE usuario_id = ${userId}`);
    await tentar((0, drizzle_orm_1.sql) `DELETE FROM ingestion_events WHERE usuario_id = ${userId}`);
    // 4) CPF/CNPJ guardado para o Asaas sai; o histórico de cobrança FICA, agora
    //    apontando para um cadastro sem identificação.
    await tentar((0, drizzle_orm_1.sql) `DELETE FROM asaas_customers WHERE usuario_id = ${userId}`);
    // 5) Anonimiza o cadastro (não remove a linha: as FKs de cobrança dependem dela)
    await db_1.db.execute((0, drizzle_orm_1.sql) `
    UPDATE usuarios
    SET nome = 'Titular removido',
        email = ${`removido+${userId}@titular.invalido`},
        telefone = NULL,
        remotejid = '',
        senha = ${`!excluido-${Date.now()}`},
        ativo = false,
        subscription_active = false,
        status_assinatura = 'excluida',
        anonimizado_em = NOW(),
        exclusao_solicitada_em = NULL,
        exclusao_efetiva_em = NULL
    WHERE id = ${userId}
  `);
    console.log(`[LGPD] Usuário ${userId} expurgado (conteúdo apagado, cadastro anonimizado).`);
    return true;
}
/**
 * Expurga quem já venceu a carência. Chamado no boot e periodicamente, no mesmo
 * espírito de limparLixeiraAntiga.
 */
async function expurgarExclusoesVencidas() {
    const r = await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT id FROM usuarios
    WHERE exclusao_efetiva_em IS NOT NULL
      AND exclusao_efetiva_em <= NOW()
      AND anonimizado_em IS NULL
  `);
    let n = 0;
    for (const u of r) {
        if (await expurgarUsuario(Number(u.id)))
            n++;
    }
    if (n > 0)
        console.log(`[LGPD] ${n} conta(s) expurgada(s) após a carência.`);
    return n;
}
