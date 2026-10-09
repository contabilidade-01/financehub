import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Bot, Loader2, Send, UserPlus, UserMinus, MessageSquare } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string; tools?: any[]; ms?: number };

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

export default function OrquestradorPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const isSuperAdmin = user?.tipo_usuario === "super_admin";

  const [busca, setBusca] = useState("");
  const [buscaLiberar, setBuscaLiberar] = useState("");
  const [usuarioId, setUsuarioId] = useState<number | null>(null);
  const [usuarioLabel, setUsuarioLabel] = useState("");
  const [texto, setTexto] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);

  const { data: flagsPayload } = useQuery({
    queryKey: ["minhas-flags"],
    enabled: !!user && !isSuperAdmin,
    queryFn: async () => (await api("/api/flags")) as { flags: Record<string, boolean> },
  });

  const flagsMe = flagsPayload?.flags;
  const liberadoPorFlag = !!flagsMe?.orquestrador_deepseek;
  const podeAcessar = isSuperAdmin || liberadoPorFlag;

  // Usuário liberado: alvo = própria carteira (sem esperar useEffect)
  const alvoId = isSuperAdmin ? usuarioId : user?.id ?? null;
  const alvoLabel = isSuperAdmin
    ? usuarioLabel
    : user
      ? `${user.nome} · ${user.email}`
      : "";
  const conversaLiberada = !!alvoId;

  const { data: status } = useQuery({
    queryKey: ["orquestrador-status"],
    enabled: podeAcessar,
    queryFn: () => api(isSuperAdmin ? "/api/admin/orquestrador/status" : "/api/orquestrador/status"),
  });

  const { data: liberados, refetch: refetchLiberados } = useQuery({
    queryKey: ["orquestrador-liberados"],
    enabled: isSuperAdmin,
    queryFn: () => api("/api/admin/orquestrador/liberados"),
  });

  const { data: usuarios } = useQuery({
    queryKey: ["orq-busca", busca],
    enabled: isSuperAdmin && busca.trim().length >= 2,
    queryFn: async () =>
      (await api(`/api/admin/flags/buscar-usuarios?q=${encodeURIComponent(busca.trim())}`)).usuarios as any[],
  });

  const { data: usuariosLiberar } = useQuery({
    queryKey: ["orq-busca-liberar", buscaLiberar],
    enabled: isSuperAdmin && buscaLiberar.trim().length >= 2,
    queryFn: async () =>
      (await api(`/api/admin/flags/buscar-usuarios?q=${encodeURIComponent(buscaLiberar.trim())}`)).usuarios as any[],
  });

  // (alvo já definido acima para usuário liberado)

  const mutChat = useMutation({
    mutationFn: () =>
      api(isSuperAdmin ? "/api/admin/orquestrador/chat" : "/api/orquestrador/chat", {
        method: "POST",
        body: JSON.stringify({ usuario_id: alvoId, texto }),
      }),
    onSuccess: (data) => {
      setMsgs((prev) => [
        ...prev,
        { role: "user", content: texto },
        { role: "assistant", content: data.resposta, tools: data.tools, ms: data.ms },
      ]);
      setTexto("");
    },
    onError: (e: Error) => {
      toast({ title: e.message, variant: "destructive" });
    },
  });

  const mutLiberar = useMutation({
    mutationFn: (id: number) =>
      api("/api/admin/orquestrador/liberar", {
        method: "POST",
        body: JSON.stringify({ usuario_id: id }),
      }),
    onSuccess: (data) => {
      toast({ title: `Liberado: ${data.usuario?.nome || data.usuario?.id}` });
      setBuscaLiberar("");
      refetchLiberados();
      qc.invalidateQueries({ queryKey: ["minhas-flags"] });
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const mutRevogar = useMutation({
    mutationFn: (id: number) =>
      api(`/api/admin/orquestrador/liberar/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Acesso revogado" });
      refetchLiberados();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  if (!user) return null;
  if (!podeAcessar && flagsPayload !== undefined) {
    return <Redirect to="/" />;
  }
  if (!isSuperAdmin && flagsPayload === undefined) {
    return (
      <div className="p-8 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const podeEnviar = conversaLiberada && !!texto.trim() && !mutChat.isPending;

  const enviar = () => {
    if (!podeEnviar) return;
    if (!status?.configured) {
      toast({
        title: "DeepSeek não configurada",
        description: "Defina DEEPSEEK_API_KEY (ou AI_FALLBACK_*) no EasyPanel e reinicie.",
        variant: "destructive",
      });
      return;
    }
    mutChat.mutate();
  };

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Bot className="h-6 w-6" /> Orquestrador (DeepSeek)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {isSuperAdmin
              ? "Marque usuários para liberar o chat. Escolha o alvo e converse — as tools agem na carteira dele."
              : "Chat com DeepSeek na sua carteira. WhatsApp continua no OpenAI/Gemini."}
          </p>
        </div>
        <div className="text-right text-sm space-y-1">
          {status?.configured ? (
            <Badge className="bg-emerald-500/15 text-income">DeepSeek ok · {status.model}</Badge>
          ) : (
            <Badge variant="destructive">DeepSeek não configurada</Badge>
          )}
          {status?.key_prefix && (
            <p className="text-xs text-muted-foreground">{status.key_prefix}</p>
          )}
        </div>
      </div>

      {isSuperAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <UserPlus className="h-4 w-4" /> Liberar acesso ao orquestrador
            </CardTitle>
            <CardDescription>
              Usuário marcado passa a ver o menu e usar o chat na própria carteira.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Label>Buscar para liberar</Label>
            <Input
              placeholder="Nome ou e-mail…"
              value={buscaLiberar}
              onChange={(e) => setBuscaLiberar(e.target.value)}
            />
            {usuariosLiberar && usuariosLiberar.length > 0 && (
              <ul className="border rounded text-sm divide-y max-h-36 overflow-auto">
                {usuariosLiberar.map((u) => (
                  <li key={u.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                    <span>
                      #{u.id} {u.nome} · {u.email}
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={mutLiberar.isPending}
                      onClick={() => mutLiberar.mutate(u.id)}
                    >
                      Liberar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {(liberados?.usuarios?.length ?? 0) > 0 && (
              <div className="pt-2 space-y-1">
                <p className="text-xs font-medium text-muted-foreground uppercase">Já liberados</p>
                <ul className="border rounded text-sm divide-y">
                  {liberados.usuarios.map((u: any) => (
                    <li key={u.id} className="flex items-center justify-between gap-2 px-2 py-1.5">
                      <span>
                        #{u.id} {u.nome} · {u.email}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-destructive"
                        disabled={mutRevogar.isPending}
                        onClick={() => mutRevogar.mutate(u.id)}
                      >
                        <UserMinus className="h-4 w-4 mr-1" /> Revogar
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isSuperAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Usuário alvo (carteira)</CardTitle>
            <CardDescription>
              Selecione para liberar a conversa abaixo. As tools agem nesta carteira.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label>Buscar</Label>
            <Input
              placeholder="Nome ou e-mail…"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
            />
            {usuarioId && (
              <p className="text-sm flex items-center gap-2">
                <Badge variant="outline" className="font-normal">
                  Conversa liberada
                </Badge>
                <span>
                  <strong>#{usuarioId}</strong> {usuarioLabel}
                </span>
              </p>
            )}
            {usuarios && usuarios.length > 0 && (
              <ul className="border rounded text-sm divide-y max-h-36 overflow-auto">
                {usuarios.map((u) => (
                  <li key={u.id}>
                    <button
                      type="button"
                      className="w-full text-left px-2 py-1.5 hover:bg-muted"
                      onClick={() => {
                        setUsuarioId(u.id);
                        setUsuarioLabel(`${u.nome} · ${u.email}`);
                        setBusca("");
                        setMsgs([]);
                      }}
                    >
                      #{u.id} {u.nome} · {u.email}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {!isSuperAdmin && alvoId && (
        <p className="text-sm text-muted-foreground flex items-center gap-2">
          <Badge variant="outline">Sua carteira</Badge>
          #{alvoId} {alvoLabel}
        </p>
      )}

      <Card className={!conversaLiberada ? "opacity-60" : undefined}>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Conversa
            {conversaLiberada ? (
              <Badge className="bg-emerald-500/15 text-income font-normal">Liberada</Badge>
            ) : (
              <Badge variant="secondary" className="font-normal">
                Selecione o usuário alvo
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="min-h-[220px] max-h-[420px] overflow-y-auto space-y-3 rounded-lg border border-border/60 p-3 bg-muted/20">
            {msgs.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {conversaLiberada
                  ? 'Ex.: "liste as despesas deste mês" · "altere o dia dessas compras de cartão para 5"'
                  : "Escolha o usuário alvo acima para liberar o chat."}
              </p>
            )}
            {msgs.map((m, i) => (
              <div
                key={i}
                className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === "user" ? "bg-primary/15 ml-8" : "bg-background border mr-8"
                }`}
              >
                <p className="text-xs uppercase text-muted-foreground mb-1">
                  {m.role === "user" ? "Você" : "Orquestrador"}
                  {m.ms != null ? ` · ${m.ms} ms` : ""}
                </p>
                {m.content}
                {m.tools && m.tools.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Tools: {m.tools.map((t: any) => t.name).join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Textarea
              rows={3}
              placeholder={
                conversaLiberada
                  ? "Mensagem para o orquestrador…"
                  : "Selecione um usuário alvo para liberar a conversa…"
              }
              value={texto}
              disabled={!conversaLiberada}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  enviar();
                }
              }}
            />
            <Button disabled={!podeEnviar} onClick={enviar}>
              {mutChat.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Send className="h-4 w-4 mr-2" />
              )}
              Enviar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
