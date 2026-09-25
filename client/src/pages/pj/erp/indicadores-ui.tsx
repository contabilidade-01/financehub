import { Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { Indicadores } from "@shared/indicadores-financeiros";
import { brl } from "./comum";

export const pctBr = (n: number | null | undefined, casas = 1) =>
  n === null || n === undefined ? "—" : `${n.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;

export const variacao = (atual: number, anterior: number | null | undefined): number | null =>
  anterior === null || anterior === undefined || anterior === 0 ? null : ((atual - anterior) / Math.abs(anterior)) * 100;

interface Tile {
  rotulo: string;
  valor: string;
  detalhe?: string;
  ajuda: string;
  /** Valor com sinal de resultado (verde/vermelho no texto, com o sinal visível). */
  resultado?: number;
  delta?: number | null;
  /** Para despesas, subir é ruim. */
  deltaInvertido?: boolean;
}

function TileIndicador({ t }: { t: Tile }) {
  const cor = t.resultado === undefined ? "" : t.resultado >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400";
  const bom = t.delta === null || t.delta === undefined ? null : t.deltaInvertido ? t.delta <= 0 : t.delta >= 0;
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
          {t.rotulo}
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" className="text-muted-foreground/70 hover:text-foreground" aria-label={`O que é ${t.rotulo}`}>
                <Info className="h-3.5 w-3.5" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-64 text-xs">{t.ajuda}</TooltipContent>
          </Tooltip>
        </div>
        <div className={cn("mt-1 text-xl font-semibold", cor)}>{t.valor}</div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          {t.detalhe && <span>{t.detalhe}</span>}
          {t.delta !== null && t.delta !== undefined && (
            <span className={cn(bom ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>
              {t.delta >= 0 ? "▲" : "▼"} {pctBr(Math.abs(t.delta), 0)} vs. período anterior
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Os indicadores que respondem "a empresa está saudável?": receita, markup,
 * margem de contribuição, ponto de equilíbrio e lucro líquido.
 */
export function PainelIndicadores({ ind, anterior, className }: { ind: Indicadores; anterior?: Indicadores | null; className?: string }) {
  const tiles: Tile[] = [
    {
      rotulo: "Receita bruta",
      valor: brl(ind.receita_bruta),
      detalhe: ind.deducoes ? `Líquida ${brl(ind.receita_liquida)}` : undefined,
      ajuda: "Tudo o que a empresa vendeu no período, antes de impostos sobre venda, devoluções e taxas.",
      delta: variacao(ind.receita_bruta, anterior?.receita_bruta),
    },
    {
      rotulo: "Markup",
      valor: ind.markup_multiplicador ? `${ind.markup_multiplicador.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}×` : "—",
      detalhe: ind.markup_pct !== null ? `${pctBr(ind.markup_pct, 0)} sobre o custo` : "Marque as contas de CMV/CSP",
      ajuda: "Quantas vezes o preço de venda cobre o custo da mercadoria ou do serviço (receita ÷ CMV/CSP).",
    },
    {
      rotulo: "Margem de contribuição",
      valor: pctBr(ind.margem_contribuicao_pct),
      detalhe: brl(ind.margem_contribuicao),
      ajuda: "O que sobra de cada venda depois dos custos que crescem com ela (impostos, CMV/CSP, comissões, fretes). É o que paga as despesas fixas.",
      delta: variacao(ind.margem_contribuicao, anterior?.margem_contribuicao),
    },
    {
      rotulo: "Ponto de equilíbrio",
      valor: ind.ponto_equilibrio === null ? "—" : brl(ind.ponto_equilibrio),
      detalhe: ind.ponto_equilibrio_atingido_pct !== null ? `${pctBr(ind.ponto_equilibrio_atingido_pct, 0)} atingido` : ind.ponto_equilibrio === null ? "Margem de contribuição negativa" : "Sem despesas fixas",
      ajuda: "Quanto a empresa precisa vender no período para pagar todas as despesas fixas e empatar (fixas ÷ margem de contribuição %).",
    },
    {
      rotulo: "Lucro líquido",
      valor: brl(ind.lucro_liquido),
      detalhe: ind.margem_liquida_pct !== null ? `${pctBr(ind.margem_liquida_pct)} da receita` : undefined,
      ajuda: "Resultado depois de custos, despesas fixas, resultado financeiro e outras despesas. Investimentos e retiradas não entram (veja Geração de caixa).",
      resultado: ind.lucro_liquido,
      delta: variacao(ind.lucro_liquido, anterior?.lucro_liquido),
    },
  ];
  return (
    <div className={cn("grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5", className)}>
      {tiles.map((t) => <TileIndicador key={t.rotulo} t={t} />)}
    </div>
  );
}
