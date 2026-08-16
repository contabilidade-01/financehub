# Deploy no EasyPanel - Guia Passo a Passo

## Configuração Inicial

### 1. Criar Aplicação
1. No EasyPanel, clique em **"Create Application"**
2. Escolha **"Git Repository"**
3. Conecte seu repositório GitHub/GitLab
4. Branch: **main**

### 2. Configuração de Build
- **Dockerfile**: `Dockerfile` (não usar Dockerfile.fixed)
- **Build Context**: `.` (raiz do projeto)
- **Build Arguments** (opcional):
  ```
  NODE_ENV=production
  TZ=America/Sao_Paulo
  ```

### 3. Configuração de Rede
- **Internal Port**: 5000
- **External Port**: 80/443 (HTTPS automático)
- **Health Check Path**: `/api/changelog`

### 4. Variáveis de Ambiente (OBRIGATÓRIAS)
```bash
NODE_ENV=production
DATABASE_URL=postgresql://user:password@host:5432/database
PORT=5000
TZ=America/Sao_Paulo
```

**Credenciais Padrão do Admin:**
- Email: `teste@teste.com`
- Senha: `admin123`

*As credenciais são criadas automaticamente na primeira inicialização*

### 5. Configuração de Recursos
```yaml
CPU: 1 vCPU (mínimo)
Memory: 1GB RAM (mínimo)
Storage: 10GB SSD
```

## Banco de Dados

### Opção 1: PostgreSQL do EasyPanel
1. Crie um serviço PostgreSQL separado
2. Configure DATABASE_URL com as credenciais

### Opção 2: PostgreSQL Externo (Recomendado)
Use [Neon](https://neon.tech) ou [Supabase](https://supabase.com):
1. Crie um banco gratuito
2. Copie a CONNECTION STRING
3. Configure como DATABASE_URL

## Troubleshooting

### Erro "Dockerfile.fixed not found"
**Solução:**
1. EasyPanel → Applications → Seu App → **Settings**
2. Dockerfile: altere para **"Dockerfile"**
3. Save → Build → **Rebuild**

### Erro "Cannot find package 'vite'"
**Solução:** Já resolvido no Dockerfile principal com script customizado

### Erro "npm ci failed" 
**Solução:** Dockerfile corrigido para copiar package-lock.json e usar --ignore-scripts

### Build muito lento
**Otimização:**
- Use cache de Docker layers
- Build incremental habilitado
- Recursos suficientes (mín 1GB RAM)

### Aplicação não inicia
**Verificar:**
1. DATABASE_URL está correto
2. Porta 5000 configurada
3. Health check em `/api/changelog`
4. Logs em tempo real no painel
5. Aguardar migrations automáticas (pode levar 1-2 minutos)

### Migrations Automáticas
- Sistema executa migrations automaticamente na inicialização
- Cria usuário admin (teste@teste.com / admin123) se não existir
- Aguarda conexão com banco antes de iniciar servidor

## Deploy Automático

### Via Git (Recomendado)
1. **Push para repositório:**
   ```bash
   git add .
   git commit -m "Deploy to EasyPanel"
   git push origin main
   ```

2. **Auto deploy habilitado:** Build automático a cada push

### Manual
1. EasyPanel → Applications → Seu App
2. **Build** → **Rebuild**
3. Aguardar conclusão

## Monitoramento

### Logs
- Logs em tempo real no painel EasyPanel
- Filtros por erro/warning/info
- Download de logs para análise

### Métricas
- CPU/Memory usage
- Response time
- Uptime/downtime
- Request volume

### Alertas
Configure alertas para:
- High CPU (>80%)
- High Memory (>90%)
- Application down
- Build failures

## Comandos Úteis

```bash
# Ver logs em tempo real
curl -H "Authorization: Bearer $EASYPANEL_TOKEN" \
  https://api.easypanel.com/apps/seu-app/logs

# Restart aplicação
curl -X POST -H "Authorization: Bearer $EASYPANEL_TOKEN" \
  https://api.easypanel.com/apps/seu-app/restart

# Ver status
curl -H "Authorization: Bearer $EASYPANEL_TOKEN" \
  https://api.easypanel.com/apps/seu-app/status
```

## Backup e Segurança

### Backup Automático
- Configure backup diário do banco
- Backup de variáveis de ambiente
- Backup de configurações da aplicação

### SSL/HTTPS
- Certificados Let's Encrypt automáticos
- HTTPS obrigatório em produção
- Renovação automática

### Domínio Customizado
1. Configure DNS do seu domínio
2. CNAME: seu-app.easypanel.app
3. Aguarde propagação DNS (até 24h)

## Custos Estimados

### Configuração Mínima
- **1 vCPU, 1GB RAM**: ~$10-15/mês
- **PostgreSQL**: Incluso ou $5/mês
- **Bandwidth**: 100GB/mês incluso

### Configuração Recomendada
- **2 vCPU, 2GB RAM**: ~$20-30/mês
- **Banco externo**: $0-10/mês (Neon/Supabase)
- **Total**: ~$20-40/mês

## Suporte

Para problemas específicos:
1. Verifique logs detalhados
2. Teste conexão com banco
3. Valide variáveis de ambiente
4. Confirme Dockerfile correto (não .fixed)

**Documentação oficial:** https://easypanel.io/docs