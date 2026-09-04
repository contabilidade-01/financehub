import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit2, Search, X, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { EmpresaTransacaoWithDetails, EmpresaConta, EmpresaFormaPagamento } from "@shared/schema";

type Periodo = "todos" | "mes_atual" | "mes_passado" | "ano" | "personalizado";

const iso = (d: Date) => d.toISOString().slice(0, 10);

// Converte a opção de período escolhida em uma janela de datas concreta.
function janelaDoPeriodo(periodo: Periodo, de: string, ate: string): { de?: string; ate?: string } {
  const hoje = new Date();
  switch (periodo) {
    case "mes_atual":
      return { de: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), ate: iso(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)) };
    case "mes_passado":
      return { de: iso(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)), ate: iso(new Date(hoje.getFullYear(), hoje.getMonth(), 0)) };
    case "ano":
      return { de: iso(new Date(hoje.getFullYear(), 0, 1)), ate: iso(new Date(hoje.getFullYear(), 11, 31)) };
    case "personalizado":
      return { de: de || undefined, ate: ate || undefined };
    default:
      return {};
  }
}

const fmt = (n: number | string) =>
  Number(n).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Formulário de lançamento PJ — o mesmo para criar e editar.
 * As contas oferecidas seguem o tipo escolhido: conta e tipo precisam bater,
 * senão o lançamento entra no lado errado do DRE (o backend recusa).
 */
function TransacaoForm({
  contas,
  formas,
  cartoes,
  inicial,
  salvando,
  onSubmit,
  onCancel,
}: {
  contas: EmpresaConta[];
  formas: EmpresaFormaPagamento[];
  cartoes: { id: number; nome: string; ativo?: boolean }[];
  inicial?: EmpresaTransacaoWithDetails | null;
  salvando: boolean;
  onSubmit: (dados: any) => void;
  onCancel?: () => void;
}) {
  const pagamentoInicial = () => {
    if (inicial?.cartao_id) return `cartao:${inicial.cartao_id}`;
    if (inicial?.empresa_forma_pagamento_id) return `forma:${inicial.empresa_forma_pagamento_id}`;
    return "nenhuma";
  };

  const [tipo, setTipo] = useState<string>(inicial?.tipo ?? "Despesa");
  const [categoriaId, setCategoriaId] = useState<string>(inicial ? String(inicial.categoria_id) : "");
  const [status, setStatus] = useState<string>(inicial?.status ?? "Efetivada");
  const [pagamento, setPagamento] = useState<string>(pagamentoInicial());

  const contasDoTipo = contas.filter((c) => c.tipo === tipo);
  const formasAtivas = formas.filter((f) => f.ativo);
  const cartoesAtivos = cartoes.filter((c) => c.ativo !== false);

  const trocarTipo = (novo: string) => {
    setTipo(novo);
    const atual = contas.find((c) => String(c.id) === categoriaId);
    if (atual && atual.tipo !== novo) setCategoriaId("");
    // Cartão só faz sentido em Despesa.
    if (novo !== "Despesa" && pagamento.startsWith("cartao:")) setPagamento("nenhuma");
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const isCartao = pagamento.startsWith("cartao:");
    const isForma = pagamento.startsWith("forma:");
    const cartao = isCartao ? cartoes.find((c) => String(c.id) === pagamento.slice(7)) : null;
    const forma = isForma ? formas.find((f) => String(f.id) === pagamento.slice(6)) : null;

    onSubmit({
      descricao: fd.get("descricao"),
      valor: Number(fd.get("valor")),
      tipo,
      categoria_id: Number(categoriaId),
      data_transacao: fd.get("data_transacao"),
      status: isCartao ? "Efetivada" : status,
      data_vencimento: (fd.get("data_vencimento") as string) || null,
      cartao_id: cartao ? cartao.id : null,
      empresa_forma_pagamento_id: forma ? forma.id : null,
      metodo_pagamento: cartao?.nome ?? forma?.nome ?? null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-3 gap-3">
      <Input name="descricao" placeholder="Descrição" required defaultValue={inicial?.descricao ?? ""} />
      <Input
        name="valor"
        type="number"
        step="0.01"
        placeholder="Valor"
        required
        defaultValue={inicial ? String(inicial.valor) : ""}
      />
      <Input
        name="data_transacao"
        type="date"
        required
        defaultValue={inicial?.data_transacao ?? new Date().toISOString().slice(0, 10)}
      />

      <Select value={tipo} onValueChange={trocarTipo}>
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="Receita">Receita</SelectItem>
          <SelectItem value="Despesa">Despesa</SelectItem>
        </SelectContent>
      </Select>

      <Select value={categoriaId} onValueChange={setCategoriaId}>
        <SelectTrigger><SelectValue placeholder="Classificação (plano de contas)" /></SelectTrigger>
        <SelectContent>
          {contasDoTipo.map((c) => (
            <SelectItem key={c.id} value={String(c.id)}>
              {c.codigo} — {c.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select value={pagamento} onValueChange={setPagamento}>
        <SelectTrigger><SelectValue placeholder="Pago com" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="nenhuma">Sem forma</SelectItem>
          {formasAtivas.map((f) => (
            <SelectItem key={`f-${f.id}`} value={`forma:${f.id}`}>{f.nome}</SelectItem>
          ))}
          {tipo === "Despesa" && cartoesAtivos.length > 0 && (
            <>
              {cartoesAtivos.map((c) => (
                <SelectItem key={`c-${c.id}`} value={`cartao:${c.id}`}>
                  CC {c.nome}
                </SelectItem>
              ))}
            </>
          )}
        </SelectContent>
      </Select>

      {!pagamento.startsWith("cartao:") && (
        <Select value={status} onValueChange={setStatus}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Efetivada">Efetivada</SelectItem>
            <SelectItem value="Pendente">Pendente</SelectItem>
          </SelectContent>
        </Select>
      )}

      {pagamento.startsWith("cartao:") && (
        <p className="text-xs text-muted-foreground md:col-span-1 self-center">
          Compra no cartão: entra na fatura da competência e compõe o saldo até a fatura ser paga.
        </p>
      )}

      <Input
        name="data_vencimento"
        type="date"
        title="Vencimento (opcional)"
        defaultValue={inicial?.data_vencimento ?? ""}
      />

      <div className="flex gap-2 md:col-span-2">
        <Button type="submit" disabled={salvando || !categoriaId}>
          {inicial ? "Salvar alterações" : "Salvar"}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>Cancelar</Button>
        )}
      </div>
    </form>
  );
}

export default function PjTransactions({ empresaId }: { empresaId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<EmpresaTransacaoWithDetails | null>(null);
  const [trocandoConta, setTrocandoConta] = useState<number | null>(null);

  // Filtros (client-side, sobre a lista completa já carregada)
  const [busca, setBusca] = useState("");
  const [fTipo, setFTipo] = useState("todos");
  const [fConta, setFConta] = useState("todas");
  const [fStatus, setFStatus] = useState("todos");
  const [fForma, setFForma] = useState("todas");
  const [fPeriodo, setFPeriodo] = useState<Periodo>("todos");
  const [fDe, setFDe] = useState("");
  const [fAte, setFAte] = useState("");

  const { data: transacoes = [], isLoading } = useQuery<EmpresaTransacaoWithDetails[]>({
    queryKey: [`/api/empresas/${empresaId}/transacoes?todos=1`],
    enabled: !!empresaId,
  });

  const { data: contas = [] } = useQuery<EmpresaConta[]>({
    queryKey: [`/api/empresas/${empresaId}/contas`],
    enabled: !!empresaId,
  });

  const { data: formas = [] } = useQuery<EmpresaFormaPagamento[]>({
    queryKey: [`/api/empresas/${empresaId}/formas-pagamento`],
    enabled: !!empresaId,
  });

  const { data: cartoes = [] } = useQuery<{ id: number; nome: string; ativo?: boolean }[]>({
    queryKey: [`/api/empresas/${empresaId}/cartoes`],
    enabled: !!empresaId,
  });

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/transacoes?todos=1`] });
    qc.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/transacoes`] });
    qc.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/dashboard/resumo`] });
    qc.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/cartoes-com-saldo`] });
    qc.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/cartoes`] });
  };

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
      invalidar();
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
      invalidar();
      toast({ title: "Transação removida." });
    },
  });

  // Edição completa: qualquer campo do lançamento (antes só trocava a conta).
  const updateMut = useMutation({
    mutationFn: async ({ id, dados }: { id: number; dados: any }) => {
      const res = await fetch(`/api/empresas/${empresaId}/transacoes/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dados),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erro ao atualizar");
      return res.json();
    },
    onSuccess: () => {
      invalidar();
      setEditando(null);
      setTrocandoConta(null);
      toast({ title: "Lançamento atualizado." });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  const pagarMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/empresas/${empresaId}/transacoes/${id}/pagar`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Erro ao baixar");
      return res.json();
    },
    onSuccess: () => {
      invalidar();
      toast({ title: "Conta baixada (paga)." });
    },
    onError: (err: any) => toast({ title: "Erro", description: err.message, variant: "destructive" }),
  });

  // Formas + nomes de cartão usados nos lançamentos (filtro).
  const formasPagamento = useMemo(() => {
    const set = new Map<string, string>();
    for (const t of transacoes) {
      const nome = (t as any).metodo_pagamento_nome || t.metodo_pagamento;
      if (nome) set.set(String(nome), String(nome));
    }
    for (const c of cartoes) set.set(c.nome, c.nome);
    return [...set.values()].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [transacoes, cartoes]);

  const filtradas = useMemo(() => {
    const { de, ate } = janelaDoPeriodo(fPeriodo, fDe, fAte);
    const termo = busca.trim().toLowerCase();

    return transacoes.filter((t) => {
      if (termo && !t.descricao.toLowerCase().includes(termo)) return false;
      if (fTipo !== "todos" && t.tipo !== fTipo) return false;
      if (fConta !== "todas" && String(t.categoria_id) !== fConta) return false;
      if (fStatus !== "todos" && t.status !== fStatus) return false;
      if (fForma !== "todas") {
        const nome = (t as any).metodo_pagamento_nome || t.metodo_pagamento || "";
        if (nome !== fForma) return false;
      }
      if (de && t.data_transacao < de) return false;
      if (ate && t.data_transacao > ate) return false;
      return true;
    });
  }, [transacoes, busca, fTipo, fConta, fStatus, fForma, fPeriodo, fDe, fAte]);

  // Subtotais do que está na tela — é o que dá utilidade ao filtro.
  const totais = useMemo(() => {
    let receitas = 0;
    let despesas = 0;
    for (const t of filtradas) {
      if (t.tipo === "Receita") receitas += Number(t.valor) || 0;
      else despesas += Number(t.valor) || 0;
    }
    return { receitas, despesas, saldo: receitas - despesas };
  }, [filtradas]);

  const filtroAtivo =
    busca !== "" || fTipo !== "todos" || fConta !== "todas" || fStatus !== "todos"
    || fForma !== "todas" || fPeriodo !== "todos";

  const limparFiltros = () => {
    setBusca("");
    setFTipo("todos");
    setFConta("todas");
    setFStatus("todos");
    setFForma("todas");
    setFPeriodo("todos");
    setFDe("");
    setFAte("");
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
            <TransacaoForm
              contas={contas}
              formas={formas}
              cartoes={cartoes}
              salvando={createMut.isPending}
              onSubmit={(dados) => createMut.mutate(dados)}
              onCancel={() => setShowForm(false)}
            />
          </CardContent>
        </Card>
      )}

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="relative md:col-span-2">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Buscar na descrição..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
              />
            </div>

            <Select value={fTipo} onValueChange={setFTipo}>
              <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os tipos</SelectItem>
                <SelectItem value="Receita">Receita</SelectItem>
                <SelectItem value="Despesa">Despesa</SelectItem>
              </SelectContent>
            </Select>

            <Select value={fConta} onValueChange={setFConta}>
              <SelectTrigger><SelectValue placeholder="Classificação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as classificações</SelectItem>
                {contas.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.codigo} — {c.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={fPeriodo} onValueChange={(v) => setFPeriodo(v as Periodo)}>
              <SelectTrigger><SelectValue placeholder="Período" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todo o período</SelectItem>
                <SelectItem value="mes_atual">Mês atual</SelectItem>
                <SelectItem value="mes_passado">Mês passado</SelectItem>
                <SelectItem value="ano">Este ano</SelectItem>
                <SelectItem value="personalizado">Personalizado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {fPeriodo === "personalizado" && (
              <>
                <Input type="date" value={fDe} onChange={(e) => setFDe(e.target.value)} title="De" />
                <Input type="date" value={fAte} onChange={(e) => setFAte(e.target.value)} title="Até" />
              </>
            )}

            <Select value={fStatus} onValueChange={setFStatus}>
              <SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os status</SelectItem>
                <SelectItem value="Efetivada">Efetivada</SelectItem>
                <SelectItem value="Pendente">Pendente</SelectItem>
              </SelectContent>
            </Select>

            <Select value={fForma} onValueChange={setFForma}>
              <SelectTrigger><SelectValue placeholder="Forma de pagamento" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as formas</SelectItem>
                {formasPagamento.map((f) => (
                  <SelectItem key={f} value={f}>{f}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {filtroAtivo && (
              <Button variant="ghost" size="sm" onClick={limparFiltros} className="justify-self-start">
                <X className="h-4 w-4 mr-1" /> Limpar filtros
              </Button>
            )}
          </div>

          <div className="flex flex-wrap gap-4 pt-2 border-t text-sm">
            <span className="text-muted-foreground">
              {filtradas.length} de {transacoes.length} lançamento(s)
            </span>
            <span className="text-emerald-600">Receitas: {fmt(totais.receitas)}</span>
            <span className="text-rose-500">Despesas: {fmt(totais.despesas)}</span>
            <span className={totais.saldo >= 0 ? "font-medium" : "font-medium text-rose-500"}>
              Saldo: {fmt(totais.saldo)}
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="text-left p-3">Data</th>
                  <th className="text-left p-3">Descrição</th>
                  <th className="text-left p-3">Classificação</th>
                  <th className="text-right p-3">Valor</th>
                  <th className="text-center p-3">Tipo</th>
                  <th className="text-center p-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={6} className="text-center p-4">Carregando...</td></tr>
                ) : filtradas.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center p-4 text-muted-foreground">
                      {transacoes.length === 0 ? "Nenhuma transação ainda." : "Nenhum lançamento com esses filtros."}
                    </td>
                  </tr>
                ) : (
                  filtradas.map((t) => (
                    <tr key={t.id} className="border-b hover:bg-muted/30">
                      <td className="p-3">{t.data_transacao}</td>
                      <td className="p-3">
                        {t.descricao}
                        {(t as any).reembolso_pessoal && (
                          <Badge variant="secondary" className="ml-2 text-[10px]">A pagar à pessoa</Badge>
                        )}
                        {t.status === "Pendente" && (
                          <Badge variant="outline" className="ml-2 text-[10px]">Pendente</Badge>
                        )}
                        {(t as any).cartao_id && (
                          <Badge variant="outline" className="ml-2 text-[10px]">
                            Cartão · {t.metodo_pagamento || "crédito"}
                          </Badge>
                        )}
                        {!(t as any).cartao_id && t.metodo_pagamento && (
                          <Badge variant="outline" className="ml-2 text-[10px]">{t.metodo_pagamento}</Badge>
                        )}
                      </td>
                      <td className="p-3 text-xs">
                        {trocandoConta === t.id ? (
                          <Select
                            defaultValue={String(t.categoria_id)}
                            onValueChange={(v) => updateMut.mutate({ id: t.id, dados: { categoria_id: Number(v) } })}
                          >
                            <SelectTrigger className="h-8 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {contas.filter((c) => c.tipo === t.tipo).map((c) => (
                                <SelectItem key={c.id} value={String(c.id)}>
                                  {c.codigo} — {c.nome}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <button
                            type="button"
                            className="text-left hover:underline"
                            title="Trocar conta"
                            onClick={() => setTrocandoConta(t.id)}
                          >
                            {t.categoria_codigo} — {t.categoria_nome}
                          </button>
                        )}
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
                        {t.status === "Pendente" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Baixar (marcar como pago)"
                            onClick={() => pagarMut.mutate(t.id)}
                            disabled={pagarMut.isPending}
                          >
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Editar lançamento"
                          onClick={() => setEditando(t)}
                        >
                          <Edit2 className="h-4 w-4 text-muted-foreground" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          title="Excluir"
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

      <Dialog open={!!editando} onOpenChange={(aberto) => !aberto && setEditando(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Editar lançamento #{editando?.id}</DialogTitle>
          </DialogHeader>
          {editando && (
            <TransacaoForm
              contas={contas}
              formas={formas}
              cartoes={cartoes}
              inicial={editando}
              salvando={updateMut.isPending}
              onSubmit={(dados) => updateMut.mutate({ id: editando.id, dados })}
              onCancel={() => setEditando(null)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
