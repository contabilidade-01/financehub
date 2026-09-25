import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, FolderPlus, Loader2, Pencil, Plus, RotateCcw, Search, Trash2, Wand2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader } from "@/components/shared/PageHeader";
import { useConfirm } from "@/components/shared/ConfirmDialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import {
  GRUPOS_GERENCIAIS, ROTULO_GRUPO, DESCRICAO_GRUPO, ROTULO_MODELO_PLANO,
  classificacaoDoGrupo, compararCodigos, grupoEfetivo,
  type GrupoGerencialId, type ModeloPlanoId,
} from "@shared/plano-contas-grupos";

interface Conta {
  id: number;
  codigo: string;
  nome: string;
  tipo: "Receita" | "Despesa";
  classificacao: string;
  grupo_gerencial: string | null;
  is_cmv: boolean;
  sintetica: boolean;
  parent_id: number | null;
  ativo: boolean;
  descricao: string | null;
  lancamentos: number;
}

type Edicao = {
  id?: number;
  sintetica: boolean;
  nome: string;
  codigo: string;
  tipo: "Receita" | "Despesa";
  parent_id: string; // "" = sem grupo
  grupo_gerencial: GrupoGerencialId;
  is_cmv: boolean;
  lancamentos: number;
};

async function api<T = any>(url: string, method = "GET", body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = res.status === 204 ? {} : await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `Erro ${res.status}`);
  return data as T;
}

/**
 * Plano de contas em árvore: grupos (só somam) e contas (recebem lançamentos).
 * Modelos Base Serviços / Base Comércio; conta com lançamentos é inativada.
 */
export default function PjCategorias({ empresaId }: { empresaId: number }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const confirmar = useConfirm();
  const url = `/api/empresas/${empresaId}/contas`;
  const chaveArvore = [`${url}?arvore=1`];
  const { data: contas = [], isLoading } = useQuery<Conta[]>({
    queryKey: chaveArvore,
    queryFn: () => api(`${url}?arvore=1`),
    enabled: !!empresaId,
  });

  const [busca, setBusca] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<"todos" | "Receita" | "Despesa">("todos");
  const [verInativas, setVerInativas] = useState(false);
  const [fechados, setFechados] = useState<Set<number>>(new Set());
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [modeloAberto, setModeloAberto] = useState(false);
  const [modelo, setModelo] = useState<ModeloPlanoId>("comercio");

  const atualizar = () => {
    qc.invalidateQueries({ queryKey: chaveArvore });
    qc.invalidateQueries({ queryKey: [url] });
  };

  const grupos = useMemo(() => contas.filter((c) => c.sintetica).sort((a, b) => compararCodigos(a.codigo, b.codigo)), [contas]);

  // Árvore filtrada: um grupo aparece se ele ou alguma filha casa com o filtro.
  const arvore = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const casa = (c: Conta) =>
      (verInativas || c.ativo) &&
      (filtroTipo === "todos" || c.tipo === filtroTipo) &&
      (!termo || c.nome.toLowerCase().includes(termo) || c.codigo.startsWith(termo));
    const filhas = (paiId: number | null) =>
      contas.filter((c) => c.parent_id === paiId && !c.sintetica).sort((a, b) => compararCodigos(a.codigo, b.codigo));
    const blocos = grupos
      .map((g) => ({ grupo: g, contas: filhas(g.id).filter(casa) }))
      .filter((b) => b.contas.length > 0 || (casa(b.grupo) && !termo && filtroTipo === "todos"));
    const soltas = contas.filter((c) => !c.sintetica && (c.parent_id === null || !grupos.some((g) => g.id === c.parent_id))).filter(casa)
      .sort((a, b) => compararCodigos(a.codigo, b.codigo));
    return { blocos, soltas };
  }, [contas, grupos, busca, filtroTipo, verInativas]);

  const abrirNova = (sintetica: boolean, pai?: Conta) => {
    const grupo = pai ? grupoEfetivo(pai) : sintetica ? "despesa_fixa" : "despesa_fixa";
    setEdicao({
      sintetica,
      nome: "",
      codigo: "",
      tipo: pai?.tipo === "Receita" || grupo === "receita" ? "Receita" : "Despesa",
      parent_id: pai ? String(pai.id) : grupos[0] && !sintetica ? String(grupos.find((g) => grupoEfetivo(g) === grupo)?.id ?? "") : "",
      grupo_gerencial: grupo,
      is_cmv: false,
      lancamentos: 0,
    });
  };

  const abrirEdicao = (c: Conta) =>
    setEdicao({
      id: c.id,
      sintetica: c.sintetica,
      nome: c.nome,
      codigo: c.codigo,
      tipo: c.tipo,
      parent_id: c.parent_id ? String(c.parent_id) : "",
      grupo_gerencial: grupoEfetivo(c),
      is_cmv: c.is_cmv,
      lancamentos: c.lancamentos,
    });

  const salvar = async () => {
    if (!edicao) return;
    setSalvando(true);
    try {
      const pai = grupos.find((g) => String(g.id) === edicao.parent_id);
      const grupo = !edicao.sintetica && pai ? grupoEfetivo(pai) : edicao.grupo_gerencial;
      const corpo: any = {
        nome: edicao.nome.trim(),
        tipo: edicao.tipo,
        classificacao: classificacaoDoGrupo(grupo),
        grupo_gerencial: grupo,
        is_cmv: grupo === "custo_variavel" ? edicao.is_cmv : false,
        sintetica: edicao.sintetica,
        parent_id: edicao.sintetica ? null : pai ? pai.id : null,
      };
      if (edicao.codigo.trim()) corpo.codigo = edicao.codigo.trim();
      if (edicao.id) {
        // Mudou de grupo sem mexer no código: o servidor gera o código no grupo novo.
        const original = contas.find((c) => c.id === edicao.id);
        if (original && String(original.parent_id ?? "") !== edicao.parent_id && edicao.codigo === original.codigo) delete corpo.codigo;
        await api(`${url}/${edicao.id}`, "PUT", corpo);
      } else {
        await api(url, "POST", corpo);
      }
      toast({ title: edicao.id ? "Conta atualizada" : edicao.sintetica ? "Grupo criado" : "Conta criada" });
      setEdicao(null);
      atualizar();
    } catch (e: any) {
      toast({ title: "Não foi possível salvar", description: e?.message, variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  const remover = async (c: Conta) => {
    const ok = await confirmar({
      title: c.lancamentos ? `Inativar "${c.nome}"?` : `Excluir "${c.nome}"?`,
      description: c.lancamentos
        ? `A conta tem ${c.lancamentos} lançamento(s): ela sai dos formulários, mas continua nos relatórios.`
        : "A conta não tem lançamentos e será excluída.",
      confirmText: c.lancamentos ? "Inativar" : "Excluir",
      destructive: true,
    });
    if (!ok) return;
    try {
      const r = await api<{ inativado?: boolean }>(`${url}/${c.id}`, "DELETE");
      toast({ title: r?.inativado ? "Conta inativada" : "Conta excluída" });
      atualizar();
    } catch (e: any) {
      toast({ title: "Não foi possível remover", description: e?.message, variant: "destructive" });
    }
  };

  const reativar = async (c: Conta) => {
    try {
      await api(`${url}/${c.id}`, "PUT", { ativo: true });
      toast({ title: "Conta reativada" });
      atualizar();
    } catch (e: any) {
      toast({ title: "Não foi possível reativar", description: e?.message, variant: "destructive" });
    }
  };

  const completar = async () => {
    try {
      const r = await api<{ criadas: number }>(`${url}/completar-modelo`, "POST", { modelo });
      toast({ title: r.criadas ? `${r.criadas} conta(s) adicionada(s)` : "O plano já tem todas as contas do modelo" });
      setModeloAberto(false);
      atualizar();
    } catch (e: any) {
      toast({ title: "Não foi possível completar", description: e?.message, variant: "destructive" });
    }
  };

  const alternar = (id: number) =>
    setFechados((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const linhaConta = (c: Conta, recuo: boolean) => (
    <div key={c.id} className={cn("flex items-center gap-2 border-t px-3 py-2 text-sm", recuo && "pl-9 sm:pl-10", !c.ativo && "opacity-60")}>
      <span className="w-14 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{c.codigo}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="truncate">{c.nome}</span>
          {c.is_cmv && <Badge variant="outline" className="h-5 px-1.5 text-[11px]">CMV/CSP</Badge>}
          {!c.ativo && <Badge variant="secondary" className="h-5 px-1.5 text-[11px]">Inativa</Badge>}
        </div>
        {c.lancamentos > 0 && <div className="text-xs text-muted-foreground">{c.lancamentos} lançamento(s)</div>}
      </div>
      <Badge variant="outline" className={cn("hidden h-5 px-1.5 text-[11px] sm:inline-flex", c.tipo === "Receita" ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground")}>
        {c.tipo}
      </Badge>
      {c.ativo ? (
        <>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Editar ${c.nome}`} onClick={() => abrirEdicao(c)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Remover ${c.nome}`} onClick={() => remover(c)}><Trash2 className="h-4 w-4" /></Button>
        </>
      ) : (
        <Button variant="ghost" size="sm" onClick={() => reativar(c)}><RotateCcw className="mr-1 h-3.5 w-3.5" />Reativar</Button>
      )}
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-5xl">
      <PageHeader
        title="Plano de contas"
        description="Grupos organizam e somam; os lançamentos vão sempre numa conta dentro de um grupo. O grupo define onde a conta entra na DRE, na margem de contribuição e no ponto de equilíbrio."
        actions={
          <>
            <Button variant="outline" onClick={() => setModeloAberto(true)}><Wand2 className="mr-2 h-4 w-4" />Completar com modelo</Button>
            <Button variant="outline" onClick={() => abrirNova(true)}><FolderPlus className="mr-2 h-4 w-4" />Novo grupo</Button>
            <Button onClick={() => abrirNova(false)}><Plus className="mr-2 h-4 w-4" />Nova conta</Button>
          </>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar por nome ou código" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar conta" />
          </div>
          <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as any)}>
            <SelectTrigger className="sm:w-52" aria-label="Tipo"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Receitas e despesas</SelectItem>
              <SelectItem value="Receita">Só receitas</SelectItem>
              <SelectItem value="Despesa">Só despesas</SelectItem>
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={verInativas} onCheckedChange={setVerInativas} aria-label="Mostrar inativas" /> Mostrar inativas
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>
          ) : !arvore.blocos.length && !arvore.soltas.length ? (
            <p className="p-6 text-sm text-muted-foreground">Nenhuma conta encontrada.</p>
          ) : (
            <div className="-mt-px">
              {arvore.blocos.map(({ grupo, contas: filhas }) => {
                const aberto = !fechados.has(grupo.id) || !!busca;
                return (
                  <div key={grupo.id}>
                    <div className={cn("flex items-center gap-2 border-t bg-muted/40 px-3 py-2", !grupo.ativo && "opacity-60")}>
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 items-center gap-2 text-left"
                        onClick={() => alternar(grupo.id)}
                        aria-expanded={aberto}
                      >
                        {aberto ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                        <span className="w-8 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{grupo.codigo}</span>
                        <span className="truncate font-medium">{grupo.nome}</span>
                        <span className="hidden text-xs text-muted-foreground sm:inline">· {ROTULO_GRUPO[grupoEfetivo(grupo)]}</span>
                      </button>
                      <span className="text-xs tabular-nums text-muted-foreground">{filhas.length}</span>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Nova conta em ${grupo.nome}`} onClick={() => abrirNova(false, grupo)}><Plus className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Editar grupo ${grupo.nome}`} onClick={() => abrirEdicao(grupo)}><Pencil className="h-4 w-4" /></Button>
                      {!filhas.length && <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Remover grupo ${grupo.nome}`} onClick={() => remover(grupo)}><Trash2 className="h-4 w-4" /></Button>}
                    </div>
                    {aberto && filhas.map((c) => linhaConta(c, true))}
                  </div>
                );
              })}
              {arvore.soltas.length > 0 && (
                <div>
                  <div className="border-t bg-muted/40 px-3 py-2 text-sm font-medium">Sem grupo</div>
                  {arvore.soltas.map((c) => linhaConta(c, true))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!edicao} onOpenChange={(o) => !o && setEdicao(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {edicao?.id ? (edicao.sintetica ? "Editar grupo" : "Editar conta") : edicao?.sintetica ? "Novo grupo" : "Nova conta"}
            </DialogTitle>
            <DialogDescription>
              {edicao?.sintetica ? "O grupo soma as contas de dentro e define onde elas entram na DRE." : "A conta recebe os lançamentos e herda o comportamento do grupo."}
            </DialogDescription>
          </DialogHeader>
          {edicao && (
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="pc-nome">Nome</Label>
                <Input id="pc-nome" autoFocus value={edicao.nome} onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pc-cod">Código</Label>
                <Input id="pc-cod" placeholder="Automático" value={edicao.codigo} onChange={(e) => setEdicao({ ...edicao, codigo: e.target.value })} />
              </div>
              {!edicao.sintetica ? (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Grupo</Label>
                  <Select value={edicao.parent_id || "nenhum"} onValueChange={(v) => {
                    const g = grupos.find((x) => String(x.id) === v);
                    setEdicao({ ...edicao, parent_id: v === "nenhum" ? "" : v, tipo: g ? (grupoEfetivo(g) === "receita" ? "Receita" : edicao.tipo) : edicao.tipo });
                  }}>
                    <SelectTrigger><SelectValue placeholder="Escolha o grupo" /></SelectTrigger>
                    <SelectContent>
                      {grupos.filter((g) => g.ativo).map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.codigo} {g.nome}</SelectItem>)}
                      {!grupos.length && <SelectItem value="nenhum">Sem grupo</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <div className="space-y-1.5 sm:col-span-2">
                  <Label>Comportamento na DRE</Label>
                  <Select value={edicao.grupo_gerencial} onValueChange={(v) => setEdicao({ ...edicao, grupo_gerencial: v as GrupoGerencialId, tipo: v === "receita" ? "Receita" : "Despesa" })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {GRUPOS_GERENCIAIS.map((g) => <SelectItem key={g} value={g}>{ROTULO_GRUPO[g]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">{DESCRICAO_GRUPO[edicao.grupo_gerencial]}</p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={edicao.tipo} onValueChange={(v) => setEdicao({ ...edicao, tipo: v as any })} disabled={edicao.lancamentos > 0}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Receita">Receita</SelectItem>
                    <SelectItem value="Despesa">Despesa</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {!edicao.sintetica && grupoEfetivo(grupos.find((g) => String(g.id) === edicao.parent_id) ?? { tipo: edicao.tipo, grupo_gerencial: edicao.grupo_gerencial }) === "custo_variavel" && (
                <label className="flex items-start gap-2 text-sm sm:col-span-3">
                  <input type="checkbox" className="mt-0.5 h-4 w-4" checked={edicao.is_cmv} onChange={(e) => setEdicao({ ...edicao, is_cmv: e.target.checked })} />
                  <span>É custo da mercadoria vendida ou do serviço prestado (CMV/CSP). Usado no markup e na margem bruta.</span>
                </label>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEdicao(null)}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando || (edicao?.nome.trim().length ?? 0) < 2}>
              {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={modeloAberto} onOpenChange={setModeloAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Completar com modelo</DialogTitle>
            <DialogDescription>
              Adiciona as contas do modelo que ainda não existem no seu plano. Nenhuma conta atual é alterada ou renumerada.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(ROTULO_MODELO_PLANO) as ModeloPlanoId[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModelo(m)}
                className={cn("rounded-md border p-3 text-left text-sm transition-colors", modelo === m ? "border-primary bg-primary/5" : "hover:bg-muted/50")}
                aria-pressed={modelo === m}
              >
                <div className="font-medium">{ROTULO_MODELO_PLANO[m]}</div>
                <div className="text-xs text-muted-foreground">
                  {m === "servicos" ? "Custos do serviço prestado (CSP), ISS, contratos recorrentes." : "CMV, fretes, embalagens, ICMS e taxas de marketplace."}
                </div>
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModeloAberto(false)}>Cancelar</Button>
            <Button onClick={completar}>Adicionar contas</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
