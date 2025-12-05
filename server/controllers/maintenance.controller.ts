/**
 * Maintenance Controller
 *
 * Controller para ferramentas de manutenção do sistema
 * Apenas super_admin tem acesso
 */

import type { Request, Response } from 'express';

export class MaintenanceController {
  /**
   * GET /api/maintenance/categories
   * Listar todas as categorias com suas cores
   */
  static async getAllCategories(req: Request, res: Response) {
    try {
      // Verificar se é super_admin
      if (req.user?.tipo_usuario !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado. Apenas super_admin pode acessar.'
        });
      }

      console.log('[Maintenance] Listando todas as categorias...');

      const postgres = (await import('postgres')).default;
      const client = postgres(process.env.DATABASE_URL || '', { prepare: false });

      const categories = await client`
        SELECT id, nome, tipo, cor, icone, global, usuario_id
        FROM categorias
        ORDER BY tipo, nome
      `;

      await client.end();

      res.json({
        success: true,
        data: categories
      });

    } catch (error) {
      console.error('[Maintenance] Erro ao listar categorias:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao listar categorias'
      });
    }
  }

  /**
   * PUT /api/maintenance/categories/:id
   * Atualizar cor de uma categoria específica
   */
  static async updateCategoryColor(req: Request, res: Response) {
    try {
      // Verificar se é super_admin
      if (req.user?.tipo_usuario !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado. Apenas super_admin pode acessar.'
        });
      }

      const categoryId = parseInt(req.params.id);
      const { cor, icone } = req.body;

      if (!cor) {
        return res.status(400).json({
          success: false,
          message: 'Cor é obrigatória'
        });
      }

      // Validar formato de cor hex
      if (!/^#[0-9A-F]{6}$/i.test(cor)) {
        return res.status(400).json({
          success: false,
          message: 'Formato de cor inválido. Use formato hex: #RRGGBB'
        });
      }

      console.log(`[Maintenance] Atualizando categoria ${categoryId} com cor ${cor}`);

      const postgres = (await import('postgres')).default;
      const client = postgres(process.env.DATABASE_URL || '', { prepare: false });

      const updateData: any = { cor };
      if (icone) {
        updateData.icone = icone;
      }

      await client`
        UPDATE categorias
        SET cor = ${cor}${icone ? `, icone = ${icone}` : ''}
        WHERE id = ${categoryId}
      `;

      // Buscar categoria atualizada
      const updated = await client`
        SELECT id, nome, tipo, cor, icone
        FROM categorias
        WHERE id = ${categoryId}
      `;

      await client.end();

      if (updated.length === 0) {
        return res.status(404).json({
          success: false,
          message: 'Categoria não encontrada'
        });
      }

      res.json({
        success: true,
        message: 'Cor atualizada com sucesso',
        data: updated[0]
      });

    } catch (error) {
      console.error('[Maintenance] Erro ao atualizar cor da categoria:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao atualizar cor da categoria'
      });
    }
  }

  /**
   * POST /api/maintenance/fix-category-colors
   * Aplicar correção automática de cores para categorias com cores duplicadas
   */
  static async fixCategoryColors(req: Request, res: Response) {
    try {
      // Verificar se é super_admin
      if (req.user?.tipo_usuario !== 'super_admin') {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado. Apenas super_admin pode acessar.'
        });
      }

      console.log('[Maintenance] Iniciando correção de cores das categorias...');

      const postgres = (await import('postgres')).default;
      const client = postgres(process.env.DATABASE_URL || '', { prepare: false });

      // Definir mapeamento de categorias para cores
      const categoryColorMap = [
        { nome: 'Alimentação', cor: '#FF6B6B', icone: 'utensils' },
        { nome: 'Moradia', cor: '#4ECDC4', icone: 'home' },
        { nome: 'Doações', cor: '#95E1D3', icone: 'hand-holding-heart' },
        { nome: 'Educação', cor: '#FFE66D', icone: 'graduation-cap' },
        { nome: 'Imposto', cor: '#FF8B94', icone: 'file-invoice-dollar' },
        { nome: 'Investimento', cor: '#A8E6CF', icone: 'chart-line' },
        { nome: 'Lazer', cor: '#FFD3B6', icone: 'gamepad' },
        { nome: 'Pets', cor: '#FFAAA5', icone: 'paw' },
        { nome: 'Saude', cor: '#FF8C42', icone: 'heartbeat' },
        { nome: 'Transporte', cor: '#6BCB77', icone: 'car' },
        { nome: 'Vestuário', cor: '#A569BD', icone: 'tshirt' },
        { nome: 'Viagem', cor: '#4D96FF', icone: 'plane' },
        { nome: 'Outros', cor: '#B0B0B0', icone: 'minus-circle' },
        // Categorias de receita
        { nome: 'Investimentos', cor: '#10B981', icone: 'chart-line' },
        { nome: 'Salário', cor: '#3B82F6', icone: 'money-bill-wave' },
        { nome: 'Freelance', cor: '#8B5CF6', icone: 'laptop-code' },
      ];

      let updatedCount = 0;

      for (const cat of categoryColorMap) {
        const result = await client`
          UPDATE categorias
          SET cor = ${cat.cor}, icone = ${cat.icone}
          WHERE nome = ${cat.nome} AND global = true
        `;

        if (result.count && result.count > 0) {
          updatedCount += result.count;
          console.log(`[Maintenance] Atualizada categoria "${cat.nome}" com cor ${cat.cor}`);
        }
      }

      await client.end();

      console.log(`[Maintenance] Correção concluída. ${updatedCount} categorias atualizadas.`);

      res.json({
        success: true,
        message: `Correção aplicada com sucesso! ${updatedCount} categorias foram atualizadas.`,
        data: {
          updatedCount
        }
      });

    } catch (error) {
      console.error('[Maintenance] Erro ao corrigir cores das categorias:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao aplicar correção de cores'
      });
    }
  }
}
