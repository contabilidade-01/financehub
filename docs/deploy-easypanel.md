# Deploy no EasyPanel - FinanceHub SaaS

## Configuração via Interface Web

### 1. Criar Nova Aplicação
1. Acesse seu painel EasyPanel
2. Clique em "Create Application"
3. Selecione "Docker" como tipo de aplicação

### 2. Configuração do Container
```yaml
# Nome da aplicação
Name: financehub-saas

# Imagem Docker
Image: financehub:latest

# Build Context (se usando Git)
Build Context: .
Dockerfile: Dockerfile

# Porta
Port: 5000
```

### 3. Variáveis de Ambiente
```bash
NODE_ENV=production
TZ=America/Sao_Paulo
PORT=5000
DATABASE_URL=postgresql://username:password@hostname:5432/database
```

### 4. Configuração de Rede
- **Internal Port**: 5000
- **External Port**: 80/443 (HTTPS automático)
- **Domain**: seu-dominio.com

### 5. Recursos
```yaml
CPU: 1 vCPU
Memory: 1GB RAM
Storage: 10GB SSD
```

### 6. Health Check
```yaml
Health Check Path: /api/changelog
Health Check Port: 5000
Health Check Interval: 30s
```

## Configuração via Docker Compose

1. No EasyPanel, vá para "Applications" > "Create"
2. Selecione "Docker Compose"
3. Cole o conteúdo do `docker-compose.yml`
4. Ajuste as variáveis de ambiente conforme necessário

## Configuração de Banco de Dados

### Opção 1: PostgreSQL Interno do EasyPanel
1. Crie um serviço PostgreSQL separado
2. Anote as credenciais
3. Configure DATABASE_URL na aplicação

### Opção 2: PostgreSQL Externo (Recomendado)
Use serviços como:
- **Neon** (recomendado): https://neon.tech
- **Supabase**: https://supabase.com
- **Railway PostgreSQL**: https://railway.app

## Passos de Deploy

### Via Git (Recomendado)
1. **Conectar Repositório**
   - Vá em "Source" > "Git Repository"
   - Conecte seu repositório GitHub/GitLab
   - Branch: `main`

2. **Auto Deploy**
   - Ative "Auto Deploy" para deployments automáticos
   - Cada push no branch main fará novo deploy

### Via Docker Registry
1. **Build Local**
   ```bash
   docker build -t financehub:latest .
   docker tag financehub:latest registry.easypanel.com/seu-usuario/financehub
   docker push registry.easypanel.com/seu-usuario/financehub
   ```

2. **Deploy no EasyPanel**
   - Use a imagem: `registry.easypanel.com/seu-usuario/financehub:latest`

## Configurações Avançadas

### SSL/HTTPS
- EasyPanel configura HTTPS automaticamente
- Certificados Let's Encrypt renovados automaticamente

### Backup
```yaml
# Configurar backup automático
Backup Schedule: 0 2 * * * # Diário às 2h
Backup Retention: 7 days
Backup Storage: AWS S3 / EasyPanel Storage
```

### Scaling
```yaml
# Configuração de escala
Min Replicas: 1
Max Replicas: 3
CPU Threshold: 70%
Memory Threshold: 80%
```

### Logs
- Logs disponíveis em tempo real no painel
- Integração com sistemas externos via webhook

## Troubleshooting

### 1. Aplicação não inicia
- Verifique logs em "Logs" tab
- Confirme DATABASE_URL está correto
- Verifique se porta 5000 está configurada

### 2. Banco de dados não conecta
- Teste CONNECTION_STRING externamente
- Verifique firewall/whitelist
- Confirme timezone está correto

### 3. Build falha
- Verifique Dockerfile sintaxe
- Confirme dependências no package.json
- Verifique recursos disponíveis para build

## Monitoramento

### Métricas Disponíveis
- CPU Usage
- Memory Usage
- Network I/O
- Response Time
- Error Rate

### Alertas
Configure alertas para:
- High CPU usage (>80%)
- High Memory usage (>90%)
- Application down
- High error rate (>5%)

## Custos Estimados

### Configuração Mínima
- **vCPU**: 1 core
- **RAM**: 1GB
- **Storage**: 10GB
- **Custo**: ~$5-10/mês

### Configuração Produção
- **vCPU**: 2 cores
- **RAM**: 2GB
- **Storage**: 20GB
- **PostgreSQL**: Externo
- **Custo**: ~$15-25/mês

## Comandos Úteis

```bash
# Conectar via SSH (se disponível)
easypanel ssh financehub-saas

# Ver logs
easypanel logs financehub-saas --follow

# Restart aplicação
easypanel restart financehub-saas

# Scale aplicação
easypanel scale financehub-saas --replicas=2
```