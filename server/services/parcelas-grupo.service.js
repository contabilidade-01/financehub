"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.expandirIdsComParcelasPf = expandirIdsComParcelasPf;
exports.chaveGrupoParcela = chaveGrupoParcela;
/**
 * Expande um conjunto de lançamentos PF para incluir todas as parcelas da mesma compra.
 * Cobre compra_grupo (fluxo novo) e o texto "(4/7) / Parcela 4/7" das importações antigas.
 */
const db_1 = require("../db");
const drizzle_orm_1 = require("drizzle-orm");
const parcela_descricao_1 = require("../../shared/parcela-descricao");
function parcelaEfetiva(row) {
    const parsed = (0, parcela_descricao_1.parseParcelaNaDescricao)(String(row.descricao || ""));
    const num = Number(row.parcela_num) || parsed.num;
    const total = Number(row.parcela_total) || parsed.total;
    return {
        num: num && total && total >= 2 ? num : null,
        total: num && total && total >= 2 ? total : null,
        base: parsed.base,
    };
}
async function expandirIdsComParcelasPf(walletId, idsIn) {
    const ids = Array.from(new Set(idsIn.filter((n) => Number.isInteger(n) && n > 0)));
    if (!ids.length)
        return { ids: [], linhas: [] };
    const lista = drizzle_orm_1.sql.join(ids.map((i) => (0, drizzle_orm_1.sql) `${i}`), (0, drizzle_orm_1.sql) `, `);
    const seeds = (await db_1.db.execute((0, drizzle_orm_1.sql) `
    SELECT id, descricao, data_transacao, data_vencimento, compra_grupo, parcela_num, parcela_total, fatura_id, forma_pagamento_id
    FROM transacoes
    WHERE carteira_id = ${walletId} AND id IN (${lista})
  `));
    const out = new Map();
    for (const s of seeds) {
        const origem = Number(s.id);
        const efet = parcelaEfetiva(s);
        const grupo = s.compra_grupo ? String(s.compra_grupo) : null;
        let irmaos = [];
        if (grupo) {
            irmaos = (await db_1.db.execute((0, drizzle_orm_1.sql) `
        SELECT id, descricao, data_transacao, data_vencimento, compra_grupo, parcela_num, parcela_total, fatura_id, forma_pagamento_id
        FROM transacoes
        WHERE carteira_id = ${walletId} AND tipo = 'Despesa' AND compra_grupo = ${grupo}
      `));
        }
        else if (efet.total && efet.base.length >= 4) {
            const total = efet.total;
            irmaos = (await db_1.db.execute((0, drizzle_orm_1.sql) `
        SELECT id, descricao, data_transacao, data_vencimento, compra_grupo, parcela_num, parcela_total, fatura_id, forma_pagamento_id
        FROM transacoes
        WHERE carteira_id = ${walletId}
          AND tipo = 'Despesa'
          AND (
            parcela_total = ${total}
            OR descricao ~ ${`\\([0-9]+/${total}\\)`}
            OR descricao ~* ${`parcela\\s*[0-9]+\\s*/\\s*${total}`}
          )
      `));
            irmaos = irmaos.filter((r) => {
                const p = parcelaEfetiva(r);
                return p.total === total && (0, parcela_descricao_1.basesParcelasIguais)(efet.base, p.base);
            });
        }
        if (!irmaos.length)
            irmaos = [s];
        for (const r of irmaos) {
            const id = Number(r.id);
            if (out.has(id))
                continue;
            const p = parcelaEfetiva(r);
            out.set(id, {
                id,
                descricao: String(r.descricao || ""),
                data_transacao: String(r.data_transacao),
                data_vencimento: r.data_vencimento ? String(r.data_vencimento) : null,
                compra_grupo: r.compra_grupo ? String(r.compra_grupo) : null,
                parcela_num: p.num,
                parcela_total: p.total,
                fatura_id: r.fatura_id != null ? Number(r.fatura_id) : null,
                forma_pagamento_id: r.forma_pagamento_id != null ? Number(r.forma_pagamento_id) : null,
                origem,
            });
        }
    }
    return { ids: Array.from(out.keys()), linhas: Array.from(out.values()) };
}
/** Chave de agrupamento: compra_grupo ou base da descrição parcelada. */
function chaveGrupoParcela(l) {
    if (l.compra_grupo)
        return `g:${l.compra_grupo}`;
    const base = (0, parcela_descricao_1.parseParcelaNaDescricao)(l.descricao).base;
    if (l.parcela_total && base)
        return `b:${base.toLowerCase()}|${l.parcela_total}`;
    return `id:${l.id}`;
}
