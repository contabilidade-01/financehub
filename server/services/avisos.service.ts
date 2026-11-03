/**
 * Avisos aos clientes (admin → clientes), por WhatsApp, e-mail e/ou no app.
 *
 *  - O admin escolhe o público (todos, PF, PJ MEI, PJ ME ou usuários escolhidos),
 *    os canais e o texto ({nome}, {primeiro_nome}, {link_app}).
 *  - Cada destinatário × canal vira uma linha em avisos_destinatarios (chave única):
 *    nada é enviado duas vezes, nem com reinício do servidor no meio do envio.
 *  - WhatsApp sai um por vez, com intervalo, pelo mesmo número do app (UazAPI),
 *    para não ser tratado como spam. Só para quem tem o WhatsApp vinculado.
 *  - "No app" fica pendente até o cliente clicar em "Entendi" (aviso no topo).
 *  - Só clientes ativos; super admins nunca entram no público.
 */
import { db } from "../db";
import { sql } from "drizzle-orm";

export type Canal = "whatsapp" | "email" | "app";
export const CANAIS: Canal[] = ["whatsapp", "email", "app"];
export type Publico =
  | { tipo: "todos" | "pf" | "pj_mei" | "pj_me" }
  | { tipo: "selecionados"; usuarios: number[] };

const INTERVALO_WHATSAPP_MS = Number(process.env.AVISOS_INTERVALO_WHATSAPP_MS || 4000);
const INTERVALO_EMAIL_MS = 500;

// ---------------------------------------------------------------------------
// Regras puras (testáveis)
// ---------------------------------------------------------------------------

export function linkApp(env: NodeJS.ProcessEnv = process.env): string {
  return String(env.PUBLIC_APP_URL || env.BASE_URL || "https://app.tudocontado.com.br").replace(/\/+$/, "");
}

export function primeiroNome(nome: string | null | undefined): string {
  return String(nome || "").trim().split(/\s+/)[0] || "";
}

/** Troca as variáveis do texto. Variável desconhecida fica como está. */
export function montarTexto(modelo: string, u: { nome?: string | null }, link = linkApp()): string {
  const nome = String(u.nome || "").trim();
  return String(modelo || "")
    .replace(/\{nome\}/g, nome || "cliente")
    .replace(/\{primeiro_nome\}/g, primeiroNome(nome) || "cliente")
    .replace(/\{link_app\}/g, link);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Texto no formato do WhatsApp (*negrito*, quebras de linha, links) → HTML seguro. */
export function textoParaHtml(texto: string): string {
  return escapeHtml(texto)
    .replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>")
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
    .replace(/\n/g, "<br>");
}

/** Texto para e-mail em texto puro e para o app: sem os asteriscos do WhatsApp. */
export function textoSemMarcacao(texto: string): string {
  return texto.replace(/\*([^*\n]+)\*/g, "$1");
}

export function validarEntrada(e: { titulo?: unknown; mensagem?: unknown; canais?: unknown; publico?: any }): string | null {
  const titulo = String(e.titulo || "").trim();
  const mensagem = String(e.mensagem || "").trim();
  if (titulo.length < 3) return "Informe um título (mínimo 3 caracteres).";
  if (titulo.length > 150) return "Título muito longo (máximo 150 caracteres).";
  if (mensagem.length < 10) return "Escreva a mensagem (mínimo 10 caracteres).";
  if (mensagem.length > 4000) return "Mensagem muito longa (máximo 4000 caracteres).";
  const canais = Array.isArray(e.canais) ? e.canais : [];
  if (!canais.length || canais.some((c) => !CANAIS.includes(c as Canal))) return "Escolha ao menos um canal válido.";
  const p = e.publico || {};
  if (!["todos", "pf", "pj_mei", "pj_me", "selecionados"].includes(p.tipo)) return "Público inválido.";
  if (p.tipo === "selecionados") {
    const ids = Array.isArray(p.usuarios) ? p.usuarios : [];
    if (!ids.length || ids.some((x: any) => !Number.isInteger(Number(x)) || Number(x) <= 0)) return "Escolha os clientes.";
  }
  return null;
}

function jidValido(jid: string | null | undefined): jid is string {
  const j = String(jid || "").trim();
  return !!j && !j.includes("@g.us");
}

// ---------------------------------------------------------------------------
// Banco
// ---------------------------------------------------------------------------

let tabelasProntas = false;
export async function garantirTabelasAvisos(): Promise<void> {
  if (tabelasProntas) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS avisos (
      id            SERIAL PRIMARY KEY,
      titulo        TEXT NOT NULL,
      mensagem      TEXT NOT NULL,
      canais        TEXT[] NOT NULL,
      publico       JSONB NOT NULL,
      criado_por    INTEGER,
      criado_em     TIMESTAMPTZ NOT NULL DEFAULT now(),
      concluido_em  TIMESTAMPTZ
    )
  `);
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS avisos_destinatarios (
      aviso_id    INTEGER NOT NULL REFERENCES avisos(id) ON DELETE CASCADE,
      usuario_id  INTEGER NOT NULL,
      canal       VARCHAR(12) NOT NULL,
      status      VARCHAR(16) NOT NULL DEFAULT 'pendente',
      erro        TEXT,
      enviado_em  TIMESTAMPTZ,
      lido_em     TIMESTAMPTZ,
      PRIMARY KEY (aviso_id, usuario_id, canal)
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_avisos_dest_usuario_app
    ON avisos_destinatarios (usuario_id) WHERE canal = 'app' AND lido_em IS NULL
  `);
  tabelasProntas = true;
}

type Cliente = { id: number; nome: string; email: string | null; remotejid: string | null };

/** Clientes do público (ativos, nunca super admin). */
export async function clientesDoPublico(publico: Publico): Promise<Cliente[]> {
  const ids = publico.tipo === "selecionados" ? publico.usuarios.map(Number).filter((n) => n > 0) : [];
  // Literal de array do Postgres (o sql do Drizzle expandiria um array JS em lista).
  const idsPg = `{${ids.filter((n) => Number.isInteger(n)).join(",")}}`;
  const rows = (await db.execute(sql`
    SELECT id, nome, email, remotejid
    FROM usuarios
    WHERE ativo = true
      AND COALESCE(tipo_usuario, 'normal') <> 'super_admin'
      AND (
        ${publico.tipo}::text = 'todos'
        OR (${publico.tipo}::text = 'pf' AND COALESCE(tipo_pessoa, 'fisica') = 'fisica')
        OR (${publico.tipo}::text = 'pj_mei' AND tipo_pessoa = 'juridica' AND COALESCE(porte_pj, 'mei') = 'mei')
        OR (${publico.tipo}::text = 'pj_me' AND tipo_pessoa = 'juridica' AND porte_pj = 'me')
        OR (${publico.tipo}::text = 'selecionados' AND id = ANY(${idsPg}::int[]))
      )
    ORDER BY id
  `)) as any[];
  return rows.map((r) => ({ id: Number(r.id), nome: r.nome, email: r.email, remotejid: r.remotejid }));
}

export async function previa(publico: Publico) {
  const cs = await clientesDoPublico(publico);
  return {
    total: cs.length,
    com_whatsapp: cs.filter((c) => jidValido(c.remotejid)).length,
    com_email: cs.filter((c) => !!String(c.email || "").includes("@")).length,
  };
}

// ---------------------------------------------------------------------------
// Envio (I/O)
// ---------------------------------------------------------------------------

export type Enviadores = {
  whatsapp: (jid: string, texto: string) => Promise<unknown>;
  email: (para: string, assunto: string, texto: string) => Promise<unknown>;
};

async function whatsappPadrao(jid: string, texto: string) {
  const { uazapiService } = await import("./uazapi.service");
  const base = process.env.UAZAPI_BASE_URL || "https://nescon.uazapi.com";
  const token = process.env.UAZAPI_TOKEN || "";
  if (!token) throw new Error("UAZAPI_TOKEN não configurado");
  return uazapiService.sendText(base, token, jid, texto);
}

async function emailPadrao(para: string, assunto: string, texto: string) {
  const { createTransport, isSmtpConfigured, smtpFrom } = await import("./mailer");
  if (!isSmtpConfigured()) throw new Error("SMTP não configurado");
  const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.55;color:#13241F;max-width:560px">${textoParaHtml(texto)}<hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0"><p style="font-size:12px;color:#777">Tudo Contado · ${escapeHtml(linkApp())}</p></div>`;
  return createTransport().sendMail({ from: smtpFrom(), to: para, subject: assunto, text: textoSemMarcacao(texto), html });
}

const PADRAO: Enviadores = { whatsapp: whatsappPadrao, email: emailPadrao };
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Envia teste só para o próprio admin (não grava nada). */
export async function enviarTeste(
  admin: { nome?: string | null; email?: string | null; remotejid?: string | null; remoteJid?: string | null },
  titulo: string,
  mensagem: string,
  canais: Canal[],
  enviar: Enviadores = PADRAO,
) {
  const texto = montarTexto(mensagem, admin);
  const resultado: Record<string, string> = {};
  const jid = admin.remotejid ?? admin.remoteJid;
  if (canais.includes("whatsapp")) {
    if (!jidValido(jid)) resultado.whatsapp = "Seu usuário não tem WhatsApp vinculado.";
    else await enviar.whatsapp(jid, `[TESTE] ${texto}`).then(() => (resultado.whatsapp = "enviado"), (e) => (resultado.whatsapp = `falhou: ${e?.message || e}`));
  }
  if (canais.includes("email")) {
    if (!admin.email) resultado.email = "Seu usuário não tem e-mail.";
    else await enviar.email(admin.email, `[TESTE] ${titulo}`, texto).then(() => (resultado.email = "enviado"), (e) => (resultado.email = `falhou: ${e?.message || e}`));
  }
  if (canais.includes("app")) resultado.app = "No app o aviso aparece no topo da tela do cliente até ele clicar em Entendi.";
  return resultado;
}

/** Cria o aviso e as linhas de destinatário; o envio roda em segundo plano. */
export async function criarAviso(
  adminId: number,
  e: { titulo: string; mensagem: string; canais: Canal[]; publico: Publico },
  enviar: Enviadores = PADRAO,
) {
  await garantirTabelasAvisos();
  const clientes = await clientesDoPublico(e.publico);
  if (!clientes.length) throw new Error("Nenhum cliente no público escolhido.");
  const [aviso] = (await db.execute(sql`
    INSERT INTO avisos (titulo, mensagem, canais, publico, criado_por)
    VALUES (${e.titulo.trim()}, ${e.mensagem.trim()}, ${`{${e.canais.filter((c) => CANAIS.includes(c)).join(",")}}`}::text[], ${JSON.stringify(e.publico)}::jsonb, ${adminId})
    RETURNING id
  `)) as any[];
  const avisoId = Number(aviso.id);
  for (const c of clientes) {
    for (const canal of e.canais) {
      const semContato =
        (canal === "whatsapp" && !jidValido(c.remotejid)) || (canal === "email" && !String(c.email || "").includes("@"));
      await db.execute(sql`
        INSERT INTO avisos_destinatarios (aviso_id, usuario_id, canal, status)
        VALUES (${avisoId}, ${c.id}, ${canal}, ${semContato ? "sem_contato" : canal === "app" ? "no_app" : "pendente"})
        ON CONFLICT DO NOTHING
      `);
    }
  }
  processarAviso(avisoId, enviar).catch((err) => console.error(`[Avisos] aviso ${avisoId}:`, err?.message || err));
  return { id: avisoId, clientes: clientes.length };
}

const emAndamento = new Set<number>();

/** Envia o que estiver pendente do aviso (idempotente: cada linha é "tomada" antes de enviar). */
export async function processarAviso(avisoId: number, enviar: Enviadores = PADRAO): Promise<void> {
  if (emAndamento.has(avisoId)) return;
  emAndamento.add(avisoId);
  try {
    await garantirTabelasAvisos();
    const [aviso] = (await db.execute(sql`SELECT id, titulo, mensagem FROM avisos WHERE id = ${avisoId}`)) as any[];
    if (!aviso) return;
    const pendentes = (await db.execute(sql`
      SELECT d.usuario_id, d.canal, u.nome, u.email, u.remotejid
      FROM avisos_destinatarios d JOIN usuarios u ON u.id = d.usuario_id
      WHERE d.aviso_id = ${avisoId} AND d.status IN ('pendente', 'enviando') AND d.canal IN ('whatsapp', 'email')
      ORDER BY d.canal, d.usuario_id
    `)) as any[];
    for (const p of pendentes) {
      const tomada = (await db.execute(sql`
        UPDATE avisos_destinatarios SET status = 'enviando'
        WHERE aviso_id = ${avisoId} AND usuario_id = ${p.usuario_id} AND canal = ${p.canal} AND status IN ('pendente', 'enviando')
        RETURNING usuario_id
      `)) as any[];
      if (!tomada.length) continue;
      const texto = montarTexto(aviso.mensagem, p);
      try {
        if (p.canal === "whatsapp") await enviar.whatsapp(p.remotejid, texto);
        else await enviar.email(p.email, aviso.titulo, texto);
        await db.execute(sql`
          UPDATE avisos_destinatarios SET status = 'enviado', enviado_em = now(), erro = NULL
          WHERE aviso_id = ${avisoId} AND usuario_id = ${p.usuario_id} AND canal = ${p.canal}
        `);
      } catch (err: any) {
        await db.execute(sql`
          UPDATE avisos_destinatarios SET status = 'falha', erro = ${String(err?.message || err).slice(0, 500)}
          WHERE aviso_id = ${avisoId} AND usuario_id = ${p.usuario_id} AND canal = ${p.canal}
        `);
      }
      await dormir(p.canal === "whatsapp" ? INTERVALO_WHATSAPP_MS : INTERVALO_EMAIL_MS);
    }
    await db.execute(sql`UPDATE avisos SET concluido_em = now() WHERE id = ${avisoId} AND concluido_em IS NULL`);
  } finally {
    emAndamento.delete(avisoId);
  }
}

/** No boot: continua avisos que ficaram no meio (reinício/deploy durante o envio). */
export async function retomarAvisosPendentes(): Promise<void> {
  await garantirTabelasAvisos();
  const rows = (await db.execute(sql`
    SELECT DISTINCT aviso_id FROM avisos_destinatarios WHERE status IN ('pendente', 'enviando')
  `)) as any[];
  for (const r of rows) await processarAviso(Number(r.aviso_id)).catch(() => {});
}

/** Reenvia só as falhas de um aviso. */
export async function reenviarFalhas(avisoId: number) {
  await garantirTabelasAvisos();
  const rows = (await db.execute(sql`
    UPDATE avisos_destinatarios SET status = 'pendente', erro = NULL
    WHERE aviso_id = ${avisoId} AND status = 'falha'
    RETURNING usuario_id
  `)) as any[];
  if (rows.length) {
    await db.execute(sql`UPDATE avisos SET concluido_em = NULL WHERE id = ${avisoId}`);
    processarAviso(avisoId).catch(() => {});
  }
  return { reenviando: rows.length };
}

export async function listarAvisos() {
  await garantirTabelasAvisos();
  return (await db.execute(sql`
    SELECT a.id, a.titulo, a.canais, a.publico, a.criado_em, a.concluido_em,
      COUNT(DISTINCT d.usuario_id)::int AS clientes,
      COUNT(*) FILTER (WHERE d.status = 'enviado')::int AS enviados,
      COUNT(*) FILTER (WHERE d.status IN ('pendente', 'enviando'))::int AS na_fila,
      COUNT(*) FILTER (WHERE d.status = 'falha')::int AS falhas,
      COUNT(*) FILTER (WHERE d.status = 'sem_contato')::int AS sem_contato,
      COUNT(*) FILTER (WHERE d.canal = 'app')::int AS no_app,
      COUNT(*) FILTER (WHERE d.canal = 'app' AND d.lido_em IS NOT NULL)::int AS lidos_app
    FROM avisos a LEFT JOIN avisos_destinatarios d ON d.aviso_id = a.id
    GROUP BY a.id ORDER BY a.id DESC LIMIT 50
  `)) as any[];
}

export async function detalheAviso(avisoId: number) {
  await garantirTabelasAvisos();
  const [aviso] = (await db.execute(sql`SELECT * FROM avisos WHERE id = ${avisoId}`)) as any[];
  if (!aviso) return null;
  const problemas = (await db.execute(sql`
    SELECT d.usuario_id, u.nome, u.email, d.canal, d.status, d.erro
    FROM avisos_destinatarios d JOIN usuarios u ON u.id = d.usuario_id
    WHERE d.aviso_id = ${avisoId} AND d.status IN ('falha', 'sem_contato')
    ORDER BY d.status, u.nome LIMIT 500
  `)) as any[];
  return { aviso, problemas };
}

// ---------------------------------------------------------------------------
// Lado do cliente (aviso no app)
// ---------------------------------------------------------------------------

export async function avisosNoAppDoUsuario(usuarioId: number) {
  await garantirTabelasAvisos();
  const rows = (await db.execute(sql`
    SELECT a.id, a.titulo, a.mensagem, a.criado_em, u.nome
    FROM avisos_destinatarios d
    JOIN avisos a ON a.id = d.aviso_id
    JOIN usuarios u ON u.id = d.usuario_id
    WHERE d.usuario_id = ${usuarioId} AND d.canal = 'app' AND d.lido_em IS NULL
      AND a.criado_em > now() - interval '60 days'
    ORDER BY a.id DESC LIMIT 5
  `)) as any[];
  return rows.map((r) => ({
    id: Number(r.id),
    titulo: r.titulo,
    texto: textoSemMarcacao(montarTexto(r.mensagem, { nome: r.nome })),
    criado_em: r.criado_em,
  }));
}

export async function marcarLido(usuarioId: number, avisoId: number) {
  await garantirTabelasAvisos();
  await db.execute(sql`
    UPDATE avisos_destinatarios SET lido_em = now(), status = 'lido'
    WHERE aviso_id = ${avisoId} AND usuario_id = ${usuarioId} AND canal = 'app' AND lido_em IS NULL
  `);
}

// ---------------------------------------------------------------------------
// Modelos prontos
// ---------------------------------------------------------------------------

export const MODELOS = [
  {
    id: "mudanca_dominio",
    nome: "Mudança de domínio (precisa entrar de novo)",
    titulo: "Novo endereço do Tudo Contado: app.tudocontado.com.br",
    mensagem:
      "Oi {primeiro_nome}! O Tudo Contado está com endereço novo: *app.tudocontado.com.br*.\n\n" +
      "O endereço antigo continua funcionando e leva você automaticamente para o novo. " +
      "Como o endereço mudou, no primeiro acesso será preciso *entrar de novo com seu e-mail e senha*. " +
      "Seus dados, lançamentos e assinatura continuam exatamente como estavam.\n\n" +
      "Se você usa um atalho na tela do celular ou um favorito no navegador, atualize para o endereço novo.\n\n" +
      "O WhatsApp de lançamentos continua o mesmo, nada muda por lá.\n\n" +
      "Acesse: {link_app}",
  },
  {
    id: "atualizacao",
    nome: "Atualização / novidade no app",
    titulo: "Novidade no Tudo Contado",
    mensagem:
      "Oi {primeiro_nome}! Temos novidade no Tudo Contado:\n\n" +
      "*[descreva aqui a novidade em 1 ou 2 frases]*\n\n" +
      "Já está disponível para você em {link_app}",
  },
];
