# PLANO DE AÇÃO: INSTALADOR XPIRIA

## 📋 OBJETIVO
Criar um script de instalação automatizada (`xpiria_install.sh`) para configurar e instalar todas as dependências necessárias do sistema financeiro XPIRIA em servidores Linux.

## 🔍 ANÁLISE DO PROJETO

### Tecnologias Identificadas:
- **Backend**: Node.js + Express + TypeScript
- **Frontend**: React + Vite
- **Banco de Dados**: PostgreSQL
- **ORM**: Drizzle ORM
- **Sessões**: PostgreSQL (connect-pg-simple)
- **Build Tools**: Vite, ESBuild, TSX

### Dependências do Sistema:
- Node.js (v18+ recomendado)
- PostgreSQL (v12+)
- npm/yarn
- Git
- Build essentials (gcc, make, python3)

## 📝 ESTRUTURA DO PLANO DE INSTALAÇÃO

### 1. **VERIFICAÇÃO DE AMBIENTE**
- [ ] Verificar sistema operacional (Ubuntu/Debian/CentOS/RHEL)
- [ ] Verificar privilégios de usuário (sudo)
- [ ] Verificar conectividade com internet
- [ ] Verificar espaço em disco disponível (mín. 2GB)

### 2. **VERIFICAÇÃO DE DEPENDÊNCIAS EXISTENTES**
- [ ] Node.js (verificar versão, instalar se necessário)
- [ ] PostgreSQL (verificar instalação e versão)
- [ ] Git (verificar instalação)
- [ ] Build tools (gcc, make, python3)
- [ ] npm (vem com Node.js)

### 3. **INSTALAÇÃO DE DEPENDÊNCIAS**
- [ ] Atualizar repositórios do sistema
- [ ] Instalar Node.js via NodeSource ou NVM
- [ ] Instalar PostgreSQL
- [ ] Instalar Git
- [ ] Instalar build-essential/development tools
- [ ] Configurar PostgreSQL (iniciar serviço, criar usuário)

### 4. **CONFIGURAÇÃO DO BANCO DE DADOS**
- [ ] Solicitar credenciais do banco (usuário, senha, host, porta, database)
- [ ] Testar conexão com PostgreSQL
- [ ] Criar database se não existir
- [ ] Configurar permissões de usuário

### 5. **CONFIGURAÇÃO DO PROJETO**
- [ ] Clonar repositório ou copiar arquivos
- [ ] Instalar dependências npm (`npm install`)
- [ ] Criar arquivo .env baseado no production.env.example
- [ ] Configurar variáveis de ambiente com credenciais do banco
- [ ] Executar migrações do banco de dados
- [ ] Executar build do projeto

### 6. **CONFIGURAÇÃO DE SERVIÇOS**
- [ ] Criar arquivo de serviço systemd
- [ ] Configurar auto-start na inicialização
- [ ] Configurar proxy reverso (Nginx - opcional)
- [ ] Configurar firewall (portas necessárias)

### 7. **TESTES E VALIDAÇÃO**
- [ ] Testar conexão com banco de dados
- [ ] Testar build do projeto
- [ ] Testar início da aplicação
- [ ] Verificar logs de erro
- [ ] Testar acesso via browser (se aplicável)

### 8. **FINALIZAÇÃO**
- [ ] Exibir resumo da instalação
- [ ] Mostrar URLs de acesso
- [ ] Exibir comandos úteis para gerenciamento
- [ ] Criar backup das configurações

## 🛠️ ESTRUTURA DO SCRIPT

### Seções do Script:
1. **Header ASCII XPIRIA** - Todas as seções
2. **Funções Utilitárias** - Logging, verificações, instalações
3. **Verificação de Ambiente** - OS, usuário, espaço
4. **Verificação de Dependências** - Node, PostgreSQL, Git
5. **Instalação de Dependências** - Instalação automatizada
6. **Configuração de Banco** - Setup PostgreSQL
7. **Configuração do Projeto** - Env, build, migrations
8. **Configuração de Serviços** - Systemd, auto-start
9. **Testes e Validação** - Verificações finais
10. **Finalização** - Resumo e instruções

## 📋 VARIÁVEIS DE AMBIENTE NECESSÁRIAS

### Essenciais:
```bash
NODE_ENV=production
TZ=America/Sao_Paulo
PORT=5000
DATABASE_URL=postgresql://usuario:senha@host:5432/banco
SESSION_SECRET=chave_secreta_gerada
```

### Opcionais:
```bash
API_RATE_LIMIT=100
MAX_FILE_SIZE=10MB
BASE_URL=https://seu-dominio.com
REDIS_URL=redis://localhost:6379
```

## 🔧 COMANDOS CRÍTICOS DO PROJETO

### Build e Deploy:
```bash
npm install                    # Instalar dependências
npm run check                  # Verificar TypeScript
npm run build                  # Build do projeto
npm start                      # Iniciar em produção
npm run start:migration        # Executar migrações
```

### Banco de Dados:
```bash
npm run db:push                # Push schema para DB
npm run db:seed                # Seed dados globais
```

## 🚨 PONTOS CRÍTICOS DE ATENÇÃO

1. **Canvas Dependency**: Biblioteca `canvas` requer dependências nativas
2. **PostgreSQL**: Configuração correta de encoding e locale
3. **Puppeteer**: Pode precisar de dependências adicionais no Linux
4. **Build Tools**: gcc, make, python3 necessários para compilação
5. **Permissões**: Usuário adequado para PostgreSQL e aplicação
6. **Firewall**: Portas 5000 (app) e 5432 (PostgreSQL) conforme necessário
7. **Sharp**: Biblioteca de imagem que pode precisar de libs nativas

## 📊 CHECKLIST DE VALIDAÇÃO FINAL

- [ ] PostgreSQL rodando e acessível
- [ ] Banco de dados criado e migrado
- [ ] Aplicação compila sem erros
- [ ] Aplicação inicia sem erros
- [ ] Variáveis de ambiente configuradas
- [ ] Serviço systemd funcionando
- [ ] Auto-start configurado
- [ ] Logs de aplicação limpos
- [ ] Acesso via browser funcionando
- [ ] Backup de configurações criado

## 🎯 PRÓXIMOS PASSOS

1. **Implementar script base** com estrutura de funções
2. **Adicionar ASCII header XPIRIA** em todas as seções
3. **Implementar verificações de ambiente**
4. **Implementar instalação de dependências**
5. **Implementar configuração de banco**
6. **Implementar configuração do projeto**
7. **Implementar testes e validação**
8. **Testar em diferentes distribuições Linux**
9. **Documentar troubleshooting comum**
10. **Criar versão de atualização/upgrade**