# FinanceHub — Módulo PJ (Pessoa Jurídica)

## Visão Geral

O módulo PJ permite que empresas (PJ) usem o FinanceHub para gestão financeira orientada a **fluxo de caixa** e **margens**, no estilo **Yampa/4Blue**.

**Arquitetura:**
- PF (Pessoa Física) permanece 100% intocado
- PJ coexiste no mesmo projeto com tabelas isoladas (`empresas`, `empresas_contas`, `empresas_transacoes`)
- Fluxo de entrada (WhatsApp → N8N → API) é reutilizado sem mudanças em PF
- IA do N8N classifica no novo contexto empresarial (via novo endpoint)

## Estrutura de Dados

### Usuário com tipo_pessoa

Campo `tipo_pessoa` adicionado a `usuarios` (default: `'fisica'`):
- `'fisica'` — Pessoa Física (PF) — comportamento atual
- `'juridica'` — Pessoa Jurídica (PJ) — novo módulo

### Tabelas PJ

**`empresas`**
- Empresa administrada por um usuário
- Relação 1:N com usuários (1 usuário pode ter N empresas)
- Campos: `razao_social`, `nome_fantasia`, `cnpj`, `regime_tributario`, `segmento`, `ativo`

**`empresas_contas`** (plano de contas)
- Conta contábil por empresa
- Classificação: `FIXA`, `VARIAVEL`, `OUTRA` (apoia cálculo de margem de contribuição)
- Seed automático ao criar empresa (17 contas padrão Yampa-like)

**`empresas_transacoes`** (transações)
- Espelho de `transacoes` (PF), isolado por `empresa_id`
- Mesmo payload do PF, mas categoria aponta para `empresas_contas`
- Origem: `'manual'` ou `'whatsapp'` (rastreamento N8N)

## API Endpoints

### Empresas

```
GET    /api/empresas              — lista empresas do usuário
POST   /api/empresas              — criar empresa + seed plano de contas
GET    /api/empresas/:id          — detalhes
PUT    /api/empresas/:id          — editar
DELETE /api/empresas/:id          — remover
```

### Plano de Contas

```
GET    /api/empresas/:id/contas              — listar contas
POST   /api/empresas/:id/contas              — criar conta
PUT    /api/empresas/:id/contas/:contaId     — editar
DELETE /api/empresas/:id/contas/:contaId     — remover
```

### Transações PJ

```
POST   /api/empresas/:id/transacoes                    — criar (N8N usa este)
GET    /api/empresas/:id/transacoes?de=...&ate=...     — listar (filtro período)
PUT    /api/empresas/:id/transacoes/:id                — reclassificar
DELETE /api/empresas/:id/transacoes/:id                — remover
```

### Dashboard & Relatórios

```
GET /api/empresas/:id/dashboard/resumo?de=...&ate=...   — entradas, saídas, margens
GET /api/empresas/:id/relatorios/dre?de=...&ate=...     — DRE simplificada Yampa-like
```

## Fluxo N8N → PJ

**Ponto de entrada:** `POST /api/empresas/:id/transacoes`

Payload idêntico ao PF:
```json
{
  "descricao": "Venda PIX cliente X",
  "valor": 1500,
  "tipo": "Receita",
  "categoria_id": 12,
  "data_transacao": "2026-08-17",
  "forma_pagamento_id": 1,
  "origem": "whatsapp"
}
```

**N8N:** duplicar nó POST do fluxo PF, apontar para novo endpoint com `empresa_id` resolvido.

**IA/Classificação:** N8N classifica no contexto PJ usando lista de contas da empresa (requer ajuste do prompt do N8N p/ passar `empresas_contas` como referência).

## Frontend — Rotas PJ

Rotas sob `/p/*`:

- `/p/dashboard` — dashboard Yampa-like (4 cards: entradas, saídas, margem, lucro)
- `/p/transacoes` — CRUD transações + busca por período
- `/p/categorias` — CRUD plano de contas (contas contábeis)
- `/p/empresas` — cadastro/edição de empresas
- `/p/relatorios` — DRE simplificada

**Seletor:** se usuário tem 2+ empresas, seletor suspenso no header PJ para trocar contexto.

## Seed do Plano de Contas (MVP)

Criado automaticamente ao cadastrar empresa:

### Receitas (tipo=Receita, classificacao=OUTRA)
- 1.01 Receita de Vendas
- 1.02 Receita de Serviços
- 1.03 Outras Receitas Operacionais
- 1.04 Receitas Financeiras

### Despesas Fixas (tipo=Despesa, classificacao=FIXA)
- 2.01 Folha de Pagamento
- 2.02 Aluguel
- 2.03 Energia / Água / Internet
- 2.04 Contabilidade
- 2.05 Impostos e Taxas
- 2.06 Pró-labore / Retiradas

### Despesas Variáveis (tipo=Despesa, classificacao=VARIAVEL)
- 3.01 Compras de Mercadoria (CMV)
- 3.02 Matéria-prima / Insumos
- 3.03 Comissão de Vendedores
- 3.04 Frete
- 3.05 Marketing / Anúncios
- 3.06 Despesas Financeiras

### Outras Despesas (tipo=Despesa, classificacao=OUTRA)
- 4.01 Outras Despesas Operacionais

## Cálculos de Margem & DRE

### Dashboard — `/api/empresas/:id/dashboard/resumo`

```
entradas            = SUM(transacoes.valor WHERE tipo='Receita')
saidas_fixas        = SUM(... WHERE tipo='Despesa' AND classificacao='FIXA')
saidas_variaveis    = SUM(... WHERE tipo='Despesa' AND classificacao='VARIAVEL')
saidas_outras       = SUM(... WHERE tipo='Despesa' AND classificacao='OUTRA')
total_saidas        = saidas_fixas + saidas_variaveis + saidas_outras

margem_contribuicao = entradas - saidas_variaveis
margem_contrib_pct  = (margem_contribuicao / entradas) * 100

lucro_prejuizo      = entradas - total_saidas
lucro_prejuizo_pct  = (lucro_prejuizo / entradas) * 100
```

### DRE — `/api/empresas/:id/relatorios/dre`

```
(+) Receita Bruta                  = entradas
(−) CMV / Despesas Variáveis       = saidas_variaveis
(=) Margem de Contribuição (%)     = (margem_contrib / entradas) * 100
(−) Despesas Fixas                 = saidas_fixas
(−) Outras                         = saidas_outras
(=) Lucro / Prejuízo (%)           = (lucro / entradas) * 100
```

## Fora do MVP (v2+)

- Projeção de fluxo de caixa (30/60/90 dias)
- Recorrências (aluguel, folha, etc)
- Contas a pagar/receber com vencimento separado de pagamento
- Multi-segmento com seeds customizados por CNAE
- Centros de custo
- Análise comparativa mensal
- Integração com Emitir NFe / RPA fiscal

## Verificação (Tests End-to-End)

Ver `docs/PJ_CLASSIFICACAO_IA.md` para como configurar N8N e `docs/PJ_README.md` para casos de teste.

## Arquivos Criados/Modificados

**Backend:**
- `server/migrations/create_empresas_tables.ts` — criação de tabelas
- `server/controllers/empresa.controller.ts` — CRUD empresas
- `server/controllers/empresaConta.controller.ts` — CRUD plano de contas
- `server/controllers/empresaTransacao.controller.ts` — CRUD transações + dashboard/DRE
- `server/routes.ts` — rotas `/api/empresas/*`
- `server/storage.ts` — funções de persistência PJ
- `shared/schema.ts` — tabelas, schemas Zod, tipos PJ

**Frontend:**
- `client/src/pages/pj/PjRouter.tsx` — roteador interno PJ
- `client/src/pages/pj/dashboard/index.tsx` — 4 cards + detalhamento
- `client/src/pages/pj/transactions/index.tsx` — CRUD transações
- `client/src/pages/pj/categorias/index.tsx` — CRUD plano de contas
- `client/src/pages/pj/empresas/index.tsx` — CRUD empresas
- `client/src/pages/pj/relatorios/dre.tsx` — relatório DRE
- `client/src/App.tsx` — rotas `/p/*` + import PjRouter
- `client/src/components/shared/Sidebar.tsx` — menu PJ condicional

**Documentação:**
- `docs/PJ_README.md` — este arquivo
- `docs/PJ_CLASSIFICACAO_IA.md` — guia N8N prompt (TBD)
