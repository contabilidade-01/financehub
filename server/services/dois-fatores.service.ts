/**
 * 2FA (aplicativo autenticador) — persistência.
 * Tabela própria criada sob demanda (padrão feature-flags/backup), sem tocar em `usuarios`.
 *
 * Recuperação se a pessoa perder o celular:
 *  1. Um dos 10 códigos de recuperação (uso único), mostrados ao ativar.
 *  2. No servidor (console do EasyPanel): npm run 2fa:desativar -- email@conta
 */
import { db } from "../db";
import { sql } from "drizzle-orm";
import {
  assinarNavegadorConfiavel,
  navegadorConfiavelValido,
  consumirCodigoRecuperacao,
  gerarCodigosRecuperacao,
  gerarSegredo,
  hashCodigoRecuperacao,
  urlOtpAuth,
  verificarCodigoTotp,
} from "./dois-fatores-logic";

let tabelaPronta = false;

async function garantirTabela(): Promise<void> {
  if (tabelaPronta) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS usuarios_dois_fatores (
      usuario_id          INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
      segredo             TEXT NOT NULL,
      ativo               BOOLEAN NOT NULL DEFAULT false,
      codigos_recuperacao JSONB NOT NULL DEFAULT '[]'::jsonb,
      ultimo_passo        BIGINT,
      ativado_em          TIMESTAMP,
      criado_em           TIMESTAMP NOT NULL DEFAULT NOW()
    )
  `);
  tabelaPronta = true;
}

type Linha = {
  usuario_id: number;
  segredo: string;
  ativo: boolean;
  codigos_recuperacao: string[];
  ultimo_passo: number | null;
};

async function linha(usuarioId: number): Promise<Linha | null> {
  await garantirTabela();
  const r = (await db.execute(sql`
    SELECT usuario_id, segredo, ativo, codigos_recuperacao, ultimo_passo
    FROM usuarios_dois_fatores WHERE usuario_id = ${usuarioId}
  `)) as any[];
  const l = r[0];
  if (!l) return null;
  const codigos = Array.isArray(l.codigos_recuperacao)
    ? l.codigos_recuperacao
    : JSON.parse(l.codigos_recuperacao || "[]");
  return {
    usuario_id: Number(l.usuario_id),
    segredo: String(l.segredo),
    ativo: l.ativo === true || l.ativo === "t",
    codigos_recuperacao: codigos,
    ultimo_passo: l.ultimo_passo != null ? Number(l.ultimo_passo) : null,
  };
}

/** Usado no login: a conta exige o segundo fator? Erro de banco propaga (o login falha em vez de pular o 2FA). */
export async function doisFatoresAtivo(usuarioId: number): Promise<boolean> {
  const l = await linha(usuarioId);
  return !!l?.ativo;
}

export async function statusDoisFatores(usuarioId: number): Promise<{ ativo: boolean; codigos_restantes: number }> {
  const l = await linha(usuarioId);
  return { ativo: !!l?.ativo, codigos_restantes: l?.ativo ? l.codigos_recuperacao.length : 0 };
}

/** Passo 1: gera (ou troca) o segredo ainda não ativado e devolve o link para o QR. */
export async function iniciarConfiguracao(
  usuarioId: number,
  conta: string,
  emissor: string,
): Promise<{ segredo: string; otpauth: string }> {
  const atual = await linha(usuarioId);
  if (atual?.ativo) throw new Error("A verificação em duas etapas já está ativa.");
  const segredo = gerarSegredo();
  await db.execute(sql`
    INSERT INTO usuarios_dois_fatores (usuario_id, segredo, ativo)
    VALUES (${usuarioId}, ${segredo}, false)
    ON CONFLICT (usuario_id) DO UPDATE
      SET segredo = EXCLUDED.segredo, ativo = false, codigos_recuperacao = '[]'::jsonb, ultimo_passo = NULL
  `);
  return { segredo, otpauth: urlOtpAuth(segredo, conta, emissor) };
}

/** Passo 2: confirma o primeiro código do app, ativa e devolve os códigos de recuperação (só desta vez). */
export async function ativarDoisFatores(usuarioId: number, codigo: unknown): Promise<string[] | null> {
  const l = await linha(usuarioId);
  if (!l || l.ativo) return null;
  const passo = verificarCodigoTotp(l.segredo, codigo);
  if (passo == null) return null;
  const codigos = gerarCodigosRecuperacao();
  const hashes = codigos.map(hashCodigoRecuperacao);
  await db.execute(sql`
    UPDATE usuarios_dois_fatores
    SET ativo = true, ativado_em = NOW(), ultimo_passo = ${passo},
        codigos_recuperacao = ${JSON.stringify(hashes)}::jsonb
    WHERE usuario_id = ${usuarioId}
  `);
  return codigos;
}

/**
 * Confere o segundo fator: código do app OU um código de recuperação (que é gasto).
 * Retorna como entrou, ou null.
 */
export async function conferirSegundoFator(
  usuarioId: number,
  codigo: unknown,
): Promise<{ via: "app" | "recuperacao"; codigos_restantes: number } | null> {
  const l = await linha(usuarioId);
  if (!l?.ativo) return null;
  const passo = verificarCodigoTotp(l.segredo, codigo, { ultimoPassoUsado: l.ultimo_passo });
  if (passo != null) {
    await db.execute(sql`
      UPDATE usuarios_dois_fatores SET ultimo_passo = ${passo} WHERE usuario_id = ${usuarioId}
    `);
    return { via: "app", codigos_restantes: l.codigos_recuperacao.length };
  }
  const restantes = consumirCodigoRecuperacao(l.codigos_recuperacao, codigo);
  if (restantes) {
    await db.execute(sql`
      UPDATE usuarios_dois_fatores SET codigos_recuperacao = ${JSON.stringify(restantes)}::jsonb
      WHERE usuario_id = ${usuarioId}
    `);
    return { via: "recuperacao", codigos_restantes: restantes.length };
  }
  return null;
}

/** Gera 10 códigos de recuperação novos (os antigos deixam de valer). */
export async function novosCodigosRecuperacao(usuarioId: number): Promise<string[]> {
  const codigos = gerarCodigosRecuperacao();
  await db.execute(sql`
    UPDATE usuarios_dois_fatores
    SET codigos_recuperacao = ${JSON.stringify(codigos.map(hashCodigoRecuperacao))}::jsonb
    WHERE usuario_id = ${usuarioId} AND ativo = true
  `);
  return codigos;
}

export async function desativarDoisFatores(usuarioId: number): Promise<boolean> {
  await garantirTabela();
  const r = (await db.execute(sql`
    DELETE FROM usuarios_dois_fatores WHERE usuario_id = ${usuarioId} RETURNING usuario_id
  `)) as any[];
  return r.length > 0;
}

// Chave do cookie "lembrar este navegador". Se SESSION_SECRET mudar, os
// navegadores lembrados voltam a pedir o código (falha segura).
const chaveNavegador = () => `2fa-navegador:${process.env.SESSION_SECRET || "dev-only"}`;

export async function tokenNavegadorConfiavel(usuarioId: number): Promise<string | null> {
  const l = await linha(usuarioId);
  if (!l?.ativo) return null;
  return assinarNavegadorConfiavel(chaveNavegador(), usuarioId, l.segredo);
}

export async function navegadorConfiavel(usuarioId: number, token: unknown): Promise<boolean> {
  if (!token) return false;
  const l = await linha(usuarioId);
  if (!l?.ativo) return false;
  return navegadorConfiavelValido(chaveNavegador(), token, usuarioId, l.segredo);
}
