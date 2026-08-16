#!/bin/bash

# Script de deploy para Railway - FinanceHub SaaS
# Execute: chmod +x deploy-railway.sh && ./deploy-railway.sh

set -e

echo "🚂 FinanceHub SaaS - Deploy para Railway"
echo "======================================="

# Verificar se railway CLI está instalado
if ! command -v railway &> /dev/null; then
    echo "❌ Railway CLI não encontrado. Instale com: npm install -g @railway/cli"
    exit 1
fi

# Verificar login no Railway
if ! railway whoami &> /dev/null; then
    echo "❌ Não logado no Railway. Execute: railway login"
    exit 1
fi

# Criar projeto
PROJECT_NAME=${1:-financehub-saas}
echo "📱 Criando projeto: $PROJECT_NAME"

# Inicializar projeto Railway
railway login
railway init $PROJECT_NAME

# Adicionar PostgreSQL
echo "🐘 Adicionando PostgreSQL..."
railway add postgresql

# Configurar variáveis de ambiente
echo "⚙️ Configurando variáveis de ambiente..."
railway variables set NODE_ENV=production
railway variables set TZ=America/Sao_Paulo
railway variables set PORT=5000

# Deploy
echo "📦 Fazendo deploy..."
railway up

# Mostrar informações
echo ""
echo "✅ Deploy concluído com sucesso!"
echo "🌐 Para ver sua aplicação: railway open"
echo "📊 Dashboard: railway dashboard"
echo ""
echo "📋 Comandos úteis:"
echo "  railway logs           # Ver logs"
echo "  railway shell          # Acessar terminal"
echo "  railway variables      # Ver variáveis de ambiente"
echo ""