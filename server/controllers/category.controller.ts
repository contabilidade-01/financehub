import { Request, Response } from "express";
import { storage } from "../storage";
import { insertCategorySchema } from "../shared/schema";
import { z } from "zod";

// Get all categories for current user
export async function getCategories(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Não autenticado" });
    }
    
    const userId = req.user.id;
    
    // Get all categories (both global and user-specific)
    const categories = await storage.getCategoriesByUserId(userId);
    
    res.status(200).json(categories);
  } catch (error) {
    console.error("Error in getCategories:", error);
    res.status(500).json({ message: "Erro ao obter categorias" });
  }
}

// Get a specific category
export async function getCategory(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Não autenticado" });
    }
    
    const userId = req.user.id;
    const categoryId = parseInt(req.params.id);
    
    // Get the category
    const category = await storage.getCategoryById(categoryId);
    if (!category) {
      return res.status(404).json({ message: "Categoria não encontrada" });
    }
    
    // Check if the category is global or belongs to the user
    if (!category.global && category.usuario_id !== userId) {
      return res.status(403).json({ message: "Acesso negado" });
    }
    
    res.status(200).json(category);
  } catch (error) {
    console.error("Error in getCategory:", error);
    res.status(500).json({ message: "Erro ao obter categoria" });
  }
}

// Create a new category
export async function createCategory(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Não autenticado" });
    }
    
    const userId = req.user.id;
    
    // Validate request body
    const categorySchema = insertCategorySchema.extend({
      // Override some fields
      global: z.boolean().default(false),
      usuario_id: z.number().optional(),
    });
    
    const categoryData = categorySchema.parse(req.body);
    
    // Force category to be user-specific (not global) and set the user ID
    categoryData.global = false;
    categoryData.usuario_id = userId;
    
    // Check if category with same name already exists for this user
    const userCategories = await storage.getCategoriesByUserId(userId);
    const existingCategory = userCategories.find(
      (c) => c.nome.toLowerCase() === categoryData.nome.toLowerCase() && 
             c.tipo === categoryData.tipo
    );
    
    if (existingCategory) {
      return res.status(400).json({ 
        message: `Já existe uma categoria ${categoryData.tipo?.toLowerCase()} com este nome` 
      });
    }
    
    // Create category
    const newCategory = await storage.createCategory(categoryData);
    
    res.status(201).json(newCategory);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
    }
    console.error("Error in createCategory:", error);
    res.status(500).json({ message: "Erro ao criar categoria" });
  }
}

// Update a category
export async function updateCategory(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Não autenticado" });
    }
    
    const userId = req.user.id;
    const categoryId = parseInt(req.params.id);
    
    // Validate request body
    const updateSchema = z.object({
      nome: z.string().min(1, "Nome é obrigatório").optional(),
      tipo: z.string().min(1, "Tipo é obrigatório").optional(),
      cor: z.string().optional(),
      icone: z.string().optional(),
    });
    
    const updateData = updateSchema.parse(req.body);
    
    // Get the category
    const category = await storage.getCategoryById(categoryId);
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
      const userCategories = await storage.getCategoriesByUserId(userId);
      const existingCategory = userCategories.find(
        (c) => c.id !== categoryId &&
               c.nome.toLowerCase() === updateData.nome?.toLowerCase() &&
               c.tipo === (updateData.tipo || category.tipo)
      );
      
      if (existingCategory) {
        return res.status(400).json({ 
          message: `Já existe uma categoria ${(updateData.tipo || category.tipo).toLowerCase()} com este nome` 
        });
      }
    }
    
    // Update category
    const updatedCategory = await storage.updateCategory(categoryId, updateData);
    if (!updatedCategory) {
      return res.status(404).json({ message: "Categoria não encontrada" });
    }
    
    res.status(200).json(updatedCategory);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ message: "Dados inválidos", errors: error.errors });
    }
    console.error("Error in updateCategory:", error);
    res.status(500).json({ message: "Erro ao atualizar categoria" });
  }
}

// Delete a category
export async function deleteCategory(req: Request, res: Response) {
  try {
    if (!req.user) {
      return res.status(401).json({ error: "Não autenticado" });
    }
    
    const userId = req.user.id;
    const categoryId = parseInt(req.params.id);
    
    // Get the category
    const category = await storage.getCategoryById(categoryId);
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
    const success = await storage.deleteCategory(categoryId);
    if (!success) {
      return res.status(400).json({ 
        message: "Não é possível excluir a categoria porque ela está sendo usada em transações" 
      });
    }
    
    res.status(200).json({ message: "Categoria excluída com sucesso" });
  } catch (error) {
    console.error("Error in deleteCategory:", error);
    res.status(500).json({ message: "Erro ao excluir categoria" });
  }
}
