import { useMemo, useState } from "react";
import { useConfirm } from "@/components/shared/ConfirmDialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { CalendarClock, CreditCard, FileText, Plus, Edit, Trash2, Power } from "lucide-react";

type Mensalidade = {
  id: number;
  descricao: string;
  valor: number | string;
  dia_vencimento: number;
  tipo_meio: "boleto" | "cartao";
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

const freshForm = () => ({
  id: null as number | null,
  descricao: "",
  valor: "",
  dia_vencimento: "10",
  tipo_meio: "boleto" as "boleto" | "cartao",
  categoria_id: "",
  conta_bancaria_id: "",
  cartao_id: "", // guarda o cartão escolhido (forma_pagamento_id no PF, cartao_id no PJ)
});

export default function MensalidadesPage({ empresaId }: { empresaId?: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const pj = empresaId != null;

  const urlLista = `/api/mensalidades${pj ? `?empresa_id=${empresaId}` : ""}`;
  const urlCategorias = pj ? `/api/empresas/${empresaId}/contas` : `/api/categories`;
  const urlCartoes = pj ? `/api/empresas/${empresaId}/cartoes` : `/api/cartoes`;
  const urlContas = pj ? `/api/empresas/${empresaId}/contas-bancarias` : `/api/contas`;

  const { data: mensalidades = [], isLoading } = useQuery<Mensalidade[]>({ queryKey: [urlLista] });
  const { data: categorias = [] } = useQuery<Opcao[]>({ queryKey: [urlCategorias] });
  const { data: cartoes = [] } = useQuery<Opcao[]>({ queryKey: [urlCartoes] });
  const { data: contas = [] } = useQuery<Opcao[]>({ queryKey: [urlContas] });

  const categoriasDespesa = useMemo(
    () => categorias.filter((c) => !c.tipo || /despesa/i.test(String(c.tipo))),
    [categorias],
  );
  const catLabel = (c: Opcao) => (c.codigo ? `${c.codigo} — ${c.nome}` : c.nome);
  const mapCat = useMemo(() => new Map(categorias.map((c) => [c.id, catLabel(c)])), [categorias]);
  const mapCartao = useMemo(() => new Map(cartoes.map((c) => [c.id, c.nome])), [cartoes]);
  const mapConta = useMemo(() => new Map(contas.map((c) => [c.id, c.nome])), [contas]);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(freshForm());
  const confirmar = useConfirm();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: [urlLista] });
    qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] || "").startsWith("/api/cartoes") });
    qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] || "").startsWith("/api/vencimentos") });
    qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0] || "").startsWith("/api/transactions") });
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

  const abrirNovo = () => { setForm(freshForm()); setOpen(true); };
  const abrirEdicao = (m: Mensalidade) => {
    setForm({
      id: m.id,
      descricao: m.descricao,
      valor: String(m.valor),
      dia_vencimento: String(m.dia_vencimento),
      tipo_meio: m.tipo_meio,
      categoria_id: m.categoria_id != null ? String(m.categoria_id) : "",
      conta_bancaria_id: m.conta_bancaria_id != null ? String(m.conta_bancaria_id) : "",
      cartao_id: (pj ? m.cartao_id : m.forma_pagamento_id) != null ? String(pj ? m.cartao_id : m.forma_pagamento_id) : "",
    });
    setOpen(true);
  };

  const submit = () => {
    const valor = Number(String(form.valor).replace(",", "."));
    const dia = Number(form.dia_vencimento);
    if (!form.descricao.trim()) { toast({ title: "Informe a descrição", variant: "destructive" }); return; }
    if (!(valor > 0)) { toast({ title: "Informe um valor válido", variant: "destructive" }); return; }
    if (!(dia >= 1 && dia <= 31)) { toast({ title: "Dia de vencimento: 1 a 31", variant: "destructive" }); return; }
    if (form.tipo_meio === "cartao" && !form.cartao_id) { toast({ title: "Escolha o cartão", variant: "destructive" }); return; }

    const payload: any = {
      ...(pj ? { empresa_id: empresaId } : {}),
      descricao: form.descricao.trim(),
      valor,
      dia_vencimento: dia,
      tipo_meio: form.tipo_meio,
      categoria_id: form.categoria_id ? Number(form.categoria_id) : null,
      conta_bancaria_id: form.tipo_meio === "boleto" && form.conta_bancaria_id ? Number(form.conta_bancaria_id) : null,
      forma_pagamento_id: form.tipo_meio === "cartao" && !pj && form.cartao_id ? Number(form.cartao_id) : null,
      cartao_id: form.tipo_meio === "cartao" && pj && form.cartao_id ? Number(form.cartao_id) : null,
    };
    salvar.mutate(payload);
  };

  const meioLabel = (m: Mensalidade) => {
    if (m.tipo_meio === "cartao") {
      const nome = mapCartao.get((pj ? m.cartao_id : m.forma_pagamento_id) as number);
      return `Cartão${nome ? ` · ${nome}` : ""}`;
    }
    const nome = m.conta_bancaria_id ? mapConta.get(m.conta_bancaria_id) : null;
    return `Boleto${nome ? ` · ${nome}` : ""}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <CalendarClock className="h-7 w-7" /> Mensalidades
          </h1>
          <p className="text-muted-foreground">
            Assinaturas e contas fixas que se repetem todo mês — geradas automaticamente como boleto (conta a pagar) ou lançamento no cartão.
          </p>
        </div>
        <Button onClick={abrirNovo}>
          <Plus className="h-4 w-4 mr-2" /> Nova mensalidade
        </Button>
      </div>

      {isLoading ? (
        <p className="text-muted-foreground">Carregando…</p>
      ) : mensalidades.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Nenhuma mensalidade cadastrada. Clique em <b>Nova mensalidade</b> para começar (ex.: Netflix, aluguel, seguro).
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {mensalidades.map((m) => (
            <Card key={m.id} className={m.ativo ? "" : "opacity-60"}>
              <CardContent className="py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 rounded-lg p-2 ${m.tipo_meio === "cartao" ? "bg-violet-500/15 text-violet-600" : "bg-amber-500/15 text-amber-600"}`}>
                    {m.tipo_meio === "cartao" ? <CreditCard className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
                  </div>
                  <div>
                    <p className="font-semibold">{m.descricao}</p>
                    <p className="text-sm text-muted-foreground">
                      {meioLabel(m)} · vence todo dia {m.dia_vencimento}
                      {m.categoria_id && mapCat.get(m.categoria_id) ? ` · ${mapCat.get(m.categoria_id)}` : ""}
                    </p>
                    {!m.ativo && <Badge variant="outline" className="mt-1">Pausada</Badge>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-numeric font-bold">{money(m.valor)}</span>
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
                    onClick={async () => { if (await confirmar({ title: `Excluir a mensalidade "${m.descricao}"?`, description: "Os lançamentos já gerados permanecem.", confirmText: "Excluir", destructive: true })) excluir.mutate(m.id); }}
                  >
                    <Trash2 className="h-4 w-4 text-expense" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{form.id ? "Editar mensalidade" : "Nova mensalidade"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Descrição *</Label>
              <Input value={form.descricao} onChange={(e) => setForm({ ...form, descricao: e.target.value })} placeholder="Ex.: Netflix, Aluguel, Seguro" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Valor *</Label>
                <Input value={form.valor} onChange={(e) => setForm({ ...form, valor: e.target.value })} placeholder="39,90" />
              </div>
              <div className="space-y-1.5">
                <Label>Vence dia *</Label>
                <Input type="number" min={1} max={31} value={form.dia_vencimento} onChange={(e) => setForm({ ...form, dia_vencimento: e.target.value })} />
              </div>
            </div>
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
            {form.tipo_meio === "cartao" ? (
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
                <Label>Conta para baixa (opcional)</Label>
                <Select value={form.conta_bancaria_id || "none"} onValueChange={(v) => setForm({ ...form, conta_bancaria_id: v === "none" ? "" : v })}>
                  <SelectTrigger><SelectValue placeholder="Escolher ao pagar" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Escolher ao pagar</SelectItem>
                    {contas.map((c) => (<SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Classificação (opcional)</Label>
              <Select value={form.categoria_id || "none"} onValueChange={(v) => setForm({ ...form, categoria_id: v === "none" ? "" : v })}>
                <SelectTrigger><SelectValue placeholder="Automática" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Automática</SelectItem>
                  {categoriasDespesa.map((c) => (<SelectItem key={c.id} value={String(c.id)}>{catLabel(c)}</SelectItem>))}
                </SelectContent>
              </Select>
            </div>
            {!form.id && (
              <p className="text-xs text-muted-foreground">
                O lançamento deste mês é gerado assim que você salvar; os próximos entram sozinhos todo mês.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={submit} disabled={salvar.isPending}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
