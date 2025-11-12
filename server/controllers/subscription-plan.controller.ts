import { Request, Response } from "express";
import { storage } from "../storage";
import { insertSubscriptionPlanSchema, updateSubscriptionPlanSchema } from "@shared/schema";
import { z } from "zod";

/**
 * Subscription Plan Controller
 *
 * Gerencia planos de assinatura (ADMIN ONLY)
 * Apenas super_admin pode criar, editar e deletar planos
 */

/**
 * @swagger
 * /api/subscription-plans:
 *   get:
 *     summary: Listar todos os planos de assinatura ativos
 *     tags: [Subscription Plans]
 *     responses:
 *       200:
 *         description: Lista de planos ativos
 */
export async function getActivePlans(req: Request, res: Response) {
  try {
    const plans = await storage.getActiveSubscriptionPlans();
    res.json(plans);
  } catch (error) {
    console.error("Error fetching active subscription plans:", error);
    res.status(500).json({ error: "Erro ao buscar planos de assinatura" });
  }
}

/**
 * @swagger
 * /api/admin/subscription-plans:
 *   get:
 *     summary: Listar todos os planos de assinatura (ativos e inativos) - ADMIN ONLY
 *     tags: [Subscription Plans]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Lista de todos os planos
 */
export async function getAllPlans(req: Request, res: Response) {
  try {
    // Verificar se é super_admin
    const user = (req as any).user;
    if (!user || user.tipo_usuario !== 'super_admin') {
      return res.status(403).json({ error: "Acesso negado. Apenas super_admin pode acessar." });
    }

    const plans = await storage.getAllSubscriptionPlans();
    res.json(plans);
  } catch (error) {
    console.error("Error fetching all subscription plans:", error);
    res.status(500).json({ error: "Erro ao buscar planos de assinatura" });
  }
}

/**
 * @swagger
 * /api/admin/subscription-plans:
 *   post:
 *     summary: Criar novo plano de assinatura - ADMIN ONLY
 *     tags: [Subscription Plans]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - planCode
 *               - name
 *               - priceMonthly
 *               - features
 *             properties:
 *               planCode:
 *                 type: string
 *                 example: "basic"
 *               name:
 *                 type: string
 *                 example: "Plano Básico"
 *               description:
 *                 type: string
 *                 example: "Plano ideal para uso pessoal"
 *               priceMonthly:
 *                 type: number
 *                 example: 29.90
 *               features:
 *                 type: string
 *                 example: '["Transações ilimitadas", "2 carteiras", "Suporte email"]'
 *               maxTransactions:
 *                 type: number
 *                 example: 0
 *               maxWallets:
 *                 type: number
 *                 example: 2
 *               maxCategories:
 *                 type: number
 *                 example: 0
 *     responses:
 *       201:
 *         description: Plano criado com sucesso
 */
export async function createPlan(req: Request, res: Response) {
  try {
    // Verificar se é super_admin
    const user = (req as any).user;
    if (!user || user.tipo_usuario !== 'super_admin') {
      return res.status(403).json({ error: "Acesso negado. Apenas super_admin pode criar planos." });
    }

    // Validar dados
    const validatedData = insertSubscriptionPlanSchema.parse(req.body);

    // Verificar se planCode já existe
    const existingPlan = await storage.getSubscriptionPlanByCode(validatedData.planCode);
    if (existingPlan) {
      return res.status(400).json({ error: "Código do plano já existe" });
    }

    // Criar plano
    const plan = await storage.createSubscriptionPlan(validatedData);

    res.status(201).json(plan);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Dados inválidos", details: error.errors });
    }
    console.error("Error creating subscription plan:", error);
    res.status(500).json({ error: "Erro ao criar plano de assinatura" });
  }
}

/**
 * @swagger
 * /api/admin/subscription-plans/{id}:
 *   put:
 *     summary: Atualizar plano de assinatura - ADMIN ONLY
 *     tags: [Subscription Plans]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Plano atualizado com sucesso
 */
export async function updatePlan(req: Request, res: Response) {
  try {
    // Verificar se é super_admin
    const user = (req as any).user;
    if (!user || user.tipo_usuario !== 'super_admin') {
      return res.status(403).json({ error: "Acesso negado. Apenas super_admin pode atualizar planos." });
    }

    const planId = parseInt(req.params.id);
    if (isNaN(planId)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    // Verificar se plano existe
    const existingPlan = await storage.getSubscriptionPlanById(planId);
    if (!existingPlan) {
      return res.status(404).json({ error: "Plano não encontrado" });
    }

    // Validar dados
    const validatedData = updateSubscriptionPlanSchema.parse(req.body);

    // Atualizar plano
    const updatedPlan = await storage.updateSubscriptionPlan(planId, validatedData);

    res.json(updatedPlan);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: "Dados inválidos", details: error.errors });
    }
    console.error("Error updating subscription plan:", error);
    res.status(500).json({ error: "Erro ao atualizar plano de assinatura" });
  }
}

/**
 * @swagger
 * /api/admin/subscription-plans/{id}:
 *   delete:
 *     summary: Desativar plano de assinatura (soft delete) - ADMIN ONLY
 *     tags: [Subscription Plans]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Plano desativado com sucesso
 */
export async function deletePlan(req: Request, res: Response) {
  try {
    // Verificar se é super_admin
    const user = (req as any).user;
    if (!user || user.tipo_usuario !== 'super_admin') {
      return res.status(403).json({ error: "Acesso negado. Apenas super_admin pode deletar planos." });
    }

    const planId = parseInt(req.params.id);
    if (isNaN(planId)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    // Verificar se plano existe
    const existingPlan = await storage.getSubscriptionPlanById(planId);
    if (!existingPlan) {
      return res.status(404).json({ error: "Plano não encontrado" });
    }

    // Soft delete (desativar)
    const success = await storage.deleteSubscriptionPlan(planId);

    if (success) {
      res.json({ message: "Plano desativado com sucesso" });
    } else {
      res.status(500).json({ error: "Erro ao desativar plano" });
    }
  } catch (error) {
    console.error("Error deleting subscription plan:", error);
    res.status(500).json({ error: "Erro ao deletar plano de assinatura" });
  }
}

/**
 * @swagger
 * /api/subscription-plans/{id}:
 *   get:
 *     summary: Buscar plano por ID
 *     tags: [Subscription Plans]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Detalhes do plano
 */
export async function getPlanById(req: Request, res: Response) {
  try {
    const planId = parseInt(req.params.id);
    if (isNaN(planId)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    const plan = await storage.getSubscriptionPlanById(planId);

    if (!plan) {
      return res.status(404).json({ error: "Plano não encontrado" });
    }

    // Apenas retornar se estiver ativo (exceto para admin)
    const user = (req as any).user;
    const isAdmin = user && user.tipo_usuario === 'super_admin';

    if (!plan.active && !isAdmin) {
      return res.status(404).json({ error: "Plano não disponível" });
    }

    res.json(plan);
  } catch (error) {
    console.error("Error fetching subscription plan:", error);
    res.status(500).json({ error: "Erro ao buscar plano de assinatura" });
  }
}
