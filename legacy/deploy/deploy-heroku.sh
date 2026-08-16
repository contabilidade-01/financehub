#!/bin/bash

# Script de deploy para Heroku - FinanceHub SaaS
# Execute: chmod +x deploy-heroku.sh && ./deploy-heroku.sh

set -e

echo "🚀 FinanceHub SaaS - Deploy para Heroku"
echo "======================================="

# Verificar se heroku CLI está instalado
if ! command -v heroku &> /dev/null; then
    echo "❌ Heroku CLI não encontrado. Instale em: https://devcenter.heroku.com/articles/heroku-cli"
    exit 1
fi

# Verificar login no Heroku
if ! heroku auth:whoami &> /dev/null; then
    echo "❌ Não logado no Heroku. Execute: heroku login"
    exit 1
fi

# Nome da aplicação (modificar conforme necessário)
APP_NAME=${1:-financehub-saas-$(date +%s)}

echo "📱 Criando aplicação: $APP_NAME"

# Criar aplicação no Heroku
heroku create $APP_NAME --region us

# Configurar buildpack para Node.js
heroku buildpacks:set heroku/nodejs -a $APP_NAME

# Adicionar PostgreSQL
echo "🐘 Adicionando PostgreSQL..."
heroku addons:create heroku-postgresql:essential-0 -a $APP_NAME

# Configurar variáveis de ambiente
echo "⚙️ Configurando variáveis de ambiente..."
heroku config:set NODE_ENV=production -a $APP_NAME
heroku config:set TZ=America/Sao_Paulo -a $APP_NAME
heroku config:set NPM_CONFIG_PRODUCTION=true -a $APP_NAME

# Deploy
echo "📦 Fazendo deploy..."
git add .
git commit -m "Deploy to Heroku" || true
heroku git:remote -a $APP_NAME
git push heroku main

# Executar migrações (se necessário)
echo "🔄 Executando migrações de banco..."
heroku run npm run db:push -a $APP_NAME

# Escalar dyno
echo "📈 Escalando aplicação..."
heroku ps:scale web=1 -a $APP_NAME

# Mostrar informações da aplicação
echo ""
echo "✅ Deploy concluído com sucesso!"
echo "🌐 URL da aplicação: https://$APP_NAME.herokuapp.com"
echo "📊 Dashboard: https://dashboard.heroku.com/apps/$APP_NAME"
echo ""
echo "📋 Comandos úteis:"
echo "  heroku logs --tail -a $APP_NAME    # Ver logs em tempo real"
echo "  heroku open -a $APP_NAME           # Abrir aplicação no browser"
echo "  heroku run bash -a $APP_NAME       # Acessar terminal da aplicação"
echo ""