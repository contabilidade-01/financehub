/**
 * Projeção de caixa do ERP PJ ME: parte do saldo atual dos bancos e soma o que
 * está para entrar (contas a receber) e para sair (contas a pagar, faturas de
 * cartão abertas e, no cenário com recorrências, as mensalidades ainda não
 * geradas). Aponta o primeiro dia em que o saldo fica negativo.
 */
import { sql } from "drizzle-orm";
import { db } from "../../db";
import { hojeSP, somarDias } from "../nlp-br";
import { saldoConta } from "../conta-bancaria.service";
import { ErroErp } from "./erp.service";

export type OrigemItem = "receber" | "pagar" | "fatura" | "recorrencia";

export interface ItemProjecao {
  data: string;
  descricao: string;
  tipo: "Receita" | "Despesa";
  valor: number;
  origem: OrigemItem;
  /** Venceu e ainda não foi pago/recebido: entra no primeiro dia da projeção. */
  atrasado?: boolean;
  contato?: string | null;
  id?: number;
}

export interface PeriodoProjecao {
  inicio: string;
  fim: string;
  rotulo: string;
  entradas: number;
  saidas: number;
  saldo_final: number;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function inicioDoPeriodo(data: string, agrupar: "dia" | "semana" | "mes"): string {
  if (agrupar === "dia") return data;
  if (agrupar === "mes") return `${data.slice(0, 7)}-01`;
  const d = new Date(`${data}T12:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // segunda = 0
  return somarDias(data, -dow);
}

function rotuloPeriodo(inicio: string, agrupar: "dia" | "semana" | "mes"): string {
  const [a, m, d] = inicio.split("-").map(Number);
  if (agrupar === "mes") return `${MESES[m - 1]}/${String(a).slice(2)}`;
  return `${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
}

/**
 * Núcleo puro: aplica os itens sobre o saldo inicial, dia a dia, e agrupa.
 * Itens atrasados caem em `hoje`. Receitas podem ser reduzidas pela
 * inadimplência esperada (0–100%).
 */
export function projetar(
  saldoInicial: number,
  itens: ItemProjecao[],
  o: { hoje: string; fim: string; agrupar: "dia" | "semana" | "mes"; inadimplenciaPct?: number },
) {
  const fator = 1 - Math.min(100, Math.max(0, o.inadimplenciaPct ?? 0)) / 100;
  const porDia = new Map<string, { e: number; s: number }>();
  for (const it of itens) {
    const dia = it.data < o.hoje ? o.hoje : it.data;
    if (dia > o.fim) continue;
    const acc = porDia.get(dia) || { e: 0, s: 0 };
    if (it.tipo === "Receita") acc.e += it.valor * fator;
    else acc.s += it.valor;
    porDia.set(dia, acc);
  }
  const periodos: PeriodoProjecao[] = [];
  let saldo = saldoInicial;
  let primeiroNegativo: { data: string; saldo: number } | null = saldoInicial < 0 ? { data: o.hoje, saldo: r2(saldoInicial) } : null;
  let menor = { data: o.hoje, saldo: r2(saldoInicial) };
  for (let dia = o.hoje; dia <= o.fim; dia = somarDias(dia, 1)) {
    const mov = porDia.get(dia) || { e: 0, s: 0 };
    saldo = saldo + mov.e - mov.s;
    if (!primeiroNegativo && saldo < -0.004) primeiroNegativo = { data: dia, saldo: r2(saldo) };
    if (saldo < menor.saldo) menor = { data: dia, saldo: r2(saldo) };
    // O primeiro período começa hoje, mesmo no meio da semana/mês.
    const chave = inicioDoPeriodo(dia, o.agrupar);
    let p = periodos[periodos.length - 1];
    if (!p || inicioDoPeriodo(p.inicio, o.agrupar) !== chave) {
      p = { inicio: dia, fim: dia, rotulo: rotuloPeriodo(o.agrupar === "mes" ? chave : dia, o.agrupar), entradas: 0, saidas: 0, saldo_final: 0 };
      periodos.push(p);
    }
    p.fim = dia;
    p.entradas = r2(p.entradas + mov.e);
    p.saidas = r2(p.saidas + mov.s);
    p.saldo_final = r2(saldo);
  }
  const entradas = r2(periodos.reduce((s, p) => s + p.entradas, 0));
  const saidas = r2(periodos.reduce((s, p) => s + p.saidas, 0));
  return { saldo_inicial: r2(saldoInicial), saldo_final: r2(saldo), entradas, saidas, periodos, primeiro_negativo: primeiroNegativo, menor_saldo: menor };
}

/** Vencimentos futuros de uma mensalidade que o job ainda não gerou (competências > última gerada). */
export function ocorrenciasMensalidade(
  m: { dia_vencimento: number; data_inicio?: string | null; data_fim?: string | null; ultima_competencia_gerada?: string | null },
  hoje: string,
  fim: string,
): string[] {
  const out: string[] = [];
  let [a, mes] = hoje.slice(0, 7).split("-").map(Number);
  for (let i = 0; i < 25; i++) {
    const comp = `${a}-${String(mes).padStart(2, "0")}`;
    const ultimoDia = new Date(Date.UTC(a, mes, 0)).getUTCDate();
    const venc = `${comp}-${String(Math.min(Math.max(1, m.dia_vencimento || 1), ultimoDia)).padStart(2, "0")}`;
    if (venc > fim) break;
    const jaGerada = m.ultima_competencia_gerada && comp <= m.ultima_competencia_gerada;
    const dentro = (!m.data_inicio || venc >= String(m.data_inicio).slice(0, 10)) && (!m.data_fim || venc <= String(m.data_fim).slice(0, 10));
    if (!jaGerada && dentro && venc >= hoje) out.push(venc);
    mes++;
    if (mes > 12) { mes = 1; a++; }
  }
  return out;
}

// ----------------------------------------------------------------------------
// Carga do banco
// ----------------------------------------------------------------------------

export interface OpcoesProjecao {
  horizonte?: number;
  agrupar?: string;
  conta_bancaria_id?: number | null;
  cenario?: string; // confirmados | com_recorrencias
  inadimplencia_pct?: number | null;
}

export async function projecaoCaixa(empresaId: number, o: OpcoesProjecao = {}) {
  const hoje = hojeSP();
  const horizonte = [30, 60, 90, 180, 365].includes(Number(o.horizonte)) ? Number(o.horizonte) : 90;
  const fim = somarDias(hoje, horizonte);
  const agrupar = (["dia", "semana", "mes"].includes(String(o.agrupar)) ? o.agrupar : horizonte <= 60 ? "dia" : horizonte <= 180 ? "semana" : "mes") as "dia" | "semana" | "mes";
  const banco = o.conta_bancaria_id ? Number(o.conta_bancaria_id) : null;
  const comRecorrencias = o.cenario !== "confirmados";

  const bancos = (await db.execute(sql`
    SELECT id, COALESCE(nome, banco) AS nome FROM contas_bancarias
    WHERE empresa_id = ${empresaId} AND ativo = true AND (${banco}::int IS NULL OR id = ${banco})
  `)) as any[];
  if (banco && !bancos.length) throw new ErroErp("Conta bancária não encontrada.", 404);
  const saldos = await Promise.all(bancos.map(async (b) => ({ id: Number(b.id), nome: b.nome, saldo: await saldoConta(Number(b.id)) })));
  const saldoInicial = saldos.reduce((s, b) => s + b.saldo, 0);

  // Títulos em aberto (a receber e a pagar), inclusive os atrasados.
  const titulos = (await db.execute(sql`
    SELECT t.id, t.descricao, t.valor, t.tipo, COALESCE(t.data_vencimento, t.data_transacao) AS venc, c.nome AS contato
    FROM empresas_transacoes t
    LEFT JOIN empresas_contatos c ON c.id = t.contato_id
    WHERE t.empresa_id = ${empresaId}
      AND t.status = 'Pendente'
      AND t.cartao_id IS NULL AND t.fatura_id IS NULL
      AND COALESCE(t.reembolso_pessoal, false) = false
      AND COALESCE(t.data_vencimento, t.data_transacao) <= ${fim}::date
      AND (${banco}::int IS NULL OR t.conta_bancaria_id = ${banco} OR t.conta_bancaria_id IS NULL)
  `)) as any[];
  const itens: ItemProjecao[] = titulos.map((t) => {
    const data = String(t.venc instanceof Date ? t.venc.toISOString() : t.venc).slice(0, 10);
    return {
      id: Number(t.id), data, descricao: t.descricao, tipo: t.tipo, valor: Number(t.valor),
      origem: t.tipo === "Receita" ? "receber" : "pagar", atrasado: data < hoje, contato: t.contato,
    };
  });

  // Faturas de cartão em aberto: saem no vencimento (sem filtro de banco: ainda não se sabe de onde).
  if (!banco) {
    const faturas = (await db.execute(sql`
      SELECT f.id, f.data_vencimento, c.nome AS cartao, COALESCE(SUM(t.valor::numeric), 0) AS total
      FROM empresas_faturas f
      JOIN empresas_cartoes c ON c.id = f.cartao_id
      LEFT JOIN empresas_transacoes t ON t.fatura_id = f.id AND COALESCE(t.movimenta_caixa, false) = false
      WHERE f.empresa_id = ${empresaId} AND f.status <> 'paga' AND f.data_vencimento <= ${fim}::date
      GROUP BY f.id, f.data_vencimento, c.nome
    `)) as any[];
    for (const f of faturas) {
      const valor = Number(f.total);
      if (valor <= 0) continue;
      const data = String(f.data_vencimento instanceof Date ? f.data_vencimento.toISOString() : f.data_vencimento).slice(0, 10);
      itens.push({ id: Number(f.id), data, descricao: `Fatura ${f.cartao}`, tipo: "Despesa", valor, origem: "fatura", atrasado: data < hoje });
    }
  }

  if (comRecorrencias) {
    const mens = (await db.execute(sql`
      SELECT id, descricao, valor, dia_vencimento, data_inicio, data_fim, ultima_competencia_gerada, conta_bancaria_id
      FROM mensalidades
      WHERE empresa_id = ${empresaId} AND ativo = true
        AND (${banco}::int IS NULL OR conta_bancaria_id = ${banco})
    `)) as any[];
    for (const m of mens) {
      for (const data of ocorrenciasMensalidade(m, hoje, fim)) {
        itens.push({ id: Number(m.id), data, descricao: m.descricao, tipo: "Despesa", valor: Number(m.valor), origem: "recorrencia" });
      }
    }
  }

  const r = projetar(saldoInicial, itens, { hoje, fim, agrupar, inadimplenciaPct: Number(o.inadimplencia_pct) || 0 });
  itens.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  return { hoje, fim, horizonte, agrupar, cenario: comRecorrencias ? "com_recorrencias" : "confirmados", bancos: saldos, ...r, itens: itens.slice(0, 500) };
}
