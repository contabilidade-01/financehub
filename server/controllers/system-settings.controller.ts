import { Request, Response } from "express";
import postgres from "postgres";

// Criar cliente postgres para queries SQL
const getClient = () => postgres(process.env.DATABASE_URL || '', { prepare: false });

/**
 * GET /api/system/settings
 * Busca todas as configurações do sistema (rota pública)
 */
export async function getSystemSettings(req: Request, res: Response) {
  const client = getClient();

  try {
    const result = await client`
      SELECT setting_key, setting_value, setting_metadata
      FROM system_settings
      ORDER BY setting_key
    `;

    // Transformar array em objeto para facilitar acesso no frontend
    const settings: Record<string, any> = {};
    result.forEach((row) => {
      settings[row.setting_key] = {
        value: row.setting_value,
        metadata: row.setting_metadata
      };
    });

    res.json({
      success: true,
      data: settings
    });
  } catch (error) {
    console.error("[SystemSettings] Erro ao buscar configurações:", error);
    res.status(500).json({
      success: false,
      error: "Erro ao buscar configurações do sistema"
    });
  } finally {
    await client.end();
  }
}

/**
 * PUT /api/admin/system/settings
 * Atualiza configurações do sistema (apenas Super Admin)
 */
export async function updateSystemSettings(req: Request, res: Response) {
  const client = getClient();

  try {
    const updates = req.body;

    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({
        success: false,
        error: "Dados inválidos. Envie um objeto com as configurações."
      });
    }

    // Validações específicas
    const validations = {
      system_name: (value: string) => {
        if (!value || value.trim().length === 0) {
          return "Nome do sistema não pode estar vazio";
        }
        if (value.length > 100) {
          return "Nome do sistema deve ter no máximo 100 caracteres";
        }
        return null;
      },
      system_name_short: (value: string) => {
        if (!value || value.trim().length === 0) {
          return "Nome curto não pode estar vazio";
        }
        if (!/^[a-z0-9_-]+$/.test(value)) {
          return "Nome curto deve conter apenas letras minúsculas, números, - e _";
        }
        if (value.length > 50) {
          return "Nome curto deve ter no máximo 50 caracteres";
        }
        return null;
      },
      support_email: (value: string) => {
        if (!value || value.trim().length === 0) {
          return "Email de suporte não pode estar vazio";
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(value)) {
          return "Email de suporte inválido";
        }
        return null;
      },
      system_url: (value: string) => {
        if (!value || value.trim().length === 0) {
          return "URL do sistema não pode estar vazia";
        }
        try {
          new URL(value);
          return null;
        } catch {
          return "URL do sistema inválida";
        }
      },
      system_tagline: (value: string) => {
        if (value && value.length > 200) {
          return "Slogan deve ter no máximo 200 caracteres";
        }
        return null;
      },
      system_description: (value: string) => {
        if (value && value.length > 500) {
          return "Descrição deve ter no máximo 500 caracteres";
        }
        return null;
      }
    };

    // Validar todas as configurações recebidas
    for (const [key, value] of Object.entries(updates)) {
      if (validations[key as keyof typeof validations]) {
        const error = validations[key as keyof typeof validations](value as string);
        if (error) {
          return res.status(400).json({
            success: false,
            error,
            field: key
          });
        }
      }
    }

    // Atualizar cada configuração
    const updatePromises = Object.entries(updates).map(([key, value]) => {
      return client`
        UPDATE system_settings
        SET setting_value = ${value}, updated_at = NOW()
        WHERE setting_key = ${key}
        RETURNING setting_key, setting_value
      `;
    });

    const results = await Promise.all(updatePromises);

    // Verificar se todas as atualizações foram bem-sucedidas
    const updatedSettings: Record<string, string> = {};
    results.forEach((result) => {
      if (result.length > 0) {
        const row = result[0];
        updatedSettings[row.setting_key] = row.setting_value;
      }
    });

    console.log("[SystemSettings] Configurações atualizadas:", Object.keys(updatedSettings));

    res.json({
      success: true,
      message: "Configurações atualizadas com sucesso",
      data: updatedSettings
    });
  } catch (error) {
    console.error("[SystemSettings] Erro ao atualizar configurações:", error);
    res.status(500).json({
      success: false,
      error: "Erro ao atualizar configurações do sistema"
    });
  } finally {
    await client.end();
  }
}

/**
 * GET /api/admin/system/settings/:key
 * Busca uma configuração específica (opcional)
 */
export async function getSystemSetting(req: Request, res: Response) {
  const client = getClient();

  try {
    const { key } = req.params;

    const result = await client`
      SELECT setting_key, setting_value, setting_metadata
      FROM system_settings
      WHERE setting_key = ${key}
    `;

    if (result.length === 0) {
      return res.status(404).json({
        success: false,
        error: "Configuração não encontrada"
      });
    }

    const setting = result[0];
    res.json({
      success: true,
      data: {
        key: setting.setting_key,
        value: setting.setting_value,
        metadata: setting.setting_metadata
      }
    });
  } catch (error) {
    console.error("[SystemSettings] Erro ao buscar configuração:", error);
    res.status(500).json({
      success: false,
      error: "Erro ao buscar configuração"
    });
  } finally {
    await client.end();
  }
}
