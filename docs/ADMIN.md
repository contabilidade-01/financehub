# Manual do Administrador - FinanceHub SaaS

## Visão Geral

O FinanceHub é uma plataforma SaaS de gestão financeira pessoal com sistema administrativo avançado que permite gerenciamento completo de usuários, monitoramento de sistema e suporte através de personificação de usuários.

## Recursos Administrativos

### 1. Dashboard Administrativo
- **Localização**: `/admin/dashboard`
- **Funcionalidades**:
  - Estatísticas em tempo real do sistema
  - Gráficos de crescimento de usuários
  - Métricas de transações e volume financeiro
  - Status de saúde do sistema
  - Distribuição de tipos de usuário

### 2. Sistema de Personificação
O sistema permite que super administradores personifiquem usuários para fornecer suporte técnico.

#### Como Personificar um Usuário
1. No cabeçalho administrativo, clique no badge "Super Admin"
2. Uma modal de pesquisa será aberta
3. Digite o nome ou email do usuário desejado
4. Clique em "Personificar" ao lado do usuário
5. Você será redirecionado para o dashboard do usuário

#### Indicadores de Personificação
- O cabeçalho administrativo mostra "Personificando: [Nome do Usuário]"
- Todas as ações são registradas nos logs de auditoria
- O usuário personificado não é notificado da sessão

#### Encerrando Personificação
- Use o endpoint `POST /api/admin/stop-impersonation`
- Ou faça logout do sistema
- A sessão é automaticamente encerrada após inatividade

### 3. Gerenciamento de Usuários

#### Visualizar Usuários
- **Endpoint**: `GET /api/admin/users`
- **Informações Disponíveis**:
  - Dados pessoais (nome, email)
  - Status ativo/inativo
  - Tipo de usuário (normal/super_admin)
  - Número de transações
  - Último acesso
  - Data de cadastro

#### Ativar/Desativar Usuários
- **Endpoint**: `PATCH /api/admin/users/:id/status`
- **Payload**: `{ "ativo": true/false }`
- **Restrições**: Não é possível desativar super administradores

### 4. Logs de Auditoria

#### Acessar Logs
- **Endpoint**: `GET /api/admin/audit-log`
- **Parâmetros**:
  - `limit`: Número máximo de logs (padrão: 50)
  - `offset`: Número de logs para pular (padrão: 0)

#### Informações nos Logs
- ID da sessão de personificação
- Super admin responsável
- Usuário alvo da personificação
- Data/hora de início
- Data/hora de fim (se encerrada)
- Status da ação

### 5. Estatísticas do Sistema

#### Métricas Disponíveis
- **Total de Usuários**: Usuários registrados no sistema
- **Usuários Ativos**: Usuários com status ativo
- **Total de Transações**: Transações processadas
- **Total de Carteiras**: Carteiras criadas
- **Saúde do Sistema**: Status geral da aplicação

## Tipos de Usuário

### Super Administrador
- **Privilégios**:
  - Acesso completo ao sistema administrativo
  - Pode personificar qualquer usuário normal
  - Visualizar todos os dados de auditoria
  - Ativar/desativar usuários
  - Acessar estatísticas globais

### Usuário Normal
- **Privilégios**:
  - Acesso apenas aos próprios dados
  - Gestão de transações pessoais
  - Criação de categorias personalizadas
  - Gerenciamento de lembretes
  - Acesso à API via tokens

## Segurança e Auditoria

### Isolamento de Dados
- Cada usuário tem acesso apenas aos próprios dados
- Carteiras, transações e lembretes são isolados por usuário
- Categorias globais são compartilhadas entre todos os usuários

### Logs de Auditoria
- Todas as sessões de personificação são registradas
- Logs incluem timestamps precisos
- Identificação completa dos usuários envolvidos
- Rastreamento de ações administrativas

### Controle de Acesso
- Middleware de autenticação em todas as rotas
- Verificação de tipo de usuário para rotas administrativas
- Proteção contra acesso não autorizado
- Sistema de sessões seguro

## Endpoints da API Administrativa

### Autenticação Requerida
Todos os endpoints administrativos requerem:
1. Autenticação válida (sessão ou API key)
2. Tipo de usuário "super_admin"
3. Headers apropriados

### Lista de Endpoints

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/admin/stats` | Estatísticas do sistema |
| GET | `/api/admin/users` | Lista todos os usuários |
| POST | `/api/admin/impersonate` | Iniciar personificação |
| POST | `/api/admin/stop-impersonation` | Parar personificação |
| PATCH | `/api/admin/users/:id/status` | Ativar/desativar usuário |
| GET | `/api/admin/audit-log` | Logs de auditoria |

## Monitoramento e Manutenção

### Indicadores de Saúde
- **Sistema**: Status OK/Error
- **Database**: Conectividade e performance
- **API**: Disponibilidade dos endpoints
- **Usuários**: Taxa de ativação e engajamento

### Métricas de Performance
- Tempo de resposta das APIs
- Volume de transações por período
- Crescimento de base de usuários
- Utilização de recursos

### Alertas e Notificações
- Falhas de sistema são logadas
- Erros de autenticação são monitorados
- Sessões de personificação são auditadas
- Atividades suspeitas são registradas

## Boas Práticas

### Para Administradores
1. **Use personificação apenas quando necessário** para suporte
2. **Documente o motivo** de cada sessão de personificação
3. **Encerre sessões** imediatamente após resolver problemas
4. **Monitore logs regularmente** para atividades anômalas
5. **Mantenha credenciais seguras** e não compartilhe acesso

### Para Suporte
1. **Solicite permissão** antes de personificar usuários
2. **Limite o escopo** da investigação ao problema reportado
3. **Não modifique dados** sem autorização explícita
4. **Registre ações tomadas** durante a sessão
5. **Respeite a privacidade** dos dados do usuário

## Solução de Problemas

### Problemas Comuns
1. **Erro 401 - Não autenticado**: Verificar sessão ou API key
2. **Erro 403 - Acesso negado**: Confirmar tipo de usuário super_admin
3. **Erro 404 - Usuário não encontrado**: Verificar ID do usuário
4. **Falha na personificação**: Verificar se usuário está ativo

### Contatos de Suporte
- **Suporte Técnico**: suporte@financehub.com
- **Emergências**: admin@financehub.com
- **Documentação**: /docs (Swagger UI)

---

**Versão**: 1.0  
**Última Atualização**: 27/05/2025  
**Responsável**: Equipe de Desenvolvimento FinanceHub