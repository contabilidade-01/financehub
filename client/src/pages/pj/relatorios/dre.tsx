import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { EmpresaDRE } from "@shared/schema";

/**
 * Relatório DRE simplificada (Yampa-like):
 * (+) Receita Bruta
 * (−) Despesas Variáveis
 * (=) Margem de Contribuição
 * (−) Despesas Fixas
 * (−) Outras
 * (=) Lucro / Prejuízo
 */
export default function PjDRE({ empresaId }: { empresaId: number }) {
  const { data: dre, isLoading } = useQuery<EmpresaDRE>({
    queryKey: [`/api/empresas/${empresaId}/relatorios/dre`],
    enabled: !!empresaId,
  });

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </div>
    );
  }

  if (!dre) return null;

  const rows = [
    { label: "(+) Receita Bruta", value: dre.receita_bruta, color: "text-income", bold: false },
    { label: "(−) CMV / Despesas Variáveis", value: dre.despesas_variaveis, color: "text-amber-600", bold: false },
    { label: "(=) Margem de Contribuição", value: dre.margem_contribuicao, color: "text-blue-600", bold: true, pct: dre.margem_contribuicao_pct },
    { label: "(−) Despesas Fixas", value: dre.despesas_fixas, color: "text-expense", bold: false },
    { label: "(−) Outras Despesas", value: dre.outras_despesas, color: "text-expense", bold: false },
    { label: "(=) Lucro / Prejuízo", value: dre.lucro_prejuizo, color: dre.lucro_prejuizo >= 0 ? "text-income" : "text-expense", bold: true, pct: dre.lucro_prejuizo_pct },
  ];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">DRE Simplificada</h1>
      <p className="text-sm text-muted-foreground">
        Período: {dre.periodo.de} a {dre.periodo.ate}
      </p>

      <Card>
        <CardContent className="pt-6">
          <div className="space-y-3">
            {rows.map((row) => (
              <div
                key={row.label}
                className={`flex justify-between items-center ${row.bold ? "border-t pt-2 mt-2 font-bold text-base" : "text-sm"}`}
              >
                <span>{row.label}</span>
                <div className="text-right">
                  <span className={`${row.color} ${row.bold ? "text-lg" : ""}`}>
                    {fmt(row.value)}
                  </span>
                  {row.pct !== undefined && row.pct !== null && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({row.pct.toFixed(1)}%)
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
