import { useMemo } from "react";
import { ResponsiveContainer, Sankey, Tooltip } from "recharts";
import { useIsMobile } from "@/hooks/use-mobile";
import { brl } from "./comum";

export interface NoMapa {
  name: string;
  coluna: number;
  grupo?: string;
  conta_id?: number;
}
export interface Mapa {
  nodes: NoMapa[];
  links: { source: number; target: number; value: number }[];
  entradas: number;
  saidas: number;
  saldo: number;
}

/**
 * Papel de cada fluxo, não a identidade de cada grupo: entrada, saída, sobra,
 * falta. Os grupos se distinguem pelo rótulo escrito ao lado (nunca só pela cor).
 */
const COR = {
  entrada: "var(--viz-1)",
  saida: "var(--viz-2)",
  sobra: "var(--viz-3)",
  falta: "var(--viz-critico)",
  caixa: "hsl(var(--muted-foreground))",
};
const papel = (n?: NoMapa): keyof typeof COR =>
  !n ? "caixa" : n.grupo === "sobra" ? "sobra" : n.grupo === "falta" ? "falta" : n.coluna === 0 ? "entrada" : n.coluna === 1 ? "caixa" : "saida";

/** Mapa do dinheiro: de onde veio e para onde foi. Clicar num nó abre a conta no razão. */
export function MapaDinheiro({ mapa, onSelecionar }: { mapa: Mapa; onSelecionar?: (no: NoMapa) => void }) {
  const mobile = useIsMobile();
  const colunas = useMemo(() => {
    const c = [0, 0, 0, 0];
    for (const n of mapa.nodes) c[n.coluna]++;
    return Math.max(...c);
  }, [mapa.nodes]);

  if (!mapa.nodes.length) {
    return <p className="p-6 text-sm text-muted-foreground">Sem lançamentos no período.</p>;
  }
  if (mobile) return <MapaEmCascata mapa={mapa} onSelecionar={onSelecionar} />;

  const altura = Math.max(320, colunas * 44);
  return (
    <div className="w-full" role="img" aria-label={`Mapa do dinheiro: entraram ${brl(mapa.entradas)}, saíram ${brl(mapa.saidas)}.`}>
      <ResponsiveContainer width="100%" height={altura}>
        <Sankey
          data={{ nodes: mapa.nodes as any, links: mapa.links }}
          nodeWidth={10}
          nodePadding={18}
          iterations={48}
          margin={{ top: 8, right: 220, bottom: 8, left: 200 }}
          link={<LinkMapa nodes={mapa.nodes} />}
          node={<NoMapaSvg nodes={mapa.nodes} onSelecionar={onSelecionar} />}
        >
          <Tooltip
            content={({ payload }: any) => {
              // Nó: { name, value }; fluxo: { payload: { source, target, value } }.
              const item = payload?.[0];
              if (!item) return null;
              const fluxo = item.payload?.payload ?? item.payload;
              const titulo = fluxo?.source?.name && fluxo?.target?.name ? `${fluxo.source.name} → ${fluxo.target.name}` : item.name;
              const valor = Number(item.value ?? fluxo?.value ?? 0);
              const base = Math.max(mapa.entradas, mapa.saidas);
              return (
                <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                  <div className="font-medium text-popover-foreground">{titulo}</div>
                  <div className="tabular-nums text-muted-foreground">
                    {brl(valor)}{base ? ` · ${((valor / base) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do movimento` : ""}
                  </div>
                </div>
              );
            }}
          />
        </Sankey>
      </ResponsiveContainer>
    </div>
  );
}

function LinkMapa(props: any) {
  const { sourceX, targetX, sourceY, targetY, sourceControlX, targetControlX, linkWidth, payload, nodes } = props;
  const alvo: NoMapa | undefined = nodes[payload?.target?.index ?? -1] ?? payload?.target;
  const origem: NoMapa | undefined = nodes[payload?.source?.index ?? -1] ?? payload?.source;
  const cor = COR[papel(origem?.coluna === 0 ? origem : alvo)];
  return (
    <path
      d={`M${sourceX},${sourceY} C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}`}
      fill="none"
      stroke={cor}
      strokeOpacity={0.28}
      strokeWidth={Math.max(1, linkWidth)}
      className="transition-[stroke-opacity] hover:[stroke-opacity:0.5]"
    />
  );
}

function NoMapaSvg(props: any) {
  const { x, y, width, height, index, payload, nodes, onSelecionar } = props;
  const no: NoMapa = nodes[index] ?? payload;
  const cor = COR[papel(no)];
  const esquerda = no.coluna === 0;
  const clicavel = !!onSelecionar && (no.conta_id || (no.grupo && !["sobra", "falta"].includes(no.grupo)));
  return (
    <g
      onClick={clicavel ? () => onSelecionar(no) : undefined}
      style={{ cursor: clicavel ? "pointer" : "default" }}
    >
      <rect x={x} y={y} width={width} height={Math.max(2, height)} rx={2} fill={cor} />
      <text
        x={esquerda ? x - 8 : x + width + 8}
        y={y + height / 2}
        textAnchor={esquerda ? "end" : "start"}
        dominantBaseline="middle"
        className="fill-foreground text-[12px]"
      >
        {no.name.length > 30 ? `${no.name.slice(0, 29)}…` : no.name}
        <tspan className="fill-muted-foreground" dx={6}>{brl(payload.value)}</tspan>
      </text>
    </g>
  );
}

/** No celular: a mesma informação em lista, com barras proporcionais. */
function MapaEmCascata({ mapa, onSelecionar }: { mapa: Mapa; onSelecionar?: (no: NoMapa) => void }) {
  const base = Math.max(mapa.entradas, mapa.saidas, 1);
  const linhas = (coluna: number) =>
    mapa.links
      .filter((l) => (coluna === 0 ? mapa.nodes[l.source].coluna === 0 : mapa.nodes[l.target].coluna === coluna))
      .map((l) => ({ no: coluna === 0 ? mapa.nodes[l.source] : mapa.nodes[l.target], valor: l.value, pai: mapa.nodes[l.source] }));
  const Bloco = ({ titulo, itens, recuo }: { titulo: string; itens: ReturnType<typeof linhas>; recuo?: boolean }) => (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{titulo}</div>
      {itens.map((i, k) => (
        <button key={k} type="button" className={`block w-full text-left ${recuo ? "pl-3" : ""}`} onClick={() => onSelecionar?.(i.no)}>
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate">{i.no.name}</span>
            <span className="shrink-0 tabular-nums">{brl(i.valor)}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-muted">
            <div className="h-1.5 rounded-full" style={{ width: `${Math.max(2, (i.valor / base) * 100)}%`, background: COR[papel(i.no)] }} />
          </div>
        </button>
      ))}
    </div>
  );
  return (
    <div className="space-y-5 p-4">
      <Bloco titulo={`Entrou ${brl(mapa.entradas)}`} itens={linhas(0)} />
      <Bloco titulo={`Saiu ${brl(mapa.saidas)}`} itens={linhas(2)} />
      <Bloco titulo="Principais contas de saída" itens={linhas(3)} recuo />
    </div>
  );
}
