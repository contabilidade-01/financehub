import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useSystemConfig } from "@/contexts/SystemConfigContext";
import Hero from "./sections/Hero";
import ComoFunciona from "./sections/ComoFunciona";
import Recursos from "./sections/Recursos";
import Confianca from "./sections/Confianca";
import Pricing from "./sections/Pricing";
import Faq from "./sections/Faq";
import CtaFinal from "./sections/CtaFinal";
import Footer from "./sections/Footer";
import type { Plan, Tipo } from "./types";

// Benefícios padrão (usados quando o plano não tem features cadastradas em JSON).
const BENEFICIOS: Record<Tipo, string[]> = {
  fisica: [
    "Controle de receitas e despesas",
    "Carteiras e categorias ilimitadas",
    "Metas e lembretes financeiros",
    "Relatórios e gráficos",
    "Lançar por WhatsApp (texto, áudio, foto e PDF)",
    "15 dias de degustação grátis",
  ],
  juridica: [
    "Tudo do plano Pessoa Física",
    "Gestão financeira da empresa (PJ)",
    "Contas a pagar e conciliação bancária",
    "DRE e fluxo de caixa projetado",
    "Plano de contas gerencial",
    "15 dias de degustação grátis",
  ],
};

export default function SalesPage({ tipo }: { tipo: Tipo }) {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const { config: systemConfig } = useSystemConfig();

  // A página de vendas de PJ é o autoatendimento do plano de entrada (PJ MEI);
  // o plano PJ ME (ERP completo) e o PJ + Consultoria são venda assistida, não
  // aparecem aqui. Pedimos a modalidade explicitamente para não depender da
  // ordem em que os planos vêm da API.
  const modalidade = tipo === "juridica" ? "pj_mei" : "pf";
  const { data: plans = [], isLoading } = useQuery<Plan[]>({
    queryKey: [`/api/subscription-plans?modalidade=${modalidade}`],
  });

  const plano = plans.find((p) => p.tipoPessoa === tipo) || plans[0];

  let features: string[] = [];
  try {
    features = JSON.parse(plano?.features || "[]");
  } catch {
    features = [];
  }
  if (!features.length) features = BENEFICIOS[tipo];

  const nomeSistema = systemConfig?.system_name || "Khesef";

  const irAssinar = () => {
    if (isAuthenticated) navigate("/subscription/renew");
    else navigate(`/register?tipo=${tipo}`);
  };

  const irLogin = () => navigate("/");
  const trocarTipo = () => navigate(tipo === "juridica" ? "/assinar/pf" : "/assinar/pj");

  const ctaLabel = isAuthenticated ? "Assinar agora" : "Começar — 15 dias grátis";

  return (
    <div className="min-h-screen bg-background">
      <Hero tipo={tipo} nomeSistema={nomeSistema} onAssinar={irAssinar} onLogin={irLogin} ctaLabel={ctaLabel} />
      <ComoFunciona tipo={tipo} />
      <Recursos tipo={tipo} />
      <Confianca />
      <Pricing
        tipo={tipo}
        plano={plano}
        isLoading={isLoading}
        features={features}
        isAuthenticated={isAuthenticated}
        onAssinar={irAssinar}
        onTrocarTipo={trocarTipo}
      />
      <Faq tipo={tipo} />
      <CtaFinal tipo={tipo} ctaLabel={ctaLabel} onAssinar={irAssinar} onLogin={irLogin} onTrocarTipo={trocarTipo} />
      <Footer nomeSistema={nomeSistema} />
    </div>
  );
}
