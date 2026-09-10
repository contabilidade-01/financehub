#!/usr/bin/env bash
# Cria um .env de desenvolvimento apontando para o PostgreSQL local, se ainda não existir.
# .env é gitignored; este arquivo NÃO contém segredos de produção — apenas um banco local descartável.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="$REPO_ROOT/.env"

if [ -f "$ENV_FILE" ]; then
  echo "==> .env já existe, mantendo"
  exit 0
fi

cat > "$ENV_FILE" <<'EOF'
# Ambiente de desenvolvimento (Cloud Agent) — gerado automaticamente
NODE_ENV=development
TZ=America/Sao_Paulo
PORT=5000
SETUP=false
DEFAULT_LOCALE=pt-br

# Banco de dados PostgreSQL local
DATABASE_URL=postgresql://financehub:financehub_secure_password_2025@127.0.0.1:5432/financehub

# URLs base (dev — servidor dev sobe na porta 5001)
BASE_URL=http://localhost:5001
PUBLIC_APP_URL=http://localhost:5001
FRONTEND_URL=http://localhost:5001

# Sessão (dev)
SESSION_SECRET=dev_local_session_secret_change_me_0123456789abcdef

# Puppeteer usa o Chromium do sistema
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
EOF

echo "==> .env criado em $ENV_FILE"
