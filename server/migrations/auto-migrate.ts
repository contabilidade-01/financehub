/**
 * Auto-migrate no boot.
 *
 * Garante que o SCHEMA do banco tenha as colunas/tabelas que o código espera —
 * evitando erros como `column "data_vencimento" does not exist` quando uma
 * migração não foi rodada manualmente em produção.
 *
 * Todos os passos são IDEMPOTENTES (IF NOT EXISTS) e ficam isolados: se um
 * falhar, os demais continuam e o boot não é bloqueado.
 *
 * Desative com AUTO_MIGRATE=false se preferir rodar migrações à mão.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

type Step = { name: string; run: () => Promise<void> };

const STEPS: Step[] = [
  {
    name: "transacoes: campos de contas a pagar / fluxo de caixa",
    run: async () => {
      await db.execute(sql`ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS data_vencimento DATE`);
      await db.execute(sql`ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS data_pagamento DATE`);
      await db.execute(sql`ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS recorrente BOOLEAN NOT NULL DEFAULT false`);
      await db.execute(sql`ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS classificacao_despesa VARCHAR(20)`);
      // Agrupamento de parcelas de uma mesma compra
      await db.execute(sql`ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS compra_grupo VARCHAR(40)`);
      await db.execute(sql`ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS parcela_num INTEGER`);
      await db.execute(sql`ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS parcela_total INTEGER`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_transacoes_compra_grupo ON transacoes(compra_grupo)`);
    },
  },
  {
    name: "formas_pagamento: campos de cartão",
    run: async () => {
      await db.execute(sql`ALTER TABLE formas_pagamento ADD COLUMN IF NOT EXISTS limite NUMERIC(12,2)`);
      await db.execute(sql`ALTER TABLE formas_pagamento ADD COLUMN IF NOT EXISTS dia_fechamento INTEGER`);
      await db.execute(sql`ALTER TABLE formas_pagamento ADD COLUMN IF NOT EXISTS dia_vencimento INTEGER`);
      await db.execute(sql`ALTER TABLE formas_pagamento ADD COLUMN IF NOT EXISTS bandeira VARCHAR(50)`);
      await db.execute(sql`ALTER TABLE formas_pagamento ADD COLUMN IF NOT EXISTS ultimos_digitos VARCHAR(4)`);
    },
  },
  {
    name: "metas_financeiras",
    run: async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS metas_financeiras (
          id                SERIAL PRIMARY KEY,
          usuario_id        INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          titulo            VARCHAR(255) NOT NULL,
          tipo              VARCHAR(30) NOT NULL,
          valor_alvo        NUMERIC(12,2) NOT NULL,
          valor_atual       NUMERIC(12,2) NOT NULL DEFAULT 0.00,
          prazo             DATE,
          categoria_id      INTEGER REFERENCES categorias(id),
          recorrencia       VARCHAR(20),
          valor_recorrencia NUMERIC(12,2),
          ativo             BOOLEAN NOT NULL DEFAULT true,
          created_at        TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_metas_usuario_id ON metas_financeiras(usuario_id)`);
    },
  },
  {
    name: "empresas / empresas_contas / empresas_transacoes (PJ)",
    run: async () => {
      await db.execute(sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS tipo_pessoa VARCHAR(20) NOT NULL DEFAULT 'fisica'`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS empresas (
          id              SERIAL PRIMARY KEY,
          usuario_id      INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          razao_social    VARCHAR(255) NOT NULL,
          nome_fantasia   VARCHAR(255),
          cnpj            VARCHAR(20) UNIQUE,
          regime_tributario VARCHAR(50),
          segmento        VARCHAR(50),
          ativo           BOOLEAN NOT NULL DEFAULT true,
          created_at      TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
          updated_at      TIMESTAMPTZ
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS empresas_contas (
          id              SERIAL PRIMARY KEY,
          empresa_id      INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
          codigo          VARCHAR(20) NOT NULL,
          nome            VARCHAR(255) NOT NULL,
          tipo            VARCHAR(10) NOT NULL,
          classificacao   VARCHAR(30) NOT NULL,
          parent_id       INTEGER REFERENCES empresas_contas(id),
          icone           VARCHAR(100),
          cor             VARCHAR(50),
          descricao       TEXT,
          ativo           BOOLEAN NOT NULL DEFAULT true,
          created_at      TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
          UNIQUE(empresa_id, codigo)
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS empresas_transacoes (
          id                   SERIAL PRIMARY KEY,
          empresa_id           INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
          carteira_id          INTEGER REFERENCES carteiras(id),
          categoria_id         INTEGER NOT NULL REFERENCES empresas_contas(id),
          forma_pagamento_id   INTEGER REFERENCES formas_pagamento(id),
          descricao            VARCHAR(255) NOT NULL,
          valor                NUMERIC(12,2) NOT NULL,
          tipo                 VARCHAR(10) NOT NULL,
          data_transacao       DATE NOT NULL,
          data_registro        TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
          status               VARCHAR(20) NOT NULL DEFAULT 'Efetivada',
          metodo_pagamento     VARCHAR(100),
          origem               VARCHAR(20) NOT NULL DEFAULT 'manual'
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_empresas_transacoes_empresa ON empresas_transacoes(empresa_id)`);
    },
  },
  {
    name: "ingestion_events (log de ingestão IA)",
    run: async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS ingestion_events (
          id            SERIAL PRIMARY KEY,
          usuario_id    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
          remote_jid    VARCHAR(255),
          canal         VARCHAR(30) NOT NULL DEFAULT 'whatsapp',
          tipo_mensagem VARCHAR(40),
          mensagem_raw  TEXT,
          resultado     VARCHAR(40) NOT NULL,
          etapa         VARCHAR(40),
          detalhe       TEXT,
          provider      VARCHAR(40),
          data_criacao  TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ingestion_events_resultado ON ingestion_events(resultado)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_ingestion_events_data ON ingestion_events(data_criacao)`);
    },
  },
  {
    name: "conversa_historico + memoria_usuario (agente)",
    run: async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS conversa_historico (
          id           SERIAL PRIMARY KEY,
          usuario_id   INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          role         VARCHAR(12) NOT NULL,
          content      TEXT NOT NULL,
          created_at   TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_conversa_historico_user ON conversa_historico(usuario_id, id)`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS memoria_usuario (
          id            SERIAL PRIMARY KEY,
          usuario_id    INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          tipo          VARCHAR(30) NOT NULL DEFAULT 'merchant_categoria',
          chave         VARCHAR(160) NOT NULL,
          valor         JSONB NOT NULL,
          hits          INTEGER NOT NULL DEFAULT 1,
          created_at    TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
          updated_at    TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
        )
      `);
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS memoria_usuario_uq ON memoria_usuario(usuario_id, tipo, chave)`);
    },
  },
  {
    name: "transacoes_lixeira (backup/undo de exclusoes, por usuario)",
    run: async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS transacoes_lixeira (
          id             SERIAL PRIMARY KEY,
          usuario_id     INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
          carteira_id    INTEGER,
          empresa_id     INTEGER,
          transacao_id   INTEGER,
          dados          JSONB NOT NULL,
          excluida_em    TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
        )
      `);
      // Tabelas criadas em versões antigas não tinham empresa_id (CREATE IF NOT
      // EXISTS não altera tabela existente) — garante a coluna antes do índice.
      await db.execute(sql`ALTER TABLE transacoes_lixeira ADD COLUMN IF NOT EXISTS empresa_id INTEGER`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_lixeira_carteira ON transacoes_lixeira(carteira_id, excluida_em)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_lixeira_empresa ON transacoes_lixeira(empresa_id, excluida_em)`);
    },
  },
  {
    name: "memoria_global (cerebro coletivo agregado, sem dados pessoais)",
    run: async () => {
      // Opt-out do aprendizado coletivo (padrao: participa).
      await db.execute(sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS aprendizado_coletivo BOOLEAN NOT NULL DEFAULT true`);
      // Banco global: SO agregado. Nunca tem usuario_id nem valores/datas.
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS memoria_global (
          id            SERIAL PRIMARY KEY,
          escopo        VARCHAR(4) NOT NULL DEFAULT 'pf',
          chave         VARCHAR(200) NOT NULL,
          resposta      VARCHAR(200) NOT NULL,
          votos         INTEGER NOT NULL DEFAULT 0,
          atualizado_em TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
        )
      `);
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS memoria_global_uq ON memoria_global(escopo, chave)`);
    },
  },
  {
    name: "whatsapp_onboarding_states (estado de onboarding PJ/PF via WhatsApp)",
    run: async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS whatsapp_onboarding_states (
          id             SERIAL PRIMARY KEY,
          remote_jid     VARCHAR(255) NOT NULL UNIQUE,
          usuario_id     INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          current_step   VARCHAR(50) NOT NULL,
          collected_data TEXT NOT NULL,
          updated_at     TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_whatsapp_onboarding_jid ON whatsapp_onboarding_states(remote_jid)`);
    },
  },
  {
    name: "consentimentos_lgpd (registro de aceite p/ prova legal)",
    run: async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS consentimentos_lgpd (
          id          SERIAL PRIMARY KEY,
          usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          versao      VARCHAR(20) NOT NULL,
          aceito_em   TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
          ip          VARCHAR(60),
          user_agent  VARCHAR(400)
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_consent_usuario ON consentimentos_lgpd(usuario_id)`);
    },
  },
  {
    name: "conciliacao bancaria (contas_bancarias, importacoes_extrato, extrato_movimentos)",
    run: async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS contas_bancarias (
          id            SERIAL PRIMARY KEY,
          empresa_id    INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
          usuario_id    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
          banco         VARCHAR(120) NOT NULL,
          agencia       VARCHAR(20),
          numero        VARCHAR(30),
          tipo          VARCHAR(20) NOT NULL DEFAULT 'corrente',
          saldo_inicial NUMERIC(14,2) NOT NULL DEFAULT 0,
          ativo         BOOLEAN NOT NULL DEFAULT true,
          criado_em     TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_contas_banc_empresa ON contas_bancarias(empresa_id)`);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS importacoes_extrato (
          id                    SERIAL PRIMARY KEY,
          empresa_id            INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
          conta_bancaria_id     INTEGER NOT NULL REFERENCES contas_bancarias(id) ON DELETE CASCADE,
          arquivo_nome          VARCHAR(255),
          formato               VARCHAR(10) NOT NULL DEFAULT 'ofx',
          periodo_de            DATE,
          periodo_ate           DATE,
          saldo_final_informado NUMERIC(14,2),
          hash_arquivo          VARCHAR(64),
          status                VARCHAR(15) NOT NULL DEFAULT 'revisao',
          criado_em             TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_import_conta ON importacoes_extrato(conta_bancaria_id)`);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS extrato_movimentos (
          id                SERIAL PRIMARY KEY,
          importacao_id     INTEGER NOT NULL REFERENCES importacoes_extrato(id) ON DELETE CASCADE,
          conta_bancaria_id INTEGER NOT NULL REFERENCES contas_bancarias(id) ON DELETE CASCADE,
          empresa_id        INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
          fitid             VARCHAR(120),
          data              DATE NOT NULL,
          valor             NUMERIC(14,2) NOT NULL,
          tipo              VARCHAR(10) NOT NULL,
          descricao         VARCHAR(255),
          memo              VARCHAR(255),
          status            VARCHAR(12) NOT NULL DEFAULT 'pendente',
          transacao_id      INTEGER,
          conta_contabil_id INTEGER,
          sugestao_conta_id INTEGER,
          sugestao_origem   VARCHAR(20),
          sugestao_confianca INTEGER,
          criado_em         TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
        )
      `);
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS extrato_mov_fitid_uq ON extrato_movimentos(conta_bancaria_id, fitid) WHERE fitid IS NOT NULL`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_extrato_mov_import ON extrato_movimentos(importacao_id, status)`);

      // Ligações da transação PJ com a origem bancária
      await db.execute(sql`ALTER TABLE empresas_transacoes ADD COLUMN IF NOT EXISTS conta_bancaria_id INTEGER`);
      await db.execute(sql`ALTER TABLE empresas_transacoes ADD COLUMN IF NOT EXISTS conciliado BOOLEAN NOT NULL DEFAULT false`);
      await db.execute(sql`ALTER TABLE empresas_transacoes ADD COLUMN IF NOT EXISTS fitid VARCHAR(120)`);
    },
  },
  {
    name: "billing: tabelas Asaas (plans, customers, subscriptions, payments, webhooks)",
    run: async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS subscription_plans (
          id SERIAL PRIMARY KEY,
          plan_code VARCHAR(50) NOT NULL UNIQUE,
          name VARCHAR(100) NOT NULL,
          description TEXT,
          price_monthly DECIMAL(10, 2) NOT NULL,
          features TEXT NOT NULL,
          max_transactions INTEGER DEFAULT 0,
          max_wallets INTEGER DEFAULT 0,
          max_categories INTEGER DEFAULT 0,
          active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
          updated_at TIMESTAMP WITH TIME ZONE
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS asaas_customers (
          id SERIAL PRIMARY KEY,
          usuario_id INTEGER NOT NULL UNIQUE REFERENCES usuarios(id) ON DELETE CASCADE,
          asaas_customer_id VARCHAR(100) NOT NULL UNIQUE,
          cpf_cnpj VARCHAR(18),
          created_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
          updated_at TIMESTAMP WITH TIME ZONE
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS user_subscriptions (
          id SERIAL PRIMARY KEY,
          usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          plan_id INTEGER NOT NULL REFERENCES subscription_plans(id),
          asaas_subscription_id VARCHAR(100) UNIQUE,
          status VARCHAR(50) NOT NULL DEFAULT 'active',
          current_period_start TIMESTAMP WITH TIME ZONE,
          current_period_end TIMESTAMP WITH TIME ZONE,
          canceled_at TIMESTAMP WITH TIME ZONE,
          cancellation_reason TEXT,
          ended_at TIMESTAMP WITH TIME ZONE,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
          updated_at TIMESTAMP WITH TIME ZONE
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS payment_transactions (
          id SERIAL PRIMARY KEY,
          usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          subscription_id INTEGER REFERENCES user_subscriptions(id),
          asaas_payment_id VARCHAR(100) UNIQUE,
          asaas_invoice_url TEXT,
          amount DECIMAL(10, 2) NOT NULL,
          currency VARCHAR(3) NOT NULL DEFAULT 'BRL',
          status VARCHAR(50) NOT NULL DEFAULT 'pending',
          payment_method VARCHAR(50) NOT NULL DEFAULT 'credit_card',
          due_date DATE,
          confirmed_date TIMESTAMP WITH TIME ZONE,
          description TEXT,
          retry_count INTEGER NOT NULL DEFAULT 0,
          metadata TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
          updated_at TIMESTAMP WITH TIME ZONE
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS asaas_webhooks (
          id SERIAL PRIMARY KEY,
          event_type VARCHAR(100) NOT NULL,
          asaas_event_id VARCHAR(100) UNIQUE,
          payload TEXT NOT NULL,
          processed BOOLEAN NOT NULL DEFAULT false,
          processed_at TIMESTAMP WITH TIME ZONE,
          error_message TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
        )
      `);
    },
  },
  {
    name: "usuarios: ciclo_assinatura (mensal/trimestral/anual)",
    run: async () => {
      await db.execute(sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ciclo_assinatura VARCHAR(12)`);
    },
  },
  {
    name: "usuarios: ativação honesta (status_assinatura default + backfill c/ carência)",
    run: async () => {
      // Novos usuários nascem 'sem_assinatura' (não mais 'ativa' por engano).
      await db.execute(sql`ALTER TABLE usuarios ALTER COLUMN status_assinatura SET DEFAULT 'sem_assinatura'`);

      // Admin/superadmin: acesso ilimitado (data bem no futuro).
      await db.execute(sql`
        UPDATE usuarios SET data_expiracao_assinatura = TIMESTAMPTZ '2099-12-31'
        WHERE tipo_usuario IN ('super_admin','admin')
          AND (data_expiracao_assinatura IS NULL OR data_expiracao_assinatura < NOW())
      `);

      // Quem tem assinatura Asaas ativa: alinhar a data ao fim do período.
      await db.execute(sql`
        UPDATE usuarios u SET data_expiracao_assinatura = s.current_period_end, status_assinatura = 'ativa'
        FROM user_subscriptions s
        WHERE s.usuario_id = u.id AND s.status = 'active' AND s.current_period_end IS NOT NULL
          AND (u.data_expiracao_assinatura IS NULL OR u.data_expiracao_assinatura < s.current_period_end)
      `);

      // Carência: usuários ativos SEM data e SEM assinatura real ganham 30 dias
      // (para NÃO bloquear ninguém agora). Vira degustação/cortesia; o admin
      // depois converte em assinatura real, e o job expira no fim.
      await db.execute(sql`
        UPDATE usuarios u SET
          data_expiracao_assinatura = NOW() + INTERVAL '30 days',
          status_assinatura = 'degustacao'
        WHERE u.ativo = true
          AND u.data_expiracao_assinatura IS NULL
          AND u.tipo_usuario NOT IN ('super_admin','admin')
          AND NOT EXISTS (SELECT 1 FROM user_subscriptions s WHERE s.usuario_id = u.id AND s.status = 'active')
      `);

      // Sincroniza o flag denormalizado com a verdade (data futura).
      await db.execute(sql`
        UPDATE usuarios SET subscription_active = (data_expiracao_assinatura IS NOT NULL AND data_expiracao_assinatura > NOW())
        WHERE tipo_usuario NOT IN ('super_admin','admin')
      `);
    },
  },
  {
    name: "plano por tipo de pessoa (subscription_plans.tipo_pessoa)",
    run: async () => {
      // NULL = plano serve a PF e PJ (comportamento anterior de quem só tem um
      // plano). Preenchido, o plano vale só para aquele tipo — é o que permite
      // cobrar preços diferentes de PF e PJ.
      await db.execute(sql`ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS tipo_pessoa VARCHAR(20)`);
    },
  },
  {
    name: "fatura PJ (empresas_cartoes, empresas_faturas + competência em empresas_transacoes)",
    run: async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS empresas_cartoes (
          id             SERIAL PRIMARY KEY,
          empresa_id     INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
          nome           VARCHAR(100) NOT NULL,
          bandeira       VARCHAR(40),
          limite         NUMERIC(12,2),
          dia_fechamento INTEGER NOT NULL,
          dia_vencimento INTEGER NOT NULL,
          ativo          BOOLEAN NOT NULL DEFAULT true,
          criado_em      TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_emp_cartoes_empresa ON empresas_cartoes(empresa_id)`);

      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS empresas_faturas (
          id                     SERIAL PRIMARY KEY,
          empresa_id             INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
          cartao_id              INTEGER NOT NULL REFERENCES empresas_cartoes(id) ON DELETE CASCADE,
          competencia            VARCHAR(7) NOT NULL,
          data_fechamento        DATE NOT NULL,
          data_vencimento        DATE NOT NULL,
          status                 VARCHAR(10) NOT NULL DEFAULT 'aberta',
          transacao_pagamento_id INTEGER,
          data_pagamento         TIMESTAMPTZ,
          criado_em              TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
        )
      `);
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS emp_fatura_uq ON empresas_faturas(cartao_id, competencia)`);

      // Competência × caixa nas transações PJ: compra no cartão é competência
      // (movimenta_caixa=false); só o pagamento da fatura move o caixa.
      await db.execute(sql`ALTER TABLE empresas_transacoes ADD COLUMN IF NOT EXISTS movimenta_caixa BOOLEAN NOT NULL DEFAULT true`);
      await db.execute(sql`ALTER TABLE empresas_transacoes ADD COLUMN IF NOT EXISTS cartao_id INTEGER`);
      await db.execute(sql`ALTER TABLE empresas_transacoes ADD COLUMN IF NOT EXISTS fatura_id INTEGER`);
      await db.execute(sql`ALTER TABLE empresas_transacoes ADD COLUMN IF NOT EXISTS competencia VARCHAR(7)`);
    },
  },
  {
    name: "empresas_contas: grupo_gerencial + is_cmv (fluxo de caixa gerencial)",
    run: async () => {
      await db.execute(sql`ALTER TABLE empresas_contas ADD COLUMN IF NOT EXISTS grupo_gerencial VARCHAR(30)`);
      await db.execute(sql`ALTER TABLE empresas_contas ADD COLUMN IF NOT EXISTS is_cmv BOOLEAN NOT NULL DEFAULT false`);
      // Backfill das contas já existentes (só onde ainda está nulo), derivando o
      // grupo gerencial a partir de tipo/classificacao. Assim o relatório rico
      // já funciona para empresas antigas sem reclassificação manual.
      await db.execute(sql`
        UPDATE empresas_contas SET grupo_gerencial = CASE
          WHEN tipo = 'Receita' THEN 'receita'
          WHEN classificacao = 'VARIAVEL' THEN 'custo_variavel'
          WHEN classificacao = 'FIXA' THEN 'despesa_fixa'
          ELSE 'outras'
        END
        WHERE grupo_gerencial IS NULL
      `);
      // Marca CMV pelas contas de custo variável ligadas a mercadoria vendida.
      await db.execute(sql`
        UPDATE empresas_contas SET is_cmv = true
        WHERE grupo_gerencial = 'custo_variavel'
          AND is_cmv = false
          AND (nome ILIKE '%CMV%' OR nome ILIKE '%mercadoria vendida%' OR codigo = '3.01')
      `);
    },
  },
  {
    // Metas por ambiente: empresa_id NULL = PF; preenchido = a empresa (PJ) do login.
    // Como cada login é de um único ambiente, isola por si; o vínculo é explícito.
    name: "metas_financeiras: empresa_id (metas por ambiente PF/PJ)",
    run: async () => {
      await db.execute(sql`ALTER TABLE metas_financeiras ADD COLUMN IF NOT EXISTS empresa_id INTEGER REFERENCES empresas(id) ON DELETE CASCADE`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_metas_empresa_id ON metas_financeiras(empresa_id)`);
      // conta_id: liga um limite de despesa PJ a uma conta do plano de contas.
      await db.execute(sql`ALTER TABLE metas_financeiras ADD COLUMN IF NOT EXISTS conta_id INTEGER REFERENCES empresas_contas(id) ON DELETE SET NULL`);
      // Backfill: metas de usuários PJ passam a apontar para a empresa daquele login.
      await db.execute(sql`
        UPDATE metas_financeiras m
        SET empresa_id = e.id
        FROM empresas e
        JOIN usuarios u ON u.id = e.usuario_id
        WHERE m.usuario_id = u.id
          AND u.tipo_pessoa = 'juridica'
          AND m.empresa_id IS NULL
          AND e.id = (SELECT MIN(e2.id) FROM empresas e2 WHERE e2.usuario_id = u.id)
      `);
    },
  },
  {
    // Reembolsável: gasto no cartão que NÃO é passivo do usuário (fica na fatura,
    // some do saldo a pagar/fluxo e dos relatórios de despesa; rastreado como "a receber").
    name: "transacoes: reembolsavel (gasto no cartão que não é meu para pagar)",
    run: async () => {
      await db.execute(sql`ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS reembolsavel BOOLEAN NOT NULL DEFAULT false`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_transacoes_reembolsavel ON transacoes(carteira_id, reembolsavel)`);
    },
  },
  {
    name: "password_reset_tokens (recuperação de senha)",
    run: async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          id          SERIAL PRIMARY KEY,
          token_hash  TEXT NOT NULL,
          usuario_id  INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          expires_at  TIMESTAMPTZ NOT NULL,
          used_at     TIMESTAMPTZ,
          created_at  TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash ON password_reset_tokens(token_hash)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_usuario ON password_reset_tokens(usuario_id)`);
    },
  },
  {
    // Baixa de contas a pagar PJ: data em que Pendente virou Efetivada.
    name: "empresas_transacoes: data_pagamento (baixa PJ)",
    run: async () => {
      await db.execute(sql`ALTER TABLE empresas_transacoes ADD COLUMN IF NOT EXISTS data_pagamento DATE`);
    },
  },
  {
    // Formas de pagamento da EMPRESA (PIX, boleto, débito…), isoladas do PF.
    // Cartões continuam em empresas_cartoes. A FK antiga forma_pagamento_id
    // (tabela PF) deixa de ser usada nos novos lançamentos.
    name: "empresas_formas_pagamento (formas PJ isoladas)",
    run: async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS empresas_formas_pagamento (
          id         SERIAL PRIMARY KEY,
          empresa_id INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
          nome       VARCHAR(100) NOT NULL,
          tipo       VARCHAR(30) NOT NULL DEFAULT 'outro',
          ativo      BOOLEAN NOT NULL DEFAULT true,
          criado_em  TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
          UNIQUE (empresa_id, nome)
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_emp_formas_empresa ON empresas_formas_pagamento(empresa_id)`);
      await db.execute(sql`
        ALTER TABLE empresas_transacoes
        ADD COLUMN IF NOT EXISTS empresa_forma_pagamento_id INTEGER
          REFERENCES empresas_formas_pagamento(id) ON DELETE SET NULL
      `);
    },
  },
  {
    name: "empresas_transacoes: reembolso_pessoal + vencimento (import PJ)",
    run: async () => {
      await db.execute(sql`ALTER TABLE empresas_transacoes ADD COLUMN IF NOT EXISTS reembolso_pessoal BOOLEAN NOT NULL DEFAULT false`);
      await db.execute(sql`ALTER TABLE empresas_transacoes ADD COLUMN IF NOT EXISTS data_vencimento DATE`);
      await db.execute(sql`ALTER TABLE empresas_transacoes ADD COLUMN IF NOT EXISTS itens_agrupados INTEGER`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_emp_tx_reembolso ON empresas_transacoes(empresa_id, reembolso_pessoal, status)`);
    },
  },
  {
    name: "rebrand: FinanceHub → Khesef (system_settings)",
    run: async () => {
      await db.execute(sql`
        UPDATE system_settings
        SET setting_value = 'Khesef'
        WHERE setting_key = 'system_name'
          AND setting_value IN ('FinanceHub', 'financehub')
      `);
      await db.execute(sql`
        UPDATE system_settings
        SET setting_value = 'khesef'
        WHERE setting_key = 'system_name_short'
          AND lower(setting_value) = 'financehub'
      `);
      await db.execute(sql`
        UPDATE system_settings
        SET setting_value = 'https://app.controledinheiro.com.br'
        WHERE setting_key = 'system_url'
          AND (
            setting_value ILIKE '%financehub%'
            OR setting_value ILIKE '%xpiria%'
            OR setting_value IS NULL
            OR setting_value = ''
          )
      `);
      await db.execute(sql`
        UPDATE system_settings
        SET setting_value = replace(setting_value, 'FinanceHub', 'Khesef')
        WHERE setting_key = 'system_description'
          AND setting_value LIKE '%FinanceHub%'
      `);
      await db.execute(sql`
        UPDATE system_settings
        SET setting_value = 'suporte@controledinheiro.com.br'
        WHERE setting_key = 'support_email'
          AND setting_value ILIKE '%financehub%'
      `);
      try {
        await db.execute(sql`
          UPDATE custom_themes
          SET name = 'Padrão Khesef'
          WHERE name = 'Padrão FinanceHub'
        `);
      } catch {
        // tabela pode não existir em alguns ambientes
      }
      try {
        await db.execute(sql`
          UPDATE welcome_messages
          SET
            title = replace(title, 'FinanceHub', 'Khesef'),
            message = replace(message, 'FinanceHub', 'Khesef'),
            email_content = replace(email_content, 'FinanceHub', 'Khesef')
          WHERE title LIKE '%FinanceHub%'
             OR message LIKE '%FinanceHub%'
             OR email_content LIKE '%FinanceHub%'
        `);
      } catch {
        // tabela pode não existir
      }
    },
  },
  {
    name: "usuarios: status_assinatura VARCHAR(50) (onboarding WhatsApp)",
    run: async () => {
      // 'aguardando_confirmacao' (22) e 'aguardando_tipo_pessoa' (21) não cabem em VARCHAR(20).
      await db.execute(sql`ALTER TABLE usuarios ALTER COLUMN status_assinatura TYPE VARCHAR(50)`);
    },
  },
  {
    name: "rebrand: Magen → Khesef (system_settings)",
    run: async () => {
      await db.execute(sql`
        UPDATE system_settings
        SET setting_value = 'Khesef'
        WHERE setting_key = 'system_name' AND setting_value = 'Magen'
      `);
      await db.execute(sql`
        UPDATE system_settings
        SET setting_value = 'khesef'
        WHERE setting_key = 'system_name_short' AND lower(setting_value) = 'magen'
      `);
      await db.execute(sql`
        UPDATE system_settings
        SET setting_value = replace(setting_value, 'Magen', 'Khesef')
        WHERE setting_key = 'system_description' AND setting_value LIKE '%Magen%'
      `);
      try {
        await db.execute(sql`
          UPDATE custom_themes SET name = 'Padrão Khesef' WHERE name = 'Padrão Magen'
        `);
      } catch {
        // tabela pode não existir
      }
      try {
        await db.execute(sql`
          UPDATE welcome_messages
          SET
            title = replace(title, 'Magen', 'Khesef'),
            message = replace(message, 'Magen', 'Khesef'),
            email_content = replace(email_content, 'Magen', 'Khesef')
          WHERE title LIKE '%Magen%'
             OR message LIKE '%Magen%'
             OR email_content LIKE '%Magen%'
        `);
      } catch {
        // tabela pode não existir
      }
    },
  },
  {
    // Contas bancárias compartilhadas PF+PJ: empresa_id opcional (PF = null).
    // Novas colunas de apresentação + vínculo das transações PF a conta/fatura.
    name: "contas PF + cols transacoes (conta_bancaria, fatura, competencia, movimenta_caixa)",
    run: async () => {
      // Relaxa empresa_id para permitir contas só de usuário (PF).
      await db.execute(sql`ALTER TABLE contas_bancarias ALTER COLUMN empresa_id DROP NOT NULL`);
      await db.execute(sql`ALTER TABLE contas_bancarias ADD COLUMN IF NOT EXISTS nome VARCHAR(120)`);
      await db.execute(sql`ALTER TABLE contas_bancarias ADD COLUMN IF NOT EXISTS cor VARCHAR(30)`);
      // Backfill nome a partir do banco quando ainda vazio.
      await db.execute(sql`UPDATE contas_bancarias SET nome = banco WHERE nome IS NULL OR nome = ''`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_contas_banc_usuario ON contas_bancarias(usuario_id)`);

      await db.execute(sql`ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS conta_bancaria_id INTEGER`);
      await db.execute(sql`ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS fatura_id INTEGER`);
      await db.execute(sql`ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS competencia VARCHAR(7)`);
      await db.execute(sql`ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS movimenta_caixa BOOLEAN NOT NULL DEFAULT true`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_transacoes_conta_banc ON transacoes(conta_bancaria_id)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_transacoes_fatura ON transacoes(fatura_id)`);
    },
  },
  {
    // Faturas de cartão PF (espelho de empresas_faturas).
    name: "faturas PF (competencia × caixa)",
    run: async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS faturas (
          id                     SERIAL PRIMARY KEY,
          usuario_id             INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          carteira_id            INTEGER NOT NULL REFERENCES carteiras(id) ON DELETE CASCADE,
          forma_pagamento_id     INTEGER NOT NULL REFERENCES formas_pagamento(id) ON DELETE CASCADE,
          competencia            VARCHAR(7) NOT NULL,
          data_fechamento        DATE NOT NULL,
          data_vencimento        DATE NOT NULL,
          status                 VARCHAR(10) NOT NULL DEFAULT 'aberta',
          transacao_pagamento_id INTEGER,
          conta_bancaria_id      INTEGER REFERENCES contas_bancarias(id) ON DELETE SET NULL,
          data_pagamento         TIMESTAMPTZ,
          criado_em              TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
        )
      `);
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS fatura_pf_uq ON faturas(forma_pagamento_id, competencia)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_faturas_usuario ON faturas(usuario_id)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_faturas_carteira ON faturas(carteira_id)`);
    },
  },
  {
    // Backfill: uma conta "Carteira (principal)" por usuário PF, vinculando
    // todas as transações existentes — o saldo exibido na virada permanece igual.
    name: "backfill Carteira (principal) PF",
    run: async () => {
      // Cria a conta principal onde ainda não existe (idempotente via nome+usuario).
      await db.execute(sql`
        INSERT INTO contas_bancarias (empresa_id, usuario_id, banco, nome, tipo, saldo_inicial, ativo, cor)
        SELECT NULL, u.id, 'Carteira', 'Carteira (principal)', 'carteira', 0, true, '#64748b'
        FROM usuarios u
        WHERE COALESCE(u.tipo_pessoa, 'fisica') <> 'juridica'
          AND NOT EXISTS (
            SELECT 1 FROM contas_bancarias c
            WHERE c.usuario_id = u.id AND c.empresa_id IS NULL AND c.tipo = 'carteira'
              AND c.nome = 'Carteira (principal)'
          )
      `);

      // Vincula transações sem conta à carteira principal do dono da carteira.
      await db.execute(sql`
        UPDATE transacoes t
        SET conta_bancaria_id = c.id
        FROM carteiras w
        JOIN contas_bancarias c ON c.usuario_id = w.usuario_id
          AND c.empresa_id IS NULL
          AND c.tipo = 'carteira'
          AND c.nome = 'Carteira (principal)'
        WHERE t.carteira_id = w.id
          AND t.conta_bancaria_id IS NULL
      `);
    },
  },
  {
    // Txs na forma global "Cartão de Crédito" → cartão real do usuário + fatura.
    name: "backfill cartões PF a partir da forma genérica",
    run: async () => {
      const { migrarTxsCartaoGenericoPf } = await import("../services/fatura-pf.service");
      const r = await migrarTxsCartaoGenericoPf();
      if (r.txs > 0 || r.promovidos > 0 || r.anexadas > 0) {
        console.log(
          `[AutoMigrate] cartões PF → legado:${r.txs} txs/${r.usuarios} user(s), promovidos:${r.promovidos}, anexadas:${r.anexadas}`,
        );
      }
    },
  },
  {
    name: "empresas_transacoes: compra_grupo + parcelas",
    run: async () => {
      await db.execute(sql`ALTER TABLE empresas_transacoes ADD COLUMN IF NOT EXISTS compra_grupo VARCHAR(40)`);
      await db.execute(sql`ALTER TABLE empresas_transacoes ADD COLUMN IF NOT EXISTS parcela_num INTEGER`);
      await db.execute(sql`ALTER TABLE empresas_transacoes ADD COLUMN IF NOT EXISTS parcela_total INTEGER`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_emp_tx_compra_grupo ON empresas_transacoes(compra_grupo)`);
    },
  },
];

export async function runAutoMigrations(): Promise<void> {
  if (process.env.AUTO_MIGRATE === "false") {
    console.log("[AutoMigrate] desativado (AUTO_MIGRATE=false).");
    return;
  }
  console.log("[AutoMigrate] verificando schema...");
  let ok = 0;
  for (const step of STEPS) {
    try {
      await step.run();
      ok++;
    } catch (err: any) {
      // Não bloquear o boot por causa de um passo — apenas registrar.
      console.error(`[AutoMigrate] passo falhou (seguindo): ${step.name}:`, err?.message);
    }
  }
  console.log(`[AutoMigrate] concluído: ${ok}/${STEPS.length} passos aplicados/ok.`);
}
