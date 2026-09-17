"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getActivePlans = getActivePlans;
exports.getAllPlans = getAllPlans;
exports.createPlan = createPlan;
exports.updatePlan = updatePlan;
exports.deletePlan = deletePlan;
exports.getPlanById = getPlanById;
const storage_1 = require("../storage");
const schema_1 = require("../../shared/schema");
const zod_1 = require("zod");
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
async function getActivePlans(req, res) {
    var _a;
    try {
        const plans = await storage_1.storage.getActiveSubscriptionPlans();
        // Rota pública (sem sessão): o tipo vem do usuário logado, quando houver,
        // ou de ?tipo=. Mesma regra usada para escolher o plano da cobrança, para
        // o cliente nunca ver um preço e ser cobrado outro.
        const tipoUsuario = (_a = req.user) === null || _a === void 0 ? void 0 : _a.tipo_pessoa;
        const tipoQuery = String(req.query.tipo || "");
        const tipo = tipoUsuario || (tipoQuery === "fisica" || tipoQuery === "juridica" ? tipoQuery : null);
        res.json(tipo ? (0, storage_1.filtrarPlanosPorTipo)(plans, tipo) : plans);
    }
    catch (error) {
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
async function getAllPlans(req, res) {
    try {
        // Verificar se é super_admin
        const user = req.user;
        if (!user || user.tipo_usuario !== 'super_admin') {
            return res.status(403).json({ error: "Acesso negado. Apenas super_admin pode acessar." });
        }
        const plans = await storage_1.storage.getAllSubscriptionPlans();
        res.json(plans);
    }
    catch (error) {
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
async function createPlan(req, res) {
    try {
        // Verificar se é super_admin
        const user = req.user;
        if (!user || user.tipo_usuario !== 'super_admin') {
            return res.status(403).json({ error: "Acesso negado. Apenas super_admin pode criar planos." });
        }
        // Validar dados
        const validatedData = schema_1.insertSubscriptionPlanSchema.parse(req.body);
        // Verificar se planCode já existe
        const existingPlan = await storage_1.storage.getSubscriptionPlanByCode(validatedData.planCode);
        if (existingPlan) {
            return res.status(400).json({ error: "Código do plano já existe" });
        }
        // Criar plano
        const plan = await storage_1.storage.createSubscriptionPlan(validatedData);
        res.status(201).json(plan);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
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
async function updatePlan(req, res) {
    try {
        // Verificar se é super_admin
        const user = req.user;
        if (!user || user.tipo_usuario !== 'super_admin') {
            return res.status(403).json({ error: "Acesso negado. Apenas super_admin pode atualizar planos." });
        }
        const planId = parseInt(req.params.id);
        if (isNaN(planId)) {
            return res.status(400).json({ error: "ID inválido" });
        }
        // Verificar se plano existe
        const existingPlan = await storage_1.storage.getSubscriptionPlanById(planId);
        if (!existingPlan) {
            return res.status(404).json({ error: "Plano não encontrado" });
        }
        // Validar dados
        const validatedData = schema_1.updateSubscriptionPlanSchema.parse(req.body);
        // Atualizar plano
        const updatedPlan = await storage_1.storage.updateSubscriptionPlan(planId, validatedData);
        res.json(updatedPlan);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
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
async function deletePlan(req, res) {
    try {
        // Verificar se é super_admin
        const user = req.user;
        if (!user || user.tipo_usuario !== 'super_admin') {
            return res.status(403).json({ error: "Acesso negado. Apenas super_admin pode deletar planos." });
        }
        const planId = parseInt(req.params.id);
        if (isNaN(planId)) {
            return res.status(400).json({ error: "ID inválido" });
        }
        // Verificar se plano existe
        const existingPlan = await storage_1.storage.getSubscriptionPlanById(planId);
        if (!existingPlan) {
            return res.status(404).json({ error: "Plano não encontrado" });
        }
        // Soft delete (desativar)
        const success = await storage_1.storage.deleteSubscriptionPlan(planId);
        if (success) {
            res.json({ message: "Plano desativado com sucesso" });
        }
        else {
            res.status(500).json({ error: "Erro ao desativar plano" });
        }
    }
    catch (error) {
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
async function getPlanById(req, res) {
    try {
        const planId = parseInt(req.params.id);
        if (isNaN(planId)) {
            return res.status(400).json({ error: "ID inválido" });
        }
        const plan = await storage_1.storage.getSubscriptionPlanById(planId);
        if (!plan) {
            return res.status(404).json({ error: "Plano não encontrado" });
        }
        // Apenas retornar se estiver ativo (exceto para admin)
        const user = req.user;
        const isAdmin = user && user.tipo_usuario === 'super_admin';
        if (!plan.active && !isAdmin) {
            return res.status(404).json({ error: "Plano não disponível" });
        }
        res.json(plan);
    }
    catch (error) {
        console.error("Error fetching subscription plan:", error);
        res.status(500).json({ error: "Erro ao buscar plano de assinatura" });
    }
}
