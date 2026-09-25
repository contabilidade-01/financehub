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
  // Radix Select não entra no FormData — estado controlado para tipo/classificação/grupo.
  const [tipo, setTipo] = useState("Despesa");
  const [classificacao, setClassificacao] = useState("FIXA");
  const [grupoGerencial, setGrupoGerencial] = useState("auto");

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
      setTipo("Despesa");
      setClassificacao("FIXA");
      setGrupoGerencial("auto");
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

  const updateMut = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await fetch(`/api/empresas/${empresaId}/contas/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/contas`] }); },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const codigo = (fd.get("codigo") as string || "").trim();
    createMut.mutate({
      // Em branco: o servidor gera o próximo código da sequência do grupo.
      codigo: codigo || undefined,
      nome: fd.get("nome"),
      tipo,
      classificacao,
      grupo_gerencial: grupoGerencial !== "auto" ? grupoGerencial : null,
      is_cmv: fd.get("is_cmv") === "on",
    });
  };

  const classLabel: Record<string, string> = {
    FIXA: "Fixa",
    VARIAVEL: "Variável",
    OUTRA: "Outra",
  };

  // Grupo gerencial usado no Fluxo de Caixa (Relatórios). "auto" = derivado.
  const GRUPOS = [
    { value: "auto", label: "Automático" },
    { value: "receita", label: "Receita" },
    { value: "custo_variavel", label: "Custo Variável" },
    { value: "despesa_fixa", label: "Despesa Fixa" },
    { value: "investimento", label: "Investimento" },
    { value: "nao_operacional", label: "Não Operacional" },
    { value: "outras", label: "Outras" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Plano de Contas</h1>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Nova Conta
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Input name="codigo" placeholder="Código (deixe vazio p/ automático)" title="Em branco, o sistema gera o próximo código da sequência." />
              <Input name="nome" placeholder="Nome da conta" required />
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Receita">Receita</SelectItem>
                  <SelectItem value="Despesa">Despesa</SelectItem>
                </SelectContent>
              </Select>
              <Select value={classificacao} onValueChange={setClassificacao}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FIXA">Fixa</SelectItem>
                  <SelectItem value="VARIAVEL">Variável</SelectItem>
                  <SelectItem value="OUTRA">Outra</SelectItem>
                </SelectContent>
              </Select>
              <Select value={grupoGerencial} onValueChange={setGrupoGerencial}>
                <SelectTrigger><SelectValue placeholder="Grupo (Fluxo)" /></SelectTrigger>
                <SelectContent>
                  {GRUPOS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <label className="flex items-center gap-2 text-sm px-1">
                <input type="checkbox" name="is_cmv" className="h-4 w-4" /> É CMV (comércio)
              </label>
              <Button type="submit" disabled={createMut.isPending}>Salvar</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {/* Mobile: cards */}
          <div className="divide-y md:hidden">
            {isLoading ? (
              <p className="p-4 text-center text-sm text-muted-foreground">Carregando...</p>
            ) : contas.length === 0 ? (
              <p className="p-4 text-center text-sm text-muted-foreground">Nenhuma conta cadastrada.</p>
            ) : (
              contas.map((c) => (
                <div key={c.id} className="space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium leading-snug">
                        <span className="mr-1.5 font-mono text-xs text-muted-foreground">{c.codigo}</span>
                        {c.nome}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <Badge variant={c.tipo === 'Receita' ? 'default' : 'destructive'} className="text-xs">{c.tipo}</Badge>
                        <Badge variant="outline" className="text-xs">{classLabel[c.classificacao] ?? c.classificacao}</Badge>
                      </div>
                    </div>
                    <Button variant="ghost" size="icon" className="-mr-2 shrink-0" aria-label="Excluir conta" onClick={() => deleteMut.mutate(c.id)}>
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                  <div className="flex items-center gap-3">
                    <Select
                      value={(c as any).grupo_gerencial || "auto"}
                      onValueChange={(v) => updateMut.mutate({ id: c.id, data: { grupo_gerencial: v === "auto" ? null : v } })}
                    >
                      <SelectTrigger className="h-9 flex-1 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {GRUPOS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={(c as any).is_cmv === true}
                        onChange={(e) => updateMut.mutate({ id: c.id, data: { is_cmv: e.target.checked } })}
                      /> CMV
                    </label>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* md+: tabela */}
          <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              <tr>
                <th className="text-left p-3">Código</th>
                <th className="text-left p-3">Nome</th>
                <th className="text-center p-3">Tipo</th>
                <th className="text-center p-3">Classificação</th>
                <th className="text-center p-3">Grupo (Fluxo de Caixa)</th>
                <th className="text-center p-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={6} className="text-center p-4">Carregando...</td></tr>
              ) : contas.length === 0 ? (
                <tr><td colSpan={6} className="text-center p-4 text-muted-foreground">Nenhuma conta cadastrada.</td></tr>
              ) : (
                contas.map((c) => (
                  <tr key={c.id} className="border-b hover:bg-muted/30">
                    <td className="p-3 font-mono tabular-nums">{c.codigo}</td>
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
                      <div className="flex items-center justify-center gap-2">
                        <Select
                          value={(c as any).grupo_gerencial || "auto"}
                          onValueChange={(v) => updateMut.mutate({ id: c.id, data: { grupo_gerencial: v === "auto" ? null : v } })}
                        >
                          <SelectTrigger className="h-8 w-[150px] text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {GRUPOS.map((g) => <SelectItem key={g.value} value={g.value}>{g.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        <label className="flex items-center gap-1 text-xs text-muted-foreground" title="Custo da Mercadoria Vendida (habilita Margem Bruta/Markup)">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5"
                            checked={(c as any).is_cmv === true}
                            onChange={(e) => updateMut.mutate({ id: c.id, data: { is_cmv: e.target.checked } })}
                          /> CMV
                        </label>
                      </div>
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
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
