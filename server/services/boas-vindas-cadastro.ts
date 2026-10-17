/**
 * Boas-vindas no WhatsApp logo após o cadastro pelo site (flag
 * FLAG_BOAS_VINDAS_CADASTRO_SITE).
 *
 * Quem se cadastra pelo site ainda não tem o chat vinculado (remoteJid é um
 * UUID). Mandamos a mensagem para o telefone informado; quando a pessoa
 * responde, o webhook da UazAPI vincula o chat à conta pelo telefone
 * (buscarCadastroPorTelefone). A mensagem conta como o "dia0" da sequência
 * de boas-vindas (jobs/onboarding-whatsapp.job.ts), para não chegar repetida.
 *
 * Nunca lança: falha aqui não pode atrapalhar o cadastro.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import { uazapiService } from "./uazapi.service";

export function textoBoasVindasCadastro(nome: string, isPJ: boolean): string {
  const primeiroNome = (nome || "").trim().split(/\s+/)[0] || "";
  const exemplo = isPJ ? "paguei 180 de fornecedor no pix" : "gastei 50 no mercado";
  return (
    `Olá${primeiroNome ? `, ${primeiroNome}` : ""}! 👋 Sua conta no Khesef foi criada e os 15 dias grátis já começaram.\n\n` +
    `Responda esta mensagem para ativar seus lançamentos por aqui. ` +
    `Depois é só mandar algo como "${exemplo}", em texto, áudio ou foto do comprovante, que eu organizo tudo.\n\n` +
    `Tudo o que você lançar aparece na hora no painel. 🚀`
  );
}

export async function enviarBoasVindasCadastroSite(user: {
  id: number;
  nome?: string | null;
  telefone?: string | null;
  tipo_pessoa?: string | null;
}): Promise<void> {
  try {
    const telefone = String(user.telefone || "").replace(/\D/g, "");
    const baseUrl = process.env.UAZAPI_BASE_URL || "https://nescon.uazapi.com";
    const token = process.env.UAZAPI_TOKEN || "";
    if (!telefone || !token) return;

    const { flagAtiva, FLAG_BOAS_VINDAS_CADASTRO_SITE } = await import("./feature-flags.service");
    if (!(await flagAtiva(FLAG_BOAS_VINDAS_CADASTRO_SITE, user.id))) return;

    // Reserva o dia0 antes de enviar: se já foi, não manda de novo.
    const reserva = await db.execute(sql`
      INSERT INTO onboarding_whatsapp_sequence (usuario_id, etapa)
      VALUES (${user.id}, ${"dia0"})
      ON CONFLICT (usuario_id, etapa) DO NOTHING
      RETURNING id
    `);
    const linhas = (reserva as any).rows ?? reserva;
    if (!(linhas as any[]).length) return;

    const isPJ = user.tipo_pessoa === "juridica";
    try {
      await uazapiService.sendText(baseUrl, token, telefone, textoBoasVindasCadastro(user.nome || "", isPJ));
    } catch (err) {
      // Não chegou: libera o dia0 para a sequência mandar quando o chat for vinculado.
      await db.execute(sql`
        DELETE FROM onboarding_whatsapp_sequence WHERE usuario_id = ${user.id} AND etapa = ${"dia0"}
      `);
      throw err;
    }
    console.log(`[BoasVindasCadastro] Mensagem enviada para user ${user.id}`);
  } catch (err: any) {
    console.error(`[BoasVindasCadastro] Falha ao enviar para user ${user.id}:`, err?.message || err);
  }
}
