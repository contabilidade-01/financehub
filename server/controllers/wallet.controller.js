"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrentWallet = getCurrentWallet;
exports.updateWallet = updateWallet;
const storage_1 = require("../storage");
const zod_1 = require("zod");
// Get current user's wallet
async function getCurrentWallet(req, res) {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Não autenticado" });
        }
        const userId = req.user.id;
        console.log("=== WALLET - GET CURRENT - REQUEST ===");
        console.log("Usuário ID:", userId);
        console.log("======================================");
        // Get wallet
        const wallet = await storage_1.storage.getWalletByUserId(userId);
        if (!wallet) {
            console.log("=== WALLET - CREATING NEW WALLET ===");
            // If no wallet exists, create one
            const newWallet = await storage_1.storage.createWallet({
                usuario_id: userId,
                nome: "Principal",
                descricao: "Carteira principal"
            });
            console.log("Nova carteira criada:", newWallet);
            console.log("=====================================");
            return res.status(200).json(newWallet);
        }
        console.log("=== WALLET - WALLET ENCONTRADA ===");
        console.log("Dados da carteira com saldo calculado:", wallet);
        console.log("===================================");
        // Force no cache to ensure balance is recalculated
        res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.set('Pragma', 'no-cache');
        res.set('Expires', '0');
        res.status(200).json(wallet);
    }
    catch (error) {
        console.error("Error in getCurrentWallet:", error);
        res.status(500).json({ message: "Erro ao obter carteira" });
    }
}
// Update current user's wallet
async function updateWallet(req, res) {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Não autenticado" });
        }
        const userId = req.user.id;
        // Validate request body
        const updateSchema = zod_1.z.object({
            nome: zod_1.z.string().min(1, "Nome é obrigatório").optional(),
            descricao: zod_1.z.string().optional(),
        });
        const updateData = updateSchema.parse(req.body);
        // Get wallet
        let wallet = await storage_1.storage.getWalletByUserId(userId);
        if (!wallet) {
            // If no wallet exists, create one
            wallet = await storage_1.storage.createWallet({
                usuario_id: userId,
                nome: updateData.nome || "Principal",
                descricao: updateData.descricao || "Carteira principal"
            });
            return res.status(201).json(wallet);
        }
        // Update wallet
        const updatedWallet = await storage_1.storage.updateWallet(wallet.id, updateData);
        if (!updatedWallet) {
            return res.status(404).json({ message: "Carteira não encontrada" });
        }
        res.status(200).json(updatedWallet);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
        }
        console.error("Error in updateWallet:", error);
        res.status(500).json({ message: "Erro ao atualizar carteira" });
    }
}
