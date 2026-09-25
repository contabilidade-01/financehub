/**
 * Lógica pura de feature flags (sem I/O) — testes e auditoria.
 */

/** Constantes — única forma permitida de nomear flags no código. */
export const FLAG_AGENTE_MEIO_PAGAMENTO = "agente_meio_pagamento";
/** Chat orquestrador (DeepSeek) liberado para o usuário (além de super_admin). */
export const FLAG_ORQUESTRADOR_DEEPSEEK = "orquestrador_deepseek";
/** Importação de extrato unificada (sessão com autosave, conta bancária, conciliação). */
export const FLAG_IMPORTACAO_EXTRATO_V2 = "importacao_extrato_v2";
/** Recebimentos via Cora (cobrança boleto/Pix com baixa automática), PJ ME. */
export const FLAG_INTEGRACAO_CORA = "integracao_cora";
export const FLAGS_NO_CODIGO: readonly string[] = [
  FLAG_AGENTE_MEIO_PAGAMENTO,
  FLAG_ORQUESTRADOR_DEEPSEEK,
  FLAG_IMPORTACAO_EXTRATO_V2,
  FLAG_INTEGRACAO_CORA,
];

export const DIAS_PARA_APOSENTAR = 30;

export function avaliarFlag(opts: {
  existe: boolean;
  ativoTodos: boolean;
  usuariosComFlag: number[];
  usuarioId: number | null;
}): boolean {
  if (!opts.existe) return false;
  if (opts.ativoTodos) return true;
  if (opts.usuarioId == null) return false;
  return opts.usuariosComFlag.includes(opts.usuarioId);
}

export function calcularDiasLiberada(
  liberadoTodosEm: Date | string | null | undefined,
  agora: Date = new Date(),
): number | null {
  if (liberadoTodosEm == null || liberadoTodosEm === "") return null;
  const d =
    liberadoTodosEm instanceof Date ? liberadoTodosEm : new Date(String(liberadoTodosEm));
  if (Number.isNaN(d.getTime())) return null;
  const ms = agora.getTime() - d.getTime();
  if (ms < 0) return 0;
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

export function prontaParaAposentar(diasLiberada: number | null): boolean {
  return diasLiberada != null && diasLiberada >= DIAS_PARA_APOSENTAR;
}

export function auditarDivergenciasFlags(
  chavesCodigo: string[],
  chavesBanco: string[],
): { soNoCodigo: string[]; soNoBanco: string[] } {
  const c = new Set(chavesCodigo.map((k) => k.trim()).filter(Boolean));
  const b = new Set(chavesBanco.map((k) => k.trim()).filter(Boolean));
  return {
    soNoCodigo: [...c].filter((k) => !b.has(k)).sort(),
    soNoBanco: [...b].filter((k) => !c.has(k)).sort(),
  };
}
