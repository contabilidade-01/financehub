import { Request, Response } from "express";
import { storage } from "../storage";
import { softDeleteEmpresaTransacao, restaurarUltimaExcluidaPJ, listarLixeiraPJ } from "../storage";
import { insertEmpresaTransacaoSchema, updateEmpresaTransacaoSchema } from "@shared/schema";

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

    const transacao = await storage.createEmpresaTransacao({
      ...parsed.data,
      empresa_id: empresaId,
      origem: (req.body.origem as string) ?? 'manual'
    });

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

    const { de, ate } = parsePeriodo(
      req.query.de as string | undefined,
      req.query.ate as string | undefined
    );
    const limit = req.query.limit ? parseInt(req.query.limit as string) : undefined;

    const transacoes = await storage.getEmpresaTransacoesByEmpresaId(empresaId, { de, ate, limit });
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

    const empresa = await resolveEmpresa(empresaId, userId, res);
    if (!empresa) return;

    const transacao = await storage.getEmpresaTransacaoById(transacaoId);
    if (!transacao) return res.status(404).json({ error: "Transação não encontrada." });
    if (transacao.empresa_id !== empresaId) return res.status(403).json({ error: "Transação não pertence a esta empresa." });

    const parsed = updateEmpresaTransacaoSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos", details: parsed.error.errors });
    }

    // Se trocou a categoria, valida novamente
    if (parsed.data.categoria_id) {
      const conta = await storage.getEmpresaContaById(parsed.data.categoria_id as number);
      if (!conta) return res.status(400).json({ error: "Categoria não encontrada." });
      if (conta.empresa_id !== empresaId) {
        return res.status(400).json({ error: "Categoria não pertence a esta empresa." });
      }
    }

    const updated = await storage.updateEmpresaTransacao(transacaoId, parsed.data);
    return res.json(updated);
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
