/**
 * Cliente da API do Cora — Integração Direta (mTLS).
 *
 * Cada empresa gera no app do Cora o Client ID, o certificado e a chave
 * privada. Toda chamada vai com esse certificado (TLS mútuo); o token vem de
 * client_credentials e fica em cache até perto de expirar.
 *
 * Endereços num lugar só (URLS). Em teste local, CORA_BASE_URL e CORA_CA_PEM
 * apontam para um servidor simulado — nunca em produção.
 */
import https from "https";
import { URL } from "url";

export type AmbienteCora = "stage" | "producao";

export const URLS: Record<AmbienteCora, string> = {
  stage: "https://matls-clients.api.stage.cora.com.br",
  producao: "https://matls-clients.api.cora.com.br",
};

export interface CredenciaisCora {
  ambiente: AmbienteCora;
  clientId: string;
  certificado: string; // PEM
  chave: string; // PEM
}

export class ErroCora extends Error {
  constructor(message: string, public status = 502, public detalhe?: unknown) {
    super(message);
  }
}

function baseUrl(ambiente: AmbienteCora): string {
  const teste = process.env.NODE_ENV !== "production" ? process.env.CORA_BASE_URL : undefined;
  return (teste || URLS[ambiente]).replace(/\/+$/, "");
}

function agente(c: CredenciaisCora): https.Agent {
  const ca = process.env.NODE_ENV !== "production" && process.env.CORA_CA_PEM ? process.env.CORA_CA_PEM.replace(/\\n/g, "\n") : undefined;
  return new https.Agent({ cert: c.certificado, key: c.chave, ca, keepAlive: true, timeout: 20_000 });
}

interface Resposta {
  status: number;
  corpo: any;
}

function requisitar(c: CredenciaisCora, metodo: string, caminho: string, o: { corpo?: string; headers?: Record<string, string> } = {}): Promise<Resposta> {
  const url = new URL(`${baseUrl(c.ambiente)}${caminho}`);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        method: metodo,
        hostname: url.hostname,
        port: url.port || 443,
        path: `${url.pathname}${url.search}`,
        agent: agente(c),
        headers: { Accept: "application/json", ...(o.headers || {}), ...(o.corpo ? { "Content-Length": Buffer.byteLength(o.corpo).toString() } : {}) },
        timeout: 20_000,
      },
      (res) => {
        const partes: Buffer[] = [];
        res.on("data", (d) => partes.push(d));
        res.on("end", () => {
          const texto = Buffer.concat(partes).toString("utf8");
          let corpo: any = texto;
          try { corpo = texto ? JSON.parse(texto) : null; } catch { /* texto puro */ }
          resolve({ status: res.statusCode || 0, corpo });
        });
      },
    );
    req.on("timeout", () => req.destroy(new ErroCora("O Cora não respondeu a tempo.", 504)));
    req.on("error", (e: any) => reject(e instanceof ErroCora ? e : new ErroCora(mensagemDeRede(e), 502)));
    if (o.corpo) req.write(o.corpo);
    req.end();
  });
}

function mensagemDeRede(e: any): string {
  const codigo = String(e?.code || "");
  if (/CERT|SSL|TLS|EPROTO|ERR_OSSL/i.test(codigo) || /certificate|ssl|tls/i.test(String(e?.message))) {
    return "O Cora recusou o certificado. Confira se o certificado e a chave são do mesmo Client ID e do ambiente escolhido.";
  }
  if (codigo === "ENOTFOUND" || codigo === "ECONNREFUSED") return "Não foi possível conectar ao Cora.";
  return `Falha de comunicação com o Cora (${codigo || "erro de rede"}).`;
}

function erroDaApi(r: Resposta, contexto: string): ErroCora {
  const c = r.corpo || {};
  const msg = c.message || c.error_description || c.error || (Array.isArray(c.errors) ? c.errors.map((x: any) => x.message || x.code).join("; ") : "");
  if (r.status === 401 || r.status === 403) return new ErroCora(`${contexto}: acesso negado pelo Cora. Confira o Client ID e o certificado.`, 400, c);
  return new ErroCora(`${contexto}: ${msg || `o Cora respondeu ${r.status}`}.`, r.status >= 500 ? 502 : 400, c);
}

// ----------------------------------------------------------------------------
// Token (client_credentials com mTLS), em cache por Client ID
// ----------------------------------------------------------------------------

const tokens = new Map<string, { token: string; expira: number }>();

export async function obterToken(c: CredenciaisCora): Promise<string> {
  const chaveCache = `${c.ambiente}:${c.clientId}`;
  const atual = tokens.get(chaveCache);
  if (atual && atual.expira > Date.now() + 30_000) return atual.token;
  const corpo = new URLSearchParams({ grant_type: "client_credentials", client_id: c.clientId }).toString();
  const r = await requisitar(c, "POST", "/token", { corpo, headers: { "Content-Type": "application/x-www-form-urlencoded" } });
  if (r.status !== 200 || !r.corpo?.access_token) throw erroDaApi(r, "Autenticação no Cora");
  tokens.set(chaveCache, { token: r.corpo.access_token, expira: Date.now() + (Number(r.corpo.expires_in) || 300) * 1000 });
  return r.corpo.access_token;
}

export function esquecerToken(c: Pick<CredenciaisCora, "ambiente" | "clientId">) {
  tokens.delete(`${c.ambiente}:${c.clientId}`);
}

async function chamar(c: CredenciaisCora, metodo: string, caminho: string, corpo?: unknown, extras: Record<string, string> = {}): Promise<Resposta> {
  const enviar = async () => requisitar(c, metodo, caminho, {
    corpo: corpo === undefined ? undefined : JSON.stringify(corpo),
    headers: { Authorization: `Bearer ${await obterToken(c)}`, ...(corpo === undefined ? {} : { "Content-Type": "application/json" }), ...extras },
  });
  let r = await enviar();
  if (r.status === 401) { esquecerToken(c); r = await enviar(); } // token revogado: renova uma vez
  return r;
}

// ----------------------------------------------------------------------------
// Cobranças (boleto + Pix)
// ----------------------------------------------------------------------------

export async function emitirCobranca(c: CredenciaisCora, payload: PayloadCobranca, idempotencyKey: string) {
  const r = await chamar(c, "POST", "/v2/invoices/", payload, { "Idempotency-Key": idempotencyKey });
  if (r.status !== 200 && r.status !== 201) throw erroDaApi(r, "Emissão da cobrança");
  return r.corpo;
}

export async function consultarCobranca(c: CredenciaisCora, id: string) {
  const r = await chamar(c, "GET", `/v2/invoices/${encodeURIComponent(id)}`);
  if (r.status !== 200) throw erroDaApi(r, "Consulta da cobrança");
  return r.corpo;
}

export async function cancelarCobranca(c: CredenciaisCora, id: string) {
  const r = await chamar(c, "DELETE", `/v2/invoices/${encodeURIComponent(id)}`);
  if (![200, 202, 204].includes(r.status)) throw erroDaApi(r, "Cancelamento da cobrança");
  return true;
}

/** Registra o endereço que o Cora chama quando uma cobrança muda (paga, cancelada). */
export async function registrarWebhook(c: CredenciaisCora, url: string, gatilho: "paid" | "canceled") {
  const r = await chamar(c, "POST", "/endpoints/", { url, resource: "invoice", trigger: gatilho });
  if (r.status !== 200 && r.status !== 201) throw erroDaApi(r, "Registro do webhook");
  return r.corpo;
}

// ----------------------------------------------------------------------------
// Mapeamentos puros (testáveis sem rede)
// ----------------------------------------------------------------------------

export interface PayloadCobranca {
  code: string;
  customer: {
    name: string;
    email?: string;
    document: { identity: string; type: "CPF" | "CNPJ" };
    address?: { street: string; number: string; district: string; city: string; state: string; complement?: string; zip_code: string };
  };
  services: { name: string; description?: string; amount: number }[];
  payment_terms: {
    due_date: string;
    fine?: { rate: number };
    interest?: { rate: number };
    discount?: { type: "PERCENT" | "FIXED"; value: number };
  };
  payment_forms: ("BANK_SLIP" | "PIX")[];
}

export interface DadosTitulo {
  id: number;
  descricao: string;
  valor: number;
  vencimento: string;
}
export interface DadosCliente {
  nome: string;
  documento: string;
  email?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  numero?: string | null;
  complemento?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
}
export interface OpcoesCobranca {
  multa_pct?: number | null;
  juros_mes_pct?: number | null;
  desconto_pct?: number | null;
  formas?: ("BANK_SLIP" | "PIX")[];
}

/** O que falta no cadastro do cliente para o banco aceitar o boleto. */
export function pendenciasDoCliente(c: DadosCliente): string[] {
  const falta: string[] = [];
  const doc = String(c.documento || "").replace(/\D/g, "");
  if (doc.length !== 11 && doc.length !== 14) falta.push("CPF ou CNPJ");
  if (!c.nome?.trim()) falta.push("nome");
  if (String(c.cep || "").replace(/\D/g, "").length !== 8) falta.push("CEP");
  if (!c.logradouro?.trim()) falta.push("endereço");
  if (!c.numero?.trim()) falta.push("número");
  if (!c.bairro?.trim()) falta.push("bairro");
  if (!c.cidade?.trim()) falta.push("cidade");
  if (!/^[A-Za-z]{2}$/.test(String(c.uf || "").trim())) falta.push("UF");
  return falta;
}

export function montarPayloadCobranca(t: DadosTitulo, c: DadosCliente, o: OpcoesCobranca = {}): PayloadCobranca {
  const doc = c.documento.replace(/\D/g, "");
  const centavos = Math.round(t.valor * 100);
  const termos: PayloadCobranca["payment_terms"] = { due_date: t.vencimento };
  if (o.multa_pct) termos.fine = { rate: Math.min(2, Math.max(0, Number(o.multa_pct))) }; // CDC: multa até 2%
  if (o.juros_mes_pct) termos.interest = { rate: Math.max(0, Number(o.juros_mes_pct)) };
  if (o.desconto_pct) termos.discount = { type: "PERCENT", value: Math.max(0, Number(o.desconto_pct)) };
  return {
    code: `khesef-${t.id}`,
    customer: {
      name: c.nome.trim().slice(0, 60),
      ...(c.email ? { email: c.email.trim() } : {}),
      document: { identity: doc, type: doc.length === 14 ? "CNPJ" : "CPF" },
      address: {
        street: String(c.logradouro || "").trim(),
        number: String(c.numero || "").trim(),
        district: String(c.bairro || "").trim(),
        city: String(c.cidade || "").trim(),
        state: String(c.uf || "").trim().toUpperCase(),
        ...(c.complemento ? { complement: c.complemento.trim() } : {}),
        zip_code: String(c.cep || "").replace(/\D/g, ""),
      },
    },
    services: [{ name: t.descricao.slice(0, 100), amount: centavos }],
    payment_terms: termos,
    payment_forms: o.formas?.length ? o.formas : ["BANK_SLIP", "PIX"],
  };
}

export type StatusCobranca = "aberta" | "paga" | "cancelada" | "vencida" | "processando";

export function mapearStatus(statusCora: unknown): StatusCobranca {
  const s = String(statusCora || "").toUpperCase();
  if (s === "PAID") return "paga";
  if (s === "CANCELLED" || s === "CANCELED") return "cancelada";
  if (s === "LATE" || s === "OVERDUE") return "vencida";
  if (s === "IN_PAYMENT" || s === "PROCESSING") return "processando";
  return "aberta";
}

/** Linha digitável, Pix copia e cola e link do PDF, onde quer que venham na resposta. */
export function dadosDePagamento(r: any): { linha_digitavel: string | null; codigo_barras: string | null; pix_copia_cola: string | null; url_pdf: string | null } {
  const boleto = r?.payment_options?.bank_slip ?? r?.bank_slip ?? {};
  const pix = r?.pix ?? r?.payment_options?.pix ?? {};
  return {
    linha_digitavel: boleto.digitable ?? boleto.digitable_line ?? null,
    codigo_barras: boleto.barcode ?? null,
    pix_copia_cola: pix.emv ?? pix.copy_paste ?? pix.qr_code ?? null,
    url_pdf: boleto.url ?? r?.pdf_url ?? r?.url ?? null,
  };
}

/** Pagamento confirmado: data (AAAA-MM-DD, fuso de São Paulo) e valor pago em reais. */
export function dadosDoPagamento(r: any): { pago_em: string | null; valor_pago: number | null } {
  const pagamentos: any[] = Array.isArray(r?.payments) ? r.payments : [];
  const ultimo = pagamentos[pagamentos.length - 1] || {};
  const quando = ultimo.finalized_at ?? ultimo.paid_at ?? r?.paid_at ?? r?.occurrence_date ?? null;
  const totalCentavos = r?.total_paid ?? ultimo.total_paid ?? ultimo.amount ?? null;
  let pago_em: string | null = null;
  if (quando) {
    const d = new Date(quando);
    pago_em = isNaN(d.getTime())
      ? String(quando).slice(0, 10)
      : new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  }
  return { pago_em, valor_pago: totalCentavos === null || totalCentavos === undefined ? null : Math.round(Number(totalCentavos)) / 100 };
}
