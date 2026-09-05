/**
 * Meio de pagamento PJ — visão de extrato.
 * Conta bancária → mexe no caixa.
 * Cartão de crédito → fatura / competência (não mexe no caixa).
 * Boleto NÃO é meio: o pagamento sai de uma conta.
 */
import { cartaoDoUsuario, resolverFaturaDoCartao } from "./fatura-pj.service";
import { getContasBancariasByEmpresa } from "../storage";

export type MeioPagamentoPjInput = {
  userId: number;
  empresaId: number;
  tipo: string;
  dataISO: string;
  cartao_id?: number | null;
  conta_bancaria_id?: number | null;
  /** Se true, exige conta ou cartão (create). Se false, permite herdar. */
  exigirMeio?: boolean;
  statusAtual?: string | null;
};

export type MeioPagamentoPjResult = {
  cartao_id: number | null;
  conta_bancaria_id: number | null;
  fatura_id: number | null;
  competencia: string | null;
  movimenta_caixa: boolean;
  metodo_pagamento: string | null;
  empresa_forma_pagamento_id: null;
  status?: string;
  isCartao: boolean;
};

export async function contaPadraoPj(empresaId: number): Promise<number | null> {
  const contas = await getContasBancariasByEmpresa(empresaId);
  const ativas = (contas as any[]).filter((c) => c.ativo !== false);
  const prefer =
    ativas.find((c) => c.tipo === "corrente") ||
    ativas.find((c) => c.tipo === "caixa") ||
    ativas[0];
  return prefer?.id ?? null;
}

/**
 * Cartão → fatura + sem caixa.
 * Conta → caixa + conta (explícita ou padrão se houver só uma / exigirMeio).
 */
export async function aplicarMeioPagamentoPj(
  input: MeioPagamentoPjInput,
): Promise<MeioPagamentoPjResult> {
  const cartaoId = input.cartao_id != null ? Number(input.cartao_id) : null;
  const contaBody = input.conta_bancaria_id != null ? Number(input.conta_bancaria_id) : null;

  if (cartaoId) {
    if (input.tipo !== "Despesa") {
      throw new Error("Cartão de crédito só pode ser usado em Despesa.");
    }
    const cartao = await cartaoDoUsuario(cartaoId, input.userId);
    if (!cartao || cartao.empresa_id !== input.empresaId) {
      throw new Error("Cartão não encontrado nesta empresa.");
    }
    const { fatura, competencia, metodo } = await resolverFaturaDoCartao(
      input.empresaId,
      cartao,
      input.dataISO,
    );
    return {
      cartao_id: cartao.id,
      conta_bancaria_id: null,
      fatura_id: fatura.id,
      competencia,
      movimenta_caixa: false,
      metodo_pagamento: metodo,
      empresa_forma_pagamento_id: null,
      isCartao: true,
    };
  }

  // Extrato / caixa: precisa de conta bancária.
  let contaId: number | null = null;
  if (contaBody) {
    const minhas = await getContasBancariasByEmpresa(input.empresaId);
    if (!(minhas as any[]).find((c) => c.id === contaBody)) {
      throw new Error("Conta bancária não encontrada nesta empresa.");
    }
    contaId = contaBody;
  } else {
    contaId = await contaPadraoPj(input.empresaId);
  }

  if (input.exigirMeio && !contaId) {
    throw new Error(
      "Informe a conta bancária (Pix/débito/TED/dinheiro) ou o cartão de crédito. Cadastre uma conta em Contas Bancárias se ainda não tiver.",
    );
  }

  const contas = await getContasBancariasByEmpresa(input.empresaId);
  const conta = (contas as any[]).find((c) => c.id === contaId);
  const metodo = conta ? (conta.nome || conta.banco || "Conta") : null;

  return {
    cartao_id: null,
    conta_bancaria_id: contaId,
    fatura_id: null,
    competencia: null,
    movimenta_caixa: true,
    metodo_pagamento: metodo,
    empresa_forma_pagamento_id: null,
    isCartao: false,
  };
}

/** Resolve texto do usuário/agente para cartão ou conta bancária. */
export async function resolverMeioPorNomePj(
  empresaId: number,
  userId: number,
  texto: string,
): Promise<
  | { ok: true; cartao_id?: number; conta_bancaria_id?: number; rotulo: string }
  | { ok: false; precisa: "conta" | "cartao" | "meio"; mensagem: string; sugestoes: string[] }
> {
  const raw = (texto || "").trim();
  if (!raw) {
    return {
      ok: false,
      precisa: "meio",
      mensagem: "Informe a conta bancária ou o cartão.",
      sugestoes: [],
    };
  }

  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const alvo = norm(raw);

  // Boleto sozinho não é meio.
  if (/^(boleto|bol)$/.test(alvo)) {
    const contas = await getContasBancariasByEmpresa(empresaId);
    const nomes = (contas as any[])
      .filter((c) => c.ativo !== false)
      .map((c) => c.nome || c.banco)
      .filter(Boolean);
    return {
      ok: false,
      precisa: "conta",
      mensagem:
        "Boleto não é meio de pagamento — o dinheiro sai de uma conta. De qual conta bancária foi/será pago?",
      sugestoes: nomes,
    };
  }

  // Pix/débito/TED/dinheiro sozinhos → precisa nome da conta.
  if (/^(pix|debito|transferencia|ted|doc|dinheiro|especie)$/.test(alvo)) {
    const contas = await getContasBancariasByEmpresa(empresaId);
    const ativas = (contas as any[]).filter((c) => c.ativo !== false);
    if (ativas.length === 1) {
      const c = ativas[0];
      return { ok: true, conta_bancaria_id: c.id, rotulo: c.nome || c.banco };
    }
    return {
      ok: false,
      precisa: "conta",
      mensagem: `Em qual conta bancária foi o ${raw}?`,
      sugestoes: ativas.map((c) => c.nome || c.banco).filter(Boolean),
    };
  }

  const { listarCartoes } = await import("./fatura-pj.service");
  const cartoes = await listarCartoes(empresaId);
  const cartao =
    cartoes.find((c) => norm(c.nome) === alvo) ||
    cartoes.find((c) => norm(c.nome).includes(alvo) || alvo.includes(norm(c.nome)));
  if (cartao) {
    return { ok: true, cartao_id: cartao.id, rotulo: cartao.nome };
  }

  const contas = await getContasBancariasByEmpresa(empresaId);
  const conta =
    (contas as any[]).find((c) => norm(c.banco || "") === alvo || norm(c.nome || "") === alvo) ||
    (contas as any[]).find(
      (c) =>
        norm(c.banco || "").includes(alvo) ||
        alvo.includes(norm(c.banco || "")) ||
        norm(c.nome || "").includes(alvo) ||
        alvo.includes(norm(c.nome || "")),
    );
  if (conta) {
    return { ok: true, conta_bancaria_id: conta.id, rotulo: conta.nome || conta.banco };
  }

  // Parece cartão (crédito / nome de bandeira) sem cadastro.
  if (/cartao|credito|nubank|inter|c6|itau|bradesco|santander|visa|master|elo|magalu/.test(alvo)) {
    return {
      ok: false,
      precisa: "cartao",
      mensagem: `Não achei o cartão "${raw}". Qual o nome exato, ou cadastre em Faturas de Cartão?`,
      sugestoes: cartoes.map((c) => c.nome),
    };
  }

  const nomesContas = (contas as any[])
    .filter((c) => c.ativo !== false)
    .map((c) => c.nome || c.banco)
    .filter(Boolean);
  const nomesCartoes = cartoes.map((c) => c.nome);
  return {
    ok: false,
    precisa: "meio",
    mensagem: `Não entendi "${raw}". Informe a conta bancária ou o cartão.`,
    sugestoes: [...nomesContas, ...nomesCartoes.map((n) => `CC ${n}`)],
  };
}
