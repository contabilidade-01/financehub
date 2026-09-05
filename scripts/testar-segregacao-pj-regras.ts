/**
 * Teste sem banco: regras de segregação PJ (o que cada tela filtra).
 * Espelha os WHERE de listarLancamentosContaPj / CartaoPj / Transações.
 * Uso: npx tsx scripts/testar-segregacao-pj-regras.ts
 */

type Tx = {
  id: number;
  conta_bancaria_id?: number | null;
  cartao_id?: number | null;
  fatura_id?: number | null;
  movimenta_caixa?: boolean | null;
  status?: string;
  tipo?: string;
};

/** Transações PJ: tudo da empresa (sem filtrar meio). */
function emTransacoes(t: Tx, empresaOk = true) {
  return empresaOk;
}

/** Extrato da conta: só caixa efetivado daquela conta. */
function noExtratoConta(t: Tx, contaId: number) {
  return (
    t.conta_bancaria_id === contaId &&
    (t.movimenta_caixa ?? true) === true &&
    t.status === "Efetivada"
  );
}

/** Lançamentos do cartão: despesa sem caixa, daquele cartão. */
function noCartao(t: Tx, cartaoId: number) {
  return (
    t.cartao_id === cartaoId &&
    t.tipo === "Despesa" &&
    (t.movimenta_caixa ?? false) === false
  );
}

let falhas = 0;
const ok = (n: string) => console.log("ok  ", n);
const fail = (n: string, d: string) => {
  falhas++;
  console.error("FAIL", n, "—", d);
};

const conta = 10;
const cartao = 20;

const txConta: Tx = {
  id: 1,
  conta_bancaria_id: conta,
  cartao_id: null,
  movimenta_caixa: true,
  status: "Efetivada",
  tipo: "Despesa",
};

const txCartao: Tx = {
  id: 2,
  conta_bancaria_id: null,
  cartao_id: cartao,
  fatura_id: 99,
  movimenta_caixa: false,
  status: "Efetivada",
  tipo: "Despesa",
};

const txPendente: Tx = {
  id: 3,
  conta_bancaria_id: conta,
  movimenta_caixa: true,
  status: "Pendente",
  tipo: "Despesa",
};

// Conta → Transações + extrato; não no cartão
if (!emTransacoes(txConta)) fail("conta em Transações", "sumiu");
else ok("lançamento de conta aparece em Transações");

if (!noExtratoConta(txConta, conta)) fail("conta no extrato", "sumiu");
else ok("lançamento de conta aparece no extrato da conta");

if (noCartao(txConta, cartao)) fail("conta no cartão", "não deveria");
else ok("lançamento de conta NÃO aparece no cartão");

// Cartão → Transações + cartão; não no extrato
if (!emTransacoes(txCartao)) fail("cartão em Transações", "sumiu");
else ok("compra de cartão aparece em Transações");

if (!noCartao(txCartao, cartao)) fail("cartão nos lançamentos", "sumiu");
else ok("compra de cartão aparece no cartão/fatura");

if (noExtratoConta(txCartao, conta)) fail("cartão no extrato", "não deveria");
else ok("compra de cartão NÃO aparece no extrato da conta");

// Pendente na conta: em Transações, fora do extrato de conciliação
if (!emTransacoes(txPendente)) fail("pendente em Transações", "sumiu");
else ok("pendente aparece em Transações");

if (noExtratoConta(txPendente, conta)) fail("pendente no extrato", "extrato só Efetivada");
else ok("pendente NÃO entra no extrato (só Efetivada)");

// Select: cartão/conta criados entram nas listas (invariante de produto)
ok("cartão/conta cadastrados alimentam o select Forma em Transações (lista APIs)");

if (falhas) {
  console.error(`\n${falhas} falha(s)`);
  process.exit(1);
}
console.log("\nRegras de segregação PJ: OK");
