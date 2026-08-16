# Sistema de Controle Financeiro - Modelo SaaS

## Visão Geral

Este sistema é uma aplicação de controle financeiro pessoal desenvolvida para operar no modelo SaaS (Software as a Service), onde cada usuário possui seus próprios dados isolados e controles específicos.

## Hierarquia e Relacionamentos do Sistema

### 1. Usuários
- **Descrição**: Entidade principal do sistema
- **Características**:
  - Cada usuário é independente e isolado
  - Possui autenticação própria (email/senha)
  - Acesso restrito apenas aos seus próprios dados

### 2. Carteiras
- **Relacionamento**: `1 Usuário : 1 Carteira`
- **Características**:
  - Cada usuário possui **exatamente uma carteira**
  - A carteira é criada automaticamente no primeiro acesso
  - Nome padrão: "Principal"
  - **Saldo calculado dinamicamente**: Soma de todas as receitas menos todas as despesas
  - Não é possível ter múltiplas carteiras por usuário

### 3. Categorias

#### 3.1 Categorias Globais
- **Características**:
  - Definidas pelo sistema
  - **Somente leitura** para todos os usuários
  - Não podem ser editadas, alteradas ou excluídas pelos usuários
  - Visíveis para todos os usuários
  - Exemplos: Alimentação, Transporte, Saúde, etc.

#### 3.2 Categorias Personalizadas
- **Relacionamento**: `1 Usuário : N Categorias Personalizadas`
- **Características**:
  - Criadas pelo próprio usuário
  - Visíveis apenas para o usuário criador
  - Podem ser editadas e excluídas pelo usuário
  - Complementam as categorias globais

#### 3.3 Exibição de Categorias
- **Regra**: As categorias são exibidas de forma unificada
- **Composição**: Categorias Globais + Categorias Personalizadas do usuário
- **Ordenação**: Globais primeiro, depois personalizadas

### 4. Tipos de Transação
- **Características**:
  - **Valores fixos e globais**: "Receita" e "Despesa"
  - **Somente leitura** para todos os usuários
  - Não podem ser alterados, modificados ou excluídos
  - Aplicam-se a todas as transações do sistema

### 5. Transações
- **Relacionamento**: `1 Carteira : N Transações`
- **Relacionamento**: `1 Categoria : N Transações`
- **Relacionamento**: `1 Tipo : N Transações`

#### 5.1 Características das Transações
- **Obrigatórias**:
  - Devem estar vinculadas a uma carteira
  - Devem ter uma categoria (global ou personalizada)
  - Devem ter um tipo (Receita ou Despesa)
  - Devem ter um valor monetário
  - Devem ter uma data

- **Opcionais**:
  - Descrição
  - Método de pagamento
  - Status (Efetivada, Pendente, Agendada, Cancelada)

#### 5.2 Regras de Negócio
- **Toda transação** deve estar atrelada a uma categoria
- A categoria pode ser global ou personalizada do usuário
- O tipo é obrigatório e deve ser "Receita" ou "Despesa"
- O valor impacta diretamente no saldo da carteira

### 6. Lembretes
- **Relacionamento**: `1 Usuário : N Lembretes`
- **Características**:
  - Vinculados diretamente ao usuário
  - Independentes de carteiras ou transações
  - Podem ter data e hora específicas
  - Status de conclusão (concluído/pendente)
  - Suporte a timezone (America/Sao_Paulo)

## Fluxo de Dados

### Cálculo do Saldo da Carteira
```
Saldo = Σ(Receitas) - Σ(Despesas)
```
- **Receitas**: Todas as transações do tipo "Receita"
- **Despesas**: Todas as transações do tipo "Despesa"
- **Período**: Considera TODAS as transações da carteira (histórico completo)

### Isolamento de Dados (Multi-tenancy)
- **Usuário A** vê apenas:
  - Sua carteira
  - Suas transações
  - Suas categorias personalizadas + globais
  - Seus lembretes

- **Usuário B** vê apenas:
  - Sua carteira
  - Suas transações  
  - Suas categorias personalizadas + globais
  - Seus lembretes

## Restrições e Permissões

### O que o usuário PODE fazer:
- ✅ Criar, editar e excluir suas próprias transações
- ✅ Criar, editar e excluir suas categorias personalizadas
- ✅ Criar, editar e excluir seus lembretes
- ✅ Visualizar categorias globais
- ✅ Atualizar informações de sua carteira (nome, descrição)

### O que o usuário NÃO PODE fazer:
- ❌ Criar carteiras adicionais
- ❌ Editar/excluir categorias globais
- ❌ Alterar tipos de transação
- ❌ Acessar dados de outros usuários
- ❌ Modificar saldo da carteira diretamente (calculado automaticamente)

## Tecnologias e Arquitetura

### Backend
- **Framework**: Express.js com TypeScript
- **Banco de Dados**: PostgreSQL (via Supabase)
- **ORM**: Drizzle ORM
- **Autenticação**: Session-based + API tokens
- **Validação**: Zod schemas

### Frontend
- **Framework**: React com TypeScript
- **Roteamento**: Wouter
- **Estado**: TanStack Query (React Query)
- **UI**: Tailwind CSS + shadcn/ui
- **Formulários**: React Hook Form + Zod

### Características de SaaS
- **Multi-tenancy**: Isolamento por usuário
- **API Externa**: Tokens de API para integrações
- **Escalabilidade**: Arquitetura preparada para múltiplos usuários
- **Segurança**: Autenticação robusta e controle de acesso

## Considerações para Produção

### Segurança
- Validação de entrada em todas as APIs
- Controle de acesso por sessão e API tokens
- Sanitização de dados
- Rate limiting (recomendado)

### Performance
- Cache inteligente com invalidação automática
- Paginação em listagens grandes
- Índices otimizados no banco de dados
- Consultas otimizadas (evitar N+1)

### Monitoramento
- Logs estruturados para auditoria
- Métricas de uso por usuário
- Alertas de erro e performance
- Backup automático de dados

Este documento serve como referência técnica e de negócio para o desenvolvimento e manutenção do sistema de controle financeiro.