import {
  Wallet,
  Tags,
  Target,
  BarChart3,
  MessageCircle,
  Building2,
  FileText,
  Landmark,
  ListTree,
  Gift,
} from "lucide-react";
import type { Tipo } from "../types";

interface Recurso {
  icon: typeof Wallet;
  titulo: string;
  descricao: string;
}

const RECURSOS: Record<Tipo, Recurso[]> = {
  fisica: [
    {
      icon: Wallet,
      titulo: "Receitas e despesas",
      descricao: "Controle completo do que entra e do que sai, em um só lugar.",
    },
    {
      icon: Tags,
      titulo: "Carteiras e categorias ilimitadas",
      descricao: "Organize contas, cartões e categorias do jeito que fizer sentido pra você.",
    },
    {
      icon: Target,
      titulo: "Metas e lembretes",
      descricao: "Defina metas financeiras e receba lembretes para não perder prazos.",
    },
    {
      icon: BarChart3,
      titulo: "Relatórios e gráficos",
      descricao: "Visão por categoria, período e forma de pagamento, sempre atualizada.",
    },
    {
      icon: MessageCircle,
      titulo: "Lançar por WhatsApp",
      descricao: "Texto, áudio, foto do cupom ou PDF — a IA lança e categoriza para você.",
    },
    {
      icon: Gift,
      titulo: "15 dias grátis",
      descricao: "Teste sem compromisso antes de decidir assinar.",
    },
  ],
  juridica: [
    {
      icon: Building2,
      titulo: "Tudo do plano Pessoa Física",
      descricao: "Controle pessoal e empresarial sem precisar de dois sistemas.",
    },
    {
      icon: Wallet,
      titulo: "Gestão financeira da empresa",
      descricao: "Receitas, despesas e caixa da PJ organizados em um painel dedicado.",
    },
    {
      icon: Landmark,
      titulo: "Contas a pagar e conciliação bancária",
      descricao: "Acompanhe vencimentos e concilie o extrato com os lançamentos da empresa.",
    },
    {
      icon: FileText,
      titulo: "DRE e fluxo de caixa projetado",
      descricao: "Relatório gerencial pronto e projeção de caixa para decidir com mais segurança.",
    },
    {
      icon: ListTree,
      titulo: "Plano de contas gerencial",
      descricao: "Estrutura de contas pensada para gestão, não só para contabilidade.",
    },
    {
      icon: Gift,
      titulo: "15 dias grátis",
      descricao: "Teste sem compromisso antes de decidir assinar.",
    },
  ],
};

export default function Recursos({ tipo }: { tipo: Tipo }) {
  const recursos = RECURSOS[tipo];

  return (
    <section className="px-4 py-14 sm:py-20">
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">
            {tipo === "juridica" ? "Recursos para sua empresa" : "Recursos para o seu dia a dia"}
          </h2>
        </div>

        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {recursos.map((recurso, i) => (
            <div key={i} className="rounded-xl border bg-card p-5">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center mb-3">
                <recurso.icon className="h-5 w-5 text-primary" aria-hidden="true" />
              </div>
              <h3 className="font-semibold text-foreground mb-1">{recurso.titulo}</h3>
              <p className="text-sm text-muted-foreground">{recurso.descricao}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
