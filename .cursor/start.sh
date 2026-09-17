#!/usr/bin/env bash
# Reconciliação por boot: garante PostgreSQL no ar e .env presente.
# Deve tolerar reinícios e retornar após confirmar prontidão.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "==> Iniciando cluster PostgreSQL"
sudo pg_ctlcluster 16 main start 2>/dev/null || true

echo "==> Aguardando PostgreSQL aceitar conexões"
for _ in $(seq 1 30); do
  if pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
    echo "==> PostgreSQL pronto"
    bash "$REPO_ROOT/.cursor/write-env.sh"
    exit 0
  fi
  sleep 1
done

echo "PostgreSQL não ficou pronto a tempo" >&2
exit 1
