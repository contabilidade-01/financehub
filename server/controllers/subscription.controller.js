"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionController = void 0;
const storage_1 = require("../storage");
const zod_1 = require("zod");
const subscription_service_1 = require("../services/subscription.service");
const cancelSubscriptionSchema = zod_1.z.object({
    motivo: zod_1.z.string().min(1, "Motivo é obrigatório").max(500, "Motivo muito longo").optional(),
    reason: zod_1.z.string().min(1).max(500).optional(),
}).refine((d) => !!(d.motivo || d.reason), { message: "Motivo é obrigatório" });
class SubscriptionController {
    static async cancelSubscription(req, res) {
        try {
            if (!req.user) {
                return res.status(401).json({ error: "Usuário não autenticado" });
            }
            const validation = cancelSubscriptionSchema.safeParse(req.body);
            if (!validation.success) {
                return res.status(400).json({
                    error: "Dados inválidos",
                    details: validation.error.errors
                });
            }
            const motivo = (validation.data.motivo || validation.data.reason || "").trim();
            if (req.user.data_cancelamento) {
                return res.status(400).json({
                    error: "Assinatura já foi cancelada anteriormente"
                });
            }
            // Mesma regra do /api/billing/cancel: não corta o acesso na hora.
            await (0, subscription_service_1.getSubscriptionService)(storage_1.storage).cancelSubscription(req.user.id, motivo);
            const updatedUser = await storage_1.storage.getUserById(req.user.id);
            res.json({
                message: "Assinatura cancelada com sucesso. O acesso segue até o fim do período já pago.",
                user: updatedUser
                    ? {
                        id: updatedUser.id,
                        nome: updatedUser.nome,
                        email: updatedUser.email,
                        status_assinatura: updatedUser.status_assinatura,
                        data_cancelamento: updatedUser.data_cancelamento,
                        data_expiracao_assinatura: updatedUser.data_expiracao_assinatura,
                    }
                    : undefined,
            });
        }
        catch (error) {
            console.error('Erro ao cancelar assinatura:', error);
            res.status(500).json({
                error: 'Erro interno do servidor ao cancelar assinatura'
            });
        }
    }
    static async getSubscriptionStatus(req, res) {
        try {
            if (!req.user) {
                return res.status(401).json({ error: "Usuário não autenticado" });
            }
            const subscriptionStatus = {
                status: req.user.status_assinatura || "ativa",
                data_cancelamento: req.user.data_cancelamento,
                motivo_cancelamento: req.user.motivo_cancelamento,
                is_canceled: !!req.user.data_cancelamento
            };
            res.json(subscriptionStatus);
        }
        catch (error) {
            console.error('Erro ao buscar status da assinatura:', error);
            res.status(500).json({
                error: 'Erro interno do servidor'
            });
        }
    }
}
exports.SubscriptionController = SubscriptionController;
