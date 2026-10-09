/**
 * Plano de contas PJ — modelos Base Serviços / Base Comércio e regras puras
 * (grupo, pai, próximo código). Sem banco. npm run test:plano-contas
 */
import { MODELO_COMERCIO, MODELO_SERVICOS, codigoPai, modeloDoSegmento, type ContaModelo } from "../server/data/plano-contas-pj-modelos";
import { compararCodigos, grupoDaConta, proximoCodigoFilho, resolverPai, prefixoLegado, classificacaoDoGrupo } from "../server/services/plano-contas-pj";

let falhas = 0;
let total = 0;
const eq = (nome: string, obtido: unknown, esperado: unknown) => {
  total++;
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) return;
  falhas++;
  console.error(`FAIL ${nome}\n     obtido:   ${JSON.stringify(obtido)}\n     esperado: ${JSON.stringify(esperado)}`);
};

function validarModelo(nome: string, m: ContaModelo[]) {
  const codigos = m.map((c) => c.codigo);
  eq(`${nome}: códigos únicos`, new Set(codigos).size, codigos.length);
  const porCodigo = new Map(m.map((c) => [c.codigo, c]));
  const orfas = m.filter((c) => !c.sintetica && !porCodigo.get(codigoPai(c.codigo) || "")?.sintetica).map((c) => c.codigo);
  eq(`${nome}: toda analítica tem grupo pai`, orfas, []);
  // Grupo antes das filhas (o seed depende da ordem para achar o parent_id).
  const foraDeOrdem = m.filter((c, i) => {
    const p = codigoPai(c.codigo);
    return p !== null && codigos.indexOf(p) > i;
  }).map((c) => c.codigo);
  eq(`${nome}: grupos antes das filhas`, foraDeOrdem, []);
  // Filha no mesmo grupo gerencial do pai (senão a DRE soma no lugar errado).
  const grupoTrocado = m.filter((c) => !c.sintetica && porCodigo.get(codigoPai(c.codigo)!)!.grupo !== c.grupo).map((c) => c.codigo);
  eq(`${nome}: filha no grupo gerencial do pai`, grupoTrocado, []);
  const classificacaoIncoerente = m.filter((c) => c.tipo === "Despesa" && !c.sintetica && classificacaoDoGrupo(c.grupo) !== c.classificacao).map((c) => c.codigo);
  eq(`${nome}: classificação coerente com o grupo`, classificacaoIncoerente, []);
  eq(`${nome}: tem conta de custo (CMV/CSP) para o markup`, m.some((c) => c.is_cmv), true);
  eq(`${nome}: CMV só em custo variável`, m.filter((c) => c.is_cmv && c.grupo !== "custo_variavel").map((c) => c.codigo), []);
  eq(`${nome}: receita operacional só no grupo 1`, m.filter((c) => c.grupo === "receita" && !c.codigo.startsWith("1")).map((c) => c.codigo), []);
  for (const g of ["receita", "deducao", "custo_variavel", "despesa_fixa", "financeiro", "investimento", "nao_operacional"]) {
    eq(`${nome}: grupo ${g} presente`, m.some((c) => c.sintetica && c.grupo === g), true);
  }
}

validarModelo("Comércio", MODELO_COMERCIO);
validarModelo("Serviços", MODELO_SERVICOS);
eq("Comércio: CMV de mercadoria", MODELO_COMERCIO.find((c) => c.codigo === "3.01")?.nome.includes("CMV"), true);
eq("Serviços: receita principal é serviço", MODELO_SERVICOS.find((c) => c.codigo === "1.01")?.nome, "Prestação de serviços");

// Segmento → modelo
eq("segmento servicos", modeloDoSegmento("servicos"), "servicos");
eq("segmento comercio", modeloDoSegmento("comercio"), "comercio");
eq("segmento misto usa comércio", modeloDoSegmento("misto"), "comercio");
eq("segmento vazio usa comércio", modeloDoSegmento(null), "comercio");

// Grupo derivado (plano antigo, sem grupo_gerencial)
eq("grupo: receita", grupoDaConta({ tipo: "Receita", classificacao: "OUTRA" }), "receita");
eq("grupo: fixa", grupoDaConta({ tipo: "Despesa", classificacao: "FIXA" }), "despesa_fixa");
eq("grupo: variável", grupoDaConta({ tipo: "Despesa", classificacao: "VARIAVEL" }), "custo_variavel");
eq("grupo: informado vence", grupoDaConta({ tipo: "Despesa", classificacao: "VARIAVEL", grupo_gerencial: "deducao" }), "deducao");
eq("grupo: inválido cai no derivado", grupoDaConta({ tipo: "Despesa", classificacao: "OUTRA", grupo_gerencial: "xyz" }), "outras");

// Pai e próximo código num plano com grupos
const plano = MODELO_COMERCIO.map((c, i) => ({ id: i + 1, codigo: c.codigo, nome: c.nome, tipo: c.tipo, classificacao: c.classificacao, grupo_gerencial: c.grupo, sintetica: !!c.sintetica }));
eq("pai: despesa fixa nova vai para 4", resolverPai(plano, { tipo: "Despesa", classificacao: "FIXA" })?.codigo, "4");
eq("pai: receita nova vai para 1", resolverPai(plano, { tipo: "Receita", classificacao: "OUTRA" })?.codigo, "1");
eq("pai: dedução vai para 2", resolverPai(plano, { tipo: "Despesa", classificacao: "VARIAVEL", grupo_gerencial: "deducao" })?.codigo, "2");
eq("pai: grupo inativo é ignorado", resolverPai(plano.map((c) => (c.codigo === "4" ? { ...c, ativo: false } : c)), { tipo: "Despesa", classificacao: "FIXA" }), null);
eq("pai: plano antigo sem grupos", resolverPai([{ id: 1, codigo: "2.01", nome: "Folha", tipo: "Despesa", classificacao: "FIXA" }], { tipo: "Despesa", classificacao: "FIXA" }), null);
eq("código: próxima fixa", proximoCodigoFilho(plano, "4"), "4.16");
eq("código: próxima receita", proximoCodigoFilho(plano, "1"), "1.05");
eq("código: sub-conta", proximoCodigoFilho(plano, "4.01"), "4.01.01");
eq("código: não reaproveita buraco abaixo do maior", proximoCodigoFilho([{ codigo: "3.01" }, { codigo: "3.05" }], "3"), "3.06");
eq("código: grupo vazio", proximoCodigoFilho([], "9"), "9.01");
eq("legado: fixa → 2", prefixoLegado("Despesa", "FIXA"), "2");
eq("legado: outra → 4", prefixoLegado("Despesa", "OUTRA"), "4");
eq("legado: receita → 1", prefixoLegado("Receita"), "1");

// Ordenação numérica
eq("ordem", ["4.10", "1", "4.2", "4.02.01", "10", "2"].sort(compararCodigos), ["1", "2", "4.2", "4.02.01", "4.10", "10"]);

console.log(`\n${total - falhas}/${total} cenários OK`);
if (falhas) process.exit(1);
