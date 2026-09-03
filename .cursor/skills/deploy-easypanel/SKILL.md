---
name: deploy-easypanel
description: >-
  Publica alterações do FinanceHub no EasyPanel. Sempre faz merge e push na
  branch financehub (é a única que o EasyPanel implanta). Use quando o usuário
  pedir deploy, implantar, publicar, push para produção, EasyPanel, ou quando
  uma correção precisa ir ao ar.
---

# Deploy EasyPanel (FinanceHub)

Branch de produção: **`financehub`**. O painel (Easy) implanta **somente** essa branch.

## Sempre fazer

1. Commit na branch de trabalho (se ainda não houver).
2. `git checkout financehub` e `git pull origin financehub`.
3. `git merge` da branch de trabalho (resolver conflitos se houver).
4. `git push origin financehub`.
5. Conferir no EasyPanel: o deploy tem que mostrar **esse** commit.

Push só em `cursor/*` **não** publica. Dizer que está no ar só depois do push em `financehub` e do deploy com o commit certo.

## Não fazer

- Não pedir para o usuário clicar Implantar se o código ainda não está na `financehub`.
- Não usar `main` como destino, a menos que o usuário peça.
- Não commitar `.env` nem secrets.
