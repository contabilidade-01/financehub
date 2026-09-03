#!/usr/bin/env bash
# Bootstrap idempotente para o ambiente de desenvolvimento do Khesef (financehub).
# Roda depois do checkout do repositório. Deve ser seguro rodar mais de uma vez.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

echo "==> Instalando dependências npm"
export PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
npm install

echo "==> Iniciando cluster PostgreSQL (idempotente)"
sudo pg_ctlcluster 16 main start 2>/dev/null || true

echo "==> Aguardando PostgreSQL aceitar conexões"
for _ in $(seq 1 30); do
  if pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then break; fi
  sleep 1
done

echo "==> Provisionando role e banco (idempotente)"
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='financehub'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE ROLE financehub LOGIN PASSWORD 'financehub_secure_password_2025';"
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='financehub'" | grep -q 1; then
  sudo -u postgres createdb -O financehub financehub
fi
sudo -u postgres psql -d financehub -c "GRANT ALL ON SCHEMA public TO financehub;" >/dev/null
sudo -u postgres psql -d financehub -c "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";" >/dev/null

echo "==> Garantindo arquivo .env de desenvolvimento"
bash "$REPO_ROOT/.cursor/write-env.sh"

echo "==> install.sh concluído"
