import React, { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Loader2, MessageSquare } from "lucide-react";

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

export default function SimularWhatsappPage() {
  const { toast } = useToast();
  const [busca, setBusca] = useState("");
  const [usuarioId, setUsuarioId] = useState<number | null>(null);
  const [usuarioLabel, setUsuarioLabel] = useState("");
  const [texto, setTexto] = useState("");
  const [resultado, setResultado] = useState<any>(null);

  const { data: usuarios } = useQuery({
    queryKey: ["sim-wa-busca", busca],
    enabled: busca.trim().length >= 2,
    queryFn: async () =>
      (await api(`/api/admin/flags/buscar-usuarios?q=${encodeURIComponent(busca.trim())}`)).usuarios as any[],
  });

  const mut = useMutation({
    mutationFn: () =>
      api("/api/admin/simular-whatsapp", {
        method: "POST",
        body: JSON.stringify({ usuario_id: usuarioId, texto }),
      }),
    onSuccess: (data) => {
      setResultado(data);
      toast({ title: "Simulação ok", description: `${data.ms} ms` });
    },
    onError: (e: Error) => {
      setResultado(null);
      toast({
        title: e.message,
        description: "Em produção o simulador retorna 404 (SIMULADOR_WHATSAPP deve ser true só na homologação).",
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <MessageSquare className="h-6 w-6" /> Simulador WhatsApp
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Homologação apenas (<code>SIMULADOR_WHATSAPP=true</code>). Usa o mesmo agente e histórico; não envia mensagem real.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mensagem</CardTitle>
          <CardDescription>Escolha o usuário e digite como se fosse o WhatsApp.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>Usuário</Label>
            <Input
              placeholder="Buscar nome ou e-mail…"
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
                      }}
                    >
                      #{u.id} {u.nome} · {u.email}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="space-y-1">
            <Label>Texto</Label>
            <Textarea
              rows={4}
              placeholder='ex.: compra de 31,30 no Banco Santander'
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </div>
          <Button
            disabled={!usuarioId || !texto.trim() || mut.isPending}
            onClick={() => mut.mutate()}
          >
            {mut.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            Enviar simulação
          </Button>
        </CardContent>
      </Card>

      {resultado && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Resposta do agente</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <pre className="whitespace-pre-wrap text-sm bg-muted/50 rounded p-3">{resultado.resposta}</pre>
            <div>
              <Label>Tools</Label>
              <pre className="text-xs overflow-auto max-h-80 bg-muted/50 rounded p-3 mt-1">
                {JSON.stringify(resultado.tools || [], null, 2)}
              </pre>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
