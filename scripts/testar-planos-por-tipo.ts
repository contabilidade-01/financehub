// Regra de qual plano vale para cada tipo de pessoa (PF/PJ).
// É a mesma função usada para LISTAR planos ao cliente e para ESCOLHER o plano
// da cobrança — se ela errar, o cliente vê um preço e é cobrado outro.
import { filtrarPlanosPorTipo } from "../server/storage";
import { resolverPlanoDoUsuario } from "../server/services/resolver-plano";

type Plano = { planCode: string; priceMonthly: string; tipoPessoa?: string | null; portePj?: string | null };

// Ordenados por preço, como vêm do banco (orderBy priceMonthly).
// Os valores são os reais do negócio: PF 39,90 e PJ 79,90.
const GENERICO: Plano = { planCode: "basico", priceMonthly: "49.00", tipoPessoa: null };
const PF: Plano = { planCode: "pf", priceMonthly: "39.90", tipoPessoa: "fisica" };
const PJ: Plano = { planCode: "pj", priceMonthly: "79.90", tipoPessoa: "juridica" };

type Caso = {
  nome: string;
  planos: Plano[];
  tipo: string | null;
  esperado: string[]; // planCodes esperados, em ordem
};

const CASOS: Caso[] = [
  // Compatibilidade: quem só tem um plano continua funcionando igual.
  { nome: "só plano genérico → PF recebe o genérico", planos: [GENERICO], tipo: "fisica", esperado: ["basico"] },
  { nome: "só plano genérico → PJ recebe o genérico", planos: [GENERICO], tipo: "juridica", esperado: ["basico"] },

  // O caso do Jean: dois preços, um por tipo.
  { nome: "PF e PJ cadastrados → PF vê só o de PF", planos: [PF, PJ], tipo: "fisica", esperado: ["pf"] },
  { nome: "PF e PJ cadastrados → PJ vê só o de PJ", planos: [PF, PJ], tipo: "juridica", esperado: ["pj"] },

  // Transição: criou o de PF mas ainda não o de PJ.
  { nome: "PF tipado + genérico → PF ignora o genérico", planos: [GENERICO, PF], tipo: "fisica", esperado: ["pf"] },
  { nome: "PF tipado + genérico → PJ cai no genérico", planos: [GENERICO, PF], tipo: "juridica", esperado: ["basico"] },

  // Sem tipo definido = PF (cliente antigo/nulo não fica sem plano; ver filtrarPlanosPorTipo).
  // O checkout ainda recusa cobrar quem não tem tipo definido.
  { nome: "tipo indefinido → tratado como PF", planos: [GENERICO, PF, PJ], tipo: null, esperado: ["pf"] },
  { nome: "tipo indefinido sem plano PF → genérico", planos: [GENERICO, PJ], tipo: null, esperado: ["basico"] },

  // O serviço usa o primeiro: precisa ser o mais barato daquele tipo.
  {
    nome: "dois planos do mesmo tipo → mantém ordem (mais barato primeiro)",
    planos: [
      { planCode: "pj-basico", priceMonthly: "99.00", tipoPessoa: "juridica" },
      { planCode: "pj-pro", priceMonthly: "199.00", tipoPessoa: "juridica" },
    ],
    tipo: "juridica",
    esperado: ["pj-basico", "pj-pro"],
  },
];

let falhas = 0;
let extras = 0;
console.log("caso".padEnd(58), "| esperado        | obtido");
console.log("-".repeat(100));
for (const c of CASOS) {
  const obtido = filtrarPlanosPorTipo(c.planos, c.tipo).map((p) => p.planCode);
  const ok = JSON.stringify(obtido) === JSON.stringify(c.esperado);
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok  " : "FALHA"} ${c.nome}`.padEnd(58),
    "|", JSON.stringify(c.esperado).padEnd(15),
    "|", JSON.stringify(obtido),
  );
}
// --- Preço que cada tipo vê e paga (regra de negócio: PF 39,90 / PJ 79,90) ---
// Cobre o caminho inteiro: é a mesma função que alimenta a lista do checkout,
// o checkout externo por link e a escolha do plano da cobrança no Asaas.
const PRECOS: { nome: string; tipo: string; esperado: string }[] = [
  { nome: "PF assina/renova → 39,90", tipo: "fisica", esperado: "39.90" },
  { nome: "PJ assina/renova → 79,90", tipo: "juridica", esperado: "79.90" },
];
for (const p of PRECOS) {
  const doTipo = filtrarPlanosPorTipo([PF, PJ], p.tipo);
  const preco = doTipo[0]?.priceMonthly;
  const soUm = doTipo.length === 1; // sem escolha: um plano por tipo
  const ok = preco === p.esperado && soUm;
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok  " : "FALHA"} ${p.nome}`.padEnd(58),
    "|", p.esperado.padEnd(15),
    "|", `${preco} (${doTipo.length} plano)`,
  );
}

// --- Modalidade PJ MEI / PJ ME (preço do PJ ME fixado pelo admin) ---
const PJ_ME: Plano = { planCode: "mensal_pj_me", priceMonthly: "129.90", tipoPessoa: "juridica", portePj: "me" };
const CONSULT: Plano = { planCode: "mensal_pj_consultoria", priceMonthly: "200.00", tipoPessoa: "juridica" };
const todos = [PF, PJ, PJ_ME, CONSULT].sort((a, b) => Number(a.priceMonthly) - Number(b.priceMonthly));
const PORTES: { nome: string; tipo: string; porte: string | null; esperado: string[] }[] = [
  { nome: "PJ ME → só o plano ME", tipo: "juridica", porte: "me", esperado: ["mensal_pj_me"] },
  { nome: "PJ MEI → planos PJ sem porte", tipo: "juridica", porte: "mei", esperado: ["pj", "mensal_pj_consultoria"] },
  { nome: "PJ legado (porte NULL) = MEI", tipo: "juridica", porte: null, esperado: ["pj", "mensal_pj_consultoria"] },
  { nome: "PF ignora porte", tipo: "fisica", porte: "me", esperado: ["pf"] },
];
for (const c of PORTES) {
  const obtido = filtrarPlanosPorTipo(todos, c.tipo, c.porte).map((p) => p.planCode);
  const ok = JSON.stringify(obtido) === JSON.stringify(c.esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"} ${c.nome}`.padEnd(58), "|", JSON.stringify(c.esperado), "|", JSON.stringify(obtido));
}
eq2("PJ ME sem plano ME → cai no PJ genérico", filtrarPlanosPorTipo([PF, PJ, CONSULT], "juridica", "me").map((p) => p.planCode), ["pj", "mensal_pj_consultoria"]);

// resolverPlanoDoUsuario: mesma regra de checkout, renovação e reajuste no Asaas
const comId = todos.map((p, i) => ({ ...p, id: i + 1, active: true }));
const idDe = (code: string) => comId.find((p) => p.planCode === code)!.id;
eq2("resolver: PJ ME → mensal_pj_me", resolverPlanoDoUsuario({ tipo_pessoa: "juridica", porte_pj: "me" }, comId)?.planCode, "mensal_pj_me");
eq2("resolver: PJ MEI → pj (mais barato)", resolverPlanoDoUsuario({ tipo_pessoa: "juridica", porte_pj: "mei" }, comId)?.planCode, "pj");
eq2("resolver: consultoria forçada vale para MEI", resolverPlanoDoUsuario({ tipo_pessoa: "juridica", porte_pj: "mei", plano_forcado_id: idDe("mensal_pj_consultoria") }, comId)?.planCode, "mensal_pj_consultoria");
eq2("resolver: consultoria forçada vale para ME", resolverPlanoDoUsuario({ tipo_pessoa: "juridica", porte_pj: "me", plano_forcado_id: idDe("mensal_pj_consultoria") }, comId)?.planCode, "mensal_pj_consultoria");
eq2("resolver: forçado de outro tipo é ignorado", resolverPlanoDoUsuario({ tipo_pessoa: "fisica", plano_forcado_id: idDe("mensal_pj_me") }, comId)?.planCode, "pf");

function eq2(nome: string, obtido: unknown, esperado: unknown) {
  extras++;
  const ok = JSON.stringify(obtido) === JSON.stringify(esperado);
  if (!ok) falhas++;
  console.log(`${ok ? "ok  " : "FALHA"} ${nome}`.padEnd(58), "|", JSON.stringify(esperado), "|", JSON.stringify(obtido));
}

const total = CASOS.length + PRECOS.length + PORTES.length + extras;
console.log(`\n${total - falhas}/${total} passaram`);
process.exit(falhas === 0 ? 0 : 1);
