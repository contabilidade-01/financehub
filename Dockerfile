# Dockerfile simples para rodar a aplicação
FROM node:20-alpine

# Instalar dependências do sistema necessárias para compilar pacotes nativos
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    pkgconfig \
    cairo-dev \
    jpeg-dev \
    pango-dev \
    musl-dev \
    giflib-dev \
    pixman-dev \
    pangomm-dev \
    libjpeg-turbo-dev \
    freetype-dev \
    chromium \
    nss \
    freetype \
    freetype-dev \
    harfbuzz \
    ca-certificates \
    ttf-freefont

WORKDIR /app

# Variáveis de ambiente para otimizar build
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV NODE_OPTIONS=--max_old_space_size=4096

# Copia os arquivos de dependência
COPY package.json package-lock.json ./

# Instala as dependências
# Usa --canvas_binary_host_mirror para baixar binários pré-compilados
RUN npm install --canvas_binary_host_mirror=https://github.com/Automattic/node-canvas/releases/download/

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

# Comando para iniciar a aplicação
CMD ["npm", "start"]
