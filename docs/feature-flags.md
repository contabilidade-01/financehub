# Feature flags — ciclo de vida

Uma **chave** cobre uma **funcionalidade**, não uma alteração. Itere quantas vezes precisar
dentro do mesmo `if (flagAtiva(...))`. Aprovada → um clique: liberar para todos.

## Ciclo

1. Mudança de risco nasce atrás de **constante nova** (`FLAG_…` em `feature-flags-logic.ts`, reexportada pelo serviço), com `ativo_todos = false`.
2. Liga na conta de teste; itera **dentro da mesma chave**.
3. **Liberar para todos** (grava `liberado_todos_em`).
4. Observa **30 dias** (fechamento de mês).
5. Limpa o código (remove o `if` e o caminho antigo), rode `npm run flags:auditar`, e **só então** aposente a linha em `/admin/feature-flags`.

**Regra:** flag liberada para todos há mais de 30 dias é removida na rodada seguinte — código primeiro, linha depois.

## O que aposentar NÃO faz

Apagar a linha **não** remove o código. Se o `if` permanecer, `flagAtiva` devolve `false` e **todos voltam ao comportamento antigo**.

## O que a flag não cobre

Liga **comportamento**, não schema. Coluna nova pode entrar; **remover ou renomear coluna, não** — enquanto alguém estiver com a flag desligada, o código antigo ainda lê o campo antigo.

## Comandos

```bash
npm run flags:check-literals   # CI: proíbe flagAtiva("literal")
npm run flags:auditar          # código × banco (precisa DATABASE_URL para o banco)
npm run test:flags-ciclo
```

Tela: `/admin/feature-flags` (super admin).
