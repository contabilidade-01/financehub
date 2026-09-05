/**
 * Meio de pagamento PJ — visão de extrato.
 * Conta bancária → mexe no caixa.
 * Cartão de crédito → fatura / competência (não mexe no caixa).
 * Dinheiro / espécie → Caixinha (conta tipo caixa).
 * PIX / boleto / débito / TED NÃO são meio: perguntar a conta.
 * Boleto NÃO é meio: o pagamento sai de uma conta.
 */
import { cartaoDoUsuario, listarCartoes, resolverFaturaDoCartao } from "./fatura-pj.service";
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
  /** Se true e sem meio, garante Caixinha (API/UI). Agente deve perguntar antes. */
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

export type ResolverMeioPjOk = {
  ok: true;
  cartao_id?: number;
  conta_bancaria_id?: number;
  rotulo: string;
};

export type ResolverMeioPjFail = {
  ok: false;
  precisa: "conta" | "cartao" | "meio";
  mensagem: string;
  sugestoes: string[];
  contas?: string[];
  cartoes?: string[];
};

const NOME_CAIXINHA = "Caixinha";

function norm(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

export function ehCaixinha(c: any): boolean {
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

async function listasMeios(empresaId: number) {
  const contas = await getContasBancariasByEmpresa(empresaId);
  const ativas = (contas as any[]).filter((c) => c.ativo !== false);
  const nomesContas = ativas.map((c) => c.nome || c.banco).filter(Boolean) as string[];
  const cartoes = await listarCartoes(empresaId);
  const nomesCartoes = cartoes.map((c) => c.nome);
  return { ativas, nomesContas, cartoes, nomesCartoes };
}

/**
 * Cartão → fatura + sem caixa.
 * Conta → caixa + conta (explícita ou Caixinha se exigirMeio sem id).
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
  } else if (input.exigirMeio) {
    // API/UI sem meio → Caixinha (formulário costuma pré-selecionar).
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

/**
 * Resolve texto do usuário/agente para cartão ou conta bancária.
 * Nunca cria forma solta. Sem texto → pergunta (não assume Caixinha).
 */
export async function resolverMeioPorNomePj(
  empresaId: number,
  userId: number,
  texto: string,
): Promise<ResolverMeioPjOk | ResolverMeioPjFail> {
  const raw = (texto || "").trim();
  const { ativas, nomesContas, cartoes, nomesCartoes } = await listasMeios(empresaId);

  if (!raw) {
    return {
      ok: false,
      precisa: "meio",
      mensagem:
        "Como foi pago/recebido? Informe a conta bancária, a Caixinha (dinheiro) ou o cartão de crédito.",
      sugestoes: [...nomesContas, ...nomesCartoes.map((n) => `CC ${n}`)],
      contas: nomesContas,
      cartoes: nomesCartoes,
    };
  }

  const alvo = norm(raw);

  // Caixinha / caixa / dinheiro em espécie → conta Caixinha.
  if (/^(caixinha|caixa|dinheiro|especie|em\s*especie)$/.test(alvo)) {
    const caixa = await garantirCaixinhaPj(empresaId, userId);
    return { ok: true, conta_bancaria_id: caixa.id, rotulo: NOME_CAIXINHA };
  }

  // Boleto sozinho não é meio.
  if (/^(boleto|bol)$/.test(alvo)) {
    return {
      ok: false,
      precisa: "conta",
      mensagem:
        "Boleto não é meio de pagamento — o dinheiro sai de uma conta. De qual conta bancária foi/será pago?",
      sugestoes: nomesContas,
      contas: nomesContas,
      cartoes: nomesCartoes,
    };
  }

  // Pix/débito/TED sozinhos → precisa nome da conta (1 conta = usa e avisa).
  if (/^(pix|debito|transferencia|ted|doc)$/.test(alvo)) {
    if (ativas.length === 1) {
      const c = ativas[0];
      return { ok: true, conta_bancaria_id: c.id, rotulo: c.nome || c.banco };
    }
    return {
      ok: false,
      precisa: "conta",
      mensagem: `Em qual conta bancária foi o ${raw}?`,
      sugestoes: nomesContas,
      contas: nomesContas,
      cartoes: nomesCartoes,
    };
  }

  const cartao =
    cartoes.find((c) => norm(c.nome) === alvo) ||
    cartoes.find((c) => norm(c.nome).includes(alvo) || alvo.includes(norm(c.nome)));
  if (cartao) {
    return { ok: true, cartao_id: cartao.id, rotulo: cartao.nome };
  }

  const conta =
    ativas.find((c) => norm(c.banco || "") === alvo || norm(c.nome || "") === alvo) ||
    ativas.find(
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
      mensagem: `Não achei o cartão "${raw}". Qual o nome exato, ou cadastre em Cartões e Faturas (com fechamento e vencimento)?`,
      sugestoes: nomesCartoes,
      contas: nomesContas,
      cartoes: nomesCartoes,
    };
  }

  return {
    ok: false,
    precisa: "meio",
    mensagem: `Não entendi "${raw}". Informe a conta bancária, a Caixinha ou o cartão.`,
    sugestoes: [...nomesContas, ...nomesCartoes.map((n) => `CC ${n}`)],
    contas: nomesContas,
    cartoes: nomesCartoes,
  };
}
