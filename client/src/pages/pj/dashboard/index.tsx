import { useState } from "react";
import { StatCard } from "@/components/shared/StatCard";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, DollarSign, Target } from "lucide-react";
import type { EmpresaResumo } from "@shared/schema";
import PeriodoSelector from "@/components/shared/PeriodoSelector";
import { Periodo, rangeDoPeriodo, rotuloPeriodo } from "@/lib/period";

/**
 * PJ Dashboard — visão de gestão financeira (Yampa-like).
 * Cards: Entradas, Saídas, Margem de Contribuição, Lucro/Prejuízo.
 * Busca /api/empresas/:id/dashboard/resumo.
 */
const dataBR = (iso: string) => iso.split("-").reverse().join("/");

const OPCOES: Periodo[] = [
  "current_month",
  "last_month",
  "next_month",
  "current_quarter",
  "current_year",
  "custom",
];

export default function PjDashboard({ empresaId }: { empresaId: number }) {
  const [periodo, setPeriodo] = useState<Periodo>("current_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const range = rangeDoPeriodo(periodo, customFrom, customTo);
  const periodoPronto = periodo !== "custom" || Boolean(range.de && range.ate);
  const periodoLabel = rotuloPeriodo(periodo, range.de, range.ate);

  const params = new URLSearchParams();
  if (range.de) params.set("de", range.de);
  if (range.ate) params.set("ate", range.ate);
  const qs = params.toString();
  const url = `/api/empresas/${empresaId}/dashboard/resumo${qs ? `?${qs}` : ""}`;

  const { data: resumo, isLoading } = useQuery<EmpresaResumo>({
    queryKey: [url],
    enabled: !!empresaId && periodoPronto,
  });

  const filtros = (
    <PeriodoSelector
      periodo={periodo}
      onPeriodoChange={setPeriodo}
      customFrom={customFrom}
      customTo={customTo}
      onCustomFromChange={setCustomFrom}
      onCustomToChange={setCustomTo}
      opcoes={OPCOES}
    />
  );

  if (isLoading || !periodoPronto) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard Empresarial</h1>
        {filtros}
        {periodoPronto ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-32 w-full rounded-lg" />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground">Informe as datas inicial e final.</p>
        )}
      </div>
    );
  }

  const lucro = resumo?.lucro_prejuizo ?? 0;
  const cards = [
    { title: "Entradas", value: resumo?.entradas ?? 0, icon: TrendingUp, tone: "income" as const },
    { title: "Saídas", value: resumo?.total_saidas ?? 0, icon: TrendingDown, tone: "expense" as const },
    {
      title: "Margem de Contribuição",
      value: resumo?.margem_contribuicao ?? 0,
      pct: resumo?.margem_contribuicao_pct,
      icon: Target,
      tone: "primary" as const,
    },
    {
      title: "Lucro / Prejuízo",
      value: lucro,
      pct: resumo?.lucro_prejuizo_pct,
      icon: DollarSign,
      tone: lucro >= 0 ? ("income" as const) : ("expense" as const),
      valueClassName: lucro >= 0 ? "text-income" : "text-expense",
    },
    {
      title: "Reembolsos à pessoa",
      value: resumo?.reembolsos_pessoais_pendentes ?? 0,
      icon: DollarSign,
      tone: "warning" as const,
    },
  ];

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard Empresarial</h1>
        <p className="text-sm text-muted-foreground capitalize">{periodoLabel}</p>
      </div>

      {filtros}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-5">
        {cards.map((card) => (
          <StatCard
            key={card.title}
            label={card.title}
            icon={card.icon}
            tone={card.tone}
            value={fmt(card.value)}
            valueClassName={"valueClassName" in card ? card.valueClassName : undefined}
            hint={card.pct !== undefined && card.pct !== null ? `${card.pct.toFixed(1)}% das entradas` : undefined}
          />
        ))}
      </div>

      {/* Resumo do período */}
      {resumo && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Detalhamento do período</CardTitle>
            <p className="text-sm text-muted-foreground">
              {dataBR(resumo.periodo.de)} a {dataBR(resumo.periodo.ate)} — {resumo.total_transacoes} transações
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm tabular-nums">
              <div className="flex justify-between">
                <span>(+) Receita Bruta</span>
                <span className="font-medium text-income">{fmt(resumo.entradas)}</span>
              </div>
              <div className="flex justify-between">
                <span>(−) Despesas Variáveis</span>
                <span className="font-medium text-expense">{fmt(resumo.saidas_variaveis)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 font-semibold">
                <span>(=) Margem de Contribuição</span>
                <span>{fmt(resumo.margem_contribuicao)}</span>
              </div>
              <div className="flex justify-between">
                <span>(−) Despesas Fixas</span>
                <span className="font-medium text-expense">{fmt(resumo.saidas_fixas)}</span>
              </div>
              <div className="flex justify-between">
                <span>(−) Outras Despesas</span>
                <span className="font-medium text-expense">{fmt(resumo.saidas_outras)}</span>
              </div>
              <div className="flex justify-between border-t pt-2 text-base font-semibold">
                <span>(=) Lucro / Prejuízo</span>
                <span className={resumo.lucro_prejuizo >= 0 ? "text-income" : "text-expense"}>
                  {fmt(resumo.lucro_prejuizo)}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
