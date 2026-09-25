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

/**
 * Correção de dados que deve rodar UMA vez (os passos rodam a cada boot).
 * Sem isso, um backfill "re-corrigiria" o que o usuário mudou depois.
 */
type Exec = { execute: typeof db.execute };

async function umaVez(chave: string, fn: (tx: Exec) => Promise<void>): Promise<void> {
  await db.execute(sql`CREATE TABLE IF NOT EXISTS auto_migrate_marcos (chave VARCHAR(120) PRIMARY KEY, aplicado_em TIMESTAMPTZ NOT NULL DEFAULT now())`);
  const ja = await db.execute(sql`SELECT 1 FROM auto_migrate_marcos WHERE chave = ${chave}`);
  if ((ja as any[]).length) return;
  await db.transaction(async (tx: Exec) => {
    // A marca é gravada na mesma transação da correção: ou as duas ou nenhuma.
    const ins = await tx.execute(sql`INSERT INTO auto_migrate_marcos (chave) VALUES (${chave}) ON CONFLICT DO NOTHING RETURNING chave`);
    if (!(ins as any[]).length) return; // outra instância chegou antes
    await fn(tx);
  });
}

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
      // Um login = uma empresa. Só cria o índice se não houver duplicatas.
      try {
        const dups = await db.execute(sql`
          SELECT usuario_id, COUNT(*)::int AS qtd
          FROM empresas
          GROUP BY usuario_id
          HAVING COUNT(*) > 1
        `);
        const lista = dups as any[];
        if (lista.length > 0) {
          console.warn(
            `[auto-migrate] idx_empresas_usuario_unico NÃO criado — duplicatas: ` +
              lista.map((r) => `usuario_id=${r.usuario_id}(${r.qtd})`).join(", "),
          );
        } else {
          await db.execute(sql`
            CREATE UNIQUE INDEX IF NOT EXISTS idx_empresas_usuario_unico ON empresas(usuario_id)
          `);
        }
      } catch (e: any) {
        console.warn("[auto-migrate] idx_empresas_usuario_unico:", e?.message || e);
      }
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
      // Uma vez só: rodando a cada boot, desfazia quem desmarcou CMV na tela.
      await umaVez("empresas_contas.is_cmv.backfill", async (tx) => {
        await tx.execute(sql`
          UPDATE empresas_contas SET is_cmv = true
          WHERE grupo_gerencial = 'custo_variavel'
            AND is_cmv = false
            AND (nome ILIKE '%CMV%' OR nome ILIKE '%mercadoria vendida%' OR codigo = '3.01')
        `);
      });
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
    name: "planos: separar PF (39,90) e PJ (79,90)",
    run: async () => {
      // Converte o plano único atual (tipo NULL) em plano PF de R$ 39,90.
      // Mantém o id (preserva qualquer user_subscriptions.plan_id existente).
      await db.execute(sql`
        UPDATE subscription_plans
        SET tipo_pessoa = 'fisica', price_monthly = 39.90, name = 'Plano Mensal PF', active = true
        WHERE plan_code = 'mensal'
      `);
      // Cria o plano PJ de R$ 79,90 se ainda não existir.
      await db.execute(sql`
        INSERT INTO subscription_plans (plan_code, name, description, price_monthly, tipo_pessoa, features, active)
        SELECT 'mensal_pj', 'Plano Mensal PJ', 'Assinatura mensal para Pessoa Jurídica',
               79.90, 'juridica', '[]', true
        WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE plan_code = 'mensal_pj')
      `);
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
  {
    // LGPD: pedido de exclusão com carência + marca de anonimização.
    // anonimizado_em é o que impede reprocessar quem já foi expurgado.
    name: "usuarios: exclusao de conta (LGPD)",
    run: async () => {
      await db.execute(sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS exclusao_solicitada_em TIMESTAMPTZ`);
      await db.execute(sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS exclusao_efetiva_em TIMESTAMPTZ`);
      await db.execute(sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS exclusao_motivo TEXT`);
      await db.execute(sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS anonimizado_em TIMESTAMPTZ`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_usuarios_exclusao ON usuarios(exclusao_efetiva_em)`);
    },
  },
  {
    name: "PJ: garantir Caixinha + backfill txs sem meio",
    run: async () => {
      // Contas sem nome herdam o banco.
      await db.execute(sql`UPDATE contas_bancarias SET nome = banco WHERE empresa_id IS NOT NULL AND (nome IS NULL OR nome = '')`);

      const empresas = await db.execute(sql`SELECT id, usuario_id FROM empresas WHERE COALESCE(ativo, true) = true`);
      for (const emp of empresas as any[]) {
        const existentes = await db.execute(sql`
          SELECT id FROM contas_bancarias
          WHERE empresa_id = ${emp.id}
            AND (
              lower(coalesce(nome, '')) = 'caixinha'
              OR lower(coalesce(banco, '')) = 'caixinha'
              OR (tipo = 'caixa' AND lower(coalesce(nome, banco, '')) IN ('caixa', 'caixinha'))
            )
          LIMIT 1
        `);
        let caixaId = (existentes as any[])[0]?.id as number | undefined;
        if (!caixaId) {
          const criada = await db.execute(sql`
            INSERT INTO contas_bancarias (empresa_id, usuario_id, banco, nome, tipo, saldo_inicial, ativo)
            VALUES (${emp.id}, ${emp.usuario_id ?? null}, 'Caixinha', 'Caixinha', 'caixa', 0, true)
            RETURNING id
          `);
          caixaId = (criada as any[])[0]?.id;
        } else {
          await db.execute(sql`
            UPDATE contas_bancarias SET nome = 'Caixinha', tipo = 'caixa'
            WHERE id = ${caixaId}
          `);
        }
        if (!caixaId) continue;
        await db.execute(sql`
          UPDATE empresas_transacoes
          SET conta_bancaria_id = ${caixaId},
              metodo_pagamento = COALESCE(NULLIF(metodo_pagamento, ''), 'Caixinha'),
              movimenta_caixa = COALESCE(movimenta_caixa, true)
          WHERE empresa_id = ${emp.id}
            AND conta_bancaria_id IS NULL
            AND cartao_id IS NULL
            AND fatura_id IS NULL
        `);
      }
    },
  },
  {
    name: "PJ: desativar formas soltas (PIX/boleto/etc) + limpar vínculo",
    run: async () => {
      // Soft-desativa todas as formas da tabela legada (não apaga — evita CASCADE).
      const desativadas = await db.execute(sql`
        UPDATE empresas_formas_pagamento
        SET ativo = false
        WHERE ativo = true
        RETURNING id, empresa_id, nome
      `);
      const n = (desativadas as any[]).length;
      if (n) {
        console.log(`[AutoMigrate] PJ formas soltas desativadas: ${n}`);
        for (const f of (desativadas as any[]).slice(0, 30)) {
          console.log(`  - empresa ${f.empresa_id}: ${f.nome}`);
        }
        if (n > 30) console.log(`  … e mais ${n - 30}`);
      }

      // Txs que só tinham forma solta (sem conta/cartão) → Caixinha.
      const empresas = await db.execute(sql`SELECT id, usuario_id FROM empresas WHERE COALESCE(ativo, true) = true`);
      let remapeadas = 0;
      for (const emp of empresas as any[]) {
        const caixa = await db.execute(sql`
          SELECT id FROM contas_bancarias
          WHERE empresa_id = ${emp.id}
            AND (
              lower(coalesce(nome, '')) = 'caixinha'
              OR lower(coalesce(banco, '')) = 'caixinha'
              OR tipo = 'caixa'
            )
          LIMIT 1
        `);
        let caixaId = (caixa as any[])[0]?.id as number | undefined;
        if (!caixaId) {
          const criada = await db.execute(sql`
            INSERT INTO contas_bancarias (empresa_id, usuario_id, banco, nome, tipo, saldo_inicial, ativo)
            VALUES (${emp.id}, ${emp.usuario_id ?? null}, 'Caixinha', 'Caixinha', 'caixa', 0, true)
            RETURNING id
          `);
          caixaId = (criada as any[])[0]?.id;
        }
        if (!caixaId) continue;

        const upd = await db.execute(sql`
          UPDATE empresas_transacoes
          SET conta_bancaria_id = COALESCE(conta_bancaria_id, ${caixaId}),
              empresa_forma_pagamento_id = NULL,
              metodo_pagamento = CASE
                WHEN cartao_id IS NOT NULL THEN metodo_pagamento
                WHEN conta_bancaria_id IS NOT NULL THEN metodo_pagamento
                ELSE COALESCE(NULLIF(metodo_pagamento, ''), 'Caixinha')
              END,
              movimenta_caixa = CASE
                WHEN cartao_id IS NOT NULL OR fatura_id IS NOT NULL THEN false
                ELSE COALESCE(movimenta_caixa, true)
              END
          WHERE empresa_id = ${emp.id}
            AND empresa_forma_pagamento_id IS NOT NULL
            AND cartao_id IS NULL
            AND fatura_id IS NULL
          RETURNING id
        `);
        remapeadas += (upd as any[]).length;

        // Limpa o vínculo também nas que já têm conta/cartão.
        await db.execute(sql`
          UPDATE empresas_transacoes
          SET empresa_forma_pagamento_id = NULL
          WHERE empresa_id = ${emp.id}
            AND empresa_forma_pagamento_id IS NOT NULL
        `);
      }
      console.log(`[AutoMigrate] PJ txs remapeadas de forma solta → conta/Caixinha: ${remapeadas}`);
    },
  },
  {
    name: "mensalidades (recorrências mensais PF/PJ)",
    run: async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS mensalidades (
          id                        SERIAL PRIMARY KEY,
          usuario_id                INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          empresa_id                INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
          carteira_id               INTEGER REFERENCES carteiras(id),
          descricao                 VARCHAR(255) NOT NULL,
          valor                     NUMERIC(12,2) NOT NULL,
          dia_vencimento            INTEGER NOT NULL,
          tipo_meio                 VARCHAR(10) NOT NULL,
          categoria_id              INTEGER,
          conta_bancaria_id         INTEGER,
          forma_pagamento_id        INTEGER,
          cartao_id                 INTEGER,
          ativo                     BOOLEAN NOT NULL DEFAULT true,
          data_inicio               DATE,
          data_fim                  DATE,
          ultima_competencia_gerada VARCHAR(7),
          origem                    VARCHAR(20) NOT NULL DEFAULT 'app',
          data_criacao              TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_mensalidades_usuario ON mensalidades(usuario_id)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_mensalidades_empresa ON mensalidades(empresa_id)`);
    },
  },
  {
    name: "PJ com consultoria (plano 200) + usuarios.plano_forcado_id",
    run: async () => {
      // Coluna de override de plano por usuário (manual, pelo admin).
      await db.execute(sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS plano_forcado_id INTEGER`);
      // Plano PJ "com consultoria" (R$ 200) — criado uma vez, se ainda não existir.
      await db.execute(sql`
        INSERT INTO subscription_plans (plan_code, name, description, price_monthly, tipo_pessoa, features, active)
        SELECT 'mensal_pj_consultoria', 'Plano Mensal PJ + Consultoria',
               'Assinatura mensal PJ com consultoria', 200.00, 'juridica', '[]', true
        WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE plan_code = 'mensal_pj_consultoria')
      `);
    },
  },
  {
    name: "modalidade PJ MEI / PJ ME (usuarios.porte_pj)",
    run: async () => {
      // Aditivo: PJ existentes passam a ser PJ MEI; PJ ME é a nova modalidade (ERP).
      await db.execute(sql`ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS porte_pj VARCHAR(10)`);
      await db.execute(sql`
        UPDATE usuarios SET porte_pj = 'mei'
        WHERE tipo_pessoa = 'juridica' AND porte_pj IS NULL
      `);
    },
  },
  {
    name: "plano PJ ME com preço próprio (subscription_plans.porte_pj)",
    run: async () => {
      await db.execute(sql`ALTER TABLE subscription_plans ADD COLUMN IF NOT EXISTS porte_pj VARCHAR(10)`);
      // Começa com o mesmo preço do PJ atual; o admin fixa o valor em Pagamentos.
      await db.execute(sql`
        INSERT INTO subscription_plans (plan_code, name, description, price_monthly, tipo_pessoa, porte_pj, features, active)
        SELECT 'mensal_pj_me', 'Plano Mensal PJ ME', 'Assinatura mensal PJ ME (ERP)',
               COALESCE((SELECT price_monthly FROM subscription_plans WHERE plan_code = 'mensal_pj' LIMIT 1), 79.90),
               'juridica', 'me', '[]', true
        WHERE NOT EXISTS (SELECT 1 FROM subscription_plans WHERE plan_code = 'mensal_pj_me')
      `);
    },
  },
  {
    name: "tokens de API só com hash (api_tokens.token_hint + sha256)",
    run: async () => {
      await db.execute(sql`ALTER TABLE api_tokens ADD COLUMN IF NOT EXISTS token_hint VARCHAR(40)`);
      // Idempotente: só converte o que ainda está em texto puro.
      await db.execute(sql`
        UPDATE api_tokens
        SET token_hint = left(token, 10) || '...' || right(token, 4),
            token = 'sha256:' || encode(sha256(convert_to(token, 'UTF8')), 'hex')
        WHERE token NOT LIKE 'sha256:%'
      `);
    },
  },
  {
    name: "IA: pendências da conversa e dedup de mensagens no banco",
    run: async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS ia_pendencias (
          usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          tipo       VARCHAR(40) NOT NULL,
          dados      JSONB NOT NULL,
          expira_em  TIMESTAMPTZ NOT NULL,
          PRIMARY KEY (usuario_id, tipo)
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS whatsapp_mensagens_processadas (
          message_id VARCHAR(128) PRIMARY KEY,
          criado_em  TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_wa_msg_criado ON whatsapp_mensagens_processadas(criado_em)`);
      // Auditoria das decisões da IA (ferramentas, categoria escolhida e motivo).
      await db.execute(sql`ALTER TABLE ingestion_events ADD COLUMN IF NOT EXISTS decisoes JSONB`);
      await db.execute(sql`ALTER TABLE ingestion_events ADD COLUMN IF NOT EXISTS modelo VARCHAR(80)`);
      await db.execute(sql`ALTER TABLE ingestion_events ADD COLUMN IF NOT EXISTS message_id VARCHAR(128)`);
    },
  },
  {
    name: "importação unificada: sessões persistentes (importacoes / importacao_linhas)",
    run: async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS importacoes (
          id                    SERIAL PRIMARY KEY,
          usuario_id            INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          escopo                VARCHAR(2) NOT NULL,             -- 'pf' | 'pj'
          empresa_id            INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
          conta_bancaria_id     INTEGER REFERENCES contas_bancarias(id) ON DELETE SET NULL,
          arquivo_nome          VARCHAR(255),
          formato               VARCHAR(10) NOT NULL,
          hash_arquivo          VARCHAR(64),
          cabecalho             JSONB,
          linhas_brutas         JSONB,                           -- CSV/XLSX: p/ remapear colunas
          mapeamento            JSONB,
          conta_arquivo         JSONB,                           -- OFX: banco/agência/conta
          saldo_final_informado NUMERIC(14,2),
          data_saldo            DATE,
          periodo_de            DATE,
          periodo_ate           DATE,
          status                VARCHAR(15) NOT NULL DEFAULT 'rascunho', -- rascunho | concluida | cancelada
          sugestao_status       VARCHAR(15),                     -- processando | concluida | erro
          sugestao_progresso    INTEGER,
          resultado             JSONB,
          criado_em             TIMESTAMPTZ NOT NULL DEFAULT now(),
          atualizado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
          concluido_em          TIMESTAMPTZ
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_importacoes_usuario ON importacoes(usuario_id, status)`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS importacao_linhas (
          id                     SERIAL PRIMARY KEY,
          importacao_id          INTEGER NOT NULL REFERENCES importacoes(id) ON DELETE CASCADE,
          ordem                  INTEGER NOT NULL,
          data                   DATE NOT NULL,
          descricao              VARCHAR(255) NOT NULL,
          valor                  NUMERIC(14,2) NOT NULL,          -- com sinal: + entrada, - saída
          documento              VARCHAR(80),
          chave                  VARCHAR(120) NOT NULL,           -- FITID ou hash (dedup)
          status                 VARCHAR(12) NOT NULL DEFAULT 'pendente', -- pendente | conciliar | duplicada | ignorar | importada
          categoria_id           INTEGER,                         -- PF: categorias.id | PJ: empresas_contas.id
          sugestao_categoria_id  INTEGER,
          sugestao_origem        VARCHAR(30),
          transacao_existente_id INTEGER,                         -- conciliar com lançamento já existente
          candidatos             JSONB,
          transacao_criada_id    INTEGER,
          centro_custo_id        INTEGER,
          contato_id             INTEGER,
          observacao             VARCHAR(255),
          atualizado_em          TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_import_linhas ON importacao_linhas(importacao_id, ordem)`);
      // Chave do extrato gravada no lançamento: dedup entre importações (PF e PJ).
      await db.execute(sql`ALTER TABLE transacoes ADD COLUMN IF NOT EXISTS fitid VARCHAR(120)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_transacoes_conta_fitid ON transacoes(conta_bancaria_id, fitid) WHERE fitid IS NOT NULL`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_emp_tx_conta_fitid ON empresas_transacoes(conta_bancaria_id, fitid) WHERE fitid IS NOT NULL`);
    },
  },
  {
    name: "ERP PJ ME: clientes/fornecedores, centros de custo e vínculos no lançamento",
    run: async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS empresas_contatos (
          id          SERIAL PRIMARY KEY,
          empresa_id  INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
          tipo        VARCHAR(12) NOT NULL DEFAULT 'cliente',   -- cliente | fornecedor | ambos
          nome        VARCHAR(200) NOT NULL,
          documento   VARCHAR(20),                              -- CPF/CNPJ só dígitos
          email       VARCHAR(200),
          telefone    VARCHAR(30),
          observacao  TEXT,
          ativo       BOOLEAN NOT NULL DEFAULT true,
          criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_emp_contatos ON empresas_contatos(empresa_id, ativo)`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS empresas_centros_custo (
          id          SERIAL PRIMARY KEY,
          empresa_id  INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
          nome        VARCHAR(120) NOT NULL,
          codigo      VARCHAR(20),
          ativo       BOOLEAN NOT NULL DEFAULT true,
          criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (empresa_id, nome)
        )
      `);
      await db.execute(sql`ALTER TABLE empresas_transacoes ADD COLUMN IF NOT EXISTS contato_id INTEGER REFERENCES empresas_contatos(id) ON DELETE SET NULL`);
      await db.execute(sql`ALTER TABLE empresas_transacoes ADD COLUMN IF NOT EXISTS centro_custo_id INTEGER REFERENCES empresas_centros_custo(id) ON DELETE SET NULL`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_emp_tx_contato ON empresas_transacoes(contato_id) WHERE contato_id IS NOT NULL`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_emp_tx_centro ON empresas_transacoes(centro_custo_id) WHERE centro_custo_id IS NOT NULL`);
    },
  },
  {
    name: "transferências entre contas bancárias (não entram no DRE)",
    run: async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS transferencias_bancarias (
          id                SERIAL PRIMARY KEY,
          usuario_id        INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
          empresa_id        INTEGER REFERENCES empresas(id) ON DELETE CASCADE,
          conta_origem_id   INTEGER NOT NULL REFERENCES contas_bancarias(id) ON DELETE CASCADE,
          conta_destino_id  INTEGER NOT NULL REFERENCES contas_bancarias(id) ON DELETE CASCADE,
          valor             NUMERIC(14,2) NOT NULL CHECK (valor > 0),
          data              DATE NOT NULL,
          descricao         VARCHAR(255),
          chave_origem      VARCHAR(120),   -- chave do extrato da conta de origem (dedup)
          chave_destino     VARCHAR(120),   -- chave do extrato da conta de destino
          criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
          CHECK (conta_origem_id <> conta_destino_id)
        )
      `);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_transf_origem ON transferencias_bancarias(conta_origem_id, data)`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_transf_destino ON transferencias_bancarias(conta_destino_id, data)`);
      // 'transferencia' (13) não cabe em VARCHAR(12); alargar é seguro e idempotente.
      await db.execute(sql`ALTER TABLE importacao_linhas ALTER COLUMN status TYPE VARCHAR(20)`);
      await db.execute(sql`ALTER TABLE importacao_linhas ADD COLUMN IF NOT EXISTS transferencia_conta_id INTEGER`);
      await db.execute(sql`ALTER TABLE importacao_linhas ADD COLUMN IF NOT EXISTS transferencia_id INTEGER`);
    },
  },
  {
    name: "plano de contas PJ: grupos sintéticos (Base Serviços / Base Comércio)",
    run: async () => {
      await db.execute(sql`ALTER TABLE empresas_contas ADD COLUMN IF NOT EXISTS sintetica BOOLEAN NOT NULL DEFAULT false`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_emp_contas_parent ON empresas_contas(parent_id) WHERE parent_id IS NOT NULL`);

      // Defesa em profundidade: grupo sintético nunca recebe lançamento, venha
      // de onde vier (tela, IA, importação, integração).
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION fn_bloqueia_lanc_conta_sintetica() RETURNS trigger AS $$
        BEGIN
          IF NEW.categoria_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM empresas_contas c WHERE c.id = NEW.categoria_id AND c.sintetica = true
          ) THEN
            RAISE EXCEPTION 'Lançamento em grupo do plano de contas não é permitido; escolha uma conta.'
              USING ERRCODE = 'check_violation';
          END IF;
          RETURN NEW;
        END $$ LANGUAGE plpgsql
      `);
      await db.execute(sql`DROP TRIGGER IF EXISTS trg_bloqueia_lanc_conta_sintetica ON empresas_transacoes`);
      await db.execute(sql`
        CREATE TRIGGER trg_bloqueia_lanc_conta_sintetica
        BEFORE INSERT OR UPDATE OF categoria_id ON empresas_transacoes
        FOR EACH ROW EXECUTE FUNCTION fn_bloqueia_lanc_conta_sintetica()
      `);

      // Empresas com o plano antigo (1=Receita, 2=Fixas, 3=Variáveis, 4=Outras):
      // cria os grupos sintéticos pelos prefixos, sem renumerar nada, e pendura
      // as contas neles. Uma vez só, para respeitar o que o usuário mover depois.
      await umaVez("empresas_contas.grupos_legado", async (tx) => {
        const grupos: [string, string, string, string, string][] = [
          ["1", "Receitas", "Receita", "OUTRA", "receita"],
          ["2", "Despesas fixas", "Despesa", "FIXA", "despesa_fixa"],
          ["3", "Custos e despesas variáveis", "Despesa", "VARIAVEL", "custo_variavel"],
          ["4", "Outras despesas", "Despesa", "OUTRA", "outras"],
        ];
        // Empresas ainda sem nenhum grupo (listadas antes de inserir o primeiro).
        const alvo = ((await tx.execute(sql`
          SELECT DISTINCT c.empresa_id FROM empresas_contas c
          WHERE NOT EXISTS (SELECT 1 FROM empresas_contas s WHERE s.empresa_id = c.empresa_id AND s.sintetica = true)
        `)) as any[]).map((r) => Number(r.empresa_id));
        if (!alvo.length) return;
        const ids = sql.join(alvo.map((id) => sql`${id}`), sql`, `);
        for (const [codigo, nome, tipo, classificacao, grupo] of grupos) {
          await tx.execute(sql`
            INSERT INTO empresas_contas (empresa_id, codigo, nome, tipo, classificacao, grupo_gerencial, sintetica, ativo)
            SELECT DISTINCT c.empresa_id, ${codigo}, ${nome}, ${tipo}, ${classificacao}, ${grupo}, true, true
            FROM empresas_contas c
            WHERE c.empresa_id IN (${ids})
              AND c.codigo LIKE ${codigo + ".%"}
              AND NOT EXISTS (SELECT 1 FROM empresas_contas x WHERE x.empresa_id = c.empresa_id AND x.codigo = ${codigo})
          `);
        }
        await tx.execute(sql`
          UPDATE empresas_contas f SET parent_id = g.id
          FROM empresas_contas g
          WHERE g.empresa_id = f.empresa_id
            AND f.empresa_id IN (${ids})
            AND g.sintetica = true
            AND f.sintetica = false
            AND f.parent_id IS NULL
            AND f.codigo LIKE g.codigo || '.%'
            AND position('.' in substring(f.codigo from length(g.codigo) + 2)) = 0
        `);
      });
    },
  },
  {
    name: "Cora: integrações por empresa, cobranças, eventos de webhook e endereço de clientes",
    run: async () => {
      // Endereço do cliente: o banco exige para registrar boleto.
      for (const col of ["cep VARCHAR(9)", "logradouro VARCHAR(200)", "numero VARCHAR(20)", "complemento VARCHAR(100)", "bairro VARCHAR(100)", "cidade VARCHAR(100)", "uf VARCHAR(2)"]) {
        await db.execute(sql.raw(`ALTER TABLE empresas_contatos ADD COLUMN IF NOT EXISTS ${col}`));
      }
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS empresas_integracoes (
          id                 SERIAL PRIMARY KEY,
          empresa_id         INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
          provedor           VARCHAR(20) NOT NULL,                -- 'cora'
          ambiente           VARCHAR(10) NOT NULL DEFAULT 'stage', -- stage | producao
          client_id          VARCHAR(200),
          certificado_enc    TEXT,                                -- AES-256-GCM (utils/cripto-segredos)
          chave_enc          TEXT,
          conta_bancaria_id  INTEGER REFERENCES contas_bancarias(id) ON DELETE SET NULL,
          webhook_token_hash VARCHAR(64),                         -- sha256 do token da URL
          webhook_registrado BOOLEAN NOT NULL DEFAULT false,
          status             VARCHAR(20) NOT NULL DEFAULT 'pendente', -- pendente | conectada | erro
          ultimo_erro        TEXT,
          multa_pct          NUMERIC(5,2) DEFAULT 2,
          juros_mes_pct      NUMERIC(5,2) DEFAULT 1,
          ultimo_sync_em     TIMESTAMPTZ,
          atualizado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
          criado_em          TIMESTAMPTZ NOT NULL DEFAULT now(),
          UNIQUE (empresa_id, provedor)
        )
      `);
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_integ_webhook ON empresas_integracoes(webhook_token_hash) WHERE webhook_token_hash IS NOT NULL`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS cobrancas (
          id               SERIAL PRIMARY KEY,
          empresa_id       INTEGER NOT NULL REFERENCES empresas(id) ON DELETE CASCADE,
          provedor         VARCHAR(20) NOT NULL DEFAULT 'cora',
          provedor_id      VARCHAR(80),
          transacao_id     INTEGER REFERENCES empresas_transacoes(id) ON DELETE SET NULL,
          contato_id       INTEGER REFERENCES empresas_contatos(id) ON DELETE SET NULL,
          status           VARCHAR(20) NOT NULL DEFAULT 'aberta',  -- aberta | processando | paga | vencida | cancelada | erro
          valor            NUMERIC(14,2) NOT NULL,
          valor_pago       NUMERIC(14,2),
          vencimento       DATE NOT NULL,
          pago_em          DATE,
          linha_digitavel  VARCHAR(80),
          codigo_barras    VARCHAR(60),
          pix_copia_cola   TEXT,
          url_pdf          TEXT,
          idempotency_key  VARCHAR(120) NOT NULL,
          erro             TEXT,
          payload          JSONB,
          criado_em        TIMESTAMPTZ NOT NULL DEFAULT now(),
          atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
        )
      `);
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_cobr_provedor ON cobrancas(provedor, provedor_id) WHERE provedor_id IS NOT NULL`);
      // Uma cobrança viva por título (evita cobrar o cliente duas vezes).
      await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_cobr_titulo_viva ON cobrancas(transacao_id) WHERE transacao_id IS NOT NULL AND status IN ('aberta', 'processando', 'vencida')`);
      await db.execute(sql`CREATE INDEX IF NOT EXISTS idx_cobr_empresa ON cobrancas(empresa_id, status, vencimento)`);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS integracoes_eventos (
          provedor     VARCHAR(20) NOT NULL,
          evento_id    VARCHAR(120) NOT NULL,
          recebido_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (provedor, evento_id)
        )
      `);
    },
  },
  {
    name: "assinatura: acesso ancorado no vencimento (+3 dias de tolerância) e avisos_cobranca",
    run: async () => {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS avisos_cobranca (
          usuario_id  INTEGER NOT NULL,
          chave       VARCHAR(160) NOT NULL,
          enviado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (usuario_id, chave)
        )
      `);
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS asaas_conferencias (
          usuario_id    INTEGER PRIMARY KEY,
          conferido_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
          origem        VARCHAR(12) NOT NULL DEFAULT 'auto'
        )
      `);
      // Assinantes ativos: recalcula pelo vencimento do último pagamento
      // confirmado (vencimento + ciclo + 3 dias, fim do dia em SP). Só ESTENDE
      // — nunca tira acesso de ninguém.
      await umaVez("assinatura.ancorar_vencimento", async (tx) => {
        await tx.execute(sql`
          WITH ultimo AS (
            SELECT DISTINCT ON (p.usuario_id) p.usuario_id, p.due_date
            FROM payment_transactions p
            WHERE p.status IN ('confirmed', 'received', 'received_in_cash') AND p.due_date IS NOT NULL
            ORDER BY p.usuario_id, p.due_date DESC
          ), calc AS (
            SELECT u.id,
              ((((ul.due_date + make_interval(months => CASE u.ciclo_assinatura WHEN 'anual' THEN 12 WHEN 'trimestral' THEN 3 ELSE 1 END))::date
                 + 3) + time '23:59:59.999') AT TIME ZONE 'America/Sao_Paulo') AS nova
            FROM usuarios u JOIN ultimo ul ON ul.usuario_id = u.id
            WHERE u.status_assinatura = 'ativa'
          )
          UPDATE usuarios u SET data_expiracao_assinatura = calc.nova
          FROM calc
          WHERE u.id = calc.id
            AND (u.data_expiracao_assinatura IS NULL OR u.data_expiracao_assinatura < calc.nova)
        `);
      });
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
