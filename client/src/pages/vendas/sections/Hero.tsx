import { LineChart } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Tipo } from "../types";

interface HeroProps {
  tipo: Tipo;
  nomeSistema: string;
  onAssinar: () => void;
  onLogin: () => void;
  ctaLabel: string;
}

export default function Hero({ tipo, nomeSistema, onAssinar, onLogin, ctaLabel }: HeroProps) {
  const isPJ = tipo === "juridica";

  return (
    <section className="px-4 pt-10 pb-14 sm:pt-16 sm:pb-20">
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-8">
          <div className="w-12 h-12 mx-auto rounded-lg bg-primary flex items-center justify-center mb-4">
            <LineChart className="h-6 w-6 text-primary-foreground" aria-hidden="true" />
          </div>
          <p className="text-sm font-semibold text-primary mb-2">{nomeSistema}</p>
        </div>

        <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
          <div className="text-center lg:text-left">
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-foreground">
              {isPJ
                ? "A gestão financeira da sua empresa, direto no WhatsApp"
                : "Sua vida financeira organizada direto pelo WhatsApp"}
            </h1>
            <p className="mt-4 text-lg text-muted-foreground max-w-xl mx-auto lg:mx-0">
              {isPJ
                ? "Mande o comprovante, o áudio ou a nota por WhatsApp. A IA classifica, você acompanha contas a pagar, conciliação bancária e DRE no painel."
                : "Mande uma mensagem, um áudio ou a foto do cupom pelo WhatsApp. A IA organiza tudo e você acompanha receitas, despesas e metas no painel."}
            </p>

            <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
              <Button size="lg" onClick={onAssinar} className="text-base">
                {ctaLabel}
              </Button>
              <Button size="lg" variant="outline" onClick={onLogin} className="text-base">
                Já tem conta? Entrar
              </Button>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Sem cartão de crédito para começar. Cancele quando quiser.
            </p>
          </div>

          <div className="mx-auto w-full max-w-sm" aria-hidden="true">
            <WhatsAppMockup tipo={tipo} />
          </div>
        </div>
      </div>
    </section>
  );
}

function WhatsAppMockup({ tipo }: { tipo: Tipo }) {
  const isPJ = tipo === "juridica";
  return (
    <div className="rounded-2xl border bg-card shadow-lg overflow-hidden">
      <div className="bg-primary text-primary-foreground px-4 py-3 flex items-center gap-2">
        <div className="w-8 h-8 rounded-full bg-primary-foreground/20 flex items-center justify-center text-sm font-bold">
          {isPJ ? "PJ" : "PF"}
        </div>
        <div>
          <p className="text-sm font-semibold leading-none">
            {isPJ ? "Financeiro da Empresa" : "Meu Financeiro"}
          </p>
          <p className="text-xs text-primary-foreground/80 mt-0.5">online</p>
        </div>
      </div>
      <div className="p-4 space-y-3 bg-muted/30 min-h-[220px]">
        <div className="flex justify-end">
          <div className="max-w-[80%] rounded-xl rounded-tr-sm bg-primary text-primary-foreground px-3 py-2 text-sm">
            {isPJ ? "Paguei fornecedor XYZ, R$ 1.240,00 hoje" : "Mercado R$ 87,50 no cartão"}
          </div>
        </div>
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-xl rounded-tl-sm bg-card border px-3 py-2 text-sm">
            {isPJ
              ? "Lançado ✅ Categoria: Fornecedores. Conta a pagar baixada."
              : "Lançado ✅ Categoria: Alimentação"}
          </div>
        </div>
        <div className="flex justify-end">
          <div className="max-w-[80%] rounded-xl rounded-tr-sm bg-primary text-primary-foreground px-3 py-2 text-sm flex items-center gap-2">
            <span>🎤 0:07</span>
          </div>
        </div>
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-xl rounded-tl-sm bg-card border px-3 py-2 text-sm">
            {isPJ
              ? "Entendi! Recebimento de cliente de R$ 3.500 registrado."
              : "Entendi! Recebi seu salário de R$ 3.500 e já atualizei seu saldo."}
          </div>
        </div>
      </div>
    </div>
  );
}
