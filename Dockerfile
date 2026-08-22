# Dockerfile para rodar a aplicação
# Usando Debian (slim) ao invés de Alpine para melhor compatibilidade com canvas
FROM node:20-slim

# Instalar dependências do sistema necessárias para canvas e chromium
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    python3 \
    chromium \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Variáveis de ambiente para otimizar build
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_OPTIONS=--max_old_space_size=4096

# Copia os arquivos de dependência
COPY package.json package-lock.json ./

# Instala as dependências
# Com Debian, o canvas usa binários pré-compilados automaticamente
RUN npm install

# Instala drizzle-kit globalmente
RUN npm install -g drizzle-kit

# Copia todo o restante do código
COPY . .

# Copia o script de inicialização do banco
COPY init.sql /docker-entrypoint-initdb.d/

# Build do frontend/backend
RUN npm run build

# Exponha a porta padrão
EXPOSE 5000

# Roda o Node DIRETO (não via npm). Assim o SIGTERM do redeploy chega ao Node
# (PID 1), que trata o encerramento gracioso — sem o ruído "npm error signal
# SIGTERM". O NODE_ENV é definido aqui já que não passamos mais pelo npm start.
ENV NODE_ENV=production
CMD ["node", "dist/index.js"]
