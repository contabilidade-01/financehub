import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useIsMobile } from "@/hooks/use-mobile";
import type { EmpresaFluxoCaixaMensal, EmpresaConta } from "@shared/schema";

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

type Row = { kind: "grupo" | "conta" | "calc" | "saldohd" | "saldo"; label: string; code?: string; values: number[]; receita?: boolean };

export default function PjFluxoCaixa({ empresaId }: { empresaId: number }) {
  const isMobile = useIsMobile();
  const anoAtual = new Date().getFullYear();
  const [ano, setAno] = useState(anoAtual);
  const [mes, setMes] = useState(new Date().getMonth());

  const { data, isLoading } = useQuery<EmpresaFluxoCaixaMensal>({
    queryKey: [`/api/empresas/${empresaId}/relatorios/fluxo-caixa`, ano],
    queryFn: () => fetch(`/api/empresas/${empresaId}/relatorios/fluxo-caixa?ano=${ano}`, { credentials: "include" }).then((r) => r.json()),
    enabled: !!empresaId,
  });

  const model = useMemo(() => (data ? buildModel(data) : null), [data]);

  if (isLoading || !model) {
    return <div className="p-4"><Skeleton className="h-[480px] w-full" /></div>;
  }
  if (model.rows.length === 0) {
    return (
      <div className="p-4">
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          Sem lançamentos em {ano}. Registre transações PJ para ver o fluxo de caixa.
        </CardContent></Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Fluxo de Caixa Gerencial</h1>
          <p className="text-sm text-muted-foreground">Contas nas linhas, meses nas colunas · linhas azuis são calculadas.</p>
        </div>
        <Select value={String(ano)} onValueChange={(v) => setAno(Number(v))}>
          <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {[anoAtual + 1, anoAtual, anoAtual - 1, anoAtual - 2].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {model.kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="p-3">
              <div className="text-[10.5px] uppercase tracking-wide text-muted-foreground font-semibold">{k.label}</div>
              <div className={`text-lg font-bold tabular-nums ${k.tone === "pos" ? "text-emerald-600" : k.tone === "neg" ? "text-rose-500" : ""}`}>{k.value}</div>
              {k.hint && <div className="text-[10.5px] text-muted-foreground">{k.hint}</div>}
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
            <table className="w-full text-[12.5px] border-collapse min-w-[900px]">
              <thead>
                <tr className="bg-slate-800 text-slate-50">
                  <th className="text-left sticky left-0 z-10 bg-slate-800 px-3 py-2 min-w-[250px]">Conta</th>
                  {MESES.map((m) => <th key={m} className="px-2.5 py-2 text-right font-semibold">{m}</th>)}
                  <th className="px-2.5 py-2 text-right font-semibold">Total</th>
                </tr>
              </thead>
              <tbody>{model.rows.map((r, i) => <ReportRow key={i} r={r} />)}</tbody>
            </table>
          </CardContent>
        </Card>
      )}
      <p className="text-xs text-muted-foreground">Baseado nas transações PJ do ano. Margem de Contribuição = Receita − Despesas Variáveis.</p>
    </div>
  );
}

function ReportRow({ r }: { r: Row }) {
  const total = sumArr(r.values);
  const cell = (v: number, i: number) => <td key={i} className={`px-2.5 py-1.5 text-right tabular-nums ${v < 0 ? "text-rose-500" : ""}`}>{v === 0 ? "—" : money0(v)}</td>;
  if (r.kind === "grupo") {
    return (
      <tr className={`${r.receita ? "bg-emerald-600" : "bg-slate-700"} text-slate-50 font-bold`}>
        <td className="text-left sticky left-0 z-10 px-3 py-1.5 uppercase text-[11px] tracking-wide" style={{ background: "inherit" }}>{r.label}</td>
        {r.values.map(cell)}
        <td className="px-2.5 py-1.5 text-right tabular-nums">{money0(total)}</td>
      </tr>
    );
  }
  if (r.kind === "calc") {
    return (
      <tr className="bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-200 font-extrabold border-y border-blue-200 dark:border-blue-800">
        <td className="text-left sticky left-0 z-10 bg-blue-50 dark:bg-blue-950/50 px-3 py-1.5 uppercase text-[11px] tracking-wide">{r.label}</td>
        {r.values.map((v, i) => <td key={i} className="px-2.5 py-1.5 text-right tabular-nums">{money0(v)}</td>)}
        <td className="px-2.5 py-1.5 text-right tabular-nums">{money0(total)}</td>
      </tr>
    );
  }
  if (r.kind === "saldohd") {
    return (
      <tr className="bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 font-bold">
        <td className="text-left sticky left-0 z-10 bg-amber-50 dark:bg-amber-950/40 px-3 py-1.5 uppercase text-[11px] tracking-wide">{r.label}</td>
        {r.values.map((v, i) => <td key={i} className="px-2.5 py-1.5 text-right tabular-nums">{money0(v)}</td>)}
        <td className="px-2.5 py-1.5 text-right tabular-nums">{money0(total)}</td>
      </tr>
    );
  }
  if (r.kind === "saldo") {
    return (
      <tr className="border-b border-border/40">
        <td className="text-left sticky left-0 z-10 px-3 py-1.5 bg-background pl-6 text-muted-foreground">{r.label}</td>
        {r.values.map((v, i) => <td key={i} className={`px-2.5 py-1.5 text-right tabular-nums ${v < 0 ? "text-rose-500" : ""}`}>{money0(v)}</td>)}
        <td className="px-2.5 py-1.5 text-right tabular-nums font-medium">{money0(total)}</td>
      </tr>
    );
  }
  return (
    <tr className="border-b border-border/40 hover:bg-muted/60">
      <td className="text-left sticky left-0 z-10 px-3 py-1.5 bg-background pl-8">
        {r.code && <span className="font-mono text-muted-foreground mr-2 text-[11px]">{r.code}</span>}{r.label}
      </td>
      {r.values.map(cell)}
      <td className="px-2.5 py-1.5 text-right tabular-nums font-medium">{money0(total)}</td>
    </tr>
  );
}

function MobileRow({ r, mes }: { r: Row; mes: number }) {
  const val = mes >= 12 ? sumArr(r.values) : r.values[mes];
  if (r.kind === "grupo") {
    return (
      <div className={`flex items-center justify-between px-3 py-2 ${r.receita ? "bg-emerald-600" : "bg-slate-700"} text-slate-50`}>
        <span className="uppercase text-[11px] font-bold tracking-wide">{r.label}</span>
        <span className="tabular-nums font-bold">{money0(val)}</span>
      </div>
    );
  }
  if (r.kind === "calc") {
    return (
      <div className="flex items-center justify-between px-3 py-2 bg-blue-50 dark:bg-blue-950/50 text-blue-800 dark:text-blue-200">
        <span className="uppercase text-[11px] font-extrabold tracking-wide">{r.label}</span>
        <span className="tabular-nums font-extrabold">{money0(val)}</span>
      </div>
    );
  }
  if (r.kind === "saldohd") {
    return (
      <div className="flex items-center justify-between px-3 py-2 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300">
        <span className="uppercase text-[11px] font-bold tracking-wide">{r.label}</span>
        <span className="tabular-nums font-bold">{money0(val)}</span>
      </div>
    );
  }
  if (r.kind === "saldo") {
    return (
      <div className="flex items-center justify-between px-3 py-2 pl-6">
        <span className="text-sm text-muted-foreground">{r.label}</span>
        <span className={`tabular-nums font-medium ${val < 0 ? "text-rose-500" : ""}`}>{money0(val)}</span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between px-3 py-2 pl-6">
      <span className="text-sm text-muted-foreground">{r.code && <span className="font-mono text-xs mr-1.5">{r.code}</span>}{r.label}</span>
      <span className={`tabular-nums font-semibold ${val < 0 ? "text-rose-500" : ""}`}>{val === 0 ? "—" : money0(val)}</span>
    </div>
  );
}

// Deriva o grupo gerencial quando a conta não tem grupo_gerencial preenchido.
function derivarGrupo(c: EmpresaConta): string {
  const g = (c.grupo_gerencial || "").toLowerCase();
  if (g) return g;
  if (c.tipo === "Receita") return "receita";
  const cl = (c.classificacao || "").toUpperCase();
  if (cl === "VARIAVEL") return "custo_variavel";
  if (cl === "FIXA") return "despesa_fixa";
  return "outras";
}
const ehCmv = (c: EmpresaConta) => (c as any).is_cmv === true || /cmv|mercadoria vendida/i.test(c.nome || "");

function buildModel(data: EmpresaFluxoCaixaMensal) {
  const rows: Row[] = [];
  const contas = data.contas || [];
  if (contas.length === 0) return { rows, kpis: [] as any[] };

  const porConta = new Map<number, number[]>();
  for (const a of data.agregado || []) {
    if (!porConta.has(a.conta_id)) porConta.set(a.conta_id, zeros());
    porConta.get(a.conta_id)![a.mes - 1] = a.total;
  }
  const val = (c: EmpresaConta) => porConta.get(c.id) ?? zeros();
  const grupo = (nome: string) => contas.filter((c) => derivarGrupo(c) === nome);

  const receitaContas = grupo("receita");
  const cmvContas = contas.filter((c) => derivarGrupo(c) === "custo_variavel" && ehCmv(c));
  const varContas = contas.filter((c) => derivarGrupo(c) === "custo_variavel" && !ehCmv(c));
  const fixaContas = grupo("despesa_fixa");
  const investContas = grupo("investimento");
  const naoOpContas = grupo("nao_operacional");
  const outraContas = grupo("outras");

  const totalOf = (cs: EmpresaConta[]) => addArr(...cs.map(val), zeros());
  const receita = totalOf(receitaContas);
  const cmv = totalOf(cmvContas);          // negativo
  const variaveis = totalOf(varContas);    // negativo
  const fixas = totalOf(fixaContas);
  const invest = totalOf(investContas);
  const naoOp = totalOf(naoOpContas);
  const outras = totalOf(outraContas);

  const margem = addArr(receita, cmv, variaveis);
  const lucroAntesInvest = addArr(margem, fixas, outras);
  const lucroOperacional = addArr(lucroAntesInvest, invest);
  const resultado = addArr(lucroOperacional, naoOp);

  const temInvest = investContas.length > 0;
  const temNaoOp = naoOpContas.length > 0;
  const temCmv = cmvContas.length > 0;

  const onlyMov = (cs: EmpresaConta[]) => cs.filter((c) => sumArr(val(c)) !== 0);
  const pushGrupo = (label: string, total: number[], cs: EmpresaConta[], receitaFlag = false) => {
    rows.push({ kind: "grupo", label, values: total, receita: receitaFlag });
    for (const c of onlyMov(cs)) rows.push({ kind: "conta", label: c.nome, code: c.codigo, values: val(c) });
  };

  pushGrupo("Receita Bruta", receita, receitaContas, true);
  if (temCmv) pushGrupo("(–) CMV — Custo da Mercadoria Vendida", cmv, cmvContas);
  pushGrupo("(–) Custos / Despesas Variáveis", variaveis, varContas);
  rows.push({ kind: "calc", label: "= Margem de Contribuição", values: margem });
  pushGrupo("(–) Despesas Fixas", fixas, fixaContas);
  if (outraContas.length) pushGrupo("(–) Outras Despesas", outras, outraContas);
  if (temInvest || temNaoOp) rows.push({ kind: "calc", label: "= Lucro Operacional antes dos Investimentos", values: lucroAntesInvest });
  if (temInvest) { pushGrupo("(–) Investimentos", invest, investContas); rows.push({ kind: "calc", label: "= Lucro Operacional", values: lucroOperacional }); }
  if (temNaoOp) { pushGrupo("Entradas e Saídas Não Operacionais", naoOp, naoOpContas); }
  rows.push({ kind: "calc", label: temNaoOp ? "= Resultado Líquido" : "= Lucro / Prejuízo", values: resultado });

  // ---- Disponibilidades: saldo inicial/final por conta bancária ----
  const contasBanc = data.contasBancarias || [];
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
    rows.push({ kind: "saldohd", label: "Saldo Inicial — Disponibilidades", values: totIni });
    contasBanc.forEach((cb) => rows.push({ kind: "saldo", label: cb.banco, values: iniByConta.get(cb.id)! }));
    rows.push({ kind: "saldohd", label: "Saldo Final — Disponibilidades", values: totFim });
    contasBanc.forEach((cb) => rows.push({ kind: "saldo", label: cb.banco, values: fimByConta.get(cb.id)! }));
  }

  // KPIs anuais
  const R = sumArr(receita), CMV = Math.abs(sumArr(cmv)), MC = sumArr(margem), RES = sumArr(resultado);
  const DF = Math.abs(sumArr(fixas));
  const idxMC = R ? MC / R : 0;
  const pe = idxMC > 0 ? DF / idxMC : 0;
  const pct = (n: number, d: number) => (d > 0 ? (n / d * 100).toFixed(1) + "%" : "—");
  const kpis: { label: string; value: string; tone?: "pos" | "neg"; hint?: string }[] = [];
  kpis.push({ label: "Faturamento", value: money0(R), hint: "ano" });
  if (temCmv) {
    kpis.push({ label: "Margem Bruta", value: R ? pct(R - CMV, R) : "—", tone: "pos", hint: "(Rec−CMV)/Rec" });
    kpis.push({ label: "Markup", value: CMV ? (((R - CMV) / CMV) * 100).toFixed(0) + "%" : "—", hint: "sobre o custo" });
  }
  kpis.push({ label: "Margem Contrib.", value: pct(MC, R), tone: "pos", hint: money0(MC) });
  kpis.push({ label: "Ponto Equilíbrio", value: money0(pe), hint: "p/ zerar" });
  kpis.push({ label: temNaoOp ? "Resultado Líq." : "Lucro / Prejuízo", value: money0(RES), tone: RES >= 0 ? "pos" : "neg", hint: pct(RES, R) });
  return { rows, kpis };
}
