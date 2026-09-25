/**
 * Bloqueio de login por conta (complementa o limite por IP do authLimiter).
 * Em memória: suficiente para uma instância; com várias réplicas, cada uma
 * aplica o próprio limite (continua dificultando força bruta distribuída).
 */
const JANELA_MS = 15 * 60 * 1000;
const MAX_FALHAS = 10;
const falhas = new Map<string, { n: number; desde: number; bloqueadoAte?: number }>();

const chave = (email: string) => String(email || "").trim().toLowerCase();

/** Minutos restantes de bloqueio, ou 0. */
export function loginBloqueado(email: string, agora = Date.now()): number {
  const f = falhas.get(chave(email));
  if (!f?.bloqueadoAte) return 0;
  if (f.bloqueadoAte <= agora) {
    falhas.delete(chave(email));
    return 0;
  }
  return Math.ceil((f.bloqueadoAte - agora) / 60000);
}

export function registrarFalhaLogin(email: string, agora = Date.now()): void {
  const k = chave(email);
  const f = falhas.get(k);
  if (!f || agora - f.desde > JANELA_MS) {
    falhas.set(k, { n: 1, desde: agora });
  } else {
    f.n++;
    if (f.n >= MAX_FALHAS) f.bloqueadoAte = agora + JANELA_MS;
  }
  if (falhas.size > 10_000) {
    for (const [kk, v] of falhas) if (agora - v.desde > JANELA_MS && !v.bloqueadoAte) falhas.delete(kk);
  }
}

export function registrarSucessoLogin(email: string): void {
  falhas.delete(chave(email));
}
