import express from 'express';
import { requireSuperAdmin } from '../middleware/adminAuth.middleware';
import { db } from '../db';
import { sql } from 'drizzle-orm';

const router = express.Router();

// Interfaces
interface ThemeConfig {
  background: string;
  foreground: string;
  primary: string;
  primaryForeground: string;
  secondary: string;
  secondaryForeground: string;
  muted: string;
  mutedForeground: string;
  accent: string;
  accentForeground: string;
  border: string;
  card: string;
  cardForeground: string;
  destructive: string;
  destructiveForeground: string;
}

interface CustomTheme {
  id?: number;
  name: string;
  lightConfig: ThemeConfig;
  darkConfig: ThemeConfig;
  isDefault?: boolean;
  userId?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

// Validar configuração de tema
function validateThemeConfig(config: ThemeConfig): boolean {
  const requiredFields = [
    'background', 'foreground', 'primary', 'primaryForeground',
    'secondary', 'secondaryForeground', 'muted', 'mutedForeground',
    'accent', 'accentForeground', 'border', 'card', 'cardForeground',
    'destructive', 'destructiveForeground'
  ];

  for (const field of requiredFields) {
    const value = config[field as keyof ThemeConfig];
    
    if (!value) {
      return false;
    }
    
    if (typeof value !== 'string') {
      return false;
    }
    
    if (!isValidColor(value)) {
      return false;
    }
  }

  return true;
}

// Validar formato de cor (HSL ou HEX)
function isValidColor(color: string): boolean {
  if (!color || typeof color !== 'string') return false;
  
  const trimmed = color.trim();
  
  // Validar formato HEX (#RRGGBB)
  const hexPattern = /^#[0-9A-Fa-f]{6}$/;
  if (hexPattern.test(trimmed)) {
    return true;
  }
  
  // Validar formato HSL (aceita decimais)
  const hslPattern = /^\d{1,3}(\.\d+)?\s+\d{1,3}(\.\d+)?%\s+\d{1,3}(\.\d+)?%$/;
  return hslPattern.test(trimmed);
}

// GET /api/themes - Listar todos os temas
router.get('/', requireSuperAdmin, async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT 
        id, 
        name, 
        light_config as lightConfig,
        dark_config as darkConfig,
        is_default as isDefault,
        is_active_light as isActiveLight,
        is_active_dark as isActiveDark,
        user_id as userId,
        created_at as createdAt,
        updated_at as updatedAt
      FROM custom_themes 
      ORDER BY is_default DESC, created_at DESC
    `);

    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Erro ao buscar temas:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// GET /api/themes/:id - Buscar tema específico
router.get('/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await db.execute(sql`
      SELECT 
        id, 
        name, 
        light_config as lightConfig,
        dark_config as darkConfig,
        is_default as isDefault,
        user_id as userId,
        created_at as createdAt,
        updated_at as updatedAt
      FROM custom_themes 
      WHERE id = ${id}
    `);

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tema não encontrado'
      });
    }

    res.json({
      success: true,
      data: result[0]
    });
  } catch (error) {
    console.error('Erro ao buscar tema:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// POST /api/themes - Criar novo tema
router.post('/', requireSuperAdmin, async (req, res) => {
  try {
    const { name, lightConfig, darkConfig, isDefault = false } = req.body as CustomTheme;
    const userId = req.user?.id;

    // Validações
    if (!name || !lightConfig || !darkConfig) {
      return res.status(400).json({
        success: false,
        error: 'Nome e configurações de tema são obrigatórios'
      });
    }

    if (!validateThemeConfig(lightConfig) || !validateThemeConfig(darkConfig)) {
      return res.status(400).json({
        success: false,
        error: 'Configurações de tema inválidas'
      });
    }

    // Se for tema padrão, remover flag de outros temas
    if (isDefault) {
      await db.execute(sql`UPDATE custom_themes SET is_default = false`);
    }

    const result = await db.execute(sql`
      INSERT INTO custom_themes (
        name, 
        light_config, 
        dark_config, 
        is_default, 
        user_id
      ) 
      VALUES (${name}, ${JSON.stringify(lightConfig)}, ${JSON.stringify(darkConfig)}, ${isDefault}, ${userId}) 
      RETURNING 
        id, 
        name, 
        light_config as lightConfig,
        dark_config as darkConfig,
        is_default as isDefault,
        user_id as userId,
        created_at as createdAt,
        updated_at as updatedAt
    `);

    res.status(201).json({
      success: true,
      data: result[0],
      message: 'Tema criado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao criar tema:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// PUT /api/themes/:id - Atualizar tema
router.put('/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, lightConfig, darkConfig, isDefault } = req.body as CustomTheme;

    // Verificar se tema existe
    const existingTheme = await db.execute(sql`SELECT id FROM custom_themes WHERE id = ${id}`);
    if (existingTheme.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tema não encontrado'
      });
    }

    // Validações
    if (lightConfig && !validateThemeConfig(lightConfig)) {
      return res.status(400).json({
        success: false,
        error: 'Configuração light inválida'
      });
    }

    if (darkConfig && !validateThemeConfig(darkConfig)) {
      return res.status(400).json({
        success: false,
        error: 'Configuração dark inválida'
      });
    }

    // Se for tema padrão, remover flag de outros temas
    if (isDefault) {
      await db.execute(sql`UPDATE custom_themes SET is_default = false WHERE id != ${id}`);
    }

    // Atualizar tema
    const result = await db.execute(sql`
      UPDATE custom_themes 
      SET 
        name = ${name || sql`name`},
        light_config = ${lightConfig ? JSON.stringify(lightConfig) : sql`light_config`},
        dark_config = ${darkConfig ? JSON.stringify(darkConfig) : sql`dark_config`},
        is_default = ${typeof isDefault === 'boolean' ? isDefault : sql`is_default`},
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING 
        id, 
        name, 
        light_config as lightConfig,
        dark_config as darkConfig,
        is_default as isDefault,
        user_id as userId,
        created_at as createdAt,
        updated_at as updatedAt
    `);

    res.json({
      success: true,
      data: result[0],
      message: 'Tema atualizado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao atualizar tema:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// DELETE /api/themes/:id - Deletar tema
router.delete('/:id', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar se não é o tema padrão
    const theme = await db.execute(sql`SELECT is_default FROM custom_themes WHERE id = ${id}`);
    if (theme.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tema não encontrado'
      });
    }

    if (theme[0].is_default) {
      return res.status(400).json({
        success: false,
        error: 'Não é possível deletar o tema padrão'
      });
    }

    await db.execute(sql`DELETE FROM custom_themes WHERE id = ${id}`);

    res.json({
      success: true,
      message: 'Tema deletado com sucesso'
    });
  } catch (error) {
    console.error('Erro ao deletar tema:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// POST /api/themes/:id/activate - Ativar tema como padrão
router.post('/:id/activate', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar se tema existe
    const theme = await db.execute(sql`SELECT id FROM custom_themes WHERE id = ${id}`);
    if (theme.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tema não encontrado'
      });
    }

    // Remover flag padrão de todos os temas
    await db.execute(sql`UPDATE custom_themes SET is_default = false`);

    // Ativar tema selecionado
    await db.execute(sql`UPDATE custom_themes SET is_default = true WHERE id = ${id}`);

    res.json({
      success: true,
      message: 'Tema ativado como padrão'
    });
  } catch (error) {
    console.error('Erro ao ativar tema:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// POST /api/themes/:id/activate-light - Ativar tema para light mode
router.post('/:id/activate-light', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar se tema existe
    const theme = await db.execute(sql`SELECT id FROM custom_themes WHERE id = ${id}`);
    if (theme.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tema não encontrado'
      });
    }

    // Desativar todos os temas para light mode
    await db.execute(sql`UPDATE custom_themes SET is_active_light = false`);

    // Ativar tema selecionado para light mode
    await db.execute(sql`UPDATE custom_themes SET is_active_light = true WHERE id = ${id}`);

    res.json({
      success: true,
      message: 'Tema ativado para light mode'
    });
  } catch (error) {
    console.error('Erro ao ativar tema para light mode:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// POST /api/themes/:id/activate-dark - Ativar tema para dark mode
router.post('/:id/activate-dark', requireSuperAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Verificar se tema existe
    const theme = await db.execute(sql`SELECT id FROM custom_themes WHERE id = ${id}`);
    if (theme.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Tema não encontrado'
      });
    }

    // Desativar todos os temas para dark mode
    await db.execute(sql`UPDATE custom_themes SET is_active_dark = false`);

    // Ativar tema selecionado para dark mode
    await db.execute(sql`UPDATE custom_themes SET is_active_dark = true WHERE id = ${id}`);

    res.json({
      success: true,
      message: 'Tema ativado para dark mode'
    });
  } catch (error) {
    console.error('Erro ao ativar tema para dark mode:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// GET /api/themes/active/light - Buscar tema ativo para light mode (PÚBLICO)
router.get('/active/light', async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT 
        id, 
        name, 
        light_config as lightConfig,
        dark_config as darkConfig,
        is_default as isDefault,
        is_active_light as isActiveLight,
        is_active_dark as isActiveDark,
        created_at as createdAt,
        updated_at as updatedAt
      FROM custom_themes 
      WHERE is_active_light = true
      LIMIT 1
    `);

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Nenhum tema ativo para light mode'
      });
    }

    res.json({
      success: true,
      data: result[0]
    });
  } catch (error) {
    console.error('Erro ao buscar tema ativo para light mode:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// GET /api/themes/active/dark - Buscar tema ativo para dark mode (PÚBLICO)
router.get('/active/dark', async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT 
        id, 
        name, 
        light_config as lightConfig,
        dark_config as darkConfig,
        is_default as isDefault,
        is_active_light as isActiveLight,
        is_active_dark as isActiveDark,
        created_at as createdAt,
        updated_at as updatedAt
      FROM custom_themes 
      WHERE is_active_dark = true
      LIMIT 1
    `);

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Nenhum tema ativo para dark mode'
      });
    }

    res.json({
      success: true,
      data: result[0]
    });
  } catch (error) {
    console.error('Erro ao buscar tema ativo para dark mode:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

// GET /api/themes/active/current - Buscar tema ativo atual
router.get('/active/current', async (req, res) => {
  try {
    const result = await db.execute(sql`
      SELECT 
        id, 
        name, 
        light_config as lightConfig,
        dark_config as darkConfig,
        is_default as isDefault,
        created_at as createdAt,
        updated_at as updatedAt
      FROM custom_themes 
      WHERE is_default = true
      LIMIT 1
    `);

    if (result.length === 0) {
      // Retornar tema padrão hardcoded
      const defaultTheme = {
        name: 'Padrão Magen',
        lightConfig: {
          background: '0 0% 98%',
          foreground: '240 10% 3.9%',
          primary: '255 100% 70%',
          primaryForeground: '0 0% 98%',
          secondary: '157 100% 50%',
          secondaryForeground: '0 0% 9%',
          muted: '240 4.8% 95.9%',
          mutedForeground: '240 3.8% 46.1%',
          accent: '240 4.8% 95.9%',
          accentForeground: '240 5.9% 10%',
          border: '240 5.9% 90%',
          card: '0 0% 100%',
          cardForeground: '240 10% 3.9%',
          destructive: '0 84.2% 60.2%',
          destructiveForeground: '0 0% 98%',
        },
        darkConfig: {
          background: '240 10% 3.9%',
          foreground: '0 0% 98%',
          primary: '255 100% 70%',
          primaryForeground: '0 0% 98%',
          secondary: '157 100% 50%',
          secondaryForeground: '0 0% 9%',
          muted: '240 3.7% 15.9%',
          mutedForeground: '240 5% 64.9%',
          accent: '240 3.7% 15.9%',
          accentForeground: '0 0% 98%',
          border: '240 3.7% 15.9%',
          card: '240 10% 3.9%',
          cardForeground: '0 0% 98%',
          destructive: '0 62.8% 30.6%',
          destructiveForeground: '0 0% 98%',
        },
        isDefault: true
      };

      return res.json({
        success: true,
        data: defaultTheme
      });
    }

    res.json({
      success: true,
      data: result[0]
    });
  } catch (error) {
    console.error('Erro ao buscar tema ativo:', error);
    res.status(500).json({
      success: false,
      error: 'Erro interno do servidor'
    });
  }
});

export default router;