// Regra de qual plano vale para cada tipo de pessoa (PF/PJ).
// É a mesma função usada para LISTAR planos ao cliente e para ESCOLHER o plano
// da cobrança — se ela errar, o cliente vê um preço e é cobrado outro.
import { filtrarPlanosPorTipo } from "../server/storage";

type Plano = { planCode: string; priceMonthly: string; tipoPessoa?: string | null };

// Ordenados por preço, como vêm do banco (orderBy priceMonthly).
const GENERICO: Plano = { planCode: "basico", priceMonthly: "49.00", tipoPessoa: null };
const PF: Plano = { planCode: "pf", priceMonthly: "49.00", tipoPessoa: "fisica" };
const PJ: Plano = { planCode: "pj", priceMonthly: "99.00", tipoPessoa: "juridica" };

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
console.log(`\n${CASOS.length - falhas}/${CASOS.length} passaram`);
process.exit(falhas === 0 ? 0 : 1);
