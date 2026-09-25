import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Aviso de privacidade (LGPD) no primeiro acesso — tom leve, sem assustar.
 * Registra o aceite (data/versão/IP) no backend para prova legal.
 */
export default function LgpdConsent() {
  const { isAuthenticated } = useAuth();
  const [precisa, setPrecisa] = useState(false);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) {
      setPrecisa(false);
      return;
    }
    let ativo = true;
    apiRequest("/api/lgpd/status")
      .then((r: any) => {
        if (ativo && r && r.aceito === false) setPrecisa(true);
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [isAuthenticated]);

  if (!precisa) return null;

  const aceitar = async () => {
    setEnviando(true);
    try {
      await apiRequest("/api/lgpd/aceitar", { method: "POST" });
      setPrecisa(false);
    } catch {
      setEnviando(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lgpd-titulo"
    >
      <div className="w-full max-w-md rounded-t-xl border bg-card p-6 text-card-foreground shadow-lg sm:rounded-lg pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pb-6">
        <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
        </div>
        <h2 id="lgpd-titulo" className="text-lg font-semibold">
          Privacidade e proteção de dados
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Seus lançamentos ficam guardados de forma protegida. Usamos apenas <strong className="font-medium text-foreground">padrões gerais</strong> —
          nunca seus dados individuais — para melhorar o assistente.
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Você pode exportar ou apagar seus dados quando quiser.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Ao continuar, você concorda com nossa Política de Privacidade (LGPD).
        </p>
        <Button onClick={aceitar} disabled={enviando} className="mt-5 w-full">
          {enviando ? "Um instante…" : "Entendi, continuar"}
        </Button>
      </div>
    </div>
  );
}
