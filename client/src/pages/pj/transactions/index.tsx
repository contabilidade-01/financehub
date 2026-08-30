import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { EmpresaTransacaoWithDetails, EmpresaConta } from "@shared/schema";

export default function PjTransactions({ empresaId }: { empresaId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);

  const { data: transacoes = [], isLoading } = useQuery<EmpresaTransacaoWithDetails[]>({
    queryKey: [`/api/empresas/${empresaId}/transacoes?todos=1`],
    enabled: !!empresaId,
  });

  const { data: contas = [] } = useQuery<EmpresaConta[]>({
    queryKey: [`/api/empresas/${empresaId}/contas`],
    enabled: !!empresaId,
  });

  const createMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch(`/api/empresas/${empresaId}/transacoes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/transacoes`] });
      qc.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/dashboard/resumo`] });
      toast({ title: "Transação criada com sucesso." });
      setShowForm(false);
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/empresas/${empresaId}/transacoes/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Erro ao excluir");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/transacoes`] });
      qc.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/dashboard/resumo`] });
      toast({ title: "Transação removida." });
    },
  });

  const fmt = (n: number | string) =>
    Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMut.mutate({
      descricao: fd.get("descricao"),
      valor: Number(fd.get("valor")),
      tipo: fd.get("tipo"),
      categoria_id: Number(fd.get("categoria_id")),
      data_transacao: fd.get("data_transacao"),
    });
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Transações PJ</h1>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Nova
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input name="descricao" placeholder="Descrição" required />
              <Input name="valor" type="number" step="0.01" placeholder="Valor" required />
              <Input name="data_transacao" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
              <Select name="tipo" defaultValue="Despesa">
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Receita">Receita</SelectItem>
                  <SelectItem value="Despesa">Despesa</SelectItem>
                </SelectContent>
              </Select>
              <Select name="categoria_id">
                <SelectTrigger><SelectValue placeholder="Categoria" /></SelectTrigger>
                <SelectContent>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.codigo} — {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button type="submit" disabled={createMut.isPending}>Salvar</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="text-left p-3">Data</th>
                  <th className="text-left p-3">Descrição</th>
                  <th className="text-left p-3">Categoria</th>
                  <th className="text-right p-3">Valor</th>
                  <th className="text-center p-3">Tipo</th>
                  <th className="text-center p-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={6} className="text-center p-4">Carregando...</td></tr>
                ) : transacoes.length === 0 ? (
                  <tr><td colSpan={6} className="text-center p-4 text-muted-foreground">Nenhuma transação ainda.</td></tr>
                ) : (
                  transacoes.map((t) => (
                    <tr key={t.id} className="border-b hover:bg-muted/30">
                      <td className="p-3">{t.data_transacao}</td>
                      <td className="p-3">
                        {t.descricao}
                        {(t as any).reembolso_pessoal && (
                          <Badge variant="secondary" className="ml-2 text-[10px]">A pagar à pessoa</Badge>
                        )}
                      </td>
                      <td className="p-3 text-xs">
                        {t.categoria_codigo} — {t.categoria_nome}
                      </td>
                      <td className={`p-3 text-right font-medium ${t.tipo === 'Receita' ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {fmt(t.valor)}
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant={t.tipo === 'Receita' ? 'default' : 'destructive'} className="text-xs">
                          {t.tipo}
                        </Badge>
                      </td>
                      <td className="p-3 text-center">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteMut.mutate(t.id)}
                        >
                          <Trash2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
