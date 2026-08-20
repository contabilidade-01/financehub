import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest } from "@/lib/queryClient";

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
      style={{
        position: "fixed", inset: 0, zIndex: 100000,
        background: "rgba(0,0,0,.55)", backdropFilter: "blur(2px)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        style={{
          background: "var(--card, #ffffff)", color: "var(--foreground, #16201b)",
          borderRadius: 18, maxWidth: 440, width: "100%", padding: 26,
          boxShadow: "0 24px 70px rgba(0,0,0,.35)",
        }}
      >
        <div style={{ fontSize: "1.8rem", marginBottom: 6 }}>👋</div>
        <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: "0 0 10px" }}>
          Que bom ter você aqui!
        </h2>
        <p style={{ fontSize: ".96rem", lineHeight: 1.55, margin: 0, opacity: 0.92 }}>
          A gente cuida das suas finanças com carinho e segurança: seus lançamentos ficam
          guardados de forma protegida e usamos apenas <strong>padrões gerais</strong> — nunca
          seus dados individuais — para deixar o assistente cada vez mais esperto pra você.
        </p>
        <p style={{ fontSize: ".9rem", lineHeight: 1.5, marginTop: 10, opacity: 0.9 }}>
          Você segue no controle: pode exportar ou apagar seus dados quando quiser. 💚
        </p>
        <p style={{ fontSize: ".78rem", opacity: 0.6, marginTop: 12 }}>
          Ao continuar, você concorda com nossa Política de Privacidade (LGPD).
        </p>
        <button
          onClick={aceitar}
          disabled={enviando}
          style={{
            marginTop: 18, width: "100%", padding: "13px 16px", borderRadius: 12,
            border: "none", cursor: enviando ? "default" : "pointer",
            background: "#0E5C55", color: "#fff", fontWeight: 700, fontSize: "1rem",
            opacity: enviando ? 0.6 : 1,
          }}
        >
          {enviando ? "Um instante…" : "Entendi, quero começar"}
        </button>
      </div>
    </div>
  );
}
