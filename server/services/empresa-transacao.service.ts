import { storage } from "../storage";
import { updateEmpresaTransacaoSchema } from "../../shared/schema";

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

  // Aceita cartao_id no body mesmo fora do zod parcial estrito (vem do form).
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

  // Cartão no payload: "cartao_id" explícito (número) ou null para tirar do cartão.
  const mudouCartao = Object.prototype.hasOwnProperty.call(bruto, "cartao_id");
  const cartaoIdNovo = mudouCartao
    ? (bruto.cartao_id == null || bruto.cartao_id === "" ? null : Number(bruto.cartao_id))
    : undefined;

  if (cartaoIdNovo) {
    if (tipoFinal !== "Despesa") {
      return { ok: false, status: 400, error: "Cartão de crédito só pode ser usado em Despesa." };
    }
    const { cartaoDoUsuario, resolverFaturaDoCartao } = await import("./fatura-pj.service");
    const cartao = await cartaoDoUsuario(cartaoIdNovo, userId);
    if (!cartao || cartao.empresa_id !== empresaId) {
      return { ok: false, status: 400, error: "Cartão não encontrado nesta empresa." };
    }
    const dataISO = String(parsed.data.data_transacao ?? transacao.data_transacao).slice(0, 10);
    const { fatura, competencia, metodo } = await resolverFaturaDoCartao(empresaId, cartao, dataISO);
    patch.cartao_id = cartao.id;
    patch.fatura_id = fatura.id;
    patch.competencia = competencia;
    patch.movimenta_caixa = false;
    patch.empresa_forma_pagamento_id = null;
    patch.metodo_pagamento = metodo;
  } else if (cartaoIdNovo === null) {
    // Saiu do cartão → volta a ser lançamento de caixa / forma normal.
    patch.cartao_id = null;
    patch.fatura_id = null;
    patch.competencia = null;
    if (patch.movimenta_caixa === undefined) patch.movimenta_caixa = true;
  } else if ((transacao as any).cartao_id) {
    // Continua no mesmo cartão: se mudou a data, reatribui a fatura da competência.
    const dataNova = parsed.data.data_transacao
      ? String(parsed.data.data_transacao).slice(0, 10)
      : null;
    if (dataNova && dataNova !== String(transacao.data_transacao).slice(0, 10)) {
      const { cartaoDoUsuario, resolverFaturaDoCartao } = await import("./fatura-pj.service");
      const cartao = await cartaoDoUsuario(Number((transacao as any).cartao_id), userId);
      if (cartao && cartao.empresa_id === empresaId) {
        const { fatura, competencia, metodo } = await resolverFaturaDoCartao(empresaId, cartao, dataNova);
        patch.fatura_id = fatura.id;
        patch.competencia = competencia;
        patch.metodo_pagamento = metodo;
        patch.movimenta_caixa = false;
      }
    }
  }

  if (parsed.data.empresa_forma_pagamento_id != null && !cartaoIdNovo) {
    const { getFormaById } = await import("./empresa-forma.service");
    const forma = await getFormaById(empresaId, Number(parsed.data.empresa_forma_pagamento_id));
    if (!forma) return { ok: false, status: 400, error: "Forma de pagamento não encontrada." };
    patch.metodo_pagamento = forma.nome;
    patch.cartao_id = null;
    patch.fatura_id = null;
    patch.competencia = null;
    if (patch.movimenta_caixa === undefined) patch.movimenta_caixa = true;
  } else if (parsed.data.empresa_forma_pagamento_id === null && cartaoIdNovo === undefined) {
    patch.metodo_pagamento = parsed.data.metodo_pagamento ?? null;
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
    // Compra de cartão: baixa individual NÃO libera limite — isso só acontece
    // ao pagar a fatura. Garante fatura + competência e marca data_pagamento.
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
