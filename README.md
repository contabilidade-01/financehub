# FinanceHub by XPIRIA

Sistema SaaS completo de gestão financeira pessoal e empresarial.

---

## Funcionalidades

### Gestão Financeira
- **Transações** - Registro de receitas e despesas com categorização
- **Carteiras** - Múltiplas contas/carteiras por usuário
- **Categorias** - Categorias globais e personalizadas com cores e ícones
- **Formas de Pagamento** - PIX, Cartão de Crédito, Débito, Boleto, Dinheiro, Transferência
- **Status de Transações** - Pendente, Efetivada, Agendada, Cancelada

### Dashboard e Relatórios
- **Dashboard** - Visão consolidada de receitas, despesas e saldo
- **Gráficos** - Pizza e barras para análise visual (SVG e PNG)
- **Relatórios PDF** - Exportação de relatórios simples e detalhados
- **Análise por Período** - Diário, semanal, mensal e anual
- **Comparativos** - Mês anterior e ano anterior

### Calendário e Lembretes
- **Lembretes** - Agendamento de compromissos financeiros
- **Calendário** - Visualização de eventos e vencimentos
- **Notificações** - Alertas de lembretes
- **Timezone** - Suporte a America/Sao_Paulo

### Usuários e Permissões
- **Multi-tenancy** - Isolamento de dados por usuário
- **Roles** - Super Admin e Usuário comum
- **Impersonação** - Super Admin pode acessar como outro usuário para suporte
- **Auditoria** - Logs de todas as ações importantes

### Integrações

#### Asaas (Gateway de Pagamento)
- Pagamentos recorrentes
- Cartão de crédito, boleto e PIX
- Webhooks automáticos
- Gestão de assinaturas e faturas
- Retry de pagamentos falhados

#### WAHA (WhatsApp HTTP API)
- Envio de notificações via WhatsApp
- Gerenciamento de sessões
- QR Code para autenticação
- Webhooks por sessão

#### N8N (Automações)
- Integração com workflows N8N
- Webhooks de ativação de usuários
- Automação de processos de onboarding

### Planos e Assinaturas
- **Planos** - Diferentes níveis de acesso com limites configuráveis
- **Checkout** - Processo de pagamento integrado (autenticado e externo)
- **Gestão de Assinaturas** - Cancelamento, upgrade, histórico de faturas
- **Dashboard Admin de Billing** - MRR, churn, métricas de pagamento

### API REST
- **Tokens de API** - Autenticação via tokens com rotação
- **Swagger** - Documentação interativa em `/api-docs`
- **130+ Endpoints** - API completa para integrações

### Personalização
- **Temas** - Light e Dark mode com cores customizáveis
- **Logos** - Upload de logos por tema (SVG e PNG)
- **Mensagens** - Boas-vindas e notificações personalizáveis com template tags
- **Multi-idioma** - Suporte a PT-BR, EN-US, ES, FR, DE, IT

### Administração (Super Admin)
- **Gestão de Usuários** - CRUD completo, ativar/desativar, reset de dados
- **Configurações do Sistema** - Nome, tagline, URL, email de suporte
- **Analytics** - Métricas de uso e engajamento
- **Manutenção** - Ferramentas de diagnóstico e correção

---

## Requisitos

- Node.js 18+
- PostgreSQL 14+
- npm ou yarn

---

## Instalação

### 1. Instalar dependências
```bash
npm install
```

### 2. Configurar variáveis de ambiente
Crie o arquivo `.env` na raiz do projeto (veja seção abaixo).

### 3. Executar migration inicial
```bash
npm run start:migration
```

### 4. Executar seed de dados globais
```bash
npm run db:seed
```

### 5. Configurar localização
```bash
npm run migrate:localization
npm run verify:localization
```

### 6. Iniciar o servidor

**Desenvolvimento:**
```bash
npm run dev
```

**Produção:**
```bash
npm run build
npm run start
```

---

## Arquivo .env

```env
# Setup inicial (true apenas na primeira execução com wizard)
SETUP=false

# Localização padrão
DEFAULT_LOCALE=pt-br

# Banco de dados (obrigatório)
DATABASE_URL=postgresql://usuario:senha@host:5432/banco

# URL base do sistema
BASE_URL=https://seu-dominio.com

# Webhook de ativação (N8N)
WEBHOOK_ATIVACAO_URL=https://seu-dominio.com/webhook/ativacao

# Asaas - Gateway de Pagamento
ASAAS_ENVIRONMENT=production
ASAAS_API_KEY=sua_api_key_asaas
ASAAS_WEBHOOK_SECRET=seu_webhook_secret

# Email
EMAIL_FROM=noreply@seu-dominio.com
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu-email@gmail.com
SMTP_PASS=sua-senha-de-app

# Sessão (gere uma string segura)
SESSION_SECRET=sua_chave_secreta_muito_segura_256_caracteres

# Ambiente e Timezone
NODE_ENV=production
TZ=America/Sao_Paulo
PORT=5000

# Redis (opcional - para cache)
REDIS_URL=redis://localhost:6379
```

---

## Scripts Disponíveis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Inicia em modo desenvolvimento |
| `npm run build` | Build para produção |
| `npm run start` | Inicia em produção |
| `npm run start:migration` | Executa migração inicial |
| `npm run db:push` | Push do schema para o banco |
| `npm run db:seed` | Seed de dados globais |
| `npm run migrate:localization` | Migração de localização |
| `npm run verify:localization` | Verifica localização |
| `npm run import:locale` | Importa locales |
| `npm run import:locale:list` | Lista locales disponíveis |
| `npm run superadmin:reset-pass` | Reset de senha do superadmin |

---

## Tecnologias

### Frontend
- React 18, TypeScript, Vite
- TailwindCSS, Radix UI, Shadcn/ui
- React Hook Form, TanStack Query
- Recharts, Framer Motion
- Wouter (roteamento)

### Backend
- Node.js, Express, TypeScript
- PostgreSQL, Drizzle ORM
- JWT, Bcrypt, Passport
- Zod (validação)
- Multer (upload de arquivos)
- WebSocket (tempo real)

### Integrações
- Asaas (pagamentos)
- WAHA (WhatsApp)
- N8N (automações)

---

## Créditos

### Idealização e Desenvolvimento
**Bruno D. Afonso**
XPIRIA Co-Founder
bruno@xpiria.com.br

### Integração N8N - Revisão e Melhorias
**Pedro**
XPIRIA Co-Founder
pedro@xpiria.com.br

---

## Contato

Para mais informações:

- **WhatsApp:** [(41) 98503-7379](https://wa.me/5541985037379)
- **Formulário:** [https://xpiria.dev](https://xpiria.dev)

---

## Licença

MIT License - XPIRIA AI SOLUTIONS © 2025
