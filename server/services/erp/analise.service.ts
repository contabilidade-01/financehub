/**
 * Análise gerencial do ERP PJ ME: DRE por margem de contribuição, razão por
 * conta do plano e o "mapa do dinheiro" (de onde veio, para onde foi).
 *
 * Todos partem da mesma base de lançamentos e do mesmo cálculo de indicadores
 * (shared/indicadores-financeiros), então DRE, razão, mapa e dashboard batem.
 */
import { sql, type SQL } from "drizzle-orm";
import { db } from "../../db";
import { hojeSP, somarDias } from "../nlp-br";
import { ErroErp, type Regime } from "./erp.service";
import {
  calcularIndicadores, grupoDreDaConta, somasVazias, ESTRUTURA_DRE, ROTULO_GRUPO_DRE,
  type GrupoDre, type Indicadores, type SomasDre,
} from "../../../shared/indicadores-financeiros";
import { compararCodigos } from "../../../shared/plano-contas-grupos";

export interface FiltrosAnalise {
  de?: string;
  ate?: string;
  regime?: string;
  centro_custo_id?: number | null;
  contato_id?: number | null;
  conta_bancaria_id?: number | null;
}

const iso = (s?: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
const r2 = (n: number) => Math.round(n * 100) / 100;

export function mesesEntre(de: string, ate: string): string[] {
  const out: string[] = [];
  let [a, m] = de.split("-").map(Number);
  const [a2, m2] = ate.split("-").map(Number);
  while ((a < a2 || (a === a2 && m <= m2)) && out.length < 36) {
    out.push(`${a}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) { m = 1; a++; }
  }
  return out;
}

/** Período, regime e o recorte SQL comum a DRE, razão e mapa. */
export function baseAnalise(f: FiltrosAnalise) {
  const hoje = hojeSP();
  const de = iso(f.de) ?? `${hoje.slice(0, 4)}-01-01`;
  const ate = iso(f.ate) ?? hoje;
  if (de > ate) throw new ErroErp("Período inválido.");
  const regime: Regime = f.regime === "competencia" ? "competencia" : "caixa";
  // Caixa: quando o dinheiro se moveu (compra no cartão conta na data da compra,
  // pois o pagamento da fatura fica de fora para não contar duas vezes).
  const dataRef: SQL = regime === "caixa"
    ? sql`CASE WHEN t.fatura_id IS NOT NULL OR t.cartao_id IS NOT NULL THEN t.data_transacao ELSE COALESCE(t.data_pagamento, t.data_transacao) END`
    : sql`t.data_transacao`;
  const status: SQL = regime === "caixa" ? sql`t.status = 'Efetivada'` : sql`t.status IN ('Efetivada', 'Pendente')`;
  const centro = f.centro_custo_id ? Number(f.centro_custo_id) : null;
  const contato = f.contato_id ? Number(f.contato_id) : null;
  const banco = f.conta_bancaria_id ? Number(f.conta_bancaria_id) : null;
  const filtro: SQL = sql`
    ${status}
    AND ${dataRef} BETWEEN ${de}::date AND ${ate}::date
    AND NOT (COALESCE(t.reembolso_pessoal, false) = true AND t.status = 'Pendente')
    AND NOT EXISTS (SELECT 1 FROM empresas_faturas fx WHERE fx.transacao_pagamento_id = t.id)
    AND (${centro}::int IS NULL OR t.centro_custo_id = ${centro})
    AND (${contato}::int IS NULL OR t.contato_id = ${contato})
    AND (${banco}::int IS NULL OR t.conta_bancaria_id = ${banco})
  `;
  return { de, ate, regime, dataRef, filtro, centro, contato, banco };
}

interface LinhaConta {
  conta_id: number;
  codigo: string;
  nome: string;
  tipo: string;
  grupo: GrupoDre;
  parent_id: number | null;
  valores: Record<string, number>;
  total: number;
  qtd: number;
}

async function somarPorConta(empresaId: number, f: FiltrosAnalise) {
  const b = baseAnalise(f);
  const rows = (await db.execute(sql`
    SELECT c.id AS conta_id, c.codigo, c.nome, c.tipo, c.classificacao, c.grupo_gerencial, c.is_cmv, c.parent_id,
           to_char(${b.dataRef}, 'YYYY-MM') AS mes, SUM(t.valor::numeric) AS total, COUNT(*)::int AS qtd
    FROM empresas_transacoes t
    JOIN empresas_contas c ON c.id = t.categoria_id
    WHERE t.empresa_id = ${empresaId} AND ${b.filtro}
    GROUP BY c.id, c.codigo, c.nome, c.tipo, c.classificacao, c.grupo_gerencial, c.is_cmv, c.parent_id, mes
  `)) as any[];
  const porConta = new Map<number, LinhaConta>();
  for (const r of rows) {
    const id = Number(r.conta_id);
    if (!porConta.has(id)) {
      porConta.set(id, {
        conta_id: id, codigo: r.codigo, nome: r.nome, tipo: r.tipo, parent_id: r.parent_id ? Number(r.parent_id) : null,
        grupo: grupoDreDaConta(r), valores: {}, total: 0, qtd: 0,
      });
    }
    const c = porConta.get(id)!;
    const v = r2(Number(r.total));
    c.valores[r.mes] = r2((c.valores[r.mes] || 0) + v);
    c.total = r2(c.total + v);
    c.qtd += Number(r.qtd);
  }
  const linhas = [...porConta.values()].sort((a, b2) => compararCodigos(a.codigo, b2.codigo));
  return { base: b, linhas };
}

function somasDe(linhas: LinhaConta[], mes?: string): SomasDre {
  const s = somasVazias();
  for (const l of linhas) s[l.grupo] = r2(s[l.grupo] + (mes ? l.valores[mes] || 0 : l.total));
  return s;
}

// ----------------------------------------------------------------------------
// DRE gerencial
// ----------------------------------------------------------------------------

export async function dreGerencial(empresaId: number, f: FiltrosAnalise) {
  const { base, linhas } = await somarPorConta(empresaId, f);
  const meses = mesesEntre(base.de, base.ate);
  const porMes: Record<string, { somas: SomasDre; indicadores: Indicadores }> = {};
  for (const m of meses) {
    const somas = somasDe(linhas, m);
    porMes[m] = { somas, indicadores: calcularIndicadores(somas) };
  }
  const somas = somasDe(linhas);
  return {
    periodo: { de: base.de, ate: base.ate },
    regime: base.regime,
    centro_custo_id: base.centro,
    meses,
    linhas: linhas.map(({ parent_id, qtd, ...l }) => l),
    somas,
    totais: calcularIndicadores(somas),
    por_mes: porMes,
  };
}

export type Dre = Awaited<ReturnType<typeof dreGerencial>>;

/** CSV (separador ";", decimal ",") para abrir direto no Excel em português. */
export function dreParaCsv(d: Pick<Dre, "meses" | "linhas" | "somas" | "totais" | "por_mes">): string {
  const num = (n: number) => r2(n).toFixed(2).replace(".", ",");
  const saida: string[][] = [["Código", "Conta", ...d.meses, "Total"]];
  for (const e of ESTRUTURA_DRE) {
    if (e.tipo === "total") {
      saida.push(["", e.titulo, ...d.meses.map((m) => num(Number(d.por_mes[m].indicadores[e.chave] ?? 0))), num(Number(d.totais[e.chave] ?? 0))]);
      continue;
    }
    const contas = d.linhas.filter((l) => e.grupos.includes(l.grupo));
    if (!contas.length) continue;
    const soma = (m?: string) => e.grupos.reduce((s, g) => s + (m ? d.por_mes[m].somas[g] : d.somas[g]), 0);
    saida.push(["", e.titulo, ...d.meses.map((m) => num(soma(m))), num(soma())]);
    for (const l of contas) saida.push([l.codigo, l.nome, ...d.meses.map((m) => num(l.valores[m] || 0)), num(l.total)]);
  }
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return "﻿" + saida.map((l) => l.map((c) => esc(String(c))).join(";")).join("\r\n");
}

// ----------------------------------------------------------------------------
// Mapa do dinheiro (Sankey)
// ----------------------------------------------------------------------------

export interface NoMapa {
  name: string;
  /** Coluna: 0 = origem, 1 = caixa, 2 = grupo de saída, 3 = conta. */
  coluna: number;
  grupo?: GrupoDre | "sobra" | "falta";
  conta_id?: number;
}
export interface Mapa {
  nodes: NoMapa[];
  links: { source: number; target: number; value: number }[];
  entradas: number;
  saidas: number;
  saldo: number;
}

const ENTRADAS: GrupoDre[] = ["receita", "financeiro_receita", "nao_operacional_entrada"];
const SAIDAS: GrupoDre[] = ["deducao", "cmv", "variavel", "fixa", "financeiro_despesa", "outras", "investimento", "nao_operacional_saida"];

/**
 * Monta o Sankey: entradas por conta → Caixa → grupos de saída → principais
 * contas de cada grupo. A diferença vira "Sobra" (à direita) ou "Falta" (à
 * esquerda, entrou por saldo anterior). Contas pequenas viram "Outras".
 */
export function montarMapa(linhas: Pick<LinhaConta, "conta_id" | "nome" | "grupo" | "total">[], opts: { maxEntradas?: number; maxPorGrupo?: number } = {}): Mapa {
  const maxEntradas = opts.maxEntradas ?? 6;
  const maxPorGrupo = opts.maxPorGrupo ?? 3;
  const nodes: NoMapa[] = [];
  const links: Mapa["links"] = [];
  const no = (n: NoMapa) => nodes.push(n) - 1;

  const positivas = linhas.filter((l) => l.total > 0);
  const entradas = positivas.filter((l) => ENTRADAS.includes(l.grupo)).sort((a, b) => b.total - a.total);
  const saidas = positivas.filter((l) => SAIDAS.includes(l.grupo));
  const totalEntradas = r2(entradas.reduce((s, l) => s + l.total, 0));
  const totalSaidas = r2(saidas.reduce((s, l) => s + l.total, 0));
  const saldo = r2(totalEntradas - totalSaidas);
  if (!totalEntradas && !totalSaidas) return { nodes, links, entradas: 0, saidas: 0, saldo: 0 };

  const caixa = no({ name: "Caixa da empresa", coluna: 1 });
  const visiveis = entradas.slice(0, maxEntradas);
  for (const l of visiveis) links.push({ source: no({ name: l.nome, coluna: 0, grupo: l.grupo, conta_id: l.conta_id }), target: caixa, value: l.total });
  const resto = r2(entradas.slice(maxEntradas).reduce((s, l) => s + l.total, 0));
  if (resto > 0) links.push({ source: no({ name: "Outras entradas", coluna: 0 }), target: caixa, value: resto });
  if (saldo < 0) links.push({ source: no({ name: "Falta (saldo anterior)", coluna: 0, grupo: "falta" }), target: caixa, value: -saldo });

  for (const g of SAIDAS) {
    const doGrupo = saidas.filter((l) => l.grupo === g).sort((a, b) => b.total - a.total);
    const total = r2(doGrupo.reduce((s, l) => s + l.total, 0));
    if (!total) continue;
    const ng = no({ name: ROTULO_GRUPO_DRE[g], coluna: 2, grupo: g });
    links.push({ source: caixa, target: ng, value: total });
    for (const l of doGrupo.slice(0, maxPorGrupo)) links.push({ source: ng, target: no({ name: l.nome, coluna: 3, grupo: g, conta_id: l.conta_id }), value: l.total });
    const outras = r2(doGrupo.slice(maxPorGrupo).reduce((s, l) => s + l.total, 0));
    if (outras > 0) links.push({ source: ng, target: no({ name: `Outras (${ROTULO_GRUPO_DRE[g].toLowerCase()})`, coluna: 3, grupo: g }), value: outras });
  }
  if (saldo > 0) links.push({ source: caixa, target: no({ name: "Sobra do período", coluna: 2, grupo: "sobra" }), value: saldo });
  return { nodes, links, entradas: totalEntradas, saidas: totalSaidas, saldo };
}

// ----------------------------------------------------------------------------
// Razão por conta do plano
// ----------------------------------------------------------------------------

/** Totais por conta (analíticas e grupos somando as filhas), indicadores e o mapa. */
export async function razao(empresaId: number, f: FiltrosAnalise) {
  const { base, linhas } = await somarPorConta(empresaId, f);
  const plano = (await db.execute(sql`
    SELECT id, codigo, nome, tipo, sintetica, parent_id FROM empresas_contas WHERE empresa_id = ${empresaId}
  `)) as any[];
  const porId = new Map(plano.map((c) => [Number(c.id), c]));
  const somaGrupo = new Map<number, { total: number; qtd: number }>();
  for (const l of linhas) {
    let pai = l.parent_id ? porId.get(l.parent_id) : undefined;
    // Sobe até a raiz: grupo de grupo também soma (sinal pelo tipo da conta).
    for (let guarda = 0; pai && guarda < 8; guarda++) {
      const atual = somaGrupo.get(Number(pai.id)) || { total: 0, qtd: 0 };
      atual.total = r2(atual.total + (l.tipo === "Receita" ? l.total : -l.total));
      atual.qtd += l.qtd;
      somaGrupo.set(Number(pai.id), atual);
      pai = pai.parent_id ? porId.get(Number(pai.parent_id)) : undefined;
    }
  }
  const grupos = [...somaGrupo.entries()].map(([id, v]) => {
    const g = porId.get(id);
    return { conta_id: id, codigo: g.codigo, nome: g.nome, parent_id: g.parent_id ? Number(g.parent_id) : null, sintetica: true, saldo: v.total, qtd: v.qtd };
  });
  const contas = linhas.map((l) => ({
    conta_id: l.conta_id, codigo: l.codigo, nome: l.nome, tipo: l.tipo, grupo: l.grupo, parent_id: l.parent_id,
    sintetica: false, total: l.total, saldo: l.tipo === "Receita" ? l.total : -l.total, qtd: l.qtd,
  }));
  const somas = somasDe(linhas);
  return {
    periodo: { de: base.de, ate: base.ate },
    regime: base.regime,
    contas: [...grupos, ...contas].sort((a, b) => compararCodigos(a.codigo, b.codigo)),
    indicadores: calcularIndicadores(somas),
    mapa: montarMapa(linhas),
  };
}

/** Lançamentos de uma conta (ou de todas as contas de um grupo) com saldo acumulado. */
export async function lancamentosDaConta(empresaId: number, contaId: number, f: FiltrosAnalise) {
  const b = baseAnalise(f);
  const conta = ((await db.execute(sql`
    SELECT id, codigo, nome, tipo, sintetica FROM empresas_contas WHERE id = ${contaId} AND empresa_id = ${empresaId}
  `)) as any[])[0];
  if (!conta) throw new ErroErp("Conta não encontrada.", 404);
  // Grupo: todas as descendentes (CTE recursiva, limitada à empresa).
  const rows = (await db.execute(sql`
    WITH RECURSIVE arvore AS (
      SELECT id FROM empresas_contas WHERE id = ${contaId} AND empresa_id = ${empresaId}
      UNION ALL
      SELECT c.id FROM empresas_contas c JOIN arvore a ON c.parent_id = a.id WHERE c.empresa_id = ${empresaId}
    )
    SELECT t.id, t.descricao, t.valor, t.tipo, t.status, ${b.dataRef} AS data, t.data_vencimento,
           c.codigo AS conta_codigo, c.nome AS conta_nome, ct.nome AS contato_nome, cc.nome AS centro_nome,
           COALESCE(cb.nome, cb.banco) AS banco_nome, t.parcela_num, t.parcela_total
    FROM empresas_transacoes t
    JOIN empresas_contas c ON c.id = t.categoria_id
    LEFT JOIN empresas_contatos ct ON ct.id = t.contato_id
    LEFT JOIN empresas_centros_custo cc ON cc.id = t.centro_custo_id
    LEFT JOIN contas_bancarias cb ON cb.id = t.conta_bancaria_id
    WHERE t.empresa_id = ${empresaId} AND t.categoria_id IN (SELECT id FROM arvore) AND ${b.filtro}
    ORDER BY ${b.dataRef}, t.id
    LIMIT 3000
  `)) as any[];
  let acumulado = 0;
  const lancamentos = rows.map((r) => {
    const valor = Number(r.valor);
    acumulado = r2(acumulado + (r.tipo === "Receita" ? valor : -valor));
    return { ...r, data: String(r.data).slice(0, 10), valor, acumulado };
  });
  return { conta, periodo: { de: b.de, ate: b.ate }, regime: b.regime, lancamentos, total: acumulado };
}

export function razaoParaCsv(r: Awaited<ReturnType<typeof lancamentosDaConta>>): string {
  const num = (n: number) => r2(n).toFixed(2).replace(".", ",");
  const dataBr = (s: string) => s.split("-").reverse().join("/");
  const linhas = [["Data", "Descrição", "Conta", "Cliente/fornecedor", "Centro de custo", "Banco", "Valor", "Acumulado"]];
  for (const l of r.lancamentos) {
    linhas.push([dataBr(l.data), l.descricao, `${l.conta_codigo} ${l.conta_nome}`, l.contato_nome || "", l.centro_nome || "", l.banco_nome || "",
      num(l.tipo === "Receita" ? l.valor : -l.valor), num(l.acumulado)]);
  }
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  return "﻿" + linhas.map((l) => l.map((c) => esc(String(c ?? ""))).join(";")).join("\r\n");
}

// ----------------------------------------------------------------------------
// Dashboard de análise
// ----------------------------------------------------------------------------

/**
 * Período de comparação: meses cheios comparam com os mesmos meses cheios
 * anteriores (set → ago; 1º tri → 4º tri); outros recortes, com o mesmo
 * número de dias imediatamente antes.
 */
export function periodoAnterior(de: string, ate: string): { de: string; ate: string } {
  const dia = 86_400_000;
  const [a1, m1, d1] = de.split("-").map(Number);
  const [a2, m2] = ate.split("-").map(Number);
  if (d1 === 1 && ate === fimDoMes(ate.slice(0, 7))) {
    const n = (a2 - a1) * 12 + (m2 - m1) + 1;
    const ini = new Date(Date.UTC(a1, m1 - 1 - n, 1)).toISOString().slice(0, 10);
    const fim = new Date(Date.UTC(a1, m1 - 1, 0)).toISOString().slice(0, 10);
    return { de: ini, ate: fim };
  }
  const ini = Date.parse(`${de}T12:00:00Z`);
  const dias = Math.round((Date.parse(`${ate}T12:00:00Z`) - ini) / dia) + 1;
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
  return { de: iso(ini - dias * dia), ate: iso(ini - dia) };
}

function fimDoMes(ym: string): string {
  const [a, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

export async function painelAnalise(empresaId: number, f: FiltrosAnalise) {
  const { saldoConta } = await import("../conta-bancaria.service");
  const { listarTitulos } = await import("./titulos.service");
  const { projecaoCaixa } = await import("./projecao.service");

  const atual = await somarPorConta(empresaId, f);
  const ant = periodoAnterior(atual.base.de, atual.base.ate);
  const anterior = await somarPorConta(empresaId, { ...f, ...ant });
  const somas = somasDe(atual.linhas);

  // Série de 12 meses terminando no fim do período (regime escolhido).
  const [aAte, mAte] = atual.base.ate.split("-").map(Number);
  const ini12 = new Date(Date.UTC(aAte, mAte - 12, 1)).toISOString().slice(0, 10);
  const serie = await somarPorConta(empresaId, { ...f, de: ini12, ate: fimDoMes(atual.base.ate.slice(0, 7)) });
  const meses12 = mesesEntre(ini12, atual.base.ate);
  const saidaGrupos: GrupoDre[] = ["deducao", "cmv", "variavel", "fixa", "financeiro_despesa", "outras"];
  const mensal = meses12.map((m) => {
    const s = somasDe(serie.linhas, m);
    const ind = calcularIndicadores(s);
    return {
      mes: m,
      receitas: r2(s.receita + s.financeiro_receita),
      despesas: r2(saidaGrupos.reduce((t, g) => t + s[g], 0)),
      lucro_liquido: ind.lucro_liquido,
    };
  });

  // Saldo dos bancos hoje e no fim de cada mês da série.
  const bancos = (await db.execute(sql`
    SELECT id, COALESCE(nome, banco) AS nome FROM contas_bancarias
    WHERE empresa_id = ${empresaId} AND ativo = true
      AND (${atual.base.banco}::int IS NULL OR id = ${atual.base.banco})
  `)) as any[];
  const hoje = hojeSP();
  const saldoBancos = await Promise.all(bancos.map(async (b) => ({ id: Number(b.id), nome: b.nome, saldo: await saldoConta(Number(b.id)) })));
  const evolucaoSaldo = [];
  for (const m of meses12) {
    const corte = fimDoMes(m) > hoje ? hoje : fimDoMes(m);
    const valores = await Promise.all(bancos.map((b) => saldoConta(Number(b.id), corte)));
    evolucaoSaldo.push({ mes: m, saldo: r2(valores.reduce((s, v) => s + v, 0)) });
  }

  // Top clientes e fornecedores no período.
  const tops = (await db.execute(sql`
    SELECT t.tipo, c.id, c.nome, SUM(t.valor::numeric) AS total
    FROM empresas_transacoes t
    JOIN empresas_contatos c ON c.id = t.contato_id
    WHERE t.empresa_id = ${empresaId} AND ${atual.base.filtro}
    GROUP BY t.tipo, c.id, c.nome
    ORDER BY total DESC
  `)) as any[];
  const top = (tipo: string) => tops.filter((t) => t.tipo === tipo).slice(0, 5).map((t) => ({ id: Number(t.id), nome: t.nome, total: r2(Number(t.total)) }));

  const receber = await listarTitulos(empresaId, "Receita", { status: "aberto" });
  const pagar = await listarTitulos(empresaId, "Despesa", { status: "aberto" });
  const em7 = (l: any) => {
    const v = String(l.data_vencimento || l.data_transacao).slice(0, 10);
    return v >= hoje && v <= somarDias(hoje, 7);
  };
  const proximos = [
    ...receber.linhas.filter(em7).map((l: any) => ({ ...l, tipo: "Receita" })),
    ...pagar.linhas.filter(em7).map((l: any) => ({ ...l, tipo: "Despesa" })),
  ]
    .sort((a, b) => String(a.data_vencimento).localeCompare(String(b.data_vencimento)))
    .slice(0, 12)
    .map((l) => ({ id: l.id, descricao: l.descricao, valor: Number(l.valor), tipo: l.tipo, vencimento: String(l.data_vencimento || l.data_transacao).slice(0, 10), contato: l.contato_nome }));

  const projecao = await projecaoCaixa(empresaId, { horizonte: 90, agrupar: "semana", conta_bancaria_id: atual.base.banco });

  return {
    periodo: { de: atual.base.de, ate: atual.base.ate },
    anterior: ant,
    regime: atual.base.regime,
    indicadores: calcularIndicadores(somas),
    indicadores_anterior: calcularIndicadores(somasDe(anterior.linhas)),
    somas,
    mensal,
    saldo_bancos: { total: r2(saldoBancos.reduce((s, b) => s + b.saldo, 0)), bancos: saldoBancos },
    evolucao_saldo: evolucaoSaldo,
    top_clientes: top("Receita"),
    top_fornecedores: top("Despesa"),
    receber: { resumo: receber.resumo, aging: receber.aging },
    pagar: { resumo: pagar.resumo, aging: pagar.aging },
    proximos_7_dias: proximos,
    projecao: { periodos: projecao.periodos, primeiro_negativo: projecao.primeiro_negativo, saldo_final: projecao.saldo_final, menor_saldo: projecao.menor_saldo },
  };
}
