// Regra de qual plano vale para cada tipo de pessoa (PF/PJ).
// É a mesma função usada para LISTAR planos ao cliente e para ESCOLHER o plano
// da cobrança — se ela errar, o cliente vê um preço e é cobrado outro.
import { filtrarPlanosPorTipo } from "../server/storage";

type Plano = { planCode: string; priceMonthly: string; tipoPessoa?: string | null };

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

  // Sem tipo definido: nunca deve devolver plano tipado (o serviço recusa a cobrança).
  { nome: "tipo indefinido → só genéricos", planos: [GENERICO, PF, PJ], tipo: null, esperado: ["basico"] },
  { nome: "tipo indefinido e nenhum genérico → vazio", planos: [PF, PJ], tipo: null, esperado: [] },

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

const total = CASOS.length + PRECOS.length;
console.log(`\n${total - falhas}/${total} passaram`);
process.exit(falhas === 0 ? 0 : 1);
