import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { FLAG_CORA_CARTEIRA_NESCON, useFlag } from "@/hooks/use-flag";

interface Carteira {
  conectada: boolean;
  portal_configurado: boolean;
  filtro_clientes: "todos" | "carteira_nescon";
  sincronizado_em: string | null;
  ultimo_resumo: { contatos_criados: number; contatos_atualizados: number; erro: string | null; em: string } | null;
  clientes_nescon: number;
  clientes_jean: number;
}

async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`);
  return d as T;
}

/**
 * Parâmetro do escritório: quais boletos da conta Cora entram nas transações.
 * Só aparece com a flag cora_carteira_nescon (o usuário do escritório).
 */
export function CarteiraNescon({ empresaId }: { empresaId: number }) {
  const { ativa } = useFlag(FLAG_CORA_CARTEIRA_NESCON);
  const url = `/api/empresas/${empresaId}/integracoes/cora/carteira`;
  const { data } = useQuery<Carteira>({ queryKey: [url], queryFn: () => api(url), enabled: ativa, retry: false });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [ocupado, setOcupado] = useState(false);

  if (!ativa || !data) return null;

  const executar = async (fn: () => Promise<Carteira>, ok: string) => {
    setOcupado(true);
    try {
      queryClient.setQueryData([url], await fn());
      toast({ title: ok });
    } catch (e: any) {
      toast({ title: "Não foi possível concluir", description: e?.message, variant: "destructive" });
    } finally {
      setOcupado(false);
    }
  };

  const quando = data.sincronizado_em ? new Date(data.sincronizado_em).toLocaleString("pt-BR") : null;

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Users className="h-4 w-4" /> Quais boletos entram
      </div>
      <RadioGroup
        value={data.filtro_clientes}
        disabled={ocupado}
        onValueChange={(v) => executar(() => api<Carteira>(url, "PUT", { filtro: v }), v === "todos" ? "Importando todos os boletos" : "Importando só clientes Nescon")}
        className="gap-2"
      >
        <label htmlFor="filtro-todos" className="flex cursor-pointer items-start gap-3 text-xs">
          <RadioGroupItem id="filtro-todos" value="todos" className="mt-0.5" />
          <span>Todos os boletos da conta Cora</span>
        </label>
        <label htmlFor="filtro-nescon" className="flex cursor-pointer items-start gap-3 text-xs">
          <RadioGroupItem id="filtro-nescon" value="carteira_nescon" className="mt-0.5" disabled={!data.portal_configurado} />
          <span>
            Só clientes Nescon (marcados no portal nescon-clientes). Clientes pessoais do Jean e pagadores sem cadastro no portal ficam de fora.
            {!data.portal_configurado && (
              <span className="block text-amber-700 dark:text-amber-400">Configure NESCON_PORTAL_URL e NESCON_PORTAL_TOKEN no servidor.</span>
            )}
          </span>
        </label>
      </RadioGroup>
      {data.filtro_clientes === "carteira_nescon" && (
        <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            {data.clientes_nescon} cliente(s) Nescon, {data.clientes_jean} pessoal(is) do Jean
            {quando ? ` · sincronizado em ${quando}` : " · ainda não sincronizado"}
            {data.ultimo_resumo?.erro ? ` · última tentativa falhou: ${data.ultimo_resumo.erro}` : ""}
          </span>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0"
            disabled={ocupado}
            onClick={() => executar(() => api<Carteira>(`${url}/sincronizar`, "POST"), "Clientes sincronizados com o portal")}
          >
            {ocupado ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Sincronizar clientes
          </Button>
        </div>
      )}
    </div>
  );
}
