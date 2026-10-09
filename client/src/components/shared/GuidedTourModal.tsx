import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Sparkles,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  MessageSquare,
  MapPin,
  ListTree,
  BarChart3,
  X,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { onOpenGuidedTour, type TourChapterId } from "@/lib/guided-tour-bus";

const SEEN_KEY = "financehub_guided_tour_seen";

interface TourStep {
  title: string;
  description: string;
  /** Onde o recurso fica na tela — sempre mostrado como uma "pista" de localização. */
  where?: string;
  icon: JSX.Element;
  /** Passo do núcleo de valor (lançar por WhatsApp + ver no sistema). */
  core?: boolean;
  ctaLabel?: string;
  ctaHref?: string;
}

interface TourChapter {
  id: TourChapterId;
  /** Título curto do capítulo, usado no cabeçalho do modal. */
  label: string;
  steps: TourStep[];
}

/**
 * O tour é dividido em capítulos independentes: o capítulo "inicio" é o tour
 * curto de primeiro contato (boas-vindas + lançar por WhatsApp + ver no
 * sistema) e abre sozinho no primeiro acesso. Os demais capítulos só abrem
 * sob demanda, pelo botão "?" da página correspondente — cada um com sua
 * própria barra de progresso, sem depender do tour completo.
 */
function buildChapters(isPJ: boolean): TourChapter[] {
  const exemploGasto = isPJ ? "paguei 180 de fornecedor no pix" : "gastei 50 no mercado";
  const linkExtrato = isPJ ? "/p/transacoes" : "/transactions";
  const linkPlanoContas = isPJ ? "/p/categorias" : "/categories";
  const linkRelatorios = isPJ ? "/p/relatorios" : "/reports";
  const linkVencimentos = isPJ ? "/p/vencimentos" : "/contas-pagar";

  return [
    {
      id: "inicio",
      label: "Boas-vindas",
      steps: [
        {
          title: `Bem-vindo ao Khesef${isPJ ? " — modo empresa" : ""}`,
          description: isPJ
            ? "Gestão financeira da sua empresa (PJ) sem planilha. Vamos te mostrar o essencial em poucos passos — nada aqui é obrigatório, você decide o ritmo."
            : "Gestão financeira pessoal sem esforço. Vamos te mostrar o essencial em poucos passos — nada aqui é obrigatório, você decide o ritmo.",
          icon: <Sparkles className="h-6 w-6" />,
        },
        {
          title: "1º passo: lance algo pelo WhatsApp",
          description: `Abra a conversa do Khesef no seu WhatsApp e mande uma mensagem como "${exemploGasto}". Pode ser texto, áudio ou até foto do cupom fiscal — a IA entende e organiza pra você.`,
          where: "No WhatsApp, na conversa com o Khesef",
          icon: <MessageSquare className="h-6 w-6" />,
          core: true,
        },
        {
          title: "2º passo: veja aparecer aqui no sistema",
          description: "Depois de mandar a mensagem, volte aqui e confira: o lançamento já aparece no Dashboard e no extrato, na hora. É essa ponte WhatsApp ↔ sistema que faz o Khesef valer a pena no dia a dia.",
          where: isPJ ? "No menu lateral, em Transações" : "No Dashboard ou no menu lateral, em Transações",
          icon: <CheckCircle2 className="h-6 w-6" />,
          core: true,
          ctaLabel: "Ver Transações",
          ctaHref: linkExtrato,
        },
        {
          title: "Pronto! Você já pode começar",
          description: `O resto do sistema (plano de contas, relatórios, contas bancárias, cartões...) você conhece no seu ritmo, sempre que quiser: cada tela tem seu próprio botão "?" com uma explicação rápida de como usá-la.`,
          icon: <CheckCircle2 className="h-6 w-6" />,
        },
      ],
    },
    {
      id: "plano-contas",
      label: isPJ ? "Plano de contas" : "Categorias",
      steps: [
        {
          title: isPJ ? "Plano de contas" : "Categorias",
          description: isPJ
            ? "É como você organiza e categoriza receitas e despesas da empresa — separando o que é custo fixo, variável etc. Útil quando quiser relatórios e DRE mais detalhados, mas você não precisa configurar nada agora."
            : "É como você organiza e categoriza receitas e despesas — útil quando quiser relatórios mais detalhados. As categorias padrão já vêm prontas, você só ajusta se quiser.",
          where: isPJ ? "No menu lateral, em Plano de Contas" : "No menu lateral, em Categorias",
          icon: <ListTree className="h-6 w-6" />,
          ctaLabel: isPJ ? "Ver plano de contas" : "Ver categorias",
          ctaHref: linkPlanoContas,
        },
      ],
    },
    {
      id: "relatorios",
      label: "Relatórios",
      steps: [
        {
          title: "Relatórios e visão geral",
          description: isPJ
            ? "Gráficos de receita x despesa, DRE gerencial e projeção de caixa da empresa — tudo calculado sozinho a partir dos seus lançamentos."
            : "Gráficos de gastos por categoria, evolução mensal e metas — tudo calculado sozinho a partir dos seus lançamentos.",
          where: "No menu lateral, em Relatórios",
          icon: <BarChart3 className="h-6 w-6" />,
          ctaLabel: "Ver relatórios",
          ctaHref: linkRelatorios,
        },
      ],
    },
    {
      id: "outros-recursos",
      label: "Outros recursos",
      steps: [
        {
          title: "O resto do sistema, pra quando precisar",
          description: isPJ
            ? "Contas bancárias, cartões e faturas, vencimentos (contas a pagar), importação de extrato e configurações também estão no menu lateral — nenhum deles precisa ser configurado hoje, use quando fizer sentido para o seu negócio."
            : "Contas bancárias, cartões, mensalidades, vencimentos, importação de extrato e configurações também estão no menu lateral — nenhum deles precisa ser criado hoje, use quando fizer sentido pra você.",
          where: "No menu lateral e em Configurações",
          icon: <MapPin className="h-6 w-6" />,
          ctaLabel: "Ver vencimentos",
          ctaHref: linkVencimentos,
        },
      ],
    },
  ];
}

export function GuidedTourModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [chapterId, setChapterId] = useState<TourChapterId>("inicio");
  const [step, setStep] = useState(0);
  const { user } = useAuth();
  // Tour é para o cliente; o console do super admin não mostra.
  const consoleAdmin = (user as any)?.tipo_usuario === "super_admin" && !(user as any)?.isImpersonating;
  const isPJ = (user as any)?.tipo_pessoa === "juridica";

  const chapters = useMemo(() => buildChapters(isPJ), [isPJ]);
  const chapter = chapters.find((c) => c.id === chapterId) || chapters[0];

  useEffect(() => {
    if (!user || consoleAdmin) return;
    let hasSeenTour: string | null = null;
    try { hasSeenTour = localStorage.getItem(SEEN_KEY); } catch { /* sem storage */ }
    if (!hasSeenTour) {
      setChapterId("inicio");
      setStep(0);
      setIsOpen(true);
    }
  }, [user, consoleAdmin]);

  // Reabre um capítulo específico a qualquer momento (botão "?" da Sidebar ou
  // de uma página — ex.: Plano de Contas, Relatórios), sempre do passo 0
  // daquele capítulo, sem afetar os outros.
  useEffect(() => {
    return onOpenGuidedTour((id) => {
      setChapterId(id);
      setStep(0);
      setIsOpen(true);
    });
  }, []);

  const markSeen = () => {
    try { localStorage.setItem(SEEN_KEY, "true"); } catch { /* sem storage */ }
  };

  const handleClose = () => {
    // Só o capítulo "inicio" controla o auto-abrir no primeiro acesso.
    if (chapterId === "inicio") markSeen();
    setIsOpen(false);
  };

  const current = chapter.steps[step];
  const isLast = step === chapter.steps.length - 1;
  const isFirst = step === 0;
  const progressPct = Math.round(((step + 1) / chapter.steps.length) * 100);

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden">
        {/* Saída sempre visível — não fica escondida só no primeiro passo. */}
        <button
          type="button"
          onClick={handleClose}
          aria-label="Sair do tour"
          title="Sair do tour"
          className="absolute right-3 top-3 z-10 rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="p-6 text-center">
          {chapters.length > 1 && (
            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {chapter.label}
            </p>
          )}
          <div className="mx-auto mb-2 mt-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            {current.icon}
          </div>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold flex items-center justify-center gap-2">
              {current.title}
              {current.core && (
                <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary">
                  Experimente
                </span>
              )}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground mt-2">
              {current.description}
            </DialogDescription>
            {current.where && (
              <p className="mt-3 inline-flex items-center gap-1.5 self-center rounded-md bg-muted px-2.5 py-1 text-xs text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                {current.where}
              </p>
            )}
          </DialogHeader>

          {current.ctaHref && (
            <Link href={current.ctaHref} onClick={handleClose}>
              <Button variant="secondary" size="sm" className="mt-4">
                {current.ctaLabel}
              </Button>
            </Link>
          )}

          {/* Barra de progresso do CAPÍTULO atual — "segura" o usuário mostrando quanto falta dele. */}
          {chapter.steps.length > 1 && (
            <div className="mt-6">
              <div className="mb-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>Passo {step + 1} de {chapter.steps.length}</span>
                <span>{progressPct}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-border">
                <div
                  className="h-1.5 rounded-full bg-primary transition-all duration-300"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex flex-row items-center justify-between gap-2 border-t px-6 py-4 sm:justify-between">
          {!isFirst ? (
            <Button variant="outline" size="sm" onClick={() => setStep((s) => s - 1)}>
              <ArrowLeft className="w-4 h-4 mr-1" /> Voltar
            </Button>
          ) : (
            <Button variant="ghost" size="sm" onClick={handleClose}>
              Pular
            </Button>
          )}

          {!isLast ? (
            <Button size="sm" onClick={() => setStep((s) => s + 1)}>
              Próximo <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button size="sm" onClick={handleClose}>
              {chapterId === "inicio" ? "Começar" : "Entendi"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
