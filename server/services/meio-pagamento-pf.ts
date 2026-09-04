/**
 * Aplica regras de meio de pagamento PF (conta / cartão / forma) sobre um
 * patch de transação — usado no CREATE e no UPDATE.
 */
import { cartaoPfDoUsuario, resolverFaturaPf } from "./fatura-pf.service";
import { contaPadraoPf, listarContasPf } from "./conta-bancaria.service";

export type MeioPagamentoInput = {
  userId: number;
  walletId: number;
  tipo: string;
  dataISO: string;
  forma_pagamento_id?: number | null;
  conta_bancaria_id?: number | null;
  /** true se o body trouxe conta_bancaria_id explicitamente (mesmo null). */
  conta_bancaria_id_presente?: boolean;
  statusAtual?: string | null;
};

export type MeioPagamentoResult = {
  forma_pagamento_id: number | null;
  conta_bancaria_id: number | null;
  fatura_id: number | null;
  competencia: string | null;
  movimenta_caixa: boolean;
  status?: string;
  isCartao: boolean;
};

/**
 * Cartão → fatura + sem caixa + sem conta.
 * Conta / forma → caixa + conta (explícita ou padrão).
 */
export async function aplicarMeioPagamentoPf(
  input: MeioPagamentoInput,
): Promise<MeioPagamentoResult> {
  const formaId = input.forma_pagamento_id != null ? Number(input.forma_pagamento_id) : null;
  const contaBody = input.conta_bancaria_id != null ? Number(input.conta_bancaria_id) : null;

  if (formaId) {
    const cartao = await cartaoPfDoUsuario(formaId, input.userId);
    if (cartao) {
      if (input.tipo !== "Despesa") {
        throw new Error("Cartão de crédito só pode ser usado em Despesa.");
      }
      const { fatura, competencia } = await resolverFaturaPf(
        input.userId,
        input.walletId,
        cartao,
        input.dataISO,
      );
      let status = input.statusAtual || undefined;
      if (!status || status === "Efetivada") status = "Pendente";
      return {
        forma_pagamento_id: formaId,
        conta_bancaria_id: null,
        fatura_id: fatura.id,
        competencia,
        movimenta_caixa: false,
        status,
        isCartao: true,
      };
    }
  }

  // Não-cartão: mexe no caixa. Limpa fatura.
  let contaId: number | null = null;
  if (contaBody) {
    const minhas = await listarContasPf(input.userId);
    if (!minhas.find((c) => c.id === contaBody)) {
      throw new Error("Conta bancária não encontrada.");
    }
    contaId = contaBody;
  } else {
    contaId = await contaPadraoPf(input.userId);
  }

  return {
    forma_pagamento_id: formaId,
    conta_bancaria_id: contaId,
    fatura_id: null,
    competencia: null,
    movimenta_caixa: true,
    isCartao: false,
  };
}
