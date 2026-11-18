import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Circle, ChevronDown, ChevronUp, X } from "lucide-react";
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

export function PrimeirosPassosCard() {
  const { user } = useAuth();
  const collapsedKey = `financehub_checklist_collapsed_${(user as any)?.id ?? "anon"}`;
  const dismissedKey = `financehub_checklist_fechado_${(user as any)?.id ?? "anon"}`;
  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(collapsedKey) === "true");
      setDismissed(localStorage.getItem(dismissedKey) === "true");
    } catch { /* sem storage */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsedKey, dismissedKey]);

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
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fechar} title="Fechar">
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
                  "flex flex-wrap items-start gap-3 rounded-md border px-3 py-2.5 sm:flex-nowrap",
                  item.concluido ? "border-transparent bg-muted/40" : "border-border",
                )}
              >
                {item.concluido ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
                <div className="min-w-0 flex-1 basis-[calc(100%-1.75rem)] sm:basis-0">
                  <p className={cn("text-sm font-medium", item.concluido && "text-muted-foreground line-through")}>
                    {item.titulo}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.descricao}</p>
                </div>
                {!item.concluido && (
                  <Link href={item.ctaHref}>
                    <Button variant="outline" size="sm" className="ml-7 shrink-0 whitespace-nowrap sm:ml-0">
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
