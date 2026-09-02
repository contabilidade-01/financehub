-- Migração para criar tabela de temas customizados
-- Arquivo: create_custom_themes_table.sql

CREATE TABLE IF NOT EXISTS custom_themes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  light_config JSONB NOT NULL,
  dark_config JSONB NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_custom_themes_user_id ON custom_themes(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_themes_is_default ON custom_themes(is_default);
CREATE INDEX IF NOT EXISTS idx_custom_themes_created_at ON custom_themes(created_at);

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_custom_themes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_custom_themes_updated_at_trigger
    BEFORE UPDATE ON custom_themes
    FOR EACH ROW
    EXECUTE FUNCTION update_custom_themes_updated_at();

-- Inserir tema padrão se não existir
INSERT INTO custom_themes (
  name, 
  light_config, 
  dark_config, 
  is_default
) 
SELECT 
  'Padrão Khesef',
  '{
    "background": "0 0% 98%",
    "foreground": "240 10% 3.9%", 
    "primary": "255 100% 70%",
    "primaryForeground": "0 0% 98%",
    "secondary": "157 100% 50%",
    "secondaryForeground": "0 0% 9%",
    "muted": "240 4.8% 95.9%",
    "mutedForeground": "240 3.8% 46.1%",
    "accent": "240 4.8% 95.9%",
    "accentForeground": "240 5.9% 10%",
    "border": "240 5.9% 90%",
    "card": "0 0% 100%",
    "cardForeground": "240 10% 3.9%",
    "destructive": "0 84.2% 60.2%",
    "destructiveForeground": "0 0% 98%"
  }',
  '{
    "background": "240 10% 3.9%",
    "foreground": "0 0% 98%",
    "primary": "255 100% 70%",
    "primaryForeground": "0 0% 98%",
    "secondary": "157 100% 50%",
    "secondaryForeground": "0 0% 9%",
    "muted": "240 3.7% 15.9%",
    "mutedForeground": "240 5% 64.9%",
    "accent": "240 3.7% 15.9%",
    "accentForeground": "0 0% 98%",
    "border": "240 3.7% 15.9%",
    "card": "240 10% 3.9%",
    "cardForeground": "0 0% 98%",
    "destructive": "0 62.8% 30.6%",
    "destructiveForeground": "0 0% 98%"
  }',
  true
WHERE NOT EXISTS (
  SELECT 1 FROM custom_themes WHERE is_default = true
);

-- Comentários da tabela
COMMENT ON TABLE custom_themes IS 'Tabela para armazenar temas customizados do sistema';
COMMENT ON COLUMN custom_themes.id IS 'ID único do tema';
COMMENT ON COLUMN custom_themes.user_id IS 'ID do usuário que criou o tema (null para temas do sistema)';
COMMENT ON COLUMN custom_themes.name IS 'Nome descritivo do tema';
COMMENT ON COLUMN custom_themes.light_config IS 'Configuração de cores para modo claro (JSON)';
COMMENT ON COLUMN custom_themes.dark_config IS 'Configuração de cores para modo escuro (JSON)';
COMMENT ON COLUMN custom_themes.is_default IS 'Se este é o tema padrão ativo do sistema';
COMMENT ON COLUMN custom_themes.created_at IS 'Data de criação do tema';
COMMENT ON COLUMN custom_themes.updated_at IS 'Data da última atualização do tema';