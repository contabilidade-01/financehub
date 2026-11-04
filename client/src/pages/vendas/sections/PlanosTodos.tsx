import { Building2, Briefcase, User as UserIcon, Check, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { Plan } from "../types";

function formatBRL(v: string | number): string {
  const n = typeof v === "number" ? v : parseFloat(String(v || "0"));
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** WhatsApp da equipe comercial/suporte (+55 11 93903-3814). */
export const LINK_CONSULTA_PJ_EMPRESA =
  "https://wa.me/5511939033814?text=" +
  encodeURIComponent("Olá! Vim pelo site e quero saber o valor do plano PJ Empresa (ME) do Tudo Contado.");

interface PlanosTodosProps {
  planoPf: Plan | undefined;
  planoMei: Plan | undefined;
  isLoading: boolean;
  isAuthenticated: boolean;
  onAssinar: (modalidade: "pf" | "pj_mei") => void;
}

// Preço exibido enquanto a API não responde; acompanha Admin > Planos de Assinatura.
const PRECO_PADRAO = { pf: 29.9, pj_mei: 79.9 };

interface Cartao {
  chave: "pf" | "pj_mei" | "pj_me";
  icone: typeof UserIcon;
  nome: string;
  para: string;
  itens: string[];
}

const CARTOES: Cartao[] = [
  {
    chave: "pf",
    icone: UserIcon,
    nome: "Pessoa Física",
    para: "Suas finanças pessoais e da família.",
    itens: [
      "Lançamentos por WhatsApp (texto, áudio, foto e PDF)",
      "Carteiras, cartões e categorias ilimitados",
      "Metas e lembretes de contas",
      "Relatórios e gráficos",
    ],
  },
  {
    chave: "pj_mei",
    icone: Briefcase,
    nome: "PJ MEI",
    para: "O caixa do seu MEI separado das contas pessoais.",
    itens: [
      "Tudo do plano Pessoa Física",
      "Caixa da empresa separado do pessoal",
      "Contas a pagar com lembretes",
      "Conciliação bancária, DRE e fluxo de caixa",
    ],
  },
  {
    chave: "pj_me",
    icone: Building2,
    nome: "PJ Empresa (ME)",
    para: "Gestão financeira completa da microempresa.",
    itens: [
      "Contas a pagar e a receber",
      "Conciliação bancária por extrato",
      "Centros de custo e DRE completo",
      "Lançamentos pelo WhatsApp para a equipe",
    ],
  },
];

export default function PlanosTodos({ planoPf, planoMei, isLoading, isAuthenticated, onAssinar }: PlanosTodosProps) {
  const preco = (chave: "pf" | "pj_mei") => {
    if (isLoading) return "—";
    const p = chave === "pf" ? planoPf : planoMei;
    return formatBRL(p?.priceMonthly ?? PRECO_PADRAO[chave]);
  };

  return (
    <section className="px-4 py-14 sm:py-20" id="planos">
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Escolha o seu plano</h2>
          <p className="mt-2 text-muted-foreground">15 dias grátis para testar, sem compromisso.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {CARTOES.map((c) => {
            const Icone = c.icone;
            const consulta = c.chave === "pj_me";
            return (
              <Card key={c.chave} className="border bg-card flex flex-col">
                <CardHeader className="text-center">
                  <div className="inline-flex items-center gap-1 self-center rounded-md bg-primary/10 px-2 py-1 text-xs font-semibold text-primary">
                    <Icone className="h-4 w-4" aria-hidden="true" />
                    {c.nome}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">{c.para}</p>
                  <div className="mt-4 flex items-end justify-center gap-1 min-h-[3.5rem]">
                    {consulta ? (
                      <span className="text-3xl font-extrabold tracking-tight">Sob consulta</span>
                    ) : (
                      <>
                        <span className="text-xl font-semibold">R$</span>
                        <span className="text-4xl font-extrabold tracking-tight">{preco(c.chave as "pf" | "pj_mei")}</span>
                        <span className="text-muted-foreground mb-1">/mês</span>
                      </>
                    )}
                  </div>
                </CardHeader>

                <CardContent className="flex flex-1 flex-col">
                  <ul className="space-y-3 mb-6 flex-1">
                    {c.itens.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>

                  {consulta ? (
                    <Button asChild className="w-full" size="lg" variant="outline">
                      <a href={LINK_CONSULTA_PJ_EMPRESA} target="_blank" rel="noopener noreferrer">
                        <MessageCircle className="h-4 w-4 mr-2" aria-hidden="true" />
                        Consultar valor
                      </a>
                    </Button>
                  ) : (
                    <Button className="w-full" size="lg" onClick={() => onAssinar(c.chave as "pf" | "pj_mei")}>
                      {isAuthenticated ? "Assinar agora" : "Começar (15 dias grátis)"}
                    </Button>
                  )}

                  <p className="text-center text-xs text-muted-foreground mt-3">
                    {consulta
                      ? "Fale com a equipe pelo WhatsApp e receba uma proposta."
                      : "Pix, boleto ou cartão. Cancele quando quiser."}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </section>
  );
}
