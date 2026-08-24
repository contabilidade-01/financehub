import { Request, Response } from "express";
import { storage } from "../storage";
import { insertEmpresaSchema, updateEmpresaSchema } from "../../shared/schema";

/**
 * Controller: empresa
 * Gerencia o CRUD de empresas (PJ). Apenas o usuário dono pode acessar sua empresa.
 * O fluxo PF (transações, categorias, dashboard) não é tocado.
 */

// POST /api/empresas — cria empresa e já popula o plano de contas padrão
export const createEmpresa = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const parsed = insertEmpresaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos", details: parsed.error.errors });
    }

    const empresa = await storage.createEmpresa({ ...parsed.data, usuario_id: userId });

    // Seed automático do plano de contas Yampa-like
    const contas = await storage.seedEmpresasContas(empresa.id);

    return res.status(201).json({ empresa, contas_criadas: contas.length });
  } catch (err: any) {
    console.error("createEmpresa:", err);
    if (err.message?.includes("duplicate") || err.code === "23505") {
      return res.status(409).json({ error: "CNPJ já cadastrado." });
    }
    return res.status(500).json({ error: "Erro interno ao criar empresa." });
  }
};

// GET /api/empresas — lista todas as empresas do usuário logado
export const listEmpresas = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const empresas = await storage.getEmpresasByUsuarioId(userId);
    return res.json(empresas);
  } catch (err) {
    console.error("listEmpresas:", err);
    return res.status(500).json({ error: "Erro interno ao listar empresas." });
  }
};

// GET /api/empresas/:id — retorna empresa por ID (somente do usuário logado)
export const getEmpresa = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido." });

    const empresa = await storage.getEmpresaById(id);
    if (!empresa) return res.status(404).json({ error: "Empresa não encontrada." });
    if (empresa.usuario_id !== userId) return res.status(403).json({ error: "Acesso negado." });

    return res.json(empresa);
  } catch (err) {
    console.error("getEmpresa:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
};

// PUT /api/empresas/:id — atualiza empresa (somente do usuário logado)
export const updateEmpresa = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido." });

    const empresa = await storage.getEmpresaById(id);
    if (!empresa) return res.status(404).json({ error: "Empresa não encontrada." });
    if (empresa.usuario_id !== userId) return res.status(403).json({ error: "Acesso negado." });

    const parsed = updateEmpresaSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Dados inválidos", details: parsed.error.errors });
    }

    const updated = await storage.updateEmpresa(id, parsed.data);
    return res.json(updated);
  } catch (err: any) {
    console.error("updateEmpresa:", err);
    if (err.message?.includes("duplicate") || err.code === "23505") {
      return res.status(409).json({ error: "CNPJ já cadastrado." });
    }
    return res.status(500).json({ error: "Erro interno." });
  }
};

// DELETE /api/empresas/:id — remove empresa (somente do usuário logado)
export const deleteEmpresa = async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "ID inválido." });

    const empresa = await storage.getEmpresaById(id);
    if (!empresa) return res.status(404).json({ error: "Empresa não encontrada." });
    if (empresa.usuario_id !== userId) return res.status(403).json({ error: "Acesso negado." });

    const deleted = await storage.deleteEmpresa(id);
    if (!deleted) return res.status(400).json({ error: "Não foi possível remover a empresa." });

    return res.status(204).send();
  } catch (err) {
    console.error("deleteEmpresa:", err);
    return res.status(500).json({ error: "Erro interno." });
  }
};
