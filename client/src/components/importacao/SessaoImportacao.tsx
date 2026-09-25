import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, ArrowLeft, Check, CheckCircle2, Loader2, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { ContaPlanoCombobox, type GrupoPlano } from "@/components/shared/ContaPlanoCombobox";

/** Grupos do plano PJ para os seletores de conta (evita repassar prop em cada linha). */
const GruposPlanoCtx = createContext<GrupoPlano[]>([]);
import {
  api, brl, dataBr, BANCOS, ROTULO_ORIGEM,
  type Detalhe, type Linha, type Mapeamento, type StatusLinha,
} from "./api";

type Filtro = "todas" | "sem_categoria" | "conciliar" | "duplicada" | "ignorar";
type Alteracao = Partial<Pick<Linha, "categoria_id" | "descricao" | "status" | "transacao_existente_id" | "transferencia_conta_id">> & { id: number };

const CAMPOS_MAPA: { campo: keyof Mapeamento; rotulo: string; obrigatorio?: boolean }[] = [
  { campo: "data", rotulo: "Data", obrigatorio: true },
  { campo: "descricao", rotulo: "Descrição", obrigatorio: true },
  { campo: "valor", rotulo: "Valor (com sinal)" },
  { campo: "debito", rotulo: "Débito (saída)" },
  { campo: "credito", rotulo: "Crédito (entrada)" },
  { campo: "natureza", rotulo: "Tipo C/D" },
  { campo: "saldo", rotulo: "Saldo (ignorado)" },
  { campo: "documento", rotulo: "Documento" },
];

export function SessaoImportacao({ id, onVoltar }: { id: number; onVoltar: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const chave = ["/api/importacoes", id];
  const { data, isLoading, error, refetch } = useQuery<Detalhe>({
    queryKey: chave,
    queryFn: () => api(`/api/importacoes/${id}`),
    // Enquanto a IA classifica em segundo plano, atualiza o progresso.
    refetchInterval: (q) => ((q.state.data as Detalhe | undefined)?.sessao.sugestao_status === "processando" ? 2000 : false),
  });

  // ---------------- autosave ----------------
  const [linhasLocais, setLinhasLocais] = useState<Linha[]>([]);
  const [estadoSalvo, setEstadoSalvo] = useState<{ salvando: boolean; em: string | null; erro: string | null }>({ salvando: false, em: null, erro: null });
  const pendentes = useRef(new Map<number, Alteracao>());
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (data?.linhas) setLinhasLocais(data.linhas);
  }, [data?.linhas]);

  const enviar = useCallback(async () => {
    if (!pendentes.current.size) return;
    const lote = [...pendentes.current.values()];
    pendentes.current.clear();
    setEstadoSalvo((e) => ({ ...e, salvando: true, erro: null }));
    try {
      const r = await api<{ salvo_em: string }>(`/api/importacoes/${id}/linhas`, { method: "PATCH", body: { linhas: lote } });
      setEstadoSalvo({ salvando: false, em: r.salvo_em, erro: null });
    } catch (e: any) {
      // Devolve para a fila e tenta de novo na próxima alteração (nada se perde).
      for (const a of lote) pendentes.current.set(a.id, { ...a, ...pendentes.current.get(a.id) });
      setEstadoSalvo((s) => ({ ...s, salvando: false, erro: e?.message || "Falha ao salvar" }));
    }
  }, [id]);

  const alterar = useCallback((alts: Alteracao[], imediato = true) => {
    setLinhasLocais((ls) => ls.map((l) => {
      const a = alts.find((x) => x.id === l.id);
      return a ? { ...l, ...a } : l;
    }));
    for (const a of alts) pendentes.current.set(a.id, { ...pendentes.current.get(a.id), ...a });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(enviar, imediato ? 150 : 700);
  }, [enviar]);

  // Salva antes de sair da página/aba.
  useEffect(() => {
    const antesDeSair = (ev: BeforeUnloadEvent) => {
      if (pendentes.current.size) { void enviar(); ev.preventDefault(); }
    };
    window.addEventListener("beforeunload", antesDeSair);
    return () => { window.removeEventListener("beforeunload", antesDeSair); void enviar(); };
  }, [enviar]);

  // ---------------- filtros e seleção ----------------
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [busca, setBusca] = useState("");
  const [selecionadas, setSelecionadas] = useState<Set<number>>(new Set());
  const visiveis = useMemo(() => {
    const b = busca.trim().toLowerCase();
    return linhasLocais.filter((l) => {
      if (l.status === "importada") return false;
      if (filtro === "sem_categoria" && !(l.status === "pendente" && !l.categoria_id)) return false;
      if (filtro === "conciliar" && l.status !== "conciliar") return false;
      if (filtro === "duplicada" && l.status !== "duplicada") return false;
      if (filtro === "ignorar" && l.status !== "ignorar") return false;
      return !b || l.descricao.toLowerCase().includes(b);
    });
  }, [linhasLocais, filtro, busca]);
  const contagem = useMemo(() => ({
    todas: linhasLocais.filter((l) => l.status !== "importada").length,
    sem_categoria: linhasLocais.filter((l) => l.status === "pendente" && !l.categoria_id).length,
    conciliar: linhasLocais.filter((l) => l.status === "conciliar").length,
    duplicada: linhasLocais.filter((l) => l.status === "duplicada").length,
    ignorar: linhasLocais.filter((l) => l.status === "ignorar").length,
  }), [linhasLocais]);

  // ---------------- ações ----------------
  const criarCategoria = async (nome: string, tipo: "Receita" | "Despesa", grupoId?: number | null) => {
    try {
      const c = await api<{ id: number }>(`/api/importacoes/${id}/categorias`, { method: "POST", body: { nome, tipo, parent_id: grupoId ?? null } });
      await qc.invalidateQueries({ queryKey: chave });
      toast({ title: `${data?.sessao.escopo === "pj" ? "Conta" : "Categoria"} “${nome}” criada` });
      return c.id;
    } catch (e: any) {
      toast({ title: "Não foi possível criar", description: e?.message, variant: "destructive" });
      return null;
    }
  };

  const [regra, setRegra] = useState<{ termo: string; categoria_id: number | null; tipo: "Receita" | "Despesa"; memorizar: boolean } | null>(null);
  const aplicarRegra = async () => {
    if (!regra?.categoria_id) return;
    await enviar();
    try {
      const r = await api<{ aplicadas: number }>(`/api/importacoes/${id}/regra`, { method: "POST", body: regra });
      toast({ title: `${r.aplicadas} lançamento(s) classificados`, description: regra.memorizar ? "A regra foi memorizada para as próximas importações." : undefined });
      setRegra(null);
      await refetch();
    } catch (e: any) {
      toast({ title: "Não foi possível aplicar", description: e?.message, variant: "destructive" });
    }
  };

  const sugerirIa = async () => {
    await enviar();
    try {
      const r = await api<{ sugeridas: number; ia: { iniciado: boolean; motivo?: string } | null }>(`/api/importacoes/${id}/sugerir`, { method: "POST", body: { ia: true } });
      toast({
        title: r.ia?.iniciado ? "Classificando com IA…" : `${r.sugeridas} sugestão(ões) aplicadas`,
        description: r.ia && !r.ia.iniciado ? r.ia.motivo : "Você pode continuar revisando enquanto isso.",
      });
      await refetch();
    } catch (e: any) {
      toast({ title: "Falha ao sugerir", description: e?.message, variant: "destructive" });
    }
  };

  const [confirmando, setConfirmando] = useState(false);
  const [dialogoConfirmar, setDialogoConfirmar] = useState(false);
  const confirmar = async (semCategoria: "bloquear" | "outras") => {
    setConfirmando(true);
    await enviar();
    try {
      const r = await api<{ criados: number; conciliados: number }>(`/api/importacoes/${id}/confirmar`, { method: "POST", body: { sem_categoria: semCategoria } });
      toast({ title: "Importação concluída", description: `${r.criados} lançamento(s) criados e ${r.conciliados} conciliado(s).` });
      setDialogoConfirmar(false);
      await refetch();
      qc.invalidateQueries();
    } catch (e: any) {
      toast({ title: "Não foi possível concluir", description: e?.message, variant: "destructive" });
    } finally {
      setConfirmando(false);
    }
  };

  const cancelar = async () => {
    await api(`/api/importacoes/${id}`, { method: "DELETE" });
    toast({ title: "Importação descartada" });
    onVoltar();
  };

  if (isLoading) {
    return <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Carregando importação…</div>;
  }
  if (error || !data) {
    return (
      <Card><CardContent className="p-6 text-sm">
        Não foi possível abrir esta importação. <Button variant="link" className="px-1" onClick={onVoltar}>Voltar</Button>
      </CardContent></Card>
    );
  }

  const { sessao, categorias, contas_bancarias } = data;
  const concluida = sessao.status !== "rascunho";
  const precisaMapa = !!sessao.cabecalho && data.linhas.length === 0;
  const semConta = !sessao.conta_bancaria_id;

  return (
    <GruposPlanoCtx.Provider value={data.grupos ?? []}>
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" className="-ml-2 mb-1 h-8 px-2 text-muted-foreground" onClick={onVoltar}>
            <ArrowLeft className="mr-1 h-4 w-4" /> Importações
          </Button>
          <h2 className="truncate text-lg font-semibold">{sessao.arquivo_nome}</h2>
          <p className="text-sm text-muted-foreground">
            {sessao.formato.toUpperCase()}
            {sessao.periodo_de && ` · ${dataBr(sessao.periodo_de)} a ${dataBr(sessao.periodo_ate)}`}
            {sessao.saldo_final_informado != null && ` · saldo no extrato ${brl(sessao.saldo_final_informado)}`}
          </p>
        </div>
        {!concluida && (
          <div className="flex items-center gap-3">
            <IndicadorSalvo estado={estadoSalvo} />
            <Button variant="outline" size="sm" onClick={cancelar}>Descartar</Button>
          </div>
        )}
      </div>

      {concluida && sessao.resultado && (
        <Card className="border-emerald-600/30">
          <CardContent className="flex items-center gap-3 p-4 text-sm">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            <span>
              Importação concluída: {sessao.resultado.criados} criado(s), {sessao.resultado.conciliados} conciliado(s),{" "}
              {sessao.resultado.duplicados} duplicado(s) e {sessao.resultado.ignorados} ignorado(s).
            </span>
          </CardContent>
        </Card>
      )}

      {!concluida && (
        <PassoConta
          id={id}
          sessao={sessao}
          contas={contas_bancarias}
          onDefinida={() => refetch()}
        />
      )}

      {!concluida && sessao.cabecalho && (
        <PassoMapeamento id={id} sessao={sessao} aberto={precisaMapa} onAplicado={() => refetch()} />
      )}

      {!concluida && !precisaMapa && (
        <Card>
          <CardHeader className="gap-3 pb-3">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-base">Revisão e classificação</CardTitle>
                <CardDescription>
                  Tudo é salvo automaticamente. Nada entra no financeiro até você confirmar.
                </CardDescription>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setRegra({ termo: busca, categoria_id: null, tipo: "Despesa", memorizar: true })}>
                  <Wand2 className="mr-2 h-4 w-4" /> Criar regra
                </Button>
                <Button variant="outline" size="sm" onClick={sugerirIa} disabled={sessao.sugestao_status === "processando"}>
                  {sessao.sugestao_status === "processando" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  {sessao.sugestao_status === "processando" ? `Classificando ${sessao.sugestao_progresso ?? 0}%` : "Sugerir categorias"}
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <Tabs value={filtro} onValueChange={(v) => setFiltro(v as Filtro)} className="-mx-1 max-w-full overflow-x-auto px-1">
                <TabsList className="inline-flex w-max">
                  <TabsTrigger value="todas">Todas ({contagem.todas})</TabsTrigger>
                  <TabsTrigger value="sem_categoria">Sem categoria ({contagem.sem_categoria})</TabsTrigger>
                  <TabsTrigger value="conciliar">A conciliar ({contagem.conciliar})</TabsTrigger>
                  <TabsTrigger value="duplicada">Já importadas ({contagem.duplicada})</TabsTrigger>
                  <TabsTrigger value="ignorar">Ignoradas ({contagem.ignorar})</TabsTrigger>
                </TabsList>
              </Tabs>
              <Input placeholder="Buscar na descrição" value={busca} onChange={(e) => setBusca(e.target.value)} className="md:w-64" />
            </div>
            {selecionadas.size > 0 && (
              <AcoesEmMassa
                qtd={selecionadas.size}
                linhas={linhasLocais.filter((l) => selecionadas.has(l.id))}
                categorias={categorias}
                escopo={sessao.escopo}
                onCriar={criarCategoria}
                onAplicar={(alts) => { alterar(alts); setSelecionadas(new Set()); }}
                onLimpar={() => setSelecionadas(new Set())}
              />
            )}
          </CardHeader>
          <CardContent className="p-0">
            <TabelaLinhas
              linhas={visiveis}
              categorias={categorias}
              outrasContas={contas_bancarias.filter((c) => c.id !== sessao.conta_bancaria_id)}
              escopo={sessao.escopo}
              selecionadas={selecionadas}
              setSelecionadas={setSelecionadas}
              alterar={alterar}
              onCriar={criarCategoria}
            />
          </CardContent>
        </Card>
      )}

      {!concluida && !precisaMapa && (
        <div className="sticky bottom-0 z-10 -mx-4 border-t bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-md sm:border">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm tabular-nums text-muted-foreground">
              Entradas <span className="font-medium text-emerald-700 dark:text-emerald-400">{brl(somar(linhasLocais, 1))}</span>
              {" · "}Saídas <span className="font-medium text-red-700 dark:text-red-400">{brl(somar(linhasLocais, -1))}</span>
              {contagem.sem_categoria > 0 && <> · <span className="text-amber-700 dark:text-amber-400">{contagem.sem_categoria} sem categoria</span></>}
            </div>
            <Button onClick={() => setDialogoConfirmar(true)} disabled={semConta || confirmando}>
              {confirmando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Concluir importação
            </Button>
          </div>
          {semConta && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">Escolha ou crie a conta bancária para concluir.</p>}
        </div>
      )}

      {/* Confirmação */}
      <AlertDialog open={dialogoConfirmar} onOpenChange={setDialogoConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Concluir importação?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm">
                <p>{linhasLocais.filter((l) => l.status === "pendente").length} lançamento(s) serão criados e {contagem.conciliar} conciliado(s) com lançamentos existentes, todos na conta bancária escolhida.</p>
                {linhasLocais.some((l) => l.status === "transferencia" || (l.status === "conciliar" && l.transferencia_id)) && (
                  <p>
                    {linhasLocais.filter((l) => l.status === "transferencia" || (l.status === "conciliar" && l.transferencia_id)).length} transferência(s)
                    entre contas próprias: movimentam o saldo, mas não entram no resultado.
                  </p>
                )}
                <p>{contagem.duplicada} já importado(s) e {contagem.ignorar} ignorado(s) ficam de fora.</p>
                {contagem.sem_categoria > 0 && (
                  <p className="text-amber-700 dark:text-amber-400">{contagem.sem_categoria} lançamento(s) ainda estão sem categoria.</p>
                )}
                <p>A operação é única: se algo falhar, nada é gravado.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={confirmando}>Voltar</AlertDialogCancel>
            {contagem.sem_categoria > 0 ? (
              <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmar("outras"); }} disabled={confirmando}>
                Classificar restantes como Outras e concluir
              </AlertDialogAction>
            ) : (
              <AlertDialogAction onClick={(e) => { e.preventDefault(); confirmar("bloquear"); }} disabled={confirmando}>
                Concluir
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Regra em massa */}
      <Dialog open={!!regra} onOpenChange={(o) => !o && setRegra(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar regra de classificação</DialogTitle>
            <DialogDescription>Todo lançamento cuja descrição contém o texto vai para a categoria escolhida.</DialogDescription>
          </DialogHeader>
          {regra && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="regra-termo">Descrição contém</Label>
                <Input id="regra-termo" value={regra.termo} onChange={(e) => setRegra({ ...regra, termo: e.target.value })} placeholder="ex.: posto shell" />
              </div>
              <div className="space-y-1.5">
                <Label>Tipo</Label>
                <Select value={regra.tipo} onValueChange={(v) => setRegra({ ...regra, tipo: v as any, categoria_id: null })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Despesa">Saídas</SelectItem>
                    <SelectItem value="Receita">Entradas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{sessao.escopo === "pj" ? "Conta do plano" : "Categoria"}</Label>
                <ContaPlanoCombobox
                  grupos={data.grupos}
                  categorias={categorias}
                  tipo={regra.tipo}
                  valor={regra.categoria_id}
                  onChange={(v) => setRegra({ ...regra, categoria_id: v })}
                  onCriar={criarCategoria}
                  escopo={sessao.escopo}
                />
              </div>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Memorizar para as próximas importações e para o WhatsApp</span>
                <Switch checked={regra.memorizar} onCheckedChange={(v) => setRegra({ ...regra, memorizar: v })} />
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRegra(null)}>Cancelar</Button>
            <Button onClick={aplicarRegra} disabled={!regra?.categoria_id || (regra?.termo.trim().length ?? 0) < 2}>Aplicar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </GruposPlanoCtx.Provider>
  );
}

function somar(linhas: Linha[], sinal: 1 | -1) {
  return linhas
    .filter((l) => (l.status === "pendente" || l.status === "conciliar") && Math.sign(Number(l.valor)) === sinal)
    .reduce((s, l) => s + Math.abs(Number(l.valor)), 0);
}

function IndicadorSalvo({ estado }: { estado: { salvando: boolean; em: string | null; erro: string | null } }) {
  if (estado.erro) return <span className="flex items-center gap-1 text-xs text-destructive"><AlertCircle className="h-3.5 w-3.5" /> Não salvo, tentando de novo</span>;
  if (estado.salvando) return <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Salvando…</span>;
  if (estado.em) {
    const h = new Date(estado.em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return <span className="flex items-center gap-1 text-xs text-muted-foreground"><Check className="h-3.5 w-3.5" /> Salvo às {h}</span>;
  }
  return <span className="text-xs text-muted-foreground">Rascunho salvo</span>;
}

// ---------------------------------------------------------------------------
// Conta bancária
// ---------------------------------------------------------------------------

function PassoConta({ id, sessao, contas, onDefinida }: { id: number; sessao: Detalhe["sessao"]; contas: Detalhe["contas_bancarias"]; onDefinida: () => void }) {
  const { toast } = useToast();
  const arq = sessao.conta_arquivo;
  const bancoSugerido = (arq?.bancoId && BANCOS[arq.bancoId]) || "";
  const [modo, setModo] = useState<"existente" | "nova">(contas.length ? "existente" : "nova");
  const [contaId, setContaId] = useState<string>(sessao.conta_bancaria_id ? String(sessao.conta_bancaria_id) : "");
  const [nova, setNova] = useState({ nome: bancoSugerido, banco: bancoSugerido, agencia: arq?.agencia || "", numero: arq?.conta || "", saldo_inicial: "" });
  const [salvando, setSalvando] = useState(false);
  const atual = contas.find((c) => c.id === sessao.conta_bancaria_id);

  const salvar = async () => {
    setSalvando(true);
    try {
      await api(`/api/importacoes/${id}/conta`, {
        method: "PUT",
        body: modo === "existente"
          ? { conta_bancaria_id: Number(contaId) }
          : { nova: { ...nova, saldo_inicial: Number(String(nova.saldo_inicial).replace(/\./g, "").replace(",", ".")) || 0 } },
      });
      toast({ title: "Conta bancária definida", description: "Verificamos duplicidades e lançamentos para conciliar." });
      onDefinida();
    } catch (e: any) {
      toast({ title: "Não foi possível definir a conta", description: e?.message, variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  if (atual) {
    return (
      <Card>
        <CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm">
            <span className="text-muted-foreground">Conta bancária: </span>
            <span className="font-medium">{atual.nome || atual.banco}</span>
            {atual.numero && <span className="text-muted-foreground"> · {atual.agencia ? `ag. ${atual.agencia} · ` : ""}c/c {atual.numero}</span>}
          </div>
          <TrocarConta id={id} contas={contas} atual={atual.id} onDefinida={onDefinida} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Conta bancária do extrato</CardTitle>
        <CardDescription>
          Todos os lançamentos importados ficam nesta conta.
          {arq?.conta && ` O arquivo é da conta ${arq.conta}${arq.agencia ? `, agência ${arq.agencia}` : ""}${bancoSugerido ? ` (${bancoSugerido})` : ""}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {contas.length > 0 && (
          <Tabs value={modo} onValueChange={(v) => setModo(v as any)}>
            <TabsList>
              <TabsTrigger value="existente">Conta existente</TabsTrigger>
              <TabsTrigger value="nova">Nova conta</TabsTrigger>
            </TabsList>
          </Tabs>
        )}
        {modo === "existente" ? (
          <Select value={contaId} onValueChange={setContaId}>
            <SelectTrigger className="sm:w-96"><SelectValue placeholder="Escolha a conta" /></SelectTrigger>
            <SelectContent>
              {contas.map((c) => (
                <SelectItem key={c.id} value={String(c.id)}>{c.nome || c.banco}{c.numero ? ` · ${c.numero}` : ""}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="nc-nome">Nome da conta</Label>
              <Input id="nc-nome" value={nova.nome} onChange={(e) => setNova({ ...nova, nome: e.target.value })} placeholder="ex.: Itaú empresa" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nc-banco">Banco</Label>
              <Input id="nc-banco" value={nova.banco} onChange={(e) => setNova({ ...nova, banco: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nc-ag">Agência</Label>
              <Input id="nc-ag" value={nova.agencia} onChange={(e) => setNova({ ...nova, agencia: e.target.value })} inputMode="numeric" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="nc-num">Conta</Label>
              <Input id="nc-num" value={nova.numero} onChange={(e) => setNova({ ...nova, numero: e.target.value })} />
            </div>
            <div className="space-y-1.5 lg:col-span-2">
              <Label htmlFor="nc-saldo">Saldo inicial (antes do primeiro lançamento)</Label>
              <Input id="nc-saldo" value={nova.saldo_inicial} onChange={(e) => setNova({ ...nova, saldo_inicial: e.target.value })} inputMode="decimal" placeholder="0,00" />
            </div>
          </div>
        )}
        <Button onClick={salvar} disabled={salvando || (modo === "existente" ? !contaId : nova.nome.trim().length < 2)}>
          {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {modo === "existente" ? "Usar esta conta" : "Criar conta e continuar"}
        </Button>
      </CardContent>
    </Card>
  );
}

function TrocarConta({ id, contas, atual, onDefinida }: { id: number; contas: Detalhe["contas_bancarias"]; atual: number; onDefinida: () => void }) {
  if (contas.length < 2) return null;
  return (
    <Select
      value={String(atual)}
      onValueChange={async (v) => {
        await api(`/api/importacoes/${id}/conta`, { method: "PUT", body: { conta_bancaria_id: Number(v) } });
        onDefinida();
      }}
    >
      <SelectTrigger className="h-8 sm:w-56"><SelectValue /></SelectTrigger>
      <SelectContent>
        {contas.map((c) => <SelectItem key={c.id} value={String(c.id)}>{c.nome || c.banco}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

// ---------------------------------------------------------------------------
// Mapeamento de colunas (CSV / Excel)
// ---------------------------------------------------------------------------

function PassoMapeamento({ id, sessao, aberto, onAplicado }: { id: number; sessao: Detalhe["sessao"]; aberto: boolean; onAplicado: () => void }) {
  const { toast } = useToast();
  const [mostrar, setMostrar] = useState(aberto);
  const [mapa, setMapa] = useState<Mapeamento>(sessao.mapeamento || { data: -1, descricao: -1, valor: -1, debito: -1, credito: -1, saldo: -1, documento: -1, natureza: -1 });
  const [salvando, setSalvando] = useState(false);
  const colunas = sessao.cabecalho?.length ? sessao.cabecalho : (sessao.amostra_bruta?.[0] || []).map((_, i) => `Coluna ${i + 1}`);

  useEffect(() => setMostrar(aberto), [aberto]);

  const aplicar = async () => {
    setSalvando(true);
    try {
      const r = await api<{ linhas: number }>(`/api/importacoes/${id}/mapeamento`, { method: "PUT", body: { mapeamento: mapa } });
      toast({ title: `${r.linhas} lançamento(s) lidos` });
      setMostrar(false);
      onAplicado();
    } catch (e: any) {
      toast({ title: "Mapeamento incompleto", description: e?.message, variant: "destructive" });
    } finally {
      setSalvando(false);
    }
  };

  if (!mostrar) {
    return (
      <div className="text-right">
        <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setMostrar(true)}>Ajustar colunas do arquivo</Button>
      </div>
    );
  }
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Colunas do arquivo</CardTitle>
        <CardDescription>Indique onde estão a data, a descrição e o valor. A coluna de saldo é ignorada.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {CAMPOS_MAPA.map(({ campo, rotulo, obrigatorio }) => (
            <div key={campo} className="space-y-1.5">
              <Label>{rotulo}{obrigatorio && " *"}</Label>
              <Select value={String(mapa[campo])} onValueChange={(v) => setMapa({ ...mapa, [campo]: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="-1">Não usar</SelectItem>
                  {colunas.map((c, i) => <SelectItem key={i} value={String(i)}>{c || `Coluna ${i + 1}`}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        {sessao.amostra_bruta && (
          <div className="overflow-x-auto rounded-md border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>{colunas.map((c, i) => <th key={i} className="whitespace-nowrap px-2 py-1.5 text-left font-medium">{c || `Coluna ${i + 1}`}</th>)}</tr>
              </thead>
              <tbody>
                {sessao.amostra_bruta.slice(0, 5).map((l, i) => (
                  <tr key={i} className="border-t">{colunas.map((_, j) => <td key={j} className="whitespace-nowrap px-2 py-1.5">{l[j]}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Button onClick={aplicar} disabled={salvando}>
          {salvando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Aplicar colunas
        </Button>
      </CardContent>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Tabela (desktop) / cartões (celular)
// ---------------------------------------------------------------------------

interface TabelaProps {
  linhas: Linha[];
  categorias: Detalhe["categorias"];
  outrasContas: Detalhe["contas_bancarias"];
  escopo: "pf" | "pj";
  selecionadas: Set<number>;
  setSelecionadas: (s: Set<number>) => void;
  alterar: (alts: Alteracao[], imediato?: boolean) => void;
  onCriar: (nome: string, tipo: "Receita" | "Despesa", grupoId?: number | null) => Promise<number | null>;
}

const ROTULO_STATUS: Record<StatusLinha, string> = {
  pendente: "Novo",
  conciliar: "Conciliar",
  duplicada: "Já importado",
  transferencia: "Transferência",
  ignorar: "Ignorado",
  importada: "Importado",
};

function TabelaLinhas({ linhas, categorias, outrasContas, escopo, selecionadas, setSelecionadas, alterar, onCriar }: TabelaProps) {
  const [limite, setLimite] = useState(150);
  const pagina = linhas.slice(0, limite);
  const todasMarcadas = pagina.length > 0 && pagina.every((l) => selecionadas.has(l.id));
  const alternar = (id: number) => {
    const n = new Set(selecionadas);
    if (n.has(id)) n.delete(id); else n.add(id);
    setSelecionadas(n);
  };

  if (!linhas.length) return <p className="px-6 pb-6 text-sm text-muted-foreground">Nenhum lançamento neste filtro.</p>;

  return (
    <>
      {/* Desktop */}
      <div className="hidden md:block">
        <table className="w-full text-sm">
          <thead className="border-y bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="w-10 px-4 py-2 text-left">
                <Checkbox
                  checked={todasMarcadas}
                  onCheckedChange={(v) => setSelecionadas(v ? new Set(pagina.map((l) => l.id)) : new Set())}
                  aria-label="Selecionar todas"
                />
              </th>
              <th className="w-24 px-2 py-2 text-left font-medium">Data</th>
              <th className="px-2 py-2 text-left font-medium">Descrição</th>
              <th className="w-32 px-2 py-2 text-right font-medium">Valor</th>
              <th className="w-72 px-2 py-2 text-left font-medium">{escopo === "pj" ? "Conta do plano" : "Categoria"}</th>
              <th className="w-44 px-4 py-2 text-left font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {pagina.map((l) => (
              <LinhaDesktop key={l.id} l={l} categorias={categorias} outrasContas={outrasContas} escopo={escopo} marcada={selecionadas.has(l.id)} onMarcar={() => alternar(l.id)} alterar={alterar} onCriar={onCriar} />
            ))}
          </tbody>
        </table>
      </div>
      {/* Celular */}
      <div className="divide-y md:hidden">
        {pagina.map((l) => (
          <LinhaCartao key={l.id} l={l} categorias={categorias} outrasContas={outrasContas} escopo={escopo} marcada={selecionadas.has(l.id)} onMarcar={() => alternar(l.id)} alterar={alterar} onCriar={onCriar} />
        ))}
      </div>
      {linhas.length > limite && (
        <div className="p-4 text-center">
          <Button variant="outline" size="sm" onClick={() => setLimite((n) => n + 150)}>Mostrar mais ({linhas.length - limite})</Button>
        </div>
      )}
    </>
  );
}

interface LinhaProps {
  l: Linha;
  categorias: Detalhe["categorias"];
  outrasContas: Detalhe["contas_bancarias"];
  escopo: "pf" | "pj";
  marcada: boolean;
  onMarcar: () => void;
  alterar: (alts: Alteracao[], imediato?: boolean) => void;
  onCriar: (nome: string, tipo: "Receita" | "Despesa", grupoId?: number | null) => Promise<number | null>;
}

function Valor({ v }: { v: string }) {
  const n = Number(v);
  return <span className={cn("tabular-nums font-medium", n >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-red-700 dark:text-red-400")}>{brl(n)}</span>;
}

function Situacao({ l, alterar, outrasContas }: { l: Linha; alterar: LinhaProps["alterar"]; outrasContas: LinhaProps["outrasContas"] }) {
  const saida = Number(l.valor) < 0;
  if (l.status === "duplicada" || l.status === "ignorar") {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="outline" className="font-normal">{ROTULO_STATUS[l.status]}</Badge>
        <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => alterar([{ id: l.id, status: "pendente" }])}>Importar mesmo assim</Button>
      </div>
    );
  }
  if (l.status === "conciliar" && l.transferencia_id) {
    return (
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="font-normal">Transferência já registrada</Badge>
        <Button variant="link" size="sm" className="h-auto p-0 text-xs text-muted-foreground" onClick={() => alterar([{ id: l.id, status: "pendente" }])}>Não é</Button>
      </div>
    );
  }
  // Valor do seletor: novo | conciliar:<id> | transf:<contaId> | ignorar
  const cands = l.candidatos || [];
  const valor =
    l.status === "conciliar" && l.transacao_existente_id ? `conciliar:${l.transacao_existente_id}`
    : l.status === "transferencia" ? (l.transferencia_conta_id ? `transf:${l.transferencia_conta_id}` : "transf:")
    : "novo";
  const escolher = (v: string) => {
    if (v === "novo") alterar([{ id: l.id, status: "pendente", transacao_existente_id: null, transferencia_conta_id: null }]);
    else if (v === "ignorar") alterar([{ id: l.id, status: "ignorar" }]);
    else if (v.startsWith("conciliar:")) alterar([{ id: l.id, status: "conciliar", transacao_existente_id: Number(v.split(":")[1]) }]);
    else if (v.startsWith("transf:")) alterar([{ id: l.id, status: "transferencia", transferencia_conta_id: Number(v.split(":")[1]) || null }]);
  };
  return (
    <Select value={valor} onValueChange={escolher}>
      <SelectTrigger className={cn("h-8 text-xs", l.status === "transferencia" && !l.transferencia_conta_id && "border-amber-500/60")}><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value="novo">Novo lançamento</SelectItem>
        {cands.map((c) => (
          <SelectItem key={c.id} value={`conciliar:${c.id}`}>
            Conciliar: {c.descricao} ({dataBr(c.data_transacao)}{c.status === "Pendente" ? ", em aberto" : ""})
          </SelectItem>
        ))}
        {outrasContas.map((c) => (
          <SelectItem key={`t${c.id}`} value={`transf:${c.id}`}>
            Transferência {saida ? "para" : "de"} {c.nome || c.banco}
          </SelectItem>
        ))}
        <SelectItem value="ignorar">Ignorar</SelectItem>
      </SelectContent>
    </Select>
  );
}

function CampoCategoria({ l, categorias, escopo, alterar, onCriar }: Omit<LinhaProps, "marcada" | "onMarcar">) {
  const gruposPlano = useContext(GruposPlanoCtx);
  const tipo = Number(l.valor) >= 0 ? "Receita" : "Despesa";
  if (l.status !== "pendente") return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <div className="flex items-center gap-2">
      <ContaPlanoCombobox
        grupos={gruposPlano}
        categorias={categorias}
        tipo={tipo}
        valor={l.categoria_id}
        onChange={(v) => alterar([{ id: l.id, categoria_id: v }])}
        onCriar={onCriar}
        escopo={escopo}
        className={!l.categoria_id ? "border-amber-500/60" : undefined}
      />
      {l.categoria_id && l.sugestao_origem && l.categoria_id === l.sugestao_categoria_id && (
        <span className="shrink-0 text-[11px] text-muted-foreground" title="Classificação sugerida automaticamente">
          {ROTULO_ORIGEM[l.sugestao_origem] || l.sugestao_origem}
        </span>
      )}
    </div>
  );
}

function DescricaoEditavel({ l, alterar }: { l: Linha; alterar: LinhaProps["alterar"] }) {
  const [valor, setValor] = useState(l.descricao);
  useEffect(() => setValor(l.descricao), [l.descricao]);
  return (
    <Input
      value={valor}
      onChange={(e) => { setValor(e.target.value); if (e.target.value.trim()) alterar([{ id: l.id, descricao: e.target.value }], false); }}
      className="h-8 border-transparent bg-transparent px-2 shadow-none hover:border-input focus-visible:border-input"
      aria-label="Descrição"
      disabled={l.status === "importada"}
    />
  );
}

function LinhaDesktop(p: LinhaProps) {
  const { l } = p;
  return (
    <tr className={cn("border-b last:border-0", p.marcada && "bg-muted/40", (l.status === "duplicada" || l.status === "ignorar") && "text-muted-foreground")}>
      <td className="px-4 py-1.5"><Checkbox checked={p.marcada} onCheckedChange={p.onMarcar} aria-label="Selecionar" /></td>
      <td className="px-2 py-1.5 tabular-nums">{dataBr(l.data)}</td>
      <td className="px-2 py-1.5"><DescricaoEditavel l={l} alterar={p.alterar} /></td>
      <td className="px-2 py-1.5 text-right"><Valor v={l.valor} /></td>
      <td className="px-2 py-1.5"><CampoCategoria {...p} /></td>
      <td className="px-4 py-1.5"><Situacao l={l} alterar={p.alterar} outrasContas={p.outrasContas} /></td>
    </tr>
  );
}

function LinhaCartao(p: LinhaProps) {
  const { l } = p;
  return (
    <div className={cn("space-y-2 px-4 py-3", p.marcada && "bg-muted/40")}>
      <div className="flex items-start gap-3">
        <Checkbox checked={p.marcada} onCheckedChange={p.onMarcar} aria-label="Selecionar" className="mt-1" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs tabular-nums text-muted-foreground">{dataBr(l.data)}</span>
            <Valor v={l.valor} />
          </div>
          <DescricaoEditavel l={l} alterar={p.alterar} />
        </div>
      </div>
      <CampoCategoria {...p} />
      <Situacao l={l} alterar={p.alterar} outrasContas={p.outrasContas} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Ações em massa
// ---------------------------------------------------------------------------

function AcoesEmMassa({ qtd, linhas, categorias, escopo, onCriar, onAplicar, onLimpar }: {
  qtd: number;
  linhas: Linha[];
  categorias: Detalhe["categorias"];
  escopo: "pf" | "pj";
  onCriar: (nome: string, tipo: "Receita" | "Despesa", grupoId?: number | null) => Promise<number | null>;
  onAplicar: (alts: Alteracao[]) => void;
  onLimpar: () => void;
}) {
  const gruposPlano = useContext(GruposPlanoCtx);
  const tipos = new Set(linhas.map((l) => (Number(l.valor) >= 0 ? "Receita" : "Despesa")));
  const tipoUnico = tipos.size === 1 ? ([...tipos][0] as "Receita" | "Despesa") : null;
  return (
    <div className="flex flex-col gap-2 rounded-md border bg-muted/40 p-2 sm:flex-row sm:items-center">
      <span className="px-1 text-sm font-medium">{qtd} selecionado(s)</span>
      {tipoUnico ? (
        <div className="sm:w-72">
          <ContaPlanoCombobox
            grupos={gruposPlano}
            categorias={categorias}
            tipo={tipoUnico}
            valor={null}
            placeholder="Classificar selecionados como…"
            onChange={(v) => onAplicar(linhas.filter((l) => l.status === "pendente").map((l) => ({ id: l.id, categoria_id: v })))}
            onCriar={onCriar}
            escopo={escopo}
          />
        </div>
      ) : (
        <span className="text-xs text-muted-foreground">Selecione só entradas ou só saídas para classificar em massa.</span>
      )}
      <Button variant="outline" size="sm" onClick={() => onAplicar(linhas.map((l) => ({ id: l.id, status: "ignorar" as StatusLinha })))}>
        Ignorar
      </Button>
      <Button variant="ghost" size="sm" onClick={onLimpar}>Limpar seleção</Button>
    </div>
  );
}
