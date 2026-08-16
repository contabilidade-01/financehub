# Regras e Hierarquia de Usuários

## Visão Geral

Este documento define as regras de negócio e a hierarquia para o gerenciamento de usuários no sistema de controle financeiro pessoal.

## Estados de Usuário

### 1. Usuário Ativo
- **Definição**: `ativo = TRUE`
- **Características**:
  - Possui acesso completo ao sistema
  - Pode realizar transações
  - Assinatura válida e funcional
  - Status de assinatura: `'ativa'`

### 2. Usuário Inativo
- **Definição**: `ativo = FALSE`
- **Características**:
  - Acesso bloqueado ao sistema
  - Não pode realizar novas transações
  - Assinatura expirada ou desativada por administrador
  - Pode ter dados históricos preservados

### 3. Usuário Cancelado
- **Definição**: `status_assinatura = 'cancelada'` OU `data_cancelamento IS NOT NULL`
- **Características**:
  - Solicitou cancelamento da assinatura
  - Pode continuar ativo até o fim do período pago
  - Possui informações de cancelamento (data e motivo)

## Combinações de Estados

### Estado 1: Ativo + Não Cancelado
```
ativo = TRUE
status_assinatura = 'ativa'
data_cancelamento = NULL
motivo_cancelamento = NULL
```
- **Descrição**: Usuário com assinatura ativa e plena
- **Acesso**: Total ao sistema
- **Aba Admin**: "Usuários Ativos"

### Estado 2: Ativo + Cancelado
```
ativo = TRUE
status_assinatura = 'cancelada'
data_cancelamento = NOT NULL
motivo_cancelamento = NOT NULL
```
- **Descrição**: Usuário que cancelou mas ainda tem período ativo
- **Acesso**: Total ao sistema (até data de expiração)
- **Aba Admin**: "Cancelados"
- **Observação**: Assinatura será desativada em data futura

### Estado 3: Inativo + Não Cancelado
```
ativo = FALSE
status_assinatura = 'ativa' ou 'expirada'
data_cancelamento = NULL
motivo_cancelamento = NULL
```
- **Descrição**: Usuário desativado por admin ou assinatura expirada
- **Acesso**: Bloqueado
- **Aba Admin**: "Inativos"

### Estado 4: Inativo + Cancelado
```
ativo = FALSE
status_assinatura = 'cancelada'
data_cancelamento = NOT NULL
motivo_cancelamento = NOT NULL
```
- **Descrição**: Usuário que cancelou e já teve acesso bloqueado
- **Acesso**: Bloqueado
- **Aba Admin**: "Cancelados"
- **Observação**: Período ativo expirou após cancelamento

## Hierarquia de Exibição nas Abas

### Aba "Usuários Ativos"
- Critério: `ativo = TRUE AND (status_assinatura != 'cancelada' AND data_cancelamento IS NULL)`
- Usuários com acesso pleno e assinatura não cancelada

### Aba "Cancelados"
- Critério: `status_assinatura = 'cancelada' OR data_cancelamento IS NOT NULL`
- Usuários que solicitaram cancelamento (independente se ainda ativos)

### Aba "Inativos"
- Critério: `ativo = FALSE AND (status_assinatura != 'cancelada' AND data_cancelamento IS NULL)`
- Usuários bloqueados sem histórico de cancelamento

## Fluxos de Transição

### Cancelamento de Assinatura
```
Estado Inicial: Ativo + Não Cancelado
↓
Ação: Usuário solicita cancelamento
↓
Estado Intermediário: Ativo + Cancelado
↓
Ação: Período pago expira
↓
Estado Final: Inativo + Cancelado
```

### Reativação de Usuário Cancelado
```
Estado Inicial: Ativo/Inativo + Cancelado
↓
Ação: Toggle para ativo pelo admin
↓
Limpeza automática:
- status_assinatura = 'ativa'
- data_cancelamento = NULL
- motivo_cancelamento = NULL
↓
Estado Final: Ativo + Não Cancelado
```

### Desativação por Administrador
```
Estado Inicial: Ativo + Não Cancelado
↓
Ação: Admin desativa usuário
↓
Estado Final: Inativo + Não Cancelado
```

## Regras de Negócio

### 1. Limpeza de Dados de Cancelamento
- Ao reativar um usuário cancelado, os campos de cancelamento devem ser limpos automaticamente
- Campos afetados: `status_assinatura`, `data_cancelamento`, `motivo_cancelamento`

### 2. Precedência de Exibição
- Um usuário cancelado sempre aparece na aba "Cancelados", independente do status ativo
- A aba "Cancelados" tem precedência sobre "Ativos" e "Inativos"

### 3. Proteção de Dados
- Dados históricos de transações são preservados independente do status
- Informações de cancelamento são mantidas até reativação manual

### 4. Validações do Sistema
- Super admin não pode se desativar
- Usuário cancelado pode ser reativado apenas por admin/super_admin
- Alteração de status sempre gera log no sistema

## Campos da Tabela Usuarios

### Campos de Status
- `ativo`: BOOLEAN - Define se usuário tem acesso ao sistema
- `status_assinatura`: VARCHAR - Estado da assinatura ('ativa', 'cancelada', 'expirada')
- `data_cancelamento`: TIMESTAMP - Data do cancelamento (NULL se não cancelado)
- `motivo_cancelamento`: TEXT - Motivo informado no cancelamento

### Campos Informativos
- `data_cadastro`: TIMESTAMP - Data de criação da conta
- `ultimo_acesso`: TIMESTAMP - Último login no sistema
- `tipo_usuario`: VARCHAR - Tipo de conta ('usuario', 'admin', 'super_admin')

## Exemplos Práticos

### Cenário 1: Usuário Premium Ativo
```sql
SELECT nome, ativo, status_assinatura, data_cancelamento 
FROM usuarios 
WHERE id = 1;

-- Resultado:
-- nome: "João Silva"
-- ativo: TRUE
-- status_assinatura: "ativa"
-- data_cancelamento: NULL
-- Aba: "Usuários Ativos"
```

### Cenário 2: Usuário que Cancelou (ainda ativo)
```sql
SELECT nome, ativo, status_assinatura, data_cancelamento 
FROM usuarios 
WHERE id = 2;

-- Resultado:
-- nome: "Maria Santos"
-- ativo: TRUE
-- status_assinatura: "cancelada"
-- data_cancelamento: "2024-06-01 10:30:00"
-- Aba: "Cancelados"
```

### Cenário 3: Usuário Cancelado e Expirado
```sql
SELECT nome, ativo, status_assinatura, data_cancelamento 
FROM usuarios 
WHERE id = 3;

-- Resultado:
-- nome: "Pedro Costa"
-- ativo: FALSE
-- status_assinatura: "cancelada"
-- data_cancelamento: "2024-05-15 14:20:00"
-- Aba: "Cancelados"
```

---

**Última atualização**: 03 de Junho de 2025  
**Versão**: 1.0