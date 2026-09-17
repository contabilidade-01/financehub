"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pareceLancamentoSemMeio = pareceLancamentoSemMeio;
exports.registrarPendenteMeio = registrarPendenteMeio;
exports.obterPendenteMeio = obterPendenteMeio;
exports.limparPendenteMeio = limparPendenteMeio;
exports.mensagemPedirMeio = mensagemPedirMeio;
exports.respostaEhSoMeio = respostaEhSoMeio;
/**
 * Atalho PJ: "abastecimento do carro 124,50" sem meio → uma pergunta só.
 * Não deixa o modelo inventar cartão nem "nenhum cartão cadastrado".
 */
const parse_meio_1 = require("./parse-meio");
const TTL_MS = 30 * 60 * 1000;
const pendentes = new Map();
function norm(s) {
    return String(s || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
}
function parseValorBR(texto) {
    const m = String(texto || "").match(/(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+(?:[.,]\d{1,2})?)/i);
    if (!m)
        return null;
    let n = m[1];
    if (n.includes(",") && n.includes("."))
        n = n.replace(/\./g, "").replace(",", ".");
    else if (n.includes(","))
        n = n.replace(",", ".");
    const v = Number(n);
    if (!Number.isFinite(v) || v <= 0 || v > 9999999)
        return null;
    return Math.round(v * 100) / 100;
}
function pareceConsultaOuComando(n) {
    return /\b(quanto|saldo|resumo|extrato|apaga|exclui|delete|edita|corrige|desfaz|restaura|ola|oi\b|menu|ajuda)\b/.test(n);
}
function pareceLancamentoSemMeio(texto) {
    const raw = String(texto || "").trim();
    if (!raw || raw.length < 4)
        return null;
    const n = norm(raw);
    if (pareceConsultaOuComando(n))
        return null;
    if ((0, parse_meio_1.detectarMeio)(raw).tipo !== "nenhum")
        return null;
    if (/\b(parcelad|em\s+\d+\s*x|\d+\s*x\s*(de)?)\b/.test(n))
        return null;
    const valor = parseValorBR(raw);
    if (valor == null)
        return null;
    let desc = raw
        .replace(/(?:r\$\s*)?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|(?:r\$\s*)?\d+(?:[.,]\d{1,2})?/gi, " ")
        .replace(/\b(novo|nova|gastei|paguei|recebi|lancar|lanca|registre)\b/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
    if (desc.length < 3)
        return null;
    const tipo = /\b(recebi|receita|entrou|faturei)\b/.test(n)
        ? "Receita"
        : "Despesa";
    return { descricao: desc, valor, tipo };
}
function registrarPendenteMeio(userId, empresaNome, item) {
    pendentes.set(userId, Object.assign(Object.assign({}, item), { userId,
        empresaNome, expiresAt: Date.now() + TTL_MS }));
}
function obterPendenteMeio(userId) {
    const p = pendentes.get(userId);
    if (!p)
        return null;
    if (Date.now() > p.expiresAt) {
        pendentes.delete(userId);
        return null;
    }
    return p;
}
function limparPendenteMeio(userId) {
    pendentes.delete(userId);
}
function money(v) {
    return v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function mensagemPedirMeio(item) {
    const verbo = item.tipo === "Receita" ? "entrou" : "foi pago";
    return (`Anotei *${item.descricao}* — R$ ${money(item.valor)}.\n\n` +
        `Como ${verbo}?\n` +
        `• *Caixinha* (dinheiro)\n` +
        `• conta bancária (ex.: pix + o banco)\n` +
        `• cartão\n\n` +
        `Responda só isso que eu lanço.`);
}
/** Resposta curta que só informa o meio (depois da pergunta). */
function respostaEhSoMeio(texto) {
    const raw = String(texto || "").trim();
    if (!raw || raw.length > 80)
        return null;
    const det = (0, parse_meio_1.detectarMeio)(raw);
    if (det.tipo === "nenhum")
        return null;
    // Frase longa com descrição+valor não é "só o meio".
    if (pareceLancamentoSemMeio(raw))
        return null;
    const meio = (0, parse_meio_1.textoMeioDeDetect)(det);
    return meio || null;
}
