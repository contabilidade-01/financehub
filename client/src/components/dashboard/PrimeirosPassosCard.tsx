import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, ChevronDown, ChevronUp, ListChecks, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { cn } from "@/lib/utils";

interface ChecklistItem {
  id: string;
  titulo: string;
  descricao: string;
  concluido: boolean;
  ctaLabel: string;
  ctaHref: string;
}

interface ChecklistResponse {
  itens: ChecklistItem[];
  total: number;
  concluidos: number;
  completo: boolean;
  fechado?: boolean;
}

const EVENTO_REABRIR = "primeiros-passos:reabrir";
const chaveFechado = (userId: unknown) => `financehub_checklist_fechado_${userId ?? "anon"}`;
const chaveMinimizado = (userId: unknown) => `financehub_checklist_collapsed_${userId ?? "anon"}`;

/**
 * Item do menu lateral: depois de fechado, o card "Primeiros passos" some do
 * painel, mas pode ser reaberto por aqui. Só aparece enquanto o card está
 * fechado e ainda há passos pendentes.
 */
export function PrimeirosPassosMenuItem({ onDone }: { onDone?: () => void }) {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const { data } = useQuery<ChecklistResponse>({
    queryKey: ["/api/onboarding/checklist"],
    enabled: !!user,
  });
  const userId = (user as any)?.id;
  let fechadoLocal = false;
  try { fechadoLocal = localStorage.getItem(chaveFechado(userId)) === "true"; } catch { /* sem storage */ }

  if (!user || !data || data.itens.length === 0 || data.completo) return null;
  if (!data.fechado && !fechadoLocal) return null;

  const reabrir = () => {
    try {
      localStorage.removeItem(chaveFechado(userId));
      localStorage.removeItem(chaveMinimizado(userId));
    } catch { /* sem storage */ }
    window.dispatchEvent(new Event(EVENTO_REABRIR));
    queryClient.setQueryData<ChecklistResponse>(["/api/onboarding/checklist"], (d) => (d ? { ...d, fechado: false } : d));
    apiRequest("/api/onboarding/checklist/reabrir", { method: "POST" })
      .then(() => queryClient.invalidateQueries({ queryKey: ["/api/onboarding/checklist"] }))
      .catch(() => { /* reaberto neste aparelho */ });
    navigate((user as any)?.tipo_pessoa === "juridica" ? "/p/dashboard" : "/");
    onDone?.();
  };

  return (
    <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={reabrir}>
      <ListChecks className="h-4 w-4" />
      Primeiros passos
    </Button>
  );
}

export function PrimeirosPassosCard() {
  const { user } = useAuth();
  const collapsedKey = chaveMinimizado((user as any)?.id);
  const dismissedKey = chaveFechado((user as any)?.id);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(collapsedKey) === "true");
      setDismissed(localStorage.getItem(dismissedKey) === "true");
    } catch { /* sem storage */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsedKey, dismissedKey]);

  // Reaberto pelo menu lateral (mesmo estando já no painel).
  useEffect(() => {
    const onReabrir = () => { setDismissed(false); setCollapsed(false); };
    window.addEventListener(EVENTO_REABRIR, onReabrir);
    return () => window.removeEventListener(EVENTO_REABRIR, onReabrir);
  }, []);

  const { data, isLoading } = useQuery<ChecklistResponse>({
    queryKey: ["/api/onboarding/checklist"],
    enabled: !!user,
  });

  if (!user || dismissed || isLoading || !data || data.itens.length === 0) return null;

  // Fechado pelo usuário: não volta mais (gravado no servidor, vale em qualquer aparelho).
  if (data.fechado) return null;

  const fechar = () => {
    setDismissed(true);
    try { localStorage.setItem(dismissedKey, "true"); } catch { /* sem storage */ }
    apiRequest("/api/onboarding/checklist/fechar", { method: "POST" })
      .then(() => queryClient.invalidateQueries({ queryKey: ["/api/onboarding/checklist"] }))
      .catch(() => { /* fica fechado neste aparelho pelo localStorage */ });
  };

  // Terminado 100%: some da tela — não precisa mais "segurar" o usuário.
  if (data.completo) return null;

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(collapsedKey, String(next)); } catch { /* sem storage */ }
  };

  return (
    <Card className="mb-6 border-primary/20">
      <CardHeader className="flex flex-row items-center justify-between gap-2 pb-2">
        <div className="min-w-0">
          <CardTitle className="text-base font-semibold">Primeiros passos</CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {data.concluidos} de {data.total} concluídos — sem pressa, nada aqui é obrigatório.
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={toggleCollapsed} title={collapsed ? "Expandir" : "Minimizar"}>
            {collapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fechar} title="Fechar (dá para reabrir em Primeiros passos, no menu lateral)">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      {!collapsed && (
        <CardContent className="pt-0">
          <div className="mb-3 h-1.5 w-full rounded-full bg-border">
            <div
              className="h-1.5 rounded-full bg-primary transition-all duration-300"
              style={{ width: `${Math.round((data.concluidos / data.total) * 100)}%` }}
            />
          </div>
          <ul className="space-y-2">
            {data.itens.map((item) => (
              <li
                key={item.id}
                className={cn(
                  "flex items-start gap-3 rounded-md border px-3 py-2.5",
                  item.concluido ? "border-transparent bg-muted/40" : "border-border",
                )}
              >
                {item.concluido ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm font-medium", item.concluido && "text-muted-foreground line-through")}>
                    {item.titulo}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.descricao}</p>
                </div>
                {!item.concluido && (
                  <Link href={item.ctaHref}>
                    <Button variant="outline" size="sm" className="shrink-0 whitespace-nowrap">
                      {item.ctaLabel}
                    </Button>
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </CardContent>
      )}
    </Card>
  );
}
