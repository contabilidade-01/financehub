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
