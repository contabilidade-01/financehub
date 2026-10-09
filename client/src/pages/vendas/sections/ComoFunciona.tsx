import { MessageCircle, Sparkles, BarChart3, FileSpreadsheet, Target } from "lucide-react";
import type { Tipo } from "../types";

interface Passo {
  icon: typeof MessageCircle;
  titulo: string;
  descricao: string;
}

export default function ComoFunciona({ tipo }: { tipo: Tipo }) {
  const isPJ = tipo === "juridica";

  const passos: Passo[] = [
    {
      icon: MessageCircle,
      titulo: "Mande uma mensagem no WhatsApp",
      descricao: "Texto, áudio, foto do cupom ou PDF — do jeito que for mais fácil na hora.",
    },
    {
      icon: Sparkles,
      titulo: "A IA organiza e categoriza sozinha",
      descricao: "Sem planilha, sem digitar valor por valor: a inteligência artificial identifica e classifica o lançamento.",
    },
    isPJ
      ? {
          icon: FileSpreadsheet,
          titulo: "Contas a pagar e conciliação bancária",
          descricao: "Acompanhe vencimentos e concilie o extrato do banco com os lançamentos da empresa.",
        }
      : {
          icon: BarChart3,
          titulo: "Acompanhe no painel",
          descricao: "Relatórios e gráficos por categoria, período e forma de pagamento, sempre atualizados.",
        },
    isPJ
      ? {
          icon: BarChart3,
          titulo: "Feche o mês com DRE",
          descricao: "Relatório gerencial pronto (DRE) e fluxo de caixa projetado, sem trabalho manual.",
        }
      : {
          icon: Target,
          titulo: "Defina metas e lembretes",
          descricao: "Acompanhe metas financeiras e receba lembretes para não perder o controle.",
        },
  ];

  return (
    <section className="px-4 py-14 sm:py-20 bg-muted/30">
      <div className="mx-auto max-w-5xl">
        <div className="text-center mb-10">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Como funciona</h2>
          <p className="mt-2 text-muted-foreground">
            {isPJ
              ? "Do lançamento no WhatsApp ao fechamento do mês."
              : "Do lançamento no WhatsApp ao controle total das suas finanças."}
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {passos.map((passo, i) => (
            <div key={i} className="relative rounded-xl border bg-card p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <passo.icon className="h-5 w-5 text-primary" aria-hidden="true" />
                </div>
                <span className="text-xs font-semibold text-muted-foreground">Passo {i + 1}</span>
              </div>
              <h3 className="font-semibold text-foreground mb-1">{passo.titulo}</h3>
              <p className="text-sm text-muted-foreground">{passo.descricao}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
