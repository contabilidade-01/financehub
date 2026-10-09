import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiErp, brl, CabecalhoPagina, dataBr, SomenteErp } from "./comum";

interface Transferencia {
  id: number;
  valor: string;
  data: string;
  descricao: string | null;
  origem_nome: string;
  destino_nome: string;
  chave_origem: string | null;
  chave_destino: string | null;
}

export default function TransferenciasPage({ empresaId }: { empresaId: number }) {
  return (
    <SomenteErp>
      <Transferencias empresaId={empresaId} />
    </SomenteErp>
  );
}

function Transferencias({ empresaId }: { empresaId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const url = `/api/empresas/${empresaId}/erp/transferencias`;
  const { data: lista = [], isLoading } = useQuery<Transferencia[]>({ queryKey: [url], queryFn: () => apiErp(url) });
  const { data: contas = [] } = useQuery<any[]>({
    queryKey: [`/api/empresas/${empresaId}/contas-bancarias`],
    queryFn: () => apiErp(`/api/empresas/${empresaId}/contas-bancarias`),
  });
  const hoje = new Date().toISOString().slice(0, 10);
  const [nova, setNova] = useState<null | { conta_origem_id: string; conta_destino_id: string; valor: string; data: string; descricao: string }>(null);
  const [salvando, setSalvando] = useState(false);

  const atualizar = () => {
    qc.invalidateQueries({ queryKey: [url] });
    qc.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/contas-bancarias`] });
  };

  const salvar = async () => {
    if (!nova) return;
    setSalvando(true);
    try {
      await apiErp(url, { method: "POST", body: { ...nova, valor: nova.valor.replace(/\./g, "").replace(",", ".") } });
      toast({ title: "Transferência registrada" });
      setNova(null);
      atualizar();
    } catch (e: any) {
      toast({ title: "Não foi possível registrar", description: e?.message, variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (t: Transferencia) => {
    try {
      await apiErp(`${url}/${t.id}`, { method: "DELETE" });
      toast({ title: "Transferência excluída" });
      atualizar();
    } catch (e: any) {
      toast({ title: "Não foi possível excluir", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <CabecalhoPagina
        titulo="Transferências entre contas"
        descricao="Dinheiro que passou de uma conta da empresa para outra. Movimenta os saldos, mas não é receita nem despesa."
        acoes={
          <Button onClick={() => setNova({ conta_origem_id: "", conta_destino_id: "", valor: "", data: hoje, descricao: "" })} disabled={contas.length < 2}>
            <Plus className="mr-2 h-4 w-4" />Nova transferência
          </Button>
        }
      />
      {contas.length < 2 && <p className="text-sm text-muted-foreground">Cadastre ao menos duas contas bancárias para transferir entre elas.</p>}
      <Card>
        <CardContent className="divide-y p-0">
          {isLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
          ) : !lista.length ? (
            <p className="p-6 text-sm text-muted-foreground">Nenhuma transferência. Na importação de extrato você também pode marcar uma linha como transferência.</p>
          ) : (
            lista.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                <div className="w-20 shrink-0 text-xs tabular-nums text-muted-foreground">{dataBr(t.data)}</div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1 text-sm font-medium">
                    {t.origem_nome} <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /> {t.destino_nome}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {t.descricao || "Transferência"}
                    {(t.chave_origem || t.chave_destino) && " · conciliada com extrato"}
                  </div>
                </div>
                <div className="font-medium tabular-nums">{brl(t.valor)}</div>
                <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => remover(t)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={!!nova} onOpenChange={(o) => !o && setNova(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova transferência</DialogTitle>
            <DialogDescription>Entre contas da própria empresa.</DialogDescription>
          </DialogHeader>
          {nova && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>De</Label>
                <Select value={nova.conta_origem_id} onValueChange={(v) => setNova({ ...nova, conta_origem_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Conta de origem" /></SelectTrigger>
                  <SelectContent>{contas.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nome || c.banco}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Para</Label>
                <Select value={nova.conta_destino_id} onValueChange={(v) => setNova({ ...nova, conta_destino_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Conta de destino" /></SelectTrigger>
                  <SelectContent>
                    {contas.filter((c) => String(c.id) !== nova.conta_origem_id).map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nome || c.banco}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tr-valor">Valor (R$)</Label>
                <Input id="tr-valor" inputMode="decimal" value={nova.valor} onChange={(e) => setNova({ ...nova, valor: e.target.value })} placeholder="0,00" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tr-data">Data</Label>
                <Input id="tr-data" type="date" value={nova.data} onChange={(e) => setNova({ ...nova, data: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="tr-desc">Descrição (opcional)</Label>
                <Input id="tr-desc" value={nova.descricao} onChange={(e) => setNova({ ...nova, descricao: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setNova(null)}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando || !nova?.conta_origem_id || !nova?.conta_destino_id || !nova?.valor}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Registrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
