import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import { PeriodFilter } from "@/components/period-filter";
import type { EmpresaFluxoCaixaMensal, EmpresaConta } from "@shared/schema";
import { calcularIndicadores, grupoDreDaConta, somasVazias, ESTRUTURA_DRE, type GrupoDre } from "@shared/indicadores-financeiros";

/**
 * Fluxo de Caixa Gerencial mensal (visão avançada/CFO): contas nas linhas,
 * meses nas colunas. Usa o modelo de classificação da empresa
 * (Receita / Despesa VARIAVEL / FIXA / OUTRA) para as linhas calculadas.
 */
const MESES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
const money0 = (v: number) => (v < 0 ? "-" : "") + "R$ " + Math.abs(Math.round(v)).toLocaleString("pt-BR");
const zeros = () => Array(12).fill(0);
const sumArr = (a: number[]) => a.reduce((x, y) => x + y, 0);
const addArr = (...as: number[][]) => { const t = zeros(); as.forEach((a) => a.forEach((v, i) => (t[i] += v))); return t; };

type Row = {
  kind: "grupo" | "conta" | "calc" | "saldohd" | "saldo";
  label: string;
  code?: string;
  values: number[];
  receita?: boolean;
  /** Como calcular a coluna Total. Saldo é estoque, não fluxo: somar os 12 meses
   *  não significa nada — vale a abertura (janeiro) ou o fechamento (dezembro). */
  totalCol?: "soma" | "abertura" | "fechamento";
};

export default function PjFluxoCaixa({ empresaId }: { empresaId: number }) {
  const isMobile = useIsMobile();
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState(new Date().getMonth());
  const [periodo, setPeriodo] = useState({
    inicio: new Date(anoAtual, 0, 1),
    fim: new Date(anoAtual, 11, 31),
  });

  const { data, isLoading } = useQuery<EmpresaFluxoCaixaMensal>({
    queryKey: [`/api/empresas/${empresaId}/relatorios/fluxo-caixa`, ano, periodo],
    queryFn: () => {
      const params = new URLSearchParams({
        ano: String(ano),
        inicio: periodo.inicio.toISOString(),
        fim: periodo.fim.toISOString(),
      });
      return fetch(`/api/empresas/${empresaId}/relatorios/fluxo-caixa?${params}`, { credentials: "include" }).then((r) => r.json());
    },
    enabled: !!empresaId,
  });

  const { data: empresaData } = useQuery({
  queryKey: [`/api/empresas/${empresaId}`, "empresa-detalhes"],
  queryFn: () => fetch(`/api/empresas/${empresaId}`, { credentials: "include" }).then((r) => r.json()),
  enabled: !!empresaId,
});

const model = useMemo(() => (data ? buildModel(data, empresaData) : null), [data, empresaData]);

  if (isLoading || !model) {
    return <div><Skeleton className="h-[480px] w-full" /></div>;
  }
  if (model.rows.length === 0) {
    return (
      <div>
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Sem lançamentos em {ano}. Registre transações PJ para ver o fluxo de caixa.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Fluxo de Caixa Gerencial</h1>
          <p className="text-sm text-muted-foreground">Contas nas linhas, meses nas colunas · linhas azuis são calculadas.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PeriodFilter
            onPeriodChange={(inicio, fim) => setPeriodo({ inicio, fim })}
            className="hidden md:flex"
          />
          <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
            <SelectTrigger className="w-[110px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[anoAtual + 1, anoAtual, anoAtual - 1, anoAtual - 2].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {model.kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-3">
              <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">{k.label}</div>
              <div className={`text-lg font-bold tabular-nums ${k.tone === "pos" ? "text-income" : k.tone === "neg" ? "text-expense" : ""}`}>{k.value}</div>
              {k.hint && <div className="text-xs text-muted-foreground">{k.hint}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      {isMobile ? (
        <>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Mês:</span>
            <Select value={String(mes)} onValueChange={(v) => setMes(Number(v))}>
              <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MESES.map((m, i) => <SelectItem key={m} value={String(i)}>{m} / {ano}</SelectItem>)}
                <SelectItem value="12">Total do ano</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card><CardContent className="p-0 divide-y divide-border/40">
            {model.rows.map((r, i) => <MobileRow key={i} r={r} mes={mes} />)}
          </CardContent></Card>
        </>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-muted text-slate-50">
                  <th className="text-left sticky left-0 z-10 bg-muted px-3 py-2 min-w-[250px]">Conta</th>
                  {MESES.map((m) => <th key={m} className="px-2.5 py-2 text-right font-semibold">{m}</th>)}
                  <th className="px-2.5 py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>{model.rows.map((r, i) => <ReportRow key={i} r={r} />)}</tbody>
            </table>
          </CardContent>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">
        Baseado nas transações PJ do ano. Margem de Contribuição = Receita − Despesas Variáveis.
        O <strong>Saldo Final</strong> de cada mês é o inicial do mês seguinte (sobra acumulada; em vermelho quando negativo).
        Na coluna Total, as linhas de saldo mostram a posição (abertura em janeiro / fechamento em dezembro), não a soma dos meses.
      </p>
    </div>
  );
}

// Coluna "Total" da linha: fluxo soma; saldo mostra abertura ou fechamento.
function totalDaLinha(r: Row): number {
  if (r.totalCol === "abertura") return r.values[0] ?? 0;
  if (r.totalCol === "fechamento") return r.values[r.values.length - 1] ?? 0;
  return sumArr(r.values);
}

function ReportRow({ r }: { r: Row }) {
  const total = totalDaLinha(r);
  const cell = (v: number, i: number) => <td key={i} className={`px-2.5 py-1.5 text-right tabular-nums ${v < 0 ? "text-expense" : ""}`}>{v === 0 ? "—" : money0(v)}</td>;
  if (r.kind === "grupo") {
    return (
      <tr className={`${r.receita ? "bg-emerald-600" : "bg-muted"} text-slate-50 font-bold`}>
        <td className="text-left sticky left-0 z-10 px-3 py-1.5 uppercase text-xs tracking-wide" style={{ background: "inherit" }}>{r.label}</td>
        {r.values.map(cell)}
        <td className="px-2.5 py-1.5 text-right tabular-nums">{money0(total)}</td>
      </tr>
    );
  }
  if (r.kind === "calc") {
    return (
      <tr className="bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-200 font-extrabold border-y border-blue-200 dark:border-blue-800">
        <td className="text-left sticky left-0 z-10 bg-blue-50 dark:bg-blue-950/50 px-3 py-1.5 uppercase text-xs tracking-wide">{r.label}</td>
        {r.values.map((v, i) => <td key={i} className="px-2.5 py-1.5 text-right tabular-nums">{money0(v)}</td>)}
        <td className="px-2.5 py-1.5 text-right tabular-nums">{money0(total)}</td>
      </tr>
    );
  }
  if (r.kind === "saldohd") {
    return (
      <tr className="bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-bold">
        <td className="text-left sticky left-0 z-10 bg-amber-50 dark:bg-amber-950/40 px-3 py-1.5 uppercase text-xs tracking-wide">{r.label}</td>
        {/* Saldo negativo em vermelho: é a informação que o usuário procura. */}
        {r.values.map((v, i) => (
          <td key={i} className={`px-2.5 py-1.5 text-right tabular-nums ${v < 0 ? "text-expense dark:text-rose-400" : ""}`}>{money0(v)}</td>
        ))}
        <td className={`px-2.5 py-1.5 text-right tabular-nums ${total < 0 ? "text-expense dark:text-rose-400" : ""}`}>{money0(total)}</td>
      </tr>
    );
  }
  if (r.kind === "saldo") {
    return (
      <tr className="border-b border-border/40">
        <td className="text-left sticky left-0 z-10 px-3 py-1.5 bg-background pl-6 text-muted-foreground">{r.label}</td>
        {r.values.map((v, i) => <td key={i} className={`px-2.5 py-1.5 text-right tabular-nums ${v < 0 ? "text-expense" : ""}`}>{money0(v)}</td>)}
        <td className="px-2.5 py-1.5 text-right tabular-nums font-medium">{money0(total)}</td>
      </tr>
    );
  }
  return (
    <tr className="border-b border-border/40 hover:bg-muted/60">
      <td className="text-left sticky left-0 z-10 px-3 py-1.5 bg-background pl-8">
        {r.code && <span className="font-mono text-muted-foreground mr-2 text-xs">{r.code}</span>}{r.label}
      </td>
      {r.values.map(cell)}
      <td className="px-2.5 py-1.5 text-right tabular-nums font-medium">{money0(total)}</td>
    </tr>
  );
}

function MobileRow({ r, mes }: { r: Row; mes: number }) {
  const val = mes >= 12 ? totalDaLinha(r) : r.values[mes];
  if (r.kind === "grupo") {
    return (
      <div className={`flex items-center justify-between px-3 py-2 ${r.receita ? "bg-emerald-600" : "bg-muted"} text-slate-50`}>
        <span className="uppercase text-xs font-bold tracking-wide">{r.label}</span>
        <span className="tabular-nums font-bold">{money0(val)}</span>
      </div>
    );
  }
  if (r.kind === "calc") {
    return (
      <div className="flex items-center justify-between px-3 py-2 bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-200">
        <span className="uppercase text-xs font-extrabold tracking-wide">{r.label}</span>
        <span className="tabular-nums font-extrabold">{money0(val)}</span>
      </div>
    );
  }
  if (r.kind === "saldohd") {
    return (
      <div className="flex items-center justify-between px-3 py-2 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300">
        <span className="uppercase text-xs font-bold tracking-wide">{r.label}</span>
        <span className={`tabular-nums font-bold ${val < 0 ? "text-expense dark:text-rose-400" : ""}`}>{money0(val)}</span>
      </div>
    );
  }
  if (r.kind === "saldo") {
    return (
      <div className="flex items-center justify-between px-3 py-2 pl-6">
        <span className="text-sm text-muted-foreground">{r.label}</span>
        <span className={`tabular-nums font-medium ${val < 0 ? "text-expense" : ""}`}>{money0(val)}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between px-3 py-2 pl-6">
      <span className="text-sm text-muted-foreground">{r.code && <span className="font-mono text-xs mr-1.5">{r.code}</span>}{r.label}</span>
      <span className={`tabular-nums font-semibold ${val < 0 ? "text-expense" : ""}`}>{val === 0 ? "—" : money0(val)}</span>
    </div>
  );
}

// Grupos de despesa entram negativos na tabela (dinheiro que saiu).
const GRUPOS_ENTRADA: GrupoDre[] = ["receita", "financeiro_receita", "nao_operacional_entrada"];

function buildModel(data: EmpresaFluxoCaixaMensal, empresaData: any) {
  const segmento = empresaData?.segmento || "servico";
  const custoLabel = segmento.includes("comercio") ? "CMV — Custo da Mercadoria Vendida" : "CSP — Custo dos Serviços Prestados";
  const rows: Row[] = [];
  const contas = data.contas || [];
  if (contas.length === 0) return { rows, kpis: [] as any[] };

  const porConta = new Map<number, number[]>();
  for (const a of data.agregado || []) {
    if (!porConta.has(a.conta_id)) porConta.set(a.conta_id, zeros());
    porConta.get(a.conta_id)![a.mes - 1] = a.total;
  }
  const val = (c: EmpresaConta) => porConta.get(c.id) ?? zeros();
  // Mesma regra da DRE gerencial e do dashboard (shared/indicadores-financeiros).
  const doGrupo = (gs: GrupoDre[]) => contas.filter((c) => gs.includes(grupoDreDaConta(c as any)));
  const totalOf = (cs: EmpresaConta[]) => addArr(...cs.map(val), zeros());

  // Somas positivas por grupo e mês → indicadores do mês.
  const somasMes = Array.from({ length: 12 }, () => somasVazias());
  for (const c of contas) {
    const g = grupoDreDaConta(c as any);
    val(c).forEach((v, m) => { somasMes[m][g] += GRUPOS_ENTRADA.includes(g) ? v : -v; });
  }
  const indMes = somasMes.map((s) => calcularIndicadores(s));

  const onlyMov = (cs: EmpresaConta[]) => cs.filter((c) => sumArr(val(c)) !== 0);
  for (const e of ESTRUTURA_DRE) {
    if (e.tipo === "total") {
      rows.push({ kind: "calc", label: e.titulo.replace("(=)", "="), values: indMes.map((i) => Number(i[e.chave] ?? 0)) });
      continue;
    }
    const cs = onlyMov(doGrupo(e.grupos));
    if (!cs.length && e.grupos[0] !== "receita") continue;
    const titulo = e.grupos[0] === "cmv" ? `(–) ${custoLabel}` : e.titulo.replace("(−)", "(–)");
    rows.push({ kind: "grupo", label: titulo, values: totalOf(cs), receita: e.grupos[0] === "receita" });
    for (const c of cs) rows.push({ kind: "conta", label: c.nome, code: c.codigo, values: val(c) });
  }

  // ---- Saldo do mês: o que sobra (ou falta) e passa para o mês seguinte ----
  // Vale mesmo sem conta bancária cadastrada — antes o saldo só aparecia dentro
  // do bloco de Disponibilidades, então quem não tinha conta ficava sem saldo.
  const contasBanc = data.contasBancarias || [];
  // Abertura de janeiro: saldo declarado das contas + tudo que já entrou/saiu
  // de caixa antes deste ano (inclusive lançamentos sem conta bancária).
  const aberturaAno =
    contasBanc.reduce((t, cb) => t + (cb.saldo_inicial || 0), 0)
    + (data.movimentoAntesAno || 0);

  // Movimento do mês somando TODAS as contas, não a linha de resultado: se uma
  // conta tiver grupo_gerencial fora dos seis previstos, ela some das linhas
  // calculadas — mas o dinheiro dela entrou/saiu do caixa do mesmo jeito.
  const movimentoMes = addArr(...contas.map(val), zeros());

  const saldoIni = zeros();
  const saldoFim = zeros();
  for (let m = 0; m < 12; m++) {
    saldoIni[m] = m === 0 ? aberturaAno : saldoFim[m - 1];
    saldoFim[m] = saldoIni[m] + movimentoMes[m];
  }
  rows.push({ kind: "saldohd", label: "Saldo Inicial do Mês", values: saldoIni, totalCol: "abertura" });
  rows.push({ kind: "saldohd", label: "= Saldo Final do Mês (passa p/ o próximo)", values: saldoFim, totalCol: "fechamento" });

  // ---- Disponibilidades: saldo inicial/final por conta bancária ----
  if (contasBanc.length > 0) {
    const movBy = new Map<number, number[]>();
    for (const m of data.movContas || []) {
      if (!movBy.has(m.conta_bancaria_id)) movBy.set(m.conta_bancaria_id, zeros());
      movBy.get(m.conta_bancaria_id)![m.mes - 1] = m.total;
    }
    const antesBy = new Map<number, number>();
    for (const a of data.saldoAntesAno || []) antesBy.set(a.conta_bancaria_id, a.total);

    const iniByConta = new Map<number, number[]>();
    const fimByConta = new Map<number, number[]>();
    for (const cb of contasBanc) {
      const mov = movBy.get(cb.id) ?? zeros();
      const aberturaJan = (cb.saldo_inicial || 0) + (antesBy.get(cb.id) ?? 0);
      const ini = zeros(); const fim = zeros();
      for (let m = 0; m < 12; m++) { ini[m] = m === 0 ? aberturaJan : fim[m - 1]; fim[m] = ini[m] + mov[m]; }
      iniByConta.set(cb.id, ini); fimByConta.set(cb.id, fim);
    }
    const totIni = addArr(...contasBanc.map((cb) => iniByConta.get(cb.id)!), zeros());
    const totFim = addArr(...contasBanc.map((cb) => fimByConta.get(cb.id)!), zeros());
    rows.push({ kind: "saldohd", label: "Saldo Inicial — Disponibilidades", values: totIni, totalCol: "abertura" });
    contasBanc.forEach((cb) => rows.push({ kind: "saldo", label: cb.banco, values: iniByConta.get(cb.id)!, totalCol: "abertura" }));
    rows.push({ kind: "saldohd", label: "Saldo Final — Disponibilidades", values: totFim, totalCol: "fechamento" });
    contasBanc.forEach((cb) => rows.push({ kind: "saldo", label: cb.banco, values: fimByConta.get(cb.id)!, totalCol: "fechamento" }));
  }

  // KPIs anuais — calcularIndicadores é o mesmo usado na DRE e no dashboard.
  const somasAno = somasVazias();
  for (const sm of somasMes) for (const g of Object.keys(sm) as GrupoDre[]) somasAno[g] += sm[g];
  const ind = calcularIndicadores(somasAno);
  const pct = (n: number | null) => (n === null ? "—" : `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`);
  const kpis: { label: string; value: string; tone?: "pos" | "neg"; hint?: string }[] = [];
  kpis.push({ label: "Faturamento", value: money0(ind.receita_bruta), hint: "ano" });
  if (ind.cmv > 0) {
    kpis.push({ label: "Margem Bruta", value: pct(ind.margem_bruta_pct), tone: "pos", hint: "lucro bruto ÷ receita líquida" });
    kpis.push({ label: "Markup", value: pct(ind.markup_pct), hint: ind.markup_multiplicador ? `${ind.markup_multiplicador.toLocaleString("pt-BR")}× o custo` : "sobre o custo" });
  }
  kpis.push({ label: "Margem Contrib.", value: pct(ind.margem_contribuicao_pct), tone: "pos", hint: money0(ind.margem_contribuicao) });
  kpis.push({ label: "Ponto Equilíbrio", value: ind.ponto_equilibrio === null ? "—" : money0(ind.ponto_equilibrio), hint: ind.ponto_equilibrio_atingido_pct ? `${pct(ind.ponto_equilibrio_atingido_pct)} atingido` : "receita p/ zerar" });
  kpis.push({ label: "Lucro Líquido", value: money0(ind.lucro_liquido), tone: ind.lucro_liquido >= 0 ? "pos" : "neg", hint: pct(ind.margem_liquida_pct) });
  const saldoFinalAno = saldoFim[11];
  kpis.push({
    label: "Saldo Final",
    value: money0(saldoFinalAno),
    tone: saldoFinalAno >= 0 ? "pos" : "neg",
    hint: `dez/${data.ano}`,
  });
  return { rows, kpis };
}
