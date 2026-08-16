# Plano de Implementação - Sistema SaaS com Super Admin

## Análise Atual do Sistema

### Status Atual
- ✅ Sistema básico funcionando (usuários, carteiras, transações, lembretes)
- ✅ Isolamento de dados por usuário implementado
- ✅ Categorias globais e personalizadas funcionando
- ✅ Cálculo dinâmico de saldo implementado
- ❌ Falta sistema de níveis de usuário (normal vs super admin)
- ❌ Falta funcionalidade de personificação
- ❌ Falta criação automatizada de usuários de teste

## PARTE 1: Estrutura Base e Autenticação

### 1.1 Modificações no Schema de Banco de Dados
**Arquivo:** `shared/schema.ts`

**Alterações necessárias:**
- Adicionar campo `tipo_usuario` na tabela `users`
  - Valores: 'normal' | 'super_admin'
  - Default: 'normal'
- Adicionar campo `ativo` na tabela `users` (para controle de acesso)
- Adicionar tabela `user_sessions_admin` para controle de personificação
  - `id`, `super_admin_id`, `target_user_id`, `data_inicio`, `data_fim`, `ativo`

**Complexidade:** Média
**Tempo estimado:** 2-3 horas
**Riscos:** Migração de dados existentes

### 1.2 Atualização do Sistema de Autenticação
**Arquivos:** 
- `server/middleware/auth.middleware.ts`
- `server/controllers/auth.controller.ts`

**Alterações necessárias:**
- Modificar middleware de autenticação para suportar personificação
- Adicionar verificação de tipo de usuário
- Implementar lógica de "assumir identidade" para super admin
- Criar endpoint `/api/auth/impersonate/:userId` (apenas super admin)
- Criar endpoint `/api/auth/stop-impersonation` (retornar à identidade original)
- Adicionar logs de auditoria para personificação

**Complexidade:** Alta
**Tempo estimado:** 4-5 horas
**Riscos:** Quebra de autenticação existente, falhas de segurança

### 1.3 Criação de Usuários de Teste e Super Admin
**Arquivo:** `server/scripts/create-users.js` (novo)

**Funcionalidades:**
- Script para criar 3 usuários normais de teste
- Criação do super admin
- Definição de senhas padrão
- Criação automática de carteiras
- Inserção de dados de exemplo (opcional)

**Usuários a criar:**
1. `usuario1@teste.com` - senha: user123 (normal)
2. `usuario2@teste.com` - senha: user123 (normal)  
3. `usuario3@teste.com` - senha: user123 (normal)
4. `admin@sistema.com` - senha: admin123 (super_admin)

**Complexidade:** Baixa
**Tempo estimado:** 1-2 horas
**Riscos:** Baixo

---

## PARTE 2: Interface de Administração

### 2.1 Dashboard Administrativo
**Arquivos:**
- `client/src/pages/admin/` (nova pasta)
- `client/src/pages/admin/dashboard.tsx` (novo)
- `client/src/pages/admin/users.tsx` (novo)

**Funcionalidades:**
- Visão geral do sistema (total de usuários, transações, etc.)
- Lista de todos os usuários do sistema
- Botão "Personificar" para cada usuário
- Indicador visual quando em modo de personificação
- Estatísticas gerais do SaaS

**Complexidade:** Média
**Tempo estimado:** 3-4 horas
**Riscos:** Performance com muitos usuários

### 2.2 Sistema de Personificação na Interface
**Arquivos:**
- `client/src/components/admin/ImpersonationBanner.tsx` (novo)
- `client/src/hooks/useImpersonation.ts` (novo)
- `client/src/App.tsx` (modificar)

**Funcionalidades:**
- Banner no topo indicando modo de personificação
- Informações do usuário sendo personificado
- Botão para retornar à identidade original
- Restrições de acesso durante personificação
- Atualização automática do contexto do usuário

**Complexidade:** Média
**Tempo estimado:** 2-3 horas
**Riscos:** Confusão de identidade, vazamento de dados

### 2.3 Controles de Segurança
**Arquivos:**
- `server/middleware/adminAuth.middleware.ts` (novo)
- `server/controllers/admin.controller.ts` (novo)

**Funcionalidades:**
- Middleware específico para rotas administrativas
- Validação de permissões de super admin
- Rate limiting para ações administrativas
- Logs de auditoria detalhados
- Prevenção de auto-personificação

**Complexidade:** Alta
**Tempo estimado:** 3-4 horas
**Riscos:** Falhas de segurança críticas

---

## PARTE 3: Finalização e Validações

### 3.1 Rotas e APIs Administrativas
**Arquivos:**
- `server/routes/admin.routes.ts` (novo)
- `server/controllers/admin.controller.ts`

**Endpoints a criar:**
- `GET /api/admin/users` - Lista todos os usuários
- `POST /api/admin/impersonate/:userId` - Iniciar personificação
- `POST /api/admin/stop-impersonate` - Parar personificação
- `GET /api/admin/stats` - Estatísticas gerais
- `GET /api/admin/audit-log` - Logs de auditoria
- `PATCH /api/admin/users/:id/status` - Ativar/desativar usuário

**Complexidade:** Média
**Tempo estimado:** 2-3 horas
**Riscos:** Exposição de dados sensíveis

### 3.2 Validações e Testes
**Tarefas:**
- Testar isolamento de dados durante personificação
- Validar que super admin não pode acessar dados diretamente
- Verificar logs de auditoria
- Testar permissões e restrições
- Validar criação automática de usuários

**Complexidade:** Média
**Tempo estimado:** 2-3 horas
**Riscos:** Bugs de segurança não detectados

### 3.3 Documentação e Segurança
**Arquivos:**
- `ADMIN.md` (novo) - Manual do administrador
- `SECURITY.md` (novo) - Políticas de segurança
- Atualização do `SISTEMA.md`

**Conteúdo:**
- Como usar o sistema de personificação
- Políticas de segurança e auditoria
- Procedimentos de emergência
- Limites e restrições do sistema
- Melhores práticas

**Complexidade:** Baixa
**Tempo estimado:** 1-2 horas
**Riscos:** Documentação incompleta

---

## Resumo de Riscos e Considerações

### Riscos Críticos
1. **Segurança**: Falhas na personificação podem expor dados de usuários
2. **Performance**: Sistema admin pode impactar performance geral
3. **Auditoria**: Falta de logs adequados pode gerar problemas legais
4. **Isolamento**: Quebra do isolamento multi-tenant

### Mitigações Propostas
1. Testes extensivos em ambiente isolado
2. Logs detalhados de todas as ações administrativas
3. Rate limiting em operações administrativas
4. Validação dupla de permissões
5. Backup automático antes de mudanças críticas

### Tempo Total Estimado
- **Parte 1**: 7-10 horas
- **Parte 2**: 8-11 horas
- **Parte 3**: 5-8 horas
- **Total**: 20-29 horas

### Dependências Externas
- Nenhuma nova dependência externa necessária
- Utiliza tecnologias já presentes no projeto
- Compatível com arquitetura atual

## Próximos Passos
1. Aprovar o plano completo ou por partes
2. Decidir ordem de implementação
3. Definir critérios de aceite para cada parte
4. Estabelecer ambiente de testes isolado
5. Iniciar implementação conforme aprovação