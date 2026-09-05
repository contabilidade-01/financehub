import { Request, Response } from "express";
import { storage } from "../storage";
import { softDeleteEmpresaTransacao } from "../storage";
import { insertEmpresaTransacaoSchema } from "../../shared/schema";
import { atualizarTransacaoEmpresa, baixarTransacaoEmpresa } from "../services/empresa-transacao.service";
import { aplicarMeioPagamentoPj } from "../services/meio-pagamento-pj";
import * as formas from "../services/empresa-forma.service";

/**
 * Controller: empresaTransacao
 * CRUD de transações PJ + dashboard (resumo + DRE).
 * Endpoint N8N para PJ: POST /api/empresas/:id/transacoes (mesma apikey do usuário).
 */

// Helper: valida empresa e pertença ao usuário
const resolveEmpresa = async (empresaId: number, userId: number, res: Response) => {
  const empresa = await storage.getEmpresaById(empresaId);
  if (!empresa) { res.status(404).json({ error: "Empresa não encontrada." }); return null; }
  if (empresa.usuario_id !== userId) { res.status(403).json({ error: "Acesso negado." }); return null; }
  return empresa;
};

// Helper: parseia datas de query string com default = mês corrente
const parsePeriodo = (de?: string, ate?: string) => {
  const now = new Date();
  const deDate = de ?? new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const ateDate = ate ?? new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);
  return { de: deDate, ate: ateDate };
};

// POST /api/empresas/:id/transacoes
// Endpoint equivalente ao POST /api/transactions para PF.
// N8N usa este endpoint com o mesmo payload (campo categoria_id aponta para empresas_contas).
export const createEmpresaTransacao = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const empresaId = parseInt(req.params.id);
    if (isNaN(empresaId)) return res.status(400).json({ error: "ID inválido." });

    const empresa = await resolveEmpresa(empresaId, userId, res);
    if (!empresa) return;

    const parsed = insertEmpresaTransacaoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos", details: parsed.error.errors });
    }

    // Validar que a categoria_id pertence a esta empresa
    const conta = await storage.getEmpresaContaById(parsed.data.categoria_id as number);
    if (!conta) return res.status(400).json({ error: "Categoria não encontrada." });
    if (conta.empresa_id !== empresaId) {
      return res.status(400).json({ error: "Categoria não pertence a esta empresa." });
    }

    // Validar que o tipo da transação bate com o tipo da conta
    const tipoNorm = (parsed.data.tipo as string).charAt(0).toUpperCase() + (parsed.data.tipo as string).slice(1).toLowerCase();
    if (tipoNorm !== conta.tipo) {
      return res.status(400).json({
        error: `Tipo '${tipoNorm}' incompatível com o tipo da conta '${conta.tipo}'.`
      });
    }

    const dataISO = String(parsed.data.data_transacao).slice(0, 10);
    const cartaoIdBody =
      req.body?.cartao_id != null
        ? Number(req.body.cartao_id)
        : (parsed.data.cartao_id != null ? Number(parsed.data.cartao_id) : null);
    const contaBancariaBody =
      req.body?.conta_bancaria_id != null
        ? Number(req.body.conta_bancaria_id)
        : (parsed.data.conta_bancaria_id != null ? Number(parsed.data.conta_bancaria_id) : null);

    let meio;
    try {
      meio = await aplicarMeioPagamentoPj({
        userId,
        empresaId,
        tipo: tipoNorm,
        dataISO,
        cartao_id: cartaoIdBody,
        conta_bancaria_id: contaBancariaBody,
        exigirMeio: true,
        statusAtual: parsed.data.status,
      });
    } catch (meioErr: any) {
      return res.status(400).json({ error: meioErr?.message || "Meio de pagamento inválido." });
    }

    const parcelasN = Math.min(60, Math.max(1, Number(req.body?.parcelas) || 1));
    if (parcelasN > 1 && tipoNorm === "Despesa") {
      const { criarCompraParceladaPj } = await import("../storage");
      // Aceita valor total OU valor da parcela (ex.: 5x de 35 → valor_parcela=35).
      const valorInformado = Number(parsed.data.valor) || 0;
      const valorParcelaBody =
        req.body?.valor_parcela != null && req.body.valor_parcela !== ""
          ? Number(req.body.valor_parcela)
          : null;
      const modo = String(req.body?.valor_modo || "").toLowerCase();
      let valorTotal = valorInformado;
      if (
        (modo === "parcela" || (valorParcelaBody != null && Number.isFinite(valorParcelaBody) && valorParcelaBody > 0))
      ) {
        const vp =
          valorParcelaBody != null && valorParcelaBody > 0 ? valorParcelaBody : valorInformado;
        valorTotal = Math.round(vp * parcelasN * 100) / 100;
      } else if (req.body?.valor_total != null && Number(req.body.valor_total) > 0) {
        valorTotal = Number(req.body.valor_total);
      }
      if (!(valorTotal > 0)) {
        return res.status(400).json({ error: "Informe o valor total ou o valor da parcela." });
      }
      if (!meio.cartao_id) {
        return res.status(400).json({
          error: "Parcelamento em várias competências é para cartão de crédito. Escolha o cartão.",
        });
      }
      try {
        const result = await criarCompraParceladaPj({
          empresaId,
          userId,
          categoriaId: parsed.data.categoria_id as number,
          descricao: parsed.data.descricao,
          valorTotal,
          parcelas: parcelasN,
          dataInicio: dataISO,
          cartaoId: meio.cartao_id,
          contaBancariaId: null,
          status: "Efetivada",
          origem: (req.body.origem as string) ?? "manual",
          dataVencimentoBase: parsed.data.data_vencimento
            ? String(parsed.data.data_vencimento).slice(0, 10)
            : null,
          competenciaInicial: typeof req.body?.competencia_inicial === "string"
            ? req.body.competencia_inicial
            : null,
        });
        const first = await storage.getEmpresaTransacaoById(result.ids[0]);
        return res.status(201).json({
          ...first,
          compra_grupo: result.compra_grupo,
          parcelas_criadas: result.ids.length,
          valor_parcela: result.valor_parcela,
          valor_total: valorTotal,
        });
      } catch (parcErr: any) {
        return res.status(400).json({ error: parcErr?.message || "Erro ao parcelar." });
      }
    }

    const transacao = await storage.createEmpresaTransacao({
      ...parsed.data,
      empresa_id: empresaId,
      tipo: tipoNorm,
      cartao_id: meio.cartao_id,
      conta_bancaria_id: meio.conta_bancaria_id,
      fatura_id: meio.fatura_id,
      competencia: meio.competencia,
      movimenta_caixa: meio.movimenta_caixa,
      empresa_forma_pagamento_id: meio.empresa_forma_pagamento_id,
      metodo_pagamento: meio.metodo_pagamento ?? parsed.data.metodo_pagamento ?? null,
      origem: (req.body.origem as string) ?? "manual",
    } as any);

    return res.status(201).json(transacao);
  } catch (err) {
    console.error("createEmpresaTransacao:", err);
    return res.status(500).json({ error: "Erro interno ao criar transação." });
  }
};

// GET /api/empresas/:id/transacoes
export const listEmpresaTransacoes = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const empresaId = parseInt(req.params.id);
    if (isNaN(empresaId)) return res.status(400).json({ error: "ID inválido." });

    const empresa = await resolveEmpresa(empresaId, userId, res);
    if (!empresa) return;

    const todos = req.query.todos === "1" || req.query.todos === "true";
    const { de, ate } = parsePeriodo(
      req.query.de as string | undefined,
      req.query.ate as string | undefined
    );
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

    const transacoes = await storage.getEmpresaTransacoesByEmpresaId(
      empresaId,
      todos ? { limit } : { de, ate, limit },
    );
    return res.json(transacoes);
  } catch (err) {
    console.error("listEmpresaTransacoes:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
};

// GET /api/empresas/:id/transacoes/:transacaoId
export const getEmpresaTransacao = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const empresaId = parseInt(req.params.id);
    const transacaoId = parseInt(req.params.transacaoId);
    if (isNaN(empresaId) || isNaN(transacaoId)) return res.status(400).json({ error: "ID inválido." });

    const empresa = await resolveEmpresa(empresaId, userId, res);
    if (!empresa) return;

    const transacao = await storage.getEmpresaTransacaoById(transacaoId);
    if (!transacao) return res.status(404).json({ error: "Transação não encontrada." });
    if (transacao.empresa_id !== empresaId) return res.status(403).json({ error: "Transação não pertence a esta empresa." });

    return res.json(transacao);
  } catch (err) {
    console.error("getEmpresaTransacao:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
};

// PUT /api/empresas/:id/transacoes/:transacaoId
export const updateEmpresaTransacao = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const empresaId = parseInt(req.params.id);
    const transacaoId = parseInt(req.params.transacaoId);
    if (isNaN(empresaId) || isNaN(transacaoId)) return res.status(400).json({ error: "ID inválido." });

    // Posse e validações ficam no serviço, compartilhado com a tool do agente.
    const resultado = await atualizarTransacaoEmpresa(empresaId, transacaoId, userId, req.body);
    if (!resultado.ok) {
      return res.status(resultado.status).json({ error: resultado.error, details: resultado.details });
    }

    return res.json(resultado.transacao);
  } catch (err) {
    console.error("updateEmpresaTransacao:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
};

// DELETE /api/empresas/:id/transacoes/:transacaoId
export const deleteEmpresaTransacao = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const empresaId = parseInt(req.params.id);
    const transacaoId = parseInt(req.params.transacaoId);
    if (isNaN(empresaId) || isNaN(transacaoId)) return res.status(400).json({ error: "ID inválido." });

    const empresa = await resolveEmpresa(empresaId, userId, res);
    if (!empresa) return;

    const transacao = await storage.getEmpresaTransacaoById(transacaoId);
    if (!transacao) return res.status(404).json({ error: "Transação não encontrada." });
    if (transacao.empresa_id !== empresaId) return res.status(403).json({ error: "Transação não pertence a esta empresa." });

    // Soft-delete: move para lixeira
    const deletado = await softDeleteEmpresaTransacao(transacaoId, empresaId, userId);
    if (!deletado) return res.status(500).json({ error: "Erro ao deletar transação." });

    return res.status(204).send();
  } catch (err) {
    console.error("deleteEmpresaTransacao:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
};

// PUT /api/empresas/:id/transacoes/:transacaoId/pagar
export const pagarEmpresaTransacao = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const empresaId = parseInt(req.params.id);
    const transacaoId = parseInt(req.params.transacaoId);
    if (isNaN(empresaId) || isNaN(transacaoId)) return res.status(400).json({ error: "ID inválido." });

    const resultado = await baixarTransacaoEmpresa(
      empresaId,
      transacaoId,
      userId,
      req.body?.data_pagamento,
    );
    if (!resultado.ok) {
      return res.status(resultado.status).json({ error: resultado.error });
    }
    return res.json(resultado.transacao);
  } catch (err) {
    console.error("pagarEmpresaTransacao:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
};

// ----- Formas de pagamento PJ -----

export const listEmpresaFormas = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const empresaId = parseInt(req.params.id);
    if (isNaN(empresaId)) return res.status(400).json({ error: "ID inválido." });
    const empresa = await resolveEmpresa(empresaId, userId, res);
    if (!empresa) return;
    const lista = await formas.garantirFormasPadrao(empresaId);
    return res.json(lista);
  } catch (err) {
    console.error("listEmpresaFormas:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
};

export const createEmpresaForma = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const empresaId = parseInt(req.params.id);
    if (isNaN(empresaId)) return res.status(400).json({ error: "ID inválido." });
    const empresa = await resolveEmpresa(empresaId, userId, res);
    if (!empresa) return;
    if (String(req.body?.tipo || "").toLowerCase() === "boleto") {
      return res.status(400).json({
        error: "Boleto não é meio de pagamento — informe a conta bancária de onde sai o pagamento.",
      });
    }
    const criada = await formas.criarForma(empresaId, req.body || {});
    return res.status(201).json(criada);
  } catch (err: any) {
    console.error("createEmpresaForma:", err);
    return res.status(err?.status || 500).json({ error: err?.message || "Erro interno." });
  }
};

export const updateEmpresaForma = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const empresaId = parseInt(req.params.id);
    const formaId = parseInt(req.params.formaId);
    if (isNaN(empresaId) || isNaN(formaId)) return res.status(400).json({ error: "ID inválido." });
    const empresa = await resolveEmpresa(empresaId, userId, res);
    if (!empresa) return;
    const atualizada = await formas.atualizarForma(empresaId, formaId, req.body || {});
    if (!atualizada) return res.status(404).json({ error: "Forma não encontrada." });
    return res.json(atualizada);
  } catch (err: any) {
    console.error("updateEmpresaForma:", err);
    return res.status(err?.status || 500).json({ error: err?.message || "Erro interno." });
  }
};

export const deleteEmpresaForma = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const empresaId = parseInt(req.params.id);
    const formaId = parseInt(req.params.formaId);
    if (isNaN(empresaId) || isNaN(formaId)) return res.status(400).json({ error: "ID inválido." });
    const empresa = await resolveEmpresa(empresaId, userId, res);
    if (!empresa) return;
    const ok = await formas.excluirForma(empresaId, formaId);
    if (!ok) return res.status(404).json({ error: "Forma não encontrada." });
    return res.status(204).send();
  } catch (err) {
    console.error("deleteEmpresaForma:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
};

// GET /api/empresas/:id/dashboard/resumo?de=YYYY-MM-DD&ate=YYYY-MM-DD
export const getEmpresaResumo = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const empresaId = parseInt(req.params.id);
    if (isNaN(empresaId)) return res.status(400).json({ error: "ID inválido." });

    const empresa = await resolveEmpresa(empresaId, userId, res);
    if (!empresa) return;

    const { de, ate } = parsePeriodo(
      req.query.de as string | undefined,
      req.query.ate as string | undefined
    );

    const resumo = await storage.getEmpresaResumo(empresaId, { de, ate });
    return res.json(resumo);
  } catch (err) {
    console.error("getEmpresaResumo:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
};

// GET /api/empresas/:id/relatorios/dre?de=YYYY-MM-DD&ate=YYYY-MM-DD
export const getEmpresaDRE = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const empresaId = parseInt(req.params.id);
    if (isNaN(empresaId)) return res.status(400).json({ error: "ID inválido." });

    const empresa = await resolveEmpresa(empresaId, userId, res);
    if (!empresa) return;

    const { de, ate } = parsePeriodo(
      req.query.de as string | undefined,
      req.query.ate as string | undefined
    );

    const dre = await storage.getEmpresaDRE(empresaId, { de, ate });
    return res.json(dre);
  } catch (err) {
    console.error("getEmpresaDRE:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
};

// GET /api/empresas/:id/relatorios/fluxo-caixa?ano=YYYY
export const getEmpresaFluxoCaixa = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const empresaId = parseInt(req.params.id);
    if (isNaN(empresaId)) return res.status(400).json({ error: "ID inválido." });

    const empresa = await resolveEmpresa(empresaId, userId, res);
    if (!empresa) return;

    const ano = parseInt(req.query.ano as string) || new Date().getFullYear();
    const data = await storage.getEmpresaFluxoCaixaMensal(empresaId, ano);
    return res.json(data);
  } catch (err) {
    console.error("getEmpresaFluxoCaixa:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
};

// GET /api/empresas/:id/vencimentos?status=aberta|paga&de=&ate=
// Faturas de cartão + despesas Pendentes (boleto/PIX/TED) do período.
export const listarVencimentosPj = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const empresaId = parseInt(req.params.id);
    if (isNaN(empresaId)) return res.status(400).json({ error: "ID inválido." });
    const empresa = await resolveEmpresa(empresaId, userId, res);
    if (!empresa) return;

    const { db } = await import("../db");
    const { sql } = await import("drizzle-orm");
    const de = (req.query.de as string) || undefined;
    const ate = (req.query.ate as string) || undefined;
    const status = (req.query.status as string) || "aberta";

    let statusFilter = sql`f.status IN ('aberta', 'fechada')`;
    if (status === "paga") statusFilter = sql`f.status = 'paga'`;
    else if (status === "todas") statusFilter = sql`true`;

    const faturas = await db.execute(sql`
      SELECT f.*, c.nome AS cartao_nome, c.bandeira AS cartao_cor,
             COALESCE((
               SELECT SUM(t.valor::numeric) FROM empresas_transacoes t
               WHERE t.fatura_id = f.id AND COALESCE(t.movimenta_caixa, false) = false
             ), 0) AS total
      FROM empresas_faturas f
      JOIN empresas_cartoes c ON c.id = f.cartao_id
      WHERE f.empresa_id = ${empresaId}
        AND ${statusFilter}
        ${de ? sql`AND f.data_vencimento >= ${de}` : sql``}
        ${ate ? sql`AND f.data_vencimento <= ${ate}` : sql``}
      ORDER BY f.data_vencimento ASC
    `);

    const st = status === "paga" ? "Efetivada" : "Pendente";
    const boletos = await db.execute(sql`
      SELECT t.id, t.descricao, t.valor, t.data_vencimento, t.data_transacao, t.status, t.tipo,
             t.fatura_id, t.movimenta_caixa, t.metodo_pagamento AS forma_pagamento,
             t.parcela_num, t.parcela_total, t.conta_bancaria_id,
             ec.nome AS categoria, ec.codigo AS categoria_codigo
      FROM empresas_transacoes t
      LEFT JOIN empresas_contas ec ON ec.id = t.categoria_id
      WHERE t.empresa_id = ${empresaId}
        AND t.status = ${st}
        AND t.tipo = 'Despesa'
        AND COALESCE(t.reembolso_pessoal, false) = false
        AND t.fatura_id IS NULL
        AND COALESCE(t.movimenta_caixa, true) = true
        AND (t.data_vencimento IS NOT NULL OR t.data_transacao IS NOT NULL)
        ${de ? sql`AND COALESCE(t.data_vencimento, t.data_transacao) >= ${de}` : sql``}
        ${ate ? sql`AND COALESCE(t.data_vencimento, t.data_transacao) <= ${ate}` : sql``}
      ORDER BY COALESCE(t.data_vencimento, t.data_transacao) ASC
    `);

    return res.json({ faturas, boletos });
  } catch (err) {
    console.error("listarVencimentosPj:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
};
