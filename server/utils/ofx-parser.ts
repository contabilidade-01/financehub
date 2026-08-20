/**
 * Parser de extrato OFX (padrão bancário). Cobre OFX 1.x (SGML, tags sem
 * fechamento) e 2.x (XML), usando extração tolerante por tag.
 *
 * Só faz leitura/normalização — nada de classificação (isso é da IA/serviço).
 */

export interface OfxMovimento {
  fitid: string | null;
  data: string;      // AAAA-MM-DD
  valor: number;     // positivo = crédito, negativo = débito
  tipo: "credito" | "debito";
  descricao: string;
  memo: string;
}

export interface OfxExtrato {
  movimentos: OfxMovimento[];
  saldoFinal: number | null;
  periodoDe: string | null;
  periodoAte: string | null;
}

// Pega o valor de uma tag OFX (funciona com <TAG>valor e <TAG>valor</TAG>).
function tag(bloco: string, nome: string): string | null {
  const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, "i"));
  return m ? m[1].trim() : null;
}

// AAAAMMDD... -> AAAA-MM-DD
function normalizarData(v: string | null): string | null {
  if (!v) return null;
  const d = v.replace(/[^0-9]/g, "");
  if (d.length < 8) return null;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
}

function normalizarValor(v: string | null): number {
  if (!v) return 0;
  // OFX usa ponto decimal; alguns bancos exportam com vírgula.
  const n = parseFloat(v.replace(/\s/g, "").replace(",", "."));
  return isNaN(n) ? 0 : Math.round(n * 100) / 100;
}

export function parseOfx(conteudo: string): OfxExtrato {
  // Blocos de transação.
  const blocos = conteudo.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi)
    || conteudo.split(/<STMTTRN>/i).slice(1).map((b) => `<STMTTRN>${b}`);

  const movimentos: OfxMovimento[] = [];
  for (const bloco of blocos) {
    const data = normalizarData(tag(bloco, "DTPOSTED"));
    const valorRaw = tag(bloco, "TRNAMT");
    if (!data || valorRaw == null) continue;
    const valor = normalizarValor(valorRaw);
    const name = tag(bloco, "NAME") || "";
    const memo = tag(bloco, "MEMO") || "";
    movimentos.push({
      fitid: tag(bloco, "FITID"),
      data,
      valor,
      tipo: valor >= 0 ? "credito" : "debito",
      descricao: (name || memo || "Movimento").slice(0, 255),
      memo: memo.slice(0, 255),
    });
  }

  // Saldo final (LEDGERBAL/BALAMT) e período (DTSTART/DTEND).
  const balMatch = conteudo.match(/<LEDGERBAL>[\s\S]*?<BALAMT>([^<\r\n]*)/i)
    || conteudo.match(/<BALAMT>([^<\r\n]*)/i);
  const saldoFinal = balMatch ? normalizarValor(balMatch[1]) : null;

  return {
    movimentos,
    saldoFinal,
    periodoDe: normalizarData(tag(conteudo, "DTSTART")),
    periodoAte: normalizarData(tag(conteudo, "DTEND")),
  };
}
