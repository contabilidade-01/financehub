import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConexaoCora } from "./ConexaoCora";

/**
 * Painel do usuário → Integrações: a própria empresa conecta a conta Cora
 * (Client ID, certificado e chave). O admin do sistema não participa.
 */
export function IntegracoesEmpresa() {
  const { data: empresas = [], isLoading } = useQuery<any[]>({
    queryKey: ["/api/empresas"],
    queryFn: async () => {
      const r = await fetch("/api/empresas", { credentials: "include" });
      return r.ok ? r.json() : [];
    },
  });
  const empresa = empresas[0];
  const { data: bancos = [] } = useQuery<any[]>({
    queryKey: [`/api/empresas/${empresa?.id}/contas-bancarias`],
    queryFn: async () => {
      const r = await fetch(`/api/empresas/${empresa.id}/contas-bancarias`, { credentials: "include" });
      return r.ok ? r.json() : [];
    },
    enabled: !!empresa?.id,
  });

  if (isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>;
  if (!empresa) return <p className="text-sm text-muted-foreground">Cadastre a empresa para conectar integrações.</p>;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cora — boleto e Pix com baixa automática</CardTitle>
          <CardDescription>
            Opcional. Conectando a conta Cora da {empresa.nome_fantasia || empresa.razao_social}, você emite cobranças pelo sistema e,
            quando o cliente paga, a conta a receber é baixada sozinha. As cobranças ficam em Gestão → Recebimentos Cora.
          </CardDescription>
        </CardHeader>
      </Card>
      <ConexaoCora empresaId={empresa.id} bancos={bancos} />
    </div>
  );
}
