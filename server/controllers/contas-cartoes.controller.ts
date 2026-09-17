import { Request, Response } from "express";
import * as faturaPf from "../services/fatura-pf.service";
import * as contas from "../services/conta-bancaria.service";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { storage } from "../storage";

/**
 * Contas, cartões e faturas do PF.
 */

// ── Contas bancárias ──────────────────────────────────────────────

export async function listarContas(req: Request, res: Response) {
  try {
    const de = (req.query.de as string) || undefined;
    const ate = (req.query.ate as string) || undefined;
    return res.json(await contas.listarContasComSaldoPf(req.user!.id, de, ate));
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Erro ao listar contas" });
  }
}

export async function lancamentosConta(req: Request, res: Response) {
  try {
    const contaId = Number(req.params.id);
    const de = (req.query.de as string) || undefined;
    const ate = (req.query.ate as string) || undefined;
    const lista = await contas.listarLancamentosContaPf(req.user!.id, contaId, de, ate);
    const mov = await contas.movimentoContaPeriodo(contaId, de, ate);
    return res.json({
      conta_id: contaId,
      periodo: { de: de || null, ate: ate || null },
      saldo: mov.movimento,
      entradas: mov.entradas,
      saidas: mov.saidas,
      lancamentos: lista,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Erro ao listar lançamentos" });
  }
}

export async function criarConta(req: Request, res: Response) {
  try {
    const conta = await contas.criarContaPf(req.user!.id, req.body || {});
    return res.status(201).json(conta);
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Erro ao criar conta" });
  }
}

export async function atualizarConta(req: Request, res: Response) {
  try {
    const conta = await contas.atualizarContaPf(req.user!.id, Number(req.params.id), req.body || {});
    if (!conta) return res.status(404).json({ error: "Conta não encontrada" });
    return res.json(conta);
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Erro ao atualizar conta" });
  }
}

export async function excluirConta(req: Request, res: Response) {
  try {
    const r = await contas.excluirContaPf(req.user!.id, Number(req.params.id));
    if (!r.ok) return res.status(404).json({ error: r.error || "Conta não encontrada" });
    return res.json({ success: true });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Erro ao excluir conta" });
  }
}

// ── Cartões (formas_pagamento com limite) ─────────────────────────

export async function listarCartoes(req: Request, res: Response) {
  try {
    const de = (req.query.de as string) || undefined;
    const ate = (req.query.ate as string) || undefined;
    return res.json(await faturaPf.listarCartoesComSaldoPf(req.user!.id, de, ate));
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Erro ao listar cartões" });
  }
}

export async function lancamentosCartao(req: Request, res: Response) {
  try {
    const cartaoId = Number(req.params.id);
    const cartao = await faturaPf.cartaoPfDoUsuario(cartaoId, req.user!.id);
    if (!cartao || Number(cartao.usuario_id) !== req.user!.id) {
      return res.status(404).json({ error: "Cartão não encontrado" });
    }
    const de = (req.query.de as string) || undefined;
    const ate = (req.query.ate as string) || undefined;
    const lista = await faturaPf.listarLancamentosCartaoPf(req.user!.id, cartaoId, de, ate);
    const mov = await faturaPf.movimentoCartaoPeriodo(cartaoId, de, ate);
    return res.json({
      cartao_id: cartaoId,
      cartao_nome: cartao.nome,
      periodo: { de: de || null, ate: ate || null },
      saldo: mov.usado,
      usado: mov.usado,
      lancamentos: lista,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Erro ao listar lançamentos" });
  }
}

export async function criarCartao(req: Request, res: Response) {
  try {
    const b = req.body || {};
    const nome = String(b.nome || "").trim();
    const diaFech = Number(b.dia_fechamento);
    const diaVenc = Number(b.dia_vencimento);
    if (!nome) return res.status(400).json({ error: "Nome é obrigatório" });
    if (!(diaFech >= 1 && diaFech <= 31)) return res.status(400).json({ error: "Dia de fechamento deve ser 1–31" });
    if (!(diaVenc >= 1 && diaVenc <= 31)) return res.status(400).json({ error: "Dia de vencimento deve ser 1–31" });

    const limite = b.limite != null && b.limite !== "" ? Number(b.limite) : null;
    const r = await db.execute(sql`
      INSERT INTO formas_pagamento
        (usuario_id, nome, global, ativo, limite, dia_fechamento, dia_vencimento, bandeira, cor)
      VALUES
        (${req.user!.id}, ${nome}, false, true,
         ${limite != null && Number.isFinite(limite) ? limite.toFixed(2) : null},
         ${diaFech}, ${diaVenc},
         ${b.banco || b.bandeira || null},
         ${b.cor || null})
      RETURNING *
    `);
    return res.status(201).json((r as any[])[0]);
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Erro ao criar cartão" });
  }
}

export async function atualizarCartao(req: Request, res: Response) {
  try {
    const cartaoId = Number(req.params.id);
    const cartao = await faturaPf.cartaoPfDoUsuario(cartaoId, req.user!.id);
    if (!cartao || cartao.usuario_id !== req.user!.id) {
      return res.status(404).json({ error: "Cartão não encontrado" });
    }
    const b = req.body || {};
    const nome = b.nome != null ? String(b.nome).trim() : cartao.nome;
    const diaFech = b.dia_fechamento != null ? Number(b.dia_fechamento) : cartao.dia_fechamento;
    const diaVenc = b.dia_vencimento != null ? Number(b.dia_vencimento) : cartao.dia_vencimento;
    if (!(diaFech >= 1 && diaFech <= 31) || !(diaVenc >= 1 && diaVenc <= 31)) {
      return res.status(400).json({ error: "Dias de fechamento/vencimento devem ser 1–31" });
    }
    const limite = b.limite !== undefined
      ? (b.limite === null || b.limite === "" ? null : Number(b.limite).toFixed(2))
      : cartao.limite;
    const r = await db.execute(sql`
      UPDATE formas_pagamento
      SET nome = ${nome},
          dia_fechamento = ${diaFech},
          dia_vencimento = ${diaVenc},
          limite = ${limite},
          bandeira = ${b.banco !== undefined || b.bandeira !== undefined ? (b.banco || b.bandeira) : cartao.bandeira},
          cor = ${b.cor !== undefined ? b.cor : cartao.cor},
          ativo = ${b.ativo != null ? !!b.ativo : cartao.ativo}
      WHERE id = ${cartaoId} AND usuario_id = ${req.user!.id}
      RETURNING *
    `);
    return res.json((r as any[])[0]);
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Erro ao atualizar cartão" });
  }
}

export async function excluirCartao(req: Request, res: Response) {
  try {
    const cartaoId = Number(req.params.id);
    const cartao = await faturaPf.cartaoPfDoUsuario(cartaoId, req.user!.id);
    if (!cartao || cartao.usuario_id !== req.user!.id) {
      return res.status(404).json({ error: "Cartão não encontrado" });
    }
    await db.execute(sql`
      UPDATE formas_pagamento SET ativo = false
      WHERE id = ${cartaoId} AND usuario_id = ${req.user!.id}
    `);
    return res.json({ success: true });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Erro ao excluir cartão" });
  }
}

export async function listarFaturas(req: Request, res: Response) {
  try {
    const cartaoId = Number(req.params.id);
    const cartao = await faturaPf.cartaoPfDoUsuario(cartaoId, req.user!.id);
    if (!cartao) return res.status(404).json({ error: "Cartão não encontrado" });
    return res.json({ cartao, faturas: await faturaPf.listarFaturasPf(cartaoId) });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Erro ao listar faturas" });
  }
}

export async function saldoCartao(req: Request, res: Response) {
  try {
    const cartaoId = Number(req.params.id);
    const cartao = await faturaPf.cartaoPfDoUsuario(cartaoId, req.user!.id);
    if (!cartao) return res.status(404).json({ error: "Cartão não encontrado" });
    return res.json(await faturaPf.getSaldoCartaoPf(cartaoId));
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Erro ao calcular saldo" });
  }
}

export async function detalheFatura(req: Request, res: Response) {
  try {
    const faturaId = Number(req.params.id);
    const fatura = await faturaPf.getFaturaPfById(faturaId);
    if (!fatura || fatura.usuario_id !== req.user!.id) {
      return res.status(404).json({ error: "Fatura não encontrada" });
    }
    return res.json(await faturaPf.detalheFaturaPf(faturaId));
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Erro ao obter fatura" });
  }
}

export async function pagarFatura(req: Request, res: Response) {
  try {
    const faturaId = Number(req.params.id);
    const fatura = await faturaPf.getFaturaPfById(faturaId);
    if (!fatura || fatura.usuario_id !== req.user!.id) {
      return res.status(404).json({ error: "Fatura não encontrada" });
    }
    if (fatura.status === "paga") return res.status(400).json({ error: "Fatura já está paga" });
    const contaId = Number(req.body?.conta_bancaria_id);
    if (!contaId) return res.status(400).json({ error: "Escolha a conta de onde sai o pagamento." });

    const contasUser = await contas.listarContasPf(req.user!.id);
    if (!contasUser.find((c) => c.id === contaId)) {
      return res.status(400).json({ error: "Conta não encontrada" });
    }

    const cartao = await faturaPf.cartaoPfDoUsuario(fatura.forma_pagamento_id, req.user!.id);
    if (!cartao) return res.status(404).json({ error: "Cartão da fatura não encontrado" });

    const r = await faturaPf.pagarFaturaPf(fatura, cartao, {
      conta_bancaria_id: contaId,
      data_pagamento: req.body?.data_pagamento,
      categoria_id: req.body?.categoria_id ? Number(req.body.categoria_id) : undefined,
      usuario_id: req.user!.id,
    });
    return res.json(r);
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Erro ao pagar fatura" });
  }
}

export async function reabrirFatura(req: Request, res: Response) {
  try {
    const faturaId = Number(req.params.id);
    const fatura = await faturaPf.getFaturaPfById(faturaId);
    if (!fatura || fatura.usuario_id !== req.user!.id) {
      return res.status(404).json({ error: "Fatura não encontrada" });
    }
    const r = await faturaPf.reabrirFaturaPf(fatura);
    return res.json(r);
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Erro ao reabrir fatura" });
  }
}

/** Faturas em aberto no período (para tela Vencimentos). */
export async function listarVencimentos(req: Request, res: Response) {
  try {
    const userId = req.user!.id;
    const de = (req.query.de as string) || undefined;
    const ate = (req.query.ate as string) || undefined;
    const status = (req.query.status as string) || "aberta"; // aberta | paga | todas

    let statusFilter = sql`f.status IN ('aberta', 'fechada')`;
    if (status === "paga") statusFilter = sql`f.status = 'paga'`;
    else if (status === "todas") statusFilter = sql`true`;

    const faturas = await db.execute(sql`
      SELECT f.*, fp.nome AS cartao_nome, fp.cor AS cartao_cor,
             COALESCE((
               SELECT SUM(t.valor::numeric) FROM transacoes t
               WHERE t.fatura_id = f.id AND COALESCE(t.movimenta_caixa, false) = false
             ), 0) AS total
      FROM faturas f
      JOIN formas_pagamento fp ON fp.id = f.forma_pagamento_id
      WHERE f.usuario_id = ${userId}
        AND ${statusFilter}
        ${de ? sql`AND f.data_vencimento >= ${de}` : sql``}
        ${ate ? sql`AND f.data_vencimento <= ${ate}` : sql``}
      ORDER BY f.data_vencimento ASC
    `);

    const wallet = await storage.getWalletByUserId(userId);
    let boletos: any[] = [];
    if (wallet) {
      const st = status === "paga" ? "Efetivada" : "Pendente";
      const rows = await db.execute(sql`
        SELECT t.id, t.descricao, t.valor, t.data_vencimento, t.data_transacao, t.status, t.tipo,
               t.fatura_id, t.movimenta_caixa, fp.nome AS forma_pagamento, c.nome AS categoria
        FROM transacoes t
        LEFT JOIN formas_pagamento fp ON fp.id = t.forma_pagamento_id
        LEFT JOIN categorias c ON c.id = t.categoria_id
        WHERE t.carteira_id = ${wallet.id}
          AND t.status = ${st}
          AND t.tipo = 'Despesa'
          AND COALESCE(t.reembolsavel, false) = false
          AND t.fatura_id IS NULL
          AND COALESCE(t.movimenta_caixa, true) = true
          AND (t.data_vencimento IS NOT NULL OR t.data_transacao IS NOT NULL)
          ${de ? sql`AND COALESCE(t.data_vencimento, t.data_transacao) >= ${de}` : sql``}
          ${ate ? sql`AND COALESCE(t.data_vencimento, t.data_transacao) <= ${ate}` : sql``}
        ORDER BY COALESCE(t.data_vencimento, t.data_transacao) ASC
      `);
      boletos = rows as any[];
    }

    return res.json({ faturas, boletos });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Erro ao listar vencimentos" });
  }
}

/**
 * Resumo de faturas do PF — compacto e pronto para a IA (WhatsApp) responder
 * "qual o saldo/valor da minha fatura". Autenticável por apikey (MasterToken).
 * GET /api/cartoes/resumo
 */
export async function resumoFaturas(req: Request, res: Response) {
  try {
    const userId = req.user!.id;
    const cartoes = await faturaPf.listarCartoesPf(userId);
    let totalGeral = 0;
    const out = [];
    for (const c of cartoes as any[]) {
      const saldo = await faturaPf.getSaldoCartaoPf(c.id);
      const faturas = await faturaPf.listarFaturasPf(c.id);
      const abertas = (faturas as any[])
        .filter((f) => f.status !== "paga")
        .map((f) => ({
          competencia: f.competencia,
          total: Math.round((Number(f.total) || 0) * 100) / 100,
          vencimento: f.data_vencimento,
          status: f.status,
        }))
        .sort((a, b) => String(a.competencia).localeCompare(String(b.competencia)));
      const totalAberto = abertas.reduce((s, f) => s + f.total, 0);
      totalGeral += totalAberto;
      const limiteDisponivel = saldo.sem_limite
        ? null
        : Math.round(((Number(saldo.limite) || 0) - totalAberto) * 100) / 100;
      out.push({
        cartao: c.nome,
        limite: saldo.limite,
        sem_limite: saldo.sem_limite,
        total_em_aberto: Math.round(totalAberto * 100) / 100,
        limite_disponivel: limiteDisponivel,
        proxima_fatura: abertas[0] || null,
        faturas_abertas: abertas,
      });
    }
    return res.json({
      cartoes: out,
      total_geral_em_aberto: Math.round(totalGeral * 100) / 100,
    });
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Erro ao gerar resumo de faturas" });
  }
}

/**
 * Move um lançamento de cartão para outro CARTÃO e/ou COMPETÊNCIA (YYYY-MM).
 * A fatura de destino é resolvida pelas DATAS do cartão (fechamento/vencimento),
 * então o vencimento sai correto. Também anexa um lançamento "sem fatura" a uma
 * competência escolhida. Ferramenta de correção/realocação manual.
 * POST /api/faturas/mover-lancamento  { transacao_id, cartao_id, competencia }
 */
export async function moverLancamentoFatura(req: Request, res: Response) {
  try {
    const userId = req.user!.id;
    const txId = Number(req.body?.transacao_id);
    const cartaoId = Number(req.body?.cartao_id);
    const competencia = String(req.body?.competencia || "").slice(0, 7);
    if (!txId || !cartaoId || !/^\d{4}-\d{2}$/.test(competencia)) {
      return res.status(400).json({ error: "Informe transacao_id, cartao_id e competencia (YYYY-MM)." });
    }
    const cartao = await faturaPf.cartaoPfDoUsuario(cartaoId, userId);
    if (!cartao || Number(cartao.usuario_id) !== userId) {
      return res.status(404).json({ error: "Cartão não encontrado" });
    }
    const wallet = await storage.getWalletByUserId(userId);
    if (!wallet) return res.status(404).json({ error: "Carteira não encontrada" });
    const txRows = await db.execute(sql`
      SELECT id, tipo FROM transacoes WHERE id = ${txId} AND carteira_id = ${wallet.id} LIMIT 1
    `);
    const tx = (txRows as any[])[0];
    if (!tx) return res.status(404).json({ error: "Lançamento não encontrado" });
    if (tx.tipo !== "Despesa") {
      return res.status(400).json({ error: "Só despesas de cartão podem ser movidas para fatura." });
    }
    const { fatura, competencia: comp } = await faturaPf.resolverFaturaPfPorCompetencia(
      userId, wallet.id, cartao as any, competencia,
    );
    await db.execute(sql`
      UPDATE transacoes
      SET forma_pagamento_id = ${cartaoId},
          fatura_id = ${fatura.id},
          competencia = ${comp},
          conta_bancaria_id = NULL,
          movimenta_caixa = false
      WHERE id = ${txId} AND carteira_id = ${wallet.id}
    `);
    return res.json({ success: true, fatura_id: fatura.id, competencia: comp, vencimento: fatura.data_vencimento });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Erro ao mover lançamento" });
  }
}

/**
 * Recalcula todas as faturas de um cartão pelas datas atuais do cartão.
 * POST /api/cartoes/:id/recalcular-faturas
 */
export async function recalcularFaturasCartao(req: Request, res: Response) {
  try {
    const userId = req.user!.id;
    const cartaoId = Number(req.params.id);
    const cartao = await faturaPf.cartaoPfDoUsuario(cartaoId, userId);
    if (!cartao || Number(cartao.usuario_id) !== userId) {
      return res.status(404).json({ error: "Cartão não encontrado" });
    }
    if (cartao.dia_fechamento == null || cartao.dia_vencimento == null) {
      return res.status(400).json({ error: "Defina o dia de fechamento e de vencimento do cartão antes de recalcular." });
    }
    const wallet = await storage.getWalletByUserId(userId);
    if (!wallet) return res.status(404).json({ error: "Carteira não encontrada" });
    const r = await faturaPf.recalcularFaturasCartaoPf(userId, wallet.id, cartao as any);
    return res.json({ success: true, ...r });
  } catch (e: any) {
    return res.status(400).json({ error: e?.message || "Erro ao recalcular faturas" });
  }
}
