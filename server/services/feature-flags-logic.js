"use strict";
/**
 * Lógica pura de feature flags (sem I/O) — testes e auditoria.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DIAS_PARA_APOSENTAR = exports.FLAGS_NO_CODIGO = exports.FLAG_AGENTE_MEIO_PAGAMENTO = void 0;
exports.avaliarFlag = avaliarFlag;
exports.calcularDiasLiberada = calcularDiasLiberada;
exports.prontaParaAposentar = prontaParaAposentar;
exports.auditarDivergenciasFlags = auditarDivergenciasFlags;
/** Constantes — única forma permitida de nomear flags no código. */
exports.FLAG_AGENTE_MEIO_PAGAMENTO = "agente_meio_pagamento";
exports.FLAGS_NO_CODIGO = [exports.FLAG_AGENTE_MEIO_PAGAMENTO];
exports.DIAS_PARA_APOSENTAR = 30;
function avaliarFlag(opts) {
    if (!opts.existe)
        return false;
    if (opts.ativoTodos)
        return true;
    if (opts.usuarioId == null)
        return false;
    return opts.usuariosComFlag.includes(opts.usuarioId);
}
function calcularDiasLiberada(liberadoTodosEm, agora = new Date()) {
    if (liberadoTodosEm == null || liberadoTodosEm === "")
        return null;
    const d = liberadoTodosEm instanceof Date ? liberadoTodosEm : new Date(String(liberadoTodosEm));
    if (Number.isNaN(d.getTime()))
        return null;
    const ms = agora.getTime() - d.getTime();
    if (ms < 0)
        return 0;
    return Math.floor(ms / (24 * 60 * 60 * 1000));
}
function prontaParaAposentar(diasLiberada) {
    return diasLiberada != null && diasLiberada >= exports.DIAS_PARA_APOSENTAR;
}
function auditarDivergenciasFlags(chavesCodigo, chavesBanco) {
    const c = new Set(chavesCodigo.map((k) => k.trim()).filter(Boolean));
    const b = new Set(chavesBanco.map((k) => k.trim()).filter(Boolean));
    return {
        soNoCodigo: [...c].filter((k) => !b.has(k)).sort(),
        soNoBanco: [...b].filter((k) => !c.has(k)).sort(),
    };
}
