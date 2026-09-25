# Plano de robustez Khesef — Segurança, IA, Visual, Mobile e Importação/ERP

## Contexto
O sistema está em produção. Clientes relatam que a IA do WhatsApp entende e classifica errado. O visual ainda "parece feito por IA". A importação de extratos não funciona como um ERP (Conta Azul). A análise do código encontrou também **falhas críticas de segurança exploráveis sem login**. Por isso a Fase 0 vem primeiro e sai em commit isolado.

Decisões do usuário: começar pela Fase 0 (segurança) e seguir IA → Importação/ERP → UI/Mobile. Visual **sóbrio estilo ERP**, com tema claro padrão. **Manter gpt-4o-mini** e robustecer com código determinístico, validação e memória.

Todas as fases seguem o CLAUDE.md: feature flag para funcionalidade nova, `npm run check` sem subir a baseline, novos `scripts/testar-*.ts` incluídos no CI, migrations aditivas e timezone São Paulo.

---

## FASE 0 — Segurança (hotfix, commit isolado) — ✅ críticas C1–C5 e H1–H4 feitas

### Críticas (exploráveis sem login ou por qualquer usuário)
| # | Falha | Onde | Correção |
|---|---|---|---|
| C1 | Qualquer pessoa vira `super_admin` no cadastro: `tipo_usuario` e `remoteJid` vêm do body | `server/controllers/user.controller.ts:30-31,70-75` | Remover os dois campos do schema de registro. Forçar `tipo_usuario:'normal'` no servidor. Auditar usuários `super_admin` existentes (SQL de conferência). |
| C2 | Path traversal: `GET /api/charts/download/..%2F..%2F.env` lê qualquer arquivo, sem auth | `chart-svg.controller.ts:704`, `pdf.controller.ts:443`, `routes.ts:119,132` | Helper `safeResolve(baseDir, filename)` com `path.basename`, whitelist de regex e verificação `startsWith(baseDir)`. Exigir `combinedAuth` e checar que o arquivo pertence ao usuário (prefixo com id). |
| C3 | Webhook UazAPI sem autenticação e resposta enviada para `BaseUrl`/`token` vindos do body (spoof de usuário, sequestro do link de senha, SSRF) | `uazapi-webhook.controller.ts:354-392`, `routes.ts:1593` | Secret `UAZAPI_WEBHOOK_SECRET` na URL/header com compare timing-safe. **Ignorar `BaseUrl`/`token` do body** e usar só `UAZAPI_BASE_URL`/`UAZAPI_TOKEN` do env. Validar `instance`/`owner` esperados. |
| C4 | Impersonation dá super_admin ao usuário-alvo | `middleware/adminAuth.middleware.ts:56-94`, `storage.ts:1106` | Guardar a impersonation **na sessão do admin** (`req.session.impersonating`) e não por id do alvo. Expirar em 1h. Encerrar no logout. `requireSuperAdmin` só confia em `req.session.originalUserId`. |
| C5 | WebSocket autentica com `?token=<userId>` | `server/websocket.ts:45-60` | Autenticar no upgrade pelo cookie de sessão (parse com o store do `connect-pg-simple`) ou por um ticket efêmero assinado emitido por `GET /api/ws-ticket`. |

### Altas
- **H1** IDOR em `PUT /api/transactions/:id/recorrente` (`routes.ts:1414`): usar `transacaoPertenceAoWallet` como nas rotas vizinhas.
- **H2** `GET /api/welcome-messages/:type/user/:userId` público vaza nome, email e telefone: exigir `requireSuperAdmin`.
- **H3** Relatórios PDF/PNG com nome previsível e sem auth: nome = `randomBytes(16).hex` + registro de dono; download autenticado.
- **H4** Checkout token sem assinatura (`utils/checkout-token.utils.ts`): HMAC-SHA256 com `CHECKOUT_TOKEN_SECRET` + expiração. Aceitar os tokens antigos por 7 dias atrás de uma flag.
- **H5** Segredos default: remover defaults de `SESSION_SECRET` e da senha do Postgres dos docker-compose. Não publicar a porta 5432. Remover `legacy/attached_assets/Pasted--14-0-261...txt` e `.cursor/write-env.sh`. **Pedir ao usuário para rotacionar** a senha do banco e o SESSION_SECRET no EasyPanel.

### Médias/baixas
- `/api/auth/verify` retorna o hash `senha`: criar um `sanitizeUser()` e usá-lo em todas as respostas de usuário.
- `GET /api/contas/:id/lancamentos` sem checagem de dono (`contas-cartoes.controller.ts:32`).
- Checar `user.ativo` em `auth.middleware.ts` e `apiKey.middleware.ts`. `req.session.regenerate` no login. Invalidar as outras sessões na troca de senha.
- API tokens: guardar SHA-256 (migração aditiva `token_hash`, lookup por hash).
- Helmet com CSP real (self + cdns usados). Remover o upload de logo SVG (converter para PNG ou sanitizar).
- Rate limit: por conta e por IP no login (lockout progressivo), além de troca de senha, rotate de token e checkout/validate. Senha mínima de 8. bcrypt cost 12.
- Handler global: não devolver `err.message`/stack em produção. Remover logs de senha e token (`admin.controller.ts:929,284`, `notification.service.ts:596`) e os logs de body em `server/index.ts:163` e `client/src/lib/queryClient.ts:36,51`.
- `/api/waha/webhook` sem hash: exigir secret. `/docs` só para super_admin em produção.
- Dependências: `multer` ≥2.0.2. Trocar `xlsx@0.18.5` pelo build oficial SheetJS (`https://cdn.sheetjs.com/xlsx-0.20.3/...`) ou por `exceljs`. Adicionar filtro de mimetype/extensão no multer. Rodar `npm audit`.

**Teste novo:** `scripts/testar-seguranca.ts` com checagens puras de `safeResolve`, schema de registro rejeitando `tipo_usuario`, HMAC do checkout e `sanitizeUser`.

---

## FASE 1 — IA operacional (WhatsApp), mantendo gpt-4o-mini — ✅ feita (pendente: golden set com LLM real)
Princípio: **o LLM só interpreta; código determinístico valida, normaliza e decide**. Arquivos centrais: `server/services/ai-agent.service.ts`, `server/prompts/financial-agent.ts`, `server/services/atalho-meio-pj.ts`, `classificar-conta-pj.ts`, `storage.ts` (memória).

1. **Parsers determinísticos** em um novo `server/services/nlp-br/`:
   - `parseValorBR`: "1.500" = 1500, "1.500,00", "1,5k", "R$ 80", "mil e duzentos" e "2 mil". Escolher o número monetário e não o primeiro (ignorar "dia 5", "2 pizzas", "3x"). Substitui as cópias em `atalho-meio-pj.ts:30` e `repetir-ultima-despesa.ts:16`.
   - `parseDataBR`: hoje, ontem, anteontem, "sexta passada", "dia 5", "05/09", "semana passada" e "mês passado", sempre com `America/Sao_Paulo`. Trocar **todo** `new Date().toISOString().slice(0,10)` (`ai-agent.service.ts:1374,2424,2178`, `repetir-ultima-despesa.ts:164`) por um helper `hojeSP()`.
   - `detectarDirecao`: recebi/caiu/pagaram/estorno = entrada; paguei/gastei/comprei = saída; "paguei o João" ≠ "o João me pagou". Retorna `ambiguo` quando não há sinal.
   - `segmentarMultiplos`: separa "frete 50 e comissão 30" em itens, cada um com a própria descrição, o que corrige o uso de `ctx.userMessage` inteiro (`ai-agent.service.ts:2314,2414`).
2. **Validação dos argumentos das tools com zod** (um schema por tool) e `JSON.parse` protegido (`ai-agent.service.ts:3562`). Valor > 0 obrigatório. `tipo` só aceita `Receita|Despesa`, sem default silencioso para Despesa. Os argumentos do LLM passam pelos parsers: se o valor/data do texto divergir do LLM, vale o texto. Ativar `strict: true` nas function definitions (suportado no 4o-mini).
3. **Categorias PF**:
   - Enviar ao prompt a lista real com `descricao` (os sinônimos). Remover a lista fixa desatualizada em `financial-agent.ts:13`.
   - Matching com acento dobrado + sinônimos + fuzzy (token-set).
   - **Ordem nova: memória do usuário primeiro**, depois o LLM, depois o fallback. Memória por "comerciante normalizado" (token principal), não por substring solta.
4. **Aprender com correções**: `atualiza_transacao`, `atualiza_transacao_empresa` e `editar_ultima_compra`, e as edições pela UI web (controllers de transações PF/PJ), chamam `aprenderMemoria*` com peso maior que o palpite do LLM. Usar `resolveMemoriaContaPJ` também no `lancar_empresa` do WhatsApp. Reagregar a memória global por job diário, não só no startup (`server/index.ts:193`).
5. **Confirmação e segurança de ação**:
   - Confirmação obrigatória **no código** (não só no prompt) para: exclusão por filtro, edição, mídia (foto/áudio), valor acima de um limite, direção ambígua, e categoria com baixa confiança (score de match < limiar). Estado pendente persistido em tabela `ia_pendencias` (substitui os `Map`s em memória em `atalho-meio-pj.ts:20`, `oferta-criar-conta-pj.ts:22`, `repetir-ultima-despesa.ts:73`).
   - O atalho PJ passa a respeitar a regra de mídia.
   - Tool nova `desfazer_ultimo_lancamento`.
   - `resolveOuCriaFormaPagamento` (`storage.ts:3050`) **não cria cartão** sozinho: pergunta.
6. **Extração de comprovantes** (Gemini, `ai-agent.service.ts:121-137`): JSON estruturado (`responseSchema`) com `direcao`, `pagador`, `recebedor`, `valor`, `data`, `meio` e `itens`. Tirar o viés "Comprei". O Pix recebido vira entrada.
7. **Reduzir carga do modelo**: PF só recebe as tools PF (hoje recebe ~67). Enxugar o prompt legado de 270 linhas em regras curtas e sem contradição, e incluir a data ISO e o dia da semana. Temperatura 0.
8. **Idempotência e concorrência**:
   - Dedup por `messageid` em tabela com unique (não um `Map` de 30s).
   - Gravar `origem_message_id` na transação.
   - Fila/lock por usuário (advisory lock do Postgres por `usuario_id`).
   - Histórico com as tool calls resumidas.
9. **Auditoria**: estender `ingestion_events` com tool, args validados, modelo usado, categoria escolhida + motivo (memória/LLM/fallback) e confiança. Tela admin simples para revisar erros.
10. **Bateria de cenários reais**:
    - `scripts/testar-nlp-br.ts` com ~150 frases do dia a dia (valores, datas, direção, múltiplos), sem LLM.
    - `scripts/testar-classificacao-pf.ts` para matching de categorias e memória.
    - Um golden set `scripts/eval-ia-whatsapp.ts` com ~80 conversas reais anonimizadas (fora do CI e rodando sob demanda com a API key), com relatório de acurácia por campo.
    - Pedir ao usuário exemplos reais de mensagens mal interpretadas para alimentar o set.

Tudo atrás da flag `IA_PIPELINE_V2`, com rollout por usuário.

---

## FASE 2 — Importação bancária + ERP PJ (padrão Conta Azul) — ✅ feita

### 2.1 Correções imediatas (bugs)
- `ON CONFLICT (conta_bancaria_id, fitid)` contra um índice parcial falha em toda linha (`storage.ts:4102` × `auto-migrate.ts:321`). Adicionar `WHERE fitid IS NOT NULL` ao ON CONFLICT. Reproduzir antes com um OFX de teste.
- Bancada: "Aceitar sugestões" envia `importacao_id:null` (`Bancada.tsx:120`), e o bater-saldo vai sem `conta_bancaria_id` (`Bancada.tsx:86`).
- CSV com `;`: detecção automática de delimitador, encoding (UTF-8/Latin-1 pelo header OFX `CHARSET`) e número BR. `normalizarValor` do OFX (`ofx-parser.ts:41`) trata todos os separadores.
- Hash do arquivo gravado **só após** processamento com sucesso. Status `revisao` → `concluida`.

### 2.2 Novo fluxo de importação unificado (PF e PJ, OFX/CSV/XLSX)
**Backend** (novo `server/services/importacao/`, reaproveitando `ofx-parser.ts`, `conciliacao.service.ts`, `classificar-conta-pj.ts`, `resolveMemoriaContaPJ`):
1. **Sessão de importação persistente**: reaproveitar `importacoes_extrato` + `extrato_movimentos` como staging e estender com `usuario_id`, `empresa_id` nulo (PF), `status` (rascunho/revisao/concluida/cancelada), `mapeamento_colunas` jsonb e `atualizado_em`. Cada linha guarda categoria/conta sugerida, a escolhida, a origem da sugestão, a transação vinculada e o status. Nada vai para `transacoes`/`empresas_transacoes` antes do "Confirmar".
2. **Upload**:
   - Parse → identificação do banco pelo `BANKID/ACCTID` do OFX → casamento com `contas_bancarias` existente, ou **proposta de criação da conta bancária** (banco, agência, conta, saldo inicial do `LEDGERBAL`).
   - Para CSV/XLSX: tela de mapeamento de colunas (data, descrição, valor ou débito/crédito, saldo), com detecção do valor vs saldo e mapeamentos salvos por banco.
3. **Dedup forte**: FITID quando existe. Senão, hash de `data|valor|descrição|ordem_no_dia` (preserva duplicatas legítimas), além de marcar possíveis duplicados já lançados (±2 dias, mesmo valor) para o usuário decidir.
4. **Classificação no ato**: sugestão por memória → regras → IA em lote (**uma chamada para N linhas**, em background com progresso via WebSocket, não 30s por linha dentro do request). Regras do usuário ("descrição contém X → conta Y") e aplicação em massa ("aplicar a todas iguais").
5. **Conciliação**: candidatos filtrados por `conta_bancaria_id`, com escolha manual entre vários. Linhas vinculadas a lançamento existente não duplicam.
6. **Confirmar**: **uma única `db.transaction`** (hoje não existe nenhuma no servidor) que cria/vincula as transações, **todas com `conta_bancaria_id`** (conta criada na importação ou existente), com status `Efetivada` (extrato = realizado) e `fitid` gravado, aprende a memória e fecha a sessão. Rollback total em erro.
7. **Autosave**: cada edição de linha dá PATCH imediato (debounce 500ms). Sessões em rascunho aparecem em "Importações em andamento" e são retomadas de onde pararam, mesmo após queda ou refresh.

**Frontend** (substitui `pages/importar`, `pages/pj/importar` e `pages/pj/conciliacao/Importar.tsx` + `Bancada.tsx` por um wizard único):
- Passos: Arquivo → Conta bancária (vincular/criar inline) → Mapeamento (CSV/XLSX) → **Revisão/classificação** → Confirmar.
- Grade de revisão: filtros (não classificadas, duplicadas, conciliadas), seleção múltipla, combobox de conta com busca e **"+ Nova conta" inline** (dialog que cria no plano de contas `empresas_contas`/`categorias` e já seleciona), edição de descrição/data e indicador "Salvo às 14:32".
- Mobile: a grade vira cards com ações em bottom sheet.

### 2.3 ERP PJ — lacunas para gerir uma pequena empresa (somente modalidade PJ ME)
> Modalidades: PF, PJ MEI (todo PJ existente) e PJ ME (novo, ERP). Rotas do ERP usam `requireErpPj` (`server/middleware/modalidade.middleware.ts`); regras em `shared/modalidade.ts`.
- **Contas a receber** (hoje não existe): lançamentos futuros de receita com cliente, vencimento, baixa parcial/total e recorrência. Espelhar `pj/vencimentos` (a pagar).
- **Cadastro de clientes/fornecedores** (`empresas_contatos`) vinculado aos lançamentos.
- **Centros de custo** (`empresas_centros_custo`), opcional por lançamento.
- **Plano de contas hierárquico**: FK real em `parent_id`, UI em árvore, contas sintéticas vs analíticas e bloqueio de exclusão com lançamentos.
- **Relatórios**:
  - DRE com seletor de período e comparativo mês a mês, em regime caixa e competência (`storage.ts:2033`, `pj/relatorios/dre.tsx`).
  - Fluxo de caixa realizado + projetado por conta bancária.
  - Saldo por conta bancária conciliado com o extrato.
  - Exportação CSV/PDF.
- **Transferência entre contas** (não conta como receita/despesa).
- Seletor de empresa persistido (`PjRouter.tsx:36-59`) com o componente Select do design system.
- Trazer para `shared/schema.ts` as tabelas/colunas PJ que hoje só existem em `auto-migrate.ts` (`empresas_cartoes`, `empresas_faturas`, `importacoes_extrato`, `extrato_movimentos`, `conciliado`, `fitid`).

Flags: `IMPORTACAO_V2`, `ERP_CONTAS_RECEBER`, `ERP_CENTRO_CUSTO`.

**Testes novos:**
- `scripts/testar-importacao-parsers.ts`: fixtures OFX (Itaú, BB, Nubank, Inter, Caixa), CSV `;` e `,`, XLSX com saldo.
- `scripts/testar-importacao-dedup.ts`.
- `scripts/testar-dre.ts`.

---

## FASE 3 — Layout e tipografia (visual sóbrio de ERP) — ✅ feita
1. **Tokens** (`client/src/index.css`, `tailwind.config.ts`):
   - Tema claro padrão (tirar `class="dark"` fixo de `client/index.html`), com dark opcional.
   - Uma cor de marca (azul-petróleo), neutros slate, e semânticos (sucesso/alerta/erro/receita/despesa).
   - Raio 6–8px e sombras sutis.
   - Remover neon, `.glass`, `.neon-border`, o fundo pontilhado e os gradientes.
2. **Tipografia**:
   - Inter só (remover Space Grotesk dos headings e o alias "orbitron").
   - Escala fixa (12/14/16/20/24/30) no lugar de `text-[9px]`, `text-[10.5px]` etc.
   - `font-variant-numeric: tabular-nums` para valores, com componente `<Money>` formatando BRL e cor receita/despesa.
   - Fontes self-hosted (`@fontsource/inter`) e ícones só `lucide-react` (tirar o Remixicon via CDN).
3. **Limpeza do CSS**:
   - Eliminar os 247 `!important`, os overrides Radix conflitantes (`index.css:244-431,656`), a **borda roxa de debug** (`:385`), os fundos azuis fixos de select (`:279,314,398`) e os ~450 linhas de CSS de modal admin.
   - Reativar transições/focus ring (`:155-157,518-546`).
   - Remover `theme-critical.js` e `category-modal.css`.
4. **Componentes de padrão**:
   - `PageHeader` (título, descrição, ações), `DataTable` responsiva (já existe `ui/data-table`, sem uso), `EmptyState`, `StatCard` e `FormField`.
   - Remover o padding duplicado das páginas PJ e padronizar `max-w`.
5. **Conteúdo**: remover emojis de títulos, toasts e menus (metas, importar, GuidedTour, useWebSocket, LgpdConsent, reembolsos, billing etc.). Trocar `alert/confirm` por `AlertDialog`/toast. Texto revisado com tom profissional e sem "futurista".
6. **Sidebar** (`components/shared/Sidebar.tsx`):
   - Tirar a marcação triplicada.
   - Agrupar o menu PJ (Financeiro, Cadastros, Relatórios, Configurações) com ícones únicos.
   - Apagar `Sidebar_backup.tsx`.
7. Trocar `theme === 'light' ? ... : ...` por tokens, começando pelas páginas mais usadas: dashboard, transações, `WalletSummary`, Sidebar, PJ. Depois `admin/dashboard.tsx` e `customize.tsx`.

## FASE 4 — Fluidez mobile — ✅ feita
- Viewport: remover `maximum-scale=1`. Adicionar `theme-color`, `viewport-fit=cover` + safe-area insets, e inputs ≥16px (evita zoom no iOS).
- **PWA**: `vite-plugin-pwa` (manifest, ícones, service worker com cache só de assets) para instalar na tela inicial.
- Navegação:
  - Header mobile fixo e compacto.
  - **Bottom nav** (Início, Lançamentos, + Novo, Relatórios, Menu).
  - Drawer usando `Sheet` (Radix) com focus trap/Esc/scroll lock no lugar do painel framer-motion.
  - Breakpoint único (`useIsMobile` em 1024 ou alinhado ao `lg`).
- Tabelas → `DataTable` com modo card em mobile (PJ transactions, categorias, cartões, fluxo de caixa, fluxo projetado, RecentTransactions, extrato).
- Modais → `ResponsiveDialog` (já existe, sem uso): bottom sheet `vaul` no mobile e dialog no desktop.
- Remover a animação framer-motion de cada troca de página (`layouts/MainLayout.tsx`). Tirar `staleTime: Infinity` e revisar a invalidação. Code-split por rota (`React.lazy`) nas páginas gigantes (`customize.tsx` 3881 linhas, `transactions` 1698).
- Botão "+ Novo lançamento" com formulário rápido em bottom sheet (valor em teclado numérico, categoria recente em chips).

---

## Ordem de execução e entrega
1. **Fase 0**: um commit/PR isolado. Validar e pedir rotação de segredos.
2. **Fase 1**: parsers + testes → validação zod → memória/correções → confirmações → auditoria. Rollout pela flag.
3. **Fase 2**: bugs 2.1 → backend de sessão/staging → wizard → ERP (contas a receber, contatos, centros de custo, DRE).
4. **Fases 3 e 4** em conjunto: tokens/CSS → componentes base → páginas principais → mobile.

Cada fase termina com `npm run check`, `npm run build`, todas as baterias `test:*` e `flags:auditar`/`flags:check-literals`.

## Verificação
- **Segurança**: com `npm run dev`, testar via curl:
  - registro com `tipo_usuario:super_admin` → usuário `normal`;
  - `GET /api/charts/download/..%2F..%2F.env` → 400/401;
  - POST no webhook UazAPI sem secret → 401, e com `BaseUrl` forjado a resposta não sai para ele;
  - `ws?token=1` → recusado;
  - usuário alvo de impersonation → 403 em `/api/admin/*`.
- **IA**: `test:nlp-br` e `test:classificacao-pf` verdes no CI, `eval-ia-whatsapp` com relatório de acurácia antes/depois, e simulador `/admin/simular-whatsapp` com as frases problemáticas dos clientes.
- **Importação**:
  - importar OFX real (reproduzir o bug do ON CONFLICT antes e depois);
  - interromper no meio (fechar a aba) e retomar a sessão;
  - forçar erro no confirmar → nenhum lançamento gravado;
  - conferir que todo lançamento tem `conta_bancaria_id` e que o saldo bate com o `LEDGERBAL`.
- **UI/Mobile**: rodar o app e tirar screenshots com Playwright (Chromium pré-instalado) em 390×844 e 1440×900 das telas principais, antes e depois. Lighthouse mobile (PWA instalável, acessibilidade sem bloqueio de zoom).

---

## Situação em 2026-09-25

Todas as fases foram entregues no branch `claude/system-vulnerabilities-analysis-ecu7zd`.

### Como ligar
- **Importação v2**: a flag `importacao_extrato_v2` começa desligada. Ligue em `/admin/feature-flags`, por usuário (piloto) ou para todos. Com ela desligada, a conciliação PJ continua usando o importador antigo.
- **ERP** (contas a receber, DRE gerencial, transferências, clientes/fornecedores, centros de custo): aparece só para usuários na modalidade **PJ ME**.

### Ações de operação obrigatórias
- Rotacionar a senha do banco de produção, que estava em arquivo versionado (já removido do repositório, mas continua no histórico do git).
- Rotacionar o `SESSION_SECRET`.
- Com mais de uma instância UazAPI, preencher `UAZAPI_WEBHOOK_TOKENS`. Opcional: `UAZAPI_WEBHOOK_SECRET`, que também precisa ir na URL do webhook.
- A CSP já vem ativa em produção. Se algum recurso externo quebrar, use `CSP_MODE=report` temporariamente.
- Os links de checkout antigos continuam válidos até `CHECKOUT_LEGACY_ATE` (padrão 2026-10-25).

### Lacunas conhecidas
- Golden set de avaliação da IA com LLM real (hoje só as baterias determinísticas `test:nlp-br` e `test:classificacao-pf`).
- Contato e centro de custo ainda não aparecem no formulário comum de lançamento PJ, só na importação e em contas a receber.
- Transferências entre contas PF sem tela própria. Hoje só pela importação.
- Plano de contas sem hierarquia por FK (usa código `1.01`).
- PWA com manifest e service worker estáticos (sem `vite-plugin-pwa`); telas administrativas não revisadas visualmente; modais legados sem focus trap; varredura de i18n incompleta.

---

## Etapa 2 do ERP PJ ME — entregue

### O que entrou
- **Plano de contas** em árvore, com os modelos **Base Serviços** e **Base Comércio**. A empresa nova recebe o modelo pelo segmento; as existentes ganharam grupos sem renumerar nenhuma conta; "Completar com modelo" adiciona o que falta. Nenhum lançamento pode ir para um grupo: a API bloqueia e há também um trigger no banco. Conta com lançamentos é inativada, não excluída.
- **Criar conta sem sair do lançamento**: no lançamento PJ, na edição rápida, em Vencimentos, em a pagar e a receber e na importação. A conta nova já nasce no grupo escolhido.
- **Contas a pagar e a receber** com parcelamento, recorrência mensal e a opção "já pago". Baixa individual ou em lote (tudo ou nada); na baixa, juros, multa ou desconto vão para o resultado financeiro. O estorno desfaz a baixa. Os filtros ficam guardados na URL.
- **Indicadores num cálculo só** (`shared/indicadores-financeiros.ts`): receita bruta e líquida, CMV/CSP, markup, margem de contribuição, ponto de equilíbrio (com % atingido e margem de segurança), lucro líquido e geração de caixa.
- **DRE gerencial** por margem de contribuição. **Razão** por conta com saldo acumulado e CSV. **Mapa do dinheiro** (Sankey) mostrando de onde o dinheiro veio e para onde foi.
- **Projeção de caixa**: parte do saldo atual e soma o que falta receber, o que falta pagar, as faturas e as mensalidades. Tem cenários, taxa de inadimplência e aviso de quando o saldo fica negativo.
- **Dashboard de análise** (é a tela inicial do PJ ME).
- **Clientes** com endereço (exigido para emitir boleto) e uma ficha com o total recebido, o que está em aberto, o atraso médio e o histórico.
- **Recebimentos Cora** (flag `integracao_cora`):
  - a própria empresa conecta a conta em Configurações → Integrações ou em Recebimentos Cora → Conexão;
  - emite boleto + Pix;
  - quando o cliente paga, o Cora avisa, o sistema confirma na API do Cora e dá a baixa sozinho;
  - a cada 30 minutos um job confere as cobranças, como rede de segurança;
  - dá para cancelar, enviar por e-mail, copiar o Pix e a linha digitável.

### Para ativar
1. Defina `INTEGRACOES_SECRET` no EasyPanel (`openssl rand -base64 48`).
2. Confira se `PUBLIC_APP_URL` (ou `BASE_URL`) está com https: é o endereço para onde o Cora manda os avisos.
3. Ligue a flag `integracao_cora` para os pilotos em `/admin/feature-flags`.
4. Teste no **ambiente stage do Cora** com as credenciais de sandbox de um piloto: conectar → ativar aviso → emitir → pagar no sandbox → conferir a baixa.

### Pendências e riscos
- **Os endpoints do Cora não foram conferidos na documentação oficial**: o acesso a developers.cora.com.br estava bloqueado no ambiente de desenvolvimento. A implementação segue o contrato conhecido da Integração Direta: token mTLS em `matls-clients.api[.stage].cora.com.br/token`, `/v2/invoices` e `/endpoints`. Foi validada contra um servidor simulado que exige mTLS. Os endereços ficam em `server/services/cora/cora.client.ts` (`URLS`), e a leitura das respostas aceita variações de nome de campo. **O primeiro teste no stage é obrigatório antes de liberar em produção.**
- Pix recebido sem cobrança emitida (Pix direto na chave) não é baixado automaticamente; ele entra pela importação do extrato.
- Baixa parcial (receber só parte do título) ainda não existe.
