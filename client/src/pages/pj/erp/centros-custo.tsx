import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiErp, CabecalhoPagina, SomenteErp } from "./comum";

export interface CentroCusto {
  id: number;
  nome: string;
  codigo: string | null;
  ativo: boolean;
  lancamentos: number;
}

export default function CentrosCustoPage({ empresaId }: { empresaId: number }) {
  return (
    <SomenteErp>
      <Centros empresaId={empresaId} />
    </SomenteErp>
  );
}

function Centros({ empresaId }: { empresaId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const url = `/api/empresas/${empresaId}/erp/centros-custo`;
  const { data: centros = [], isLoading } = useQuery<CentroCusto[]>({ queryKey: [url], queryFn: () => apiErp(url) });
  const [editando, setEditando] = useState<{ id?: number; nome: string; codigo: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!editando) return;
    setSalvando(true);
    try {
      await apiErp(`${url}${editando.id ? `/${editando.id}` : ""}`, { method: editando.id ? "PUT" : "POST", body: { nome: editando.nome, codigo: editando.codigo } });
      toast({ title: "Centro de custo salvo" });
      setEditando(null);
      qc.invalidateQueries({ queryKey: [url] });
    } catch (e: any) {
      toast({ title: "Não foi possível salvar", description: e?.message, variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (c: CentroCusto) => {
    try {
      const r = await apiErp<{ inativado: boolean }>(`${url}/${c.id}`, { method: "DELETE" });
      toast({ title: r.inativado ? "Centro de custo inativado" : "Centro de custo excluído" });
      qc.invalidateQueries({ queryKey: [url] });
    } catch (e: any) {
      toast({ title: "Não foi possível excluir", description: e?.message, variant: "destructive" });
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <CabecalhoPagina
        titulo="Centros de custo"
        descricao="Separe receitas e despesas por unidade, projeto ou área e filtre o DRE por centro."
        acoes={<Button onClick={() => setEditando({ nome: "", codigo: "" })}><Plus className="mr-2 h-4 w-4" />Novo centro</Button>}
      />
      <Card>
        <CardContent className="divide-y p-0">
          {isLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
          ) : !centros.length ? (
            <p className="p-6 text-sm text-muted-foreground">Nenhum centro de custo. Exemplos: Loja Centro, Delivery, Obra Rua A.</p>
          ) : (
            centros.map((c) => (
              <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{c.codigo ? <span className="mr-2 tabular-nums text-muted-foreground">{c.codigo}</span> : null}{c.nome}</div>
                  <div className="text-xs text-muted-foreground">{c.lancamentos} lançamento(s)</div>
                </div>
                <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => setEditando({ id: c.id, nome: c.nome, codigo: c.codigo || "" })}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => remover(c)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editando?.id ? "Editar centro de custo" : "Novo centro de custo"}</DialogTitle>
            <DialogDescription>O código é opcional e serve para ordenar.</DialogDescription>
          </DialogHeader>
          {editando && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="cc-cod">Código</Label>
                <Input id="cc-cod" value={editando.codigo} onChange={(e) => setEditando({ ...editando, codigo: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="cc-nome">Nome</Label>
                <Input id="cc-nome" value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando || (editando?.nome.trim().length ?? 0) < 2}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
