/**
 * Isolamento PF × PJ e helpers de fatura/parcelas — chama as funções reais.
 */
import {
  competenciaDaCompra,
  competenciaMaisMeses,
  datasDaCompetencia,
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

  // A última parcela deve DESCER, nunca subir: truncar empilhava a sobra nela
  // e virava R$ 4,24 no meio de onze de R$ 4,16 — o cliente lê como acréscimo.
  const doze = valoresParcelas(50, 12);
  const somaDoze = Math.round(doze.reduce((s, x) => s + x, 0) * 100) / 100;
  if (somaDoze !== 50 || doze[0] !== 4.17 || doze[11] !== 4.13) {
    fail("50/12 — última deve ser menor", JSON.stringify(doze));
  } else ok("parcelas 50/12 → onze de 4,17 e a última 4,13 (menor)");

  const seis = valoresParcelas(1000, 6);
  if (seis[0] !== 166.67 || seis[5] !== 166.65) {
    fail("1000/6", JSON.stringify(seis));
  } else ok("parcelas 1000/6 → cinco de 166,67 e a última 166,65");

  // Nenhuma parcela pode ser negativa, nem no caso absurdo.
  const centavos = valoresParcelas(0.1, 12);
  const somaCentavos = Math.round(centavos.reduce((s, x) => s + x, 0) * 100) / 100;
  if (centavos.some((x) => x < 0) || somaCentavos !== 0.1) {
    fail("0,10 em 12x não pode ter parcela negativa", JSON.stringify(centavos));
  } else ok("0,10 em 12x sem parcela negativa e fecha no total");

  // Invariante geral: a soma sempre fecha, em qualquer combinação.
  let somaOk = true;
  for (const total of [0.05, 9.99, 33.33, 100, 999.97, 1234.56]) {
    for (let n = 1; n <= 24; n++) {
      const p = valoresParcelas(total, n);
      const s = Math.round(p.reduce((a, b) => a + b, 0) * 100) / 100;
      if (s !== total || p.some((x) => x < 0)) {
        somaOk = false;
        fail(`soma não fecha em ${total}/${n}x`, JSON.stringify(p));
        break;
      }
    }
  }
  if (somaOk) ok("soma fecha e nada fica negativo em 144 combinações");
}

// --- Competência ---
{
  const r = competenciaDaCompra("2026-03-20", 10, 17);
  // dia 20 > fechamento 10 → competência do mês seguinte
  if (r.competencia !== "2026-04") fail("competência após fechamento", r.competencia);
  else ok("competenciaDaCompra após fechamento");

  // Compra NO dia do fechamento ainda entra na fatura corrente.
  const noDia = competenciaDaCompra("2026-03-10", 10, 17);
  if (noDia.competencia !== "2026-03") fail("compra no dia do fechamento", noDia.competencia);
  else ok("compra no dia do fechamento fica na fatura corrente");

  // Dia 29/30/31 não pode virar 28 — o vencimento real é o que a pessoa paga.
  const venc29 = competenciaDaCompra("2026-03-10", 1, 29);
  if (venc29.dataVenc !== "2026-04-29") fail("vencimento dia 29", venc29.dataVenc);
  else ok("vencimento dia 29 não é truncado para 28");

  const fecha30 = competenciaDaCompra("2026-01-29", 30, 7);
  if (fecha30.competencia !== "2026-01" || fecha30.dataFech !== "2026-01-30") {
    fail("fechamento dia 30", `${fecha30.competencia} / ${fecha30.dataFech}`);
  } else ok("fechamento dia 30 não fica anterior à compra do dia 29");

  // Dia inexistente cai no último dia real do mês.
  const fev = competenciaDaCompra("2026-02-10", 1, 31);
  if (fev.dataVenc !== "2026-03-31") fail("dia 31 no mês seguinte", fev.dataVenc);
  else ok("dia inexistente cai no último dia do mês");

  const bissexto = competenciaDaCompra("2028-01-10", 1, 29);
  if (bissexto.dataVenc !== "2028-02-29") fail("29/02 em ano bissexto", bissexto.dataVenc);
  else ok("29 de fevereiro existe em ano bissexto");
}

// --- Parcelamento: cada parcela numa fatura diferente ---
{
  // Ancorar a competencia e o que o parcelamento faz hoje. Reaplicar a regra de
  // fechamento sobre a data deslocada colocava duas parcelas na MESMA fatura
  // sempre que a compra caia num dia que o mes seguinte nao tem.
  const casos: Array<[string, number, number, number]> = [
    ["2026-01-31", 30, 7, 3],   // fevereiro nao tem dia 31
    ["2026-01-31", 28, 10, 4],
    ["2026-03-31", 30, 15, 2],
    ["2026-01-29", 28, 5, 13],  // atravessa fevereiro e a virada de ano
  ];
  let colisao = false;
  for (const [dataCompra, fech, venc, n] of casos) {
    const base = competenciaDaCompra(dataCompra, fech, venc).competencia;
    const comps = Array.from({ length: n }, (_, i) => competenciaMaisMeses(base, i));
    if (new Set(comps).size !== n) {
      colisao = true;
      fail(`parcelas repetem fatura (${dataCompra}, fecha ${fech})`, comps.join(", "));
    }
  }
  if (!colisao) ok("cada parcela cai numa competencia distinta, inclusive em fim de mes");

  // A competencia ancorada mantem as datas certas da fatura.
  const d = datasDaCompetencia("2026-02", 30, 7);
  if (d.dataFech !== "2026-02-28" || d.dataVenc !== "2026-03-07") {
    fail("datasDaCompetencia fev/fechamento 30", `${d.dataFech} / ${d.dataVenc}`);
  } else ok("fechamento 30 em fevereiro vira 28 e o vencimento vai para marco");

  // Mesmo resultado da regra por data quando nao ha fim de mes envolvido.
  const porData = competenciaDaCompra("2026-03-20", 10, 17);
  const porComp = datasDaCompetencia(porData.competencia, 10, 17);
  if (porComp.dataFech !== porData.dataFech || porComp.dataVenc !== porData.dataVenc) {
    fail("datasDaCompetencia diverge de competenciaDaCompra", JSON.stringify([porData, porComp]));
  } else ok("as duas rotas dao as mesmas datas de fechamento e vencimento");
}

console.log(falhas ? `\n${falhas} falha(s)` : "\nIsolamento + helpers: OK");
process.exitCode = falhas ? 1 : 0;
