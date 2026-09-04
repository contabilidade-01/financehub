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
  // Posse: a empresa é do usuário?
  const empresa = await storage.getEmpresaById(empresaId);
  if (!empresa) return { ok: false, status: 404, error: "Empresa não encontrada." };
  if (empresa.usuario_id !== userId) return { ok: false, status: 403, error: "Acesso negado." };

  // Posse: a transação é dessa empresa?
  const transacao = await storage.getEmpresaTransacaoById(transacaoId);
  if (!transacao) return { ok: false, status: 404, error: "Transação não encontrada." };
  if (transacao.empresa_id !== empresaId) {
    return { ok: false, status: 403, error: "Transação não pertence a esta empresa." };
  }

  const parsed = updateEmpresaTransacaoSchema.safeParse(dados);
  if (!parsed.success) {
    return { ok: false, status: 400, error: "Dados inválidos", details: parsed.error.errors };
  }

  // Conta e tipo precisam continuar coerentes DEPOIS da edição — senão o
  // lançamento entra no DRE/fluxo do lado errado.
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
  if (parsed.data.empresa_forma_pagamento_id != null) {
    const { getFormaById } = await import("./empresa-forma.service");
    const forma = await getFormaById(empresaId, Number(parsed.data.empresa_forma_pagamento_id));
    if (!forma) return { ok: false, status: 400, error: "Forma de pagamento não encontrada." };
    patch.metodo_pagamento = forma.nome;
  } else if (parsed.data.empresa_forma_pagamento_id === null) {
    patch.metodo_pagamento = parsed.data.metodo_pagamento ?? null;
  }

  const updated = await storage.updateEmpresaTransacao(transacaoId, patch);
  return { ok: true, transacao: updated, anterior: transacao };
}

/**
 * Baixa uma conta a pagar PJ: Pendente → Efetivada.
 * Grava data_pagamento e liga movimenta_caixa (importações entram com caixa=false).
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

  const updated = await storage.updateEmpresaTransacao(transacaoId, {
    status: "Efetivada",
    data_pagamento: data,
    movimenta_caixa: true,
  } as any);

  return { ok: true, transacao: updated, anterior: transacao };
}
