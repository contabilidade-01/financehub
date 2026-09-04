import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { EmpresaFormaPagamento } from "@shared/schema";

const TIPOS = [
  { value: "pix", label: "PIX" },
  { value: "boleto", label: "Boleto" },
  { value: "debito", label: "Débito" },
  { value: "transferencia", label: "Transferência" },
  { value: "dinheiro", label: "Dinheiro" },
  { value: "outro", label: "Outro" },
];

export default function PjFormasPagamento({ empresaId }: { empresaId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState("pix");

  const { data: formas = [], isLoading } = useQuery<EmpresaFormaPagamento[]>({
    queryKey: [`/api/empresas/${empresaId}/formas-pagamento`],
    enabled: !!empresaId,
  });

  const createMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/empresas/${empresaId}/formas-pagamento`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome, tipo }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erro ao criar");
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/formas-pagamento`] });
      toast({ title: "Forma criada." });
      setShowForm(false);
      setNome("");
      setTipo("pix");
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/empresas/${empresaId}/formas-pagamento/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error((await res.json()).error || "Erro ao remover");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/formas-pagamento`] });
      toast({ title: "Forma removida." });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Formas de pagamento</h1>
          <p className="text-sm text-muted-foreground">PIX, boleto, débito… Cartões ficam em Faturas.</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Nova
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-4 flex flex-wrap gap-3 items-end">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Nome</label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: PIX Conta PJ" />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Tipo</label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button disabled={!nome.trim() || createMut.isPending} onClick={() => createMut.mutate()}>
              Salvar
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="text-left p-3">Nome</th>
                <th className="text-left p-3">Tipo</th>
                <th className="text-center p-3">Status</th>
                <th className="text-center p-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={4} className="text-center p-4">Carregando...</td></tr>
              ) : formas.length === 0 ? (
                <tr><td colSpan={4} className="text-center p-4 text-muted-foreground">Nenhuma forma cadastrada.</td></tr>
              ) : (
                formas.map((f) => (
                  <tr key={f.id} className="border-b">
                    <td className="p-3 font-medium">{f.nome}</td>
                    <td className="p-3 capitalize">{f.tipo}</td>
                    <td className="p-3 text-center">
                      <Badge variant={f.ativo ? "default" : "secondary"}>{f.ativo ? "Ativa" : "Inativa"}</Badge>
                    </td>
                    <td className="p-3 text-center">
                      <Button variant="ghost" size="icon" onClick={() => deleteMut.mutate(f.id)}>
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
