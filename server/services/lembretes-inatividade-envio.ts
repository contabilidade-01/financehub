/**
 * Lembretes por inatividade — parte com banco e WhatsApp (regras em lembretes-inatividade.ts).
 *
 * - checkInatividade(): roda no laço de 5 min do proactive-alerts.job; executa uma
 *   vez por dia, a partir das 12h30 (SP), só depois da rodada diária das 9h.
 * - tratarRespostaInatividade(): no webhook, responde PAUSAR / SIM / ATIVAR LEMBRETES
 *   sem passar pela IA.
 * Controle de envio na tabela alertas_enviados (a mesma dos outros alertas).
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import {
  CHAVE_PAUSADO,
  MAX_DIAS_PARADO,
  MAX_ENVIOS_POR_RODADA,
  PREFIXO_INATIVIDADE,
  TEXTO_CONTINUAR,
  TEXTO_PAUSADO,
  TEXTO_REATIVADO,
  chaveEtapa,
  dentroDoHorarioInatividade,
  ehSabado,
  etapaParaHoje,
  foiAntecipada,
  interpretarResposta,
  textoInatividade,
  type EtapaInatividade,
} from "./lembretes-inatividade";

/** Origens que contam como "o cliente anotou" (fora: mensalidade automática, fatura, baixa, Cora). */
const ORIGENS_ANOTACAO = ["whatsapp", "manual", "importacao"];

export type Envio = (remotejid: string, texto: string) => Promise<unknown>;

async function envioPadrao(remotejid: string, texto: string): Promise<unknown> {
  const { uazapiService } = await import("./uazapi.service");
  const base = process.env.UAZAPI_BASE_URL || "https://nescon.uazapi.com";
  const token = process.env.UAZAPI_TOKEN || "";
  if (!token) throw new Error("UAZAPI_TOKEN não configurado");
  return uazapiService.sendText(base, token, remotejid, texto);
}

let tabelaPronta = false;
async function garantirTabela(): Promise<void> {
  if (tabelaPronta) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS alertas_enviados (
      usuario_id  INTEGER NOT NULL,
      chave       VARCHAR(160) NOT NULL,
      enviado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (usuario_id, chave)
    )
  `);
  tabelaPronta = true;
}

async function reservar(usuarioId: number, chave: string): Promise<boolean> {
  await garantirTabela();
  const r = (await db.execute(sql`
    INSERT INTO alertas_enviados (usuario_id, chave) VALUES (${usuarioId}, ${chave})
    ON CONFLICT DO NOTHING RETURNING usuario_id
  `)) as any[];
  return r.length > 0;
}

async function liberar(usuarioId: number, chave: string): Promise<void> {
  await db.execute(sql`DELETE FROM alertas_enviados WHERE usuario_id = ${usuarioId} AND chave = ${chave}`).catch(() => {});
}

async function existe(usuarioId: number, chave: string): Promise<boolean> {
  await garantirTabela();
  const r = (await db.execute(sql`
    SELECT 1 FROM alertas_enviados WHERE usuario_id = ${usuarioId} AND chave = ${chave}
  `)) as any[];
  return r.length > 0;
}

/** Dia (YYYY-MM-DD), hora e minuto em São Paulo. */
function agoraSPMin(agora: Date): { dia: string; hora: number; minuto: number } {
  const dia = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(agora);
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? 0);
  const minuto = Number(partes.find((p) => p.type === "minute")?.value ?? 0);
  return { dia, hora, minuto };
}

/** O cliente já recebeu outro aviso automático hoje, ou falou com o bot hoje? */
async function ocupadoHoje(usuarioId: number, dia: string): Promise<boolean> {
  const outros = (await db.execute(sql`
    SELECT 1 FROM alertas_enviados
    WHERE usuario_id = ${usuarioId}
      AND chave NOT LIKE ${PREFIXO_INATIVIDADE + "%"}
      AND (enviado_em AT TIME ZONE 'America/Sao_Paulo')::date = ${dia}::date
    LIMIT 1
  `)) as any[];
  if (outros.length) return true;
  const cob = (await db.execute(sql`SELECT to_regclass('public.avisos_cobranca') IS NOT NULL AS ok`)) as any[];
  if (cob[0]?.ok) {
    const r = (await db.execute(sql`
      SELECT 1 FROM avisos_cobranca
      WHERE usuario_id = ${usuarioId}
        AND (enviado_em AT TIME ZONE 'America/Sao_Paulo')::date = ${dia}::date
      LIMIT 1
    `)) as any[];
    if (r.length) return true;
  }
  // Falou com o bot hoje (mesmo sem anotar): está por perto, não precisa de lembrete.
  const conversa = (await db.execute(sql`
    SELECT 1 FROM conversa_historico
    WHERE usuario_id = ${usuarioId} AND role = 'user'
      AND created_at > now() - interval '12 hours'
    LIMIT 1
  `).catch(() => [])) as any[];
  return conversa.length > 0;
}

export type ResumoInatividade = { candidatos: number; enviados: number; pulados_ocupados: number };

export async function checkInatividade(
  opts: { agora?: Date; enviar?: Envio; pausaEntreEnviosMs?: number } = {},
): Promise<ResumoInatividade | null> {
  const agora = opts.agora ?? new Date();
  const enviar = opts.enviar ?? envioPadrao;
  const pausa = opts.pausaEntreEnviosMs ?? 3000;
  const { dia, hora, minuto } = agoraSPMin(agora);
  if (ehSabado(dia)) return null; // sábado: nada (o aviso já foi antecipado para sexta)
  if (!dentroDoHorarioInatividade(hora, minuto)) return null;

  const { flagAtiva, FLAG_LEMBRETES_INATIVIDADE } = await import("./feature-flags.service");
  await garantirTabela();
  // Só depois da rodada diária (cobrança, contas, limites, resumo): assim a regra
  // "um aviso por dia" enxerga o que já saiu hoje.
  if (!(await existe(0, `rodada_diaria:${dia}`))) return null;
  if (!(await reservar(0, `rodada_inatividade:${dia}`))) return null;

  const origens = sql.join(ORIGENS_ANOTACAO.map((o) => sql`${o}`), sql`, `);
  const rows = (await db.execute(sql`
    WITH ult AS (
      SELECT c.usuario_id, MAX(t.data_registro) AS ultima
      FROM transacoes t JOIN carteiras c ON c.id = t.carteira_id
      WHERE t.origem IN (${origens})
      GROUP BY c.usuario_id
      UNION ALL
      SELECT e.usuario_id, MAX(et.data_registro) AS ultima
      FROM empresas_transacoes et JOIN empresas e ON e.id = et.empresa_id
      WHERE et.origem IN (${origens})
      GROUP BY e.usuario_id
    )
    SELECT u.id, u.nome, u.remotejid, u.tipo_pessoa,
           to_char(MAX(ult.ultima) AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD') AS ultima_dia
    FROM usuarios u
    JOIN ult ON ult.usuario_id = u.id
    WHERE u.ativo = true
      AND u.remotejid IS NOT NULL AND u.remotejid != '' AND u.remotejid NOT LIKE '%@g.us'
    GROUP BY u.id, u.nome, u.remotejid, u.tipo_pessoa
    HAVING (MAX(ult.ultima) AT TIME ZONE 'America/Sao_Paulo')::date < ${dia}::date
       AND MAX(ult.ultima) > now() - make_interval(days => ${MAX_DIAS_PARADO + 1})
  `)) as any[];

  const resumo: ResumoInatividade = { candidatos: 0, enviados: 0, pulados_ocupados: 0 };
  for (const u of rows) {
    if (resumo.enviados >= MAX_ENVIOS_POR_RODADA) {
      console.warn(`[Inatividade] Teto de ${MAX_ENVIOS_POR_RODADA} envios na rodada atingido; o resto fica para amanhã.`);
      break;
    }
    try {
      const uid = Number(u.id);
      const ultima = String(u.ultima_dia);
      if (!(await flagAtiva(FLAG_LEMBRETES_INATIVIDADE, uid))) continue;
      if (await existe(uid, CHAVE_PAUSADO)) continue;
      const enviadasRows = (await db.execute(sql`
        SELECT chave FROM alertas_enviados
        WHERE usuario_id = ${uid} AND chave LIKE ${`${PREFIXO_INATIVIDADE}${ultima}:%`}
      `)) as any[];
      const enviadas = enviadasRows.map((r) => Number(String(r.chave).split(":").pop())).filter((n) => n > 0);
      const etapa = etapaParaHoje(ultima, dia, enviadas);
      if (!etapa) continue;
      resumo.candidatos++;
      if (await ocupadoHoje(uid, dia)) {
        resumo.pulados_ocupados++;
        continue;
      }
      const texto = textoInatividade({
        etapa,
        nome: u.nome,
        pj: String(u.tipo_pessoa || "").toLowerCase() === "juridica",
        ultimaAnotacao: ultima,
        antecipada: foiAntecipada(ultima, etapa as EtapaInatividade, dia),
      });
      const chave = chaveEtapa(ultima, etapa);
      if (!(await reservar(uid, chave))) continue;
      try {
        if (resumo.enviados > 0 && pausa > 0) await new Promise((r) => setTimeout(r, pausa));
        await enviar(u.remotejid, texto);
      } catch (err: any) {
        await liberar(uid, chave);
        console.error(`[Inatividade] Falha ao enviar etapa ${etapa} (user ${uid}):`, err?.message);
        continue;
      }
      resumo.enviados++;
      // Contexto para a IA entender a resposta do cliente.
      const { appendConversa } = await import("../storage");
      await appendConversa(uid, "assistant", texto);
      console.log(`[Inatividade] Etapa ${etapa} enviada (user ${uid}, última anotação ${ultima})`);
    } catch (err: any) {
      console.error(`[Inatividade] Erro (user ${u.id}):`, err?.message);
    }
  }
  console.log(
    `[Inatividade] ${dia}: parados=${rows.length} com etapa hoje=${resumo.candidatos} enviados=${resumo.enviados} adiados (outro aviso/conversa hoje)=${resumo.pulados_ocupados}`,
  );
  return resumo;
}

/**
 * Resposta do cliente aos lembretes. Retorna o texto a enviar (e já registra),
 * ou null para seguir o fluxo normal da IA.
 */
export async function tratarRespostaInatividade(usuarioId: number, texto: string): Promise<string | null> {
  const r = interpretarResposta(texto);
  if (!r) return null;
  const { flagAtiva, FLAG_LEMBRETES_INATIVIDADE } = await import("./feature-flags.service");
  if (!(await flagAtiva(FLAG_LEMBRETES_INATIVIDADE, usuarioId))) return null;
  await garantirTabela();

  let resposta: string | null = null;
  if (r === "pausar") {
    await reservar(usuarioId, CHAVE_PAUSADO);
    resposta = TEXTO_PAUSADO;
  } else if (r === "ativar") {
    await liberar(usuarioId, CHAVE_PAUSADO);
    resposta = TEXTO_REATIVADO;
  } else {
    // "sim" só é nosso se a última fala do bot foi a pergunta da etapa 4.
    const ult = (await db.execute(sql`
      SELECT role, content FROM conversa_historico
      WHERE usuario_id = ${usuarioId} ORDER BY id DESC LIMIT 1
    `).catch(() => [])) as any[];
    const pergunta = ult[0]?.role === "assistant" && String(ult[0]?.content || "").includes("Responda *SIM* ou *PAUSAR*");
    if (!pergunta) return null;
    resposta = TEXTO_CONTINUAR;
  }
  const { appendConversa } = await import("../storage");
  await appendConversa(usuarioId, "user", texto);
  await appendConversa(usuarioId, "assistant", resposta);
  return resposta;
}
