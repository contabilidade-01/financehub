# Guia de Deployment - FinanceHub

## Problema Comum: "relation usuarios does not exist"

Se você receber o erro `PostgresError: relation "usuarios" does not exist` após o deployment, isso significa que o banco de dados está vazio e precisa ser inicializado.

## Solução Automática (Versão 0.0.9+)

A partir da versão 0.0.9, o sistema inclui inicialização automática de banco de dados. O sistema automaticamente:

1. ✅ Detecta se as tabelas existem
2. ✅ Cria todas as tabelas necessárias se não existirem
3. ✅ Insere dados padrão (categorias globais, formas de pagamento)
4. ✅ Cria usuário admin (teste@teste.com / admin123)

## Verificação dos Logs

Após o deployment, verifique os logs da aplicação. Você deve ver:

```
🚀 Inicializando aplicação...
⏳ Aguardando conexão com banco de dados...
✅ Conexão com banco estabelecida
🔍 Verificando estado do banco de dados...
⚠️ Tabelas não encontradas, criando estrutura do banco...
🔧 Criando estrutura completa do banco de dados...
✅ Tabelas criadas com sucesso!
📊 Inserindo dados padrão...
✅ Dados padrão inseridos!
👤 Usuário admin criado: teste@teste.com
✅ Banco de dados inicializado com sucesso!
✅ Aplicação inicializada com sucesso!
```

## Solução Manual para Deploy

Se a inicialização automática falhar, você pode executar o script de sincronização específico para produção:

```bash
# Opção 1: Script rápido (RECOMENDADO para deploy)
npx tsx sync-deploy.js

# Opção 2: Script completo com verificações detalhadas
npx tsx deploy-production-sync.js

# Opção 3: Script legado (se necessário)
node setup-production.js
```

### Script de Deploy Recomendado

O `deploy-production-sync.js` é especialmente projetado para resolver problemas de deploy e garante:

- ✅ Criação completa de todas as 9 tabelas necessárias
- ✅ Inserção de 17 categorias globais padrão
- ✅ Inserção de 6 formas de pagamento globais  
- ✅ Criação do usuário super admin (teste@teste.com / admin123)
- ✅ Verificação de integridade completa do banco
- ✅ Logs detalhados para troubleshooting

## Credenciais Padrão

Após a inicialização, você pode fazer login com:
- **Email:** teste@teste.com
- **Senha:** admin123
- **Tipo:** Super Administrador

## Estrutura Criada Automaticamente

### Tabelas
- usuarios (usuários do sistema)
- carteiras (carteiras financeiras)
- categorias (categorias de transações)
- formas_pagamento (métodos de pagamento)
- transacoes (transações financeiras)
- lembretes (lembretes do usuário)
- api_tokens (tokens de API)
- cancelamentos (log de cancelamentos)
- user_sessions_admin (sessões de administração)

### Dados Padrão

**Categorias de Despesa (13):**
- Alimentação, Moradia, Doações, Educação, Imposto
- Investimento, Lazer, Pets, Saude, Transporte
- Vestuário, Viagem, Outros

**Categorias de Receita (4):**
- Investimentos, Salário, Freelance, Outros

**Formas de Pagamento (6):**
- PIX, Cartão de Crédito, Cartão de Débito
- Dinheiro, TED/DOC, Cheque

## Instruções por Plataforma

### Replit Deploy
1. Configure DATABASE_URL nas secrets/variáveis de ambiente
2. A aplicação irá inicializar automaticamente 
3. Se houver problemas, use o console do Replit para executar: `npx tsx sync-deploy.js`

### Heroku/Railway/Render
1. Configure as variáveis de ambiente
2. Execute `npm run build` (já inclui sincronização automática)
3. Se necessário, execute manualmente no console: `npx tsx sync-deploy.js`

### EasyPanel/Docker
1. Defina DATABASE_URL no docker-compose.yml ou variáveis do container
2. Execute o script após deploy: `docker exec <container> npx tsx sync-deploy.js`

### Vercel/Netlify
Estas plataformas não suportam Node.js backend persistente. Use alternativas como Railway ou Render.

## Variáveis de Ambiente Necessárias

Certifique-se de que estas variáveis estão configuradas:

```env
DATABASE_URL=postgresql://usuario:senha@host:porta/database
NODE_ENV=production
TZ=America/Sao_Paulo
```

## Troubleshooting

### Erro de Conexão com Banco
- Verifique se a DATABASE_URL está correta
- Confirme se o banco PostgreSQL está acessível
- Teste a conexão manualmente

### Tabelas Não Criadas
- Verifique os logs de inicialização
- Confirme se o usuário do banco tem permissões de CREATE TABLE
- Execute setup-production.js manualmente se necessário

### Login Não Funciona
- Verifique se o usuário admin foi criado nos logs
- Confirme se a senha está sendo hasheada corretamente
- Teste com teste@teste.com / admin123

## Suporte

Para problemas específicos de deployment:
1. Verifique os logs completos da aplicação
2. Confirme se todas as variáveis de ambiente estão configuradas
3. Teste a conexão com o banco de dados
4. Execute a inicialização manual se necessário