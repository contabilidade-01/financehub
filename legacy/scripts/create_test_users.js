// Script para criar usuários de teste no sistema
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";

async function createTestUsers() {
  console.log("Criando usuários de teste...");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não está definida nas variáveis de ambiente");
  }

  const client = postgres(connectionString, { max: 1 });
  const db = drizzle(client);

  try {
    // Lista de usuários para criar
    const testUsers = [
      {
        email: "superadmin@financas.com",
        nome: "Super Administrador",
        senha: "admin123",
        tipo_usuario: "super_admin"
      },
      {
        email: "joao@teste.com", 
        nome: "João Silva",
        senha: "123456",
        tipo_usuario: "normal"
      },
      {
        email: "maria@teste.com",
        nome: "Maria Santos", 
        senha: "123456",
        tipo_usuario: "normal"
      },
      {
        email: "pedro@teste.com",
        nome: "Pedro Oliveira",
        senha: "123456", 
        tipo_usuario: "normal"
      },
      {
        email: "ana@teste.com",
        nome: "Ana Costa",
        senha: "123456",
        tipo_usuario: "normal"
      }
    ];

    for (const userData of testUsers) {
      // Verificar se o usuário já existe
      const existingUser = await db.execute(sql`
        SELECT id FROM usuarios WHERE email = ${userData.email};
      `);

      if (existingUser.length > 0) {
        console.log(`Usuário ${userData.email} já existe. Pulando...`);
        continue;
      }

      // Criptografar senha
      const hashedPassword = await bcrypt.hash(userData.senha, 10);

      // Criar usuário
      const newUser = await db.execute(sql`
        INSERT INTO usuarios (nome, email, senha, tipo_usuario, ativo)
        VALUES (${userData.nome}, ${userData.email}, ${hashedPassword}, ${userData.tipo_usuario}, true)
        RETURNING id;
      `);

      const userId = newUser[0].id;
      console.log(`✅ Usuário criado: ${userData.nome} (${userData.email}) - ID: ${userId}`);

      // Criar carteira para usuários normais
      if (userData.tipo_usuario === "normal") {
        const walletDescription = `Carteira principal de ${userData.nome}`;
        await db.execute(sql`
          INSERT INTO carteiras (usuario_id, nome, descricao, saldo_atual)
          VALUES (${userId}, ${'Carteira Principal'}, ${walletDescription}, ${0.00});
        `);
        console.log(`  📁 Carteira criada para ${userData.nome}`);

        // Pular criação de transações por enquanto para evitar problemas de categoria
        console.log(`  💰 Carteira criada sem transações iniciais para ${userData.nome}`);
      }
    }

    console.log("\n🎉 Usuários de teste criados com sucesso!");
    console.log("\n📋 Credenciais de acesso:");
    console.log("Super Admin:");
    console.log("  Email: superadmin@financas.com");
    console.log("  Senha: admin123");
    console.log("\nUsuários normais:");
    console.log("  Email: joao@teste.com, maria@teste.com, pedro@teste.com, ana@teste.com");
    console.log("  Senha: 123456 (para todos)");

  } catch (error) {
    console.error("Erro ao criar usuários de teste:", error);
    throw error;
  } finally {
    await client.end();
  }
}

// Executar a criação
createTestUsers()
  .then(() => {
    console.log("Criação de usuários concluída!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Erro na criação de usuários:", error);
    process.exit(1);
  });