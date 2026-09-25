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
}

const ROTULO_TIPO = { cliente: "Cliente", fornecedor: "Fornecedor", ambos: "Cliente e fornecedor" } as const;
const VAZIO = { nome: "", tipo: "cliente" as Contato["tipo"], documento: "", email: "", telefone: "", observacao: "" };

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
                      <td className="px-4 py-2 font-medium">{c.nome}</td>
                      <td className="px-2 py-2"><Badge variant="outline" className="font-normal">{ROTULO_TIPO[c.tipo]}</Badge></td>
                      <td className="px-2 py-2 tabular-nums text-muted-foreground">{formatarDocumento(c.documento)}</td>
                      <td className="px-2 py-2 text-muted-foreground">{[c.email, c.telefone].filter(Boolean).join(" · ")}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{Number(c.a_receber) ? brl(c.a_receber) : "—"}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{Number(c.a_pagar) ? brl(c.a_pagar) : "—"}</td>
                      <td className="px-4 py-2 text-right">
                        <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => setEditando({ id: c.id, nome: c.nome, tipo: c.tipo, documento: formatarDocumento(c.documento), email: c.email || "", telefone: c.telefone || "", observacao: c.observacao || "" })}><Pencil className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" aria-label="Excluir" onClick={() => setRemovendo(c)}><Trash2 className="h-4 w-4" /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="divide-y md:hidden">
                {contatos.map((c) => (
                  <button key={c.id} type="button" className="w-full px-4 py-3 text-left" onClick={() => setEditando({ id: c.id, nome: c.nome, tipo: c.tipo, documento: formatarDocumento(c.documento), email: c.email || "", telefone: c.telefone || "", observacao: c.observacao || "" })}>
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
        <DialogContent>
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
