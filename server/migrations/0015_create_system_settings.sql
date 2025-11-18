-- Migration: Criar tabela system_settings para personalização do sistema
-- Data: 2025-01-13
-- Descrição: Permite que Super Admin personalize nome do sistema, slogan, email, etc.

CREATE TABLE IF NOT EXISTS system_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT,
  setting_metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índice para buscas rápidas por chave
CREATE INDEX IF NOT EXISTS idx_system_settings_key ON system_settings(setting_key);

-- Comentários para documentação
COMMENT ON TABLE system_settings IS 'Armazena configurações globais personalizáveis do sistema';
COMMENT ON COLUMN system_settings.setting_key IS 'Chave única identificadora da configuração';
COMMENT ON COLUMN system_settings.setting_value IS 'Valor da configuração em texto';
COMMENT ON COLUMN system_settings.setting_metadata IS 'Metadados adicionais (tipo, label, validação, etc)';

-- Inserir configurações padrão
INSERT INTO system_settings (setting_key, setting_value, setting_metadata) VALUES
  ('system_name', 'FinanceHub', '{"type": "text", "label": "Nome do Sistema", "description": "Nome exibido em todo o sistema"}'),
  ('system_name_short', 'financehub', '{"type": "text", "label": "Nome Curto", "description": "Versão curta usada em emails e URLs (lowercase)"}'),
  ('system_tagline', 'Gestão financeira inteligente e moderna', '{"type": "text", "label": "Slogan/Tagline", "description": "Frase descritiva do sistema"}'),
  ('support_email', 'suporte@financehub.com', '{"type": "email", "label": "Email de Suporte", "description": "Email de contato do suporte"}'),
  ('system_url', 'https://financehub.com', '{"type": "url", "label": "URL do Sistema", "description": "URL principal do sistema"}'),
  ('system_description', 'FinanceHub - Gerencie suas finanças pessoais com uma interface moderna e futurista. Acompanhe receitas, despesas e tenha controle total do seu dinheiro.', '{"type": "textarea", "label": "Descrição do Sistema", "description": "Descrição para SEO e meta tags"}')
ON CONFLICT (setting_key) DO NOTHING;

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_system_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_system_settings_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_system_settings_updated_at();
