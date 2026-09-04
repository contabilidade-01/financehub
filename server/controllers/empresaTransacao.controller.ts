import { Request, Response } from "express";
import { storage } from "../storage";
import { softDeleteEmpresaTransacao, restaurarUltimaExcluidaPJ, listarLixeiraPJ } from "../storage";
import { insertEmpresaTransacaoSchema } from "../../shared/schema";
import { atualizarTransacaoEmpresa, baixarTransacaoEmpresa } from "../services/empresa-transacao.service";
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

    // Cartão de crédito: mesma regra do "Registrar compra" em Faturas —
    // competência, fatura da competência, não mexe no caixa, compõe o saldo.
    const cartaoIdBody = req.body?.cartao_id != null ? Number(req.body.cartao_id) : (parsed.data.cartao_id != null ? Number(parsed.data.cartao_id) : null);
    if (cartaoIdBody) {
      if (tipoNorm !== "Despesa") {
        return res.status(400).json({ error: "Cartão de crédito só pode ser usado em Despesa." });
      }
      const { cartaoDoUsuario, resolverFaturaDoCartao } = await import("../services/fatura-pj.service");
      const cartao = await cartaoDoUsuario(cartaoIdBody, userId);
      if (!cartao || cartao.empresa_id !== empresaId) {
        return res.status(400).json({ error: "Cartão não encontrado nesta empresa." });
      }
      const dataISO = String(parsed.data.data_transacao).slice(0, 10);
      const { fatura, competencia, metodo } = await resolverFaturaDoCartao(empresaId, cartao, dataISO);
      const transacao = await storage.createEmpresaTransacao({
        ...parsed.data,
        empresa_id: empresaId,
        tipo: "Despesa",
        cartao_id: cartao.id,
        fatura_id: fatura.id,
        competencia,
        movimenta_caixa: false,
        empresa_forma_pagamento_id: null,
        metodo_pagamento: metodo,
        origem: (req.body.origem as string) ?? "manual",
      } as any);
      return res.status(201).json(transacao);
    }

    // Forma PJ (PIX/boleto/débito…): resolve nome para metodo_pagamento.
    let metodoPagamento = parsed.data.metodo_pagamento ?? null;
    let empresaFormaId = parsed.data.empresa_forma_pagamento_id ?? null;
    if (empresaFormaId) {
      const forma = await formas.getFormaById(empresaId, Number(empresaFormaId));
      if (!forma) return res.status(400).json({ error: "Forma de pagamento não encontrada." });
      metodoPagamento = forma.nome;
    }

    const transacao = await storage.createEmpresaTransacao({
      ...parsed.data,
      empresa_id: empresaId,
      cartao_id: null,
      fatura_id: null,
      competencia: null,
      empresa_forma_pagamento_id: empresaFormaId,
      metodo_pagamento: metodoPagamento,
      origem: (req.body.origem as string) ?? 'manual'
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
// Baixa conta a pagar: Pendente → Efetivada + data_pagamento + movimenta_caixa.
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
    const upd = await formas.atualizarForma(empresaId, formaId, req.body || {});
    if (!upd) return res.status(404).json({ error: "Forma não encontrada." });
    return res.json(upd);
  } catch (err: any) {
    console.error("updateEmpresaForma:", err);
    return res.status(500).json({ error: err?.message || "Erro interno." });
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
// Retorna entradas, saídas fixas/variáveis/outras, margem de contribuição, lucro/prejuízo
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
// DRE simplificada: Receita Bruta − Despesas Variáveis = Margem Contribuição − Fixas − Outras = Lucro/Prejuízo
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
// Fluxo de Caixa Gerencial mensal (visão avançada/CFO): contas × meses.
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
