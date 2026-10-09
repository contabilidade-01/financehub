/**
 * Sequência de boas-vindas via WhatsApp (dias 0, 1 e 3) — job agendado,
 * SEPARADO do `whatsapp-onboarding.service.ts` (que é só o cadastro de
 * empresa PJ por WhatsApp). Aqui é o pipeline de mensagens proativas
 * ensinando a USAR o produto, no mesmo padrão de `proactive-alerts.job.ts`
 * (sem N8N, 100% interno via UazAPI).
 *
 * Idempotente: cada (usuario_id, etapa) só é enviado uma vez — controlado
 * pela tabela `onboarding_whatsapp_sequence` (INSERT com UNIQUE + ON
 * CONFLICT DO NOTHING antes de qualquer reenvio concorrente).
 *
 * Inicializado no bootstrap do app (server/index.ts).
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { uazapiService } from "../services/uazapi.service";

const CHECK_INTERVAL = 60 * 60 * 1000; // 1 hora
const UAZAPI_BASE_URL = process.env.UAZAPI_BASE_URL || "https://nescon.uazapi.com";
const UAZAPI_TOKEN = process.env.UAZAPI_TOKEN || "";

// Só envia em horário comercial (SP), como os demais alertas proativos.
const HORA_INICIO = 8;
const HORA_FIM = 20;

function nowSP(): Date {
  return new Date(new Date().toLocaleString("en-US", { timeZone: "America/Sao_Paulo" }));
}

interface CandidatoUsuario {
  id: number;
  nome: string;
  remotejid: string;
  tipo_pessoa: string | null;
}

/** Usuários ativos, com WhatsApp, cadastrados há pelo menos `diasMinimos` dias,
 * que AINDA não receberam a mensagem desta `etapa`. */
async function buscarCandidatos(etapa: string, diasMinimos: number): Promise<CandidatoUsuario[]> {
  const rows = await db.execute(sql`
    SELECT u.id, u.nome, u.remotejid, u.tipo_pessoa
    FROM usuarios u
    WHERE u.ativo = true
      AND u.remotejid IS NOT NULL
      AND u.remotejid != ''
      AND u.remotejid NOT LIKE '%@g.us'
      AND u.data_cadastro IS NOT NULL
      AND (u.data_cadastro AT TIME ZONE 'America/Sao_Paulo')::date <= (NOW() AT TIME ZONE 'America/Sao_Paulo')::date - (${diasMinimos})::int
      AND NOT EXISTS (
        SELECT 1 FROM onboarding_whatsapp_sequence s
        WHERE s.usuario_id = u.id AND s.etapa = ${etapa}
      )
  `);
  return (rows as any[]).map((r) => ({
    id: r.id,
    nome: r.nome,
    remotejid: r.remotejid,
    tipo_pessoa: r.tipo_pessoa ?? null,
  }));
}

/** Marca a etapa como enviada. Idempotente — se outra instância já gravou, não faz nada. */
async function marcarEnviado(usuarioId: number, etapa: string): Promise<boolean> {
  const result = await db.execute(sql`
    INSERT INTO onboarding_whatsapp_sequence (usuario_id, etapa)
    VALUES (${usuarioId}, ${etapa})
    ON CONFLICT (usuario_id, etapa) DO NOTHING
    RETURNING id
  `);
  return (result as any[]).length > 0;
}

function textoDia0(nome: string, isPJ: boolean): string {
  const primeiroNome = (nome || "").split(" ")[0] || "";
  const exemplo = isPJ ? "paguei 180 de fornecedor no pix" : "gastei 50 no mercado";
  return (
    `Olá${primeiroNome ? `, ${primeiroNome}` : ""}! 👋 Bem-vindo ao Khesef.\n\n` +
    `O jeito mais rápido de começar é lançar por aqui mesmo, no WhatsApp. ` +
    `Manda uma mensagem tipo "${exemplo}" e eu já organizo tudo pra você.\n\n` +
    `Depois é só dar uma olhada no site — o lançamento aparece na hora. 🚀`
  );
}

function textoDia1(): string {
  return (
    `Só reforçando o que eu entendo por aqui 📋\n\n` +
    `• *Texto*: "gastei 35 no uber"\n` +
    `• *Áudio*: manda um áudio contando o gasto\n` +
    `• *Foto*: tira uma foto do cupom fiscal que eu leio pra você\n` +
    `• *Parcelado*: "comprei um tênis de 300 em 3x no cartão"\n` +
    `• *Correção*: errou um valor? Manda "corrige o valor" ou "corrige para 45" que eu ajusto na hora.\n\n` +
    `Pode testar qualquer um desses agora. 😉`
  );
}

function textoDia3(isPJ: boolean): string {
  const recurso = isPJ ? "os relatórios e a DRE gerencial da empresa" : "os relatórios com gráficos dos seus gastos";
  return (
    `E aí, como está sendo usar o Khesef? 🙂\n\n` +
    `Se já lançou algumas coisas, vale dar uma olhada em ${recurso} — é tudo calculado sozinho a partir do que você já mandou.\n\n` +
    `Qualquer dúvida, é só me chamar por aqui mesmo.`
  );
}

async function enviarEtapa(
  etapa: "dia0" | "dia1" | "dia3",
  diasMinimos: number,
  montarTexto: (u: CandidatoUsuario) => string,
): Promise<void> {
  if (!UAZAPI_TOKEN) return;
  const candidatos = await buscarCandidatos(etapa, diasMinimos);
  for (const u of candidatos) {
    try {
      // Reserva a etapa ANTES de enviar — evita reenvio se o processo cair
      // entre o envio e a marcação (prefere "não reenviar" a "reenviar 2x").
      const reservado = await marcarEnviado(u.id, etapa);
      if (!reservado) continue; // outra instância já está cuidando/cuidou disso
      const isPJ = u.tipo_pessoa === "juridica";
      await uazapiService.sendText(UAZAPI_BASE_URL, UAZAPI_TOKEN, u.remotejid, montarTexto({ ...u, tipo_pessoa: isPJ ? "juridica" : "fisica" }));
    } catch (err: any) {
      console.error(`[OnboardingWhatsApp] Erro enviando ${etapa} para user ${u.id}:`, err?.message);
    }
  }
}

async function runSequence(): Promise<void> {
  const agora = nowSP();
  const hora = agora.getHours();
  if (hora < HORA_INICIO || hora >= HORA_FIM) return; // só em horário comercial

  console.log("[OnboardingWhatsApp] Verificando sequência de boas-vindas...");
  await enviarEtapa("dia0", 0, (u) => textoDia0(u.nome, u.tipo_pessoa === "juridica"));
  await enviarEtapa("dia1", 1, () => textoDia1());
  await enviarEtapa("dia3", 3, (u) => textoDia3(u.tipo_pessoa === "juridica"));
}

/** Nunca deixa uma falha do job virar unhandled rejection (derrubaria o processo). */
async function runSequenceSafe(): Promise<void> {
  try {
    await runSequence();
  } catch (err: any) {
    console.error("[OnboardingWhatsApp] Erro na sequência de boas-vindas:", err?.message);
  }
}

let sequenceInterval: NodeJS.Timeout | null = null;

export function initializeOnboardingWhatsappSequence(): void {
  if (!UAZAPI_TOKEN) {
    console.log("[OnboardingWhatsApp] ⚠️ UAZAPI_TOKEN não configurado — sequência de boas-vindas desativada.");
    return;
  }
  console.log("[OnboardingWhatsApp] ✅ Sequência de boas-vindas inicializada (intervalo: 1h)");
  setTimeout(runSequenceSafe, 2 * 60 * 1000); // dá tempo do app estabilizar
  sequenceInterval = setInterval(runSequenceSafe, CHECK_INTERVAL);
}

export function stopOnboardingWhatsappSequence(): void {
  if (sequenceInterval) {
    clearInterval(sequenceInterval);
    sequenceInterval = null;
  }
}
