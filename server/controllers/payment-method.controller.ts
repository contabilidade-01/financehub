import { Request, Response } from "express";
import { storage } from "../storage";
import { insertPaymentMethodSchema, type PaymentMethod } from "../shared/schema";
import { z } from "zod";

/**
 * @swagger
 * /api/payment-methods:
 *   get:
 *     summary: Obter formas de pagamento do usuário (globais + personalizadas)
 *     tags: [Formas de Pagamento]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Lista de formas de pagamento
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/MetodoPagamento'
 */

/**
 * @swagger
 * /api/payment-methods/global:
 *   get:
 *     summary: Obter métodos de pagamento globais
 *     description: |
 *       Lista os métodos de pagamento globais disponíveis para todas as transações.
 *       
 *       **Métodos Globais Padrão**:
 *       - PIX (ID: 1) - Usado como padrão quando não especificado
 *       - Cartão de Crédito (ID: 2)
 *       - Dinheiro (ID: 3)
 *     tags: [Formas de Pagamento]
 *     responses:
 *       200:
 *         description: Lista de métodos de pagamento globais
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/MetodoPagamento'
 *             example:
 *               - id: 1
 *                 nome: PIX
 *                 descricao: Transferências instantâneas via PIX
 *                 icone: Smartphone
 *                 cor: "#10B981"
 *                 global: true
 *                 ativo: true
 *               - id: 2
 *                 nome: Cartão de Crédito
 *                 descricao: Pagamentos realizados com cartão de crédito
 *                 icone: CreditCard
 *                 cor: "#3B82F6"
 *                 global: true
 *                 ativo: true
 *               - id: 3
 *                 nome: Dinheiro
 *                 descricao: Pagamentos em espécie
 *                 icone: Banknote
 *                 cor: "#F59E0B"
 *                 global: true
 *                 ativo: true
 */
export async function getPaymentMethods(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    // Get global payment methods and user's custom payment methods
    const [globalMethods, userMethods] = await Promise.all([
      storage.getGlobalPaymentMethods(),
      storage.getPaymentMethodsByUserId(req.user.id)
    ]);

    // Combine and sort by name
    const allMethods = [...globalMethods, ...userMethods].sort((a, b) => 
      a.nome.localeCompare(b.nome)
    );

    res.status(200).json(allMethods);
  } catch (error) {
    console.error("Error in getPaymentMethods:", error);
    res.status(500).json({ error: "Erro ao buscar formas de pagamento" });
  }
}

// Get global payment methods only
export async function getGlobalPaymentMethods(req: Request, res: Response) {
  try {
    const globalMethods = await storage.getGlobalPaymentMethods();
    res.status(200).json(globalMethods);
  } catch (error) {
    console.error("Error in getGlobalPaymentMethods:", error);
    res.status(500).json({ error: "Erro ao buscar métodos de pagamento globais" });
  }
}

/**
 * @swagger
 * /api/payment-methods:
 *   post:
 *     summary: Criar nova forma de pagamento personalizada
 *     tags: [Formas de Pagamento]
 *     security:
 *       - cookieAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - nome
 *             properties:
 *               nome:
 *                 type: string
 *                 description: Nome da forma de pagamento (obrigatório)
 *                 example: "Cartão Empresa"
 *               descricao:
 *                 type: string
 *                 description: Descrição da forma de pagamento (opcional)
 *                 example: "Cartão corporativo da empresa"
 *               icone:
 *                 type: string
 *                 description: Ícone da forma de pagamento (opcional)
 *                 example: "🏢"
 *               cor:
 *                 type: string
 *                 description: Cor em hexadecimal (opcional)
 *                 example: "#2196F3"
 *           example:
 *             nome: "Cartão Empresa"
 *             descricao: "Cartão corporativo da empresa"
 *             icone: "🏢"
 *             cor: "#2196F3"
 *     responses:
 *       201:
 *         description: Forma de pagamento criada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MetodoPagamento'
 *       400:
 *         description: Dados inválidos ou nome já existe
 *       401:
 *         description: Não autenticado
 */
export async function createPaymentMethod(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    const paymentMethodData = insertPaymentMethodSchema.parse({
      ...req.body,
      usuario_id: req.user.id,
      global: false
    });

    // Check if user already has a payment method with this name
    const userMethods = await storage.getPaymentMethodsByUserId(req.user.id);
    const globalMethods = await storage.getGlobalPaymentMethods();
    
    const existingMethod = [...userMethods, ...globalMethods].find(
      method => method.nome.toLowerCase() === paymentMethodData.nome.toLowerCase()
    );

    if (existingMethod) {
      return res.status(400).json({ 
        message: "Já existe uma forma de pagamento com este nome" 
      });
    }

    const newPaymentMethod = await storage.createPaymentMethod(paymentMethodData);
    res.status(201).json(newPaymentMethod);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "Dados inválidos", 
        errors: error.errors 
      });
    }
    console.error("Error in createPaymentMethod:", error);
    res.status(500).json({ error: "Erro ao criar forma de pagamento" });
  }
}

/**
 * @swagger
 * /api/payment-methods/{id}:
 *   put:
 *     summary: Atualizar forma de pagamento personalizada
 *     tags: [Formas de Pagamento]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID da forma de pagamento
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome:
 *                 type: string
 *               descricao:
 *                 type: string
 *               icone:
 *                 type: string
 *               cor:
 *                 type: string
 */
/**
 * @swagger
 * /api/payment-methods/{id}:
 *   put:
 *     summary: Atualizar forma de pagamento personalizada
 *     tags: [Formas de Pagamento]
 *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID da forma de pagamento
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               nome:
 *                 type: string
 *                 description: Nome da forma de pagamento
 *                 example: "Cartão Personalizado"
 *               descricao:
 *                 type: string
 *                 description: Descrição da forma de pagamento
 *                 example: "Meu cartão de crédito personalizado"
 *               icone:
 *                 type: string
 *                 description: Ícone da forma de pagamento
 *                 example: "💳"
 *               cor:
 *                 type: string
 *                 description: Cor da forma de pagamento (hexadecimal)
 *                 example: "#FF5722"
 *     responses:
 *       200:
 *         description: Forma de pagamento atualizada com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MetodoPagamento'
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (não é possível editar métodos globais)
 *       404:
 *         description: Forma de pagamento não encontrada
 */
export async function updatePaymentMethod(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    const paymentMethodId = parseInt(req.params.id);
    if (isNaN(paymentMethodId)) {
      return res.status(400).json({ error: "ID de forma de pagamento inválido" });
    }

    const existingMethod = await storage.getPaymentMethodById(paymentMethodId);
    if (!existingMethod) {
      return res.status(404).json({ message: "Forma de pagamento não encontrada" });
    }

    // Check if user owns this payment method (can't edit global ones)
    if (existingMethod.global || existingMethod.usuario_id !== req.user.id) {
      return res.status(403).json({ 
        message: "Você não pode editar esta forma de pagamento" 
      });
    }

    // Validate update data
    const updateData = insertPaymentMethodSchema.partial().parse(req.body);

    // Check for name conflicts if name is being updated
    if (updateData.nome && updateData.nome !== existingMethod.nome) {
      const userMethods = await storage.getPaymentMethodsByUserId(req.user.id);
      const globalMethods = await storage.getGlobalPaymentMethods();
      
      const conflictingMethod = [...userMethods, ...globalMethods].find(
        method => method.id !== paymentMethodId && 
                 method.nome.toLowerCase() === updateData.nome.toLowerCase()
      );

      if (conflictingMethod) {
        return res.status(400).json({ 
          message: "Já existe uma forma de pagamento com este nome" 
        });
      }
    }

    const updatedMethod = await storage.updatePaymentMethod(paymentMethodId, updateData);
    if (!updatedMethod) {
      return res.status(500).json({ error: "Erro ao atualizar forma de pagamento" });
    }

    res.status(200).json(updatedMethod);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        message: "Dados inválidos", 
        errors: error.errors 
      });
    }
    console.error("Error in updatePaymentMethod:", error);
    res.status(500).json({ error: "Erro ao atualizar forma de pagamento" });
  }
}

/**
 * @swagger
 * /api/payment-methods/{id}:
 *   delete:
 *     summary: Deletar forma de pagamento personalizada
 *     tags: [Formas de Pagamento]
 *     security:
 *       - cookieAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID da forma de pagamento
 */
/**
 * @swagger
 * /api/payment-methods/{id}:
 *   delete:
 *     summary: Excluir forma de pagamento personalizada
 *     description: Remove uma forma de pagamento personalizada do usuário. Métodos globais não podem ser excluídos.
 *     tags: [Formas de Pagamento]
 *     security:
 *       - cookieAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID da forma de pagamento
 *     responses:
 *       200:
 *         description: Forma de pagamento excluída com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: "Forma de pagamento excluída com sucesso"
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Sem permissão (não é possível excluir métodos globais)
 *       404:
 *         description: Forma de pagamento não encontrada
 */
export async function deletePaymentMethod(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    const paymentMethodId = parseInt(req.params.id);
    if (isNaN(paymentMethodId)) {
      return res.status(400).json({ error: "ID de forma de pagamento inválido" });
    }

    const existingMethod = await storage.getPaymentMethodById(paymentMethodId);
    if (!existingMethod) {
      return res.status(404).json({ message: "Forma de pagamento não encontrada" });
    }

    // Check if user owns this payment method (can't delete global ones)
    if (existingMethod.global || existingMethod.usuario_id !== req.user.id) {
      return res.status(403).json({ 
        message: "Você não pode deletar esta forma de pagamento" 
      });
    }

    const deleted = await storage.deletePaymentMethod(paymentMethodId);
    if (!deleted) {
      return res.status(400).json({ 
        message: "Não é possível deletar forma de pagamento em uso" 
      });
    }

    res.status(200).json({ message: "Forma de pagamento deletada com sucesso" });
  } catch (error) {
    console.error("Error in deletePaymentMethod:", error);
    res.status(500).json({ error: "Erro ao deletar forma de pagamento" });
  }
}

/**
 * @swagger
 * /api/payment-methods/totals:
 *   get:
 *     summary: Obter totais de transações por forma de pagamento
 *     tags: [Formas de Pagamento]
 *     security:
 *       - cookieAuth: []
 *     responses:
 *       200:
 *         description: Totais de transações por forma de pagamento
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   paymentMethodId:
 *                     type: number
 *                   total:
 *                     type: number
 */
export async function getPaymentMethodTotals(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    const totals = await storage.getTransactionTotalsByPaymentMethod(req.user.id);
    res.status(200).json(totals);
  } catch (error) {
    console.error("Error in getPaymentMethodTotals:", error);
    res.status(500).json({ error: "Erro ao buscar totais das formas de pagamento" });
  }
}