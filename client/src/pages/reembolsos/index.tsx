import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { CheckCircle2, CreditCard, HandCoins, Search, X } from "lucide-react";

interface Reembolso {
  id: number;
  descricao: string;
  valor: string;
  data_transacao: string;
  data_vencimento: string | null;
  categoria: string | null;
  forma_pagamento: string | null;
}

const fmt = (valor: string | number) =>
  Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const fmtData = (data: string) =>
  new Date(`${data.slice(0, 10)}T00:00:00`).toLocaleDateString("pt-BR");

export default function ReembolsosPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: reembolsos = [], isLoading } = useQuery<Reembolso[]>({
    queryKey: ["/api/reembolsos"],
  });

  const receber = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/reembolsos/${id}/receber`, { method: "PUT" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reembolsos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      toast({ title: "Reembolso marcado como recebido! ✅" });
    },
    onError: (error: any) =>
      toast({ title: "Erro", description: error.message, variant: "destructive" }),
  });

  // Filtros
  const [busca, setBusca] = useState("");
  const [formaFiltro, setFormaFiltro] = useState("todas");
  const [categoriaFiltro, setCategoriaFiltro] = useState("todas");
  const [ordem, setOrdem] = useState("data_desc");

  const formas = useMemo(
    () => Array.from(new Set(reembolsos.map((r) => r.forma_pagamento).filter(Boolean))) as string[],
    [reembolsos],
  );
  const categorias = useMemo(
    () => Array.from(new Set(reembolsos.map((r) => r.categoria).filter(Boolean))) as string[],
    [reembolsos],
  );

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    const lista = reembolsos.filter((r) => {
      if (q && !r.descricao.toLowerCase().includes(q)) return false;
      if (formaFiltro !== "todas" && (r.forma_pagamento || "") !== formaFiltro) return false;
      if (categoriaFiltro !== "todas" && (r.categoria || "") !== categoriaFiltro) return false;
      return true;
    });
    const dataDe = (r: Reembolso) => String(r.data_vencimento || r.data_transacao).slice(0, 10);
    lista.sort((a, b) => {
      if (ordem === "valor_desc") return Number(b.valor) - Number(a.valor);
      if (ordem === "valor_asc") return Number(a.valor) - Number(b.valor);
      if (ordem === "data_asc") return dataDe(a).localeCompare(dataDe(b));
      return dataDe(b).localeCompare(dataDe(a)); // data_desc (padrão)
    });
    return lista;
  }, [reembolsos, busca, formaFiltro, categoriaFiltro, ordem]);

  const total = filtrados.reduce((soma, item) => soma + Number(item.valor), 0);
  const temFiltro = busca.trim() !== "" || formaFiltro !== "todas" || categoriaFiltro !== "todas";
  const limpar = () => {
    setBusca("");
    setFormaFiltro("todas");
    setCategoriaFiltro("todas");
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <HandCoins className="h-8 w-8" /> A Receber
        </h1>
        <p className="text-muted-foreground">
          {filtrados.length}
          {temFiltro ? ` de ${reembolsos.length}` : ""} reembolso(s) — Total: {fmt(total)}
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Estes valores continuam na fatura do cartão, mas não entram nas suas despesas nem no saldo a pagar.
        </p>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando...</p>
      ) : reembolsos.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
            <p className="text-lg font-medium">Nenhum reembolso pendente.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Filtros */}
          <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center">
            <div className="relative md:max-w-xs md:flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar descrição…"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={formaFiltro} onValueChange={setFormaFiltro}>
              <SelectTrigger className="md:w-52">
                <SelectValue placeholder="Cartão/forma" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todos os cartões</SelectItem>
                {formas.map((f) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
              <SelectTrigger className="md:w-52">
                <SelectValue placeholder="Categoria" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as categorias</SelectItem>
                {categorias.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={ordem} onValueChange={setOrdem}>
              <SelectTrigger className="md:w-44">
                <SelectValue placeholder="Ordenar" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="data_desc">Mais recentes</SelectItem>
                <SelectItem value="data_asc">Mais antigos</SelectItem>
                <SelectItem value="valor_desc">Maior valor</SelectItem>
                <SelectItem value="valor_asc">Menor valor</SelectItem>
              </SelectContent>
            </Select>
            {temFiltro && (
              <Button variant="ghost" size="sm" onClick={limpar}>
                <X className="h-4 w-4 mr-1" /> Limpar
              </Button>
            )}
          </div>

          {filtrados.length === 0 ? (
            <Card>
              <CardContent className="py-10 text-center text-muted-foreground">
                Nenhum reembolso com esses filtros.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {filtrados.map((item) => (
                <Card key={item.id}>
                  <CardContent className="flex flex-col gap-4 py-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-start gap-3">
                      <CreditCard className="h-5 w-5 mt-1 text-blue-500" />
                      <div>
                        <p className="font-medium">{item.descricao}</p>
                        <div className="flex flex-wrap gap-2 mt-1 text-xs text-muted-foreground">
                          <span>{fmtData(item.data_vencimento || item.data_transacao)}</span>
                          {item.forma_pagamento && <Badge variant="outline">{item.forma_pagamento}</Badge>}
                          {item.categoria && <span>• {item.categoria}</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-4 md:justify-end">
                      <p className="font-bold text-blue-600">{fmt(item.valor)}</p>
                      <Button
                        size="sm"
                        onClick={() => receber.mutate(item.id)}
                        disabled={receber.isPending}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" /> Recebido
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
