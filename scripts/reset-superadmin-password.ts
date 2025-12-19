#!/usr/bin/env npx tsx
/**
 * ============================================================
 * Script de Reset de Senha de Super Admin
 * ============================================================
 *
 * Este script permite listar e alterar senhas de super admins
 * do sistema FinanceHub de forma segura via console.
 *
 * @author Bruno D. Afonso
 * @website https://brunoafonso.dev
 * @instagram @brunoafonso.dev
 * @email bruno@xpiria.com.br
 *
 * Uso: npx tsx scripts/reset-superadmin-password.ts
 *
 * ============================================================
 */

import * as readline from 'readline';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config();

// Interface para usuário
interface SuperAdmin {
  id: number;
  nome: string;
  email: string;
  telefone: string | null;
  data_cadastro: Date;
}

// Cores para o console
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
  bgGreen: '\x1b[42m',
};

// Função para imprimir com cores
function print(text: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${text}${colors.reset}`);
}

// Função para imprimir o banner
function printBanner() {
  console.clear();
  print('╔════════════════════════════════════════════════════════════╗', 'cyan');
  print('║                                                            ║', 'cyan');
  print('║       🔐 RESET DE SENHA - SUPER ADMIN                      ║', 'cyan');
  print('║                                                            ║', 'cyan');
  print('║       FinanceHub - Sistema de Gestão Financeira            ║', 'cyan');
  print('║                                                            ║', 'cyan');
  print('╠════════════════════════════════════════════════════════════╣', 'cyan');
  print('║  Autor: Bruno D. Afonso                                    ║', 'dim');
  print('║  Site: https://brunoafonso.dev                             ║', 'dim');
  print('║  Instagram: @brunoafonso.dev                               ║', 'dim');
  print('║  Email: bruno@xpiria.com.br                                ║', 'dim');
  print('╚════════════════════════════════════════════════════════════╝', 'cyan');
  console.log('');
}

// Função para criar interface de leitura
function createReadlineInterface(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
}

// Função para perguntar
function question(rl: readline.Interface, query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer);
    });
  });
}

// Função para perguntar senha (sem mostrar caracteres)
function questionPassword(rl: readline.Interface, query: string): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const stdout = process.stdout;

    stdout.write(query);

    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let password = '';

    const onData = (char: string) => {
      const charCode = char.charCodeAt(0);

      if (charCode === 13 || charCode === 10) { // Enter
        stdin.setRawMode(false);
        stdin.pause();
        stdin.removeListener('data', onData);
        stdout.write('\n');
        resolve(password);
      } else if (charCode === 127 || charCode === 8) { // Backspace
        if (password.length > 0) {
          password = password.slice(0, -1);
          stdout.clearLine(0);
          stdout.cursorTo(0);
          stdout.write(query + '*'.repeat(password.length));
        }
      } else if (charCode === 3) { // Ctrl+C
        stdin.setRawMode(false);
        process.exit();
      } else if (charCode >= 32) { // Printable characters
        password += char;
        stdout.write('*');
      }
    };

    stdin.on('data', onData);
  });
}

// Função para conectar ao banco
async function connectDatabase() {
  const postgres = (await import('postgres')).default;
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL não está definida nas variáveis de ambiente');
  }

  return postgres(connectionString, { prepare: false });
}

// Função para listar super admins
async function listSuperAdmins(client: any): Promise<SuperAdmin[]> {
  const result = await client`
    SELECT id, nome, email, telefone, data_cadastro
    FROM usuarios
    WHERE tipo_usuario = 'super_admin'
    ORDER BY id
  `;

  return result as SuperAdmin[];
}

// Função para atualizar senha
async function updatePassword(client: any, userId: number, newPassword: string): Promise<void> {
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  await client`
    UPDATE usuarios
    SET senha = ${hashedPassword}
    WHERE id = ${userId}
  `;
}

// Função para validar senha
function validatePassword(password: string): { valid: boolean; message: string } {
  if (password.length < 6) {
    return { valid: false, message: 'A senha deve ter pelo menos 6 caracteres' };
  }
  if (password.length > 50) {
    return { valid: false, message: 'A senha deve ter no máximo 50 caracteres' };
  }
  return { valid: true, message: '' };
}

// Função principal
async function main() {
  printBanner();

  const rl = createReadlineInterface();
  let client: any = null;

  try {
    // Conectar ao banco
    print('🔌 Conectando ao banco de dados...', 'yellow');
    client = await connectDatabase();
    print('✅ Conexão estabelecida com sucesso!\n', 'green');

    // Listar super admins
    print('📋 Buscando super admins...', 'yellow');
    const superAdmins = await listSuperAdmins(client);

    if (superAdmins.length === 0) {
      print('\n❌ Nenhum super admin encontrado no sistema.', 'red');
      rl.close();
      await client.end();
      return;
    }

    // Exibir lista
    console.log('');
    print('╔════════════════════════════════════════════════════════════╗', 'blue');
    print('║              SUPER ADMINS CADASTRADOS                      ║', 'blue');
    print('╠════════════════════════════════════════════════════════════╣', 'blue');

    superAdmins.forEach((admin, index) => {
      const dataFormatada = new Date(admin.data_cadastro).toLocaleDateString('pt-BR');
      console.log(`${colors.blue}║${colors.reset} ${colors.bright}[${index + 1}]${colors.reset} ${admin.nome.padEnd(20)} ${colors.dim}(${admin.email})${colors.reset}`);
      console.log(`${colors.blue}║${colors.reset}     ID: ${admin.id} | Cadastro: ${dataFormatada}`);
      if (index < superAdmins.length - 1) {
        print('║────────────────────────────────────────────────────────────║', 'blue');
      }
    });

    print('╠════════════════════════════════════════════════════════════╣', 'blue');
    print('║  [0] Cancelar e sair                                       ║', 'blue');
    print('╚════════════════════════════════════════════════════════════╝', 'blue');
    console.log('');

    // Pedir escolha
    const choice = await question(rl, `${colors.cyan}➤ Digite o número do super admin para alterar a senha: ${colors.reset}`);
    const choiceNum = parseInt(choice);

    if (choiceNum === 0 || isNaN(choiceNum)) {
      print('\n👋 Operação cancelada. Até mais!', 'yellow');
      rl.close();
      await client.end();
      return;
    }

    if (choiceNum < 1 || choiceNum > superAdmins.length) {
      print('\n❌ Opção inválida!', 'red');
      rl.close();
      await client.end();
      return;
    }

    const selectedAdmin = superAdmins[choiceNum - 1];

    console.log('');
    print(`📝 Alterando senha de: ${selectedAdmin.nome} (${selectedAdmin.email})`, 'magenta');
    console.log('');

    // Pedir nova senha
    rl.close(); // Fechar para usar modo raw

    const newPassword = await questionPassword(
      createReadlineInterface(),
      `${colors.cyan}➤ Digite a nova senha: ${colors.reset}`
    );

    // Validar senha
    const validation = validatePassword(newPassword);
    if (!validation.valid) {
      print(`\n❌ ${validation.message}`, 'red');
      await client.end();
      return;
    }

    // Confirmar senha
    const confirmPassword = await questionPassword(
      createReadlineInterface(),
      `${colors.cyan}➤ Confirme a nova senha: ${colors.reset}`
    );

    if (newPassword !== confirmPassword) {
      print('\n❌ As senhas não coincidem!', 'red');
      await client.end();
      return;
    }

    // Atualizar senha
    print('\n🔄 Atualizando senha...', 'yellow');
    await updatePassword(client, selectedAdmin.id, newPassword);

    console.log('');
    print('╔════════════════════════════════════════════════════════════╗', 'green');
    print('║                                                            ║', 'green');
    print('║   ✅ SENHA ALTERADA COM SUCESSO!                          ║', 'green');
    print('║                                                            ║', 'green');
    print(`║   Usuário: ${selectedAdmin.email.padEnd(40)}     ║`, 'green');
    print('║                                                            ║', 'green');
    print('╚════════════════════════════════════════════════════════════╝', 'green');
    console.log('');

  } catch (error) {
    print(`\n❌ Erro: ${error instanceof Error ? error.message : 'Erro desconhecido'}`, 'red');
    console.error(error);
  } finally {
    if (client) {
      await client.end();
    }
    process.exit(0);
  }
}

// Executar
main().catch(console.error);
