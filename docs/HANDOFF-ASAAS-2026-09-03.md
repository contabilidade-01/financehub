# Handoff — FinanceHub / Pulso (o que fizemos)

**Data do arquivo:** 3 de setembro de 2026  
**App em produção:** https://app.controledinheiro.com.br  
**Painel:** EasyPanel (VPS). **Só implanta a branch `financehub`.**  
**Banco ativo:** Pulso Financeiro (`DATABASE_URL` no `.env` / EasyPanel).

Conversas usadas neste handoff (histórico Cursor deste repo + chats ligados):

| Chat | Quando | O que cobriu |
|------|--------|----------------|
| [Pagamento Asaas e degustação](8cce5d26-ba4c-48e1-b3ca-8f64294e98e2) | 3 set 2026 | Esta thread: ligar cobrança Asaas, hosted checkout, renovar, CPF, deploy |
| [Onboarding WhatsApp / cadastro](2cdfd05f-e5ed-4776-9093-4e238518acf8) | 2–3 set 2026 | Degustação, WhatsApp, senha, PF/PJ, MEI, auto-login |
| [Importação de lançamentos](d60c6be1-fed8-4e7b-a0a7-8a4b073791bf) | 30 ago 2026 | Planilha PF (contas a pagar + cartões) |
| [Calculadora / comando de voz](e194029e-7a96-4a3d-be3f-b149b2243f9f) | 31 ago 2026 | Pergunta se o app aceita voz e lança valores — **não implementamos voz nesta thread** |
| Tentativas curtas Asaas | 3 set 2026 | `6b0f056b`, `9927f60c`, `cbc04ab2` + clouds `bc-f40624e9`, `bc-80038955` — mesmo pedido, sem trabalho extra |

Chats antigos do workspace (análise do repo, anti-ban SEFAZ, etc.) **não** são deste produto Pulso / `financehub` atual.

---

## 1. O que já existia no código (antes desta sessão)

A integração Asaas **já estava escrita**, não do zero:

| Peça | Onde |
|------|------|
| API Asaas | `server/services/asaas.service.ts` |
| Assinaturas | `server/services/subscription.service.ts` |
| Webhook | `server/controllers/asaas-webhook.controller.ts` |
| Billing / checkout cartão | `server/controllers/billing.controller.ts` |
| Admin planos | `/admin/billing` |
| Admin assinaturas | `/admin/assinaturas` |
| Checkout próprio (cartão no nosso site) | `/checkout/plans`, `/billing/checkout` |
| Degustação 15 dias | onboarding WhatsApp + `data_expiracao_assinatura` |
| Docs | `docs/ASAAS_INTEGRATION.md` |

O que **não** estava no ar / não fechava o fluxo seguro:

- Variáveis Asaas no EasyPanel (só no `.env` local).
- Cobrança na **página do Asaas** (cartão passava pelo nosso site).
- Botão **Renovar** do cliente gerando cobrança de verdade.
- CPF/CNPJ exigido pelo Asaas na criação da cobrança.
- Deploy: push em `cursor/*` **não** publicava.

---

## 2. O que fizemos nesta conversa (Asaas)

### 2.1 Configuração (sem código)

1. Confirmamos que a lógica Asaas já existia.
2. Ambiente: usuário já tinha API Key; colocamos no `.env` local e no EasyPanel:
   - `ASAAS_ENVIRONMENT=production` (usuário escolheu testar real com a própria conta)
   - `ASAAS_API_KEY` (produção, `$aact_prod_...`)
   - `ASAAS_WEBHOOK_SECRET` = senha nossa, **não** vem do Asaas; tem que ser a mesma no webhook
3. Webhook no painel Asaas: `https://app.controledinheiro.com.br/api/webhooks/asaas`
4. Plano criado no admin `/admin/billing` (código `mensal`, preço mensal do usuário).
5. Migration local de billing **falhou** (senha do `DATABASE_URL` local ≠ servidor). Em produção o app já rodava; tabelas de billing existiam (plano foi criado no admin).
6. Auto-migrate passou a **criar** as tabelas Asaas no boot (`subscription_plans`, `asaas_customers`, `user_subscriptions`, `payment_transactions`, `asaas_webhooks`).

### 2.2 Decisão de produto

- **Não** coletar cartão no nosso site.
- Enviar ao Asaas o que já temos (nome, e-mail, telefone, CNPJ se PJ).
- Cliente completa no Asaas: cartão / Pix / boleto.
- **CPF/CNPJ é obrigatório na API** para criar a cobrança — por isso a tela de renovar pede o documento **antes**. Cartão e Pix continuam no Asaas.

### 2.3 Código publicado (commits na `financehub`)

| Commit | O que faz |
|--------|-----------|
| `4a91d97` | Checkout `/checkout/plans` funciona logado; token em query (não quebra na URL); remove campo inexistente `gracePeriodEndsAt`; auto-migrate das tabelas billing |
| `4fc0ee7` | Skill/regra: EasyPanel **sempre** implanta `financehub` |
| `f59d417` | Hosted checkout: **Gerar link** cria assinatura Asaas `UNDEFINED` e devolve `invoiceUrl` |
| `c6478e6` | Tela `/subscription/renew` + `POST /api/billing/renew-link` (mesmo fluxo do admin) |
| `bfa90f7` | Campo CPF/CNPJ na renovação; texto i18n atualizado |

### 2.4 Fluxo ponta a ponta (como ficou)

```
Cliente logado (degustação vencida)
  → overlay "Acesso restrito" → Renovar Assinatura
  → /subscription/renew → CPF/CNPJ → Pagar no Asaas
  → POST /api/billing/renew-link  (usa req.user.id)
  → createHostedCheckout:
       cliente Asaas + assinatura pending + payment_transaction
  → redirect invoiceUrl (asaas.com)
  → cliente paga
  → webhook PAYMENT_CONFIRMED / PAYMENT_RECEIVED
  → activateUserSubscription:
       status ativa, data_expiracao_assinatura += ciclo
       NÃO troca senha
```

Admin (mesmo backend): **Assinaturas → Definir → Gerar link de cobrança**.  
Não clicar **Ativar manual** (libera sem pagar).

Acesso no app = `data_expiracao_assinatura` no futuro. Admin/super_admin nunca expira.

### 2.5 Problemas que apareceram e o que resolveram

| Sintoma | Causa | Resolução |
|---------|--------|-----------|
| 404 no link de cobrança | `/checkout/plans` só existia deslogado | Rota pública sempre |
| Acesso negado / token | Token na path + query `gracePeriodEndsAt` | Query `?token=` + query só `status=active` |
| Link ainda abria nosso site | EasyPanel na `financehub` antiga | Merge + push `financehub` |
| `IP não autorizado` | Whitelist Asaas | IP da VPS = `195.35.17.155` (já cadastrado). Terminal: `node -e "fetch('https://api.ipify.org')..."` (sem `curl`) |
| Link 404 do Asaas `/customerConfigIntegrations/apiAccessControl` | URL antiga | Menu logado: nome → Integrações → Mecanismos de segurança |
| Asaas exige CPF/CNPJ | API não cria cobrança sem documento | Campo na tela de renovar |
| Deploy “certo” mas commit antigo (MEI) | Push só em `cursor/*` | Regra: sempre merge `financehub` |

### 2.6 Deploy / EasyPanel

- Skill: `.cursor/skills/deploy-easypanel/SKILL.md`
- Regra always-on: `.cursor/rules/deploy-easypanel.mdc`
- **Sempre:** merge na `financehub` + `git push origin financehub` + conferir o **commit** no log do EasyPanel.
- Build do `bfa90f7` (CPF) subiu com sucesso (avisos de CSS/chunk; não quebram).

IP de saída da VPS (whitelist Asaas): **195.35.17.155**.

Webhook secret (EasyPanel e Asaas iguais; não é a API Key). Valor que usamos na sessão está no `.env` / EasyPanel — **não repetir em docs públicos**.

---

## 3. Como testar

1. EasyPanel mostrando o commit mais novo (`bfa90f7` ou posterior).
2. Personificar um usuário **vencido** (admin nunca vê o overlay).
3. **Renovar Assinatura** → CPF/CNPJ → **Pagar no Asaas**.
4. Pagar na página do Asaas.
5. Voltar ao app (F5 / login). Overlay some se o webhook chegou.
6. Admin → Assinaturas: situação **Em dia**.

URL direta da tela: https://app.controledinheiro.com.br/subscription/renew

---

## 4. Preço (cálculos desta conversa)

Meta com **30 clientes**:

| Bruto / mês | Preço / cliente / mês |
|-------------|------------------------|
| R$ 3.000 | R$ 100,00 |
| R$ 2.500 | ~R$ 83,90 |

Com **50 clientes**:

| Bruto / mês | Preço / cliente / mês |
|-------------|------------------------|
| R$ 2.500 | R$ 50,00 |
| R$ 3.000 | R$ 60,00 |

Líquido: descontar ~3% Asaas (cartão). O plano no `/admin/billing` é o **preço mensal**; trimestral ×3, anual ×12.

---

## 5. Trabalho recente no mesmo repo (outras conversas + git)

Ordem cronológica do que está na `financehub` (últimas semanas), cruzando chats e `git log`.

### 5.1 Importação PF — [Transaction schema migration](d60c6be1-fed8-4e7b-a0a7-8a4b073791bf) (30 ago)

- Pipeline de importação de planilha (contas a pagar + cartões automáticos).
- Commits: `55b4759`, `b6d6b75`, `e21791e`, `0a52510`, `e99c7e2`.
- Exemplo em `docs/importacao/`. Cartões nominais **não** vão para “Cartão de Crédito” genérico.

### 5.2 Onboarding WhatsApp + senha — [WebSocket session management](2cdfd05f-e5ed-4776-9093-4e238518acf8) (2–3 set)

A conversa começou com logs de WebSocket/admin; o trabalho real foi cadastro e degustação:

| Commit | O quê |
|--------|--------|
| `211e8e1` | Cadastro WhatsApp travava no e-mail (“erro inesperado”) |
| `37f9806` | Admin “liberar conta” **envia** o acesso (era stub) |
| `8717e50` | Auto-cadastro entrega **link** de criar senha (não senha temporária) |
| `dbfb386` | Auto-login depois de criar a senha (cai no painel) |
| `e11a6d9` | `status_assinatura` VARCHAR(50) — WhatsApp gravava status > 20 chars |
| `cbc287c` | Cadastro conclui no formulário web; status curtos se o ALTER não tivesse ido |
| `1cc1dcc` | Formulário escolhe PF ou PJ (degustação e painel certos) |
| `357a08b` | Botão WhatsApp no cadastro + dados PJ (razão social, CNPJ) |
| `602a01d` | MEI no regime; remove Lucro Real — era o commit no EasyPanel **antes** do Asaas |

Degustação de 15 dias **já estava ok** quando pedimos para ligar o pagamento.

### 5.3 Outros commits já na branch (sem chat longo desta pasta)

- `29e2288` — rebrand Magen → Khesef (nome interno; produção é Pulso / controledinheiro).
- `3ee2fd3` — alertas só em horário comercial (1×/dia 9h).
- `773e60e` — fluxo de caixa projetado PF/PJ + logo.
- `c673543` / `96a18fd` — filtros de período, tipografia financeira.
- `324b8a2` — “Minha Assinatura” reconhece degustação (fim do “Sem Assinatura” falso).
- `9901e12` / `284b677` — metas PF/PJ isoladas + correção IDOR.

### 5.4 Voz — [Calculadora de custo](e194029e-7a96-4a3d-be3f-b149b2243f9f)

Perguntamos se o FinanceHub aceita comando de voz e lança valores. Foi **exploração**, não entrega de feature de voz neste repo.

---

## 6. O que ainda **não** está feito

- Cliente **não volta sozinho** do Asaas para o app (sem `successUrl` / callback). Precisa reabrir o app.
- Admin **Gerar link** para PF sem CPF/CNPJ no cadastro ainda pode falhar na API (a tela de renovar do cliente já pede o documento).
- Não há job que, no dia 15, crie a cobrança sozinha e mande WhatsApp. Hoje: overlay + botão, ou admin gera o link.
- Checkout antigo com cartão no nosso site (`/checkout/plans`) ainda existe; o fluxo oficial passou a ser a fatura Asaas.
- Teste real ponta a ponta (pagar 1 cobrança e ver webhook + data de expiração) — validar no painel Asaas e em Assinaturas.
- Preço do plano em `/admin/billing` ainda é o que o usuário cadastrou; não foi alterado pelos cálculos de R$ 50–100.

---

## 7. Arquivos-chave do fluxo novo

- `server/services/subscription.service.ts` — `createHostedCheckout`, `activateUserSubscription`
- `server/controllers/billing.controller.ts` — `createRenewLink`
- `server/controllers/admin.controller.ts` — `gerarLinkCobranca`
- `server/controllers/asaas-webhook.controller.ts` — confirmação sem resetar senha
- `client/src/pages/subscription/renew.tsx`
- `client/src/pages/admin/assinaturas.tsx`
- `client/src/App.tsx` — overlay some em `/subscription/renew`

---

## 8. Próximo passo sugerido

1. Confirmar no EasyPanel o commit `bfa90f7`.
2. Fazer **um pagamento real de teste** com usuário vencido.
3. Conferir webhook no Asaas + usuário **Em dia** no admin.
4. Se quiser: callback de retorno ao app + pedido de CPF no fluxo **admin gerar link**.
