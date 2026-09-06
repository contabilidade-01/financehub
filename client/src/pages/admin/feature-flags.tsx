import React, { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Loader2, Flag, Users, Power, PowerOff, Plus } from "lucide-react";

type FlagRow = {
  chave: string;
  descricao: string | null;
  ativo_todos: boolean;
  usuarios: number[];
  total_usuarios: number;
  usuarios_detalhe: { id: number; nome: string | null; email: string | null }[];
};

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

export default function FeatureFlagsPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [novaChave, setNovaChave] = useState("");
  const [novaDesc, setNovaDesc] = useState("");
  const [busca, setBusca] = useState("");
  const [flagAlvo, setFlagAlvo] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-flags"],
    queryFn: async () => (await api("/api/admin/flags")).flags as FlagRow[],
  });

  const { data: health } = useQuery({
    queryKey: ["health"],
    queryFn: async () => {
      const r = await fetch("/api/health");
      return r.json();
    },
  });

  const { data: usuariosBusca } = useQuery({
    queryKey: ["admin-flags-busca", busca],
    enabled: busca.trim().length >= 2,
    queryFn: async () =>
      (await api(`/api/admin/flags/buscar-usuarios?q=${encodeURIComponent(busca.trim())}`))
        .usuarios as { id: number; nome: string; email: string }[],
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-flags"] });

  const criarMut = useMutation({
    mutationFn: () => api("/api/admin/flags", { method: "POST", body: JSON.stringify({ chave: novaChave, descricao: novaDesc }) }),
    onSuccess: () => {
      toast({ title: "Flag criada (desligada por padrão)" });
      setNovaChave("");
      setNovaDesc("");
      invalidate();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const liberarMut = useMutation({
    mutationFn: (chave: string) => api(`/api/admin/flags/${chave}/liberar-todos`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Liberado para todos" });
      invalidate();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const desligarTodosMut = useMutation({
    mutationFn: (chave: string) => api(`/api/admin/flags/${chave}/desligar-todos`, { method: "POST" }),
    onSuccess: () => {
      toast({ title: "Desligado para todos (lista individual limpa — freio de emergência)" });
      invalidate();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const ligarUserMut = useMutation({
    mutationFn: ({ chave, usuario_id }: { chave: string; usuario_id: number }) =>
      api(`/api/admin/flags/${chave}/usuarios`, { method: "POST", body: JSON.stringify({ usuario_id }) }),
    onSuccess: () => {
      toast({ title: "Usuário ligado na flag" });
      invalidate();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const desligarUserMut = useMutation({
    mutationFn: ({ chave, usuario_id }: { chave: string; usuario_id: number }) =>
      api(`/api/admin/flags/${chave}/usuarios/${usuario_id}`, { method: "DELETE" }),
    onSuccess: () => {
      toast({ title: "Usuário removido da flag" });
      invalidate();
    },
    onError: (e: Error) => toast({ title: e.message, variant: "destructive" }),
  });

  const flags = data || [];

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Flag className="h-6 w-6" /> Feature flags
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Comportamento novo nasce desligado. Ligue na conta de teste, valide, depois &quot;Liberar para todos&quot;.
          Desligar não precisa de deploy.
        </p>
        {health?.commit_short && (
          <p className="text-xs text-muted-foreground mt-2">
            Versão no ar: <code>{health.commit_short}</code> · env={health.env}
          </p>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Nova flag</CardTitle>
          <CardDescription>Sempre começa desligada (ativo_todos = false).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col md:flex-row gap-3">
          <div className="flex-1 space-y-1">
            <Label>Chave</Label>
            <Input placeholder="ex.: agente_recibo_v2" value={novaChave} onChange={(e) => setNovaChave(e.target.value)} />
          </div>
          <div className="flex-[2] space-y-1">
            <Label>Descrição</Label>
            <Input value={novaDesc} onChange={(e) => setNovaDesc(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button onClick={() => criarMut.mutate()} disabled={!novaChave.trim() || criarMut.isPending}>
              {criarMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4 mr-1" />}
              Criar
            </Button>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        flags.map((f) => (
          <Card key={f.chave}>
            <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
              <div>
                <CardTitle className="text-base font-mono">{f.chave}</CardTitle>
                <CardDescription>{f.descricao || "—"}</CardDescription>
                <div className="flex gap-2 mt-2">
                  {f.ativo_todos ? (
                    <Badge>Liberada para todos</Badge>
                  ) : (
                    <Badge variant="secondary">Só usuários na lista ({f.total_usuarios})</Badge>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" onClick={() => liberarMut.mutate(f.chave)} disabled={f.ativo_todos || liberarMut.isPending}>
                  <Power className="h-4 w-4 mr-1" /> Liberar para todos
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => desligarTodosMut.mutate(f.chave)}
                  disabled={!f.ativo_todos || desligarTodosMut.isPending}
                >
                  <PowerOff className="h-4 w-4 mr-1" /> Desligar todos
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="flex items-center gap-1 mb-2">
                  <Users className="h-4 w-4" /> Usuários com acesso individual
                </Label>
                {f.usuarios_detalhe?.length ? (
                  <ul className="text-sm space-y-1">
                    {f.usuarios_detalhe.map((u) => (
                      <li key={u.id} className="flex items-center justify-between gap-2 border rounded px-2 py-1">
                        <span>
                          #{u.id} {u.nome || "—"} <span className="text-muted-foreground">{u.email}</span>
                        </span>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => desligarUserMut.mutate({ chave: f.chave, usuario_id: u.id })}
                        >
                          Remover
                        </Button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground">Nenhum usuário individual.</p>
                )}
              </div>

              <div className="border-t pt-3 space-y-2">
                <Label>Ligar usuário (busca por nome, e-mail ou id)</Label>
                <Input
                  placeholder="Digite para buscar…"
                  value={flagAlvo === f.chave ? busca : ""}
                  onFocus={() => setFlagAlvo(f.chave)}
                  onChange={(e) => {
                    setFlagAlvo(f.chave);
                    setBusca(e.target.value);
                  }}
                />
                {flagAlvo === f.chave && usuariosBusca && usuariosBusca.length > 0 && (
                  <ul className="text-sm border rounded divide-y max-h-40 overflow-auto">
                    {usuariosBusca.map((u) => (
                      <li key={u.id} className="flex justify-between items-center px-2 py-1.5">
                        <span>
                          #{u.id} {u.nome} · {u.email}
                        </span>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => ligarUserMut.mutate({ chave: f.chave, usuario_id: u.id })}
                        >
                          Ligar
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
