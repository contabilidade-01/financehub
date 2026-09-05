/**
 * Meio de pagamento PJ — visão de extrato.
 * Conta bancária → mexe no caixa.
 * Cartão de crédito → fatura / competência (não mexe no caixa).
 * Sem meio informado → Caixinha (conta tipo caixa).
 * Boleto NÃO é meio: o pagamento sai de uma conta.
 */
import { cartaoDoUsuario, resolverFaturaDoCartao } from "./fatura-pj.service";
import {
  createContaBancaria,
  getContasBancariasByEmpresa,
  updateContaBancaria,
} from "../storage";

export type MeioPagamentoPjInput = {
  userId: number;
  empresaId: number;
  tipo: string;
  dataISO: string;
  cartao_id?: number | null;
  conta_bancaria_id?: number | null;
  /** Se true, garante Caixinha quando não houver meio. */
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

const NOME_CAIXINHA = "Caixinha";

function ehCaixinha(c: any): boolean {
  const n = String(c?.nome || "").trim().toLowerCase();
  const b = String(c?.banco || "").trim().toLowerCase();
  return n === "caixinha" || b === "caixinha" || (c?.tipo === "caixa" && (n === "caixa" || b === "caixa"));
}

/** Garante a conta Caixinha da empresa (idempotente). */
export async function garantirCaixinhaPj(
  empresaId: number,
  usuarioId?: number | null,
): Promise<any> {
  const contas = await getContasBancariasByEmpresa(empresaId);
  const existente = (contas as any[]).find(ehCaixinha);
  if (existente) {
    if (String(existente.nome || "") !== NOME_CAIXINHA || existente.tipo !== "caixa") {
      try {
        await updateContaBancaria(existente.id, {
          banco: existente.banco || NOME_CAIXINHA,
          nome: NOME_CAIXINHA,
          tipo: "caixa",
        } as any);
      } catch {
        // coluna nome pode falhar em update legado — segue com o id
      }
    }
    return { ...existente, nome: NOME_CAIXINHA, tipo: "caixa" };
  }
  return createContaBancaria({
    empresa_id: empresaId,
    usuario_id: usuarioId ?? null,
    banco: NOME_CAIXINHA,
    nome: NOME_CAIXINHA,
    tipo: "caixa",
    saldo_inicial: 0,
  });
}

/** Preferência: Caixinha → corrente → caixa → primeira ativa. */
export async function contaPadraoPj(empresaId: number): Promise<number | null> {
  const contas = await getContasBancariasByEmpresa(empresaId);
  const ativas = (contas as any[]).filter((c) => c.ativo !== false);
  const prefer =
    ativas.find(ehCaixinha) ||
    ativas.find((c) => c.tipo === "corrente") ||
    ativas.find((c) => c.tipo === "caixa") ||
    ativas[0];
  return prefer?.id ?? null;
}

/**
 * Cartão → fatura + sem caixa.
 * Conta → caixa + conta (explícita, padrão ou Caixinha).
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

  let contaId: number | null = null;
  if (contaBody) {
    const minhas = await getContasBancariasByEmpresa(input.empresaId);
    if (!(minhas as any[]).find((c) => c.id === contaBody)) {
      throw new Error("Conta bancária não encontrada nesta empresa.");
    }
    contaId = contaBody;
  } else {
    // Sem meio → Caixinha (cria se ainda não existir).
    await garantirCaixinhaPj(input.empresaId, input.userId);
    contaId = await contaPadraoPj(input.empresaId);
  }

  if (input.exigirMeio && !contaId) {
    throw new Error(
      "Não foi possível usar a Caixinha. Cadastre uma conta em Contas Bancárias.",
    );
  }

  const contas = await getContasBancariasByEmpresa(input.empresaId);
  const conta = (contas as any[]).find((c) => c.id === contaId);
  const metodo = conta ? (conta.nome || conta.banco || NOME_CAIXINHA) : NOME_CAIXINHA;

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
    const caixa = await garantirCaixinhaPj(empresaId, userId);
    return { ok: true, conta_bancaria_id: caixa.id, rotulo: NOME_CAIXINHA };
  }

  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const alvo = norm(raw);

  // Caixinha / caixa / dinheiro em espécie → conta Caixinha.
  if (/^(caixinha|caixa|dinheiro|especie|em\s*especie)$/.test(alvo)) {
    const caixa = await garantirCaixinhaPj(empresaId, userId);
    return { ok: true, conta_bancaria_id: caixa.id, rotulo: NOME_CAIXINHA };
  }

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
        "Boleto não é meio de pagamento — o dinheiro sai de uma conta. De qual conta bancária foi/será pago? (Caixinha, se for em espécie)",
      sugestoes: nomes,
    };
  }

  // Pix/débito/TED sozinhos → precisa nome da conta (ou Caixinha se só houver ela).
  if (/^(pix|debito|transferencia|ted|doc)$/.test(alvo)) {
    const contas = await getContasBancariasByEmpresa(empresaId);
    const ativas = (contas as any[]).filter((c) => c.ativo !== false);
    if (ativas.length === 1) {
      const c = ativas[0];
      return { ok: true, conta_bancaria_id: c.id, rotulo: c.nome || c.banco };
    }
    const caixa = ativas.find(ehCaixinha);
    if (caixa && ativas.length <= 2) {
      return { ok: true, conta_bancaria_id: caixa.id, rotulo: NOME_CAIXINHA };
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
    mensagem: `Não entendi "${raw}". Informe a conta bancária, a Caixinha ou o cartão.`,
    sugestoes: [...nomesContas, ...nomesCartoes.map((n) => `CC ${n}`)],
  };
}
