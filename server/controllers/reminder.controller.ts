import { Request, Response } from "express";
import { storage } from "../storage";
import {
  insertReminderSchema,
  updateReminderSchema,
  type Reminder,
} from "../../shared/schema";
import { z } from "zod";

// Helper para converter datas de entrada para UTC (ao salvar)
const convertFromSaoPauloToUTC = (dateStr: string | Date) => {
  console.log(`\n=== DEBUG CONVERSÃO - INICIO ===`);
  console.log(`Tipo: ${typeof dateStr}`);
  console.log(`Valor: ${dateStr}`);

  if (typeof dateStr === "string") {
    console.log(`É string, verificando timezone...`);
    console.log(`Contém -03:00? ${dateStr.includes("-03:00")}`);

    // Se a string tem timezone -03:00, fazer conversão manual correta
    if (dateStr.includes("-03:00")) {
      // Extrair a parte da data sem o timezone
      const dateWithoutTz = dateStr.replace("-03:00", "");
      // Criar Date assumindo que é UTC (sem timezone)
      const localDate = new Date(dateWithoutTz);

      console.log(`Entrada: ${dateStr}`);
      console.log(`Sem timezone: ${dateWithoutTz}`);
      console.log(`Como local: ${localDate.toISOString()}`);
      console.log(`===============================\n`);

      return localDate;
    }
    // Para outros formatos, usar conversão direta
    console.log(`Usando conversão direta para: ${dateStr}`);
    const directDate = new Date(dateStr);
    console.log(`Resultado direto: ${directDate.toISOString()}`);
    console.log(`===============================\n`);
    return directDate;
  }
  console.log(`Não é string, retornando como está`);
  console.log(`===============================\n`);
  return dateStr;
};

// Helper para converter datas para timezone de São Paulo (ao retornar)
const convertToSaoPauloTimezone = (date: Date | string) => {
  const utcDate = new Date(date);

  // São Paulo está UTC-3, então subtrair 3 horas da data UTC
  const saoPauloTime = new Date(utcDate.getTime() - 3 * 60 * 60 * 1000);

  // Formatar no padrão ISO com offset -03:00
  return saoPauloTime.toISOString().replace("Z", "-03:00");
};

// Helper para adicionar timezone aos lembretes
const addTimezoneToReminder = (reminder: Reminder) => ({
  ...reminder,
  data_lembrete: reminder.data_lembrete
    ? convertToSaoPauloTimezone(reminder.data_lembrete)
    : null,
  // data_lembrete: reminder.data_lembrete ?? null,
  data_criacao: reminder.data_criacao
    ? convertToSaoPauloTimezone(reminder.data_criacao)
    : null,
  timezone: "America/Sao_Paulo",
});

const addTimezoneToReminders = (reminders: Reminder[]) =>
  reminders.map(addTimezoneToReminder);

/**
 * Obter todos os lembretes do usuário atual
 * @swagger
 * /api/reminders:
 *   get:
 *     summary: Obtém todos os lembretes do usuário atual
 *     description: Retorna todos os lembretes cadastrados pelo usuário autenticado
 *     tags: [Lembretes]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     responses:
 *       200:
 *         description: Lista de lembretes do usuário
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Reminder'
 *       401:
 *         description: Não autenticado
 *       500:
 *         description: Erro no servidor
 */
export async function getReminders(req: Request, res: Response) {
  // Log de entrada detalhado
  console.log("\n=== LEMBRETES - GET ALL - REQUEST ===");
  console.log(`Método HTTP: ${req.method}`);
  console.log(`URL: ${req.originalUrl}`);
  console.log(`Usuário ID: ${req.user?.id || "Não autenticado"}`);
  console.log("======================================\n");

  try {
    if (!req.user) {
      const errorResponse = { error: "Não autenticado" };
      console.log("\n=== LEMBRETES - GET ALL - ERROR RESPONSE (401) ===");
      console.log(JSON.stringify(errorResponse, null, 2));
      console.log("==============================================\n");
      return res.status(401).json(errorResponse);
    }

    console.log(`\n=== LEMBRETES - GET ALL - PROCESSING ===`);
    console.log(`Buscando lembretes do usuário ${req.user.id}`);
    console.log("=========================================\n");

    const reminders = await storage.getRemindersByUserId(req.user.id);

    // Log para debug - dados originais do banco
    console.log("\n=== LEMBRETES - DEBUG - DADOS ORIGINAIS DO BANCO ===");
    console.log(JSON.stringify(reminders, null, 2));
    console.log("=================================================\n");

    const remindersWithTimezone = addTimezoneToReminders(reminders);

    // Log de saída detalhado para sucesso
    console.log("\n=== LEMBRETES - GET ALL - SUCCESS RESPONSE (200) ===");
    console.log(`Total de lembretes: ${remindersWithTimezone.length}`);
    console.log(JSON.stringify(remindersWithTimezone, null, 2));
    console.log("================================================\n");

    return res.status(200).json(remindersWithTimezone);
  } catch (error) {
    const errorResponse = { error: "Erro ao obter lembretes" };
    console.error("\n=== LEMBRETES - GET ALL - SERVER ERROR (500) ===");
    console.error(error);
    console.log(JSON.stringify(errorResponse, null, 2));
    console.log("=============================================\n");
    return res.status(500).json(errorResponse);
  }
}

/**
 * Obter um lembrete específico
 */
export async function getReminder(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Não autenticado" });
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "ID inválido" });
    }

    const reminder = await storage.getReminderById(id);

    if (!reminder) {
      return res.status(404).json({ error: "Lembrete não encontrado" });
    }

    // Verificar se o lembrete pertence ao usuário atual
    if (reminder.usuario_id !== req.user.id) {
      return res.status(403).json({ error: "Acesso negado" });
    }

    const reminderWithTimezone = addTimezoneToReminder(reminder);
    return res.status(200).json(reminderWithTimezone);
  } catch (error) {
    console.error("Error getting reminder:", error);
    return res.status(500).json({ error: "Erro ao obter lembrete" });
  }
}

/**
 * Criar um novo lembrete
 * @swagger
 * /api/reminders:
 *   post:
 *     summary: Cria um novo lembrete
 *     description: Cria um novo lembrete para o usuário autenticado
 *     tags: [Lembretes]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - titulo
 *               - data_lembrete
 *             properties:
 *               titulo:
 *                 type: string
 *                 description: Título do lembrete
 *                 example: "Reunião de equipe"
 *               descricao:
 *                 type: string
 *                 description: Descrição detalhada do lembrete (opcional)
 *                 example: "Discutir os novos projetos"
 *               data_lembrete:
 *                 type: string
 *                 format: date-time
 *                 description: Data e hora do lembrete (formato ISO)
 *                 example: "2025-06-15T14:30:00Z"
 *               concluido:
 *                 type: boolean
 *                 description: Indica se o lembrete foi concluído (opcional)
 *                 default: false
 *     responses:
 *       201:
 *         description: Lembrete criado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Reminder'
 *       400:
 *         description: Dados inválidos
 *       401:
 *         description: Não autenticado
 *       500:
 *         description: Erro no servidor
 */
export async function createReminder(req: Request, res: Response) {
  // Log de entrada detalhado
  console.log("\n=== LEMBRETES - CREATE - REQUEST PAYLOAD ===");
  console.log(`Método HTTP: ${req.method}`);
  console.log(`URL: ${req.originalUrl}`);
  console.log(`Usuário ID: ${req.user?.id || "Não autenticado"}`);
  console.log(JSON.stringify(req.body, null, 2));
  console.log("==========================================\n");

  try {
    if (!req.user) {
      const errorResponse = { error: "Não autenticado" };
      console.log("\n=== LEMBRETES - CREATE - ERROR RESPONSE (401) ===");
      console.log(JSON.stringify(errorResponse, null, 2));
      console.log("============================================\n");
      return res.status(401).json(errorResponse);
    }

    // Validar dados de entrada
    const validationResult = insertReminderSchema.safeParse(req.body);
    if (!validationResult.success) {
      const errorResponse = {
        error: "Dados inválidos",
        details: validationResult.error.errors,
      };
      console.log("\n=== LEMBRETES - CREATE - VALIDATION ERROR ===");
      console.log(JSON.stringify(errorResponse, null, 2));
      console.log("========================================\n");
      return res.status(400).json(errorResponse);
    }

    // Converter data_lembrete para UTC se necessário e criar o lembrete com o id do usuário atual
    const reminderData = {
      ...validationResult.data,
      data_lembrete: convertFromSaoPauloToUTC(
        validationResult.data.data_lembrete,
      ),
      usuario_id: req.user.id,
    };

    console.log(
      "\n=== LEMBRETES - CREATE - VALIDATED DATA (PASSOU POR AQUI?) ===",
    );
    console.log(JSON.stringify(reminderData, null, 2));
    console.log("========================================\n");

    const reminder = await storage.createReminder(reminderData);
    const reminderWithTimezone = addTimezoneToReminder(reminder);

    // Log de saída detalhado para sucesso
    console.log("\n=== LEMBRETES - CREATE - SUCCESS RESPONSE (201) ===");
    console.log(`ID do lembrete criado: ${reminderWithTimezone.id}`);
    console.log(JSON.stringify(reminderWithTimezone, null, 2));
    console.log("==============================================\n");

    return res.status(201).json(reminderWithTimezone);
  } catch (error) {
    const errorResponse = { error: "Erro ao criar lembrete" };
    console.error("\n=== LEMBRETES - CREATE - SERVER ERROR (500) ===");
    console.error(error);
    console.log(JSON.stringify(errorResponse, null, 2));
    console.log("============================================\n");
    return res.status(500).json(errorResponse);
  }
}

/**
 * Atualizar um lembrete existente
 * @swagger
 * /api/reminders/{id}:
 *   put:
 *     summary: Atualiza um lembrete existente
 *     description: Atualiza um lembrete específico pertencente ao usuário autenticado
 *     tags: [Lembretes]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do lembrete a ser atualizado
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               titulo:
 *                 type: string
 *                 description: Título do lembrete
 *               descricao:
 *                 type: string
 *                 description: Descrição detalhada do lembrete
 *               data_lembrete:
 *                 type: string
 *                 format: date-time
 *                 description: Data e hora do lembrete (formato ISO)
 *               concluido:
 *                 type: boolean
 *                 description: Indica se o lembrete foi concluído
 *     responses:
 *       200:
 *         description: Lembrete atualizado com sucesso
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Reminder'
 *       400:
 *         description: Dados inválidos ou ID inválido
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Acesso negado - o lembrete não pertence ao usuário
 *       404:
 *         description: Lembrete não encontrado
 *       500:
 *         description: Erro no servidor
 */
export async function updateReminder(req: Request, res: Response) {
  // Log de entrada detalhado
  console.log("\n=== LEMBRETES - UPDATE - REQUEST PAYLOAD ===");
  console.log(`Método HTTP: ${req.method}`);
  console.log(`URL: ${req.originalUrl}`);
  console.log(`ID do Lembrete: ${req.params.id}`);
  console.log(`Usuário ID: ${req.user?.id || "Não autenticado"}`);
  console.log(JSON.stringify(req.body, null, 2));
  console.log("===========================================\n");

  try {
    if (!req.user) {
      const errorResponse = { error: "Não autenticado" };
      console.log("\n=== LEMBRETES - UPDATE - ERROR RESPONSE (401) ===");
      console.log(JSON.stringify(errorResponse, null, 2));
      console.log("=============================================\n");
      return res.status(401).json(errorResponse);
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      const errorResponse = { error: "ID inválido" };
      console.log("\n=== LEMBRETES - UPDATE - INVALID ID ===");
      console.log(`Valor do parâmetro id: ${req.params.id}`);
      console.log(JSON.stringify(errorResponse, null, 2));
      console.log("====================================\n");
      return res.status(400).json(errorResponse);
    }

    // Verificar se o lembrete existe
    const reminder = await storage.getReminderById(id);
    if (!reminder) {
      const errorResponse = { error: "Lembrete não encontrado" };
      console.log("\n=== LEMBRETES - UPDATE - NOT FOUND (404) ===");
      console.log(`ID do lembrete buscado: ${id}`);
      console.log(JSON.stringify(errorResponse, null, 2));
      console.log("=========================================\n");
      return res.status(404).json(errorResponse);
    }

    // Verificar se o lembrete pertence ao usuário atual
    if (reminder.usuario_id !== req.user.id) {
      const errorResponse = { error: "Acesso negado" };
      console.log("\n=== LEMBRETES - UPDATE - ACCESS DENIED (403) ===");
      console.log(
        `Usuário solicitante: ${req.user.id}, Proprietário do lembrete: ${reminder.usuario_id}`,
      );
      console.log(JSON.stringify(errorResponse, null, 2));
      console.log("==============================================\n");
      return res.status(403).json(errorResponse);
    }

    // Validar dados de entrada
    const validationResult = updateReminderSchema.safeParse(req.body);
    if (!validationResult.success) {
      const errorResponse = {
        error: "Dados inválidos",
        details: validationResult.error.errors,
      };
      console.log("\n=== LEMBRETES - UPDATE - VALIDATION ERROR ===");
      console.log(JSON.stringify(errorResponse, null, 2));
      console.log("==========================================\n");
      return res.status(400).json(errorResponse);
    }

    // Converter data_lembrete se fornecida e atualizar o lembrete
    const updateData = { ...validationResult.data };
    if (updateData.data_lembrete) {
      updateData.data_lembrete = convertFromSaoPauloToUTC(
        updateData.data_lembrete,
      );
    }

    console.log("\n=== LEMBRETES - UPDATE - VALIDATED DATA ===");
    console.log(`ID do lembrete: ${id}`);
    console.log(JSON.stringify(updateData, null, 2));
    console.log("========================================\n");

    const updatedReminder = await storage.updateReminder(id, updateData);

    if (!updatedReminder) {
      const errorResponse = { error: "Erro ao atualizar lembrete" };
      console.log("\n=== LEMBRETES - UPDATE - UPDATE FAILED (500) ===");
      console.log(`ID do lembrete: ${id}`);
      console.log(JSON.stringify(errorResponse, null, 2));
      console.log("============================================\n");
      return res.status(500).json(errorResponse);
    }

    const updatedReminderWithTimezone = addTimezoneToReminder(updatedReminder);

    // Log de saída detalhado para sucesso
    console.log("\n=== LEMBRETES - UPDATE - SUCCESS RESPONSE (200) ===");
    console.log(`ID do lembrete atualizado: ${updatedReminderWithTimezone.id}`);
    console.log(JSON.stringify(updatedReminderWithTimezone, null, 2));
    console.log("================================================\n");

    return res.status(200).json(updatedReminderWithTimezone);
  } catch (error) {
    const errorResponse = { error: "Erro ao atualizar lembrete" };
    console.error("\n=== LEMBRETES - UPDATE - SERVER ERROR (500) ===");
    console.error(error);
    console.log(JSON.stringify(errorResponse, null, 2));
    console.log("============================================\n");
    return res.status(500).json(errorResponse);
  }
}

/**
 * Excluir um lembrete
 * @swagger
 * /api/reminders/{id}:
 *   delete:
 *     summary: Exclui um lembrete existente
 *     description: Exclui um lembrete específico pertencente ao usuário autenticado
 *     tags: [Lembretes]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: ID do lembrete a ser excluído
 *     responses:
 *       204:
 *         description: Lembrete excluído com sucesso
 *       400:
 *         description: ID inválido
 *       401:
 *         description: Não autenticado
 *       403:
 *         description: Acesso negado - o lembrete não pertence ao usuário
 *       404:
 *         description: Lembrete não encontrado
 *       500:
 *         description: Erro no servidor
 */
export async function deleteReminder(req: Request, res: Response) {
  // Log de entrada detalhado
  console.log("\n=== LEMBRETES - DELETE - REQUEST ===");
  console.log(`Método HTTP: ${req.method}`);
  console.log(`URL: ${req.originalUrl}`);
  console.log(`ID do Lembrete: ${req.params.id}`);
  console.log(`Usuário ID: ${req.user?.id || "Não autenticado"}`);
  console.log("====================================\n");

  try {
    if (!req.user) {
      const errorResponse = { error: "Não autenticado" };
      console.log("\n=== LEMBRETES - DELETE - ERROR RESPONSE (401) ===");
      console.log(JSON.stringify(errorResponse, null, 2));
      console.log("=============================================\n");
      return res.status(401).json(errorResponse);
    }

    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      const errorResponse = { error: "ID inválido" };
      console.log("\n=== LEMBRETES - DELETE - INVALID ID ===");
      console.log(`Valor do parâmetro id: ${req.params.id}`);
      console.log(JSON.stringify(errorResponse, null, 2));
      console.log("====================================\n");
      return res.status(400).json(errorResponse);
    }

    // Verificar se o lembrete existe
    const reminder = await storage.getReminderById(id);
    if (!reminder) {
      const errorResponse = { error: "Lembrete não encontrado" };
      console.log("\n=== LEMBRETES - DELETE - NOT FOUND (404) ===");
      console.log(`ID do lembrete buscado: ${id}`);
      console.log(JSON.stringify(errorResponse, null, 2));
      console.log("=========================================\n");
      return res.status(404).json(errorResponse);
    }

    // Verificar se o lembrete pertence ao usuário atual
    if (reminder.usuario_id !== req.user.id) {
      const errorResponse = { error: "Acesso negado" };
      console.log("\n=== LEMBRETES - DELETE - ACCESS DENIED (403) ===");
      console.log(
        `Usuário solicitante: ${req.user.id}, Proprietário do lembrete: ${reminder.usuario_id}`,
      );
      console.log(JSON.stringify(errorResponse, null, 2));
      console.log("==============================================\n");
      return res.status(403).json(errorResponse);
    }

    // Excluir o lembrete
    console.log("\n=== LEMBRETES - DELETE - PROCESSING ===");
    console.log(`Excluindo lembrete ID: ${id}`);
    console.log("=====================================\n");

    const success = await storage.deleteReminder(id);

    if (success) {
      console.log("\n=== LEMBRETES - DELETE - SUCCESS (204) ===");
      console.log(`Lembrete ID ${id} excluído com sucesso`);
      console.log("========================================\n");
      return res.status(204).end();
    } else {
      const errorResponse = { error: "Erro ao excluir lembrete" };
      console.log("\n=== LEMBRETES - DELETE - FAILED (500) ===");
      console.log(`ID do lembrete: ${id}`);
      console.log(JSON.stringify(errorResponse, null, 2));
      console.log("======================================\n");
      return res.status(500).json(errorResponse);
    }
  } catch (error) {
    const errorResponse = { error: "Erro ao excluir lembrete" };
    console.error("\n=== LEMBRETES - DELETE - SERVER ERROR (500) ===");
    console.error(error);
    console.log(JSON.stringify(errorResponse, null, 2));
    console.log("============================================\n");
    return res.status(500).json(errorResponse);
  }
}

/**
 * Obter lembretes em um intervalo de datas
 * @swagger
 * /api/reminders/range:
 *   get:
 *     summary: Obtém lembretes em um intervalo de datas
 *     description: Retorna todos os lembretes do usuário dentro do intervalo de datas especificado
 *     tags: [Lembretes]
 *     security:
 *       - bearerAuth: []
 *       - apiKeyAuth: []
 *     parameters:
 *       - in: query
 *         name: start_date
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Data de início do intervalo (formato ISO)
 *       - in: query
 *         name: end_date
 *         required: true
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Data de fim do intervalo (formato ISO)
 *     responses:
 *       200:
 *         description: Lista de lembretes no intervalo especificado
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Reminder'
 *       400:
 *         description: Parâmetros de consulta inválidos
 *       401:
 *         description: Não autenticado
 *       500:
 *         description: Erro no servidor
 */
export async function getRemindersByDateRange(req: Request, res: Response) {
  // Log de entrada detalhado
  console.log("\n=== LEMBRETES - GET BY DATE RANGE - REQUEST ===");
  console.log(`Método HTTP: ${req.method}`);
  console.log(`URL: ${req.originalUrl}`);
  console.log(`Usuário ID: ${req.user?.id || "Não autenticado"}`);
  console.log(`Parâmetros: ${JSON.stringify(req.query)}`);
  console.log("============================================\n");

  try {
    if (!req.user) {
      const errorResponse = { error: "Não autenticado" };
      console.log(
        "\n=== LEMBRETES - GET BY DATE RANGE - ERROR RESPONSE (401) ===",
      );
      console.log(JSON.stringify(errorResponse, null, 2));
      console.log("======================================================\n");
      return res.status(401).json(errorResponse);
    }

    // Validar parâmetros de consulta
    const startDateParam = req.query.start_date as string;
    const endDateParam = req.query.end_date as string;

    if (!startDateParam || !endDateParam) {
      const errorResponse = { error: "Datas de início e fim são obrigatórias" };
      console.log(
        "\n=== LEMBRETES - GET BY DATE RANGE - MISSING PARAMETERS ===",
      );
      console.log(
        `Parâmetros recebidos: start_date=${startDateParam}, end_date=${endDateParam}`,
      );
      console.log(JSON.stringify(errorResponse, null, 2));
      console.log("====================================================\n");
      return res.status(400).json(errorResponse);
    }

    // Converter strings para objetos Date
    const startDate = new Date(startDateParam);
    const endDate = new Date(endDateParam);

    // Validar datas
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      const errorResponse = { error: "Datas inválidas" };
      console.log("\n=== LEMBRETES - GET BY DATE RANGE - INVALID DATES ===");
      console.log(`start_date=${startDateParam}, end_date=${endDateParam}`);
      console.log(JSON.stringify(errorResponse, null, 2));
      console.log("===============================================\n");
      return res.status(400).json(errorResponse);
    }

    console.log("\n=== LEMBRETES - GET BY DATE RANGE - PROCESSING ===");
    console.log(`Usuário: ${req.user.id}`);
    console.log(
      `Intervalo: ${startDate.toISOString()} até ${endDate.toISOString()}`,
    );
    console.log("===============================================\n");

    const reminders = await storage.getRemindersByDateRange(
      req.user.id,
      startDate,
      endDate,
    );

    // Log de saída detalhado para sucesso
    console.log(
      "\n=== LEMBRETES - GET BY DATE RANGE - SUCCESS RESPONSE (200) ===",
    );
    console.log(`Total de lembretes encontrados: ${reminders.length}`);
    console.log(
      `Intervalo: ${startDate.toISOString()} até ${endDate.toISOString()}`,
    );
    console.log(JSON.stringify(reminders, null, 2));
    console.log("========================================================\n");

    return res.status(200).json(reminders);
  } catch (error) {
    const errorResponse = {
      error: "Erro ao obter lembretes por intervalo de datas",
    };
    console.error(
      "\n=== LEMBRETES - GET BY DATE RANGE - SERVER ERROR (500) ===",
    );
    console.error(error);
    console.log(JSON.stringify(errorResponse, null, 2));
    console.log("=====================================================\n");
    return res.status(500).json(errorResponse);
  }
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Reminder:
 *       type: object
 *       required:
 *         - id
 *         - usuario_id
 *         - titulo
 *         - data_lembrete
 *       properties:
 *         id:
 *           type: integer
 *           description: ID único do lembrete
 *         usuario_id:
 *           type: integer
 *           description: ID do usuário que criou o lembrete
 *         titulo:
 *           type: string
 *           description: Título do lembrete
 *         descricao:
 *           type: string
 *           nullable: true
 *           description: Descrição detalhada do lembrete (opcional)
 *         data_lembrete:
 *           type: string
 *           format: date-time
 *           description: Data e hora do lembrete
 *         data_criacao:
 *           type: string
 *           format: date-time
 *           description: Data e hora de criação do lembrete
 *         concluido:
 *           type: boolean
 *           description: Indica se o lembrete foi concluído
 *           default: false
 *       example:
 *         id: 1
 *         usuario_id: 2
 *         titulo: "Reunião de equipe"
 *         descricao: "Discutir os novos projetos"
 *         data_lembrete: "2025-06-15T14:30:00Z"
 *         data_criacao: "2025-05-16T10:00:00Z"
 *         concluido: false
 */
