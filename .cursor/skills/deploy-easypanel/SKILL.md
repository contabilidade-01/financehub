---
name: deploy-easypanel
description: >-
  Publica no EasyPanel. Produção = branch producao (merge a partir de financehub).
  Homologação = app separado em financehub. Use quando pedir deploy, EasyPanel, publicar.
---

# Deploy EasyPanel (FinanceHub)

| Ambiente | Branch | Observação |
|----------|--------|------------|
| Produção | `producao` | Só merge consciente com CI verde |
| Integração / homologação | `financehub` | Push contínuo + app de homolog |

## Produção

1. Commit na `financehub` (ou branch de trabalho → merge nela).
2. CI verde no GitHub Actions.
3. `git checkout producao && git pull && git merge financehub && git push origin producao`.
4. Conferir `GET /api/health` → `commit_short` = hash esperado.

## Homologação

- App EasyPanel separado, branch `financehub`.
- `DATABASE_URL` **nunca** a de produção.
- `SIMULADOR_WHATSAPP=true`, Asaas sandbox, sem `UAZAPI_TOKEN`.
- Feature flags: ligar só no usuário de teste em `/admin/feature-flags`.

## Rollback

Reimplantar imagem anterior no EasyPanel. **Não desfaz migração** — por isso schema só aditivo.
