import React, { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Bot, Loader2, Send } from "lucide-react";

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
  const [busca, setBusca] = useState("");
  const [usuarioId, setUsuarioId] = useState<number | null>(null);
  const [usuarioLabel, setUsuarioLabel] = useState("");
  const [texto, setTexto] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const isSuperAdmin = user?.tipo_usuario === "super_admin";

  const { data: status } = useQuery({
    queryKey: ["orquestrador-status"],
    enabled: isSuperAdmin,
    queryFn: () => api("/api/admin/orquestrador/status"),
  });

  const { data: usuarios } = useQuery({
    queryKey: ["orq-busca", busca],
    enabled: isSuperAdmin && busca.trim().length >= 2,
    queryFn: async () =>
      (await api(`/api/admin/flags/buscar-usuarios?q=${encodeURIComponent(busca.trim())}`)).usuarios as any[],
  });

  const mut = useMutation({
    mutationFn: () =>
      api("/api/admin/orquestrador/chat", {
        method: "POST",
        body: JSON.stringify({ usuario_id: usuarioId, texto }),
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

  // API exige requireSuperAdmin — espelha no frontend
  if (!isSuperAdmin) {
    return <Redirect to="/" />;
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Bot className="h-6 w-6" /> Orquestrador (DeepSeek)
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Chat admin que usa <strong>somente DeepSeek</strong>. WhatsApp continua no OpenAI/Gemini.
            Escolha o usuário e peça ajustes (ex.: alterar dia, mover cartão).
          </p>
        </div>
        <div className="text-right text-sm space-y-1">
          {status?.configured ? (
            <Badge className="bg-emerald-500/15 text-emerald-600">DeepSeek ok · {status.model}</Badge>
          ) : (
            <Badge variant="destructive">DEEPSEEK_API_KEY ausente</Badge>
          )}
          {status?.key_prefix && (
            <p className="text-xs text-muted-foreground">{status.key_prefix}</p>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Usuário alvo</CardTitle>
          <CardDescription>As tools do agente agem na carteira deste usuário.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label>Buscar</Label>
          <Input
            placeholder="Nome ou e-mail…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          {usuarioId && (
            <p className="text-sm">
              Selecionado: <strong>#{usuarioId}</strong> {usuarioLabel}
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conversa</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="min-h-[220px] max-h-[420px] overflow-y-auto space-y-3 rounded-lg border border-border/60 p-3 bg-muted/20">
            {msgs.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Ex.: “liste as despesas deste mês no Magalu” · “altere o dia dessas compras de cartão para 5”
              </p>
            )}
            {msgs.map((m, i) => (
              <div
                key={i}
                className={`rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === "user" ? "bg-primary/15 ml-8" : "bg-background border mr-8"
                }`}
              >
                <p className="text-[10px] uppercase text-muted-foreground mb-1">
                  {m.role === "user" ? "Você" : "Orquestrador"}
                  {m.ms != null ? ` · ${m.ms} ms` : ""}
                </p>
                {m.content}
                {m.tools && m.tools.length > 0 && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Tools: {m.tools.map((t: any) => t.name).join(", ")}
                  </p>
                )}
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Textarea
              rows={3}
              placeholder="Mensagem para o orquestrador…"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  if (usuarioId && texto.trim() && !mut.isPending && status?.configured) mut.mutate();
                }
              }}
            />
            <Button
              disabled={!usuarioId || !texto.trim() || mut.isPending || !status?.configured}
              onClick={() => mut.mutate()}
            >
              {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              Enviar
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
