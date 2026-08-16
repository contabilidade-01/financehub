# Solução Definitiva para Deploy Docker

## Problema Resolvido
O erro `Cannot find package 'vite'` foi causado pelo esbuild incluindo imports do Vite no bundle de produção.

## Solução Implementada
1. **Script de Build Customizado**: `build-production.js` exclui Vite do bundle
2. **Dockerfile Principal**: Otimizado com multi-stage build (usar `Dockerfile`, não `Dockerfile.fixed`)
3. **Separação Completa**: Build stage vs runtime stage
4. **Exclusão de Dependências**: Vite e plugins excluídos do bundle de produção

## IMPORTANTE: Configuração no EasyPanel
Se você vê erro "Dockerfile.fixed: no such file", faça:
1. EasyPanel → Applications → Seu App → Settings
2. Dockerfile: mude de "Dockerfile.fixed" para **"Dockerfile"**
3. Save → Build → Rebuild

## Deploy no EasyPanel

### Solução Única (FUNCIONANDO)
```bash
# Push para Git
git add .
git commit -m "Fix Docker build - exclude Vite from production bundle"
git push origin main

# No EasyPanel: 
# 1. Vá em Applications → Seu App → Settings
# 2. Altere o Dockerfile de "Dockerfile.fixed" para "Dockerfile"
# 3. Clique em Save
# 4. Vá em Build → Rebuild
```

### Ou Build Local
```bash
# Testar build
docker build -t financehub:test .

# Deploy
docker build -t registry.easypanel.com/seu-usuario/financehub .
docker push registry.easypanel.com/seu-usuario/financehub
```

## O que foi Corrigido

✅ **Build Script**: `build-production.js` exclui Vite e plugins do bundle  
✅ **Dockerfile**: Multi-stage otimizado com script customizado  
✅ **Runtime**: Apenas dependências de produção  
✅ **Estrutura**: Todos os arquivos na posição correta  
✅ **Dependências**: Exclusão completa: vite, @vitejs/plugin-react, @replit plugins

## Teste Local
```bash
# Testar o build customizado
node build-production.js

# Testar a aplicação
NODE_ENV=production node dist/index.js

# Build Docker completo
docker build --no-cache -t financehub:test .

# Testar container
docker run -p 5000:5000 -e DATABASE_URL="postgresql://test:test@localhost:5432/test" financehub:test
```

## Troubleshooting Adicional

### Erro "npm ci failed"
Se o build falhar na instalação de dependências:
- O Dockerfile agora copia package-lock.json corretamente
- Usa --ignore-scripts para evitar problemas de build
- Instala dependências antes de copiar arquivos finais

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Instalar dependências sistema
RUN apk add --no-cache python3 make g++ cairo-dev jpeg-dev pango-dev

# Copiar package.json
COPY package.json package-lock.json ./
RUN npm ci

# Copiar código
COPY . .

# Build
RUN npm run build

# Configurar produção
ENV NODE_ENV=production
ENV PORT=5000
EXPOSE 5000

CMD ["node", "dist/index.js"]
```

## Verificações Importantes

### 1. Estrutura de Arquivos
Confirmar que existe:
```
/client/index.html
/client/src/main.tsx
/vite.config.ts
/package.json
```

### 2. Variáveis de Ambiente no EasyPanel
```
NODE_ENV=production
DATABASE_URL=postgresql://user:pass@host:5432/db
PORT=5000
TZ=America/Sao_Paulo
```

### 3. Configuração de Porta
- **Container Port**: 5000
- **Public Port**: 80/443

## Troubleshooting

### Se Build Continuar Falhando:

1. **Verificar logs detalhados**
   - No EasyPanel, vá em "Logs" durante o build
   - Procure por erros específicos

2. **Testar build local**
   ```bash
   docker build --no-cache -t test .
   ```

3. **Verificar permissões de arquivos**
   ```bash
   ls -la client/
   cat client/index.html
   ```

4. **Simplificar Dockerfile temporariamente**
   - Comentar otimizações
   - Usar apenas comandos básicos

### Build Alternativo Minimalista
Se nada funcionar, use esta versão ultra-simplificada:

```dockerfile
FROM node:20

WORKDIR /app
COPY . .
RUN npm install
RUN npm run build
EXPOSE 5000
CMD ["node", "dist/index.js"]
```

## Próximos Passos

1. Tente o rebuild no EasyPanel com as correções atuais
2. Se falhar, use o Dockerfile simplificado
3. Se ainda falhar, teste build local primeiro
4. Confirme variáveis de ambiente estão corretas

## Comandos Úteis

```bash
# Testar build local
docker build -t financehub-test .

# Verificar estrutura da imagem
docker run --rm -it financehub-test sh

# Testar aplicação local
docker run -p 5000:5000 -e DATABASE_URL="sua-url" financehub-test
```