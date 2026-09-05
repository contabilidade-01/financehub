import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Download, ShieldAlert, Loader2, Undo2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type StatusExclusao = {
  solicitada: boolean;
  solicitada_em: string | null;
  efetiva_em: string | null;
  dias_restantes: number | null;
};

const dataBR = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("pt-BR") : "—";

/**
 * "Meus dados" — portabilidade e exclusão da conta (LGPD).
 * Cancelar assinatura e excluir conta são coisas DIFERENTES e ficam em abas
 * diferentes de propósito: cancelar preserva tudo, excluir apaga.
 */
export function MeusDados() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [baixando, setBaixando] = useState(false);
  const [confirmacao, setConfirmacao] = useState("");
  const [motivo, setMotivo] = useState("");

  const { data: status } = useQuery<StatusExclusao>({
    queryKey: ["/api/lgpd/exclusao"],
    queryFn: async () => {
      const r = await fetch("/api/lgpd/exclusao", { credentials: "include" });
      if (!r.ok) throw new Error("Falha ao consultar");
      return r.json();
    },
  });

  const baixar = async () => {
    setBaixando(true);
    try {
      const r = await fetch("/api/lgpd/exportar", { credentials: "include" });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || "Falha ao exportar");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `meus-dados-${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
      toast({ title: "Exportação concluída", description: "A planilha foi baixada." });
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    } finally {
      setBaixando(false);
    }
  };

  const pedirExclusao = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/lgpd/exclusao", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmacao, motivo }),
      });
      if (!r.ok) throw new Error((await r.json()).error || "Falha ao solicitar");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/lgpd/exclusao"] });
      setConfirmacao("");
      toast({ title: "Exclusão agendada", description: "Você ainda pode desistir durante a carência." });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  const desistir = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/lgpd/exclusao", { method: "DELETE", credentials: "include" });
      if (!r.ok) throw new Error("Falha ao cancelar o pedido");
      return r.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/lgpd/exclusao"] });
      toast({ title: "Pedido cancelado", description: "Sua conta e seus dados continuam como estavam." });
    },
    onError: (e: any) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Baixar meus dados</CardTitle>
          <CardDescription>
            Uma planilha com tudo que é seu: lançamentos, contas, cartões, faturas,
            categorias, metas e histórico de pagamentos — uma aba por assunto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={baixar} disabled={baixando}>
            {baixando ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Baixar planilha (.xlsx)
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <ShieldAlert className="h-5 w-5" /> Excluir minha conta
          </CardTitle>
          <CardDescription>
            Apaga seus lançamentos, contas, cartões e demais dados pessoais. Só é
            mantido o registro de cobranças já emitidas, sem identificação, por
            obrigação fiscal.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {status?.solicitada ? (
            <>
              <Alert>
                <AlertDescription>
                  Exclusão agendada para <strong>{dataBR(status.efetiva_em)}</strong>
                  {typeof status.dias_restantes === "number" && (
                    <> — faltam <strong>{status.dias_restantes} dia(s)</strong>.</>
                  )}
                  {" "}Até lá nada foi apagado e você pode desistir.
                </AlertDescription>
              </Alert>
              <Button variant="outline" onClick={() => desistir.mutate()} disabled={desistir.isPending}>
                <Undo2 className="h-4 w-4 mr-2" /> Desistir da exclusão
              </Button>
            </>
          ) : (
            <>
              <Alert variant="destructive">
                <AlertDescription>
                  Depois da carência de 30 dias, <strong>não há como recuperar</strong>.
                  Baixe seus dados antes, se quiser guardá-los.
                </AlertDescription>
              </Alert>
              <div className="space-y-1.5">
                <Label htmlFor="motivo-exclusao">Motivo (opcional)</Label>
                <Input
                  id="motivo-exclusao"
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ajuda a melhorar o sistema"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="confirmar-exclusao">
                  Para confirmar, digite <strong>EXCLUIR</strong>
                </Label>
                <Input
                  id="confirmar-exclusao"
                  value={confirmacao}
                  onChange={(e) => setConfirmacao(e.target.value)}
                  placeholder="EXCLUIR"
                  className="max-w-xs"
                />
              </div>
              <Button
                variant="destructive"
                onClick={() => pedirExclusao.mutate()}
                disabled={confirmacao.trim().toUpperCase() !== "EXCLUIR" || pedirExclusao.isPending}
              >
                {pedirExclusao.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Excluir minha conta
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default MeusDados;
