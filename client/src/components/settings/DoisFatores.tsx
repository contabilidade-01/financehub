import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type Status = { ativo: boolean; codigos_restantes: number };
type Config = { segredo: string; otpauth: string; qr: string };

const erroDe = (e: any) => e?.error || e?.message || "Erro inesperado.";

/** Lista de códigos de recuperação, mostrada uma única vez. */
function CodigosRecuperacao({ codigos, onFechar }: { codigos: string[]; onFechar: () => void }) {
  const { toast } = useToast();
  const texto = codigos.join("\n");
  return (
    <div className="space-y-3 rounded-md border border-amber-500/50 bg-amber-500/10 p-4">
      <p className="text-sm font-medium">Guarde estes códigos de recuperação agora. Eles não aparecem de novo.</p>
      <p className="text-sm text-muted-foreground">
        Cada código entra uma única vez, caso você perca o celular. Guarde num lugar seguro fora do celular (papel, gerenciador de senhas).
      </p>
      <pre className="grid grid-cols-2 gap-2 rounded bg-background p-3 font-mono text-sm">
        {codigos.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </pre>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            navigator.clipboard?.writeText(texto).then(
              () => toast({ title: "Códigos copiados" }),
              () => toast({ title: "Não foi possível copiar", variant: "destructive" }),
            );
          }}
        >
          Copiar
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const url = URL.createObjectURL(new Blob([`Códigos de recuperação - Tudo Contado\n\n${texto}\n`], { type: "text/plain" }));
            const a = document.createElement("a");
            a.href = url;
            a.download = "codigos-recuperacao-tudo-contado.txt";
            a.click();
            URL.revokeObjectURL(url);
          }}
        >
          Baixar .txt
        </Button>
        <Button type="button" onClick={onFechar}>
          Já guardei
        </Button>
      </div>
    </div>
  );
}

export function DoisFatores() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: status, isLoading } = useQuery<Status>({
    queryKey: ["/api/auth/2fa"],
    queryFn: () => apiRequest<Status>("/api/auth/2fa", { method: "GET" }),
  });
  const [config, setConfig] = useState<Config | null>(null);
  const [codigo, setCodigo] = useState("");
  const [senha, setSenha] = useState("");
  const [codigosNovos, setCodigosNovos] = useState<string[] | null>(null);
  const [modo, setModo] = useState<"nada" | "desativar" | "regerar">("nada");

  const recarregar = () => qc.invalidateQueries({ queryKey: ["/api/auth/2fa"] });

  const configurar = useMutation({
    mutationFn: () => apiRequest<Config>("/api/auth/2fa/configurar", { method: "POST", data: {} }),
    onSuccess: (c) => {
      setConfig(c);
      setCodigo("");
    },
    onError: (e) => toast({ title: "Erro", description: erroDe(e), variant: "destructive" }),
  });
  const ativar = useMutation({
    mutationFn: () =>
      apiRequest<{ codigos_recuperacao: string[] }>("/api/auth/2fa/ativar", { method: "POST", data: { codigo } }),
    onSuccess: (r) => {
      setConfig(null);
      setCodigo("");
      setCodigosNovos(r.codigos_recuperacao);
      recarregar();
      toast({ title: "Verificação em duas etapas ativada" });
    },
    onError: (e) => toast({ title: "Erro", description: erroDe(e), variant: "destructive" }),
  });
  const desativar = useMutation({
    mutationFn: () => apiRequest("/api/auth/2fa/desativar", { method: "POST", data: { senha, codigo } }),
    onSuccess: () => {
      setModo("nada");
      setSenha("");
      setCodigo("");
      recarregar();
      toast({ title: "Verificação em duas etapas desativada" });
    },
    onError: (e) => toast({ title: "Erro", description: erroDe(e), variant: "destructive" }),
  });
  const regerar = useMutation({
    mutationFn: () =>
      apiRequest<{ codigos_recuperacao: string[] }>("/api/auth/2fa/codigos", { method: "POST", data: { codigo } }),
    onSuccess: (r) => {
      setModo("nada");
      setCodigo("");
      setCodigosNovos(r.codigos_recuperacao);
      recarregar();
    },
    onError: (e) => toast({ title: "Erro", description: erroDe(e), variant: "destructive" }),
  });

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" /> Verificação em duas etapas
        </CardTitle>
        <CardDescription>
          Além da senha, o login pede um código do aplicativo autenticador do seu celular (Google Authenticator, Microsoft
          Authenticator ou Authy).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}

        {codigosNovos && <CodigosRecuperacao codigos={codigosNovos} onFechar={() => setCodigosNovos(null)} />}

        {status && !status.ativo && !config && (
          <Button onClick={() => configurar.mutate()} disabled={configurar.isPending}>
            Ativar verificação em duas etapas
          </Button>
        )}

        {status && !status.ativo && config && (
          <div className="space-y-3">
            <p className="text-sm">1. No aplicativo autenticador, adicione uma conta lendo este QR code:</p>
            <img src={config.qr} alt="QR code do autenticador" className="h-[220px] w-[220px] rounded bg-white p-2" />
            <p className="text-sm text-muted-foreground">
              Sem câmera? Digite a chave: <span className="font-mono break-all">{config.segredo}</span>
            </p>
            <p className="text-sm">2. Digite o código de 6 dígitos que aparece no app:</p>
            <div className="flex max-w-xs gap-2">
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="123456"
                maxLength={6}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))}
              />
              <Button onClick={() => ativar.mutate()} disabled={codigo.length !== 6 || ativar.isPending}>
                Confirmar
              </Button>
            </div>
            <Button variant="link" className="px-0" onClick={() => setConfig(null)}>
              Cancelar
            </Button>
          </div>
        )}

        {status?.ativo && (
          <div className="space-y-3">
            <p className="text-sm">
              <span className="font-medium text-green-600">Ativa.</span> Códigos de recuperação restantes:{" "}
              <span className="font-medium">{status.codigos_restantes}</span>
              {status.codigos_restantes <= 3 && " — gere novos para não ficar sem."}
            </p>
            {modo === "nada" && (
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => { setCodigo(""); setModo("regerar"); }}>
                  Gerar novos códigos de recuperação
                </Button>
                <Button variant="outline" onClick={() => { setCodigo(""); setSenha(""); setModo("desativar"); }}>
                  Desativar
                </Button>
              </div>
            )}
            {modo !== "nada" && (
              <div className="max-w-sm space-y-2">
                {modo === "desativar" && (
                  <Input type="password" placeholder="Sua senha" value={senha} onChange={(e) => setSenha(e.target.value)} />
                )}
                <Input
                  placeholder="Código do app (ou de recuperação)"
                  maxLength={12}
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                />
                <div className="flex gap-2">
                  <Button
                    variant={modo === "desativar" ? "destructive" : "default"}
                    disabled={codigo.trim().length < 6 || (modo === "desativar" && !senha) || desativar.isPending || regerar.isPending}
                    onClick={() => (modo === "desativar" ? desativar.mutate() : regerar.mutate())}
                  >
                    {modo === "desativar" ? "Desativar" : "Gerar códigos"}
                  </Button>
                  <Button variant="ghost" onClick={() => setModo("nada")}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
