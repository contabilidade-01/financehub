import { ShieldCheck, CreditCard, XCircle } from "lucide-react";

const ITENS = [
  {
    icon: CreditCard,
    texto: "Pagamento seguro via Pix, boleto ou cartão",
  },
  {
    icon: XCircle,
    texto: "Cancele quando quiser, sem burocracia",
  },
  {
    icon: ShieldCheck,
    texto: "Dados protegidos conforme a LGPD",
  },
];

export default function Confianca() {
  return (
    <section className="px-4 py-10 border-y bg-muted/30">
      <div className="mx-auto max-w-5xl">
        <div className="grid gap-6 sm:grid-cols-3">
          {ITENS.map((item, i) => (
            <div key={i} className="flex items-center gap-3 justify-center sm:justify-start">
              <item.icon className="h-5 w-5 text-primary shrink-0" aria-hidden="true" />
              <span className="text-sm font-medium text-foreground">{item.texto}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
