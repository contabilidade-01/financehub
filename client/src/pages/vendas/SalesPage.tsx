import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useSystemConfig } from "@/contexts/SystemConfigContext";

type Tipo = "fisica" | "juridica";

interface Plan {
  id: number;
  name: string;
  description?: string | null;
  priceMonthly: string | number;
  tipoPessoa?: string | null;
  features?: string | null;
}

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

function formatBRL(v: string | number): string {
  const n = typeof v === "number" ? v : parseFloat(String(v || "0"));
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function SalesPage({ tipo }: { tipo: Tipo }) {
  const [, navigate] = useLocation();
  const { isAuthenticated } = useAuth();
  const { config: systemConfig } = useSystemConfig();

  const { data: plans = [], isLoading } = useQuery<Plan[]>({
    queryKey: [`/api/subscription-plans?tipo=${tipo}`],
  });

  const plano = plans.find((p) => p.tipoPessoa === tipo) || plans[0];

  let features: string[] = [];
  try {
    features = JSON.parse(plano?.features || "[]");
  } catch {
    features = [];
  }
  if (!features.length) features = BENEFICIOS[tipo];

  const isPJ = tipo === "juridica";
  const nomeSistema = systemConfig?.system_name || "Khesef";

  const irAssinar = () => {
    if (isAuthenticated) navigate("/subscription/renew");
    else navigate(`/register?tipo=${tipo}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-pattern">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="w-12 h-12 mx-auto rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center shadow-neon mb-3">
            <i className="ri-line-chart-fill text-2xl text-white"></i>
          </div>
          <h1 className="text-3xl font-bold font-space">{nomeSistema}</h1>
          <p className="text-gray-400 mt-1">
            {isPJ ? "O controle financeiro da sua empresa" : "Seu controle financeiro pessoal"}
          </p>
        </div>

        <Card className="glass-card neon-border">
          <CardHeader className="text-center">
            <div className="inline-flex items-center gap-1 self-center rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
              <i className={isPJ ? "ri-building-2-line" : "ri-user-line"}></i>
              {isPJ ? "Plano Pessoa Jurídica (PJ)" : "Plano Pessoa Física (PF)"}
            </div>
            <div className="mt-4 flex items-end justify-center gap-1">
              <span className="text-2xl font-semibold">R$</span>
              <span className="text-5xl font-extrabold tracking-tight">
                {isLoading ? "—" : formatBRL(plano?.priceMonthly ?? (isPJ ? 79.9 : 39.9))}
              </span>
              <span className="text-gray-400 mb-1">/mês</span>
            </div>
            {plano?.description && (
              <p className="text-sm text-gray-400 mt-2">{plano.description}</p>
            )}
          </CardHeader>

          <CardContent>
            <ul className="space-y-3 mb-6">
              {features.map((f, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <i className="ri-check-line text-primary text-base mt-0.5"></i>
                  <span>{f}</span>
                </li>
              ))}
            </ul>

            <Button className="w-full" size="lg" onClick={irAssinar}>
              {isAuthenticated ? "Assinar agora" : "Começar (15 dias grátis)"}
            </Button>

            <p className="text-center text-xs text-gray-500 mt-3">
              Pagamento seguro via Pix, boleto ou cartão. Cancele quando quiser.
            </p>

            <div className="text-center mt-4">
              <Button
                variant="link"
                className="p-0 text-sm text-gray-400"
                onClick={() => navigate(isPJ ? "/assinar/pf" : "/assinar/pj")}
              >
                {isPJ ? "Sou pessoa física — ver plano PF" : "Tenho empresa — ver plano PJ"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="text-center mt-4">
          <Button variant="link" className="text-sm text-gray-400" onClick={() => navigate("/")}>
            Já tem conta? Entrar
          </Button>
        </div>
      </div>
    </div>
  );
}
