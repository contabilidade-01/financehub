import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { apiErp, brl, CabecalhoPagina, formatarDocumento, SomenteErp } from "./comum";

export interface Contato {
  id: number;
  tipo: "cliente" | "fornecedor" | "ambos";
  nome: string;
  documento: string | null;
  email: string | null;
  telefone: string | null;
  observacao: string | null;
  ativo: boolean;
  a_receber: string;
  a_pagar: string;
  cep: string | null;
  logradouro: string | null;
  numero: string | null;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
}

const ROTULO_TIPO = { cliente: "Cliente", fornecedor: "Fornecedor", ambos: "Cliente e fornecedor" } as const;
const VAZIO = {
  nome: "", tipo: "cliente" as Contato["tipo"], documento: "", email: "", telefone: "", observacao: "",
  cep: "", logradouro: "", numero: "", complemento: "", bairro: "", cidade: "", uf: "",
};

const paraEdicao = (c: Contato) => ({
  id: c.id, nome: c.nome, tipo: c.tipo, documento: formatarDocumento(c.documento), email: c.email || "", telefone: c.telefone || "",
  observacao: c.observacao || "", cep: c.cep ? c.cep.replace(/(\d{5})(\d{3})/, "$1-$2") : "", logradouro: c.logradouro || "",
  numero: c.numero || "", complemento: c.complemento || "", bairro: c.bairro || "", cidade: c.cidade || "", uf: c.uf || "",
});

/** Endereço completo: o banco exige para registrar boleto. */
const enderecoCompleto = (c: Pick<Contato, "cep" | "logradouro" | "numero" | "bairro" | "cidade" | "uf" | "documento">) =>
  !!(c.documento && c.cep && c.logradouro && c.numero && c.bairro && c.cidade && c.uf);

export default function ContatosPage({ empresaId }: { empresaId: number }) {
  return (
    <SomenteErp>
      <Contatos empresaId={empresaId} />
    </SomenteErp>
  );
}

function Contatos({ empresaId }: { empresaId: number }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [tipo, setTipo] = useState<"" | "cliente" | "fornecedor">("");
  const [busca, setBusca] = useState("");
  const chave = [`/api/empresas/${empresaId}/erp/contatos`, tipo, busca];
  const { data: contatos = [], isLoading } = useQuery<Contato[]>({
    queryKey: chave,
    queryFn: () => apiErp(`/api/empresas/${empresaId}/erp/contatos?tipo=${tipo}&q=${encodeURIComponent(busca.trim())}`),
  });
  const [editando, setEditando] = useState<(typeof VAZIO & { id?: number }) | null>(null);
  const [removendo, setRemovendo] = useState<Contato | null>(null);
  const [fichaId, setFichaId] = useState<number | null>(null);
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    if (!editando) return;
    setSalvando(true);
    try {
      const { id, ...corpo } = editando;
      await apiErp(`/api/empresas/${empresaId}/erp/contatos${id ? `/${id}` : ""}`, { method: id ? "PUT" : "POST", body: corpo });
      toast({ title: id ? "Cadastro atualizado" : "Cadastro criado" });
      setEditando(null);
      qc.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/erp/contatos`] });
    } catch (e: any) {
      toast({ title: "Não foi possível salvar", description: e?.message, variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  const remover = async () => {
    if (!removendo) return;
    try {
      const r = await apiErp<{ inativado: boolean }>(`/api/empresas/${empresaId}/erp/contatos/${removendo.id}`, { method: "DELETE" });
      toast({ title: r.inativado ? "Cadastro inativado" : "Cadastro excluído", description: r.inativado ? "Tem lançamentos vinculados; o histórico foi preservado." : undefined });
      qc.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/erp/contatos`] });
    } catch (e: any) {
      toast({ title: "Não foi possível excluir", description: e?.message, variant: "destructive" });
    } finally {
      setRemovendo(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <CabecalhoPagina
        titulo="Clientes e fornecedores"
        descricao="Cadastro usado em contas a receber, contas a pagar e relatórios."
        acoes={<Button onClick={() => setEditando({ ...VAZIO })}><Plus className="mr-2 h-4 w-4" />Novo cadastro</Button>}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tipo || "todos"} onValueChange={(v) => setTipo(v === "todos" ? "" : (v as any))}>
          <TabsList>
            <TabsTrigger value="todos">Todos</TabsTrigger>
            <TabsTrigger value="cliente">Clientes</TabsTrigger>
            <TabsTrigger value="fornecedor">Fornecedores</TabsTrigger>
          </TabsList>
        </Tabs>
        <Input placeholder="Buscar por nome ou CPF/CNPJ" value={busca} onChange={(e) => setBusca(e.target.value)} className="sm:w-72" />
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
          ) : !contatos.length ? (
            <p className="p-6 text-sm text-muted-foreground">Nenhum cadastro encontrado.</p>
          ) : (
            <>
              <table className="hidden w-full text-sm md:table">
                <thead className="border-b bg-muted/40 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Nome</th>
                    <th className="px-2 py-2 text-left font-medium">Tipo</th>
                    <th className="px-2 py-2 text-left font-medium">CPF/CNPJ</th>
                    <th className="px-2 py-2 text-left font-medium">Contato</th>
                    <th className="px-2 py-2 text-right font-medium">A receber</th>
                    <th className="px-2 py-2 text-right font-medium">A pagar</th>
                    <th className="w-24 px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {contatos.map((c) => (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium">
                        <button type="button" className="text-left hover:underline" onClick={() => setFichaId(c.id)}>{c.nome}</button>
                        {c.tipo !== "fornecedor" && !enderecoCompleto(c) && <div className="text-xs font-normal text-muted-foreground">Sem endereço completo para boleto</div>}
                      </td>
                      <td className="px-2 py-2"><Badge variant="outline" className="font-normal">{ROTULO_TIPO[c.tipo]}</Badge></td>
                      <td className="px-2 py-2 tabular-nums text-muted-foreground">{formatarDocumento(c.documento)}</td>
                      <td className="px-2 py-2 text-muted-foreground">{[c.email, c.telefone].filter(Boolean).join(" · ")}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{Number(c.a_receber) ? brl(c.a_receber) : "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{Number(c.a_pagar) ? brl(c.a_pagar) : "—"}</td>
                      <td className="px-4 py-2 text-right">
                        <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => setEditando(paraEdicao(c))}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => setRemovendo(c)}><Trash2 className="h-4 w-4" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="divide-y md:hidden">
                {contatos.map((c) => (
                  <button key={c.id} type="button" className="w-full px-4 py-3 text-left" onClick={() => setFichaId(c.id)}>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium">{c.nome}</span>
                      <Badge variant="outline" className="font-normal">{ROTULO_TIPO[c.tipo]}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {formatarDocumento(c.documento) || "Sem documento"}
                      {Number(c.a_receber) > 0 && ` · a receber ${brl(c.a_receber)}`}
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editando} onOpenChange={(o) => !o && setEditando(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editando?.id ? "Editar cadastro" : "Novo cadastro"}</DialogTitle>
            <DialogDescription>Cliente, fornecedor ou os dois.</DialogDescription>
          </DialogHeader>
          {editando && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ct-nome">Nome / razão social</Label>
                <Input id="ct-nome" value={editando.nome} onChange={(e) => setEditando({ ...editando, nome: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={editando.tipo} onValueChange={(v) => setEditando({ ...editando, tipo: v as any })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cliente">Cliente</SelectItem>
                    <SelectItem value="fornecedor">Fornecedor</SelectItem>
                    <SelectItem value="ambos">Cliente e fornecedor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ct-doc">CPF/CNPJ</Label>
                <Input id="ct-doc" inputMode="numeric" value={editando.documento} onChange={(e) => setEditando({ ...editando, documento: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ct-email">E-mail</Label>
                <Input id="ct-email" type="email" value={editando.email} onChange={(e) => setEditando({ ...editando, email: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ct-tel">Telefone</Label>
                <Input id="ct-tel" inputMode="tel" value={editando.telefone} onChange={(e) => setEditando({ ...editando, telefone: e.target.value })} />
              </div>
              <div className="pt-1 text-sm font-medium sm:col-span-2">
                Endereço <span className="font-normal text-muted-foreground">(necessário para emitir boleto)</span>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ct-cep">CEP</Label>
                <Input id="ct-cep" inputMode="numeric" value={editando.cep} placeholder="00000-000"
                  onChange={(e) => setEditando({ ...editando, cep: e.target.value.replace(/\D/g, "").slice(0, 8).replace(/(\d{5})(\d)/, "$1-$2") })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ct-uf">UF</Label>
                <Input id="ct-uf" maxLength={2} value={editando.uf} onChange={(e) => setEditando({ ...editando, uf: e.target.value.replace(/[^a-z]/gi, "").toUpperCase() })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ct-log">Logradouro</Label>
                <Input id="ct-log" value={editando.logradouro} onChange={(e) => setEditando({ ...editando, logradouro: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ct-num">Número</Label>
                <Input id="ct-num" value={editando.numero} onChange={(e) => setEditando({ ...editando, numero: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ct-comp">Complemento</Label>
                <Input id="ct-comp" value={editando.complemento} onChange={(e) => setEditando({ ...editando, complemento: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ct-bairro">Bairro</Label>
                <Input id="ct-bairro" value={editando.bairro} onChange={(e) => setEditando({ ...editando, bairro: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ct-cid">Cidade</Label>
                <Input id="ct-cid" value={editando.cidade} onChange={(e) => setEditando({ ...editando, cidade: e.target.value })} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="ct-obs">Observação</Label>
                <Textarea id="ct-obs" rows={2} value={editando.observacao} onChange={(e) => setEditando({ ...editando, observacao: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditando(null)}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando || (editando?.nome.trim().length ?? 0) < 2}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FichaContato
        empresaId={empresaId}
        id={fichaId}
        onFechar={() => setFichaId(null)}
        onEditar={(c) => { setFichaId(null); setEditando(paraEdicao(c)); }}
      />

      <AlertDialog open={!!removendo} onOpenChange={(o) => !o && setRemovendo(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{removendo?.nome}”?</AlertDialogTitle>
            <AlertDialogDescription>Se houver lançamentos vinculados, o cadastro é só inativado para preservar o histórico.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remover}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface Ficha {
  contato: Contato;
  totais: { recebido: number; a_receber: number; vencido: number; pago: number; a_pagar: number; atraso_medio_dias: number | null };
  lancamentos: { id: number; descricao: string; valor: string; tipo: string; status: string; data_transacao: string; data_vencimento: string | null; data_pagamento: string | null }[];
  cobrancas: { id: number; status: string; valor: string; valor_pago: string | null; vencimento: string; pago_em: string | null; url_pdf: string | null }[];
}

const ROTULO_COBRANCA: Record<string, string> = { aberta: "Em aberto", processando: "Processando", paga: "Paga", vencida: "Vencida", cancelada: "Cancelada" };

/** Ficha do cliente/fornecedor: quanto já pagou, quanto deve, atraso médio e histórico. */
function FichaContato({ empresaId, id, onFechar, onEditar }: { empresaId: number; id: number | null; onFechar: () => void; onEditar: (c: Contato) => void }) {
  const url = `/api/empresas/${empresaId}/erp/contatos/${id}/ficha`;
  const { data, isLoading } = useQuery<Ficha>({ queryKey: [url], queryFn: () => apiErp(url), enabled: !!id });
  const c = data?.contato;
  const endereco = c && [c.logradouro && `${c.logradouro}${c.numero ? `, ${c.numero}` : ""}`, c.complemento, c.bairro, c.cidade && `${c.cidade}${c.uf ? `/${c.uf}` : ""}`, c.cep && c.cep.replace(/(\d{5})(\d{3})/, "$1-$2")].filter(Boolean).join(" · ");
  return (
    <Sheet open={!!id} onOpenChange={(o) => !o && onFechar()}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{c?.nome || "Cadastro"}</SheetTitle>
          <SheetDescription>{c ? [ROTULO_TIPO[c.tipo], formatarDocumento(c.documento), c.email, c.telefone].filter(Boolean).join(" · ") : ""}</SheetDescription>
        </SheetHeader>
        {isLoading || !data ? (
          <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>
        ) : (
          <div className="mt-4 space-y-5">
            <div className="text-sm text-muted-foreground">{endereco || "Sem endereço cadastrado."}</div>
            <Button variant="outline" size="sm" onClick={() => onEditar(data.contato)}><Pencil className="mr-2 h-4 w-4" />Editar cadastro</Button>
            <div className="grid grid-cols-2 gap-3">
              {[
                { r: "Já recebido", v: brl(data.totais.recebido) },
                { r: "A receber", v: brl(data.totais.a_receber), d: data.totais.vencido ? `${brl(data.totais.vencido)} vencido` : undefined },
                { r: "Atraso médio", v: data.totais.atraso_medio_dias === null ? "—" : `${data.totais.atraso_medio_dias.toLocaleString("pt-BR")} dia(s)` },
                { r: "A pagar", v: brl(data.totais.a_pagar), d: data.totais.pago ? `${brl(data.totais.pago)} já pago` : undefined },
              ].map((k) => (
                <div key={k.r} className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">{k.r}</div>
                  <div className="font-semibold">{k.v}</div>
                  {k.d && <div className="text-xs text-red-700 dark:text-red-400">{k.d}</div>}
                </div>
              ))}
            </div>
            {data.cobrancas.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium">Cobranças Cora</div>
                <div className="divide-y rounded-md border">
                  {data.cobrancas.map((cb) => (
                    <div key={cb.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="tabular-nums text-muted-foreground">{String(cb.vencimento).slice(0, 10).split("-").reverse().join("/")}</span>
                      <Badge variant={cb.status === "paga" ? "secondary" : cb.status === "vencida" ? "destructive" : "outline"} className="font-normal">{ROTULO_COBRANCA[cb.status] || cb.status}</Badge>
                      <span className="tabular-nums">{brl(cb.valor_pago ?? cb.valor)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-2">
              <div className="text-sm font-medium">Lançamentos</div>
              <div className="divide-y rounded-md border">
                {!data.lancamentos.length && <p className="p-3 text-sm text-muted-foreground">Nenhum lançamento.</p>}
                {data.lancamentos.map((l) => (
                  <div key={l.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="w-20 shrink-0 tabular-nums text-muted-foreground">{String(l.data_vencimento || l.data_transacao).slice(0, 10).split("-").reverse().join("/")}</span>
                    <span className="min-w-0 flex-1 truncate">{l.descricao}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{l.status === "Pendente" ? "em aberto" : "baixado"}</span>
                    <span className={l.tipo === "Receita" ? "shrink-0 tabular-nums text-emerald-700 dark:text-emerald-400" : "shrink-0 tabular-nums text-red-700 dark:text-red-400"}>
                      {l.tipo === "Receita" ? "+" : "−"}{brl(l.valor)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
