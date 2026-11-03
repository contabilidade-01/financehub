#!/usr/bin/env npx tsx
/**
 * Desliga a verificação em duas etapas de uma conta (perdeu o celular E os
 * códigos de recuperação). Rodar no console do container do app (EasyPanel):
 *
 *   npm run 2fa:desativar -- email@da.conta
 *
 * Só quem tem acesso ao servidor consegue rodar. Depois, a pessoa entra só com
 * a senha e pode ativar o 2FA de novo em Configurações > Segurança.
 */
import dotenv from "dotenv";

dotenv.config();

async function main() {
  const email = String(process.argv[2] || "").trim().toLowerCase();
  if (!email || !email.includes("@")) {
    console.error("Uso: npm run 2fa:desativar -- email@da.conta");
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não está definida.");
    process.exit(1);
  }
  const postgres = (await import("postgres")).default;
  const client = postgres(process.env.DATABASE_URL, { prepare: false, max: 1 });
  try {
    const [user] = await client`SELECT id, nome FROM usuarios WHERE LOWER(email) = ${email} LIMIT 1`;
    if (!user) {
      console.error(`Nenhuma conta com o e-mail ${email}.`);
      process.exit(1);
    }
    const [tabela] = await client`SELECT to_regclass('public.usuarios_dois_fatores') AS t`;
    if (!tabela?.t) {
      console.log("Ninguém ativou 2FA ainda. Nada a fazer.");
      return;
    }
    const r = await client`DELETE FROM usuarios_dois_fatores WHERE usuario_id = ${user.id} RETURNING usuario_id`;
    console.log(
      r.length
        ? `✅ 2FA desativado para ${user.nome} (${email}, id ${user.id}). Entre só com a senha.`
        : `A conta ${email} não tinha 2FA ativo.`,
    );
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error("Erro:", e?.message || e);
  process.exit(1);
});
