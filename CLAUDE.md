# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Khesef by XPIRIA** — SaaS completo de gestão financeira pessoal (PF) e empresarial (PJ). Sistema multi-tenant com autenticação, pagamentos via Asaas, WhatsApp via UazAPI/WAHA, e automações que substituíram N8N por pipeline interno.

## Essential Commands

### Development
```bash
npm run dev                    # Servidor dev (tsx + Vite HMR)
npm run build                  # Build produção (Vite + esbuild)
npm run start                  # Rodar build de produção
npm run check                  # TypeScript type-check (tsc)
```

### Database
```bash
npm run db:push                # Push schema Drizzle para o banco (com confirmação)
npm run db:seed                # Seed de dados globais (categorias, formas de pagamento)
npm run start:migration        # Migration inicial do sistema
```

### Localization
```bash
npm run migrate:localization   # Migrar strings de localização
npm run verify:localization    # Verificar consistência de locales
npm run import:locale          # Importar arquivo de locale
```

### Testing (baterias CI)
```bash
npm run test:meio              # Testar parser de meio de pagamento
npm run test:parcelamento      # Testar parser de parcelamento
npm run test:classificacao     # Testar classificação PJ por IA
npm run test:feature-flags     # Testar sistema de feature flags
npm run test:backup            # Testar serviço de backup
npm run flags:auditar          # Auditar uso de feature flags no código
npm run flags:check-literals   # Verificar flags sem literais hardcoded
```

### Admin
```bash
npm run superadmin:reset-pass  # Reset senha do superadmin
```

## Architecture

### Stack
- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS + Radix UI + Wouter (routing)
- **Backend**: Node.js + Express + TypeScript + PostgreSQL + Drizzle ORM
- **Real-time**: WebSocket (ws) para notificações
- **Payments**: Asaas (gateway brasileiro)
- **WhatsApp**: UazAPI (gateway principal) + WAHA (legado)
- **Email**: Nodemailer (SMTP)
- **Validation**: Zod + drizzle-zod

### Directory Structure

```
/
├── client/src/              # Frontend React
│   ├── pages/               # Páginas por rota (admin, dashboard, transactions, pj/, etc.)
│   ├── components/          # Componentes reutilizáveis (shared/, ui/)
│   ├── hooks/               # Custom hooks (use-auth, use-localization, etc.)
│   └── lib/                 # Utilitários frontend
│
├── server/                  # Backend Express
│   ├── controllers/         # Handlers de rotas (45+ controllers)
│   ├── services/            # Lógica de negócio (35+ services)
│   ├── middleware/          # Auth, security, localization, admin
│   ├── migrations/          # Migrações manuais e auto-migrate
│   ├── routes.ts            # Registro central de todas as rotas
│   ├── storage.ts           # Interface IStorage + implementação Drizzle
│   ├── db.ts                # Conexão Drizzle ORM
│   ├── websocket.ts         # Servidor WebSocket
│   └── index.ts             # Entrypoint (carrega .env, setup Express, startup)
│
├── shared/                  # Código compartilhado client/server
│   └── schema.ts            # Schema Drizzle + tipos Zod (PF + PJ)
│
├── scripts/                 # Scripts de teste e utilitários
├── docs/                    # Documentação (40+ arquivos .md)
├── legacy/                  # Scripts históricos (não usados em produção)
├── locales/                 # Arquivos de tradução (pt-br, en-us, etc.)
└── migrations/              # Migrações SQL manuais
```

### Key Architectural Patterns

#### Authentication & Authorization
- **Session-based**: express-session + connect-pg-simple (PostgreSQL store)
- **API tokens**: Autenticação via header `Authorization: Bearer <token>` para integrações
- **Combined auth**: Middleware `combinedAuth` aceita cookie OU API token
- **Roles**: `super_admin`, `admin`, `normal` — verificado via `requireSuperAdmin`
- **Impersonation**: Super admin pode acessar como outro usuário (`checkImpersonation`)

#### Database Layer
- **Drizzle ORM**: Schema em `shared/schema.ts`, queries em `server/storage.ts`
- **Dual access**: Alguns controllers usam Drizzle (`db.select()`), outros usam `postgres` direto (tagged templates)
- **Multi-tenancy**: Todas as queries filtram por `usuario_id` (exceto super admin)
- **PF vs PJ**: Tabelas separadas (`transactions` vs `empresas_transacoes`), isoladas por design

#### Routing Pattern
Todas as rotas registradas em `server/routes.ts`:
```typescript
// Público
app.get("/api/subscription-plans", controller.handler);

// Autenticado (cookie ou API key)
app.get("/api/transactions", combinedAuth, checkImpersonation, controller.handler);

// Admin only
app.get("/api/admin/users", combinedAuth, requireSuperAdmin, controller.handler);

// Webhook externo (sem auth, validação interna)
app.post("/api/webhooks/asaas", asaasWebhookController.handleAsaasWebhook);
app.post("/api/webhook/uazapi", uazapiWebhookController.handleUazapiWebhook);
```

#### Feature Flags
- Sistema interno substitui N8N para automações
- Admin em `/admin/feature-flags`
- Ciclo: 30 dias → limpar código → aposentar
- Verificar: `npm run flags:auditar` antes de commitar

#### WhatsApp Integration (UazAPI)
- **Webhook inbound**: `POST /api/webhook/uazapi` recebe mensagens do WhatsApp
- **Pipeline interno**: IA classifica intenção → executa ação (criar transação, consultar saldo, etc.)
- **Outbound**: `server/services/uazapi.service.ts` envia mensagens via UazAPI
- **Simulador**: `/admin/simular-whatsapp` (apenas homologação com `SIMULADOR_WHATSAPP=true`)

#### Payments (Asaas)
- **Webhook**: `POST /api/webhooks/asaas` processa eventos de pagamento
- **Service**: `server/services/asaas.service.ts` encapsula API do Asaas
- **Checkout**: Interno (autenticado) e externo (link público)

### Environment Variables

Arquivo `.env.example` na raiz. Variáveis críticas:

```env
# Obrigatórias
DATABASE_URL=postgresql://user:pass@host:5432/db
BASE_URL=https://app.controledinheiro.com.br
SESSION_SECRET=<chave_256_chars>

# Asaas (pagamentos)
ASAAS_ENVIRONMENT=production|sandbox
ASAAS_API_KEY=<key>
ASAAS_WEBHOOK_SECRET=<secret>

# UazAPI (WhatsApp)
UAZAPI_BASE_URL=https://nescon.uazapi.com
UAZAPI_TOKEN=<token>

# Email (SMTP)
SMTP_HOST=smtp.provider.com
SMTP_USER=<user>
SMTP_PASS=<pass>

# IA (pipeline WhatsApp)
OPENAI_API_KEY=<key>
GEMINI_API_KEY=<key>

# Homologação
SIMULADOR_WHATSAPP=true  # apenas em homologação
```

### Deployment

#### Branches
- `financehub` — integração + homologação (EasyPanel)
- `producao` — produção (merge só com CI verde)

#### CI Pipeline
`.github/workflows/ci.yml` roda em push/PR:
1. TypeScript baseline check (não pode subir erros)
2. Feature flags sem literais
3. Build completo
4. Baterias de teste (14 scripts `test:*`)

#### EasyPanel
- Docker Compose em `docker-compose.portainer.yml`
- Variáveis de ambiente no painel (nunca commitar `.env`)
- Health check: `GET /api/health` retorna versão e commit

### Common Workflows

#### Adding a New Feature
1. Criar controller em `server/controllers/`
2. Adicionar service se necessário em `server/services/`
3. Registrar rotas em `server/routes.ts` com middleware apropriado
4. Atualizar schema em `shared/schema.ts` se houver novas tabelas
5. Criar página frontend em `client/src/pages/`
6. Adicionar testes em `scripts/testar-*.ts` se for lógica crítica
7. Rodar `npm run check` antes de commitar

#### Working with Feature Flags
```typescript
import { isFeatureEnabled } from '../services/feature-flags.service';

if (await isFeatureEnabled('nova_funcionalidade', userId)) {
  // novo código
}
```
- Nunca hardcode flag names — use constantes
- Rodar `npm run flags:check-literals` no CI

#### Database Migrations
- **Schema changes**: Editar `shared/schema.ts` → `npm run db:push`
- **Data migrations**: Criar script em `server/migrations/` → rodar manualmente
- **Never**: Alterar tabelas existentes sem migration aditiva (rollback não desfaz schema)

### Important Constraints

1. **Timezone**: Sempre `America/Sao_Paulo` — usar `getSaoPauloTimestamp()` do schema
2. **Multi-tenancy**: Toda query PF deve filtrar por `usuario_id` (exceto super admin)
3. **PF/PJ isolation**: Nunca misturar tabelas `transactions` (PF) com `empresas_transacoes` (PJ)
4. **No N8N**: Pipeline WhatsApp é 100% interno via UazAPI webhook + IA
5. **Session storage**: PostgreSQL via connect-pg-simple (não usar memory store em produção)
6. **File uploads**: Multer configura destino baseado em `NODE_ENV` (public/ vs dist/public/)

### Testing Strategy

- **Unit tests**: Scripts em `scripts/testar-*.ts` rodam sem banco (lógica pura)
- **Integration tests**: Não há framework de teste — validação manual via endpoints
- **CI gates**: TypeScript baseline + build + 14 baterias de teste
- **Manual testing**: Simulador WhatsApp em homologação (`/admin/simular-whatsapp`)

### Documentation

- `docs/` contém 40+ arquivos de documentação histórica e guias
- `docs/feature-flags.md` — ciclo de vida de feature flags
- `docs/PJ_README.md` — módulo pessoa jurídica
- `docs/HANDOFF-ASAAS-2026-09-03.md` — handoff recente de integrações
- `README.md` — visão geral do sistema (manter atualizado)

### Troubleshooting

#### 401 errors após restart
- Normal no startup — frontend faz chamadas antes do login
- Verificar se sessão PostgreSQL está funcionando (`connect-pg-simple`)

#### WhatsApp não responde
- Verificar `UAZAPI_TOKEN` e `UAZAPI_BASE_URL` no EasyPanel
- Checar logs do webhook `/api/webhook/uazapi`
- Em homologação, usar simulador `/admin/simular-whatsapp`

#### Build falha com "out of memory"
- CI já usa `NODE_OPTIONS: --max_old_space_size=4096`
- Localmente: `set NODE_OPTIONS=--max_old_space_size=4096 && npm run build`

#### TypeScript errors
- Rodar `npm run check` para ver erros
- Baseline em `baseline-tsc.txt` — não pode subir contagem de erros
- Se adicionar erro novo, corrigir antes de commitar

## Notes for AI Assistants

- Este é um sistema em produção ativa — mudanças requerem cuidado
- Sempre rodar `npm run check` antes de sugerir commit
- Feature flags são obrigatórias para funcionalidades novas
- Nunca commitar `.env` — credenciais ficam no EasyPanel
- PF e PJ são módulos separados — não misturar lógica
- UazAPI substituiu N8N — não sugerir webhooks externos para automações
- Timezone São Paulo é crítico — usar helpers do schema
- Multi-tenancy é via `usuario_id` em todas as queries PF