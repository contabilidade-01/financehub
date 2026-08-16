# FinanceHub SaaS - Guia de Deploy com Docker

## 🚀 Deploy Options

Este projeto está configurado para deploy em múltiplas plataformas usando Docker:

- **Heroku**: Deploy tradicional com buildpacks
- **Railway**: Deploy moderno e simples
- **EasyPanel**: Self-hosted com interface amigável
- **Docker Local**: Para desenvolvimento e testes

## 📦 Arquivos de Deploy

### Core Files
- `Dockerfile` - Imagem Docker multi-stage otimizada
- `.dockerignore` - Exclusões para build mais rápido
- `docker-compose.yml` - Stack completa com PostgreSQL e Redis

### Platform Scripts
- `deploy-heroku.sh` - Deploy automatizado para Heroku
- `deploy-railway.sh` - Deploy automatizado para Railway
- `DEPLOY_EASYPANEL.md` - Guia completo para EasyPanel
- `EASYPANEL_FIX.md` - Solução para problemas de build

## 🔧 Configuração Rápida

### 1. Variáveis de Ambiente Obrigatórias
```bash
DATABASE_URL=postgresql://user:password@host:5432/database
NODE_ENV=production
TZ=America/Sao_Paulo
PORT=5000
```

### 2. Build Local
```bash
# Build da imagem
docker build -t financehub:latest .

# Executar com PostgreSQL
docker-compose up -d
```

### 3. Deploy Heroku
```bash
chmod +x deploy-heroku.sh
./deploy-heroku.sh meu-financehub-app
```

### 4. Deploy Railway
```bash
chmod +x deploy-railway.sh
./deploy-railway.sh
```

## 🏗️ Otimizações do Dockerfile

### Multi-stage Build
- **Stage 1 (builder)**: Instala dependências, compila TypeScript e React
- **Stage 2 (runtime)**: Apenas arquivos necessários para produção

### Optimizações Implementadas
- ✅ Alpine Linux (imagem 70% menor)
- ✅ Multi-stage build (reduz tamanho final)
- ✅ Cache de dependências npm
- ✅ Usuário não-root para segurança
- ✅ Health check integrado
- ✅ Suporte a Canvas/PDF (Sharp, Puppeteer)
- ✅ Timezone América/São Paulo
- ✅ Dumb-init para melhor signal handling

### Dependências Especiais
- **Canvas**: Para geração de gráficos SVG
- **Puppeteer**: Para geração de PDFs
- **Sharp**: Para processamento de imagens
- **PostgreSQL**: Banco de dados principal

## 📊 Performance

### Tamanho da Imagem
- **Total**: ~400MB (com todas dependências)
- **Base Alpine**: ~50MB
- **Node.js**: ~100MB
- **Dependências**: ~250MB

### Tempo de Build
- **Cold build**: 3-5 minutos
- **Cache build**: 30-60 segundos
- **Deploy**: 1-2 minutos

## 🔒 Segurança

### Implementações
- Usuário não-root (financehub:1001)
- Dependências Alpine atualizadas
- Health check para disponibilidade
- Variáveis de ambiente seguras
- Exclusão de arquivos desnecessários

### Recomendações
- Use HTTPS em produção
- Configure rate limiting
- Monitore logs de segurança
- Mantenha dependências atualizadas

## 🐛 Troubleshooting

### Build Falha no EasyPanel
Se você receber erro "Cannot find package 'vite'":

1. **Verificar build script**
   ```bash
   # O build deve excluir Vite do bundle
   grep "external:vite" package.json
   ```

2. **Testar build local**
   ```bash
   docker build --no-cache -t financehub-test .
   ```

3. **Verificar estrutura**
   ```bash
   ls -la dist/
   node dist/index.js  # Deve funcionar sem erro
   ```

### Build Falha Geral
```bash
# Limpar cache Docker
docker system prune -a

# Build com logs verbose
docker build --no-cache --progress=plain -t financehub .
```

### Erro de Dependências
```bash
# Verificar se todas dependências estão no package.json
npm audit
npm outdated
```

### Banco não Conecta
```bash
# Testar conexão
docker run --rm postgres:16-alpine pg_isready -h host -p 5432 -U user
```

### Canvas/PDF não Funciona
```bash
# Verificar dependências Alpine
docker run --rm -it financehub:latest sh
apk list | grep cairo
```

## 📈 Monitoramento

### Health Check
- **Endpoint**: `/api/changelog`
- **Interval**: 30 segundos
- **Timeout**: 3 segundos
- **Retries**: 3

### Logs
```bash
# Docker logs
docker logs -f container_name

# Docker compose logs
docker-compose logs -f app
```

### Métricas
- CPU/Memory usage
- Response time
- Error rate
- Database connections

## 🔄 CI/CD

### GitHub Actions (Exemplo)
```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to Railway
        run: |
          npm install -g @railway/cli
          railway login --token ${{ secrets.RAILWAY_TOKEN }}
          railway up
```

## 💡 Dicas de Produção

### 1. Database
- Use PostgreSQL 16+ para melhor performance
- Configure connection pooling
- Implemente backup automático

### 2. Cache
- Redis para sessões e cache
- CDN para assets estáticos
- Cache de queries frequentes

### 3. Scaling
- Load balancer para múltiplas instâncias
- Auto-scaling baseado em CPU/Memory
- Database read replicas se necessário

### 4. Backup
- Backup diário do banco
- Backup de uploads/arquivos
- Teste restauração regularmente

## 📞 Suporte

Para problemas específicos de deploy:
1. Verifique logs detalhados
2. Confirme variáveis de ambiente
3. Teste conexão com banco
4. Valide health check endpoint

Recursos úteis:
- [Docker Documentation](https://docs.docker.com/)
- [Heroku Node.js Guide](https://devcenter.heroku.com/articles/nodejs)
- [Railway Documentation](https://docs.railway.app/)