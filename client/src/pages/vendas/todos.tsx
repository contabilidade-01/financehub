import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useSystemConfig } from "@/contexts/SystemConfigContext";
import Hero from "./sections/Hero";
import Confianca from "./sections/Confianca";
import PlanosTodos from "./sections/PlanosTodos";
import Faq from "./sections/Faq";
import Footer from "./sections/Footer";
import { goToApp } from "@/lib/marketing-host";
import type { Plan } from "./types";

/**
 * Página inicial do domínio de marketing (tudocontado.com.br): todos os planos.
 * PF e PJ MEI com preço da API e cadastro direto; PJ Empresa (ME) sob consulta (WhatsApp).
 */
export default function VendasTodos() {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const { config: systemConfig } = useSystemConfig();
  const nomeSistema = systemConfig?.system_name || "Tudo Contado";

  const pf = useQuery<Plan[]>({ queryKey: ["/api/subscription-plans?modalidade=pf"] });
  const mei = useQuery<Plan[]>({ queryKey: ["/api/subscription-plans?modalidade=pj_mei"] });
  const planoPf = (pf.data || []).find((p) => p.tipoPessoa === "fisica") || pf.data?.[0];
  const planoMei = (mei.data || []).find((p) => p.tipoPessoa === "juridica") || mei.data?.[0];

  const assinar = (modalidade: "pf" | "pj_mei") => {
    if (isAuthenticated) navigate("/subscription/renew");
    else goToApp(`/register?modalidade=${modalidade}`, navigate);
  };
  const verPlanos = () => document.getElementById("planos")?.scrollIntoView({ behavior: "smooth" });
  const irLogin = () => goToApp("/", navigate);

  return (
    <div className="min-h-screen bg-background">
      <Hero
        tipo="fisica"
        nomeSistema={nomeSistema}
        onAssinar={verPlanos}
        onLogin={irLogin}
        ctaLabel="Escolher meu plano"
        titulo="Seu financeiro organizado direto pelo WhatsApp"
        subtitulo="Mande uma mensagem, um áudio ou a foto do comprovante. A IA lança e categoriza, e você acompanha tudo no painel, seja da sua vida pessoal ou da sua empresa."
      />
      <Confianca />
      <PlanosTodos
        planoPf={planoPf}
        planoMei={planoMei}
        isLoading={pf.isLoading || mei.isLoading}
        isAuthenticated={isAuthenticated}
        onAssinar={assinar}
      />
      <Faq tipo="fisica" />
      <Footer nomeSistema={nomeSistema} />
    </div>
  );
}
