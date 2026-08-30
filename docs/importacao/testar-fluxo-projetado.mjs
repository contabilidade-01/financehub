/**
 * Roda o serviço de fluxo projetado (PF e PJ) contra um Postgres real
 * em processo (PGlite), com um mínimo de dados semeados. Valida a sintaxe
 * do SQL e a aritmética de saldo acumulado sem depender do banco de produção.
 *
 * PGlite não está no package.json (é pesado e só serve aqui). Instale sob demanda:
 *   npm i --no-save @electric-sql/pglite
 *   npx tsx docs/importacao/testar-fluxo-projetado.mjs
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";

// As funções aceitam um executor; aqui passamos o Postgres em processo.
// O driver pglite devolve { rows }, enquanto o postgres.js de produção devolve
// o array direto — o adaptador iguala o formato ao da produção.
const client = new PGlite();
const testDb = drizzle(client);
const exec = {
  execute: async (q) => {
    const r = await testDb.execute(q);
    return Array.isArray(r) ? r : r.rows;
  },
};

const { getFluxoProjetadoPF, getFluxoProjetadoPJ } = await import(
  "../../server/services/fluxo-projetado.service.ts"
);

async function seed() {
  await client.exec(`
    CREATE TABLE categorias (
      id SERIAL PRIMARY KEY, nome VARCHAR(255), tipo VARCHAR(10),
      usuario_id INTEGER, global BOOLEAN DEFAULT false
    );
    CREATE TABLE transacoes (
      id SERIAL PRIMARY KEY, carteira_id INTEGER, categoria_id INTEGER,
      tipo VARCHAR(10), valor NUMERIC(12,2), data_transacao DATE,
      data_vencimento DATE, status VARCHAR(20), reembolsavel BOOLEAN DEFAULT false
    );
    CREATE TABLE empresas_contas (
      id SERIAL PRIMARY KEY, empresa_id INTEGER, codigo VARCHAR(20),
      nome VARCHAR(255), tipo VARCHAR(10), classificacao VARCHAR(30)
    );
    CREATE TABLE empresas_transacoes (
      id SERIAL PRIMARY KEY, empresa_id INTEGER, categoria_id INTEGER,
      tipo VARCHAR(10), valor NUMERIC(12,2), data_transacao DATE,
      data_vencimento DATE, status VARCHAR(20),
      reembolso_pessoal BOOLEAN DEFAULT false, movimenta_caixa BOOLEAN DEFAULT true,
      conta_bancaria_id INTEGER
    );
    CREATE TABLE contas_bancarias (
      id SERIAL PRIMARY KEY, empresa_id INTEGER, banco VARCHAR(100),
      saldo_inicial NUMERIC(12,2), ativo BOOLEAN DEFAULT true
    );
  `);

  // ---- PF: carteira 1, usuário 1
  await client.exec(`
    INSERT INTO categorias (id, nome, tipo, usuario_id, global) VALUES
      (1, 'Salário', 'Receita', 1, false),
      (2, 'Aluguel', 'Despesa', 1, false),
      (3, 'Mercado', 'Despesa', NULL, true);
    INSERT INTO transacoes (carteira_id, categoria_id, tipo, valor, data_transacao, data_vencimento, status, reembolsavel) VALUES
      -- antes da janela, efetivado: vira saldo inicial (5000 - 1200 = 3800)
      (1, 1, 'Receita', 5000, '2026-07-05', NULL, 'Efetivada', false),
      (1, 2, 'Despesa', 1200, '2026-07-10', NULL, 'Efetivada', false),
      -- antes da janela, mas pendente: NÃO entra no saldo inicial
      (1, 2, 'Despesa',  999, '2026-07-20', NULL, 'Pendente', false),
      -- dentro da janela
      (1, 1, 'Receita', 5000, '2026-09-05', '2026-09-05', 'Efetivada', false),
      (1, 2, 'Despesa', 1200, '2026-09-10', '2026-09-10', 'Pendente', false),
      (1, 3, 'Despesa',  800, '2026-09-15', NULL, 'Pendente', false),
      (1, 1, 'Receita', 5000, '2026-10-05', '2026-10-05', 'Pendente', false),
      (1, 2, 'Despesa', 1200, '2026-10-10', '2026-10-10', 'Pendente', false),
      -- reembolsável: fora do caixa operacional
      (1, 3, 'Despesa',  300, '2026-10-12', NULL, 'Pendente', true);
  `);

  // ---- PJ: empresa 1
  await client.exec(`
    INSERT INTO empresas_contas (id, empresa_id, codigo, nome, tipo, classificacao) VALUES
      (1, 1, '1.1', 'Receita de Serviços', 'Receita', 'OUTRA'),
      (2, 1, '3.1', 'Aluguel', 'Despesa', 'FIXA'),
      (3, 1, '2.1', 'Marketing', 'Despesa', 'VARIAVEL'),
      (4, 1, '9.01', 'Diversos', 'Despesa', 'OUTRA');
    INSERT INTO contas_bancarias (empresa_id, banco, saldo_inicial, ativo) VALUES (1, 'Inter', 10000, true);
    INSERT INTO empresas_transacoes (empresa_id, categoria_id, tipo, valor, data_transacao, data_vencimento, status, reembolso_pessoal, movimenta_caixa, conta_bancaria_id) VALUES
      -- efetivado antes da janela, em conta bancária: soma ao saldo inicial (10000 + 2000 = 12000)
      (1, 1, 'Receita', 2000, '2026-07-15', NULL, 'Efetivada', false, true, 1),
      -- dentro da janela
      (1, 1, 'Receita', 20000, '2026-09-05', '2026-09-05', 'Pendente', false, true, NULL),
      (1, 2, 'Despesa',  1060, '2026-09-15', '2026-09-15', 'Pendente', false, true, NULL),
      (1, 3, 'Despesa',   300, '2026-09-15', '2026-09-15', 'Pendente', false, true, NULL),
      (1, 1, 'Receita', 20000, '2026-10-05', '2026-10-05', 'Pendente', false, true, NULL),
      (1, 2, 'Despesa',  1060, '2026-10-15', '2026-10-15', 'Pendente', false, true, NULL),
      -- reembolso pessoal: sai dos totais operacionais
      (1, 4, 'Despesa',  172.06, '2026-10-31', '2026-10-31', 'Pendente', true, false, NULL);
  `);
}

const janela = { de: "2026-09-01", ate: "2026-10-31" };

const mostrar = (rotulo, f) => {
  console.log(`\n=== ${rotulo} ===`);
  console.log(`período ${f.periodo.de} → ${f.periodo.ate} | ${f.meses.length} meses | saldo inicial ${f.saldo_inicial}`);
  for (const l of [...f.receitas, ...f.despesas, ...f.extras]) {
    console.log(`  [${l.grupo}] ${l.codigo ?? "-"} ${l.nome}: ${JSON.stringify(l.valores)} total ${l.total} (previsto ${l.total_previsto})`);
  }
  for (const m of f.meses) {
    console.log(`  ${m.rotulo}: +${m.entradas} -${m.saidas} = ${m.resultado} | acumulado ${m.saldo_final}${m.passado ? " (passado)" : " (previsto)"}`);
  }
  console.log(`  totais: ${JSON.stringify(f.totais)} | extras: "${f.extras_titulo}"`);
};

let falhas = 0;
const conferir = (rotulo, obtido, esperado) => {
  const ok = Math.abs(obtido - esperado) < 0.005;
  if (!ok) falhas++;
  console.log(`  ${ok ? "OK  " : "FALHA"} ${rotulo}: ${obtido} (esperado ${esperado})`);
};

try {
  await seed();

  const pf = await getFluxoProjetadoPF(1, 1, janela, exec);
  mostrar("PF", pf);
  console.log("\nConferências PF:");
  conferir("saldo inicial (5000 − 1200, ignora pendente)", pf.saldo_inicial, 3800);
  conferir("entradas do período", pf.totais.entradas, 10000);
  conferir("saídas do período (sem reembolsável)", pf.totais.saidas, 3200);
  conferir("saldo final (3800 + 10000 − 3200)", pf.totais.saldo_final, 10600);
  conferir("extras (reembolsável)", pf.totais.extras, 300);

  const pj = await getFluxoProjetadoPJ(1, janela, exec);
  mostrar("PJ", pj);
  console.log("\nConferências PJ:");
  conferir("saldo inicial (10000 banco + 2000 efetivado)", pj.saldo_inicial, 12000);
  conferir("entradas do período", pj.totais.entradas, 40000);
  conferir("saídas do período (sem reembolso pessoal)", pj.totais.saidas, 2420);
  conferir("saldo final (12000 + 40000 − 2420)", pj.totais.saldo_final, 49580);
  conferir("extras (reembolso pessoal)", pj.totais.extras, 172.06);

  const gruposPj = [...new Set([...pj.receitas, ...pj.despesas, ...pj.extras].map((l) => l.grupo))];
  console.log(`  grupos PJ (do plano de contas): ${gruposPj.join(" | ")}`);
  const gruposPf = [...new Set([...pf.receitas, ...pf.despesas, ...pf.extras].map((l) => l.grupo))];
  console.log(`  grupos PF (categorias): ${gruposPf.join(" | ")}`);

  console.log(falhas === 0 ? "\nTUDO OK" : `\n${falhas} FALHA(S)`);
  process.exit(falhas === 0 ? 0 : 1);
} catch (err) {
  console.error("ERRO:", err);
  process.exit(1);
}
