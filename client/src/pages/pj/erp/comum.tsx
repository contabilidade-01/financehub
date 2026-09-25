import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { temErpPj } from "@shared/modalidade";

/** Cliente da API com erro legível (mensagem do servidor). */
export async function apiErp<T = any>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method || "GET",
    credentials: "include",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `Erro ${res.status}`);
  return data as T;
}

export const brl = (v: number | string | null | undefined) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const dataBr = (iso?: string | null) => {
  if (!iso) return "";
  const [a, m, d] = String(iso).slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
};

export function formatarDocumento(doc?: string | null) {
  const d = String(doc || "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return doc || "";
}

export function CabecalhoPagina({ titulo, descricao, acoes }: { titulo: string; descricao?: string; acoes?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 flex-1">
        <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
        {descricao && <p className="max-w-3xl text-sm text-muted-foreground">{descricao}</p>}
      </div>
      {acoes && <div className="flex shrink-0 flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}

/** Módulos de ERP são da modalidade PJ ME; PJ MEI vê o convite para mudar de modalidade. */
export function SomenteErp({ children }: { children: ReactNode }) {
  const { user } = useAuth() as { user?: any };
  if (!user) return null;
  if (temErpPj(user)) return <>{children}</>;
  return (
    <Card>
      <CardContent className="space-y-2 p-6 text-sm">
        <p className="font-medium">Recurso da modalidade PJ ME</p>
        <p className="text-muted-foreground">
          Contas a receber, clientes e fornecedores, centros de custo e DRE gerencial fazem parte da gestão completa (ERP)
          da modalidade PJ ME. Fale com o suporte para mudar a sua modalidade.
        </p>
      </CardContent>
    </Card>
  );
}
