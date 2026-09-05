/**
 * Meio de pagamento PJ — visão de extrato.
 * Conta bancária → mexe no caixa.
 * Cartão de crédito → fatura / competência (não mexe no caixa).
 * Dinheiro / espécie → Caixinha (conta tipo caixa).
 * PIX / boleto / débito / TED NÃO são meio: perguntar a conta (Caixinha não conta).
 * Boleto NÃO é meio: o pagamento sai de uma conta.
 */
import { cartaoDoUsuario, listarCartoes, resolverFaturaDoCartao } from "./fatura-pj.service";
import {
  createContaBancaria,
  getContasBancariasByEmpresa,
  updateContaBancaria,
} from "../storage";
import { detectarMeio, normMeio } from "./parse-meio";

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
  aviso?: string;
};

export type ResolverMeioPjFail = {
  ok: false;
  precisa: "conta" | "cartao" | "meio" | "cadastrar_conta" | "cadastrar_cartao";
  mensagem: string;
  sugestoes: string[];
  contas?: string[];
  cartoes?: string[];
  nome_sugerido?: string;
  faltando?: string[];
  instrucao_agente?: string;
};

const NOME_CAIXINHA = "Caixinha";

function norm(s: string) {
  return normMeio(s);
}

export function ehCaixinha(c: any): boolean {
  const n = String(c?.nome || "").trim().toLowerCase();
  const b = String(c?.banco || "").trim().toLowerCase();
  return n === "caixinha" || b === "caixinha" || (c?.tipo === "caixa" && (n === "caixa" || b === "caixa"));
}

/** Contas bancárias de verdade (Pix/TED/boleto) — exclui Caixinha. */
export function contasBancariasReais(ativas: any[]): any[] {
  return (ativas || []).filter((c) => !ehCaixinha(c));
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
  const bancarias = contasBancariasReais(ativas);
  const nomesContas = ativas.map((c) => c.nome || c.banco).filter(Boolean) as string[];
  const nomesBancarias = bancarias.map((c) => c.nome || c.banco).filter(Boolean) as string[];
  const cartoes = await listarCartoes(empresaId);
  const nomesCartoes = cartoes.map((c) => c.nome);
  return { ativas, bancarias, nomesContas, nomesBancarias, cartoes, nomesCartoes };
}

/**
 * Casamento seguro de nome: todas as palavras do alvo precisam existir
 * no candidato (palavra inteira). Evita "via caixa" engolir "Caixa Econômica".
 */
export function casaNomeMeio(alvoRaw: string, candidatoRaw: string): boolean {
  const alvo = norm(alvoRaw);
  const cand = norm(candidatoRaw);
  if (!alvo || !cand) return false;
  if (alvo === cand) return true;
  const alvoWords = alvo.split(/[^a-z0-9]+/).filter(Boolean);
  const candWords = cand.split(/[^a-z0-9]+/).filter(Boolean);
  if (alvoWords.length === 0) return false;
  if (alvoWords.every((w) => candWords.includes(w))) return true;
  // Um único termo longo: prefixo/contém (ex.: "santand" → Santander).
  if (alvoWords.length === 1 && alvo.length > 5) {
    return candWords.some((w) => w.startsWith(alvo) || alvo.startsWith(w) || w.includes(alvo));
  }
  return false;
}

function failCadastrarConta(termo: string, nomesCartoes: string[]): ResolverMeioPjFail {
  return {
    ok: false,
    precisa: "cadastrar_conta",
    mensagem:
      `Você ainda não tem conta bancária cadastrada` +
      (termo ? ` (para ${termo})` : "") +
      `. Quer cadastrar agora? Me diga o banco e o nome (ex.: Itaú, Conta corrente). Use criar_conta_bancaria_empresa.`,
    sugestoes: [],
    contas: [],
    cartoes: nomesCartoes,
  };
}

function resolverContaNecessaria(
  termo: string,
  bancarias: any[],
  nomesBancarias: string[],
  nomesCartoes: string[],
): ResolverMeioPjOk | ResolverMeioPjFail {
  if (bancarias.length === 0) {
    return failCadastrarConta(termo, nomesCartoes);
  }
  if (bancarias.length === 1) {
    const c = bancarias[0];
    const rotulo = c.nome || c.banco;
    return {
      ok: true,
      conta_bancaria_id: c.id,
      rotulo,
      aviso: `Usei a conta ${rotulo} (única conta bancária cadastrada).`,
    };
  }
  return {
    ok: false,
    precisa: "conta",
    mensagem: `Em qual conta bancária foi o ${termo}? Você tem: ${nomesBancarias.join(", ")}.`,
    sugestoes: nomesBancarias,
    contas: nomesBancarias,
    cartoes: nomesCartoes,
  };
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
 * Usa detectarMeio — "em dinheiro" / "via caixa" → Caixinha sem perguntar.
 */
export async function resolverMeioPorNomePj(
  empresaId: number,
  userId: number,
  texto: string,
): Promise<ResolverMeioPjOk | ResolverMeioPjFail> {
  const raw = (texto || "").trim();
  const { ativas, bancarias, nomesContas, nomesBancarias, cartoes, nomesCartoes } =
    await listasMeios(empresaId);

  const det = detectarMeio(raw);

  if (det.tipo === "dinheiro") {
    const caixa = await garantirCaixinhaPj(empresaId, userId);
    return {
      ok: true,
      conta_bancaria_id: caixa.id,
      rotulo: NOME_CAIXINHA,
      aviso: "Lancei na Caixinha (dinheiro).",
    };
  }

  if (det.tipo === "conta_necessaria") {
    return resolverContaNecessaria(det.termo, bancarias, nomesBancarias, nomesCartoes);
  }

  // "cartão" / "cartão de crédito" sem nome — nunca inventar Nubank/etc.
  if (det.tipo === "cartao_generico" || /^(cartao|cartao\s+de\s+credito|credito)$/.test(norm(raw))) {
    if (cartoes.length === 1) {
      return {
        ok: true,
        cartao_id: cartoes[0].id,
        rotulo: cartoes[0].nome,
        aviso: `Usei o cartão ${cartoes[0].nome} (único cadastrado).`,
      };
    }
    if (cartoes.length === 0) {
      return {
        ok: false,
        precisa: "cadastrar_cartao",
        mensagem:
          "Compra no cartão — qual o nome do cartão? Ainda não há nenhum cadastrado. Diga o nome + dia de fechamento e vencimento numa resposta só.",
        sugestoes: [],
        contas: nomesBancarias,
        cartoes: [],
        faltando: ["nome", "dia_fechamento", "dia_vencimento"],
        instrucao_agente:
          "Pergunte o nome do cartão e fechamento+vencimento. NÃO invente nome (ex. Nubank). Ao receber, cadastrar_cartao_empresa e lancar.",
      } as ResolverMeioPjFail;
    }
    return {
      ok: false,
      precisa: "cartao",
      mensagem: `Em qual cartão? Você tem: ${nomesCartoes.join(", ")}.`,
      sugestoes: nomesCartoes,
      contas: nomesBancarias,
      cartoes: nomesCartoes,
      instrucao_agente:
        "Pergunte qual cartão da lista. NÃO invente nome que o usuário não disse.",
    } as ResolverMeioPjFail;
  }

  if (!raw || det.tipo === "nenhum") {
    return {
      ok: false,
      precisa: "meio",
      mensagem:
        "Como foi pago/recebido? Conta bancária, Caixinha (dinheiro) ou cartão de crédito?",
      sugestoes: [...nomesContas, ...nomesCartoes.map((n) => `CC ${n}`)],
      contas: nomesContas,
      cartoes: nomesCartoes,
    };
  }

  // tipo === "nome"
  const alvo = norm(det.termo || raw);

  const cartao =
    cartoes.find((c) => norm(c.nome) === alvo) ||
    cartoes.find((c) => casaNomeMeio(alvo, c.nome));
  if (cartao) {
    return { ok: true, cartao_id: cartao.id, rotulo: cartao.nome };
  }

  const conta =
    ativas.find((c) => norm(c.banco || "") === alvo || norm(c.nome || "") === alvo) ||
    ativas.find(
      (c) => casaNomeMeio(alvo, c.banco || "") || casaNomeMeio(alvo, c.nome || ""),
    );
  if (conta) {
    return { ok: true, conta_bancaria_id: conta.id, rotulo: conta.nome || conta.banco };
  }

  if (/cartao|credito|nubank|inter|c6|itau|bradesco|santander|visa|master|elo|magalu|hipercard|amex/.test(alvo)) {
    return {
      ok: false,
      precisa: "cadastrar_cartao",
      mensagem:
        `Não achei o cartão "${raw}" nesta empresa.` +
        (nomesCartoes.length
          ? ` Você tem: ${nomesCartoes.join(", ")}. Ou cadastre o novo.`
          : " Ainda não há cartão cadastrado.") +
        ` Para cadastrar *${raw}*, diga o dia de fechamento e o dia de vencimento numa resposta só (ex.: "fecha dia 10, vence dia 17").`,
      sugestoes: nomesCartoes,
      contas: nomesBancarias,
      cartoes: nomesCartoes,
      nome_sugerido: raw,
      faltando: ["dia_fechamento", "dia_vencimento"],
      instrucao_agente:
        "Peça fechamento e vencimento numa pergunta só. Ao receber, chame cadastrar_cartao_empresa e EM SEGUIDA o lançamento (lancar_empresa ou parcelar_compra_empresa). Se o usuário já confirmou a compra (sim/isso/pode), NÃO peça confirmação de novo — execute.",
    } as ResolverMeioPjFail;
  }

  return {
    ok: false,
    precisa: "meio",
    mensagem: `Não entendi "${raw}". Informe a conta bancária, a Caixinha (dinheiro) ou o cartão.`,
    sugestoes: [...nomesContas, ...nomesCartoes.map((n) => `CC ${n}`)],
    contas: nomesContas,
    cartoes: nomesCartoes,
  };
}
