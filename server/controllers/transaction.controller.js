"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTransactions = getTransactions;
exports.getRecentTransactions = getRecentTransactions;
exports.getTransaction = getTransaction;
exports.createTransaction = createTransaction;
exports.updateTransaction = updateTransaction;
exports.deleteTransaction = deleteTransaction;
exports.listarLixeiraPf = listarLixeiraPf;
exports.restaurarLixeiraPf = restaurarLixeiraPf;
exports.getDashboardSummary = getDashboardSummary;
exports.alterarDiaMassa = alterarDiaMassa;
const storage_1 = require("../storage");
const schema_1 = require("../../shared/schema");
const zod_1 = require("zod");
const websocket_1 = require("../websocket");
const utils_1 = require("../utils");
// Get all transactions for current user
async function getTransactions(req, res) {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Não autenticado" });
        }
        const userId = req.user.id;
        // Get user's wallet
        const wallet = await storage_1.storage.getWalletByUserId(userId);
        if (!wallet) {
            return res.status(404).json({ message: "Carteira não encontrada" });
        }
        // Get all transactions
        const transactions = await storage_1.storage.getTransactionsByWalletId(wallet.id);
        res.status(200).json(transactions);
    }
    catch (error) {
        console.error("Error in getTransactions:", error);
        res.status(500).json({ message: "Erro ao obter transações" });
    }
}
// Get recent transactions for current user
async function getRecentTransactions(req, res) {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Não autenticado" });
        }
        const userId = req.user.id;
        // Get user's wallet
        const wallet = await storage_1.storage.getWalletByUserId(userId);
        if (!wallet) {
            return res.status(404).json({ message: "Carteira não encontrada" });
        }
        // Get limit parameter from query string
        const limit = req.query.limit ? parseInt(req.query.limit) : 5;
        // Get recent transactions
        const transactions = await storage_1.storage.getRecentTransactionsByWalletId(wallet.id, limit);
        res.status(200).json(transactions);
    }
    catch (error) {
        console.error("Error in getRecentTransactions:", error);
        res.status(500).json({ message: "Erro ao obter transações recentes" });
    }
}
// Get a specific transaction
async function getTransaction(req, res) {
    try {
        console.log('\n=== TRANSACTION GET - REQUEST ===');
        console.log(`ID: ${req.params.id}`);
        console.log(`URL: ${req.originalUrl}`);
        console.log('=================================\n');
        if (!req.user) {
            console.log('\n=== TRANSACTION GET - UNAUTHORIZED ===');
            console.log('======================================\n');
            return res.status(401).json({ error: "Não autenticado" });
        }
        const transactionId = parseInt(req.params.id);
        if (isNaN(transactionId)) {
            console.log('\n=== TRANSACTION GET - INVALID ID ===');
            console.log(`Valor do parâmetro id: ${req.params.id}`);
            console.log('===================================\n');
            return res.status(400).json({ error: "ID inválido" });
        }
        // Get user's wallet
        const wallet = await storage_1.storage.getWalletByUserId(req.user.id);
        if (!wallet) {
            console.log('\n=== TRANSACTION GET - WALLET NOT FOUND ===');
            console.log(`User ID: ${req.user.id}`);
            console.log('========================================\n');
            return res.status(404).json({ error: "Carteira não encontrada" });
        }
        // Get transaction
        const transaction = await storage_1.storage.getTransactionById(transactionId);
        if (!transaction) {
            console.log('\n=== TRANSACTION GET - NOT FOUND ===');
            console.log(`Transaction ID: ${transactionId}`);
            console.log('==================================\n');
            return res.status(404).json({ error: "Transação não encontrada" });
        }
        // Check if the transaction belongs to the user's wallet
        if (transaction.carteira_id !== wallet.id) {
            console.log('\n=== TRANSACTION GET - FORBIDDEN ===');
            console.log(`Transaction wallet ID: ${transaction.carteira_id}, User wallet ID: ${wallet.id}`);
            console.log('==================================\n');
            return res.status(403).json({ error: "Acesso negado" });
        }
        console.log('\n=== TRANSACTION GET - SUCCESS ===');
        console.log(`Transaction ID: ${transactionId} encontrada com sucesso`);
        console.log('================================\n');
        return res.status(200).json(transaction);
    }
    catch (error) {
        console.error('\n=== TRANSACTION GET - ERROR ===');
        console.error("Error in getTransaction:", error);
        console.error('==============================\n');
        return res.status(500).json({ error: "Erro ao obter transação" });
    }
}
// Create a new transaction
async function createTransaction(req, res) {
    var _a, _b, _c, _d;
    // Log de entrada detalhado
    console.log('\n=== TRANSACTION CREATE - REQUEST PAYLOAD ===');
    console.log(JSON.stringify(req.body, null, 2));
    console.log('==========================================\n');
    try {
        if (!req.user) {
            const errorResponse = { error: "Não autenticado" };
            console.log('\n=== TRANSACTION CREATE - ERROR RESPONSE (401) ===');
            console.log(JSON.stringify(errorResponse, null, 2));
            console.log('============================================\n');
            return res.status(401).json(errorResponse);
        }
        console.log('\n=== USER AUTHENTICATED ===');
        console.log(`User ID: ${req.user.id}`);
        console.log(`User Email: ${req.user.email}`);
        console.log(`User Type: ${req.user.tipo_usuario}`);
        console.log('==========================\n');
        const userId = req.user.id;
        // Get user's wallet first
        const wallet = await storage_1.storage.getWalletByUserId(userId);
        if (!wallet) {
            const errorResponse = { message: "Carteira não encontrada" };
            console.log('\n=== TRANSACTION CREATE - ERROR RESPONSE (404) ===');
            console.log(JSON.stringify(errorResponse, null, 2));
            console.log('============================================\n');
            return res.status(404).json(errorResponse);
        }
        // Validate request body
        const transactionData = schema_1.insertTransactionSchema.parse(req.body);
        // Só despesas podem ser reembolsáveis.
        transactionData.reembolsavel = transactionData.tipo === "Despesa" && transactionData.reembolsavel === true;
        if (transactionData.reembolsavel)
            transactionData.status = "Pendente";
        // Automatically assign the user's wallet ID if not provided or is 0 (from empty string)
        if (!transactionData.carteira_id || transactionData.carteira_id === 0) {
            transactionData.carteira_id = wallet.id;
            console.log(`\n=== AUTO-ASSIGNED WALLET ID ===`);
            console.log(`Wallet ID automaticamente atribuído: ${wallet.id}`);
            console.log(`=============================\n`);
        }
        // Automatically assign PIX as payment method if not provided
        if (!transactionData.forma_pagamento_id || transactionData.forma_pagamento_id === 0) {
            // Get PIX payment method ID dynamically
            const pixPaymentMethod = await storage_1.storage.getPaymentMethodByName('PIX');
            if (pixPaymentMethod) {
                transactionData.forma_pagamento_id = pixPaymentMethod.id;
                console.log(`\n=== AUTO-ASSIGNED PAYMENT METHOD ===`);
                console.log(`Forma de pagamento automaticamente atribuída: PIX (ID: ${pixPaymentMethod.id})`);
                console.log(`====================================\n`);
            }
            else {
                // Fallback: try global payment methods first, then user methods
                let availablePaymentMethods = await storage_1.storage.getGlobalPaymentMethods();
                if (availablePaymentMethods.length === 0) {
                    availablePaymentMethods = await storage_1.storage.getPaymentMethodsByUserId(userId);
                }
                if (availablePaymentMethods.length > 0) {
                    transactionData.forma_pagamento_id = availablePaymentMethods[0].id;
                    console.log(`\n=== AUTO-ASSIGNED PAYMENT METHOD (FALLBACK) ===`);
                    console.log(`PIX não encontrado, usando: ${availablePaymentMethods[0].nome} (ID: ${availablePaymentMethods[0].id})`);
                    console.log(`===============================================\n`);
                }
                else {
                    const errorResponse = { message: "Nenhum método de pagamento disponível" };
                    console.log('\n=== TRANSACTION CREATE - ERROR RESPONSE (400) ===');
                    console.log(JSON.stringify(errorResponse, null, 2));
                    console.log('============================================\n');
                    return res.status(400).json(errorResponse);
                }
            }
        }
        // Check if carteira_id in the request matches the user's wallet (security check)
        if (transactionData.carteira_id !== wallet.id) {
            const errorResponse = { message: "Acesso negado - você só pode criar transações na sua própria carteira" };
            console.log('\n=== TRANSACTION CREATE - ERROR RESPONSE (403) ===');
            console.log(JSON.stringify(errorResponse, null, 2));
            console.log('============================================\n');
            return res.status(403).json(errorResponse);
        }
        // Get the category to make sure it exists
        const category = await storage_1.storage.getCategoryById(transactionData.categoria_id);
        if (!category) {
            const errorResponse = { message: "Categoria não encontrada" };
            console.log('\n=== TRANSACTION CREATE - ERROR RESPONSE (404) ===');
            console.log(JSON.stringify(errorResponse, null, 2));
            console.log('============================================\n');
            return res.status(404).json(errorResponse);
        }
        // Isolamento: aceitar apenas categoria global ou do próprio usuário
        // (impede referenciar categoria privada de outro usuário).
        if (!category.global && category.usuario_id !== req.user.id) {
            return res.status(404).json({ message: "Categoria não encontrada" });
        }
        // Ensure transaction tipo matches category tipo
        if (transactionData.tipo !== category.tipo) {
            const errorResponse = {
                message: `Tipo de transação incompatível com a categoria. A categoria é do tipo ${category.tipo}`
            };
            console.log('\n=== TRANSACTION CREATE - ERROR RESPONSE (400) ===');
            console.log(JSON.stringify(errorResponse, null, 2));
            console.log('============================================\n');
            return res.status(400).json(errorResponse);
        }
        // Cartão / conta / forma — regra única compartilhada com o UPDATE.
        let isCartao = false;
        try {
            const { aplicarMeioPagamentoPf } = await Promise.resolve().then(() => __importStar(require("../services/meio-pagamento-pf")));
            const meio = await aplicarMeioPagamentoPf({
                userId,
                walletId: wallet.id,
                tipo: String(transactionData.tipo),
                dataISO: String(transactionData.data_transacao).slice(0, 10),
                forma_pagamento_id: (_a = transactionData.forma_pagamento_id) !== null && _a !== void 0 ? _a : null,
                conta_bancaria_id: ((_b = req.body) === null || _b === void 0 ? void 0 : _b.conta_bancaria_id) != null ? Number(req.body.conta_bancaria_id) : null,
                conta_bancaria_id_presente: Object.prototype.hasOwnProperty.call(req.body || {}, "conta_bancaria_id"),
                statusAtual: transactionData.status,
            });
            isCartao = meio.isCartao;
            transactionData.forma_pagamento_id = meio.forma_pagamento_id;
            transactionData.conta_bancaria_id = meio.conta_bancaria_id;
            transactionData.fatura_id = meio.fatura_id;
            transactionData.competencia = meio.competencia;
            transactionData.movimenta_caixa = meio.movimenta_caixa;
            if (meio.status)
                transactionData.status = meio.status;
        }
        catch (e) {
            return res.status(400).json({ message: (e === null || e === void 0 ? void 0 : e.message) || "Meio de pagamento inválido" });
        }
        // Parcelamento: N lançamentos amarrados a faturas por competência (se cartão).
        const parcelasN = Number((_c = req.body) === null || _c === void 0 ? void 0 : _c.parcelas) || 1;
        if (parcelasN > 1 && transactionData.tipo === "Despesa") {
            const { criarCompraParcelada } = await Promise.resolve().then(() => __importStar(require("../storage")));
            const valorTotal = Number(transactionData.valor);
            const result = await criarCompraParcelada({
                walletId: wallet.id,
                categoriaId: transactionData.categoria_id,
                descricao: transactionData.descricao,
                valorTotal,
                parcelas: parcelasN,
                formaPagamentoId: transactionData.forma_pagamento_id,
                dataInicio: String(transactionData.data_transacao).slice(0, 10),
                contaBancariaId: isCartao ? null : transactionData.conta_bancaria_id,
                usuarioId: userId,
                status: isCartao ? "Pendente" : (transactionData.status || "Efetivada"),
                competenciaInicial: typeof ((_d = req.body) === null || _d === void 0 ? void 0 : _d.competencia_inicial) === "string"
                    ? req.body.competencia_inicial
                    : null,
            });
            const first = await storage_1.storage.getTransactionById(result.ids[0]);
            return res.status(201).json(Object.assign(Object.assign({}, first), { compra_grupo: result.compra_grupo, parcelas_criadas: result.ids.length }));
        }
        // Create transaction
        const newTransaction = await storage_1.storage.createTransaction(transactionData);
        // Enviar notificação em tempo real via WebSocket
        const notification = {
            id: `transaction_created_${newTransaction.id}`,
            type: 'success',
            title: 'Nova Transação Criada',
            message: `${newTransaction.tipo === 'receita' ? 'Receita' : 'Despesa'} de ${(0, utils_1.formatCurrency)(newTransaction.valor)} - ${newTransaction.descricao}`,
            timestamp: new Date().toISOString(),
            from: {
                id: req.user.id.toString(),
                name: req.user.nome,
                role: req.user.tipo_usuario
            },
            data: {
                event: 'transaction.created',
                transaction: newTransaction,
                userId: req.user.id,
                isImpersonated: req.isImpersonating || false
            }
        };
        console.log('\n=== ENVIANDO NOTIFICAÇÃO WEBSOCKET ===');
        console.log('Notificação:', JSON.stringify(notification, null, 2));
        console.log('Usuário ID:', req.user.id);
        console.log('Transação ID:', newTransaction.id);
        console.log('=====================================\n');
        // Enviar para o usuário que criou a transação (considerando personificação)
        const broadcastResult = (0, websocket_1.broadcastNotification)(notification, [req.user.id.toString()]);
        console.log('Resultado do broadcast:', broadcastResult);
        console.log('Broadcast enviado para usuário:', req.user.id);
        // Log de saída detalhado para sucesso
        console.log('\n=== TRANSACTION CREATE - SUCCESS RESPONSE (201) ===');
        console.log(JSON.stringify(newTransaction, null, 2));
        console.log('===============================================\n');
        res.status(201).json(newTransaction);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            const errorResponse = { message: "Dados inválidos", errors: error.errors };
            console.log('\n=== TRANSACTION CREATE - VALIDATION ERROR (400) ===');
            console.log(JSON.stringify(errorResponse, null, 2));
            console.log('=================================================\n');
            return res.status(400).json(errorResponse);
        }
        console.error("Error in createTransaction:", error);
        const errorResponse = { message: "Erro ao criar transação" };
        console.log('\n=== TRANSACTION CREATE - SERVER ERROR (500) ===');
        console.log(JSON.stringify(errorResponse, null, 2));
        console.log('===========================================\n');
        res.status(500).json(errorResponse);
    }
}
// Update a transaction
async function updateTransaction(req, res) {
    var _a, _b, _c, _d, _e;
    // Log de entrada detalhado
    console.log('\n=== TRANSACTION UPDATE - REQUEST PAYLOAD ===');
    console.log(`Transaction ID: ${req.params.id}`);
    console.log(`Método HTTP: ${req.method}`); // Registrar se é PUT ou PATCH
    console.log(`URL: ${req.originalUrl}`);
    console.log(JSON.stringify(req.body, null, 2));
    console.log('==========================================\n');
    try {
        if (!req.user) {
            const errorResponse = { error: "Não autenticado" };
            console.log('\n=== TRANSACTION UPDATE - ERROR RESPONSE (401) ===');
            console.log(JSON.stringify(errorResponse, null, 2));
            console.log('============================================\n');
            return res.status(401).json(errorResponse);
        }
        const userId = req.user.id;
        const transactionId = parseInt(req.params.id);
        if (isNaN(transactionId)) {
            const errorResponse = { error: "ID inválido" };
            console.log('\n=== TRANSACTION UPDATE - INVALID ID ===');
            console.log(`Valor do parâmetro id: ${req.params.id}`);
            console.log(JSON.stringify(errorResponse, null, 2));
            console.log('===================================\n');
            return res.status(400).json(errorResponse);
        }
        // Validate request body
        const validationResult = schema_1.updateTransactionSchema.safeParse(req.body);
        if (!validationResult.success) {
            const errorResponse = { error: "Dados inválidos", details: validationResult.error.errors };
            console.log('\n=== TRANSACTION UPDATE - VALIDATION ERROR ===');
            console.log(JSON.stringify(errorResponse, null, 2));
            console.log('========================================\n');
            return res.status(400).json(errorResponse);
        }
        const transactionData = validationResult.data;
        // Get user's wallet
        const wallet = await storage_1.storage.getWalletByUserId(userId);
        if (!wallet) {
            const errorResponse = { error: "Carteira não encontrada" };
            console.log('\n=== TRANSACTION UPDATE - ERROR RESPONSE (404) ===');
            console.log(JSON.stringify(errorResponse, null, 2));
            console.log('============================================\n');
            return res.status(404).json(errorResponse);
        }
        // Get transaction to check ownership
        const transaction = await storage_1.storage.getTransactionById(transactionId);
        if (!transaction) {
            const errorResponse = { error: "Transação não encontrada" };
            console.log('\n=== TRANSACTION UPDATE - ERROR RESPONSE (404) ===');
            console.log(JSON.stringify(errorResponse, null, 2));
            console.log('============================================\n');
            return res.status(404).json(errorResponse);
        }
        // Check if the transaction belongs to the user's wallet
        if (transaction.carteira_id !== wallet.id) {
            const errorResponse = { error: "Acesso negado" };
            console.log('\n=== TRANSACTION UPDATE - ERROR RESPONSE (403) ===');
            console.log(JSON.stringify(errorResponse, null, 2));
            console.log('============================================\n');
            return res.status(403).json(errorResponse);
        }
        const tipoFinal = (_a = transactionData.tipo) !== null && _a !== void 0 ? _a : transaction.tipo;
        if (tipoFinal !== "Despesa")
            transactionData.reembolsavel = false;
        // If changing category, check if it exists and matches transaction type
        if (transactionData.categoria_id) {
            const category = await storage_1.storage.getCategoryById(transactionData.categoria_id);
            if (!category) {
                const errorResponse = { message: "Categoria não encontrada" };
                console.log('\n=== TRANSACTION UPDATE - ERROR RESPONSE (404) ===');
                console.log(JSON.stringify(errorResponse, null, 2));
                console.log('============================================\n');
                return res.status(404).json(errorResponse);
            }
            // Isolamento: aceitar apenas categoria global ou do próprio usuário.
            if (!category.global && category.usuario_id !== userId) {
                return res.status(404).json({ message: "Categoria não encontrada" });
            }
            // If changing category but not type, ensure they match
            if (!transactionData.tipo && category.tipo !== transaction.tipo) {
                const errorResponse = {
                    message: `Categoria incompatível com o tipo da transação. A categoria é do tipo ${category.tipo}`
                };
                console.log('\n=== TRANSACTION UPDATE - ERROR RESPONSE (400) ===');
                console.log(JSON.stringify(errorResponse, null, 2));
                console.log('============================================\n');
                return res.status(400).json(errorResponse);
            }
            // If changing both category and type, ensure they match
            if (transactionData.tipo && category.tipo !== transactionData.tipo) {
                const errorResponse = {
                    message: `Categoria incompatível com o tipo da transação. A categoria é do tipo ${category.tipo}`
                };
                console.log('\n=== TRANSACTION UPDATE - ERROR RESPONSE (400) ===');
                console.log(JSON.stringify(errorResponse, null, 2));
                console.log('============================================\n');
                return res.status(400).json(errorResponse);
            }
        }
        // Reaplica a mesma regra de meio de pagamento do CREATE (fatura/caixa/conta).
        const body = req.body || {};
        const temForma = Object.prototype.hasOwnProperty.call(body, "forma_pagamento_id");
        const temConta = Object.prototype.hasOwnProperty.call(body, "conta_bancaria_id");
        if (temForma || temConta) {
            try {
                const { aplicarMeioPagamentoPf } = await Promise.resolve().then(() => __importStar(require("../services/meio-pagamento-pf")));
                const dataISO = String((_b = transactionData.data_transacao) !== null && _b !== void 0 ? _b : transaction.data_transacao).slice(0, 10);
                const meio = await aplicarMeioPagamentoPf({
                    userId,
                    walletId: wallet.id,
                    tipo: String(tipoFinal),
                    dataISO,
                    forma_pagamento_id: temForma
                        ? (body.forma_pagamento_id != null ? Number(body.forma_pagamento_id) : null)
                        : ((_c = transaction.forma_pagamento_id) !== null && _c !== void 0 ? _c : null),
                    conta_bancaria_id: temConta
                        ? (body.conta_bancaria_id != null ? Number(body.conta_bancaria_id) : null)
                        : ((_d = transaction.conta_bancaria_id) !== null && _d !== void 0 ? _d : null),
                    conta_bancaria_id_presente: temConta,
                    statusAtual: ((_e = transactionData.status) !== null && _e !== void 0 ? _e : transaction.status),
                });
                transactionData.forma_pagamento_id = meio.forma_pagamento_id;
                transactionData.conta_bancaria_id = meio.conta_bancaria_id;
                transactionData.fatura_id = meio.fatura_id;
                transactionData.competencia = meio.competencia;
                transactionData.movimenta_caixa = meio.movimenta_caixa;
                if (meio.isCartao && meio.status)
                    transactionData.status = meio.status;
            }
            catch (e) {
                return res.status(400).json({ message: (e === null || e === void 0 ? void 0 : e.message) || "Meio de pagamento inválido" });
            }
        }
        // Update transaction
        try {
            const updatedTransaction = await storage_1.storage.updateTransaction(transactionId, transactionData);
            if (!updatedTransaction) {
                const errorResponse = { error: "Transação não encontrada ou não foi possível atualizar" };
                console.log('\n=== TRANSACTION UPDATE - UPDATE FAILED ===');
                console.log(`Transaction ID: ${transactionId}`);
                console.log(JSON.stringify(errorResponse, null, 2));
                console.log('=====================================\n');
                return res.status(404).json(errorResponse);
            }
            // Enviar notificação em tempo real via WebSocket
            const notification = {
                id: `transaction_updated_${updatedTransaction.id}`,
                type: 'info',
                title: 'Transação Atualizada',
                message: `${updatedTransaction.tipo === 'receita' ? 'Receita' : 'Despesa'} de ${(0, utils_1.formatCurrency)(updatedTransaction.valor)} - ${updatedTransaction.descricao}`,
                timestamp: new Date().toISOString(),
                from: {
                    id: req.user.id.toString(),
                    name: req.user.nome,
                    role: req.user.tipo_usuario
                },
                data: {
                    event: 'transaction.updated',
                    transaction: updatedTransaction,
                    userId: req.user.id,
                    isImpersonated: req.isImpersonating || false
                }
            };
            // Enviar para o usuário que atualizou a transação (considerando personificação)
            (0, websocket_1.broadcastNotification)(notification, [req.user.id.toString()]);
            // Log de saída detalhado para sucesso
            console.log('\n=== TRANSACTION UPDATE - SUCCESS ===');
            console.log(`ID: ${transactionId}, Método: ${req.method}`);
            console.log(JSON.stringify(updatedTransaction, null, 2));
            console.log('==================================\n');
            return res.status(200).json(updatedTransaction);
        }
        catch (dbError) {
            console.error('\n=== TRANSACTION UPDATE - DATABASE ERROR ===');
            console.error(`Transaction ID: ${transactionId}`);
            console.error(dbError);
            console.error('=======================================\n');
            return res.status(500).json({
                error: "Erro ao atualizar transação no banco de dados",
                message: dbError.message || "Erro interno do servidor"
            });
        }
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            const errorResponse = { error: "Dados inválidos", details: error.errors };
            console.log('\n=== TRANSACTION UPDATE - VALIDATION ERROR ===');
            console.log(JSON.stringify(errorResponse, null, 2));
            console.log('========================================\n');
            return res.status(400).json(errorResponse);
        }
        console.error('\n=== TRANSACTION UPDATE - UNHANDLED ERROR ===');
        console.error("Error in updateTransaction:", error);
        console.error('=========================================\n');
        return res.status(500).json({
            error: "Erro ao atualizar transação",
            message: error.message || "Erro interno do servidor"
        });
    }
}
// Delete a transaction
async function deleteTransaction(req, res) {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Não autenticado" });
        }
        const userId = req.user.id;
        const transactionId = parseInt(req.params.id);
        // Get user's wallet
        const wallet = await storage_1.storage.getWalletByUserId(userId);
        if (!wallet) {
            return res.status(404).json({ message: "Carteira não encontrada" });
        }
        // Get transaction to check ownership
        const transaction = await storage_1.storage.getTransactionById(transactionId);
        if (!transaction) {
            return res.status(404).json({ message: "Transação não encontrada" });
        }
        // Check if the transaction belongs to the user's wallet
        if (transaction.carteira_id !== wallet.id) {
            return res.status(403).json({ message: "Acesso negado" });
        }
        // Soft-delete → lixeira (recuperável ~30 dias)
        const success = await (0, storage_1.softDeleteTransacao)(transactionId, wallet.id, userId);
        if (!success) {
            return res.status(500).json({ message: "Erro ao excluir transação" });
        }
        // Enviar notificação em tempo real via WebSocket
        const notification = {
            id: `transaction_deleted_${transactionId}`,
            type: 'warning',
            title: 'Transação Excluída',
            message: `${transaction.tipo === 'receita' ? 'Receita' : 'Despesa'} de ${(0, utils_1.formatCurrency)(transaction.valor)} - ${transaction.descricao}`,
            timestamp: new Date().toISOString(),
            from: {
                id: req.user.id.toString(),
                name: req.user.nome,
                role: req.user.tipo_usuario
            },
            data: {
                event: 'transaction.deleted',
                transactionId: transactionId,
                transaction: transaction,
                userId: req.user.id,
                isImpersonated: req.isImpersonating || false,
                recuperavel: true,
            }
        };
        // Enviar para o usuário que excluiu a transação (considerando personificação)
        (0, websocket_1.broadcastNotification)(notification, [req.user.id.toString()]);
        res.status(200).json({
            message: "Transação movida para a lixeira",
            recuperavel: true,
            dias: 30,
        });
    }
    catch (error) {
        console.error("Error in deleteTransaction:", error);
        res.status(500).json({ message: "Erro ao excluir transação" });
    }
}
/** GET /api/transactions/lixeira — itens recuperáveis da carteira PF */
async function listarLixeiraPf(req, res) {
    try {
        if (!req.user)
            return res.status(401).json({ error: "Não autenticado" });
        const wallet = await storage_1.storage.getWalletByUserId(req.user.id);
        if (!wallet)
            return res.status(404).json({ message: "Carteira não encontrada" });
        const items = await (0, storage_1.listarLixeira)(wallet.id);
        res.json(items);
    }
    catch (error) {
        console.error("Error in listarLixeiraPf:", error);
        res.status(500).json({ message: "Erro ao listar lixeira" });
    }
}
/** POST /api/transactions/lixeira/restaurar — restaura a última exclusão PF */
async function restaurarLixeiraPf(req, res) {
    try {
        if (!req.user)
            return res.status(401).json({ error: "Não autenticado" });
        const wallet = await storage_1.storage.getWalletByUserId(req.user.id);
        if (!wallet)
            return res.status(404).json({ message: "Carteira não encontrada" });
        const result = await (0, storage_1.restaurarUltimaExcluida)(wallet.id);
        if (!result.restaurada) {
            return res.status(404).json({ restaurada: false, message: "Nada na lixeira para restaurar" });
        }
        res.json(result);
    }
    catch (error) {
        console.error("Error in restaurarLixeiraPf:", error);
        res.status(500).json({ message: "Erro ao restaurar transação" });
    }
}
// Get dashboard summary data
async function getDashboardSummary(req, res) {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Não autenticado" });
        }
        const userId = req.user.id;
        // Get user's wallet
        const wallet = await storage_1.storage.getWalletByUserId(userId);
        if (!wallet) {
            return res.status(404).json({ message: "Carteira não encontrada" });
        }
        const from = typeof req.query.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.from)
            ? req.query.from
            : undefined;
        const to = typeof req.query.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.to)
            ? req.query.to
            : undefined;
        const period = req.query.period;
        const validPeriods = ["month", "quarter", "year", "all"];
        if (!from && !to && period && !validPeriods.includes(period)) {
            return res.status(400).json({
                error: "Parâmetro de período inválido",
                message: `O período deve ser um dos seguintes: ${validPeriods.join(", ")}`
            });
        }
        const monthlyData = await storage_1.storage.getMonthlyTransactionSummary(wallet.id, period, from, to);
        const expensesData = await storage_1.storage.getExpensesByCategory(wallet.id, period, from, to);
        // Calculate total expenses for percentage calculation
        const totalExpensesAmount = expensesData.reduce((total, item) => total + Number(item.total), 0);
        // Add percentage to each category
        const expensesByCategory = expensesData.map((item) => ({
            categoryId: Number(item.category_id),
            name: item.name,
            total: Number(item.total),
            color: item.color,
            icon: item.icon,
            percentage: totalExpensesAmount > 0
                ? Math.round((Number(item.total) / totalExpensesAmount) * 100)
                : 0
        }));
        // Get income and expense totals (filtered by period)
        const { totalIncome, totalExpenses } = await storage_1.storage.getIncomeExpenseTotals(wallet.id, period, from, to);
        res.status(200).json({
            monthlyData,
            expensesByCategory,
            totalIncome,
            totalExpenses
        });
    }
    catch (error) {
        console.error("Error in getDashboardSummary:", error);
        res.status(500).json({ message: "Erro ao obter resumo do dashboard" });
    }
}
/** POST /api/transactions/alterar-dia  { transacao_ids, dia, todas_parcelas? } */
async function alterarDiaMassa(req, res) {
    var _a, _b, _c, _d, _e;
    try {
        if (!req.user)
            return res.status(401).json({ error: "Não autenticado" });
        const wallet = await storage_1.storage.getWalletByUserId(req.user.id);
        if (!wallet)
            return res.status(404).json({ error: "Carteira não encontrada" });
        const { idsLimpos } = await Promise.resolve().then(() => __importStar(require("../services/mover-meio.service")));
        const { alterarDiaTransacoesPf } = await Promise.resolve().then(() => __importStar(require("../services/alterar-dia.service")));
        const ids = idsLimpos((_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a.transacao_ids) !== null && _b !== void 0 ? _b : (_c = req.body) === null || _c === void 0 ? void 0 : _c.transacao_id);
        const r = await alterarDiaTransacoesPf({
            userId: req.user.id,
            walletId: wallet.id,
            ids,
            dia: Number((_d = req.body) === null || _d === void 0 ? void 0 : _d.dia),
            todasParcelas: ((_e = req.body) === null || _e === void 0 ? void 0 : _e.todas_parcelas) !== false,
        });
        return res.json(Object.assign({ success: true }, r));
    }
    catch (e) {
        return res.status(400).json({ error: (e === null || e === void 0 ? void 0 : e.message) || "Erro ao alterar o dia" });
    }
}
