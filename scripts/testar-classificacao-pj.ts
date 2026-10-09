// Teste do classificador PJ com o plano de contas do seed.
import { resolverContaPj, type ContaPjRef } from "../server/services/classificar-conta-pj";
import { MODELO_COMERCIO, MODELO_SERVICOS, type ContaModelo } from "../server/data/plano-contas-pj-modelos";

// Contas analíticas dos modelos novos (o que a IA enxerga: grupo sintético não entra).
const doModelo = (m: ContaModelo[]): ContaPjRef[] =>
  m.filter((c) => !c.sintetica).map((c, i) => ({ id: 100 + i, codigo: c.codigo, nome: c.nome, tipo: c.tipo, is_cmv: !!c.is_cmv }));
const COMERCIO = doModelo(MODELO_COMERCIO);
const SERVICOS = doModelo(MODELO_SERVICOS);

const PLANO: ContaPjRef[] = [
  { id: 1, codigo: "1.01", nome: "Receita de Vendas", tipo: "Receita" },
  { id: 2, codigo: "1.02", nome: "Receita de Serviços", tipo: "Receita" },
  { id: 3, codigo: "1.03", nome: "Outras Receitas Operacionais", tipo: "Receita" },
  { id: 4, codigo: "1.04", nome: "Receitas Financeiras", tipo: "Receita" },
  { id: 5, codigo: "2.01", nome: "Folha de Pagamento", tipo: "Despesa" },
  { id: 6, codigo: "2.02", nome: "Aluguel", tipo: "Despesa" },
  { id: 7, codigo: "2.03", nome: "Energia / Água / Internet", tipo: "Despesa" },
  { id: 8, codigo: "2.04", nome: "Contabilidade", tipo: "Despesa" },
  { id: 9, codigo: "2.05", nome: "Impostos e Taxas", tipo: "Despesa" },
  { id: 10, codigo: "2.06", nome: "Pró-labore / Retiradas", tipo: "Despesa" },
  { id: 11, codigo: "3.01", nome: "Compras de Mercadoria (CMV)", tipo: "Despesa", is_cmv: true },
  { id: 12, codigo: "3.02", nome: "Matéria-prima / Insumos", tipo: "Despesa" },
  { id: 13, codigo: "3.03", nome: "Comissão de Vendedores", tipo: "Despesa" },
  { id: 14, codigo: "3.04", nome: "Frete", tipo: "Despesa" },
  { id: 15, codigo: "3.05", nome: "Marketing / Anúncios", tipo: "Despesa" },
  { id: 16, codigo: "3.06", nome: "Despesas Financeiras", tipo: "Despesa" },
  { id: 17, codigo: "4.01", nome: "Outras Despesas Operacionais", tipo: "Despesa" },
];

// Empresa que criou contas próprias de veículo (caso ideal).
const PLANO_COM_VEICULO: ContaPjRef[] = [
  ...PLANO,
  { id: 18, codigo: "3.07", nome: "Combustível", tipo: "Despesa" },
  { id: 19, codigo: "3.08", nome: "Manutenção de Veículos", tipo: "Despesa" },
];

type Caso = {
  nome: string;
  descricao: string;
  contaInformada?: string;
  tipo: "Receita" | "Despesa";
  plano?: ContaPjRef[];
  segmento?: string | null;
  esperado: string; // código esperado
};

const CASOS: Caso[] = [
  // --- os 4 que o Jean viu errados (contaInformada = o chute que o prompt induzia) ---
  { nome: "Despesa com carro (modelo chutou 2.05)", descricao: "Despesa com carro", contaInformada: "2.05", tipo: "Despesa", esperado: "4.01" },
  { nome: "Cartório com carro (modelo chutou 2.05)", descricao: "Despesa de cartório com carro", contaInformada: "2.05", tipo: "Despesa", esperado: "4.01" },
  { nome: "Abastecimento (modelo chutou 3.01/CMV)", descricao: "Abastecimento de carro", contaInformada: "3.01", tipo: "Despesa", esperado: "4.01" },
  { nome: "Entrada sem detalhe", descricao: "Entrada", tipo: "Receita", esperado: "1.03" },

  // --- mesmos casos numa empresa que TEM conta de veículo ---
  { nome: "Abastecimento c/ conta de Combustível", descricao: "Abastecimento de carro", contaInformada: "3.01", tipo: "Despesa", plano: PLANO_COM_VEICULO, esperado: "3.07" },
  { nome: "Oficina c/ conta de Manutenção", descricao: "paguei a oficina do carro", tipo: "Despesa", plano: PLANO_COM_VEICULO, esperado: "3.08" },

  // --- REGRESSÃO: o que já funcionava tem que continuar funcionando ---
  { nome: "Folha de pagamento", descricao: "paguei a folha dos funcionários", tipo: "Despesa", esperado: "2.01" },
  { nome: "Aluguel", descricao: "aluguel da loja", contaInformada: "2.02", tipo: "Despesa", esperado: "2.02" },
  { nome: "Conta de luz (regra casa, nome não)", descricao: "conta de luz", contaInformada: "2.03", tipo: "Despesa", esperado: "2.03" },
  { nome: "Imposto DAS (informado correto)", descricao: "paguei o DAS do mês", contaInformada: "2.05", tipo: "Despesa", esperado: "2.05" },
  { nome: "IPVA (é imposto de verdade)", descricao: "paguei o IPVA do carro", contaInformada: "2.05", tipo: "Despesa", esperado: "2.05" },
  { nome: "Compra de mercadoria (CMV legítimo)", descricao: "compra de mercadoria do fornecedor", contaInformada: "3.01", tipo: "Despesa", esperado: "3.01" },
  { nome: "Estoque (CMV legítimo)", descricao: "comprei estoque para revenda", tipo: "Despesa", esperado: "3.01" },
  { nome: "Venda (receita)", descricao: "vendi 500 reais hoje", tipo: "Receita", esperado: "1.01" },
  { nome: "Serviço prestado", descricao: "recebi de um serviço de consultoria", tipo: "Receita", esperado: "1.02" },
  { nome: "Entrada + segmento comércio", descricao: "Entrada", tipo: "Receita", segmento: "comercio", esperado: "1.01" },
  { nome: "Usuário nomeia a conta", descricao: "lança 300 em marketing", tipo: "Despesa", esperado: "3.05" },
  { nome: "Contador", descricao: "honorário do contador", contaInformada: "2.04", tipo: "Despesa", esperado: "2.04" },

  // --- modelos Base Comércio / Base Serviços (códigos diferentes do plano antigo) ---
  { nome: "Comércio: aluguel", descricao: "aluguel da loja", tipo: "Despesa", plano: COMERCIO, esperado: "4.04" },
  { nome: "Comércio: luz", descricao: "conta de luz", tipo: "Despesa", plano: COMERCIO, esperado: "4.05" },
  { nome: "Comércio: internet", descricao: "internet do escritório", tipo: "Despesa", plano: COMERCIO, esperado: "4.06" },
  { nome: "Comércio: DAS é dedução", descricao: "paguei o DAS do mês", tipo: "Despesa", plano: COMERCIO, esperado: "2.01" },
  { nome: "Comércio: IPVA é imposto fixo", descricao: "paguei o IPVA do carro", tipo: "Despesa", plano: COMERCIO, esperado: "4.14" },
  { nome: "Comércio: mercadoria é CMV", descricao: "compra de mercadoria do fornecedor", tipo: "Despesa", plano: COMERCIO, esperado: "3.01" },
  { nome: "Comércio: frete de entrega", descricao: "frete de entrega para cliente", tipo: "Despesa", plano: COMERCIO, esperado: "3.03" },
  { nome: "Comércio: maquininha", descricao: "taxa da maquininha", tipo: "Despesa", plano: COMERCIO, esperado: "2.03" },
  { nome: "Comércio: tarifa bancária", descricao: "tarifa bancária do mês", tipo: "Despesa", plano: COMERCIO, esperado: "5.04" },
  { nome: "Comércio: juros de boleto", descricao: "juros de boleto atrasado", tipo: "Despesa", plano: COMERCIO, esperado: "5.05" },
  { nome: "Comércio: abastecimento", descricao: "abastecimento de carro", contaInformada: "3.01", tipo: "Despesa", plano: COMERCIO, esperado: "4.12" },
  { nome: "Comércio: pró-labore", descricao: "retirada de pró-labore", tipo: "Despesa", plano: COMERCIO, esperado: "4.03" },
  { nome: "Comércio: venda", descricao: "vendi 500 reais", tipo: "Receita", plano: COMERCIO, esperado: "1.01" },
  { nome: "Comércio: entrada + segmento", descricao: "Entrada", tipo: "Receita", plano: COMERCIO, segmento: "comercio", esperado: "1.01" },
  { nome: "Comércio: rendimento", descricao: "rendimento da aplicação", tipo: "Receita", plano: COMERCIO, esperado: "5.01" },
  { nome: "Serviços: serviço prestado", descricao: "recebi de um serviço de consultoria", tipo: "Receita", plano: SERVICOS, esperado: "1.01" },
  { nome: "Serviços: entrada + segmento", descricao: "Entrada", tipo: "Receita", plano: SERVICOS, segmento: "servicos", esperado: "1.01" },
  { nome: "Serviços: DAS é dedução", descricao: "paguei o DAS", tipo: "Despesa", plano: SERVICOS, esperado: "2.01" },
  { nome: "Serviços: software", descricao: "assinatura do sistema de gestão", tipo: "Despesa", plano: SERVICOS, esperado: "4.08" },
  { nome: "Serviços: sem pista cai em Outras", descricao: "despesa diversa", tipo: "Despesa", plano: SERVICOS, esperado: "4.15" },
];

let falhas = 0;
console.log("caso".padEnd(46), "| esperado | obtido | motivo");
console.log("-".repeat(96));
for (const c of CASOS) {
  const r = resolverContaPj({
    contas: c.plano ?? PLANO,
    tipo: c.tipo,
    contaInformada: c.contaInformada,
    descricao: c.descricao,
    segmento: c.segmento,
  });
  const obtido = r.conta?.codigo ?? "—";
  const ok = obtido === c.esperado;
  if (!ok) falhas++;
  console.log(
    `${ok ? "ok  " : "FALHA"} ${c.nome}`.padEnd(46),
    "|", c.esperado.padEnd(8),
    "|", obtido.padEnd(6),
    "|", r.motivo + (r.ignorouInformada ? " (ignorou palpite)" : ""),
  );
}
console.log(`\n${CASOS.length - falhas}/${CASOS.length} passaram`);
process.exit(falhas === 0 ? 0 : 1);
