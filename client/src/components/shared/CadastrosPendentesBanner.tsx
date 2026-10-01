import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle } from "lucide-react";

type Pendentes = {
  cartoes: { id: number; nome: string }[];
  contas: { id: number; nome: string | null; banco: string }[];
  total: number;
};

/**
 * Aviso de contas e cartões criados automaticamente pela importação que ainda precisam de
 * dados (fechamento e vencimento do cartão, saldo inicial da conta). Some quando completos.
 */
export function CadastrosPendentesBanner({ mostrar = "todos" }: { mostrar?: "todos" | "cartoes" | "contas" }) {
  const { data } = useQuery<Pendentes>({ queryKey: ["/api/cadastros-pendentes"] });
  const cartoes = mostrar === "contas" ? [] : data?.cartoes ?? [];
  const contas = mostrar === "cartoes" ? [] : data?.contas ?? [];
  if (!cartoes.length && !contas.length) return null;
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm" data-testid="cadastros-pendentes">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
      <div className="space-y-1">
        {cartoes.length > 0 && (
          <p>
            <b>{cartoes.length === 1 ? "1 cartão criado" : `${cartoes.length} cartões criados`} pela importação</b> com dias de
            fechamento e vencimento provisórios ({cartoes.map((c) => c.nome).join(", ")}). Complete em{" "}
            <Link href="/cartoes" className="underline underline-offset-2">Cartões de Crédito</Link>: ao salvar, as faturas são recalculadas.
          </p>
        )}
        {contas.length > 0 && (
          <p>
            <b>{contas.length === 1 ? "1 conta criada" : `${contas.length} contas criadas`} pela importação</b> (
            {contas.map((c) => c.nome || c.banco).join(", ")}). Informe o saldo inicial em{" "}
            <Link href="/contas-cartoes" className="underline underline-offset-2">Contas</Link>.
          </p>
        )}
      </div>
    </div>
  );
}
