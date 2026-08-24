import { Request, Response } from "express";
import { storage } from "../storage";
import { z } from "zod";
import { getSaoPauloTimestamp } from "../../shared/schema";

const cancelSubscriptionSchema = z.object({
  motivo: z.string().min(1, "Motivo é obrigatório").max(500, "Motivo muito longo")
});

export class SubscriptionController {
  static async cancelSubscription(req: Request, res: Response) {
    try {
      console.log("=== SUBSCRIPTION CANCEL - REQUEST ===");
      console.log(`Usuário: ${req.user?.email} (${req.user?.id})`);
      console.log("=====================================");

      if (!req.user) {
        return res.status(401).json({ error: "Usuário não autenticado" });
      }

      // Validar dados de entrada
      const validation = cancelSubscriptionSchema.safeParse(req.body);
      if (!validation.success) {
        return res.status(400).json({ 
          error: "Dados inválidos",
          details: validation.error.errors
        });
      }

      const { motivo } = validation.data;

      // Verificar se o usuário já está cancelado
      if (req.user.data_cancelamento) {
        return res.status(400).json({ 
          error: "Assinatura já foi cancelada anteriormente" 
        });
      }

      // Calcular data de expiração (30 dias a partir de agora)
      const expirationDate = new Date();
      expirationDate.setDate(expirationDate.getDate() + 30);

      // Atualizar usuário com dados de cancelamento
      const updatedUser = await storage.updateUser(req.user.id, {
        data_cancelamento: getSaoPauloTimestamp(),
        motivo_cancelamento: motivo,
        data_expiracao_assinatura: expirationDate,
        status_assinatura: "cancelada"
      });

      if (!updatedUser) {
        return res.status(500).json({ 
          error: "Erro ao processar cancelamento" 
        });
      }

      console.log("=== SUBSCRIPTION CANCEL - SUCCESS ===");
      console.log(`Usuário ${req.user.email} cancelou a assinatura`);
      console.log(`Motivo: ${motivo}`);
      console.log("====================================");

      res.json({
        message: "Assinatura cancelada com sucesso",
        user: {
          id: updatedUser.id,
          nome: updatedUser.nome,
          email: updatedUser.email,
          status_assinatura: updatedUser.status_assinatura,
          data_cancelamento: updatedUser.data_cancelamento
        }
      });
    } catch (error) {
      console.error('Erro ao cancelar assinatura:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor ao cancelar assinatura' 
      });
    }
  }

  static async getSubscriptionStatus(req: Request, res: Response) {
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
    } catch (error) {
      console.error('Erro ao buscar status da assinatura:', error);
      res.status(500).json({ 
        error: 'Erro interno do servidor' 
      });
    }
  }
}