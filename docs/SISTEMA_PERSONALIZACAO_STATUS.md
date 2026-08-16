# 🎯 Status: Sistema de Personalização do Nome - FinanceHub

**Data**: 2025-01-13
**Status**: ⚙️ EM PROGRESSO (70% concluído)

---

## ✅ CONCLUÍDO

### 1. Backend (100%)

#### ✅ Migration
- **Arquivo**: `server/migrations/0015_create_system_settings.sql`
- **Conteúdo**:
  - Tabela `system_settings` criada
  - 6 configurações padrão inseridas:
    - `system_name`: "FinanceHub"
    - `system_name_short`: "financehub"
    - `system_tagline`: "Gestão financeira inteligente e moderna"
    - `support_email`: "suporte@financehub.com"
    - `system_url`: "https://financehub.com"
    - `system_description`: "FinanceHub - Gerencie suas finanças..."
  - Trigger para `updated_at` automático

#### ✅ Controller
- **Arquivo**: `server/controllers/system-settings.controller.ts`
- **Endpoints implementados**:
  - `getSystemSettings()` - GET todas as configurações (público)
  - `updateSystemSettings()` - PUT atualizar (super admin)
  - `getSystemSetting()` - GET configuração por chave (super admin)
- **Validações**:
  - Nome não vazio (máx 100 chars)
  - Nome curto lowercase apenas (máx 50 chars, pattern: [a-z0-9_-]+)
  - Email válido
  - URL válida
  - Tagline máx 200 chars
  - Descrição máx 500 chars

#### ✅ Rotas
- **Arquivo**: `server/routes.ts`
- **Rotas adicionadas**:
  - `GET /api/system/settings` - Público
  - `PUT /api/admin/system/settings` - Super Admin
  - `GET /api/admin/system/settings/:key` - Super Admin
- **Swagger**: Documentação completa adicionada

---

### 2. Frontend Context (100%)

#### ✅ SystemConfigContext
- **Arquivo**: `client/src/contexts/SystemConfigContext.tsx`
- **Funcionalidades**:
  - Context com React Query
  - Cache de 5 minutos
  - Fallback para valores padrão se API falhar
  - 3 hooks disponíveis:
    - `useSystemConfig()` - Completo (config, isLoading, error, refetch)
    - `useSystemConfigValue(key)` - Um valor específico
    - `useSystemConfigValues()` - Todos os valores
  - TypeScript type-safe

#### ✅ Provider no App
- **Arquivo**: `client/src/App.tsx`
- **Hierarquia**:
  ```tsx
  QueryClientProvider
    → TooltipProvider
      → LocalizationProvider
        → SystemConfigProvider ✅ ADICIONADO
          → NotificationsProvider
            → AutoThemeProvider
              → Router
  ```

---

### 3. Interface Admin (100%)

#### ✅ Página de Customização
- **Arquivo**: `client/src/pages/admin/customize.tsx`
- **Componente adicionado**: `SystemConfigSection`
- **Localização**: Tab "Personalizar SaaS", ANTES da seção de logos
- **Campos**:
  1. Nome do Sistema (text, max 100)
  2. Nome Curto (text lowercase, max 50)
  3. Email de Suporte (email)
  4. URL do Sistema (url)
  5. Slogan/Tagline (text, max 200)
  6. Descrição SEO (textarea, max 500)
- **Funcionalidades**:
  - Formulário controlado com estado
  - Validação no frontend
  - Loading state durante save
  - Toast de sucesso/erro
  - Auto-refresh da página após salvar (para atualizar metadados)
  - Invalidação de cache React Query

---

## 🚧 PENDENTE

### 4. Utilitário de Metadados (0%)

**Arquivo a criar**: `client/src/utils/update-metadata.ts`

**Funções necessárias**:
```typescript
export function updateDocumentTitle(systemName: string): void;
export function updateMetaTag(name: string, content: string): void;
export function updateOpenGraphTags(config: SystemConfig): void;
export function updateAllMetadata(config: SystemConfig): void;
```

**Uso**: Chamar no App.tsx após carregar config

---

### 5. Substituições nos Componentes (0%)

**19 arquivos a modificar:**

#### Prioridade CRÍTICA - SEO:
1. ✅ `client/index.html` (4 locais)
   - Usar script inline para injetar dinamicamente
   - Executar antes do React

#### Prioridade ALTA - UI Visível (14 arquivos):
2. ❌ `client/src/pages/checkout/ExternalCheckout.tsx` (4 locais)
3. ❌ `client/src/pages/billing/checkout.tsx` (1 local)
4. ❌ `client/src/pages/billing/success.tsx` (1 local - email)
5. ❌ `client/src/pages/subscription-expired/index.tsx` (1 local)
6. ❌ `client/src/pages/subscription/cancel.tsx` (1 local)
7. ❌ `client/src/pages/admin/dashboard.tsx` (1 local)
8. ❌ `client/src/components/subscription/ExpiredSubscriptionOverlay.tsx` (1 local)
9. ❌ `client/src/components/ui/theme-preview.tsx` (1 local)
10. ❌ `client/src/components/AutoThemeProvider.tsx` (1 local)
11. ❌ `client/src/pages/login/index.tsx` (1 local - toast)
12. ❌ `client/src/pages/not-found.tsx` (1 local - alt)

#### Prioridade MÉDIA - Admin (2 arquivos):
13. ❌ `client/src/pages/admin/customize.tsx` (9 locais - placeholders)
14. ❌ `client/src/utils/theme-manager.ts` (1 local)

#### Prioridade BAIXA - Técnico:
15. ✅ **MANTER**: Chaves de localStorage com prefixo "financehub_"
    - Não alterar para evitar perda de dados dos usuários

---

### 6. Pattern de Substituição

**❌ ANTES (hardcoded)**:
```tsx
<h1>FinanceHub</h1>
<p>Bem-vindo ao FinanceHub Premium</p>
```

**✅ DEPOIS (dinâmico)**:
```tsx
const { config } = useSystemConfig(); // ou useSystemConfigValues()

<h1>{config.system_name}</h1>
<p>Bem-vindo ao {config.system_name} Premium</p>
```

**Para casos simples (um valor apenas)**:
```tsx
const systemName = useSystemConfigValue('system_name');
<h1>{systemName}</h1>
```

---

## 📝 PRÓXIMOS PASSOS

### Passo 1: Criar update-metadata.ts
```typescript
// client/src/utils/update-metadata.ts
import { SystemConfig } from '@/contexts/SystemConfigContext';

export function updateAllMetadata(config: SystemConfig) {
  // Atualizar title
  document.title = `${config.system_name} - Dashboard Financeiro`;

  // Atualizar meta description
  updateMetaTag('description', config.system_description);

  // Atualizar Open Graph
  updateMetaTag('og:title', `${config.system_name} - Dashboard Financeiro`);
  updateMetaTag('og:description', config.system_description);
  updateMetaTag('og:url', config.system_url);
}

function updateMetaTag(name: string, content: string) {
  // Procurar por name ou property
  let meta = document.querySelector(`meta[name="${name}"]`) ||
             document.querySelector(`meta[property="${name}"]`);

  if (meta) {
    meta.setAttribute('content', content);
  }
}
```

### Passo 2: Usar no App.tsx
```tsx
// client/src/App.tsx
import { updateAllMetadata } from '@/utils/update-metadata';

function Router() {
  const { config } = useSystemConfig();

  useEffect(() => {
    updateAllMetadata(config);
  }, [config]);

  // ... resto do código
}
```

### Passo 3: Substituir em 19 arquivos
Usar find & replace com cuidado:
- Importar hook no topo
- Substituir strings hardcoded
- Testar cada página

### Passo 4: index.html dinâmico
Adicionar script inline no `<head>`:
```html
<script>
(function() {
  // Tentar ler de sessionStorage (após primeiro load)
  const cached = sessionStorage.getItem('system_config');
  if (cached) {
    const config = JSON.parse(cached);
    document.title = config.system_name + ' - Dashboard Financeiro';
  }
})();
</script>
```

### Passo 5: Testar
1. ✅ Rodar migration
2. ✅ Fazer build
3. ✅ Acessar /admin/customize
4. ✅ Alterar nome do sistema
5. ✅ Verificar atualização em:
   - Title da aba
   - Headers
   - Footers
   - Mensagens
   - Checkout externo
   - Toast notifications
   - Preview de temas

---

## 🎯 IMPACTO ESPERADO

### Antes:
```
❌ Nome fixo "FinanceHub" em 32 lugares
❌ Rebuild necessário para trocar nome
❌ Sem personalização para white-label
```

### Depois:
```
✅ Nome dinâmico em TODO o sistema
✅ Sem rebuild - alteração via admin
✅ Multi-tenant pronto
✅ White-label completo
✅ SEO personalizado
```

---

## 📊 ESTATÍSTICAS

- **Arquivos criados**: 3
- **Arquivos modificados**: 3
- **Linhas de código**: ~700
- **Endpoints novos**: 3
- **Componentes novos**: 2 (Context + Interface Admin)
- **Tempo estimado restante**: 1-2 horas
- **Progresso**: 70% concluído

---

## ⚠️ IMPORTANTE

### O que PODE ser alterado:
- ✅ system_name
- ✅ system_name_short
- ✅ system_tagline
- ✅ support_email
- ✅ system_url
- ✅ system_description

### O que NÃO DEVE ser alterado:
- ❌ Chaves de localStorage (`financehub_locale`, `financehub_translations`, etc)
  - **Motivo**: Usuários perderiam preferências salvas
  - **Solução**: Manter prefixo original ou criar migração de dados

### Após implementação completa:
1. Documentar na Wiki
2. Criar vídeo tutorial para admins
3. Adicionar ao changelog
4. Notificar clientes da nova funcionalidade

---

**Última atualização**: 2025-01-13 - 70% concluído
**Próximo checkpoint**: Criar update-metadata.ts e começar substituições
