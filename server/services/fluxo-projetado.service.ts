/**
 * Fluxo de caixa projetado — PF e PJ.
 *
 * Monta uma matriz plano de contas × meses somando TUDO que cai na janela
 * (efetivado + pendente), usando o vencimento como data de referência. O saldo
 * inicial vem só do que já foi efetivado antes da janela, então não há dupla
 * contagem entre o saldo de partida e a projeção.
 *
 * PF e PJ compartilham a forma da resposta, mas cada um usa o seu plano de
 * contas: `categorias` (do usuário + globais) no PF, `empresas_contas` no PJ.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";
import type { FluxoProjetado, FluxoProjetadoLinha, FluxoProjetadoMes } from "@shared/schema";

export interface JanelaProjecao {
  de: string;  // YYYY-MM-DD
  ate: string; // YYYY-MM-DD
}

/** Executor das consultas — permite rodar dentro de uma transação ou em testes. */
type Executor = Pick<typeof db, "execute">;

interface LinhaAgregada {
  conta_id: number;
  mes: string;
  tipo: string;
  extra: boolean;
  total: number;
  previsto: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Lista de 'YYYY-MM' cobrindo a janela, inclusive. */
function mesesDaJanela(de: string, ate: string): string[] {
  const [ay, am] = de.split("-").map(Number);
  const [by, bm] = ate.split("-").map(Number);
  const out: string[] = [];
  let y = ay, m = am;
  // Trava de segurança: janelas absurdas viram no máximo 10 anos de colunas.
  while ((y < by || (y === by && m <= bm)) && out.length < 120) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }
  return out;
}

const ABREV = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function rotuloMes(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return `${ABREV[m - 1]}/${String(y).slice(2)}`;
}

const mesAtual = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

/**
 * Converte as linhas agregadas em linhas de plano de contas + os totais mensais.
 * `contas` traz nome/código/grupo de cada conta_id conforme o plano do ambiente.
 */
function montar(
  escopo: "PF" | "PJ",
  janela: JanelaProjecao,
  meses: string[],
  agregado: LinhaAgregada[],
  contas: Map<number, { codigo: string | null; nome: string; grupo: string }>,
  saldoInicial: number,
  extrasTitulo: string,
): FluxoProjetado {
  const idxMes = new Map(meses.map((m, i) => [m, i]));
  const linhas = new Map<string, FluxoProjetadoLinha>();

  for (const r of agregado) {
    const i = idxMes.get(r.mes);
    if (i === undefined) continue;
    const meta = contas.get(r.conta_id);
    const tipo = r.tipo === "Receita" ? "Receita" : "Despesa";
    const chave = `${r.extra ? "x" : "n"}|${tipo}|${r.conta_id}`;
    let linha = linhas.get(chave);
    if (!linha) {
      linha = {
        conta_id: r.conta_id,
        codigo: meta?.codigo ?? null,
        nome: meta?.nome ?? "Sem categoria",
        tipo,
        grupo: r.extra ? extrasTitulo : (meta?.grupo ?? (tipo === "Receita" ? "Receitas" : "Despesas")),
        valores: meses.map(() => 0),
        previstos: meses.map(() => 0),
        total: 0,
        total_previsto: 0,
      };
      linhas.set(chave, linha);
    }
    linha.valores[i] = round2(linha.valores[i] + r.total);
    linha.previstos[i] = round2(linha.previstos[i] + r.previsto);
    linha.total = round2(linha.total + r.total);
    linha.total_previsto = round2(linha.total_previsto + r.previsto);
  }

  const todas = [...linhas.values()];
  const ordenar = (a: FluxoProjetadoLinha, b: FluxoProjetadoLinha) =>
    (a.codigo || "zzz").localeCompare(b.codigo || "zzz") || a.nome.localeCompare(b.nome);

  const extras = todas.filter((l) => l.grupo === extrasTitulo).sort(ordenar);
  const operacionais = todas.filter((l) => l.grupo !== extrasTitulo);
  const receitas = operacionais.filter((l) => l.tipo === "Receita").sort(ordenar);
  const despesas = operacionais.filter((l) => l.tipo === "Despesa").sort(ordenar);

  const agora = mesAtual();
  let saldo = round2(saldoInicial);
  const mesesOut: FluxoProjetadoMes[] = meses.map((ym, i) => {
    const soma = (arr: FluxoProjetadoLinha[], campo: "valores" | "previstos") =>
      round2(arr.reduce((s, l) => s + l[campo][i], 0));
    const entradas = soma(receitas, "valores");
    const saidas = soma(despesas, "valores");
    const resultado = round2(entradas - saidas);
    const saldoInicialMes = saldo;
    saldo = round2(saldo + resultado);
    return {
      mes: ym,
      rotulo: rotuloMes(ym),
      passado: ym < agora,
      entradas,
      saidas,
      resultado,
      saldo_inicial: saldoInicialMes,
      saldo_final: saldo,
      entradas_previstas: soma(receitas, "previstos"),
      saidas_previstas: soma(despesas, "previstos"),
    };
  });

  const totalEntradas = round2(mesesOut.reduce((s, m) => s + m.entradas, 0));
  const totalSaidas = round2(mesesOut.reduce((s, m) => s + m.saidas, 0));

  return {
    escopo,
    periodo: janela,
    saldo_inicial: round2(saldoInicial),
    meses: mesesOut,
    receitas,
    despesas,
    extras,
    extras_titulo: extrasTitulo,
    totais: {
      entradas: totalEntradas,
      saidas: totalSaidas,
      resultado: round2(totalEntradas - totalSaidas),
      saldo_final: mesesOut.length ? mesesOut[mesesOut.length - 1].saldo_final : round2(saldoInicial),
      extras: round2(extras.reduce((s, l) => s + l.total, 0)),
    },
  };
}

// ---------------------------------------------------------------- PF

export async function getFluxoProjetadoPF(
  walletId: number,
  userId: number,
  janela: JanelaProjecao,
  conn: Executor = db,
): Promise<FluxoProjetado> {
  const meses = mesesDaJanela(janela.de, janela.ate);
  const ref = sql`COALESCE(t.data_vencimento, t.data_transacao)`;

  const rows = await conn.execute(sql`
    SELECT t.categoria_id AS conta_id,
           to_char(${ref}, 'YYYY-MM') AS mes,
           t.tipo,
           COALESCE(t.reembolsavel, false) AS extra,
           SUM(t.valor::numeric) AS total,
           SUM(CASE WHEN t.status <> 'Efetivada' THEN t.valor::numeric ELSE 0 END) AS previsto
    FROM transacoes t
    WHERE t.carteira_id = ${walletId}
      AND ${ref} >= ${janela.de}
      AND ${ref} <= ${janela.ate}
    GROUP BY t.categoria_id, to_char(${ref}, 'YYYY-MM'), t.tipo, COALESCE(t.reembolsavel, false)
  `);

  // Saldo de partida: só o efetivado antes da janela. Despesa reembolsável não
  // reduz caixa (mesma regra de calculateWalletBalance).
  const saldoRows = await conn.execute(sql`
    SELECT COALESCE(SUM(
      CASE WHEN t.tipo = 'Receita' THEN t.valor::numeric
           WHEN t.tipo = 'Despesa' AND COALESCE(t.reembolsavel, false) = false THEN -t.valor::numeric
           ELSE 0 END
    ), 0) AS saldo
    FROM transacoes t
    WHERE t.carteira_id = ${walletId}
      AND t.status = 'Efetivada'
      AND ${ref} < ${janela.de}
  `);
  const saldoInicial = parseFloat((saldoRows as any[])[0]?.saldo) || 0;

  const catRows = await conn.execute(sql`
    SELECT id, nome, tipo
    FROM categorias
    WHERE usuario_id = ${userId} OR global = true
  `);
  const contas = new Map<number, { codigo: string | null; nome: string; grupo: string }>();
  for (const c of catRows as any[]) {
    contas.set(Number(c.id), {
      codigo: null,
      nome: String(c.nome),
      grupo: String(c.tipo) === "Receita" ? "Receitas" : "Despesas",
    });
  }

  const agregado: LinhaAgregada[] = (rows as any[]).map((r) => ({
    conta_id: Number(r.conta_id),
    mes: String(r.mes),
    tipo: String(r.tipo),
    extra: r.extra === true || r.extra === "true",
    total: parseFloat(r.total) || 0,
    previsto: parseFloat(r.previsto) || 0,
  }));

  return montar("PF", janela, meses, agregado, contas, saldoInicial, "Reembolsáveis (a receber)");
}

// ---------------------------------------------------------------- PJ

export async function getFluxoProjetadoPJ(
  empresaId: number,
  janela: JanelaProjecao,
  conn: Executor = db,
): Promise<FluxoProjetado> {
  const meses = mesesDaJanela(janela.de, janela.ate);
  const ref = sql`COALESCE(t.data_vencimento, t.data_transacao)`;

  const rows = await conn.execute(sql`
    SELECT t.categoria_id AS conta_id,
           to_char(${ref}, 'YYYY-MM') AS mes,
           t.tipo,
           COALESCE(t.reembolso_pessoal, false) AS extra,
           SUM(t.valor::numeric) AS total,
           SUM(CASE WHEN t.status <> 'Efetivada' THEN t.valor::numeric ELSE 0 END) AS previsto
    FROM empresas_transacoes t
    WHERE t.empresa_id = ${empresaId}
      AND ${ref} >= ${janela.de}
      AND ${ref} <= ${janela.ate}
    GROUP BY t.categoria_id, to_char(${ref}, 'YYYY-MM'), t.tipo, COALESCE(t.reembolso_pessoal, false)
  `);

  // Saldo de partida = saldo declarado das contas bancárias + movimento já
  // efetivado nelas antes da janela (mesma conta do fluxo de caixa realizado).
  const bancoRows = await conn.execute(sql`
    SELECT COALESCE(SUM(saldo_inicial::numeric), 0) AS total
    FROM contas_bancarias
    WHERE empresa_id = ${empresaId} AND ativo = true
  `);
  const movRows = await conn.execute(sql`
    SELECT COALESCE(SUM(
      CASE WHEN t.tipo = 'Receita' THEN t.valor::numeric ELSE -t.valor::numeric END
    ), 0) AS total
    FROM empresas_transacoes t
    WHERE t.empresa_id = ${empresaId}
      AND t.conta_bancaria_id IS NOT NULL
      AND COALESCE(t.movimenta_caixa, true) = true
      AND t.status = 'Efetivada'
      AND ${ref} < ${janela.de}
  `);
  const saldoInicial =
    (parseFloat((bancoRows as any[])[0]?.total) || 0) + (parseFloat((movRows as any[])[0]?.total) || 0);

  const contaRows = await conn.execute(sql`
    SELECT id, codigo, nome, tipo, classificacao
    FROM empresas_contas
    WHERE empresa_id = ${empresaId}
  `);
  const GRUPO: Record<string, string> = {
    FIXA: "Despesas Fixas",
    VARIAVEL: "Despesas Variáveis",
    OUTRA: "Outras Despesas",
  };
  const contas = new Map<number, { codigo: string | null; nome: string; grupo: string }>();
  for (const c of contaRows as any[]) {
    const receita = String(c.tipo) === "Receita";
    contas.set(Number(c.id), {
      codigo: c.codigo ? String(c.codigo) : null,
      nome: String(c.nome),
      grupo: receita ? "Receitas" : (GRUPO[String(c.classificacao)] ?? "Outras Despesas"),
    });
  }

  const agregado: LinhaAgregada[] = (rows as any[]).map((r) => ({
    conta_id: Number(r.conta_id),
    mes: String(r.mes),
    tipo: String(r.tipo),
    extra: r.extra === true || r.extra === "true",
    total: parseFloat(r.total) || 0,
    previsto: parseFloat(r.previsto) || 0,
  }));

  return montar("PJ", janela, meses, agregado, contas, saldoInicial, "Reembolsos a Pagar — Pessoal");
}
