/**
 * Teste local: lançamentos PJ cruzam Transações ↔ Conta ↔ Cartão.
 * Uso:
 *   set DATABASE_URL=postgresql://financehub:financehub_test@127.0.0.1:5433/financehub
 *   npx tsx scripts/testar-segregacao-pj.ts
 *
 * Cria usuário/empresa se o banco estiver vazio; limpa os lançamentos de teste.
 */
import { pingDbOrSkip } from "./_db-test-helpers";
import { db } from "../server/db";
import { sql } from "drizzle-orm";
import { storage } from "../server/storage";
import { runAutoMigrations } from "../server/migrations/auto-migrate";
import { garantirCaixinhaPj, aplicarMeioPagamentoPj } from "../server/services/meio-pagamento-pj";
import {
  montarExtratoContaPj,
  listarLancamentosContaPj,
} from "../server/services/conta-bancaria.service";
import {
  criarCartao,
  registrarCompra,
  listarLancamentosCartaoPj,
  detalheFatura,
  listarCartoes,
} from "../server/services/fatura-pj.service";

const TAG = `__TEST_SEG__${Date.now()}`;
let falhas = 0;
const ok = (n: string) => console.log("ok  ", n);
const fail = (n: string, d: string) => {
  falhas++;
  console.error("FAIL", n, "—", d);
};

async function garantirEmpresa(): Promise<{ id: number; usuario_id: number }> {
  const existentes = await db.execute(sql`
    SELECT e.id, e.usuario_id
    FROM empresas e
    WHERE COALESCE(e.ativo, true) = true
    ORDER BY e.id
    LIMIT 1
  `);
  if ((existentes as any[])[0]) {
    return {
      id: Number((existentes as any[])[0].id),
      usuario_id: Number((existentes as any[])[0].usuario_id),
    };
  }

  const email = `seg-test-${Date.now()}@local.test`;
  const userRows = await db.execute(sql`
    INSERT INTO usuarios (nome, email, senha, tipo_pessoa, ativo, remotejid)
    VALUES ('Teste Segregacao', ${email}, 'x', 'juridica', true, '')
    RETURNING id
  `);
  const userId = Number((userRows as any[])[0].id);

  const empresa = await storage.createEmpresa({
    usuario_id: userId,
    razao_social: "Empresa Teste Segregacao LTDA",
    nome_fantasia: "Teste Seg",
    cnpj: String(Date.now()).slice(-14),
    segmento: "servicos",
    ativo: true,
  } as any);
  await storage.seedEmpresasContas(empresa.id);
  await garantirCaixinhaPj(empresa.id, userId);
  console.log(`bootstrap: empresa ${empresa.id} usuario ${userId}`);
  return { id: empresa.id, usuario_id: userId };
}

async function main() {
  if (!(await pingDbOrSkip(db, "testar-segregacao-pj"))) {
    process.exit(0);
  }
  console.log(
    "DB",
    String(process.env.DATABASE_URL || "").replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@"),
  );

  await runAutoMigrations();
  const emp = await garantirEmpresa();
  const empresaId = emp.id;
  const userId = emp.usuario_id;

  const contasPlano = await storage.getEmpresasContasByEmpresaId(empresaId);
  const despesa = contasPlano.find((c: any) => c.tipo === "Despesa");
  if (!despesa) {
    fail("plano", "sem conta Despesa");
    process.exit(1);
  }

  const caixa = await garantirCaixinhaPj(empresaId, userId);
  const cartao = await criarCartao(empresaId, {
    nome: `CC Test Seg ${Date.now()}`,
    bandeira: null,
    limite: "5000.00",
    dia_fechamento: 10,
    dia_vencimento: 17,
  });

  const hoje = new Date().toISOString().slice(0, 10);
  const idsCriados: number[] = [];

  try {
    const meioConta = await aplicarMeioPagamentoPj({
      userId,
      empresaId,
      tipo: "Despesa",
      dataISO: hoje,
      conta_bancaria_id: caixa.id,
      exigirMeio: true,
    });
    const txConta = await storage.createEmpresaTransacao({
      empresa_id: empresaId,
      categoria_id: despesa.id,
      descricao: `${TAG} conta`,
      valor: 41.5,
      tipo: "Despesa",
      data_transacao: hoje,
      status: "Efetivada",
      origem: "teste",
      cartao_id: meioConta.cartao_id,
      conta_bancaria_id: meioConta.conta_bancaria_id,
      fatura_id: meioConta.fatura_id,
      competencia: meioConta.competencia,
      movimenta_caixa: meioConta.movimenta_caixa,
      metodo_pagamento: meioConta.metodo_pagamento,
    } as any);
    idsCriados.push(txConta.id);

    const todas1 = await storage.getEmpresaTransacoesByEmpresaId(empresaId, {
      de: hoje,
      ate: hoje,
    });
    if (!todas1.some((t) => t.id === txConta.id)) {
      fail("conta→transações", `id ${txConta.id} não listado`);
    } else ok("lançamento na conta aparece em Transações");

    const extrato = await montarExtratoContaPj(empresaId, caixa.id, hoje, hoje);
    if (!extrato.lancamentos.some((l) => l.id === txConta.id)) {
      fail("conta→extrato", `id ${txConta.id} não no extrato`);
    } else ok("lançamento na conta aparece no extrato");

    const ultima = extrato.lancamentos[extrato.lancamentos.length - 1];
    if (ultima && Math.abs(Number(ultima.saldo) - extrato.saldo_final) > 0.02) {
      fail("saldo acumulado", `${ultima.saldo} vs ${extrato.saldo_final}`);
    } else ok("extrato: saldo da última linha = saldo final");

    const noCartao = await listarLancamentosCartaoPj(empresaId, cartao.id, hoje, hoje);
    if (noCartao.some((l) => l.id === txConta.id)) {
      fail("conta NÃO no cartão", "vazou no cartão");
    } else ok("lançamento de conta não aparece no cartão");

    const { compra, fatura } = await registrarCompra(empresaId, cartao, {
      categoria_id: despesa.id,
      descricao: `${TAG} cartao`,
      valor: 77.2,
      data_transacao: hoje,
    });
    idsCriados.push(Number(compra.id));

    const todas2 = await storage.getEmpresaTransacoesByEmpresaId(empresaId, {
      de: hoje,
      ate: hoje,
    });
    if (!todas2.some((t) => t.id === Number(compra.id))) {
      fail("cartão→transações", `compra ${compra.id} não em Transações`);
    } else ok("compra no cartão aparece em Transações");

    const lancCartao = await listarLancamentosCartaoPj(empresaId, cartao.id, hoje, hoje);
    if (!lancCartao.some((l) => l.id === Number(compra.id))) {
      fail("cartão→lançamentos", `compra ${compra.id} não no cartão`);
    } else ok("compra aparece nos lançamentos do cartão");

    const det = await detalheFatura(fatura.id);
    if (!det?.compras?.some((c: any) => c.id === Number(compra.id))) {
      fail("cartão→fatura", `compra ${compra.id} não na fatura`);
    } else ok("compra aparece na fatura do cartão");

    const extrato2 = await listarLancamentosContaPj(empresaId, caixa.id, hoje, hoje);
    if (extrato2.some((l) => l.id === Number(compra.id))) {
      fail("cartão NÃO no extrato", "compra vazou no extrato");
    } else ok("compra de cartão não mexe no extrato da conta");

    const meioCc = await aplicarMeioPagamentoPj({
      userId,
      empresaId,
      tipo: "Despesa",
      dataISO: hoje,
      cartao_id: cartao.id,
      exigirMeio: true,
    });
    const txCc = await storage.createEmpresaTransacao({
      empresa_id: empresaId,
      categoria_id: despesa.id,
      descricao: `${TAG} form-cc`,
      valor: 12,
      tipo: "Despesa",
      data_transacao: hoje,
      status: "Efetivada",
      origem: "teste",
      cartao_id: meioCc.cartao_id,
      conta_bancaria_id: meioCc.conta_bancaria_id,
      fatura_id: meioCc.fatura_id,
      competencia: meioCc.competencia,
      movimenta_caixa: meioCc.movimenta_caixa,
      metodo_pagamento: meioCc.metodo_pagamento,
    } as any);
    idsCriados.push(txCc.id);

    const todas3 = await storage.getEmpresaTransacoesByEmpresaId(empresaId, {
      de: hoje,
      ate: hoje,
    });
    if (!todas3.some((t) => t.id === txCc.id)) {
      fail("form-cc→transações", `id ${txCc.id} sumiu`);
    } else ok("lançamento Transações+cartão aparece em Transações");

    const lanc3 = await listarLancamentosCartaoPj(empresaId, cartao.id, hoje, hoje);
    if (!lanc3.some((l) => l.id === txCc.id)) {
      fail("form-cc→cartão", `id ${txCc.id} não no cartão`);
    } else ok("lançamento Transações+cartão aparece no cartão");

    const cartoesLista = await listarCartoes(empresaId);
    if (!cartoesLista.some((c) => c.id === cartao.id)) {
      fail("cartão listável", "não aparece em listarCartoes");
    } else ok("cartão criado aparece na lista (select Forma)");

    if (!caixa?.id) fail("caixinha", "sem Caixinha");
    else ok("conta Caixinha disponível no select Forma");

    const { resolverMeioPorNomePj } = await import("../server/services/meio-pagamento-pj");
    const { criarForma } = await import("../server/services/empresa-forma.service");
    try {
      await criarForma(empresaId, { nome: "PIX Fake", tipo: "pix" });
      fail("porta formas", "ainda permite criar forma solta");
    } catch {
      ok("criar forma solta bloqueado");
    }

    const vazio = await resolverMeioPorNomePj(empresaId, userId, "");
    if (!vazio.ok && vazio.precisa === "meio") {
      ok("sem forma → pergunta (não assume Caixinha)");
    } else {
      fail("sem forma", JSON.stringify(vazio));
    }

    const din = await resolverMeioPorNomePj(empresaId, userId, "dinheiro");
    if (din.ok && din.conta_bancaria_id === caixa.id) {
      ok("dinheiro → Caixinha");
    } else {
      fail("dinheiro", JSON.stringify(din));
    }
  } finally {
    for (const id of idsCriados) {
      await db.execute(
        sql`DELETE FROM empresas_transacoes WHERE id = ${id} AND descricao LIKE ${TAG + "%"}`,
      );
    }
    await db.execute(sql`
      DELETE FROM empresas_faturas
      WHERE cartao_id = ${cartao.id}
        AND NOT EXISTS (
          SELECT 1 FROM empresas_transacoes t WHERE t.fatura_id = empresas_faturas.id
        )
    `);
    await db.execute(sql`DELETE FROM empresas_cartoes WHERE id = ${cartao.id}`);
  }

  if (falhas) {
    console.error(`\n${falhas} falha(s)`);
    process.exit(1);
  }
  console.log("\nSegregação PJ (Transações ↔ Conta ↔ Cartão): OK");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
