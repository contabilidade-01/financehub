import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { EmpresaConta } from "@shared/schema";

export default function PjCategorias({ empresaId }: { empresaId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);

  const { data: contas = [], isLoading } = useQuery<EmpresaConta[]>({
    queryKey: [`/api/empresas/${empresaId}/contas`],
    enabled: !!empresaId,
  });

  const createMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/empresas/${empresaId}/contas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/contas`] });
      toast({ title: "Conta criada." });
      setShowForm(false);
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/empresas/${empresaId}/contas/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Não é possível excluir.");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/contas`] });
      toast({ title: "Conta removida." });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMut.mutate({
      codigo: fd.get("codigo"),
      nome: fd.get("nome"),
      tipo: fd.get("tipo"),
      classificacao: fd.get("classificacao"),
    });
  };

  const classLabel: Record<string, string> = {
    FIXA: "Fixa",
    VARIAVEL: "Variável",
    OUTRA: "Outra",
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Plano de Contas</h1>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Nova Conta
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Input name="codigo" placeholder="Código (ex: 5.01)" required />
              <Input name="nome" placeholder="Nome da conta" required />
              <Select name="tipo" defaultValue="Despesa">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Receita">Receita</SelectItem>
                  <SelectItem value="Despesa">Despesa</SelectItem>
                </SelectContent>
              </Select>
              <Select name="classificacao" defaultValue="FIXA">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXA">Fixa</SelectItem>
                  <SelectItem value="VARIAVEL">Variável</SelectItem>
                  <SelectItem value="OUTRA">Outra</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" disabled={createMut.isPending}>Salvar</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="text-left p-3">Código</th>
                <th className="text-left p-3">Nome</th>
                <th className="text-center p-3">Tipo</th>
                <th className="text-center p-3">Classificação</th>
                <th className="text-center p-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={5} className="text-center p-4">Carregando...</td></tr>
              ) : contas.length === 0 ? (
                <tr><td colSpan={5} className="text-center p-4 text-muted-foreground">Nenhuma conta cadastrada.</td></tr>
              ) : (
                contas.map((c) => (
                  <tr key={c.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-mono">{c.codigo}</td>
                    <td className="p-3">{c.nome}</td>
                    <td className="p-3 text-center">
                      <Badge variant={c.tipo === 'Receita' ? 'default' : 'destructive'} className="text-xs">
                        {c.tipo}
                      </Badge>
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant="outline" className="text-xs">{classLabel[c.classificacao] ?? c.classificacao}</Badge>
                    </td>
                    <td className="p-3 text-center">
                      <Button variant="ghost" size="icon" onClick={() => deleteMut.mutate(c.id)}>
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
