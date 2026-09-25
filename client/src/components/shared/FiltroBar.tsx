import { useCallback, useMemo, useState, type ReactNode } from "react";
import { useLocation, useSearch } from "wouter";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Filtros guardados na URL (?status=...&de=...): recarregar, voltar ou mandar
 * o link para alguém mantém a mesma visão. Valores iguais ao padrão não vão
 * para a URL, para ela ficar curta.
 */
export function useFiltrosUrl<T extends Record<string, string>>(padrao: T) {
  const busca = useSearch();
  const [local, navegar] = useLocation();
  const valores = useMemo(() => {
    const p = new URLSearchParams(busca);
    const v = { ...padrao };
    for (const k of Object.keys(padrao)) {
      const x = p.get(k);
      if (x !== null) (v as any)[k] = x;
    }
    return v as T;
    // padrao é um literal estável por tela
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busca]);

  const definir = useCallback(
    (patch: Partial<T>) => {
      const p = new URLSearchParams(busca);
      for (const [k, x] of Object.entries(patch)) {
        if (x === undefined || x === null || x === "" || x === (padrao as any)[k]) p.delete(k);
        else p.set(k, String(x));
      }
      const qs = p.toString();
      navegar(`${local}${qs ? `?${qs}` : ""}`, { replace: true });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busca, local, navegar],
  );

  const limpar = useCallback(() => navegar(local, { replace: true }), [local, navegar]);
  const ativos = Object.keys(padrao).filter((k) => valores[k] !== padrao[k]).length;
  return { valores, definir, limpar, ativos };
}

const hojeLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** Atalhos de período: devolvem { de, ate } em datas ISO locais. */
export function periodoPreset(p: string): { de: string; ate: string } {
  const [a, m] = hojeLocal().split("-").map(Number);
  const iso = (ano: number, mes: number, dia: number) => {
    const d = new Date(ano, mes - 1, dia);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const fimMes = (ano: number, mes: number) => iso(ano, mes + 1, 0);
  switch (p) {
    case "mes": return { de: iso(a, m, 1), ate: fimMes(a, m) };
    case "mes_anterior": return { de: iso(a, m - 1, 1), ate: fimMes(a, m - 1) };
    case "proximo_mes": return { de: iso(a, m + 1, 1), ate: fimMes(a, m + 1) };
    case "trimestre": { const t = Math.floor((m - 1) / 3) * 3 + 1; return { de: iso(a, t, 1), ate: fimMes(a, t + 2) }; }
    case "ano": return { de: iso(a, 1, 1), ate: iso(a, 12, 31) };
    case "12m": return { de: iso(a, m - 11, 1), ate: fimMes(a, m) };
    case "proximos_30": { const d = new Date(); const f = new Date(); f.setDate(d.getDate() + 30); return { de: hojeLocal(), ate: `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}` }; }
    default: return { de: "", ate: "" };
  }
}

export const PRESETS_PERIODO = [
  { valor: "", rotulo: "Qualquer data" },
  { valor: "mes", rotulo: "Este mês" },
  { valor: "mes_anterior", rotulo: "Mês anterior" },
  { valor: "proximo_mes", rotulo: "Próximo mês" },
  { valor: "proximos_30", rotulo: "Próximos 30 dias" },
  { valor: "trimestre", rotulo: "Este trimestre" },
  { valor: "ano", rotulo: "Este ano" },
  { valor: "12m", rotulo: "Últimos 12 meses" },
  { valor: "personalizado", rotulo: "Personalizado" },
];

export interface OpcaoFiltro {
  valor: string;
  rotulo: string;
}

export interface CampoSelect {
  chave: string;
  rotulo: string;
  opcoes: OpcaoFiltro[];
  /** Rótulo do "todos" (valor vazio). */
  todos?: string;
}

interface Props {
  valores: Record<string, string>;
  definir: (patch: Record<string, string>) => void;
  limpar: () => void;
  ativos: number;
  /** Campo de busca livre (chave "q"). */
  busca?: boolean | string;
  /** Período com atalhos (chaves "periodo", "de", "ate"). */
  periodo?: { rotulo: string };
  /** Selects extras (conta do plano, cliente, banco...). */
  selects?: CampoSelect[];
  /** Faixa de valor (chaves "valor_min", "valor_max"). */
  valor?: boolean;
  /** Controles que ficam sempre visíveis à esquerda (ex.: abas de status). */
  inicio?: ReactNode;
}

/** Barra de filtros padrão das telas do ERP: busca e principais visíveis, o resto em "Filtros". */
export function FiltroBar({ valores, definir, limpar, ativos, busca, periodo, selects = [], valor, inicio }: Props) {
  const [aberto, setAberto] = useState(false);
  const extras = selects.length + (valor ? 1 : 0) + (periodo ? 1 : 0);
  const trocarPeriodo = (p: string) => {
    if (p === "personalizado") return definir({ periodo: p });
    const r = periodoPreset(p);
    definir({ periodo: p, de: r.de, ate: r.ate });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 md:flex-row md:items-center">
        {inicio}
        {busca && (
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder={typeof busca === "string" ? busca : "Buscar"}
              defaultValue={valores.q || ""}
              key={valores.q || ""}
              onKeyDown={(e) => { if (e.key === "Enter") definir({ q: (e.target as HTMLInputElement).value.trim() }); }}
              onBlur={(e) => { if (e.target.value.trim() !== (valores.q || "")) definir({ q: e.target.value.trim() }); }}
              aria-label="Buscar"
            />
          </div>
        )}
        {extras > 0 && (
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setAberto((a) => !a)} aria-expanded={aberto}>
              <SlidersHorizontal className="mr-2 h-4 w-4" />Filtros
              {ativos > 0 && <Badge variant="secondary" className="ml-2 h-5 px-1.5 tabular-nums">{ativos}</Badge>}
            </Button>
            {ativos > 0 && (
              <Button type="button" variant="ghost" onClick={limpar}><X className="mr-1 h-4 w-4" />Limpar</Button>
            )}
          </div>
        )}
      </div>

      {aberto && (
        <div className={cn("grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-2 lg:grid-cols-4")}>
          {periodo && (
            <div className="space-y-1">
              <Label className="text-xs">{periodo.rotulo}</Label>
              <Select value={valores.periodo || "__todos"} onValueChange={(v) => trocarPeriodo(v === "__todos" ? "" : v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRESETS_PERIODO.map((p) => <SelectItem key={p.valor || "__todos"} value={p.valor || "__todos"}>{p.rotulo}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {periodo && valores.periodo === "personalizado" && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label className="text-xs">De</Label><Input type="date" value={valores.de || ""} onChange={(e) => definir({ de: e.target.value })} /></div>
              <div className="space-y-1"><Label className="text-xs">Até</Label><Input type="date" value={valores.ate || ""} onChange={(e) => definir({ ate: e.target.value })} /></div>
            </div>
          )}
          {selects.map((s) => (
            <div key={s.chave} className="space-y-1">
              <Label className="text-xs">{s.rotulo}</Label>
              <Select value={valores[s.chave] || "__todos"} onValueChange={(v) => definir({ [s.chave]: v === "__todos" ? "" : v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__todos">{s.todos || "Todos"}</SelectItem>
                  {s.opcoes.map((o) => <SelectItem key={o.valor} value={o.valor}>{o.rotulo}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ))}
          {valor && (
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">Valor mínimo</Label>
                <Input inputMode="decimal" placeholder="0,00" defaultValue={valores.valor_min || ""} key={`min${valores.valor_min}`} onBlur={(e) => definir({ valor_min: e.target.value.trim() })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Valor máximo</Label>
                <Input inputMode="decimal" placeholder="0,00" defaultValue={valores.valor_max || ""} key={`max${valores.valor_max}`} onBlur={(e) => definir({ valor_max: e.target.value.trim() })} />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
