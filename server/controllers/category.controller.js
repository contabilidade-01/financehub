"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCategories = getCategories;
exports.getCategory = getCategory;
exports.createCategory = createCategory;
exports.updateCategory = updateCategory;
exports.deleteCategory = deleteCategory;
const storage_1 = require("../storage");
const schema_1 = require("../../shared/schema");
const zod_1 = require("zod");
// Get all categories for current user
async function getCategories(req, res) {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Não autenticado" });
        }
        const userId = req.user.id;
        // Get all categories (both global and user-specific)
        const categories = await storage_1.storage.getCategoriesByUserId(userId);
        res.status(200).json(categories);
    }
    catch (error) {
        console.error("Error in getCategories:", error);
        res.status(500).json({ message: "Erro ao obter categorias" });
    }
}
// Get a specific category
async function getCategory(req, res) {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Não autenticado" });
        }
        const userId = req.user.id;
        const categoryId = parseInt(req.params.id);
        // Get the category
        const category = await storage_1.storage.getCategoryById(categoryId);
        if (!category) {
            return res.status(404).json({ message: "Categoria não encontrada" });
        }
        // Check if the category is global or belongs to the user
        if (!category.global && category.usuario_id !== userId) {
            return res.status(403).json({ message: "Acesso negado" });
        }
        res.status(200).json(category);
    }
    catch (error) {
        console.error("Error in getCategory:", error);
        res.status(500).json({ message: "Erro ao obter categoria" });
    }
}
// Create a new category
async function createCategory(req, res) {
    var _a;
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Não autenticado" });
        }
        const userId = req.user.id;
        // Validate request body
        const categorySchema = schema_1.insertCategorySchema.extend({
            // Override some fields
            global: zod_1.z.boolean().default(false),
            usuario_id: zod_1.z.number().optional(),
        });
        const categoryData = categorySchema.parse(req.body);
        // Force category to be user-specific (not global) and set the user ID
        categoryData.global = false;
        categoryData.usuario_id = userId;
        // Check if category with same name already exists for this user
        const userCategories = await storage_1.storage.getCategoriesByUserId(userId);
        const existingCategory = userCategories.find((c) => c.nome.toLowerCase() === categoryData.nome.toLowerCase() &&
            c.tipo === categoryData.tipo);
        if (existingCategory) {
            return res.status(400).json({
                message: `Já existe uma categoria ${(_a = categoryData.tipo) === null || _a === void 0 ? void 0 : _a.toLowerCase()} com este nome`
            });
        }
        // Create category
        const newCategory = await storage_1.storage.createCategory(categoryData);
        res.status(201).json(newCategory);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
        }
        console.error("Error in createCategory:", error);
        res.status(500).json({ message: "Erro ao criar categoria" });
    }
}
// Update a category
async function updateCategory(req, res) {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Não autenticado" });
        }
        const userId = req.user.id;
        const categoryId = parseInt(req.params.id);
        // Validate request body
        const updateSchema = zod_1.z.object({
            nome: zod_1.z.string().min(1, "Nome é obrigatório").optional(),
            tipo: zod_1.z.string().min(1, "Tipo é obrigatório").optional(),
            cor: zod_1.z.string().optional(),
            icone: zod_1.z.string().optional(),
        });
        const updateData = updateSchema.parse(req.body);
        // Get the category
        const category = await storage_1.storage.getCategoryById(categoryId);
        if (!category) {
            return res.status(404).json({ message: "Categoria não encontrada" });
        }
        // Check if the category is global (global categories can't be updated)
        if (category.global) {
            return res.status(403).json({ message: "Categorias globais não podem ser modificadas" });
        }
        // Check if the category belongs to the user
        if (category.usuario_id !== userId) {
            return res.status(403).json({ message: "Acesso negado" });
        }
        // If changing name, check if name is unique
        if (updateData.nome) {
            const userCategories = await storage_1.storage.getCategoriesByUserId(userId);
            const existingCategory = userCategories.find((c) => {
                var _a;
                return c.id !== categoryId &&
                    c.nome.toLowerCase() === ((_a = updateData.nome) === null || _a === void 0 ? void 0 : _a.toLowerCase()) &&
                    c.tipo === (updateData.tipo || category.tipo);
            });
            if (existingCategory) {
                return res.status(400).json({
                    message: `Já existe uma categoria ${(updateData.tipo || category.tipo).toLowerCase()} com este nome`
                });
            }
        }
        // Update category
        const updatedCategory = await storage_1.storage.updateCategory(categoryId, updateData);
        if (!updatedCategory) {
            return res.status(404).json({ message: "Categoria não encontrada" });
        }
        res.status(200).json(updatedCategory);
    }
    catch (error) {
        if (error instanceof zod_1.z.ZodError) {
            return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
        }
        console.error("Error in updateCategory:", error);
        res.status(500).json({ message: "Erro ao atualizar categoria" });
    }
}
// Delete a category
async function deleteCategory(req, res) {
    try {
        if (!req.user) {
            return res.status(401).json({ error: "Não autenticado" });
        }
        const userId = req.user.id;
        const categoryId = parseInt(req.params.id);
        // Get the category
        const category = await storage_1.storage.getCategoryById(categoryId);
        if (!category) {
            return res.status(404).json({ message: "Categoria não encontrada" });
        }
        // Check if the category is global (global categories can't be deleted)
        if (category.global) {
            return res.status(403).json({ message: "Categorias globais não podem ser excluídas" });
        }
        // Check if the category belongs to the user
        if (category.usuario_id !== userId) {
            return res.status(403).json({ message: "Acesso negado" });
        }
        // Delete category
        const success = await storage_1.storage.deleteCategory(categoryId);
        if (!success) {
            return res.status(400).json({
                message: "Não é possível excluir a categoria porque ela está sendo usada em transações"
            });
        }
        res.status(200).json({ message: "Categoria excluída com sucesso" });
    }
    catch (error) {
        console.error("Error in deleteCategory:", error);
        res.status(500).json({ message: "Erro ao excluir categoria" });
    }
}
