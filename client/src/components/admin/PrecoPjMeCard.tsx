import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";

type Plano = { id: number; planCode: string; priceMonthly: string; active: boolean; portePj?: string | null };

export type AsaasSync = { total: number; atualizados: number; falhas: { userId: number; motivo: string }[]; erro?: string } | null;

export function descreverAsaasSync(s: AsaasSync): string {
  if (!s) return "Nenhuma assinatura precisou de reajuste.";
  if (s.erro) return `Asaas não sincronizado: ${s.erro}`;
  if (!s.total) return "Nenhuma assinatura ativa no Asaas para reajustar.";
  const falhas = s.falhas?.length ? ` · ${s.falhas.length} falha(s): ${s.falhas.slice(0, 3).map((f) => `#${f.userId} ${f.motivo}`).join("; ")}` : "";
  return `Asaas: ${s.atualizados} de ${s.total} assinatura(s) reajustada(s)${falhas}`;
}

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Preço do PJ ME (ERP). Salvar reajusta automaticamente, no Asaas, a
 * recorrência e as cobranças em aberto de todos os assinantes PJ ME.
 */
export function PrecoPjMeCard({ plans, onSaved }: { plans?: Plano[]; onSaved: () => void }) {
  const { toast } = useToast();
  const plano = plans?.find((p) => p.planCode === "mensal_pj_me") || plans?.find((p) => p.portePj === "me");
  const [valor, setValor] = useState("");
  const [confirmar, setConfirmar] = useState<{ afetadas: number } | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    if (plano) setValor(String(plano.priceMonthly));
  }, [plano?.id, plano?.priceMonthly]);

  if (!plano) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Preço do PJ ME</CardTitle>
          <CardDescription>
            O plano PJ ME é criado automaticamente na próxima inicialização do servidor. Você também pode criar um plano com
            "Destinado a: PJ ME".
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const novo = Number(String(valor).replace(",", "."));
  const atual = Number(plano.priceMonthly);
  const valido = Number.isFinite(novo) && novo > 0;
  const mudou = valido && Math.abs(novo - atual) >= 0.005;

  const pedirConfirmacao = async () => {
    try {
      const r = await fetch(`/api/admin/subscription-plans/${plano.id}/assinantes`, { credentials: "include" });
      const j = r.ok ? await r.json() : { assinaturasAfetadas: 0 };
      setConfirmar({ afetadas: Number(j.assinaturasAfetadas) || 0 });
    } catch {
      setConfirmar({ afetadas: 0 });
    }
  };

  const salvar = async () => {
    setSalvando(true);
    try {
      const r = await fetch(`/api/admin/subscription-plans/${plano.id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceMonthly: novo.toFixed(2) }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error || "Falha ao salvar o preço");
      toast({ title: `Preço do PJ ME: ${brl(novo)}/mês`, description: descreverAsaasSync(j.asaasSync) });
      onSaved();
    } catch (e: any) {
      toast({ title: "Erro ao salvar o preço do PJ ME", description: e?.message, variant: "destructive" });
    } finally {
      setSalvando(false);
      setConfirmar(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preço do PJ ME</CardTitle>
        <CardDescription>
          Valor mensal da modalidade PJ ME (ERP). Trimestral e anual seguem o mesmo valor × meses. Ao salvar, as assinaturas
          ativas no Asaas e as cobranças em aberto são reajustadas automaticamente.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="w-full sm:w-48">
            <Label htmlFor="preco-pj-me">Valor mensal (R$)</Label>
            <Input
              id="preco-pj-me"
              inputMode="decimal"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="tabular-nums"
            />
          </div>
          <Button onClick={pedirConfirmacao} disabled={!mudou || salvando}>
            {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Salvar e atualizar no Asaas
          </Button>
          <span className="text-sm text-muted-foreground">
            Atual: {brl(atual)}/mês{plano.active ? "" : " · plano inativo"}
          </span>
        </div>
      </CardContent>

      <AlertDialog open={!!confirmar} onOpenChange={(o) => !o && setConfirmar(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Alterar preço do PJ ME?</AlertDialogTitle>
            <AlertDialogDescription>
              De {brl(atual)} para {valido ? brl(novo) : "-"} por mês.{" "}
              {confirmar?.afetadas
                ? `${confirmar.afetadas} assinatura(s) ativa(s) no Asaas serão reajustadas agora, incluindo as cobranças em aberto.`
                : "Nenhuma assinatura ativa no Asaas será afetada agora; o novo valor vale nas próximas cobranças."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={salvando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={salvar} disabled={salvando}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
