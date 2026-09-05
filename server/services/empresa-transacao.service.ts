import { storage } from "../storage";
import { updateEmpresaTransacaoSchema } from "../../shared/schema";
import { aplicarMeioPagamentoPj } from "./meio-pagamento-pj";

/**
 * Regras de atualização de transação PJ, num lugar só.
 * Usado pelo controller (PUT /api/empresas/:id/transacoes/:transacaoId) e pela
 * tool do agente ('atualiza_transacao_empresa'), para que a edição pela tela e
 * a edição pelo WhatsApp obedeçam exatamente às mesmas validações de posse.
 */

export type ResultadoAtualizacao =
  | { ok: true; transacao: any; anterior: any }
  | { ok: false; status: number; error: string; details?: any };

export async function atualizarTransacaoEmpresa(
  empresaId: number,
  transacaoId: number,
  userId: number,
  dados: unknown,
): Promise<ResultadoAtualizacao> {
  const empresa = await storage.getEmpresaById(empresaId);
  if (!empresa) return { ok: false, status: 404, error: "Empresa não encontrada." };
  if (empresa.usuario_id !== userId) return { ok: false, status: 403, error: "Acesso negado." };

  const transacao = await storage.getEmpresaTransacaoById(transacaoId);
  if (!transacao) return { ok: false, status: 404, error: "Transação não encontrada." };
  if (transacao.empresa_id !== empresaId) {
    return { ok: false, status: 403, error: "Transação não pertence a esta empresa." };
  }

  const bruto = (dados || {}) as any;
  const parsed = updateEmpresaTransacaoSchema.safeParse(dados);
  if (!parsed.success) {
    return { ok: false, status: 400, error: "Dados inválidos", details: parsed.error.errors };
  }

  const tipoFinal = (parsed.data.tipo as string) ?? transacao.tipo;
  const contaFinalId = (parsed.data.categoria_id as number) ?? transacao.categoria_id;

  const conta = await storage.getEmpresaContaById(contaFinalId);
  if (!conta) return { ok: false, status: 400, error: "Categoria não encontrada." };
  if (conta.empresa_id !== empresaId) {
    return { ok: false, status: 400, error: "Categoria não pertence a esta empresa." };
  }
  if (conta.tipo !== tipoFinal) {
    return {
      ok: false,
      status: 400,
      error: `Tipo '${tipoFinal}' incompatível com a conta '${conta.codigo} — ${conta.nome}' (${conta.tipo}). Escolha uma conta de ${tipoFinal}.`,
    };
  }

  const patch: any = { ...parsed.data };
  const dataISO = String(parsed.data.data_transacao ?? transacao.data_transacao).slice(0, 10);

  const mudouCartao = Object.prototype.hasOwnProperty.call(bruto, "cartao_id");
  const mudouContaBanc = Object.prototype.hasOwnProperty.call(bruto, "conta_bancaria_id");

  if (mudouCartao || mudouContaBanc) {
    const cartaoId = mudouCartao
      ? (bruto.cartao_id == null || bruto.cartao_id === "" ? null : Number(bruto.cartao_id))
      : ((transacao as any).cartao_id ?? null);
    // Se trocou para cartão, zera conta; se trocou para conta, zera cartão.
    let contaBancId = mudouContaBanc
      ? (bruto.conta_bancaria_id == null || bruto.conta_bancaria_id === "" ? null : Number(bruto.conta_bancaria_id))
      : ((transacao as any).conta_bancaria_id ?? null);
    let cartaoFinal = cartaoId;
    if (mudouCartao && cartaoId) contaBancId = null;
    if (mudouContaBanc && !mudouCartao) cartaoFinal = null;
    if (mudouContaBanc && contaBancId && !cartaoId) cartaoFinal = null;
    if (mudouCartao && cartaoId == null && !mudouContaBanc) {
      // Saiu do cartão sem informar conta → usa padrão / exige.
      contaBancId = (transacao as any).conta_bancaria_id ?? null;
    }

    try {
      const meio = await aplicarMeioPagamentoPj({
        userId,
        empresaId,
        tipo: tipoFinal,
        dataISO,
        cartao_id: cartaoFinal,
        conta_bancaria_id: contaBancId,
        exigirMeio: true,
        statusAtual: (parsed.data.status as string) ?? transacao.status,
      });
      patch.cartao_id = meio.cartao_id;
      patch.conta_bancaria_id = meio.conta_bancaria_id;
      patch.fatura_id = meio.fatura_id;
      patch.competencia = meio.competencia;
      patch.movimenta_caixa = meio.movimenta_caixa;
      patch.empresa_forma_pagamento_id = meio.empresa_forma_pagamento_id;
      patch.metodo_pagamento = meio.metodo_pagamento;
    } catch (meioErr: any) {
      return { ok: false, status: 400, error: meioErr?.message || "Meio de pagamento inválido." };
    }
  } else if ((transacao as any).cartao_id) {
    // Continua no mesmo cartão: se mudou a data, reatribui a fatura da competência.
    const dataNova = parsed.data.data_transacao
      ? String(parsed.data.data_transacao).slice(0, 10)
      : null;
    if (dataNova && dataNova !== String(transacao.data_transacao).slice(0, 10)) {
      try {
        const meio = await aplicarMeioPagamentoPj({
          userId,
          empresaId,
          tipo: tipoFinal,
          dataISO: dataNova,
          cartao_id: Number((transacao as any).cartao_id),
          exigirMeio: true,
        });
        patch.fatura_id = meio.fatura_id;
        patch.competencia = meio.competencia;
        patch.metodo_pagamento = meio.metodo_pagamento;
        patch.movimenta_caixa = false;
        patch.conta_bancaria_id = null;
      } catch (meioErr: any) {
        return { ok: false, status: 400, error: meioErr?.message || "Meio de pagamento inválido." };
      }
    }
  }

  const updated = await storage.updateEmpresaTransacao(transacaoId, patch);
  return { ok: true, transacao: updated, anterior: transacao };
}

/**
 * Baixa uma conta a pagar PJ: Pendente → Efetivada.
 * - Sem cartão: liga movimenta_caixa (entra no fluxo de caixa).
 * - Com cartão: mantém competência (não mexe caixa); garante vínculo na fatura
 *   aberta — o saldo do cartão continua refletindo até a fatura ser paga.
 */
export async function baixarTransacaoEmpresa(
  empresaId: number,
  transacaoId: number,
  userId: number,
  dataPagamento?: string | null,
): Promise<ResultadoAtualizacao> {
  const empresa = await storage.getEmpresaById(empresaId);
  if (!empresa) return { ok: false, status: 404, error: "Empresa não encontrada." };
  if (empresa.usuario_id !== userId) return { ok: false, status: 403, error: "Acesso negado." };

  const transacao = await storage.getEmpresaTransacaoById(transacaoId);
  if (!transacao) return { ok: false, status: 404, error: "Transação não encontrada." };
  if (transacao.empresa_id !== empresaId) {
    return { ok: false, status: 403, error: "Transação não pertence a esta empresa." };
  }
  if (transacao.status === "Efetivada" && (transacao as any).data_pagamento) {
    return { ok: false, status: 400, error: "Este lançamento já está baixado." };
  }

  const hoje = new Date().toISOString().slice(0, 10);
  const data = (dataPagamento && /^\d{4}-\d{2}-\d{2}/.test(dataPagamento))
    ? dataPagamento.slice(0, 10)
    : hoje;

  const cartaoId = (transacao as any).cartao_id as number | null;
  if (cartaoId) {
    const { cartaoDoUsuario, resolverFaturaDoCartao } = await import("./fatura-pj.service");
    const cartao = await cartaoDoUsuario(cartaoId, userId);
    const patch: any = {
      status: "Efetivada",
      data_pagamento: data,
      movimenta_caixa: false,
    };
    if (cartao && cartao.empresa_id === empresaId) {
      const dataTx = String(transacao.data_transacao).slice(0, 10);
      const { fatura, competencia, metodo } = await resolverFaturaDoCartao(empresaId, cartao, dataTx);
      patch.fatura_id = fatura.id;
      patch.competencia = competencia;
      patch.metodo_pagamento = metodo;
    }
    const updated = await storage.updateEmpresaTransacao(transacaoId, patch);
    return { ok: true, transacao: updated, anterior: transacao };
  }

  const updated = await storage.updateEmpresaTransacao(transacaoId, {
    status: "Efetivada",
    data_pagamento: data,
    movimenta_caixa: true,
  } as any);

  return { ok: true, transacao: updated, anterior: transacao };
}
