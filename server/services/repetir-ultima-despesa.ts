/**
 * Atalho WhatsApp: "adiciona/adicionar/mais/outro/outra <valor>" = repetir a
 * ÚLTIMA despesa com outro valor (mesma descrição, mesma conta/classificação e
 * mesmo meio de pagamento — só o valor muda).
 *
 * SEMPRE confirma antes de lançar. Espelha o padrão de `oferta-criar-conta-pj.ts`
 * (Map<userId> com TTL + resolver determinístico antes do LLM). Vale PF e PJ.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { storage } from "../storage";
import { interpretarConfirmacao } from "./confirmacao-usuario";
import { montarReciboDeEscrita } from "./recibo-agente";
import { extrairValorBR, hojeSP } from "./nlp-br";
import { criarPendencias } from "./ia-pendencias";

/** Valor em reais a partir de texto BR (ex.: "1.234,56", "128,3", "50"). */
function parseValorBR(texto: string): number | null {
  // Fase 1: "1.500" = 1500, "1,5k", "dia 5 ... 1500" → valor monetário, não o 1º número.
  return extrairValorBR(texto);
}

function money(v: number): string {
  return Number(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Detecta o atalho "repetir última despesa": gatilho no INÍCIO + valor, e SEM
 * descrição extra (senão é um lançamento novo, ex.: "adiciona gasolina 50").
 */
export function detectarComandoRepetir(texto: string): { valor: number } | null {
  const raw = String(texto || "").trim();
  if (!raw || raw.length > 40) return null;
  const n = raw.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  const m = n.match(/^\s*(adicionar|adiciona|mais|outra de|outro|outra)\b(.*)$/);
  if (!m) return null;
  const resto = m[2] || "";
  const valor = parseValorBR(resto);
  if (valor == null) return null;
  const semValor = resto
    .replace(/(?:r\$\s*)?\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|(?:r\$\s*)?\d+(?:[.,]\d{1,2})?/i, " ")
    .replace(/\b(reais?|de|no|na|em)\b/g, " ")
    .replace(/[^a-z]/g, "");
  if (semValor.length >= 3) return null; // sobrou descrição → lançamento novo, não atalho
  return { valor };
}

type PendenteRepetir = {
  userId: number;
  modoPj: boolean;
  walletId: number | null;
  empresaId: number | null;
  empresaNome: string | null;
  novoValor: number;
  // Snapshot da última despesa (para lançar no "sim" sem re-consultar).
  descricao: string;
  categoria_id: number;
  forma_pagamento_id: number | null; // PF
  cartao_id: number | null; // PJ
  conta_bancaria_id: number | null; // PJ
  metodoLabel: string;
  contaLabel: string;
  expiresAt: number;
};

const TTL_MS = 30 * 60 * 1000;
// Persistido no banco (sobrevive a restart/deploy e funciona com várias réplicas).
const pendentes = criarPendencias<PendenteRepetir>("repetir_despesa");

function obterPendente(userId: number): PendenteRepetir | null {
  const p = pendentes.get(userId);
  if (!p) return null;
  if (Date.now() > p.expiresAt) {
    pendentes.delete(userId);
    return null;
  }
  return p;
}

export function limparPendenteRepetir(userId: number): void {
  pendentes.delete(userId);
}

async function ultimaDespesaPf(walletId: number): Promise<any | null> {
  const r = await db.execute(sql`
    SELECT t.id, t.descricao, t.categoria_id, t.forma_pagamento_id, t.conta_bancaria_id,
           COALESCE(t.metodo_pagamento, '') AS metodo_pagamento,
           COALESCE(cat.nome, 'Outros') AS conta_nome
    FROM transacoes t
    LEFT JOIN categorias cat ON cat.id = t.categoria_id
    WHERE t.carteira_id = ${walletId} AND t.tipo = 'Despesa'
    ORDER BY t.data_transacao DESC, t.id DESC
    LIMIT 1
  `);
  return (r as any[])[0] || null;
}

async function ultimaDespesaPj(empresaId: number): Promise<any | null> {
  const r = await db.execute(sql`
    SELECT t.id, t.descricao, t.categoria_id, t.cartao_id, t.conta_bancaria_id,
           COALESCE(t.metodo_pagamento, '') AS metodo_pagamento,
           COALESCE(c.codigo || ' — ' || c.nome, 'Outras') AS conta_nome
    FROM empresas_transacoes t
    LEFT JOIN empresas_contas c ON c.id = t.categoria_id
    WHERE t.empresa_id = ${empresaId} AND t.tipo = 'Despesa'
    ORDER BY t.data_transacao DESC, t.id DESC
    LIMIT 1
  `);
  return (r as any[])[0] || null;
}

/**
 * Busca a última despesa, registra a pendência e devolve a pergunta de confirmação.
 * Se não houver despesa anterior, devolve uma orientação curta.
 */
export async function prepararRepetir(ctx: {
  userId: number;
  modoPj: boolean;
  walletId: number | null;
  empresaId: number | null;
  empresaNome: string | null;
}, valor: number): Promise<string> {
  const ultima = ctx.modoPj
    ? (ctx.empresaId ? await ultimaDespesaPj(ctx.empresaId) : null)
    : (ctx.walletId ? await ultimaDespesaPf(ctx.walletId) : null);

  if (!ultima) {
    return "Não encontrei uma despesa recente para repetir. Me diga a descrição e o valor que eu lanço.";
  }

  const metodoLabel = String(ultima.metodo_pagamento || "").trim() || "Caixinha";
  const contaLabel = String(ultima.conta_nome || "").trim() || "Outras";

  pendentes.set(ctx.userId, {
    userId: ctx.userId,
    modoPj: ctx.modoPj,
    walletId: ctx.walletId,
    empresaId: ctx.empresaId,
    empresaNome: ctx.empresaNome,
    novoValor: valor,
    descricao: String(ultima.descricao || "Despesa"),
    categoria_id: Number(ultima.categoria_id),
    forma_pagamento_id: ultima.forma_pagamento_id != null ? Number(ultima.forma_pagamento_id) : null,
    cartao_id: ultima.cartao_id != null ? Number(ultima.cartao_id) : null,
    conta_bancaria_id: ultima.conta_bancaria_id != null ? Number(ultima.conta_bancaria_id) : null,
    metodoLabel,
    contaLabel,
    expiresAt: Date.now() + TTL_MS,
  });

  return (
    `Adicionar *R$ ${money(valor)}* igual à última despesa ` +
    `(*${ultima.descricao} · ${metodoLabel} · ${contaLabel}*)?\n\n` +
    `Responda *sim* para lançar.`
  );
}

async function executarRepetir(p: PendenteRepetir): Promise<string> {
  const today = hojeSP();

  if (p.modoPj && p.empresaId) {
    const { aplicarMeioPagamentoPj } = await import("./meio-pagamento-pj");
    const meio = await aplicarMeioPagamentoPj({
      userId: p.userId,
      empresaId: p.empresaId,
      tipo: "Despesa",
      dataISO: today,
      cartao_id: p.cartao_id,
      conta_bancaria_id: p.conta_bancaria_id,
      exigirMeio: true,
      statusAtual: "Efetivada",
    });
    const criada = await storage.createEmpresaTransacao({
      empresa_id: p.empresaId,
      categoria_id: p.categoria_id,
      descricao: p.descricao,
      valor: p.novoValor,
      tipo: "Despesa",
      data_transacao: today,
      status: "Efetivada",
      origem: "whatsapp",
      cartao_id: meio.cartao_id,
      conta_bancaria_id: meio.conta_bancaria_id,
      fatura_id: meio.fatura_id,
      competencia: meio.competencia,
      movimenta_caixa: meio.movimenta_caixa,
      empresa_forma_pagamento_id: null,
      metodo_pagamento: meio.metodo_pagamento || p.metodoLabel,
    } as any);
    return montarReciboDeEscrita({
      tool: "lancar_empresa",
      raw: "",
      parsed: {
        id: criada.id,
        tipo: "Despesa",
        descricao: p.descricao,
        valor: p.novoValor,
        data: today,
        conta: p.contaLabel,
        pago_com: meio.metodo_pagamento || p.metodoLabel,
        empresa: p.empresaNome || undefined,
      },
    });
  }

  // PF
  const walletId = p.walletId!;
  const { aplicarMeioPagamentoPf } = await import("./meio-pagamento-pf");
  const meio = await aplicarMeioPagamentoPf({
    userId: p.userId,
    walletId,
    tipo: "Despesa",
    dataISO: today,
    forma_pagamento_id: p.forma_pagamento_id ?? null,
    statusAtual: "Efetivada",
  });
  const criada = await storage.createTransaction({
    carteira_id: walletId,
    categoria_id: p.categoria_id,
    descricao: p.descricao,
    valor: p.novoValor,
    tipo: "Despesa",
    data_transacao: today,
    status: meio.status || "Efetivada",
    forma_pagamento_id: meio.forma_pagamento_id,
    conta_bancaria_id: meio.conta_bancaria_id,
    fatura_id: meio.fatura_id,
    competencia: meio.competencia,
    movimenta_caixa: meio.movimenta_caixa,
    metodo_pagamento: p.metodoLabel,
  } as any);
  return montarReciboDeEscrita({
    tool: "insere_transacao",
    raw: "",
    parsed: {
      id: criada.id,
      tipo: "Despesa",
      descricao: p.descricao,
      valor: p.novoValor,
      data: today,
      categoria: p.contaLabel,
      pago_com: p.metodoLabel,
    },
  });
}

/**
 * Resolve a confirmação da oferta pendente sem passar pelo LLM.
 * "sim" → lança o clone; "não" → cancela; ambíguo → limpa e deixa o fluxo seguir.
 */
export async function tentarResolverRepetir(
  userId: number,
  userMessage: string,
): Promise<{ handled: true; reply: string } | { handled: false }> {
  const p = obterPendente(userId);
  if (!p) return { handled: false };

  const conf = interpretarConfirmacao(userMessage);
  const curta = (userMessage || "").trim().length <= 60;

  if (conf === "sim" && curta) {
    limparPendenteRepetir(userId);
    try {
      const reply = await executarRepetir(p);
      return { handled: true, reply };
    } catch (e: any) {
      return {
        handled: true,
        reply: `Não consegui repetir a despesa: ${e?.message || e}. Pode lançar informando descrição, valor e meio.`,
      };
    }
  }

  if (conf === "nao" && curta) {
    limparPendenteRepetir(userId);
    return { handled: true, reply: "👍 Beleza, não adicionei. Quando quiser, é só mandar de novo." };
  }

  // Ambíguo / mensagem nova: não trava — descarta a pendência e deixa o fluxo normal seguir.
  limparPendenteRepetir(userId);
  return { handled: false };
}
