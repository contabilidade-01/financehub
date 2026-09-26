/**
 * Fila de provedores de IA (chat completions no formato OpenAI, com tools).
 *
 * Ordem padrão: OpenAI → DeepSeek → Gemini → Groq (se houver chave). A ordem e
 * quem participa são editáveis em Admin > Provedores de IA.
 *
 * Troca fluida: cada chamada tenta o 1º da fila que estiver saudável. Se ele
 * falhar, a MESMA chamada segue para o próximo — o cliente não percebe. Quem
 * falha por falta de crédito ou chave inválida fica "fora" por 30 min (não
 * gasta tempo tentando a cada mensagem); instabilidade tira por 2 min. Passado
 * o prazo, volta sozinho na próxima chamada. Se todos estiverem fora, tenta
 * mesmo assim (o crédito pode ter sido recarregado).
 *
 * O admin é avisado (WhatsApp/log) quando um provedor sai e quando volta.
 * Uso diário (chamadas, falhas, tokens) fica em ia_uso para a página do admin.
 */
import axios, { type AxiosResponse } from "axios";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { classifyAiError, withRetry, type AiErrorKind } from "../utils/ai-errors";

export type ProvedorId = "openai" | "deepseek" | "gemini" | "groq";
export const ORDEM_PADRAO: ProvedorId[] = ["openai", "deepseek", "gemini", "groq"];

type Config = { id: ProvedorId; nome: string; configurado: boolean; modelo: string; baseUrl: string; chave: string; painel: string };

/** Preço de referência (US$ por 1 milhão de tokens) — só para estimativa na página do admin. */
export const PRECO_REFERENCIA: Record<ProvedorId, { entrada: number; saida: number; fonte: string }> = {
  openai: { entrada: 0.15, saida: 0.6, fonte: "gpt-4o-mini" },
  deepseek: { entrada: 0.28, saida: 0.42, fonte: "deepseek-chat" },
  gemini: { entrada: 0.3, saida: 2.5, fonte: "gemini-2.5-flash" },
  groq: { entrada: 0.59, saida: 0.79, fonte: "llama-3.3-70b" },
};

export function configProvedor(id: ProvedorId): Config {
  const env = process.env;
  switch (id) {
    case "openai": {
      const chave = String(env.OPENAI_API_KEY || "").trim();
      return { id, nome: "OpenAI", configurado: !!chave, modelo: env.AI_MODEL || "gpt-4o-mini", baseUrl: String(env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, ""), chave, painel: "https://platform.openai.com/settings/organization/billing/overview" };
    }
    case "deepseek": {
      // DEEPSEEK_* ou, se ausente, a reserva antiga AI_FALLBACK_* (mesma regra do orquestrador).
      const chave = String(env.DEEPSEEK_API_KEY || env.AI_FALLBACK_API_KEY || "").trim();
      const baseUrl = String(env.DEEPSEEK_BASE_URL || env.AI_FALLBACK_BASE_URL || "https://api.deepseek.com").trim().replace(/\/$/, "");
      const modelo = String(env.DEEPSEEK_MODEL || env.AI_MODEL_FALLBACK || "deepseek-chat").trim();
      const ehDeepseek = /deepseek/i.test(baseUrl);
      return { id, nome: ehDeepseek ? "DeepSeek" : `Reserva (${baseUrl.replace(/^https?:\/\//, "")})`, configurado: !!chave, modelo, baseUrl, chave, painel: "https://platform.deepseek.com/usage" };
    }
    case "gemini": {
      const chave = String(env.GEMINI_API_KEY || "").trim();
      const modelo = env.GEMINI_CHAT_MODEL || env.GEMINI_MODEL || "gemini-2.5-flash";
      // Endpoint compatível com OpenAI (aceita tools/function calling).
      return { id, nome: "Gemini", configurado: !!chave, modelo, baseUrl: String(env.GEMINI_OPENAI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/$/, ""), chave, painel: "https://aistudio.google.com/usage" };
    }
    case "groq": {
      const chave = String(env.GROQ_API_KEY || "").trim();
      return { id, nome: "Groq", configurado: !!chave, modelo: env.GROQ_MODEL || "llama-3.3-70b-versatile", baseUrl: "https://api.groq.com/openai/v1", chave, painel: "https://console.groq.com/settings/usage" };
    }
  }
}

// ---------------------------------------------------------------------------
// Regras puras (testáveis)
// ---------------------------------------------------------------------------

/** Por quanto tempo o provedor fica fora da fila depois de uma falha desse tipo. */
export function minutosFora(kind: AiErrorKind): number {
  if (kind === "sem_credito" || kind === "auth") return 30;
  if (kind === "rate_limit" || kind === "transitorio" || kind === "timeout") return 2;
  return 0; // "bug" (ex.: 400 por parâmetro) não tira da fila: só pula nesta chamada
}

/** Ordem efetiva: preferido primeiro (se houver), depois a ordem configurada; sem repetidos. */
export function ordemEfetiva(ordem: ProvedorId[], preferir?: ProvedorId | null): ProvedorId[] {
  const base = ordem.filter((p, i) => ORDEM_PADRAO.includes(p) && ordem.indexOf(p) === i);
  for (const p of ORDEM_PADRAO) if (!base.includes(p)) base.push(p);
  return preferir ? [preferir, ...base.filter((p) => p !== preferir)] : base;
}

/**
 * Candidatos desta chamada: configurados, ligados e fora do "castigo". Se
 * nenhum estiver disponível, devolve os configurados e ligados (tenta assim mesmo).
 */
export function candidatos(
  ordem: ProvedorId[],
  st: { configurado: (p: ProvedorId) => boolean; desligado: (p: ProvedorId) => boolean; foraAte: (p: ProvedorId) => number },
  agora = Date.now(),
): ProvedorId[] {
  const ativos = ordem.filter((p) => st.configurado(p) && !st.desligado(p));
  const saudaveis = ativos.filter((p) => st.foraAte(p) <= agora);
  return saudaveis.length ? saudaveis : ativos;
}

/** Mensagens no formato aceito por DeepSeek/Gemini/Groq (sem campos extras da OpenAI). */
export function limparMensagens(messages: any[]): any[] {
  return messages.map((m) => {
    const out: any = { role: m.role, content: m.content ?? "" };
    if (m.tool_calls) out.tool_calls = m.tool_calls;
    if (m.tool_call_id) out.tool_call_id = m.tool_call_id;
    if (m.name) out.name = m.name;
    return out;
  });
}

// ---------------------------------------------------------------------------
// Estado (memória + banco, para a página do admin e várias réplicas)
// ---------------------------------------------------------------------------

type Estado = { foraAte: number; motivo: string | null; ultimaFalha: string | null; ultimoOk: number | null };
const estado = new Map<ProvedorId, Estado>();
let cfgCache: { ordem: ProvedorId[]; desligados: ProvedorId[]; lidoEm: number } | null = null;
let tabelasProntas = false;

async function garantirTabelas(): Promise<void> {
  if (tabelasProntas) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ia_config (
      id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
      ordem TEXT NOT NULL DEFAULT 'openai,deepseek,gemini,groq',
      desligados TEXT NOT NULL DEFAULT '',
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await db.execute(sql`INSERT INTO ia_config (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ia_provedores_estado (
      provedor VARCHAR(20) PRIMARY KEY,
      fora_ate TIMESTAMPTZ,
      motivo VARCHAR(40),
      ultima_falha TEXT,
      ultima_falha_em TIMESTAMPTZ,
      ultimo_ok_em TIMESTAMPTZ
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ia_uso (
      dia DATE NOT NULL,
      provedor VARCHAR(20) NOT NULL,
      origem VARCHAR(40) NOT NULL DEFAULT 'agente',
      chamadas INTEGER NOT NULL DEFAULT 0,
      falhas INTEGER NOT NULL DEFAULT 0,
      tokens_entrada BIGINT NOT NULL DEFAULT 0,
      tokens_saida BIGINT NOT NULL DEFAULT 0,
      PRIMARY KEY (dia, provedor, origem)
    )
  `);
  tabelasProntas = true;
}

const lista = (s: string) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean) as ProvedorId[];

async function lerConfig(): Promise<{ ordem: ProvedorId[]; desligados: ProvedorId[] }> {
  if (cfgCache && Date.now() - cfgCache.lidoEm < 30_000) return cfgCache;
  try {
    await garantirTabelas();
    const r: any = ((await db.execute(sql`SELECT ordem, desligados FROM ia_config WHERE id = 1`)) as any[])[0];
    // Estado salvo por outra réplica (castigos) também entra aqui.
    const rows = (await db.execute(sql`SELECT provedor, fora_ate, motivo FROM ia_provedores_estado`)) as any[];
    for (const e of rows) {
      const p = e.provedor as ProvedorId;
      const atual = estado.get(p) || { foraAte: 0, motivo: null, ultimaFalha: null, ultimoOk: null };
      const doBanco = e.fora_ate ? new Date(e.fora_ate).getTime() : 0;
      estado.set(p, { ...atual, foraAte: doBanco, motivo: doBanco > Date.now() ? e.motivo : atual.motivo });
    }
    cfgCache = { ordem: ordemEfetiva(lista(r?.ordem || "")), desligados: lista(r?.desligados || ""), lidoEm: Date.now() };
  } catch {
    cfgCache = { ordem: [...ORDEM_PADRAO], desligados: [], lidoEm: Date.now() };
  }
  return cfgCache;
}

export async function salvarConfig(ordem: string[], desligados: string[]): Promise<void> {
  await garantirTabelas();
  const o = ordemEfetiva(ordem.filter((p): p is ProvedorId => ORDEM_PADRAO.includes(p as ProvedorId)));
  const d = desligados.filter((p) => ORDEM_PADRAO.includes(p as ProvedorId));
  await db.execute(sql`UPDATE ia_config SET ordem = ${o.join(",")}, desligados = ${d.join(",")}, atualizado_em = now() WHERE id = 1`);
  cfgCache = null;
}

/** Tira o castigo (ex.: depois de recarregar o crédito). */
export async function reativarProvedor(p: ProvedorId): Promise<void> {
  const e = estado.get(p);
  if (e) estado.set(p, { ...e, foraAte: 0, motivo: null });
  await garantirTabelas();
  await db.execute(sql`UPDATE ia_provedores_estado SET fora_ate = NULL, motivo = NULL WHERE provedor = ${p}`);
  cfgCache = null;
}

function dia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

function registrarUso(p: ProvedorId, origem: string, ok: boolean, usage?: any): void {
  const tin = Number(usage?.prompt_tokens || 0);
  const tout = Number(usage?.completion_tokens || 0);
  garantirTabelas()
    .then(() => db.execute(sql`
      INSERT INTO ia_uso (dia, provedor, origem, chamadas, falhas, tokens_entrada, tokens_saida)
      VALUES (${dia()}::date, ${p}, ${origem}, ${ok ? 1 : 0}, ${ok ? 0 : 1}, ${tin}, ${tout})
      ON CONFLICT (dia, provedor, origem) DO UPDATE SET
        chamadas = ia_uso.chamadas + EXCLUDED.chamadas,
        falhas = ia_uso.falhas + EXCLUDED.falhas,
        tokens_entrada = ia_uso.tokens_entrada + EXCLUDED.tokens_entrada,
        tokens_saida = ia_uso.tokens_saida + EXCLUDED.tokens_saida
    `))
    .catch((err) => console.warn("[IA fila] uso não registrado:", err?.message));
}

async function avisarAdmin(texto: string): Promise<void> {
  try {
    const { notificarAdmin } = await import("./admin-notify");
    await notificarAdmin(texto);
  } catch { /* aviso é best-effort */ }
}

function marcarFalha(p: ProvedorId, kind: AiErrorKind, detalhe: string): void {
  const min = minutosFora(kind);
  const atual = estado.get(p) || { foraAte: 0, motivo: null, ultimaFalha: null, ultimoOk: null };
  const estavaFora = atual.foraAte > Date.now();
  const foraAte = min ? Date.now() + min * 60_000 : atual.foraAte;
  estado.set(p, { ...atual, foraAte, motivo: min ? kind : atual.motivo, ultimaFalha: detalhe.slice(0, 300) });
  garantirTabelas()
    .then(() => db.execute(sql`
      INSERT INTO ia_provedores_estado (provedor, fora_ate, motivo, ultima_falha, ultima_falha_em)
      VALUES (${p}, ${min ? new Date(foraAte).toISOString() : null}::timestamptz, ${min ? kind : null}, ${detalhe.slice(0, 300)}, now())
      ON CONFLICT (provedor) DO UPDATE SET
        fora_ate = COALESCE(EXCLUDED.fora_ate, ia_provedores_estado.fora_ate),
        motivo = COALESCE(EXCLUDED.motivo, ia_provedores_estado.motivo),
        ultima_falha = EXCLUDED.ultima_falha, ultima_falha_em = now()
    `))
    .catch(() => {});
  if (!estavaFora && (kind === "sem_credito" || kind === "auth")) {
    const nome = configProvedor(p).nome;
    void avisarAdmin(`🤖 IA: *${nome}* saiu da fila (${kind === "sem_credito" ? "sem crédito" : "chave inválida"}). O próximo da fila assumiu. Volta a ser tentado em ${min} min.`);
  }
}

function marcarOk(p: ProvedorId): void {
  const atual = estado.get(p);
  const voltou = !!atual?.motivo;
  estado.set(p, { foraAte: 0, motivo: null, ultimaFalha: atual?.ultimaFalha ?? null, ultimoOk: Date.now() });
  garantirTabelas()
    .then(() => db.execute(sql`
      INSERT INTO ia_provedores_estado (provedor, ultimo_ok_em) VALUES (${p}, now())
      ON CONFLICT (provedor) DO UPDATE SET ultimo_ok_em = now(), fora_ate = NULL, motivo = NULL
    `))
    .catch(() => {});
  if (voltou) void avisarAdmin(`🤖 IA: *${configProvedor(p).nome}* voltou a responder e reassumiu a fila.`);
}

// ---------------------------------------------------------------------------
// Chamada
// ---------------------------------------------------------------------------

export function algumProvedorConfigurado(): boolean {
  return ORDEM_PADRAO.some((p) => configProvedor(p).configurado);
}

export type PayloadChat = {
  messages: any[];
  tools?: any[];
  tool_choice?: any;
  temperature?: number;
  response_format?: any;
};

/**
 * Chat completions pela fila. Devolve a resposta do provedor que atendeu
 * (formato OpenAI) com `data._provedor`.
 */
export async function chatComFila(
  payload: PayloadChat,
  opts: { preferir?: ProvedorId | null; origem?: string; timeoutMs?: number } = {},
): Promise<AxiosResponse> {
  const cfg = await lerConfig();
  const ordem = ordemEfetiva(cfg.ordem, opts.preferir);
  const fila = candidatos(ordem, {
    configurado: (p) => configProvedor(p).configurado,
    desligado: (p) => cfg.desligados.includes(p) && p !== opts.preferir,
    foraAte: (p) => estado.get(p)?.foraAte || 0,
  });
  if (!fila.length) throw new Error("Nenhum provedor de IA configurado (OPENAI_API_KEY, DEEPSEEK_API_KEY ou GEMINI_API_KEY).");

  const origem = opts.origem || "agente";
  let ultimoErro: any;
  for (const p of fila) {
    const c = configProvedor(p);
    const body: any = {
      model: c.modelo,
      messages: p === "openai" ? payload.messages : limparMensagens(payload.messages),
      temperature: payload.temperature ?? 0.1,
    };
    if (payload.tools?.length) {
      body.tools = payload.tools;
      body.tool_choice = payload.tool_choice ?? "auto";
    }
    if (payload.response_format) body.response_format = payload.response_format;
    try {
      const resp = await withRetry(
        () => axios.post(`${c.baseUrl}/chat/completions`, body, {
          headers: { Authorization: `Bearer ${c.chave}`, "Content-Type": "application/json" },
          timeout: opts.timeoutMs ?? 60_000,
        }),
        { provider: p, retries: 1 },
      );
      if (!resp?.data?.choices?.length) throw new Error(`${c.nome}: resposta sem choices`);
      marcarOk(p);
      registrarUso(p, origem, true, resp.data?.usage);
      if (p !== fila[0]) console.warn(`[IA fila] ${origem}: atendido por ${c.nome} (${c.modelo}) após falha de ${fila.slice(0, fila.indexOf(p)).join(", ")}`);
      resp.data._provedor = p;
      return resp;
    } catch (err: any) {
      ultimoErro = err;
      const k = classifyAiError(err, p);
      console.warn(`[IA fila] ${c.nome} falhou (${k.kind}${k.status ? ` ${k.status}` : ""}): ${k.detail.slice(0, 160)}`);
      marcarFalha(p, k.kind, k.detail);
      registrarUso(p, origem, false);
    }
  }
  throw ultimoErro;
}

// ---------------------------------------------------------------------------
// Página do admin: situação, uso e saldo
// ---------------------------------------------------------------------------

async function saldoDeepseek(c: Config): Promise<{ texto: string; valor?: number; moeda?: string } | null> {
  if (!c.configurado || !/deepseek/i.test(c.baseUrl)) return null;
  try {
    const r = await axios.get(`${c.baseUrl}/user/balance`, { headers: { Authorization: `Bearer ${c.chave}` }, timeout: 10_000 });
    const info = r.data?.balance_infos?.[0];
    if (!info) return { texto: "Sem saldo informado" };
    const valor = Number(info.total_balance);
    return { texto: `${info.currency} ${valor.toFixed(2)}${r.data?.is_available === false ? " (insuficiente)" : ""}`, valor, moeda: info.currency };
  } catch (err: any) {
    return { texto: `Não consegui consultar (${err?.response?.status || err?.message})` };
  }
}

/** OpenAI não expõe saldo pela chave comum; com OPENAI_ADMIN_KEY mostra o gasto do mês. */
async function gastoOpenai(): Promise<{ texto: string; valor?: number } | null> {
  const adminKey = String(process.env.OPENAI_ADMIN_KEY || "").trim();
  if (!adminKey) return null;
  try {
    const agora = new Date();
    const inicio = Math.floor(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), 1) / 1000);
    const r = await axios.get("https://api.openai.com/v1/organization/costs", {
      params: { start_time: inicio, limit: 31 },
      headers: { Authorization: `Bearer ${adminKey}` },
      timeout: 15_000,
    });
    let total = 0;
    for (const b of r.data?.data || []) for (const x of b.results || []) total += Number(x.amount?.value || 0);
    return { texto: `US$ ${total.toFixed(2)} gastos neste mês`, valor: total };
  } catch (err: any) {
    return { texto: `Não consegui consultar (${err?.response?.status || err?.message})` };
  }
}

export async function painelProvedores() {
  await garantirTabelas();
  cfgCache = null;
  const cfg = await lerConfig();
  const estadoDb = new Map<string, any>();
  for (const r of (await db.execute(sql`SELECT * FROM ia_provedores_estado`)) as any[]) estadoDb.set(r.provedor, r);
  const uso = (await db.execute(sql`
    SELECT provedor,
      SUM(chamadas) FILTER (WHERE dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS chamadas_hoje,
      SUM(falhas)   FILTER (WHERE dia = (now() AT TIME ZONE 'America/Sao_Paulo')::date) AS falhas_hoje,
      SUM(chamadas) AS chamadas_30d, SUM(falhas) AS falhas_30d,
      SUM(tokens_entrada) AS tin_30d, SUM(tokens_saida) AS tout_30d
    FROM ia_uso WHERE dia >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - 29
    GROUP BY provedor
  `)) as any[];
  const usoPor = new Map(uso.map((u) => [u.provedor, u]));
  const porOrigem = (await db.execute(sql`
    SELECT origem, provedor, SUM(chamadas) AS chamadas FROM ia_uso
    WHERE dia >= (now() AT TIME ZONE 'America/Sao_Paulo')::date - 29
    GROUP BY origem, provedor ORDER BY origem, provedor
  `)) as any[];

  const provedores = [];
  for (const [i, p] of cfg.ordem.entries()) {
    const c = configProvedor(p);
    const e = estadoDb.get(p);
    const u = usoPor.get(p) || {};
    const foraAte = e?.fora_ate ? new Date(e.fora_ate) : null;
    const preco = PRECO_REFERENCIA[p];
    const tin = Number(u.tin_30d || 0), tout = Number(u.tout_30d || 0);
    const saldo = p === "deepseek" ? await saldoDeepseek(c) : p === "openai" ? await gastoOpenai() : null;
    provedores.push({
      id: p,
      posicao: i + 1,
      nome: c.nome,
      modelo: c.modelo,
      configurado: c.configurado,
      ligado: !cfg.desligados.includes(p),
      situacao: !c.configurado ? "sem_chave" : cfg.desligados.includes(p) ? "desligado" : foraAte && foraAte > new Date() ? "fora" : "ok",
      fora_ate: foraAte && foraAte > new Date() ? foraAte.toISOString() : null,
      motivo: foraAte && foraAte > new Date() ? e?.motivo : null,
      ultima_falha: e?.ultima_falha || null,
      ultima_falha_em: e?.ultima_falha_em || null,
      ultimo_ok_em: e?.ultimo_ok_em || null,
      chamadas_hoje: Number(u.chamadas_hoje || 0),
      falhas_hoje: Number(u.falhas_hoje || 0),
      chamadas_30d: Number(u.chamadas_30d || 0),
      falhas_30d: Number(u.falhas_30d || 0),
      tokens_entrada_30d: tin,
      tokens_saida_30d: tout,
      custo_estimado_30d_usd: Math.round(((tin * preco.entrada + tout * preco.saida) / 1_000_000) * 100) / 100,
      preco_referencia: preco,
      saldo,
      painel: c.painel,
    });
  }
  return { provedores, por_origem: porOrigem.map((r) => ({ origem: r.origem, provedor: r.provedor, chamadas: Number(r.chamadas) })) };
}

/** "Testar agora": chamada mínima só naquele provedor (não mexe no castigo se falhar por bug). */
export async function testarProvedor(p: ProvedorId): Promise<{ ok: boolean; ms: number; resposta?: string; erro?: string }> {
  const c = configProvedor(p);
  if (!c.configurado) return { ok: false, ms: 0, erro: "Sem chave configurada no ambiente." };
  const t0 = Date.now();
  try {
    const r = await axios.post(
      `${c.baseUrl}/chat/completions`,
      { model: c.modelo, messages: [{ role: "user", content: "Responda só: OK" }], temperature: 0, max_tokens: 5 },
      { headers: { Authorization: `Bearer ${c.chave}`, "Content-Type": "application/json" }, timeout: 20_000 },
    );
    marcarOk(p);
    registrarUso(p, "teste", true, r.data?.usage);
    return { ok: true, ms: Date.now() - t0, resposta: String(r.data?.choices?.[0]?.message?.content || "").trim().slice(0, 40) };
  } catch (err: any) {
    const k = classifyAiError(err, p);
    if (k.kind === "sem_credito" || k.kind === "auth") marcarFalha(p, k.kind, k.detail);
    return { ok: false, ms: Date.now() - t0, erro: `${k.kind}: ${k.detail.slice(0, 200)}` };
  }
}
