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
    return res.json(await contas.listarContasComSaldoPf(req.user!.id));
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Erro ao listar contas" });
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
    return res.json(await faturaPf.listarCartoesComSaldoPf(req.user!.id));
  } catch (e: any) {
    return res.status(500).json({ error: e?.message || "Erro ao listar cartões" });
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
