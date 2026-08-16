# Design System - Sistema de Temas Profissional

## 📋 Análise Atual da Aplicação

### Estrutura de Temas Identificada

A aplicação atualmente possui:
- **Sistema baseado em CSS Variables** (HSL)
- **Suporte a Dark/Light Mode** via `next-themes`
- **Tailwind CSS** como framework principal
- **Variáveis CSS semânticas** no arquivo `index.css`

---

## 🎨 Inventário Completo de Cores

### Variáveis CSS Base (Light Mode)
```css
:root {
  /* Background & Foreground */
  --background: 0 0% 98%;
  --foreground: 240 10% 3.9%;
  
  /* Cores de Interface */
  --muted: 240 4.8% 95.9%;
  --muted-foreground: 240 3.8% 46.1%;
  --popover: 0 0% 100%;
  --popover-foreground: 240 10% 3.9%;
  --card: 0 0% 100%;
  --card-foreground: 240 10% 3.9%;
  --border: 240 5.9% 90%;
  --input: 240 5.9% 90%;
  
  /* Cores Principais */
  --primary: 255 100% 70%;          /* Rosa/Pink */
  --primary-foreground: 0 0% 98%;
  --secondary: 157 100% 50%;        /* Verde/Teal */
  --secondary-foreground: 0 0% 9%;
  
  /* Cores de Estado */
  --accent: 240 4.8% 95.9%;
  --accent-foreground: 240 5.9% 10%;
  --destructive: 0 84.2% 60.2%;     /* Vermelho */
  --destructive-foreground: 0 0% 98%;
  --ring: 255 100% 70%;
  
  /* Cores para Gráficos */
  --chart-1: 157 100% 50%;
  --chart-2: 255 100% 70%;
  --chart-3: 357 100% 60%;
  --chart-4: 43 100% 50%;
  --chart-5: 275 100% 60%;
  
  /* Sidebar Específica */
  --sidebar-background: 230 50% 15%;
  --sidebar-foreground: 0 0% 98%;
  --sidebar-primary: 255 100% 70%;
  --sidebar-primary-foreground: 0 0% 98%;
  --sidebar-accent: 157 100% 50%;
  --sidebar-accent-foreground: 0 0% 9%;
  --sidebar-border: 240 3.7% 15.9%;
  --sidebar-ring: 255 100% 70%;
}
```

### Variáveis CSS Base (Dark Mode)
```css
.dark {
  /* Background & Foreground */
  --background: 240 10% 3.9%;
  --foreground: 0 0% 98%;
  
  /* Cores de Interface */
  --muted: 240 3.7% 15.9%;
  --muted-foreground: 240 5% 64.9%;
  --popover: 240 10% 3.9%;
  --popover-foreground: 0 0% 98%;
  --card: 240 10% 3.9%;
  --card-foreground: 0 0% 98%;
  --border: 240 3.7% 15.9%;
  --input: 240 3.7% 15.9%;
  
  /* Cores Principais (mantidas) */
  --primary: 255 100% 70%;
  --primary-foreground: 0 0% 98%;
  --secondary: 157 100% 50%;
  --secondary-foreground: 0 0% 9%;
  
  /* Cores de Estado */
  --accent: 240 3.7% 15.9%;
  --accent-foreground: 0 0% 98%;
  --destructive: 0 62.8% 30.6%;
  --destructive-foreground: 0 0% 98%;
  --ring: 255 100% 70%;
}
```

### Tipografia
```css
--font-sans: 'Inter', sans-serif;
--font-space: 'Space Grotesk', sans-serif;
--font-orbitron: 'Orbitron', sans-serif;
```

---

## 🏗️ Arquitetura do Design System

### 1. **Token System (Design Tokens)**

#### Estrutura Proposta:
```
/src/design-system/
├── tokens/
│   ├── colors.ts           # Definições de cores
│   ├── typography.ts       # Tipografia
│   ├── spacing.ts          # Espaçamentos
│   └── breakpoints.ts      # Breakpoints
├── themes/
│   ├── light.ts           # Tema claro
│   ├── dark.ts            # Tema escuro
│   └── custom.ts          # Temas personalizados
├── components/
│   ├── ThemeProvider.tsx   # Provider de tema
│   ├── ThemeSelector.tsx   # Seletor de tema
│   └── ColorPicker.tsx     # Picker de cores
└── utils/
    ├── theme-generator.ts  # Gerador de temas
    └── css-variables.ts    # Utilitários CSS vars
```

### 2. **Theme Provider Aprimorado**

```typescript
interface ThemeConfig {
  light: {
    primary: string;
    secondary: string;
    background: string;
    foreground: string;
    accent: string;
    muted: string;
    border: string;
    destructive: string;
    // ... outras cores
  };
  dark: {
    // mesma estrutura do light
  };
}

interface CustomTheme {
  id: string;
  name: string;
  config: ThemeConfig;
  createdAt: Date;
  updatedAt: Date;
}
```

### 3. **Sistema de Persistência**

- **Database**: Tabela `custom_themes` para armazenar temas personalizados
- **Storage**: Armazenamento local para preview em tempo real
- **API**: Endpoints para CRUD de temas personalizados

---

## 🚀 Plano de Implementação

### **FASE 1: Estrutura Base (Semana 1)**

#### 1.1 Criação da Estrutura de Arquivos
- [ ] Criar pasta `/src/design-system/`
- [ ] Implementar sistema de tokens
- [ ] Criar interfaces TypeScript para temas

#### 1.2 Database Schema
```sql
CREATE TABLE custom_themes (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  name VARCHAR(100) NOT NULL,
  is_default BOOLEAN DEFAULT false,
  light_config JSONB NOT NULL,
  dark_config JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_custom_themes_user_id ON custom_themes(user_id);
```

#### 1.3 API Endpoints
```typescript
// GET /api/themes - Listar temas disponíveis
// POST /api/themes - Criar novo tema
// PUT /api/themes/:id - Atualizar tema
// DELETE /api/themes/:id - Deletar tema
// POST /api/themes/:id/activate - Ativar tema
```

### **FASE 2: Interface de Personalização (Semana 2)**

#### 2.1 Componentes de UI
- [ ] **ColorPicker**: Componente para seleção de cores
- [ ] **ThemePreview**: Preview em tempo real
- [ ] **ThemeManager**: Gerenciador de temas salvos
- [ ] **ImportExport**: Importar/Exportar temas

#### 2.2 Página de Personalização (`/admin/customize`)
```typescript
interface CustomizePageSections {
  colorPalette: {
    primary: ColorPicker;
    secondary: ColorPicker;
    accent: ColorPicker;
    background: ColorPicker;
    // ... outras cores
  };
  typography: {
    fontFamily: FontSelector;
    fontSize: SizeSelector;
  };
  layout: {
    borderRadius: RangeSlider;
    spacing: SpacingSelector;
  };
}
```

### **FASE 3: Funcionalidades Avançadas (Semana 3)**

#### 3.1 Sistema de Preview
- [ ] Preview em tempo real das mudanças
- [ ] Aplicação temporária de temas
- [ ] Comparação lado a lado (antes/depois)

#### 3.2 Validação e Acessibilidade
- [ ] Verificação de contraste WCAG AA
- [ ] Alertas de acessibilidade
- [ ] Sugestões automáticas de cores

#### 3.3 Templates Predefinidos
```typescript
const themeTemplates = {
  corporate: { /* tons azuis/cinzas */ },
  creative: { /* tons vibrantes */ },
  minimal: { /* tons neutros */ },
  nature: { /* tons verdes */ },
  sunset: { /* tons laranjas/rosas */ }
};
```

### **FASE 4: Integração e Polimento (Semana 4)**

#### 4.1 Integração com Componentes Existentes
- [ ] Atualizar todos os componentes UI
- [ ] Garantir compatibilidade com temas customizados
- [ ] Testes em diferentes breakpoints

#### 4.2 Performance e Otimização
- [ ] Lazy loading de temas
- [ ] Cache de temas aplicados
- [ ] Otimização de re-renders

#### 4.3 Documentação de Usuário
- [ ] Guias de uso da personalização
- [ ] Exemplos de combinações de cores
- [ ] Best practices de design

---

## 🎯 Funcionalidades Específicas

### **Área de Personalização para Super Admin**

#### Layout da Interface:
```
┌─────────────────────────────────────────────────────────┐
│ 🎨 Personalização de Temas                              │
├─────────────────────────────────────────────────────────┤
│ 📱 Preview           │ ⚙️ Configurações                │
│ ┌─────────────────┐   │ ┌─────────────────────────────┐  │
│ │                 │   │ │ 🌞 Light Mode               │  │
│ │   Live Preview  │   │ │ ├─ Primary Color           │  │
│ │                 │   │ │ ├─ Secondary Color         │  │
│ │                 │   │ │ ├─ Background              │  │
│ │                 │   │ │ ├─ Text Color              │  │
│ │                 │   │ │ └─ Accent Color            │  │
│ │                 │   │ │                             │  │
│ └─────────────────┘   │ │ 🌙 Dark Mode                │  │
│                       │ │ ├─ Primary Color           │  │
│                       │ │ ├─ Secondary Color         │  │
│                       │ │ ├─ Background              │  │
│                       │ │ ├─ Text Color              │  │
│                       │ │ └─ Accent Color            │  │
│                       │ └─────────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│ 💾 Salvar Tema | 🔄 Reset | 📤 Exportar | 📥 Importar │
└─────────────────────────────────────────────────────────┘
```

### **Componentes Principais**

#### 1. **ColorPicker Component**
```typescript
interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
  format: 'hex' | 'hsl' | 'rgb';
  showPresets?: boolean;
  wcagCompliance?: boolean;
}
```

#### 2. **ThemePreview Component**
```typescript
interface ThemePreviewProps {
  theme: ThemeConfig;
  mode: 'light' | 'dark';
  showComponents?: ComponentType[];
}
```

#### 3. **ThemeManager Component**
```typescript
interface ThemeManagerProps {
  themes: CustomTheme[];
  onSelect: (theme: CustomTheme) => void;
  onDelete: (themeId: string) => void;
  onExport: (theme: CustomTheme) => void;
  onImport: (themeData: ThemeConfig) => void;
}
```

---

## 🔧 Implementação Técnica

### **1. Gerador de CSS Variables**
```typescript
function generateCSSVariables(theme: ThemeConfig, mode: 'light' | 'dark'): string {
  const config = theme[mode];
  return Object.entries(config)
    .map(([key, value]) => `--${key}: ${value};`)
    .join('\n');
}
```

### **2. Aplicação Dinâmica de Temas**
```typescript
function applyTheme(theme: ThemeConfig, mode: 'light' | 'dark'): void {
  const root = document.documentElement;
  const cssVars = generateCSSVariables(theme, mode);
  
  // Remove estilos anteriores
  document.getElementById('custom-theme')?.remove();
  
  // Aplica novo tema
  const style = document.createElement('style');
  style.id = 'custom-theme';
  style.textContent = `:root { ${cssVars} }`;
  document.head.appendChild(style);
}
```

### **3. Validação de Acessibilidade**
```typescript
function validateContrast(
  foreground: string, 
  background: string
): { ratio: number; passes: boolean; level: 'AA' | 'AAA' | 'FAIL' } {
  // Implementar cálculo de contraste WCAG
  const ratio = calculateContrastRatio(foreground, background);
  
  return {
    ratio,
    passes: ratio >= 4.5,
    level: ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : 'FAIL'
  };
}
```

---

## 🛡️ Segurança e Robustez

### **Validações**
1. **Input Sanitization**: Validar formato de cores
2. **Permission Checks**: Apenas super_admin pode personalizar
3. **Backup System**: Manter backup dos temas padrão
4. **Rollback**: Capacidade de reverter mudanças

### **Fallbacks**
1. **Tema Padrão**: Sempre manter tema padrão funcional
2. **Detecção de Erro**: Detectar temas corrompidos
3. **Auto-Recovery**: Reverter automaticamente em caso de erro

### **Performance**
1. **Lazy Loading**: Carregar temas sob demanda
2. **Caching**: Cache de temas em localStorage
3. **Debouncing**: Evitar re-renders excessivos durante edição

---

## 📱 Experiência do Usuário

### **Fluxo de Personalização**
1. **Acesso**: Super admin acessa `/admin/customize`
2. **Seleção**: Escolhe entre Light/Dark mode para editar
3. **Edição**: Utiliza color pickers para personalizar cores
4. **Preview**: Vê mudanças em tempo real
5. **Validação**: Sistema verifica acessibilidade
6. **Salvamento**: Salva tema com nome personalizado
7. **Ativação**: Aplica tema à aplicação

### **Recursos de Usabilidade**
- **Undo/Redo**: Histórico de mudanças
- **Presets**: Temas pré-configurados
- **Import/Export**: Compartilhamento de temas
- **Backup**: Download do tema atual

---

## 🚦 Critérios de Aceitação

### **Funcionalidades Obrigatórias**
- ✅ Interface intuitiva para personalização
- ✅ Preview em tempo real
- ✅ Suporte completo a Light/Dark mode
- ✅ Validação de acessibilidade
- ✅ Persistência de temas customizados
- ✅ Sistema de fallback robusto

### **Funcionalidades Desejáveis**
- 🎯 Templates predefinidos
- 🎯 Exportar/Importar temas
- 🎯 Histórico de mudanças
- 🎯 Comparação de temas

### **Métricas de Qualidade**
- **Performance**: < 100ms para aplicar tema
- **Acessibilidade**: WCAG 2.1 AA compliance
- **Usabilidade**: < 5 cliques para personalizar
- **Robustez**: 99.9% uptime sem quebrar layout

---

## 📚 Próximos Passos

### **Imediatos (Esta Sprint)**
1. Criar estrutura de arquivos do design system
2. Implementar database schema para temas
3. Desenvolver API endpoints básicos

### **Curto Prazo (Próximas 2 semanas)**
1. Implementar interface de personalização
2. Desenvolver sistema de preview
3. Adicionar validação de acessibilidade

### **Médio Prazo (Próximo mês)**
1. Adicionar templates predefinidos
2. Implementar import/export
3. Otimizar performance

### **Longo Prazo**
1. Sistema de versionamento de temas
2. Marketplace de temas (comunidade)
3. IA para sugestão de paletas

---

## 💡 Considerações Importantes

### **Compatibilidade**
- Manter compatibilidade com todos os componentes existentes
- Garantir funcionamento em diferentes navegadores
- Testar em diversos dispositivos e resoluções

### **Manutenibilidade**
- Código bem documentado e testado
- Estrutura modular e extensível
- Seguir padrões de design system estabelecidos

### **Escalabilidade**
- Suporte a múltiplos temas customizados
- Performance mantida com crescimento de usuários
- Facilidade para adicionar novas variáveis de tema

---

*Este documento serve como guia completo para implementação de um sistema de temas profissional, robusto e user-friendly para a aplicação FinanceHub.*