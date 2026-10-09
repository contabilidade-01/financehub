import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import type { Tipo } from "../types";

interface FaqItem {
  pergunta: string;
  resposta: string;
}

function getFaqs(tipo: Tipo): FaqItem[] {
  const isPJ = tipo === "juridica";
  const comuns: FaqItem[] = [
    {
      pergunta: "Preciso saber contabilidade para usar?",
      resposta:
        "Não. Você manda o lançamento pelo WhatsApp (texto, áudio, foto ou PDF) e a IA organiza e categoriza automaticamente. O painel mostra tudo de forma simples.",
    },
    {
      pergunta: "Funciona sem WhatsApp Business, só com WhatsApp normal?",
      resposta: "Sim, funciona com o WhatsApp que você já usa no dia a dia, sem precisar de conta comercial.",
    },
    {
      pergunta: "Posso cancelar quando quiser?",
      resposta:
        "Sim. Você pode cancelar a qualquer momento e o acesso continua disponível até o fim do período já pago — não cortamos o acesso na hora.",
    },
    {
      pergunta: "Meus dados estão seguros?",
      resposta:
        "Sim. Seguimos a LGPD: você pode solicitar a exportação (portabilidade) ou a exclusão dos seus dados a qualquer momento.",
    },
    {
      pergunta: "Como funcionam as mensagens do WhatsApp? É seguro mandar meus lançamentos por lá?",
      resposta:
        "Sim. As mensagens ficam hospedadas em servidor seguro, e as únicas informações compartilhadas são os dados das suas transações (valor, categoria, data). Nunca pedimos ou compartilhamos dados de conta bancária, senha ou cartão de crédito — nem qualquer outro dado sensível — pelo WhatsApp.",
    },
  ];

  if (isPJ) {
    comuns.push({
      pergunta: "O plano PJ substitui o contador da empresa?",
      resposta:
        "Não. O sistema organiza o financeiro da empresa (lançamentos, contas a pagar, conciliação bancária e DRE gerencial), mas não substitui a contabilidade formal.",
    });
  } else {
    comuns.push({
      pergunta: "Pessoa física pode usar para MEI ou empresa depois?",
      resposta:
        "O plano Pessoa Física é para as suas finanças pessoais. Se depois você precisar organizar o financeiro de uma empresa, é só migrar para o plano Pessoa Jurídica (PJ), que tem contas a pagar, conciliação bancária e DRE.",
    });
  }

  return comuns;
}

export default function Faq({ tipo }: { tipo: Tipo }) {
  const faqs = getFaqs(tipo);

  return (
    <section className="px-4 py-14 sm:py-20 bg-muted/30">
      <div className="mx-auto max-w-2xl">
        <div className="text-center mb-8">
          <h2 className="text-2xl sm:text-3xl font-bold text-foreground">Perguntas frequentes</h2>
        </div>

        <Accordion type="single" collapsible className="w-full">
          {faqs.map((faq, i) => (
            <AccordionItem key={i} value={`item-${i}`}>
              <AccordionTrigger className="text-left">{faq.pergunta}</AccordionTrigger>
              <AccordionContent className="text-muted-foreground">{faq.resposta}</AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
