"use strict";
/**
 * Interpreta parcela no texto do lançamento (importações antigas sem compra_grupo).
 * Ex.: "UAZAPI (4/7) — Parcela 4/7 · Nescon" → { base: "UAZAPI · Nescon", num: 4, total: 7 }
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseParcelaNaDescricao = parseParcelaNaDescricao;
exports.basesParcelasIguais = basesParcelasIguais;
exports.rotuloParcela = rotuloParcela;
const RE_PARCELA = /parcela\s*(\d+)\s*\/\s*(\d+)/i;
const RE_PAREN = /\((\d+)\s*\/\s*(\d+)\)/;
function ehParcelaValida(num, total) {
    return Number.isInteger(num) && Number.isInteger(total) && total >= 2 && num >= 1 && num <= 60 && num <= total;
}
function parseParcelaNaDescricao(descricao) {
    const raw = String(descricao || "");
    let num = null;
    let total = null;
    const parcela = raw.match(RE_PARCELA);
    const paren = raw.match(RE_PAREN);
    const pick = parcela || paren;
    if (pick) {
        const n = Number(pick[1]);
        const t = Number(pick[2]);
        if (ehParcelaValida(n, t)) {
            num = n;
            total = t;
        }
    }
    const base = raw
        .replace(/\s*\(\d+\s*\/\s*\d+\)/g, "")
        .replace(/\s*[—–-]\s*Parcela\s*\d+\s*\/\s*\d+/gi, "")
        .replace(/\s{2,}/g, " ")
        .replace(/\s*[—–-]\s*/g, " ")
        .replace(/^[·\s]+|[·\s]+$/g, "")
        .trim();
    return { base, num, total };
}
function basesParcelasIguais(a, b) {
    const n = (s) => String(s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim();
    const x = n(a);
    const y = n(b);
    if (!x || !y)
        return false;
    return x === y;
}
/** Rótulo 4/7 a partir dos campos da tabela ou, se vazios, do texto. */
function rotuloParcela(l) {
    if (l.parcela_num && l.parcela_total && l.parcela_total >= 2) {
        return `${l.parcela_num}/${l.parcela_total}`;
    }
    const p = parseParcelaNaDescricao(String(l.descricao || ""));
    if (p.num && p.total)
        return `${p.num}/${p.total}`;
    return null;
}
