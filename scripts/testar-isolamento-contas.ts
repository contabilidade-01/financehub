/**
 * Isolamento PF × PJ e helpers de fatura/parcelas — chama as funções reais.
 */
import {
  competenciaDaCompra,
  ehFormaCartaoCredito,
  valoresParcelas,
} from "../server/services/fatura-core";
import {
  escolherContaPadraoPf,
  filtrarContasPorEscopo,
} from "../server/services/conta-bancaria.service";

let falhas = 0;
const ok = (nome: string) => console.log("ok  ", nome);
const fail = (nome: string, detalhe: string) => {
  falhas++;
  console.error("FAIL", nome, "—", detalhe);
};

// --- Isolamento de contas ---
{
  const contas = [
    { id: 1, usuario_id: 10, empresa_id: null as number | null, tipo: "carteira", ativo: true },
    { id: 2, usuario_id: 10, empresa_id: 99, tipo: "corrente", ativo: true },
    { id: 3, usuario_id: 20, empresa_id: null, tipo: "corrente", ativo: true },
    { id: 4, usuario_id: 10, empresa_id: 99, tipo: "poupanca", ativo: true },
  ];

  const pf = filtrarContasPorEscopo(contas, { usuarioId: 10 });
  if (pf.length !== 1 || pf[0].id !== 1) {
    fail("PF não vê conta de empresa", `obteve ${pf.map((c) => c.id)}`);
  } else ok("PF só vê conta com empresa_id NULL");

  const pj = filtrarContasPorEscopo(contas, { usuarioId: 10, empresaId: 99 });
  if (pj.length !== 2 || pj.some((c) => c.empresa_id !== 99)) {
    fail("PJ não vê conta de PF", `obteve ${pj.map((c) => c.id)}`);
  } else ok("PJ só vê contas da empresa");

  const outro = filtrarContasPorEscopo(contas, { usuarioId: 20 });
  if (outro.length !== 1 || outro[0].id !== 3) {
    fail("isolamento por usuario_id", `obteve ${outro.map((c) => c.id)}`);
  } else ok("PF de outro usuário isolado");
}

// --- Conta padrão (não pelo nome) ---
{
  const contas = [
    { id: 5, tipo: "corrente", ativo: true },
    { id: 7, tipo: "carteira", ativo: true },
    { id: 9, tipo: "carteira", ativo: false },
  ];
  const id = escolherContaPadraoPf(contas);
  if (id !== 7) fail("conta padrão = tipo carteira ativa", `obteve ${id}`);
  else ok("conta padrão prioriza tipo carteira (mesmo renomeada)");

  const soCorrente = escolherContaPadraoPf([{ id: 1, tipo: "corrente", ativo: true }]);
  if (soCorrente !== 1) fail("fallback primeira ativa", `obteve ${soCorrente}`);
  else ok("fallback para primeira conta ativa");
}

// --- Cartão sem limite ainda é cartão ---
{
  if (!ehFormaCartaoCredito({ dia_fechamento: 5, dia_vencimento: 15 })) {
    fail("cartão com dias", "deveria ser cartão");
  } else ok("cartão identificado por dias de fechamento/vencimento");

  if (ehFormaCartaoCredito({ dia_fechamento: null, dia_vencimento: null })) {
    fail("PIX não é cartão", "dias nulos");
  } else ok("forma sem dias não é cartão (mesmo com limite)");
}

// --- Parcelas com centavos ---
{
  const v = valoresParcelas(100, 3);
  const soma = Math.round(v.reduce((s, x) => s + x, 0) * 100) / 100;
  if (v.length !== 3 || soma !== 100 || v[0] !== 33.33 || v[2] !== 33.34) {
    fail("100/3 parcelas", JSON.stringify(v));
  } else ok("parcelas 100/3 → 33,33 + 33,33 + 33,34");

  const um = valoresParcelas(50.5, 1);
  if (um[0] !== 50.5) fail("1 parcela", JSON.stringify(um));
  else ok("1 parcela preserva o total");
}

// --- Competência ---
{
  const r = competenciaDaCompra("2026-03-20", 10, 17);
  // dia 20 > fechamento 10 → competência do mês seguinte
  if (r.competencia !== "2026-04") fail("competência após fechamento", r.competencia);
  else ok("competenciaDaCompra após fechamento");
}

console.log(falhas ? `\n${falhas} falha(s)` : "\nIsolamento + helpers: OK");
process.exitCode = falhas ? 1 : 0;
