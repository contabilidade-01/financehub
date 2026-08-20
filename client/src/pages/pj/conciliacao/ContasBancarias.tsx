import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PlusCircle, Trash2, Edit2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ContaBancaria {
  id: number;
  banco: string;
  agencia: string | null;
  numero: string | null;
  tipo: "corrente" | "poupanca" | "caixa";
  saldo_inicial: number;
  saldo_sistema?: number;
  ativo: boolean;
  criado_em: string;
}

export default function ContasBancarias({ empresaId }: { empresaId: number }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ banco: "", agencia: "", numero: "", tipo: "corrente", saldo_inicial: 0 });

  const { data: contas = [], isLoading } = useQuery<ContaBancaria[]>({
    queryKey: [`/api/empresas/${empresaId}/contas-bancarias`],
    queryFn: () => apiRequest(`/api/empresas/${empresaId}/contas-bancarias`),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest(`/api/empresas/${empresaId}/contas-bancarias`, { method: "POST", data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/contas-bancarias`] });
      setFormData({ banco: "", agencia: "", numero: "", tipo: "corrente", saldo_inicial: 0 });
      setOpen(false);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest(`/api/empresas/${empresaId}/contas-bancarias/${id}`, { method: "PUT", data }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/contas-bancarias`] });
      setEditingId(null);
      setFormData({ banco: "", agencia: "", numero: "", tipo: "corrente", saldo_inicial: 0 });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/empresas/${empresaId}/contas-bancarias/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/contas-bancarias`] });
    },
  });

  const handleOpenEdit = (conta: ContaBancaria) => {
    setEditingId(conta.id);
    setFormData({
      banco: conta.banco,
      agencia: conta.agencia || "",
      numero: conta.numero || "",
      tipo: conta.tipo,
      saldo_inicial: conta.saldo_inicial,
    });
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setEditingId(null);
    setFormData({ banco: "", agencia: "", numero: "", tipo: "corrente", saldo_inicial: 0 });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.banco.trim()) return;

    const payload = {
      ...formData,
      saldo_inicial: Number(formData.saldo_inicial),
    };

    if (editingId) {
      await updateMutation.mutateAsync({ id: editingId, data: payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
    handleClose();
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Carregando contas...</p></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Contas Bancárias</h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <PlusCircle className="h-4 w-4" />
              Nova Conta
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingId ? "Editar" : "Nova"} Conta Bancária</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="banco">Banco *</Label>
                <Input
                  id="banco"
                  value={formData.banco}
                  onChange={(e) => setFormData({ ...formData, banco: e.target.value })}
                  placeholder="ex: Banco do Brasil"
                  required
                />
              </div>
              <div>
                <Label htmlFor="agencia">Agência</Label>
                <Input
                  id="agencia"
                  value={formData.agencia}
                  onChange={(e) => setFormData({ ...formData, agencia: e.target.value })}
                  placeholder="ex: 1234"
                />
              </div>
              <div>
                <Label htmlFor="numero">Número da Conta</Label>
                <Input
                  id="numero"
                  value={formData.numero}
                  onChange={(e) => setFormData({ ...formData, numero: e.target.value })}
                  placeholder="ex: 123456-7"
                />
              </div>
              <div>
                <Label htmlFor="tipo">Tipo</Label>
                <Select value={formData.tipo} onValueChange={(v) => setFormData({ ...formData, tipo: v })}>
                  <SelectTrigger id="tipo">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="corrente">Corrente</SelectItem>
                    <SelectItem value="poupanca">Poupança</SelectItem>
                    <SelectItem value="caixa">Caixa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="saldo">Saldo Inicial (R$)</Label>
                <Input
                  id="saldo"
                  type="number"
                  step="0.01"
                  value={formData.saldo_inicial}
                  onChange={(e) => setFormData({ ...formData, saldo_inicial: parseFloat(e.target.value) || 0 })}
                  placeholder="0.00"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={handleClose} type="button">Cancelar</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {editingId ? "Atualizar" : "Criar"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {contas.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Nenhuma conta bancária cadastrada.</p>
          <p className="text-sm text-muted-foreground mt-1">Crie uma para começar a importar extratos.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {contas.map((conta) => (
            <Card key={conta.id} className="p-4">
              <div className="space-y-2 mb-4">
                <h3 className="font-bold text-lg">{conta.banco}</h3>
                <p className="text-sm text-muted-foreground">
                  {conta.agencia && conta.numero ? `${conta.agencia} / ${conta.numero}` : "–"}
                </p>
                <p className="text-sm">Tipo: <span className="font-medium capitalize">{conta.tipo}</span></p>
                <div className="pt-2 border-t">
                  <p className="text-xs text-muted-foreground">Saldo Inicial</p>
                  <p className="text-lg font-bold text-green-600">R$ {conta.saldo_inicial.toFixed(2)}</p>
                  {conta.saldo_sistema != null && (
                    <>
                      <p className="text-xs text-muted-foreground mt-2">Saldo Sistema</p>
                      <p className="text-lg font-bold">R$ {conta.saldo_sistema.toFixed(2)}</p>
                    </>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1"
                  onClick={() => handleOpenEdit(conta)}
                >
                  <Edit2 className="h-4 w-4 mr-1" />
                  Editar
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive hover:bg-destructive/10"
                  onClick={() => {
                    if (confirm("Remover esta conta?")) {
                      deleteMutation.mutate(conta.id);
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
