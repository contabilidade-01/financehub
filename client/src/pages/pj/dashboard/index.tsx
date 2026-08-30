import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, TrendingDown, DollarSign, Target } from "lucide-react";
import type { EmpresaResumo } from "@shared/schema";

/**
 * PJ Dashboard — visão de gestão financeira (Yampa-like).
 * Cards: Entradas, Saídas, Margem de Contribuição, Lucro/Prejuízo.
 * Busca /api/empresas/:id/dashboard/resumo.
 */
export default function PjDashboard({ empresaId }: { empresaId: number }) {
  const { data: resumo, isLoading } = useQuery<EmpresaResumo>({
    queryKey: [`/api/empresas/${empresaId}/dashboard/resumo`],
    enabled: !!empresaId,
  });

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-4">
        {[1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-32 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  const cards = [
    {
      title: "Entradas",
      value: resumo?.entradas ?? 0,
      icon: TrendingUp,
      color: "text-emerald-500",
      bg: "bg-emerald-50 dark:bg-emerald-950/20",
    },
    {
      title: "Saídas",
      value: resumo?.total_saidas ?? 0,
      icon: TrendingDown,
      color: "text-rose-500",
      bg: "bg-rose-50 dark:bg-rose-950/20",
    },
    {
      title: "Margem de Contribuição",
      value: resumo?.margem_contribuicao ?? 0,
      pct: resumo?.margem_contribuicao_pct,
      icon: Target,
      color: "text-blue-500",
      bg: "bg-blue-50 dark:bg-blue-950/20",
    },
    {
      title: "Lucro / Prejuízo",
      value: resumo?.lucro_prejuizo ?? 0,
      pct: resumo?.lucro_prejuizo_pct,
      icon: DollarSign,
      color: (resumo?.lucro_prejuizo ?? 0) >= 0 ? "text-emerald-600" : "text-rose-600",
      bg: (resumo?.lucro_prejuizo ?? 0) >= 0 ? "bg-emerald-50 dark:bg-emerald-950/20" : "bg-rose-50 dark:bg-rose-950/20",
    },
    {
      title: "Reembolsos à pessoa",
      value: resumo?.reembolsos_pessoais_pendentes ?? 0,
      icon: DollarSign,
      color: "text-amber-600",
      bg: "bg-amber-50 dark:bg-amber-950/20",
    },
  ];

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6 p-4">
      <h1 className="text-2xl font-bold">Dashboard Empresarial</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {cards.map((card) => (
          <Card key={card.title} className={card.bg}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${card.color}`}>
                {fmt(card.value)}
              </div>
              {card.pct !== undefined && card.pct !== null && (
                <p className="text-xs text-muted-foreground mt-1">
                  {card.pct.toFixed(1)}% das entradas
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Resumo do período */}
      {resumo && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Detalhamento do período</CardTitle>
            <p className="text-sm text-muted-foreground">
              {resumo.periodo.de} a {resumo.periodo.ate} — {resumo.total_transacoes} transações
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span>(+) Receita Bruta</span>
                <span className="font-medium text-emerald-600">{fmt(resumo.entradas)}</span>
              </div>
              <div className="flex justify-between">
                <span>(−) Despesas Variáveis</span>
                <span className="font-medium text-amber-600">{fmt(resumo.saidas_variaveis)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 font-bold">
                <span>(=) Margem de Contribuição</span>
                <span className="text-blue-600">{fmt(resumo.margem_contribuicao)}</span>
              </div>
              <div className="flex justify-between">
                <span>(−) Despesas Fixas</span>
                <span className="font-medium text-rose-500">{fmt(resumo.saidas_fixas)}</span>
              </div>
              <div className="flex justify-between">
                <span>(−) Outras Despesas</span>
                <span className="font-medium text-rose-400">{fmt(resumo.saidas_outras)}</span>
              </div>
              <div className="flex justify-between border-t pt-1 font-bold text-lg">
                <span>(=) Lucro / Prejuízo</span>
                <span className={resumo.lucro_prejuizo >= 0 ? "text-emerald-600" : "text-rose-600"}>
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
