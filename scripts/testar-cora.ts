/**
 * Integração Cora — regras puras (sem rede nem banco). npm run test:cora
 */
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "teste-sessao";
import {
  montarPayloadCobranca, pendenciasDoCliente, mapearStatus, dadosDePagamento, dadosDoPagamento,
  ehRascunho, resumoDaListagem, janelaImportacao, decidirAcao, decidirCancelamento,
} from "../server/services/cora/cora.client";
import { cifrar, decifrar, hashToken } from "../server/utils/cripto-segredos";

let falhas = 0;
let total = 0;
const eq = (nome: string, obtido: unknown, esperado: unknown) => {
  total++;
  if (JSON.stringify(obtido) === JSON.stringify(esperado)) return;
  falhas++;
  console.error(`FAIL ${nome}\n     obtido:   ${JSON.stringify(obtido)}\n     esperado: ${JSON.stringify(esperado)}`);
};

const cliente = {
  nome: "Mercado Bom Preço Ltda", documento: "11.222.333/0001-81", email: "fin@bompreco.com.br",
  cep: "01310-100", logradouro: "Av. Paulista", numero: "1000", complemento: "sala 5", bairro: "Bela Vista", cidade: "São Paulo", uf: "sp",
};

// Cadastro mínimo para o boleto
eq("cliente completo", pendenciasDoCliente(cliente), []);
eq("cliente sem endereço", pendenciasDoCliente({ nome: "João", documento: "52998224725" }), ["CEP", "endereço", "número", "bairro", "cidade", "UF"]);
eq("documento inválido", pendenciasDoCliente({ ...cliente, documento: "123" }), ["CPF ou CNPJ"]);

// Payload da cobrança
const p = montarPayloadCobranca({ id: 42, descricao: "Venda NF 1234", valor: 1234.56, vencimento: "2026-10-10" }, cliente, { multa_pct: 5, juros_mes_pct: 1, desconto_pct: 0 });
eq("valor em centavos", p.services[0].amount, 123456);
eq("CNPJ só dígitos e tipo", p.customer.document, { identity: "11222333000181", type: "CNPJ" });
eq("CEP só dígitos, UF maiúscula", [p.customer.address?.zip_code, p.customer.address?.state], ["01310100", "SP"]);
eq("multa limitada a 2% (CDC)", p.payment_terms.fine, { rate: 2 });
eq("juros ao mês", p.payment_terms.interest, { rate: 1 });
eq("sem desconto quando zero", p.payment_terms.discount, undefined);
eq("boleto e Pix por padrão", p.payment_forms, ["BANK_SLIP", "PIX"]);
eq("código rastreável", p.code, "khesef-42");
const cpf = montarPayloadCobranca({ id: 1, descricao: "x", valor: 0.1 + 0.2, vencimento: "2026-10-10" }, { ...cliente, documento: "529.982.247-25" });
eq("CPF", cpf.customer.document.type, "CPF");
eq("centavos sem erro de ponto flutuante", cpf.services[0].amount, 30);

// Status
eq("status pago", mapearStatus("PAID"), "paga");
eq("status cancelado (duas grafias)", [mapearStatus("CANCELLED"), mapearStatus("canceled")], ["cancelada", "cancelada"]);
eq("status atrasado", mapearStatus("LATE"), "vencida");
eq("status em processamento", mapearStatus("IN_PAYMENT"), "processando");
eq("status desconhecido fica aberto", mapearStatus(undefined), "aberta");

// Dados de pagamento na resposta
eq("boleto e Pix", dadosDePagamento({ payment_options: { bank_slip: { digitable: "3419...", barcode: "3419", url: "https://x/pdf" } }, pix: { emv: "000201..." } }),
  { linha_digitavel: "3419...", codigo_barras: "3419", pix_copia_cola: "000201...", url_pdf: "https://x/pdf" });
eq("resposta vazia", dadosDePagamento({}), { linha_digitavel: null, codigo_barras: null, pix_copia_cola: null, url_pdf: null });
eq("pagamento: data em São Paulo e valor em reais", dadosDoPagamento({ total_paid: 125000, payments: [{ finalized_at: "2026-10-11T01:30:00Z" }] }), { pago_em: "2026-10-10", valor_pago: 1250 });
eq("sem pagamento", dadosDoPagamento({ status: "OPEN" }), { pago_em: null, valor_pago: null });

// Segredos
const pem = "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----";
const c1 = cifrar(pem);
eq("cifra não contém o segredo", c1.includes("PRIVATE"), false);
eq("ida e volta", decifrar(c1), pem);
eq("cada cifra é diferente (IV aleatório)", cifrar(pem) !== c1, true);
let adulterado = false;
try { const partes = c1.split(":"); partes[3] = Buffer.from("x" + partes[3]).toString("base64"); decifrar(partes.join(":")); } catch { adulterado = true; }
eq("cifra adulterada é recusada (GCM)", adulterado, true);
eq("hash de token estável e sem o token", [hashToken("abc") === hashToken("abc"), hashToken("abc").includes("abc"), hashToken("abc").length], [true, false, 64]);

// Importação da conta Cora (boletos emitidos fora do app) — mesma leitura do nescon-clientes
eq("rascunho não entra", [ehRascunho("DRAFT"), ehRascunho("recurrence_draft"), ehRascunho("OPEN")], [true, true, false]);
const lista = resumoDaListagem({ id: "inv_1", status: "OPEN", total_amount: 123456, due_date: "2026-10-20", customer_name: "Mercado Bom Preço", customer_document: "11.222.333/0001-81", services: [{ name: "Honorários 10/2026" }] });
eq("listagem: campos planos", lista, {
  id: "inv_1", status: "aberta", statusCora: "OPEN", valor: 1234.56, vencimento: "2026-10-20", descricao: "Honorários 10/2026",
  cliente: { nome: "Mercado Bom Preço", documento: "11222333000181", email: null },
});
const aninhado = resumoDaListagem({ id: "inv_2", status: "PAID", total_amount: 5000, due_date: "2026-10-05T00:00:00Z", customer: { name: "João", email: "j@x.com", document: { identity: "529.982.247-25", type: "CPF" } }, code: "ABC" });
eq("listagem: cliente aninhado, data com hora, descrição pelo code", [aninhado?.status, aninhado?.valor, aninhado?.vencimento, aninhado?.descricao, aninhado?.cliente], ["paga", 50, "2026-10-05", "ABC", { nome: "João", documento: "52998224725", email: "j@x.com" }]);
eq("listagem: descrição padrão com o vencimento", resumoDaListagem({ id: "x", status: "LATE", total_amount: 100, due_date: "2026-09-01" })?.descricao, "Cobrança Cora 01/09/2026");
eq("listagem: sem id ou sem vencimento ou sem valor → null", [resumoDaListagem({ status: "OPEN", total_amount: 1, due_date: "2026-01-01" }), resumoDaListagem({ id: "a", total_amount: 1 }), resumoDaListagem({ id: "a", due_date: "2026-01-01", total_amount: 0 })], [null, null, null]);
eq("janela: 6 meses para trás, 60 dias à frente", janelaImportacao("2026-10-01", 6), { start: "2026-05-01", end: "2026-11-30" });
eq("janela: virada de ano", janelaImportacao("2026-02-15", 3), { start: "2025-12-01", end: "2026-04-16" });
eq("ação: nova em aberto → criar", decidirAcao({ existe: false, statusCora: "OPEN" }), "criar");
eq("ação: nova paga → criar (a baixa vem do detalhe)", decidirAcao({ existe: false, statusCora: "PAID" }), "criar");
eq("ação: nova cancelada → ignorar", decidirAcao({ existe: false, statusCora: "CANCELLED" }), "ignorar");
eq("ação: existe e mudou no Cora → sincronizar", decidirAcao({ existe: true, statusLocal: "aberta", statusCora: "PAID", tituloStatus: "Pendente" }), "sincronizar");
eq("ação: existe igual → ignorar", decidirAcao({ existe: true, statusLocal: "aberta", statusCora: "OPEN", tituloStatus: "Pendente" }), "ignorar");
eq("ação: paga mas título ainda aberto → sincronizar (baixa que falhou)", decidirAcao({ existe: true, statusLocal: "paga", statusCora: "PAID", tituloStatus: "Pendente" }), "sincronizar");
eq("ação: paga e baixada → ignorar (pago local nunca reverte)", decidirAcao({ existe: true, statusLocal: "paga", statusCora: "PAID", tituloStatus: "Efetivada" }), "ignorar");
eq("cancelamento: importado em aberto → apaga", decidirCancelamento({ origem: "cora", status: "Pendente", conciliado: false }), "cancelar_apagar");
eq("cancelamento: importado já conciliado → mantém", decidirCancelamento({ origem: "cora", status: "Pendente", conciliado: true }), "cancelar_manter");
eq("cancelamento: importado com movimento do extrato → mantém", decidirCancelamento({ origem: "cora", status: "Pendente", conciliado: false, temMovimentoExtrato: true }), "cancelar_manter");
eq("cancelamento: importado já baixado → mantém", decidirCancelamento({ origem: "cora", status: "Efetivada", conciliado: false }), "cancelar_manter");
eq("cancelamento: lançado pelo usuário → mantém", decidirCancelamento({ origem: "manual", status: "Pendente", conciliado: false }), "cancelar_manter");
eq("cancelamento: sem título → mantém", decidirCancelamento(null), "cancelar_manter");

console.log(`\n${total - falhas}/${total} cenários OK`);
if (falhas) process.exit(1);
