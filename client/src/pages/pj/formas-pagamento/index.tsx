import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Wallet, CreditCard } from "lucide-react";

/**
 * Tela legada — meio PJ = Conta / Caixinha / Cartão.
 * Rota mantida para favoritos; criação de forma solta foi desligada no backend.
 */
export default function PjFormasPagamento({ empresaId }: { empresaId: number }) {
  return (
    <div className="space-y-4 p-4 max-w-xl">
      <h1 className="text-2xl font-bold">Formas de pagamento</h1>
      <Card>
        <CardContent className="pt-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Esta tela foi descontinuada. O meio de pagamento da empresa é sempre uma destas três opções:
          </p>
          <ul className="text-sm space-y-2 list-disc pl-5">
            <li><strong>Conta bancária</strong> — Pix, TED, débito e boleto saem da conta</li>
            <li><strong>Caixinha</strong> — dinheiro em espécie</li>
            <li><strong>Cartão de crédito</strong> — entra na fatura</li>
          </ul>
          <div className="flex flex-wrap gap-2 pt-2">
            <Button asChild variant="default" size="sm">
              <Link href="/p/contas-bancarias">
                <Wallet className="h-4 w-4 mr-1" /> Contas e Caixinha
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/p/faturas">
                <CreditCard className="h-4 w-4 mr-1" /> Cartões e Faturas
              </Link>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Empresa #{empresaId}</p>
        </CardContent>
      </Card>
    </div>
  );
}
