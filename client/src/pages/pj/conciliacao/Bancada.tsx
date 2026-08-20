import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, AlertCircle, Clock, Plus } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ExtratoMovimento {
  id: number;
  data: string;
  descricao: string;
  valor: number;
  tipo: "credito" | "debito";
  status: "pendente" | "conciliado" | "lancado" | "ignorado";
  sugestao_conta_id: number | null;
  sugestao_origem: "memoria_pessoal" | "memoria_global" | "ia" | "regra" | null;
  sugestao_confianca: number | null;
  conta_contabil_id: number | null;
  transacao_id: number | null;
}

interface EmpresaConta {
  id: number;
  codigo: string;
  nome: string;
}

interface BaterSaldoResult {
  saldo_sistema: number;
  saldo_extrato: number | null;
  diferenca: number | null;
  bate: boolean | null;
  pendentes: number;
}

const getStatusIcon = (status: string) => {
  switch (status) {
    case "conciliado":
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case "lancado":
      return <Plus className="h-4 w-4 text-blue-600" />;
    case "pendente":
      return <Clock className="h-4 w-4 text-yellow-600" />;
    case "ignorado":
      return <AlertCircle className="h-4 w-4 text-gray-400" />;
    default:
      return null;
  }
};

const getStatusLabel = (status: string) => {
  const labels: Record<string, string> = {
    conciliado: "Conciliado",
    lancado: "Lançado",
    pendente: "Pendente",
    ignorado: "Ignorado",
  };
  return labels[status] || status;
};

export default function Bancada({ empresaId }: { empresaId: number }) {
  const qc = useQueryClient();
  const [selectedMovs, setSelectedMovs] = useState<number[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const { data: movimentos = [], isLoading } = useQuery<ExtratoMovimento[]>({
    queryKey: [`/api/empresas/${empresaId}/conciliacao/movimentos`, statusFilter],
    queryFn: () => {
      const url = statusFilter === "all"
        ? `/api/empresas/${empresaId}/conciliacao/movimentos`
        : `/api/empresas/${empresaId}/conciliacao/movimentos?status=${statusFilter}`;
      return apiRequest(url);
    },
  });

  const { data: contas = [] } = useQuery<EmpresaConta[]>({
    queryKey: [`/api/empresas/${empresaId}/contas`],
    queryFn: () => apiRequest(`/api/empresas/${empresaId}/contas`),
  });

  const { data: saldo } = useQuery<BaterSaldoResult>({
    queryKey: [`/api/empresas/${empresaId}/conciliacao/bater-saldo`],
    queryFn: () => apiRequest(`/api/empresas/${empresaId}/conciliacao/bater-saldo`),
  });

  const lancarMutation = useMutation({
    mutationFn: async ({ mid, conta_contabil_id }: any) => {
      return apiRequest(`/api/empresas/${empresaId}/conciliacao/movimentos/${mid}/lancar`, {
        method: "POST",
        data: { conta_contabil_id },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/conciliacao/movimentos`] });
      qc.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/conciliacao/bater-saldo`] });
      setSelectedMovs([]);
    },
  });

  const conciliarMutation = useMutation({
    mutationFn: async ({ mid, transacao_id }: any) => {
      return apiRequest(`/api/empresas/${empresaId}/conciliacao/movimentos/${mid}/conciliar`, {
        method: "POST",
        data: { transacao_id },
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/conciliacao/movimentos`] });
      qc.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/conciliacao/bater-saldo`] });
    },
  });

  const aceitarTodosMutation = useMutation({
    mutationFn: async () => {
      return apiRequest(`/api/empresas/${empresaId}/conciliacao/aceitar-sugestoes`, {
        method: "POST",
        data: { importacao_id: null }, // Pega pendentes de todas as importações
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/conciliacao/movimentos`] });
      qc.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/conciliacao/bater-saldo`] });
      setSelectedMovs([]);
    },
  });

  const ignorarMutation = useMutation({
    mutationFn: async (mid: number) => {
      return apiRequest(`/api/empresas/${empresaId}/conciliacao/movimentos/${mid}/ignorar`, {
        method: "POST",
        data: {},
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/conciliacao/movimentos`] });
    },
  });

  if (isLoading) {
    return <div className="flex items-center justify-center h-64"><p className="text-muted-foreground">Carregando...</p></div>;
  }

  const pendentes = movimentos.filter((m) => m.status === "pendente");
  const somSelecionados = selectedMovs.length;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold">Bancada de Conciliação</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {movimentos.length} movimento(s) • {pendentes.length} pendente(s)
          </p>
        </div>
      </div>

      {/* Indicador Bater Saldo */}
      {saldo && (
        <Card className={saldo.bate ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
          <CardContent className="pt-6 flex justify-between items-center">
            <div>
              <p className="text-sm font-medium">Saldo do Sistema</p>
              <p className="text-2xl font-bold">R$ {saldo.saldo_sistema.toFixed(2)}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium">Saldo do Extrato</p>
              <p className="text-2xl font-bold">{saldo.saldo_extrato ? `R$ ${saldo.saldo_extrato.toFixed(2)}` : "–"}</p>
            </div>
            <div className="text-center">
              {saldo.bate ? (
                <div className="text-green-700">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-1" />
                  <p className="text-sm font-bold">Bate!</p>
                </div>
              ) : saldo.diferenca != null ? (
                <div className="text-red-700">
                  <AlertCircle className="h-8 w-8 mx-auto mb-1" />
                  <p className="text-sm font-bold">Diferença</p>
                  <p className="text-xs">R$ {Math.abs(saldo.diferenca).toFixed(2)}</p>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filtros e ações */}
      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="text-sm font-medium">Filtrar por Status</label>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="pendente">Pendente</SelectItem>
              <SelectItem value="conciliado">Conciliado</SelectItem>
              <SelectItem value="lancado">Lançado</SelectItem>
              <SelectItem value="ignorado">Ignorado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {pendentes.length > 0 && (
          <Button
            onClick={() => aceitarTodosMutation.mutate()}
            disabled={aceitarTodosMutation.isPending}
            variant="outline"
          >
            Aceitar Sugestões Pendentes
          </Button>
        )}
      </div>

      {/* Tabela */}
      {movimentos.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-muted-foreground">Nenhum movimento encontrado.</p>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-4 py-3 text-left w-12">
                    <Checkbox
                      checked={somSelecionados > 0}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedMovs(pendentes.map((m) => m.id));
                        } else {
                          setSelectedMovs([]);
                        }
                      }}
                    />
                  </th>
                  <th className="px-4 py-3 text-left">Data</th>
                  <th className="px-4 py-3 text-left">Descrição</th>
                  <th className="px-4 py-3 text-right">Valor</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-left">Conta</th>
                  <th className="px-4 py-3 text-center">Confiança</th>
                  <th className="px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {movimentos.map((mov) => (
                  <tr key={mov.id} className="border-b hover:bg-muted/30">
                    <td className="px-4 py-3">
                      {mov.status === "pendente" && (
                        <Checkbox
                          checked={selectedMovs.includes(mov.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedMovs([...selectedMovs, mov.id]);
                            } else {
                              setSelectedMovs(selectedMovs.filter((id) => id !== mov.id));
                            }
                          }}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium text-sm">{mov.data}</td>
                    <td className="px-4 py-3 text-sm max-w-xs truncate">{mov.descricao}</td>
                    <td className="px-4 py-3 text-right font-medium">
                      <span className={mov.valor >= 0 ? "text-green-600" : "text-red-600"}>
                        R$ {Math.abs(mov.valor).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center gap-1">
                        {getStatusIcon(mov.status)}
                        <Badge variant={
                          mov.status === "conciliado" ? "default" :
                          mov.status === "lancado" ? "secondary" :
                          mov.status === "pendente" ? "outline" :
                          "secondary"
                        }>{getStatusLabel(mov.status)}</Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {mov.status === "pendente" ? (
                        <Select
                          value={mov.sugestao_conta_id ? String(mov.sugestao_conta_id) : ""}
                          onValueChange={(contaId) => {
                            lancarMutation.mutate({ mid: mov.id, conta_contabil_id: parseInt(contaId) });
                          }}
                        >
                          <SelectTrigger className="w-full text-xs">
                            <SelectValue placeholder={mov.sugestao_conta_id ? "Selecione..." : "–"} />
                          </SelectTrigger>
                          <SelectContent>
                            {contas.map((c) => (
                              <SelectItem key={c.id} value={String(c.id)}>
                                {c.codigo} — {c.nome}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          {mov.conta_contabil_id ? contas.find((c) => c.id === mov.conta_contabil_id)?.nome || "–" : "–"}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center text-xs">
                      {mov.sugestao_confianca && (
                        <Badge variant="outline" className={
                          mov.sugestao_confianca >= 80 ? "bg-green-50" :
                          mov.sugestao_confianca >= 60 ? "bg-yellow-50" :
                          "bg-gray-50"
                        }>
                          {mov.sugestao_confianca}%
                        </Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      {mov.status === "pendente" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => ignorarMutation.mutate(mov.id)}
                        >
                          Ignorar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
