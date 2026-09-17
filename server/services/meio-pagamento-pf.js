"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aplicarMeioPagamentoPf = aplicarMeioPagamentoPf;
/**
 * Aplica regras de meio de pagamento PF (conta / cartão / forma) sobre um
 * patch de transação — usado no CREATE e no UPDATE.
 */
const fatura_pf_service_1 = require("./fatura-pf.service");
const conta_bancaria_service_1 = require("./conta-bancaria.service");
/**
 * Cartão → fatura + sem caixa + sem conta.
 * Conta / forma → caixa + conta (explícita ou padrão).
 */
async function aplicarMeioPagamentoPf(input) {
    const formaId = input.forma_pagamento_id != null ? Number(input.forma_pagamento_id) : null;
    const contaBody = input.conta_bancaria_id != null ? Number(input.conta_bancaria_id) : null;
    if (formaId) {
        const cartao = await (0, fatura_pf_service_1.cartaoPfDoUsuario)(formaId, input.userId);
        if (cartao) {
            if (input.tipo !== "Despesa") {
                throw new Error("Cartão de crédito só pode ser usado em Despesa.");
            }
            const { fatura, competencia } = await (0, fatura_pf_service_1.resolverFaturaPf)(input.userId, input.walletId, cartao, input.dataISO);
            let status = input.statusAtual || undefined;
            if (!status || status === "Efetivada")
                status = "Pendente";
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
    let contaId = null;
    if (contaBody) {
        const minhas = await (0, conta_bancaria_service_1.listarContasPf)(input.userId);
        if (!minhas.find((c) => c.id === contaBody)) {
            throw new Error("Conta bancária não encontrada.");
        }
        contaId = contaBody;
    }
    else {
        contaId = await (0, conta_bancaria_service_1.contaPadraoPf)(input.userId);
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
