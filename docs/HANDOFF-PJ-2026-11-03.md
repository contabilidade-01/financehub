# Handoff — ajustes PJ (MEI e ME) — 2026-11-03

Branch: `claude/loving-lovelace-d42mg9`. Pedido original em 5 itens; abaixo o que foi feito e o que falta.

## Feito

### 1. Análise da empresa (PJ ME, `/p/dashboard`)
- Os blocos "A receber" e "A pagar" agora mostram **só o que vence no período filtrado** (padrão: mês atual) e respeitam o filtro de centro de custo. O rodapé do card traz o vencido/total geral.
- Os cards abrem Contas a receber / Contas a pagar **já com o mesmo período e centro de custo** na URL.
- Subtítulo explica o recorte: "Mês atual: 01/11 a 30/11… resultado, margens e contas seguem este período; saldo em bancos e projeção são de hoje em diante".
- Backend: `painelAnalise` devolve `receber.no_periodo` e `pagar.no_periodo` (`server/services/erp/analise.service.ts`). Aging e "Saldo em 90 dias" continuam globais (intencional).
- Verificado: a tela já abria no mês atual por padrão; "A receber em aberto" já estava ligado a Contas a receber.

### 2. Transações PJ e Mensalidades
- Transações PJ abrem no **mês atual** (igual ao PF); "Todo o período" continua no seletor.
- Mensalidades (PF e PJ) ganhou **filtros**: busca, a pagar/a receber (PJ ME), meio (boleto/cartão), ativas/pausadas, classificação; totais do que está na tela (a pagar/mês, a receber/mês, saldo/mês).

### 3. Conciliação bancária
- A importação v2 (flag `importacao_extrato_v2`, `ImportacaoExtrato` + `SessaoImportacao`) **já** permite usar uma conta existente ou criar uma na hora; o OFX reconhece a conta e cria sozinho quando não existe. A tela antiga (sem a flag) **ganhou** "Criar conta nova para este extrato".
- Parsers (`server/services/importacao/parsers.ts`) mais tolerantes aos modelos de mercado: aliases de Itaú/Bradesco/BB/Caixa/Santander/Nubank/Inter/C6/Sicoob/Sicredi/Mercado Pago/PagBank/Stone/Cora; "Entrada(R$)/Saída(R$)"; Inter "Histórico"+"Descrição" (usa a Descrição); coluna "Tipo" textual não é confundida com C/D; "Depósito" não vira débito; Excel com várias abas usa a aba dos lançamentos; capa de até 60 linhas; rodapés de saldo/total ignorados. Testes em `scripts/testar-importacao-parsers.ts` (64 cenários).
- **Recomendação**: ligar a flag `importacao_extrato_v2` para todos em `/admin/feature-flags` (hoje só super admin vê a v2) e, após 30 dias, aposentar a tela antiga.

### 4. Importar contas a pagar / a receber de qualquer planilha
- Botão **Importar planilha** nas telas Contas a receber e Contas a pagar (PJ ME) + link **Baixar modelo (.csv)** (`client/public/modelo-contas-receber.csv`, `modelo-contas-pagar.csv`).
- Fluxo em 4 passos: arquivo → **o que é cada coluna** (sugestão automática; obrigatórios: descrição, valor, vencimento; opcionais: cliente/fornecedor, conta do plano, competência, data de pagamento/recebimento, documento, centro de custo) → prévia (simulação no servidor: criados, já pagos, duplicados, erros, cadastros novos) → importar.
- Opções: conta do plano padrão, conta bancária para linhas já pagas (viram baixadas), cadastrar clientes/fornecedores que não existem, criar contas do plano que não existem. Duplicados (mesmo vencimento+valor+descrição) são pulados.
- Arquivos: `server/services/erp/importar-titulos.service.ts`, rotas `POST /api/empresas/:id/erp/titulos/importar/analisar` e `POST .../erp/titulos/importar`, `client/src/pages/pj/erp/importar-titulos.tsx`. Testes: `npm run test:importacao-titulos` (no CI).

### 5. Clientes e fornecedores → valores fixos/variáveis
- Ação **Recorrência** (ícone ↻) em cada cadastro e na ficha: cliente → "Valor a receber todo mês"; fornecedor → "Conta a pagar todo mês". Fixo ou **variável** (valor de referência; o título nasce com "(valor a confirmar)" na descrição).
- Usa o motor das Mensalidades (3 meses à frente, renova sozinho). Backend: colunas novas em `mensalidades` (`tipo` pagar|receber, `contato_id`, `valor_variavel`) via auto-migrate; geração `receber` cria Receita Pendente com o cliente vinculado (`server/services/mensalidades.service.ts`).
- A tela Mensalidades (PJ ME) permite criar/editar "A receber de cliente" e filtra por tipo.

## Falta / próximos passos
- **Ligar a flag** `importacao_extrato_v2` para todos (decisão de produto, não de código).
- Extrato em **PDF** não é lido (só OFX/CSV/Excel). Precisa de lib de PDF (`pdfjs-dist`/`pdf-parse`) e um parser de linhas; não entrou nesta rodada.
- Recorrência **variável**: hoje o cliente ajusta o valor do título antes da baixa (Transações PJ → editar). Melhoria: na baixa de um título "(valor a confirmar)", perguntar o valor do mês sem lançar a diferença em juros/desconto.
- Importação de títulos: exportar as linhas com erro em CSV e permitir parcelas (coluna "parcela x/y").
- Validar visualmente no EasyPanel (homologação): Análise com período ≠ mês, importação com planilha real do cliente, recorrência a receber aparecendo em Contas a receber e Projeção.
- `npm run check`: 0 erros (baseline 0). Build OK. Testes novos e antigos de importação/títulos/mensalidades OK.
