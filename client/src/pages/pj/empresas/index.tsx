import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Building2, Plus } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Empresa } from "@shared/schema";

/**
 * CRUD de empresas vinculadas ao usuário PJ.
 * Permite criar, editar e excluir empresas.
 */
export default function PjEmpresas() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);

  const { data: empresas = [], isLoading } = useQuery<Empresa[]>({
    queryKey: ["/api/empresas"],
  });

  const createMut = useMutation({
    mutationFn: async (data: any) => {
      const res = await fetch("/api/empresas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/api/empresas"] });
      toast({ title: `Empresa criada! ${data.contas_criadas} contas de plano semeadas.` });
      setShowForm(false);
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    createMut.mutate({
      razao_social: fd.get("razao_social"),
      nome_fantasia: fd.get("nome_fantasia") || null,
      cnpj: fd.get("cnpj") || null,
      regime_tributario: fd.get("regime_tributario") || null,
      segmento: fd.get("segmento") || null,
    });
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Minhas Empresas</h1>
        <Button onClick={() => setShowForm(!showForm)} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Nova Empresa
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardContent className="pt-4">
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Input name="razao_social" placeholder="Razão Social *" required />
              <Input name="nome_fantasia" placeholder="Nome Fantasia" />
              <Input name="cnpj" placeholder="CNPJ (opcional)" />
              <Select name="regime_tributario">
                <SelectTrigger><SelectValue placeholder="Regime tributário" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MEI">MEI</SelectItem>
                  <SelectItem value="Simples">Simples Nacional</SelectItem>
                  <SelectItem value="Presumido">Lucro Presumido</SelectItem>
                </SelectContent>
              </Select>
              <Select name="segmento">
                <SelectTrigger><SelectValue placeholder="Segmento" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="servicos">Serviços</SelectItem>
                  <SelectItem value="comercio">Comércio</SelectItem>
                  <SelectItem value="misto">Misto</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" disabled={createMut.isPending}>Cadastrar</Button>
            </form>
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : empresas.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 py-12">
            <Building2 className="h-12 w-12 text-muted-foreground" />
            <p className="text-muted-foreground">Nenhuma empresa cadastrada.</p>
            <Button onClick={() => setShowForm(true)}>Cadastrar empresa</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {empresas.map((emp) => (
            <Card key={emp.id}>
              <CardHeader>
                <CardTitle className="text-lg">{emp.razao_social}</CardTitle>
                {emp.nome_fantasia && (
                  <p className="text-sm text-muted-foreground">{emp.nome_fantasia}</p>
                )}
              </CardHeader>
              <CardContent className="text-sm space-y-1">
                {emp.cnpj && <p><span className="font-medium">CNPJ:</span> {emp.cnpj}</p>}
                {emp.regime_tributario && <p><span className="font-medium">Regime:</span> {emp.regime_tributario}</p>}
                {emp.segmento && <p><span className="font-medium">Segmento:</span> {emp.segmento}</p>}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
