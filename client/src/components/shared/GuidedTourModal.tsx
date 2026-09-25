import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, ArrowRight, CheckCircle2, MessageSquare, Wallet, PieChart, Shield } from "lucide-react";

export function GuidedTourModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    const hasSeenTour = localStorage.getItem("financehub_guided_tour_seen");
    if (!hasSeenTour) {
      setIsOpen(true);
    }
  }, []);

  const handleClose = () => {
    localStorage.setItem("financehub_guided_tour_seen", "true");
    setIsOpen(false);
  };

  const steps = [
    {
      title: "Bem-vindo ao Khesef",
      description: "Gestão financeira pessoal e empresarial (PJ) em um só lugar. Veja em um minuto os principais recursos.",
      icon: <Sparkles className="h-6 w-6" />
    },
    {
      title: "Contas e carteiras",
      description: "Gerencie suas contas, adicione transações manuais ou importe extratos. Tenha a visão clara do seu fluxo de caixa e saldo em tempo real.",
      icon: <Wallet className="h-6 w-6" />
    },
    {
      title: "Lançamentos pelo WhatsApp",
      description: "Envie áudios ou mensagens no WhatsApp para registrar gastos na hora ('gastei 50 no mercado') ou simular metas ('em quanto tempo consigo 100k guardando 5k/mês?').",
      icon: <MessageSquare className="h-6 w-6" />
    },
    {
      title: "Relatórios e DRE gerencial",
      description: "Acompanhe gráficos de despesas por categoria, DRE para empresas (PJ) e planeje suas metas financeiras com facilidade.",
      icon: <PieChart className="h-6 w-6" />
    },
    {
      title: "Tudo pronto para começar",
      description: "Você já pode explorar todas as funcionalidades. Se precisar de ajuda, o assistente virtual está sempre disponível.",
      icon: <CheckCircle2 className="h-6 w-6" />
    }
  ];

  const current = steps[step];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
      <DialogContent className="sm:max-w-md text-center p-6">
        <div className="mx-auto mb-2 mt-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          {current.icon}
        </div>
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold">{current.title}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground mt-2">
            {current.description}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center gap-1 my-6">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? "w-6 bg-primary" : "w-1.5 bg-border"
              }`}
            />
          ))}
        </div>

        <DialogFooter className="flex sm:justify-between gap-2">
          {step > 0 ? (
            <Button variant="outline" onClick={() => setStep(step - 1)}>
              Voltar
            </Button>
          ) : (
            <Button variant="ghost" onClick={handleClose}>
              Pular tour
            </Button>
          )}

          {step < steps.length - 1 ? (
            <Button onClick={() => setStep(step + 1)}>
              Próximo <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleClose}>
              Começar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
