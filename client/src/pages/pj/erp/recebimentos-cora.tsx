import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Loader2, Mail, MoreHorizontal, Plus, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FiltroBar, useFiltrosUrl } from "@/components/shared/FiltroBar";
import { useConfirm } from "@/components/shared/ConfirmDialog";
import { ContaPlanoCombobox, usePlanoContasPj } from "@/components/shared/ContaPlanoCombobox";
import { ConexaoCora, useConexaoCora } from "@/components/cora/ConexaoCora";
import { useFlag, FLAG_INTEGRACAO_CORA } from "@/hooks/use-flag";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiErp, brl, CabecalhoPagina, dataBr, SomenteErp } from "./comum";
import { ContatoCombobox } from "./titulos";
import type { Contato } from "./contatos";

interface Cobranca {
  id: number;
  provedor_id: string | null;
  transacao_id: number | null;
  contato_nome: string | null;
  contato_email: string | null;
  descricao: string | null;
  status: "aberta" | "processando" | "paga" | "vencida" | "cancelada";
  valor: string;
  valor_pago: string | null;
  vencimento: string;
  pago_em: string | null;
  linha_digitavel: string | null;
  pix_copia_cola: string | null;
  url_pdf: string | null;
}

const ROTULO: Record<Cobranca["status"], string> = { aberta: "Em aberto", processando: "Processando", paga: "Paga", vencida: "Vencida", cancelada: "Cancelada" };

export default function RecebimentosCoraPage({ empresaId }: { empresaId: number }) {
  return (
    <SomenteErp>
      <RecebimentosCora empresaId={empresaId} />
    </SomenteErp>
  );
}

const PADRAO = { aba: "cobrancas", status: "", periodo: "", de: "", ate: "", q: "", contato_id: "" };

function RecebimentosCora({ empresaId }: { empresaId: number }) {
  const { ativa, carregando } = useFlag(FLAG_INTEGRACAO_CORA);
  const { valores: f, definir, limpar, ativos } = useFiltrosUrl(PADRAO);
  const { data: bancos = [] } = useQuery<any[]>({ queryKey: [`/api/empresas/${empresaId}/contas-bancarias`], queryFn: () => apiErp(`/api/empresas/${empresaId}/contas-bancarias`) });
  const conexao = useConexaoCora(ativa ? empresaId : null);

  if (carregando) return null;
  if (!ativa) {
    return (
      <Card className="mx-auto max-w-2xl">
        <CardContent className="space-y-2 p-6 text-sm">
          <p className="font-medium">Recebimentos via Cora ainda não estão liberados para a sua conta.</p>
          <p className="text-muted-foreground">Fale com o suporte para participar da liberação.</p>
        </CardContent>
      </Card>
    );
  }

  // Sem conexão ativa, só a aba Conexão faz sentido.
  const aba = !conexao.isLoading && !conexao.conectada ? "conexao" : f.aba === "conexao" ? "conexao" : "cobrancas";
  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <CabecalhoPagina
        titulo="Recebimentos Cora"
        descricao="Emita boleto e Pix pela conta Cora da empresa. Quando o cliente paga, a conta a receber é baixada sozinha, na data e no valor pagos."
      />
      <Tabs value={aba} onValueChange={(v) => definir({ aba: v })}>
        <TabsList>
          <TabsTrigger value="cobrancas" disabled={!conexao.conectada}>Cobranças</TabsTrigger>
          <TabsTrigger value="conexao">Conexão</TabsTrigger>
        </TabsList>
      </Tabs>
      {aba === "conexao" ? (
        <ConexaoCora empresaId={empresaId} bancos={bancos} />
      ) : (
        <Cobrancas empresaId={empresaId} f={f} definir={definir} limpar={limpar} ativos={ativos} />
      )}
    </div>
  );
}

function Cobrancas({ empresaId, f, definir, limpar, ativos }: { empresaId: number; f: typeof PADRAO; definir: (p: Partial<typeof PADRAO>) => void; limpar: () => void; ativos: number }) {
  const { toast } = useToast();
  const confirmar = useConfirm();
  const qc = useQueryClient();
  const qs = new URLSearchParams(Object.entries(f).filter(([k, v]) => v && !["aba", "periodo"].includes(k))).toString();
  const url = `/api/empresas/${empresaId}/erp/cobrancas?${qs}`;
  const { data, isLoading } = useQuery<{ linhas: Cobranca[]; resumo: { emitido: number; recebido: number; em_aberto: number; vencido: number } }>({ queryKey: [url], queryFn: () => apiErp(url) });
  const { data: clientes = [] } = useQuery<Contato[]>({ queryKey: [`/api/empresas/${empresaId}/erp/contatos`, "cliente"], queryFn: () => apiErp(`/api/empresas/${empresaId}/erp/contatos?tipo=cliente`) });
  const { contas: categorias, grupos, criarConta } = usePlanoContasPj(empresaId);
  const [nova, setNova] = useState<null | { descricao: string; valor: string; data_vencimento: string; contato_id: number | null; categoria_id: number | null; desconto_pct: string }>(null);
  const [ocupado, setOcupado] = useState<number | "nova" | null>(null);

  const atualizar = () => qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes(`/api/empresas/${empresaId}/`) });

  const acao = async (c: Cobranca, tipo: "sincronizar" | "cancelar" | "email") => {
    if (tipo === "cancelar" && !(await confirmar({ title: "Cancelar esta cobrança no Cora?", description: "O boleto e o Pix deixam de valer. A conta a receber continua em aberto.", confirmText: "Cancelar cobrança", destructive: true }))) return;
    setOcupado(c.id);
    try {
      const r = await apiErp<any>(`/api/empresas/${empresaId}/erp/cobrancas/${c.id}/${tipo}`, { method: "POST" });
      toast({
        title: tipo === "email" ? `Cobrança enviada para ${c.contato_email}` : tipo === "cancelar" ? "Cobrança cancelada" : r.baixou ? "Pagamento encontrado e baixado" : `Situação: ${ROTULO[r.status as Cobranca["status"]] || r.status}`,
      });
      atualizar();
    } catch (e: any) {
      toast({ title: "Não foi possível concluir", description: e?.message, variant: "destructive" });
    } finally {
      setOcupado(null);
    }
  };

  const copiar = async (texto: string | null, oque: string) => {
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      toast({ title: `${oque} copiado` });
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  const emitir = async () => {
    if (!nova) return;
    setOcupado("nova");
    try {
      const r = await apiErp<{ emitidas: number; resultados: { ok: boolean; erro?: string }[] }>(`/api/empresas/${empresaId}/erp/cobrancas`, {
        method: "POST",
        body: { ...nova, desconto_pct: nova.desconto_pct ? Number(nova.desconto_pct.replace(",", ".")) : null },
      });
      if (r.emitidas) {
        toast({ title: "Cobrança emitida", description: "Boleto e Pix prontos para enviar ao cliente." });
        setNova(null);
      } else {
        toast({ title: "Não foi emitida", description: r.resultados[0]?.erro, variant: "destructive" });
      }
      atualizar();
    } catch (e: any) {
      toast({ title: "Não foi possível emitir", description: e?.message, variant: "destructive" });
    } finally {
      setOcupado(null);
    }
  };

  const linhas = data?.linhas ?? [];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { r: "Emitido", v: data?.resumo.emitido },
          { r: "Recebido", v: data?.resumo.recebido, cor: "text-emerald-700 dark:text-emerald-400" },
          { r: "Em aberto", v: data?.resumo.em_aberto },
          { r: "Vencido", v: data?.resumo.vencido, cor: "text-red-700 dark:text-red-400" },
        ].map((k) => (
          <Card key={k.r}>
            <CardContent className="p-4">
              <div className="text-xs font-medium text-muted-foreground">{k.r}</div>
              <div className={cn("mt-1 text-xl font-semibold", k.cor)}>{brl(k.v)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <FiltroBar
        valores={f}
        definir={definir as any}
        limpar={limpar}
        ativos={ativos}
        busca="Buscar por cliente ou descrição"
        periodo={{ rotulo: "Vencimento" }}
        inicio={
          <div className="flex flex-wrap items-center gap-2">
            <Tabs value={f.status || "todas"} onValueChange={(v) => definir({ status: v === "todas" ? "" : v })}>
              <TabsList>
                <TabsTrigger value="todas">Todas</TabsTrigger>
                <TabsTrigger value="aberta">Em aberto</TabsTrigger>
                <TabsTrigger value="vencida">Vencidas</TabsTrigger>
                <TabsTrigger value="paga">Pagas</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button onClick={() => setNova({ descricao: "", valor: "", data_vencimento: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10), contato_id: null, categoria_id: null, desconto_pct: "" })}>
              <Plus className="mr-2 h-4 w-4" />Nova cobrança
            </Button>
          </div>
        }
        selects={[{ chave: "contato_id", rotulo: "Cliente", opcoes: clientes.map((c) => ({ valor: String(c.id), rotulo: c.nome })) }]}
      />

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>
          ) : !linhas.length ? (
            <div className="space-y-1 p-6 text-sm text-muted-foreground">
              <p>Nenhuma cobrança {ativos ? "com estes filtros" : "emitida ainda"}.</p>
              <p>Emita aqui ou em Contas a receber: selecione as contas e use "Cobrar via Cora".</p>
            </div>
          ) : (
            <div className="divide-y">
              {linhas.map((c) => (
                <div key={c.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="w-20 shrink-0 text-sm tabular-nums text-muted-foreground">{dataBr(c.vencimento)}</span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{c.contato_nome || "—"}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {c.descricao}
                        {c.status === "paga" && c.pago_em && ` · paga em ${dataBr(c.pago_em)}`}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end">
                    <Badge variant={c.status === "paga" ? "secondary" : c.status === "vencida" ? "destructive" : "outline"} className="font-normal">{ROTULO[c.status]}</Badge>
                    <span className="w-28 text-right font-medium tabular-nums">{brl(c.valor_pago ?? c.valor)}</span>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Ações da cobrança" disabled={ocupado === c.id}>
                          {ocupado === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {c.pix_copia_cola && <DropdownMenuItem onClick={() => copiar(c.pix_copia_cola, "Pix copia e cola")}><Copy className="mr-2 h-4 w-4" />Copiar Pix</DropdownMenuItem>}
                        {c.linha_digitavel && <DropdownMenuItem onClick={() => copiar(c.linha_digitavel, "Linha digitável")}><Copy className="mr-2 h-4 w-4" />Copiar linha digitável</DropdownMenuItem>}
                        {c.url_pdf && <DropdownMenuItem asChild><a href={c.url_pdf} target="_blank" rel="noopener noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Abrir boleto (PDF)</a></DropdownMenuItem>}
                        {c.contato_email && c.status !== "paga" && c.status !== "cancelada" && (
                          <DropdownMenuItem onClick={() => acao(c, "email")}><Mail className="mr-2 h-4 w-4" />Enviar por e-mail</DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => acao(c, "sincronizar")}><RefreshCw className="mr-2 h-4 w-4" />Conferir no Cora</DropdownMenuItem>
                        {(c.status === "aberta" || c.status === "vencida") && (
                          <DropdownMenuItem className="text-destructive" onClick={() => acao(c, "cancelar")}><XCircle className="mr-2 h-4 w-4" />Cancelar cobrança</DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!nova} onOpenChange={(o) => !o && setNova(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Nova cobrança</DialogTitle>
            <DialogDescription>Cria a conta a receber e emite boleto e Pix no Cora. O cliente precisa ter CPF/CNPJ e endereço completos.</DialogDescription>
          </DialogHeader>
          {nova && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Cliente</Label>
                <ContatoCombobox empresaId={empresaId} tipo="cliente" contatos={clientes} valor={nova.contato_id} onChange={(id) => setNova({ ...nova, contato_id: id })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="nc-desc">Descrição</Label>
                <Input id="nc-desc" value={nova.descricao} onChange={(e) => setNova({ ...nova, descricao: e.target.value })} placeholder="ex.: Pedido 1234" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nc-valor">Valor (R$)</Label>
                <Input id="nc-valor" inputMode="decimal" value={nova.valor} onChange={(e) => setNova({ ...nova, valor: e.target.value })} placeholder="0,00" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nc-venc">Vencimento</Label>
                <Input id="nc-venc" type="date" value={nova.data_vencimento} onChange={(e) => setNova({ ...nova, data_vencimento: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Conta de receita</Label>
                <ContaPlanoCombobox categorias={categorias} grupos={grupos} tipo="Receita" valor={nova.categoria_id} onChange={(id) => setNova({ ...nova, categoria_id: id })} onCriar={criarConta} escopo="pj" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nc-desconto">Desconto até o vencimento (%)</Label>
                <Input id="nc-desconto" inputMode="decimal" value={nova.desconto_pct} onChange={(e) => setNova({ ...nova, desconto_pct: e.target.value })} placeholder="0" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setNova(null)}>Cancelar</Button>
            <Button onClick={emitir} disabled={ocupado === "nova" || !nova?.contato_id || !nova?.categoria_id || !nova?.valor || !nova?.descricao.trim()}>
              {ocupado === "nova" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Emitir boleto e Pix
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
