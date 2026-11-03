import React, { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Megaphone, Send, FlaskConical, X, RotateCcw } from "lucide-react";

type Canal = "whatsapp" | "email" | "app";
type TipoPublico = "todos" | "pf" | "pj_mei" | "pj_me" | "selecionados";
type Cliente = { id: number; nome: string | null; email: string | null };
type AvisoRow = {
  id: number;
  titulo: string;
  canais: Canal[];
  publico: { tipo: TipoPublico; usuarios?: number[] };
  criado_em: string;
  concluido_em: string | null;
  clientes: number;
  enviados: number;
  na_fila: number;
  falhas: number;
  sem_contato: number;
  no_app: number;
  lidos_app: number;
};
type Modelo = { id: string; nome: string; titulo: string; mensagem: string };

async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || data.message || `HTTP ${res.status}`);
  return data;
}

const NOME_CANAL: Record<Canal, string> = { whatsapp: "WhatsApp", email: "E-mail", app: "Aviso no app" };
const NOME_PUBLICO: Record<TipoPublico, string> = {
  todos: "Todos os clientes",
  pf: "Pessoa Física",
  pj_mei: "PJ MEI",
  pj_me: "PJ Empresa (ME)",
  selecionados: "Clientes escolhidos",
};

function dataHora(s: string | null) {
  return s ? new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "";
}

/** Prévia simples do texto: troca as variáveis por um exemplo. */
function exemplo(texto: string, link: string) {
  return texto
    .replace(/\{nome\}/g, "Maria da Silva")
    .replace(/\{primeiro_nome\}/g, "Maria")
    .replace(/\{link_app\}/g, link);
}

export default function AvisosPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [canais, setCanais] = useState<Canal[]>(["whatsapp", "email", "app"]);
  const [tipo, setTipo] = useState<TipoPublico>("todos");
  const [escolhidos, setEscolhidos] = useState<Cliente[]>([]);
  const [busca, setBusca] = useState("");
  const [confirmar, setConfirmar] = useState(false);
  const [detalheId, setDetalheId] = useState<number | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-avisos"],
    queryFn: async () => (await api("/api/admin/avisos")) as { avisos: AvisoRow[]; modelos: Modelo[]; link_app: string },
    refetchInterval: (q) => ((q.state.data as any)?.avisos?.some((a: AvisoRow) => a.na_fila > 0) ? 5000 : false),
  });
  const linkApp = data?.link_app || "";

  const publico = useMemo(
    () => (tipo === "selecionados" ? { tipo, usuarios: escolhidos.map((c) => c.id) } : { tipo }),
    [tipo, escolhidos],
  );

  const { data: previa, isFetching: carregandoPrevia } = useQuery({
    queryKey: ["admin-avisos-previa", publico],
    queryFn: async () =>
      (await api("/api/admin/avisos/previa", { method: "POST", body: JSON.stringify({ publico }) })) as {
        total: number;
        com_whatsapp: number;
        com_email: number;
      },
  });

  const { data: resultadosBusca } = useQuery({
    queryKey: ["admin-avisos-busca", busca],
    enabled: tipo === "selecionados" && busca.trim().length >= 2,
    queryFn: async () =>
      (await api(`/api/admin/flags/buscar-usuarios?q=${encodeURIComponent(busca.trim())}`)).usuarios as Cliente[],
  });

  const { data: detalhe } = useQuery({
    queryKey: ["admin-aviso", detalheId],
    enabled: detalheId != null,
    queryFn: async () => await api(`/api/admin/avisos/${detalheId}`),
  });

  const corpo = () => JSON.stringify({ titulo, mensagem, canais, publico });

  const teste = useMutation({
    mutationFn: async () => await api("/api/admin/avisos/teste", { method: "POST", body: corpo() }),
    onSuccess: (r: any) => {
      const linhas = Object.entries(r.resultado || {}).map(([c, v]) => `${NOME_CANAL[c as Canal] || c}: ${v}`);
      toast({ title: "Teste enviado para você", description: linhas.join(" · ") });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const enviar = useMutation({
    mutationFn: async () => await api("/api/admin/avisos", { method: "POST", body: corpo() }),
    onSuccess: (r: any) => {
      toast({ title: `Aviso criado para ${r.clientes} cliente(s)`, description: "O envio segue em segundo plano. Acompanhe no histórico." });
      setConfirmar(false);
      setTitulo("");
      setMensagem("");
      qc.invalidateQueries({ queryKey: ["admin-avisos"] });
    },
    onError: (e: Error) => {
      setConfirmar(false);
      toast({ title: e.message, variant: "destructive" });
    },
  });

  const reenviar = useMutation({
    mutationFn: async (id: number) => await api(`/api/admin/avisos/${id}/reenviar-falhas`, { method: "POST" }),
    onSuccess: (r: any) => {
      toast({ title: r.reenviando ? `Reenviando ${r.reenviando} falha(s)` : "Nada para reenviar" });
      qc.invalidateQueries({ queryKey: ["admin-avisos"] });
      qc.invalidateQueries({ queryKey: ["admin-aviso"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  useEffect(() => {
    if (tipo !== "selecionados") setBusca("");
  }, [tipo]);

  const toggleCanal = (c: Canal) => setCanais((cs) => (cs.includes(c) ? cs.filter((x) => x !== c) : [...cs, c]));
  const usarModelo = (m: Modelo) => {
    setTitulo(m.titulo);
    setMensagem(m.mensagem);
  };

  const prontoParaEnviar =
    titulo.trim().length >= 3 && mensagem.trim().length >= 10 && canais.length > 0 && (previa?.total || 0) > 0;

  const alcance = [
    canais.includes("whatsapp") && `${previa?.com_whatsapp ?? 0} por WhatsApp`,
    canais.includes("email") && `${previa?.com_email ?? 0} por e-mail`,
    canais.includes("app") && `${previa?.total ?? 0} no app`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Megaphone className="h-6 w-6" /> Avisos aos clientes
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Envie comunicados sobre atualizações e mudanças para um cliente, um grupo ou todos, por WhatsApp, e-mail
          e/ou aviso no app. O WhatsApp sai um por vez, com intervalo, para não ser tratado como spam.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Novo aviso</CardTitle>
          <CardDescription>
            Variáveis: <code>{"{primeiro_nome}"}</code>, <code>{"{nome}"}</code>, <code>{"{link_app}"}</code>. No
            WhatsApp, <code>*texto*</code> fica em negrito.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {!!data?.modelos?.length && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-muted-foreground">Usar modelo:</span>
              {data.modelos.map((m) => (
                <Button key={m.id} variant="outline" size="sm" onClick={() => usarModelo(m)}>
                  {m.nome}
                </Button>
              ))}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="aviso-titulo">Título (assunto do e-mail e título no app)</Label>
            <Input id="aviso-titulo" value={titulo} maxLength={150} onChange={(e) => setTitulo(e.target.value)} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="aviso-msg">Mensagem</Label>
              <Textarea id="aviso-msg" rows={12} value={mensagem} maxLength={4000} onChange={(e) => setMensagem(e.target.value)} />
              <p className="text-xs text-muted-foreground">{mensagem.length}/4000</p>
            </div>
            <div className="space-y-2">
              <Label>Como o cliente vai ler</Label>
              <div className="rounded-md border bg-muted/40 p-3 text-sm whitespace-pre-wrap min-h-[16rem]">
                {mensagem ? exemplo(mensagem, linkApp) : <span className="text-muted-foreground">A prévia aparece aqui.</span>}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Canais</Label>
            <div className="flex flex-wrap gap-4">
              {(Object.keys(NOME_CANAL) as Canal[]).map((c) => (
                <label key={c} className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox checked={canais.includes(c)} onCheckedChange={() => toggleCanal(c)} />
                  {NOME_CANAL[c]}
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Para quem</Label>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(NOME_PUBLICO) as TipoPublico[]).map((t) => (
                <Button key={t} size="sm" variant={tipo === t ? "default" : "outline"} onClick={() => setTipo(t)}>
                  {NOME_PUBLICO[t]}
                </Button>
              ))}
            </div>

            {tipo === "selecionados" && (
              <div className="space-y-2 pt-2">
                <Input placeholder="Buscar cliente por nome, e-mail, telefone ou id" value={busca} onChange={(e) => setBusca(e.target.value)} />
                {!!resultadosBusca?.length && (
                  <div className="rounded-md border divide-y max-h-56 overflow-auto">
                    {resultadosBusca
                      .filter((u) => !escolhidos.some((e) => e.id === u.id))
                      .map((u) => (
                        <button
                          key={u.id}
                          type="button"
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                          onClick={() => setEscolhidos((es) => [...es, u])}
                        >
                          #{u.id} {u.nome || "—"} <span className="text-muted-foreground">{u.email}</span>
                        </button>
                      ))}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {escolhidos.map((u) => (
                    <Badge key={u.id} variant="secondary" className="gap-1">
                      {u.nome || u.email || `#${u.id}`}
                      <button type="button" aria-label="Remover" onClick={() => setEscolhidos((es) => es.filter((e) => e.id !== u.id))}>
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <p className="text-sm text-muted-foreground">
              {carregandoPrevia ? (
                "Contando clientes…"
              ) : (
                <>
                  <b>{previa?.total ?? 0}</b> cliente(s) ativo(s){alcance ? ` · ${alcance}` : ""}. Super admins não entram.
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 pt-2">
            <Button variant="outline" disabled={!titulo || !mensagem || !canais.length || teste.isPending} onClick={() => teste.mutate()}>
              {teste.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FlaskConical className="h-4 w-4 mr-2" />}
              Enviar teste para mim
            </Button>
            <Button disabled={!prontoParaEnviar || enviar.isPending} onClick={() => setConfirmar(true)}>
              <Send className="h-4 w-4 mr-2" /> Enviar aviso
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Histórico</CardTitle>
          <CardDescription>Atualiza sozinho enquanto há envios na fila.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : !data?.avisos?.length ? (
            <p className="text-sm text-muted-foreground">Nenhum aviso enviado ainda.</p>
          ) : (
            <div className="divide-y">
              {data.avisos.map((a) => (
                <div key={a.id} className="py-3 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{a.titulo}</span>
                    {a.na_fila > 0 ? <Badge>Enviando · {a.na_fila} na fila</Badge> : <Badge variant="secondary">Concluído</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {dataHora(a.criado_em)} · {NOME_PUBLICO[a.publico?.tipo] || a.publico?.tipo} · {a.clientes} cliente(s) ·{" "}
                    {a.canais.map((c) => NOME_CANAL[c]).join(", ")}
                  </p>
                  <p className="text-sm">
                    {a.enviados} enviado(s)
                    {a.no_app > 0 && ` · no app: ${a.lidos_app}/${a.no_app} leram`}
                    {a.sem_contato > 0 && ` · ${a.sem_contato} sem contato no canal`}
                    {a.falhas > 0 && <span className="text-destructive"> · {a.falhas} falha(s)</span>}
                  </p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost" onClick={() => setDetalheId(detalheId === a.id ? null : a.id)}>
                      {detalheId === a.id ? "Fechar detalhes" : "Ver falhas e sem contato"}
                    </Button>
                    {a.falhas > 0 && (
                      <Button size="sm" variant="outline" disabled={reenviar.isPending} onClick={() => reenviar.mutate(a.id)}>
                        <RotateCcw className="h-4 w-4 mr-1" /> Reenviar falhas
                      </Button>
                    )}
                  </div>
                  {detalheId === a.id && (
                    <div className="rounded-md border bg-muted/30 p-2 text-xs max-h-64 overflow-auto">
                      {!detalhe ? (
                        "Carregando…"
                      ) : !detalhe.problemas?.length ? (
                        "Nenhuma falha e todos tinham contato."
                      ) : (
                        detalhe.problemas.map((p: any) => (
                          <div key={`${p.usuario_id}-${p.canal}`}>
                            #{p.usuario_id} {p.nome} · {NOME_CANAL[p.canal as Canal]} ·{" "}
                            {p.status === "sem_contato" ? "sem contato" : `falhou: ${p.erro}`}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={confirmar} onOpenChange={setConfirmar}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar este aviso agora?</AlertDialogTitle>
            <AlertDialogDescription>
              “{titulo}” para <b>{previa?.total ?? 0}</b> cliente(s): {alcance}. Mensagens enviadas não podem ser
              desfeitas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={enviar.isPending}
              onClick={(e) => {
                e.preventDefault();
                enviar.mutate();
              }}
            >
              {enviar.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Enviar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
