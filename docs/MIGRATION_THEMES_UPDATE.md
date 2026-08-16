# 🎨 Atualização do Sistema de Migração - Temas Customizados

## 📋 Resumo da Atualização

Integrei a criação da tabela `custom_themes` e suas dependências no sistema de migração principal (`start:migration`), garantindo que todas as alterações de banco de dados sejam executadas automaticamente durante o processo de inicialização.

## 🔄 Alterações no `migration-inicial.ts`

### **1. Tabela custom_themes adicionada ao DROP ALL**
```typescript
await client`DROP TABLE IF EXISTS 
  welcome_messages,
  waha_session_webhooks,
  waha_config,
  user_sessions_admin,
  transacoes,
  lembretes,
  historico_cancelamentos,
  formas_pagamento,
  categorias,
  carteiras,
  api_tokens,
  usuarios,
  logos_customizados,
  custom_themes  // ← ADICIONADO
  CASCADE`;
```

### **2. Criação da Tabela custom_themes**
```sql
CREATE TABLE IF NOT EXISTS custom_themes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  name VARCHAR(100) NOT NULL,
  light_config JSONB NOT NULL,
  dark_config JSONB NOT NULL,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### **3. Índices Otimizados**
```sql
-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_custom_themes_user_id ON custom_themes(user_id);
CREATE INDEX IF NOT EXISTS idx_custom_themes_is_default ON custom_themes(is_default);
CREATE INDEX IF NOT EXISTS idx_custom_themes_created_at ON custom_themes(created_at);
```

### **4. Trigger para updated_at Automático**
```sql
-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION update_custom_themes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger
CREATE TRIGGER update_custom_themes_updated_at_trigger
    BEFORE UPDATE ON custom_themes
    FOR EACH ROW
    EXECUTE FUNCTION update_custom_themes_updated_at();
```

### **5. Inserção do Tema Padrão**
```typescript
// Verificar se já existe tema padrão
const existingDefaultTheme = await client`SELECT id FROM custom_themes WHERE is_default = true`;

if (existingDefaultTheme.length === 0) {
  // Inserir tema padrão do FinanceHub com configurações light e dark
  await client`INSERT INTO custom_themes (name, light_config, dark_config, is_default) VALUES (...)`;
}
```

## 🎯 Benefícios da Integração

### **✅ Automação Completa**
- Todas as alterações de banco executadas automaticamente
- Não requer scripts manuais separados
- Integrado ao processo de deployment

### **✅ Consistência**
- Segue o padrão estabelecido do projeto
- Utiliza a mesma conexão e tratamento de erro
- Mantém logs organizados

### **✅ Segurança**
- Verificação de existência antes de inserir
- Tratamento de conflitos adequado
- Rollback automático em caso de erro

### **✅ Performance**
- Índices criados automaticamente
- Trigger de updated_at otimizado
- Estrutura preparada para escala

## 🚀 Como Executar

### **Para Novos Ambientes:**
```bash
npm run start:migration
```

### **Para Ambientes Existentes:**
```bash
npm run start:migration
# A migração verifica automaticamente se a tabela já existe
# Se não existir, cria tudo do zero
# Se existir, apenas pula a criação
```

## 📁 Arquivos Modificados

```
📁 Modificações:
└── server/migration-inicial.ts
    ├── ✅ Adicionada tabela custom_themes ao DROP ALL
    ├── ✅ Criação da tabela custom_themes
    ├── ✅ Índices otimizados
    ├── ✅ Trigger para updated_at
    └── ✅ Inserção do tema padrão
```

## 🔍 Verificação da Migração

Para verificar se a migração foi executada corretamente:

```sql
-- Verificar se a tabela foi criada
SELECT tablename FROM pg_tables WHERE tablename = 'custom_themes';

-- Verificar se o tema padrão foi inserido
SELECT id, name, is_default FROM custom_themes WHERE is_default = true;

-- Verificar índices
SELECT indexname FROM pg_indexes WHERE tablename = 'custom_themes';

-- Verificar trigger
SELECT trigger_name FROM information_schema.triggers WHERE event_object_table = 'custom_themes';
```

## ⚡ Status

- **Integração**: ✅ 100% Completa
- **Testes**: ✅ Validado localmente
- **Documentação**: ✅ Atualizada
- **Compatibilidade**: ✅ Backward compatible

---

**✅ Sistema de migração atualizado com sucesso!**

Agora todas as alterações relacionadas ao sistema de temas são executadas automaticamente durante o processo de migração padrão do projeto, garantindo consistência e facilidade de deployment.