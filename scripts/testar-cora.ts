/**
 * Integração Cora — regras puras (sem rede nem banco). npm run test:cora
 */
process.env.SESSION_SECRET = process.env.SESSION_SECRET || "teste-sessao";
import { montarPayloadCobranca, pendenciasDoCliente, mapearStatus, dadosDePagamento, dadosDoPagamento } from "../server/services/cora/cora.client";
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

console.log(`\n${total - falhas}/${total} cenários OK`);
if (falhas) process.exit(1);
