import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { HandCoins } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Resposta de GET /api/empresas/:id/reembolsos-vinculados/resumo. */
export interface ResumoReembolsosVinculados {
  ativo: boolean;
  credor_nome?: string;
  pagar?: { qtd: number; total: number; vencido: number; qtd_vencido: number };
  receber_credor?: { qtd: number; total: number };
  confere?: boolean;
}

const brl = (v: number | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Só responde ativo para quem é devedor de um reembolso vinculado; os demais não veem nada. */
export function useResumoReembolsosVinculados(empresaId: number | null | undefined) {
  const url = `/api/empresas/${empresaId}/reembolsos-vinculados/resumo`;
  const { data } = useQuery<ResumoReembolsosVinculados>({
    queryKey: [url],
    enabled: !!empresaId,
    queryFn: async () => {
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) return { ativo: false };
      return res.json();
    },
    staleTime: 60_000,
  });
  return data?.ativo ? data : null;
}

export const LINK_REEMBOLSOS_VINCULADOS = "/p/contas-pagar?status=aberto&reembolso_vinculado=1";

/** Card do painel: total a pagar dos reembolsos ao credor, conferido com o A Receber dele. */
export function CardReembolsosVinculados({ empresaId, className }: { empresaId: number; className?: string }) {
  const r = useResumoReembolsosVinculados(empresaId);
  if (!r || !r.pagar) return null;
  return (
    <Link href={LINK_REEMBOLSOS_VINCULADOS} className={cn("block", className)}>
      <Card className="h-full transition-colors hover:bg-muted/40">
        <CardContent className="flex items-start gap-3 p-4">
          <HandCoins className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium text-muted-foreground">Reembolsos a pagar a {r.credor_nome}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{brl(r.pagar.total)}</div>
            <div className="text-xs text-muted-foreground">
              {r.pagar.qtd} lançamento(s)
              {r.pagar.vencido > 0 ? ` · ${brl(r.pagar.vencido)} vencido` : ""}
            </div>
            <div className={cn("mt-1 text-[11px]", r.confere ? "text-emerald-700 dark:text-emerald-400" : "text-amber-700 dark:text-amber-400")}>
              {r.confere
                ? `Confere com o A Receber de ${r.credor_nome}`
                : `A Receber de ${r.credor_nome}: ${brl(r.receber_credor?.total)} (${r.receber_credor?.qtd ?? 0}). Sincroniza a cada 2 min.`}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
