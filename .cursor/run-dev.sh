#!/usr/bin/env bash
# Sobe o servidor de desenvolvimento (backend Express + frontend Vite) na porta 5001.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

# Garante banco no ar e .env presente (caso o terminal suba antes do start).
bash "$REPO_ROOT/.cursor/start.sh" || true

set -a
# shellcheck disable=SC1091
[ -f .env ] && . ./.env
set +a

exec npm run dev
