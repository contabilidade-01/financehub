import { useMemo, useState } from "react";
import { useConfirm } from "@/components/shared/ConfirmDialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { temErpPj } from "@shared/modalidade";
import { CalendarClock, CreditCard, FileText, HandCoins, Plus, Edit, Trash2, Power, Search, X } from "lucide-react";

export type Mensalidade = {
  id: number;
  descricao: string;
  valor: number | string;
  dia_vencimento: number;
  tipo_meio: "boleto" | "cartao";
  /** 'pagar' (padrão) ou 'receber' (PJ ME: cliente paga a empresa). */
  tipo?: "pagar" | "receber";
  contato_id?: number | null;
  contato_nome?: string | null;
  valor_variavel?: boolean;
  categoria_id: number | null;
  conta_bancaria_id: number | null;
  forma_pagamento_id: number | null;
  cartao_id: number | null;
  ativo: boolean;
  ultima_competencia_gerada: string | null;
};

type Opcao = { id: number; nome: string; codigo?: string | null; tipo?: string | null };

const money = (v: number | string) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

export type FormMensalidade = {
  id: number | null;
  descricao: string;
  valor: string;
  dia_vencimento: string;
  tipo: "pagar" | "receber";
  tipo_meio: "boleto" | "cartao";
  categoria_id: string;
  conta_bancaria_id: string;
  cartao_id: string; // guarda o cartão escolhido (forma_pagamento_id no PF, cartao_id no PJ)
  contato_id: string;
  valor_variavel: boolean;
};

export const freshForm = (parcial: Partial<FormMensalidade> = {}): FormMensalidade => ({
  id: null,
  descricao: "",
  valor: "",
  dia_vencimento: "10",
  tipo: "pagar",
  tipo_meio: "boleto",
  categoria_id: "",
  conta_bancaria_id: "",
  cartao_id: "",
  contato_id: "",
  valor_variavel: false,
  ...parcial,
});

/** Payload da API a partir do formulário (compartilhado com a tela de Clientes e fornecedores). */
export function payloadMensalidade(form: FormMensalidade, pj: boolean, empresaId?: number): any {
  const valor = Number(String(form.valor).replace(/\./g, "").replace(",", "."));
  const receber = pj && form.tipo === "receber";
  const tipoMeio = receber ? "boleto" : form.tipo_meio;
  return {
    ...(pj ? { empresa_id: empresaId } : {}),
    descricao: form.descricao.trim(),
    valor,
    dia_vencimento: Number(form.dia_vencimento),
    tipo: receber ? "receber" : "pagar",
    tipo_meio: tipoMeio,
    categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
    conta_bancaria_id: tipoMeio === "boleto" && form.conta_bancaria_id ? Number(form.conta_bancaria_id) : null,
    forma_pagamento_id: tipoMeio === "cartao" && !pj && form.cartao_id ? Number(form.cartao_id) : null,
    cartao_id: tipoMeio === "cartao" && pj && form.cartao_id ? Number(form.cartao_id) : null,
    contato_id: pj && form.contato_id ? Number(form.contato_id) : null,
    valor_variavel: pj ? !!form.valor_variavel : false,
  };
}

/** Erro de validação do formulário (null = ok). */
export function validarFormMensalidade(form: FormMensalidade, pj: boolean): string | null {
  const valor = Number(String(form.valor).replace(/\./g, "").replace(",", "."));
  const dia = Number(form.dia_vencimento);
  if (!form.descricao.trim()) return "Informe a descrição";
  if (!(valor > 0)) return "Informe um valor válido";
  if (!(dia >= 1 && dia <= 31)) return "Dia de vencimento: 1 a 31";
  const receber = pj && form.tipo === "receber";
  if (!receber && form.tipo_meio === "cartao" && !form.cartao_id) return "Escolha o cartão";
  return null;
}

export default function MensalidadesPage({ empresaId }: { empresaId?: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { user } = useAuth() as { user?: any };
  const pj = empresaId != null;
  // Recorrências a receber (clientes) fazem parte do ERP: só PJ ME.
  const erp = pj && temErpPj(user);

  const urlLista = `/api/mensalidades${pj ? `?empresa_id=${empresaId}` : ""}`;
  const urlCategorias = pj ? `/api/empresas/${empresaId}/contas` : `/api/categories`;
  const urlCartoes = pj ? `/api/empresas/${empresaId}/cartoes` : `/api/cartoes`;
  const urlContas = pj ? `/api/empresas/${empresaId}/contas-bancarias` : `/api/contas`;

  const { data: mensalidades = [], isLoading } = useQuery<Mensalidade[]>({ queryKey: [urlLista] });
  const { data: categorias = [] } = useQuery<Opcao[]>({ queryKey: [urlCategorias] });
  const { data: cartoes = [] } = useQuery<Opcao[]>({ queryKey: [urlCartoes] });
  const { data: contas = [] } = useQuery<Opcao[]>({ queryKey: [urlContas] });
  const { data: contatos = [] } = useQuery<Opcao[]>({
    queryKey: [`/api/empresas/${empresaId}/erp/contatos`, "todos"],
    queryFn: () => apiRequest(`/api/empresas/${empresaId}/erp/contatos`),
    enabled: erp,
  });

  const categoriasDespesa = useMemo(
    () => categorias.filter((c) => !c.tipo || /despesa/i.test(String(c.tipo))),
    [categorias],
  );
  const categoriasReceita = useMemo(() => categorias.filter((c) => /receita/i.test(String(c.tipo))), [categorias]);
  const catLabel = (c: Opcao) => (c.codigo ? `${c.codigo} — ${c.nome}` : c.nome);
  const mapCat = useMemo(() => new Map(categorias.map((c) => [c.id, catLabel(c)])), [categorias]);
  const mapCartao = useMemo(() => new Map(cartoes.map((c) => [c.id, c.nome])), [cartoes]);
  const mapConta = useMemo(() => new Map(contas.map((c) => [c.id, c.nome])), [contas]);

  // Filtros (na tela, sobre a lista já carregada).
  const [busca, setBusca] = useState("");
  const [fTipo, setFTipo] = useState<"todos" | "pagar" | "receber">("todos");
  const [fMeio, setFMeio] = useState<"todos" | "boleto" | "cartao">("todos");
  const [fStatus, setFStatus] = useState<"ativas" | "pausadas" | "todas">("ativas");
  const [fCategoria, setFCategoria] = useState("todas");
  const filtroAtivo = busca !== "" || fTipo !== "todos" || fMeio !== "todos" || fStatus !== "ativas" || fCategoria !== "todas";
  const limparFiltros = () => { setBusca(""); setFTipo("todos"); setFMeio("todos"); setFStatus("ativas"); setFCategoria("todas"); };

  const filtradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return mensalidades.filter((m) => {
      const tipo = m.tipo || "pagar";
      if (fTipo !== "todos" && tipo !== fTipo) return false;
      if (fMeio !== "todos" && m.tipo_meio !== fMeio) return false;
      if (fStatus === "ativas" && !m.ativo) return false;
      if (fStatus === "pausadas" && m.ativo) return false;
      if (fCategoria !== "todas" && String(m.categoria_id ?? "") !== fCategoria) return false;
      if (termo && !`${m.descricao} ${m.contato_nome || ""}`.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [mensalidades, busca, fTipo, fMeio, fStatus, fCategoria]);

  // Totais do que está na tela: quanto entra e quanto sai por mês.
  const totais = useMemo(() => {
    let pagar = 0, receber = 0;
    for (const m of filtradas) {
      if ((m.tipo || "pagar") === "receber") receber += Number(m.valor) || 0;
      else pagar += Number(m.valor) || 0;
    }
    return { pagar, receber, saldo: receber - pagar };
  }, [filtradas]);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormMensalidade>(freshForm());
  const confirmar = useConfirm();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [urlLista] });
    qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] || "").startsWith("/api/cartoes") });
    qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] || "").startsWith("/api/vencimentos") });
    qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] || "").startsWith("/api/transactions") });
    if (pj) qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] || "").includes(`/api/empresas/${empresaId}/`) });
  };

  const salvar = useMutation({
    mutationFn: (payload: any) => {
      if (form.id) return apiRequest(`/api/mensalidades/${form.id}`, { method: "PUT", data: payload });
      return apiRequest("/api/mensalidades", { method: "POST", data: payload });
    },
    onSuccess: () => {
      invalidate();
      setOpen(false);
      setForm(freshForm());
      toast({ title: form.id ? "Mensalidade atualizada" : "Mensalidade criada" });
    },
    onError: (e: any) => toast({ title: "Erro", description: e?.message || e?.error, variant: "destructive" }),
  });

  const alternarAtivo = useMutation({
    mutationFn: (m: Mensalidade) => apiRequest(`/api/mensalidades/${m.id}`, { method: "PUT", data: { ativo: !m.ativo } }),
    onSuccess: () => { invalidate(); },
    onError: (e: any) => toast({ title: "Erro", description: e?.message || e?.error, variant: "destructive" }),
  });

  const excluir = useMutation({
    mutationFn: (id: number) => apiRequest(`/api/mensalidades/${id}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); toast({ title: "Mensalidade excluída" }); },
    onError: (e: any) => toast({ title: "Erro", description: e?.message || e?.error, variant: "destructive" }),
  });

  const abrirNovo = () => { setForm(freshForm({ tipo: fTipo === "receber" && erp ? "receber" : "pagar" })); setOpen(true); };
  const abrirEdicao = (m: Mensalidade) => {
    setForm({
      id: m.id,
      descricao: m.descricao,
      valor: String(m.valor),
      dia_vencimento: String(m.dia_vencimento),
      tipo: m.tipo === "receber" ? "receber" : "pagar",
      tipo_meio: m.tipo_meio,
      categoria_id: m.categoria_id != null ? String(m.categoria_id) : "",
      conta_bancaria_id: m.conta_bancaria_id != null ? String(m.conta_bancaria_id) : "",
      cartao_id: (pj ? m.cartao_id : m.forma_pagamento_id) != null ? String(pj ? m.cartao_id : m.forma_pagamento_id) : "",
      contato_id: m.contato_id != null ? String(m.contato_id) : "",
      valor_variavel: !!m.valor_variavel,
    });
    setOpen(true);
  };

  const submit = () => {
    const erro = validarFormMensalidade(form, pj);
    if (erro) { toast({ title: erro, variant: "destructive" }); return; }
    salvar.mutate(payloadMensalidade(form, pj, empresaId));
  };

  const meioLabel = (m: Mensalidade) => {
    if ((m.tipo || "pagar") === "receber") {
      const nome = m.conta_bancaria_id ? mapConta.get(m.conta_bancaria_id) : null;
      return `A receber${nome ? ` · ${nome}` : ""}`;
    }
    if (m.tipo_meio === "cartao") {
      const nome = mapCartao.get((pj ? m.cartao_id : m.forma_pagamento_id) as number);
      return `Cartão${nome ? ` · ${nome}` : ""}`;
    }
    const nome = m.conta_bancaria_id ? mapConta.get(m.conta_bancaria_id) : null;
    return `Boleto${nome ? ` · ${nome}` : ""}`;
  };

  const receberForm = erp && form.tipo === "receber";
  const contatosDoTipo = contatos.filter((c: any) => c.tipo === "ambos" || c.tipo === (receberForm ? "cliente" : "fornecedor"));
  const categoriasForm = receberForm ? categoriasReceita : categoriasDespesa;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <CalendarClock className="h-7 w-7" /> Mensalidades
          </h1>
          <p className="text-muted-foreground">
            {erp
              ? "Contas fixas que se repetem todo mês: a pagar (boleto ou cartão) e a receber de clientes. Geradas automaticamente, 3 meses à frente."
              : "Assinaturas e contas fixas que se repetem todo mês — geradas automaticamente como boleto (conta a pagar) ou lançamento no cartão."}
          </p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus className="h-4 w-4 mr-2" /> Nova mensalidade
        </Button>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
            <div className="relative md:col-span-2">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pl-8" placeholder={erp ? "Buscar por descrição ou cliente/fornecedor…" : "Buscar na descrição…"} value={busca} onChange={(e) => setBusca(e.target.value)} />
            </div>
            {erp && (
              <Select value={fTipo} onValueChange={(v) => setFTipo(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">A pagar e a receber</SelectItem>
                  <SelectItem value="pagar">Só a pagar</SelectItem>
                  <SelectItem value="receber">Só a receber</SelectItem>
                </SelectContent>
              </Select>
            )}
            <Select value={fMeio} onValueChange={(v) => setFMeio(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os meios</SelectItem>
                <SelectItem value="boleto">Boleto / conta</SelectItem>
                <SelectItem value="cartao">Cartão de crédito</SelectItem>
              </SelectContent>
            </Select>
            <Select value={fStatus} onValueChange={(v) => setFStatus(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ativas">Ativas</SelectItem>
                <SelectItem value="pausadas">Pausadas</SelectItem>
                <SelectItem value="todas">Ativas e pausadas</SelectItem>
              </SelectContent>
            </Select>
            <Select value={fCategoria} onValueChange={setFCategoria}>
              <SelectTrigger><SelectValue placeholder="Classificação" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas as classificações</SelectItem>
                {categorias.map((c) => (<SelectItem key={c.id} value={String(c.id)}>{catLabel(c)}</SelectItem>))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
              <span>{filtradas.length} mensalidade(s)</span>
              <span>A pagar/mês: <b className="text-expense">{money(totais.pagar)}</b></span>
              {erp && <span>A receber/mês: <b className="text-income">{money(totais.receber)}</b></span>}
              {erp && <span>Saldo/mês: <b className={totais.saldo >= 0 ? "text-income" : "text-expense"}>{money(totais.saldo)}</b></span>}
            </div>
            {filtroAtivo && (
              <Button variant="ghost" size="sm" onClick={limparFiltros}><X className="h-4 w-4 mr-1" /> Limpar filtros</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : mensalidades.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhuma mensalidade cadastrada. Clique em <b>Nova mensalidade</b> para começar (ex.: Netflix, aluguel, seguro{erp ? ", honorário mensal de um cliente" : ""}).
          </CardContent>
        </Card>
      ) : filtradas.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nada encontrado com estes filtros. <Button variant="link" className="h-auto p-0" onClick={limparFiltros}>Limpar filtros</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filtradas.map((m) => {
            const receber = (m.tipo || "pagar") === "receber";
            return (
              <Card key={m.id} className={m.ativo ? "" : "opacity-60"}>
                <CardContent className="py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 rounded-lg p-2 ${receber ? "bg-emerald-500/15 text-emerald-600" : m.tipo_meio === "cartao" ? "bg-violet-500/15 text-violet-600" : "bg-amber-500/15 text-amber-600"}`}>
                      {receber ? <HandCoins className="h-5 w-5" /> : m.tipo_meio === "cartao" ? <CreditCard className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                    </div>
                    <div>
                      <p className="font-semibold">
                        {m.descricao}
                        {m.contato_nome && <span className="font-normal text-muted-foreground"> · {m.contato_nome}</span>}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {meioLabel(m)} · vence todo dia {m.dia_vencimento}
                        {m.categoria_id && mapCat.get(m.categoria_id) ? ` · ${mapCat.get(m.categoria_id)}` : ""}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {!m.ativo && <Badge variant="outline">Pausada</Badge>}
                        {m.valor_variavel && <Badge variant="secondary" className="font-normal" title="O lançamento nasce com este valor de referência; confirme o valor de cada mês antes da baixa.">Valor variável</Badge>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-lg font-numeric font-bold ${receber ? "text-income" : ""}`}>{receber ? "+" : ""}{money(m.valor)}</span>
                    <Button variant="ghost" size="icon" title={m.ativo ? "Pausar" : "Reativar"} onClick={() => alternarAtivo.mutate(m)}>
                      <Power className={`h-4 w-4 ${m.ativo ? "text-income" : "text-muted-foreground"}`} />
                    </Button>
                    <Button variant="ghost" size="icon" title="Editar" onClick={() => abrirEdicao(m)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Excluir"
                      onClick={async () => { if (await confirmar({ title: `Excluir a mensalidade "${m.descricao}"?`, description: "Os meses futuros ainda em aberto saem junto; este mês e o que já foi pago permanecem.", confirmText: "Excluir", destructive: true })) excluir.mutate(m.id); }}
                    >
                      <Trash2 className="h-4 w-4 text-expense" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar mensalidade" : "Nova mensalidade"}</DialogTitle>
            {erp && <DialogDescription>A receber: gera uma conta a receber do cliente todo mês. A pagar: boleto ou cartão.</DialogDescription>}
          </DialogHeader>
          <FormMensalidadeCampos
            form={form}
            setForm={setForm}
            pj={pj}
            erp={erp}
            cartoes={cartoes}
            contas={contas}
            categorias={categoriasForm}
            contatos={contatosDoTipo}
            catLabel={catLabel}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={salvar.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Campos do formulário de mensalidade (também usados pela tela de Clientes e fornecedores). */
export function FormMensalidadeCampos({
  form, setForm, pj, erp, cartoes, contas, categorias, contatos, catLabel, travarTipo, travarContato,
}: {
  form: FormMensalidade;
  setForm: (f: FormMensalidade) => void;
  pj: boolean;
  erp: boolean;
  cartoes: Opcao[];
  contas: Opcao[];
  categorias: Opcao[];
  contatos: Opcao[];
  catLabel: (c: Opcao) => string;
  /** Tipo definido pelo contexto (ex.: aberto a partir de um cliente). */
  travarTipo?: boolean;
  travarContato?: boolean;
}) {
  const receber = erp && form.tipo === "receber";
  return (
    <div className="space-y-3">
      {erp && !travarTipo && (
        <div className="space-y-1.5">
          <Label>O que é</Label>
          <Tabs value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as any, tipo_meio: "boleto", cartao_id: "", categoria_id: "", contato_id: "" })}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="pagar">A pagar</TabsTrigger>
              <TabsTrigger value="receber">A receber de cliente</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      )}
      <div className="space-y-1.5">
        <Label>Descrição *</Label>
        <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder={receber ? "Ex.: Honorários contábeis, Mensalidade do plano" : "Ex.: Netflix, Aluguel, Seguro"} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>{form.valor_variavel ? "Valor de referência *" : "Valor *"}</Label>
          <Input value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} placeholder="39,90" inputMode="decimal" />
        </div>
        <div className="space-y-1.5">
          <Label>Vence dia *</Label>
          <Input type="number" min={1} max={31} value={form.dia_vencimento} onChange={(e) => setForm({ ...form, dia_vencimento: e.target.value })} />
        </div>
      </div>
      {erp && contatos.length > 0 && (
        <div className="space-y-1.5">
          <Label>{receber ? "Cliente" : "Fornecedor"}{travarContato ? "" : " (opcional)"}</Label>
          <Select value={form.contato_id || "none"} onValueChange={(v) => setForm({ ...form, contato_id: v === "none" ? "" : v })} disabled={travarContato}>
            <SelectTrigger><SelectValue placeholder="Escolher" /></SelectTrigger>
            <SelectContent>
              {!travarContato && <SelectItem value="none">Nenhum</SelectItem>}
              {contatos.map((c) => (<SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      )}
      {erp && (
        <label className="flex items-start gap-3 rounded-md border p-3 text-sm">
          <Switch checked={form.valor_variavel} onCheckedChange={(v) => setForm({ ...form, valor_variavel: v })} />
          <span>
            <span className="block font-medium">Valor variável</span>
            <span className="block text-xs text-muted-foreground">
              Muda todo mês (ex.: honorário por faturamento, energia). O lançamento nasce com o valor de referência marcado “valor a confirmar”; ajuste o valor antes de {receber ? "receber" : "pagar"}.
            </span>
          </span>
        </label>
      )}
      {!receber && (
        <div className="space-y-1.5">
          <Label>Como é paga *</Label>
          <Select value={form.tipo_meio} onValueChange={(v) => setForm({ ...form, tipo_meio: v as any, cartao_id: "", conta_bancaria_id: "" })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="boleto">Boleto / conta a pagar</SelectItem>
              <SelectItem value="cartao">Cartão de crédito</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
      {!receber && form.tipo_meio === "cartao" ? (
        <div className="space-y-1.5">
          <Label>Cartão *</Label>
          <Select value={form.cartao_id} onValueChange={(v) => setForm({ ...form, cartao_id: v })}>
            <SelectTrigger><SelectValue placeholder="Escolha o cartão" /></SelectTrigger>
            <SelectContent>
              {cartoes.map((c) => (<SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label>{receber ? "Conta que recebe (opcional)" : "Conta para baixa (opcional)"}</Label>
          <Select value={form.conta_bancaria_id || "none"} onValueChange={(v) => setForm({ ...form, conta_bancaria_id: v === "none" ? "" : v })}>
            <SelectTrigger><SelectValue placeholder={receber ? "Escolher ao receber" : "Escolher ao pagar"} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{receber ? "Escolher ao receber" : "Escolher ao pagar"}</SelectItem>
              {contas.map((c) => (<SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="space-y-1.5">
        <Label>{receber ? "Conta de receita (opcional)" : "Classificação (opcional)"}</Label>
        <Select value={form.categoria_id || "none"} onValueChange={(v) => setForm({ ...form, categoria_id: v === "none" ? "" : v })}>
          <SelectTrigger><SelectValue placeholder="Automática" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Automática</SelectItem>
            {categorias.map((c) => (<SelectItem key={c.id} value={String(c.id)}>{catLabel(c)}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>
      {!form.id && (
        <p className="text-xs text-muted-foreground">
          Ao salvar, já lançamos este mês e os próximos 2. A projeção de 3 meses se renova sozinha todo mês.
        </p>
      )}
    </div>
  );
}
