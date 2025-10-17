# Sistema de Localização - Plano de Implementação

## Visão Geral

Este documento define a implementação de um sistema de localização completo para a aplicação financeira, seguindo os padrões ISO 639-1 para códigos de idioma. O sistema permitirá múltiplas linguagens e será administrável apenas por super administradores.

## Arquitetura Atual Analisada

### Frontend
- **Framework**: React com TypeScript
- **Roteamento**: Wouter
- **Estado**: TanStack Query (React Query)
- **UI**: Radix UI + Tailwind CSS
- **Localização atual**: Hardcoded em Português Brasileiro (pt-BR)

### Backend
- **Framework**: Express.js com TypeScript
- **ORM**: Drizzle ORM
- **Banco de dados**: PostgreSQL
- **Autenticação**: Sessions com Express Session
- **Admin**: Sistema existente com `super_admin` tipo de usuário

### Estrutura de Dados
- **Usuários**: Campo `tipo_usuario` com valores ('usuario', 'admin', 'super_admin')
- **Super Admin**: Único tipo com acesso a configurações avançadas

## Padrões ISO 639-1 Implementados

### Códigos de Idioma Suportados
```typescript
enum LanguageCode {
  PT_BR = 'pt-br',  // Português Brasileiro
  EN_US = 'en-us',  // Inglês Americano
  ES_ES = 'es-es',  // Espanhol Europeu
  FR_FR = 'fr-fr',  // Francês França
  DE_DE = 'de-de',  // Alemão Alemanha
  IT_IT = 'it-it',  // Italiano Itália
}
```

## Implementação Detalhada

### 1. Banco de Dados

#### 1.1 Nova Tabela: `system_localization`
```sql
CREATE TABLE system_localization (
  id SERIAL PRIMARY KEY,
  locale_code VARCHAR(10) NOT NULL UNIQUE, -- ISO 639-1 format (pt-br, en-us, etc.)
  locale_name VARCHAR(100) NOT NULL,       -- Nome do idioma (Português Brasil, English US)
  is_active BOOLEAN NOT NULL DEFAULT false,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
  created_by INTEGER REFERENCES usuarios(id),
  updated_at TIMESTAMP WITH TIME ZONE,
  updated_by INTEGER REFERENCES usuarios(id),
  
  CONSTRAINT unique_default_locale CHECK (
    (is_default = true AND is_active = true) OR is_default = false
  )
);

-- Trigger para garantir apenas um idioma padrão
CREATE OR REPLACE FUNCTION ensure_single_default_locale()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_default = true THEN
    UPDATE system_localization 
    SET is_default = false 
    WHERE id != NEW.id AND is_default = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_single_default_locale
  BEFORE INSERT OR UPDATE ON system_localization
  FOR EACH ROW
  EXECUTE FUNCTION ensure_single_default_locale();
```

#### 1.2 Nova Tabela: `localization_strings`
```sql
CREATE TABLE localization_strings (
  id SERIAL PRIMARY KEY,
  string_key VARCHAR(255) NOT NULL,        -- Chave única do texto (ex: 'dashboard.title')
  locale_code VARCHAR(10) NOT NULL,        -- Código do idioma
  string_value TEXT NOT NULL,              -- Valor traduzido
  string_context VARCHAR(500),             -- Contexto/descrição para tradutores
  created_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
  updated_at TIMESTAMP WITH TIME ZONE,
  
  FOREIGN KEY (locale_code) REFERENCES system_localization(locale_code) ON DELETE CASCADE,
  UNIQUE(string_key, locale_code)
);

-- Índices para performance
CREATE INDEX idx_localization_strings_key ON localization_strings(string_key);
CREATE INDEX idx_localization_strings_locale ON localization_strings(locale_code);
```

#### 1.3 Dados Iniciais
```sql
-- Inserir idiomas suportados
INSERT INTO system_localization (locale_code, locale_name, is_active, is_default) VALUES
('pt-br', 'Português Brasil', true, true),
('en-us', 'English US', false, false),
('es-es', 'Español España', false, false);
```

### 2. Backend (Node.js/Express)

#### 2.1 Schema Drizzle (shared/schema.ts)
```typescript
// Adicionar ao shared/schema.ts
export const systemLocalization = pgTable("system_localization", {
  id: serial("id").primaryKey(),
  localeCode: varchar("locale_code", { length: 10 }).notNull().unique(),
  localeName: varchar("locale_name", { length: 100 }).notNull(),
  isActive: boolean("is_active").notNull().default(false),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
  createdBy: integer("created_by").references(() => users.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
  updatedBy: integer("updated_by").references(() => users.id),
});

export const localizationStrings = pgTable("localization_strings", {
  id: serial("id").primaryKey(),
  stringKey: varchar("string_key", { length: 255 }).notNull(),
  localeCode: varchar("locale_code", { length: 10 }).notNull().references(() => systemLocalization.localeCode, { onDelete: 'cascade' }),
  stringValue: text("string_value").notNull(),
  stringContext: varchar("string_context", { length: 500 }),
  createdAt: timestamp("created_at", { withTimezone: true }).default(sql`(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')`),
  updatedAt: timestamp("updated_at", { withTimezone: true }),
}, (table) => [
  unique().on(table.stringKey, table.localeCode)
]);

// Schemas de validação
export const insertLocalizationSchema = createInsertSchema(systemLocalization).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

export const insertStringSchema = createInsertSchema(localizationStrings).omit({ 
  id: true, 
  createdAt: true, 
  updatedAt: true 
});

// Types
export type SystemLocalization = typeof systemLocalization.$inferSelect;
export type LocalizationString = typeof localizationStrings.$inferSelect;
export type InsertLocalization = z.infer<typeof insertLocalizationSchema>;
export type InsertString = z.infer<typeof insertStringSchema>;
```

#### 2.2 Controller: `localization.controller.ts`
```typescript
// server/controllers/localization.controller.ts
import { Request, Response } from 'express';
import { db } from '../db';
import { systemLocalization, localizationStrings } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

/**
 * @swagger
 * /api/admin/localization:
 *   get:
 *     summary: Lista todos os idiomas configurados (apenas super admin)
 *     tags: [Admin - Localization]
 *     security:
 *       - sessionAuth: []
 *     responses:
 *       200:
 *         description: Lista de idiomas
 *       403:
 *         description: Acesso negado
 */
export const getLocales = async (req: Request, res: Response) => {
  try {
    const locales = await db.select().from(systemLocalization).orderBy(systemLocalization.localeName);
    res.json(locales);
  } catch (error) {
    console.error('Erro ao buscar idiomas:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * @swagger
 * /api/admin/localization:
 *   post:
 *     summary: Adiciona novo idioma (apenas super admin)
 */
export const createLocale = async (req: Request, res: Response) => {
  try {
    const { localeCode, localeName, isActive, isDefault } = req.body;
    
    const newLocale = await db.insert(systemLocalization).values({
      localeCode,
      localeName,
      isActive,
      isDefault,
      createdBy: req.user!.id
    }).returning();

    res.status(201).json(newLocale[0]);
  } catch (error) {
    console.error('Erro ao criar idioma:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * Busca o idioma padrão do sistema
 */
export const getDefaultLocale = async (req: Request, res: Response) => {
  try {
    const defaultLocale = await db.select()
      .from(systemLocalization)
      .where(and(
        eq(systemLocalization.isDefault, true),
        eq(systemLocalization.isActive, true)
      ))
      .limit(1);

    if (defaultLocale.length === 0) {
      return res.status(404).json({ error: 'Nenhum idioma padrão configurado' });
    }

    res.json(defaultLocale[0]);
  } catch (error) {
    console.error('Erro ao buscar idioma padrão:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * Busca strings de localização para um idioma específico
 */
export const getLocalizationStrings = async (req: Request, res: Response) => {
  try {
    const { localeCode } = req.params;
    
    const strings = await db.select()
      .from(localizationStrings)
      .where(eq(localizationStrings.localeCode, localeCode));

    // Converter para objeto chave-valor
    const stringMap: Record<string, string> = {};
    strings.forEach(s => {
      stringMap[s.stringKey] = s.stringValue;
    });

    res.json(stringMap);
  } catch (error) {
    console.error('Erro ao buscar strings de localização:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};

/**
 * Importa strings de um arquivo JSON
 */
export const importStringsFromJson = async (req: Request, res: Response) => {
  try {
    const { localeCode } = req.params;
    const filePath = path.join(process.cwd(), 'locales', `${localeCode}.json`);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Arquivo de localização não encontrado' });
    }

    const jsonContent = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    // Converter objeto aninhado para chaves planas
    const flattenObject = (obj: any, prefix = ''): Record<string, string> => {
      let result: Record<string, string> = {};
      
      for (const key in obj) {
        const newKey = prefix ? `${prefix}.${key}` : key;
        
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          Object.assign(result, flattenObject(obj[key], newKey));
        } else {
          result[newKey] = String(obj[key]);
        }
      }
      
      return result;
    };

    const flatStrings = flattenObject(jsonContent);
    
    // Inserir/atualizar strings no banco
    for (const [key, value] of Object.entries(flatStrings)) {
      await db.insert(localizationStrings)
        .values({
          stringKey: key,
          localeCode,
          stringValue: value
        })
        .onConflictDoUpdate({
          target: [localizationStrings.stringKey, localizationStrings.localeCode],
          set: {
            stringValue: value,
            updatedAt: new Date()
          }
        });
    }

    res.json({ 
      message: 'Strings importadas com sucesso',
      count: Object.keys(flatStrings).length 
    });
  } catch (error) {
    console.error('Erro ao importar strings:', error);
    res.status(500).json({ error: 'Erro interno do servidor' });
  }
};
```

#### 2.3 Rotas (server/routes.ts)
```typescript
// Adicionar ao server/routes.ts
import { requireSuperAdmin } from './middleware/adminAuth.middleware';
import * as localizationController from './controllers/localization.controller';

// Rotas de localização (apenas super admin)
app.get('/api/admin/localization', requireSuperAdmin, localizationController.getLocales);
app.post('/api/admin/localization', requireSuperAdmin, localizationController.createLocale);
app.put('/api/admin/localization/:id', requireSuperAdmin, localizationController.updateLocale);
app.delete('/api/admin/localization/:id', requireSuperAdmin, localizationController.deleteLocale);

// Rotas públicas de localização
app.get('/api/localization/default', localizationController.getDefaultLocale);
app.get('/api/localization/strings/:localeCode', localizationController.getLocalizationStrings);

// Importação de strings via JSON (apenas super admin)
app.post('/api/admin/localization/:localeCode/import', requireSuperAdmin, localizationController.importStringsFromJson);
```

#### 2.4 Middleware de Localização
```typescript
// server/middleware/localization.middleware.ts
import { Request, Response, NextFunction } from 'express';
import { db } from '../db';
import { systemLocalization } from '@shared/schema';
import { eq, and } from 'drizzle-orm';

// Adicionar ao Request
declare global {
  namespace Express {
    interface Request {
      locale?: string;
    }
  }
}

export const setLocale = async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Verificar header Accept-Language ou parâmetro de query
    const requestedLocale = req.headers['accept-language'] || req.query.locale as string;
    
    // Buscar idioma padrão do sistema
    const defaultLocale = await db.select()
      .from(systemLocalization)
      .where(and(
        eq(systemLocalization.isDefault, true),
        eq(systemLocalization.isActive, true)
      ))
      .limit(1);

    req.locale = defaultLocale[0]?.localeCode || 'pt-br';
    
    next();
  } catch (error) {
    console.error('Erro no middleware de localização:', error);
    req.locale = 'pt-br'; // Fallback
    next();
  }
};
```

### 3. Frontend (React)

#### 3.1 Context de Localização
```typescript
// client/src/contexts/LocalizationContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';

interface LocalizationContextType {
  locale: string;
  setLocale: (locale: string) => void;
  t: (key: string, fallback?: string) => string;
  isLoading: boolean;
  availableLocales: Array<{ code: string; name: string }>;
}

const LocalizationContext = createContext<LocalizationContextType | undefined>(undefined);

interface LocalizationProviderProps {
  children: ReactNode;
}

export const LocalizationProvider: React.FC<LocalizationProviderProps> = ({ children }) => {
  const [locale, setLocaleState] = useState<string>('pt-br');
  const [localizationStrings, setLocalizationStrings] = useState<Record<string, string>>({});

  // Buscar idioma padrão do sistema
  const { data: defaultLocale } = useQuery({
    queryKey: ['/api/localization/default'],
    staleTime: 1000 * 60 * 30, // 30 minutos
  });

  // Buscar strings de localização
  const { data: strings, isLoading: stringsLoading } = useQuery({
    queryKey: ['/api/localization/strings', locale],
    enabled: !!locale,
    staleTime: 1000 * 60 * 15, // 15 minutos
  });

  // Buscar idiomas disponíveis
  const { data: availableLocales = [] } = useQuery({
    queryKey: ['/api/admin/localization'],
    staleTime: 1000 * 60 * 60, // 1 hora
  });

  useEffect(() => {
    if (defaultLocale) {
      setLocaleState(defaultLocale.localeCode);
    }
  }, [defaultLocale]);

  useEffect(() => {
    if (strings) {
      setLocalizationStrings(strings);
    }
  }, [strings]);

  const setLocale = (newLocale: string) => {
    setLocaleState(newLocale);
    localStorage.setItem('preferred-locale', newLocale);
  };

  const t = (key: string, fallback?: string): string => {
    const value = localizationStrings[key];
    if (value) return value;
    
    // Se não encontrar, retornar fallback ou a própria chave
    if (fallback) return fallback;
    
    // Log para desenvolvimento
    if (process.env.NODE_ENV === 'development') {
      console.warn(`Missing translation for key: ${key} (locale: ${locale})`);
    }
    
    return key;
  };

  const contextValue: LocalizationContextType = {
    locale,
    setLocale,
    t,
    isLoading: stringsLoading,
    availableLocales: availableLocales.filter(l => l.isActive).map(l => ({ 
      code: l.localeCode, 
      name: l.localeName 
    }))
  };

  return (
    <LocalizationContext.Provider value={contextValue}>
      {children}
    </LocalizationContext.Provider>
  );
};

export const useLocalization = (): LocalizationContextType => {
  const context = useContext(LocalizationContext);
  if (!context) {
    throw new Error('useLocalization must be used within a LocalizationProvider');
  }
  return context;
};
```

#### 3.2 Hook de Tradução
```typescript
// client/src/hooks/useTranslation.ts
import { useLocalization } from '@/contexts/LocalizationContext';

export const useTranslation = () => {
  const { t, locale, setLocale, isLoading } = useLocalization();
  
  return {
    t,
    locale,
    setLocale,
    isLoading
  };
};
```

#### 3.3 Componente de Seleção de Idioma (Admin)
```typescript
// client/src/components/admin/LocaleSelector.tsx
import React from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/hooks/use-auth';

export const LocaleSelector: React.FC = () => {
  const { t, locale, setLocale, availableLocales } = useTranslation();
  const { user } = useAuth();

  // Apenas super admin pode alterar idioma
  if (user?.tipo_usuario !== 'super_admin') {
    return null;
  }

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="locale-select" className="text-sm font-medium">
        {t('admin.locale.selector.label', 'Idioma do Sistema')}:
      </label>
      <Select value={locale} onValueChange={setLocale}>
        <SelectTrigger className="w-[200px]">
          <SelectValue placeholder={t('admin.locale.selector.placeholder', 'Selecione um idioma')} />
        </SelectTrigger>
        <SelectContent>
          {availableLocales.map((loc) => (
            <SelectItem key={loc.code} value={loc.code}>
              {loc.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
```

#### 3.4 Página de Administração de Localização
```typescript
// client/src/pages/admin/localization.tsx
import React, { useState } from 'react';
import { useTranslation } from '@/hooks/useTranslation';
import { useAuth } from '@/hooks/use-auth';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Trash2, Plus, Upload } from 'lucide-react';

interface Locale {
  id: number;
  localeCode: string;
  localeName: string;
  isActive: boolean;
  isDefault: boolean;
}

export default function LocalizationPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  
  const [newLocale, setNewLocale] = useState({
    localeCode: '',
    localeName: '',
    isActive: false,
    isDefault: false
  });

  // Verificar acesso
  if (user?.tipo_usuario !== 'super_admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-destructive">{t('admin.access.denied', 'Acesso negado')}</p>
      </div>
    );
  }

  // Buscar idiomas
  const { data: locales = [], isLoading } = useQuery<Locale[]>({
    queryKey: ['/api/admin/localization']
  });

  // Mutations
  const createLocaleMutation = useMutation({
    mutationFn: async (locale: Omit<Locale, 'id'>) => {
      const response = await fetch('/api/admin/localization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(locale)
      });
      if (!response.ok) throw new Error('Erro ao criar idioma');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/localization'] });
      setNewLocale({ localeCode: '', localeName: '', isActive: false, isDefault: false });
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createLocaleMutation.mutate(newLocale);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t('admin.localization.title', 'Gerenciamento de Localização')}</h1>
      </div>

      {/* Formulário para adicionar novo idioma */}
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.localization.add.title', 'Adicionar Novo Idioma')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="localeCode">{t('admin.localization.code.label', 'Código do Idioma')}</Label>
                <Input
                  id="localeCode"
                  value={newLocale.localeCode}
                  onChange={(e) => setNewLocale(prev => ({ ...prev, localeCode: e.target.value }))}
                  placeholder="pt-br, en-us, es-es"
                  required
                />
              </div>
              <div>
                <Label htmlFor="localeName">{t('admin.localization.name.label', 'Nome do Idioma')}</Label>
                <Input
                  id="localeName"
                  value={newLocale.localeName}
                  onChange={(e) => setNewLocale(prev => ({ ...prev, localeName: e.target.value }))}
                  placeholder="Português Brasil, English US"
                  required
                />
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Switch
                  id="isActive"
                  checked={newLocale.isActive}
                  onCheckedChange={(checked) => setNewLocale(prev => ({ ...prev, isActive: checked }))}
                />
                <Label htmlFor="isActive">{t('admin.localization.active.label', 'Ativo')}</Label>
              </div>
              
              <div className="flex items-center space-x-2">
                <Switch
                  id="isDefault"
                  checked={newLocale.isDefault}
                  onCheckedChange={(checked) => setNewLocale(prev => ({ ...prev, isDefault: checked }))}
                />
                <Label htmlFor="isDefault">{t('admin.localization.default.label', 'Padrão')}</Label>
              </div>
            </div>
            
            <Button type="submit" disabled={createLocaleMutation.isPending}>
              <Plus className="w-4 h-4 mr-2" />
              {t('admin.localization.add.button', 'Adicionar Idioma')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Lista de idiomas existentes */}
      <Card>
        <CardHeader>
          <CardTitle>{t('admin.localization.list.title', 'Idiomas Configurados')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p>{t('common.loading', 'Carregando...')}</p>
          ) : (
            <div className="space-y-2">
              {locales.map((locale) => (
                <div key={locale.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">{locale.localeName}</div>
                    <div className="text-sm text-muted-foreground">{locale.localeCode}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {locale.isDefault && (
                      <span className="px-2 py-1 text-xs bg-primary text-primary-foreground rounded">
                        {t('admin.localization.default.badge', 'Padrão')}
                      </span>
                    )}
                    {locale.isActive && (
                      <span className="px-2 py-1 text-xs bg-green-100 text-green-800 rounded">
                        {t('admin.localization.active.badge', 'Ativo')}
                      </span>
                    )}
                    <Button size="sm" variant="outline">
                      <Upload className="w-4 h-4 mr-1" />
                      {t('admin.localization.import.button', 'Importar')}
                    </Button>
                    <Button size="sm" variant="destructive">
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

### 4. Arquivos JSON de Localização

#### 4.1 Estrutura de Diretórios
```
locales/
├── pt-br.json
├── en-us.json
├── es-es.json
└── README.md
```

#### 4.2 Arquivo pt-br.json (Português Brasileiro)
```json
{
  "common": {
    "loading": "Carregando...",
    "save": "Salvar",
    "cancel": "Cancelar",
    "delete": "Excluir",
    "edit": "Editar",
    "create": "Criar",
    "update": "Atualizar",
    "search": "Pesquisar",
    "filter": "Filtrar",
    "export": "Exportar",
    "import": "Importar",
    "yes": "Sim",
    "no": "Não",
    "close": "Fechar",
    "back": "Voltar",
    "next": "Próximo",
    "previous": "Anterior",
    "submit": "Enviar",
    "clear": "Limpar",
    "reset": "Redefinir"
  },
  "navigation": {
    "dashboard": "Dashboard",
    "transactions": "Transações",
    "categories": "Categorias",
    "wallets": "Carteiras",
    "reports": "Relatórios",
    "settings": "Configurações",
    "admin": "Administração",
    "logout": "Sair"
  },
  "dashboard": {
    "title": "Dashboard",
    "overview": "Visão Geral",
    "totalBalance": "Saldo Total",
    "monthlyIncome": "Receita Mensal",
    "monthlyExpenses": "Despesas Mensais",
    "recentTransactions": "Transações Recentes",
    "welcomeMessage": "Bem-vindo ao seu controle financeiro!"
  },
  "transactions": {
    "title": "Transações",
    "add": "Adicionar Transação",
    "edit": "Editar Transação",
    "delete": "Excluir Transação",
    "description": "Descrição",
    "amount": "Valor",
    "date": "Data",
    "category": "Categoria",
    "wallet": "Carteira",
    "type": {
      "income": "Receita",
      "expense": "Despesa"
    },
    "status": {
      "pending": "Pendente",
      "completed": "Efetivada",
      "canceled": "Cancelada"
    }
  },
  "admin": {
    "title": "Administração",
    "access": {
      "denied": "Acesso negado. Apenas super administradores podem acessar esta área."
    },
    "localization": {
      "title": "Gerenciamento de Localização",
      "add": {
        "title": "Adicionar Novo Idioma",
        "button": "Adicionar Idioma"
      },
      "list": {
        "title": "Idiomas Configurados"
      },
      "code": {
        "label": "Código do Idioma"
      },
      "name": {
        "label": "Nome do Idioma"
      },
      "active": {
        "label": "Ativo",
        "badge": "Ativo"
      },
      "default": {
        "label": "Padrão",
        "badge": "Padrão"
      },
      "import": {
        "button": "Importar"
      },
      "selector": {
        "label": "Idioma do Sistema",
        "placeholder": "Selecione um idioma"
      }
    }
  },
  "auth": {
    "login": {
      "title": "Entrar",
      "email": "E-mail",
      "password": "Senha",
      "button": "Entrar",
      "register": "Não tem conta? Cadastre-se"
    },
    "register": {
      "title": "Cadastrar",
      "name": "Nome",
      "email": "E-mail",
      "password": "Senha",
      "confirmPassword": "Confirmar Senha",
      "button": "Cadastrar",
      "login": "Já tem conta? Entre"
    }
  },
  "errors": {
    "required": "Este campo é obrigatório",
    "invalidEmail": "E-mail inválido",
    "passwordMismatch": "As senhas não coincidem",
    "minLength": "Mínimo de {min} caracteres",
    "networkError": "Erro de conexão. Tente novamente.",
    "serverError": "Erro interno do servidor",
    "unauthorized": "Não autorizado",
    "forbidden": "Acesso negado"
  },
  "success": {
    "saved": "Salvo com sucesso!",
    "created": "Criado com sucesso!",
    "updated": "Atualizado com sucesso!",
    "deleted": "Excluído com sucesso!",
    "imported": "Importado com sucesso!"
  }
}
```

#### 4.3 Arquivo en-us.json (English US)
```json
{
  "common": {
    "loading": "Loading...",
    "save": "Save",
    "cancel": "Cancel",
    "delete": "Delete",
    "edit": "Edit",
    "create": "Create",
    "update": "Update",
    "search": "Search",
    "filter": "Filter",
    "export": "Export",
    "import": "Import",
    "yes": "Yes",
    "no": "No",
    "close": "Close",
    "back": "Back",
    "next": "Next",
    "previous": "Previous",
    "submit": "Submit",
    "clear": "Clear",
    "reset": "Reset"
  },
  "navigation": {
    "dashboard": "Dashboard",
    "transactions": "Transactions",
    "categories": "Categories",
    "wallets": "Wallets",
    "reports": "Reports",
    "settings": "Settings",
    "admin": "Administration",
    "logout": "Logout"
  },
  "dashboard": {
    "title": "Dashboard",
    "overview": "Overview",
    "totalBalance": "Total Balance",
    "monthlyIncome": "Monthly Income",
    "monthlyExpenses": "Monthly Expenses",
    "recentTransactions": "Recent Transactions",
    "welcomeMessage": "Welcome to your financial control!"
  },
  "transactions": {
    "title": "Transactions",
    "add": "Add Transaction",
    "edit": "Edit Transaction",
    "delete": "Delete Transaction",
    "description": "Description",
    "amount": "Amount",
    "date": "Date",
    "category": "Category",
    "wallet": "Wallet",
    "type": {
      "income": "Income",
      "expense": "Expense"
    },
    "status": {
      "pending": "Pending",
      "completed": "Completed",
      "canceled": "Canceled"
    }
  },
  "admin": {
    "title": "Administration",
    "access": {
      "denied": "Access denied. Only super administrators can access this area."
    },
    "localization": {
      "title": "Localization Management",
      "add": {
        "title": "Add New Language",
        "button": "Add Language"
      },
      "list": {
        "title": "Configured Languages"
      },
      "code": {
        "label": "Language Code"
      },
      "name": {
        "label": "Language Name"
      },
      "active": {
        "label": "Active",
        "badge": "Active"
      },
      "default": {
        "label": "Default",
        "badge": "Default"
      },
      "import": {
        "button": "Import"
      },
      "selector": {
        "label": "System Language",
        "placeholder": "Select a language"
      }
    }
  },
  "auth": {
    "login": {
      "title": "Login",
      "email": "Email",
      "password": "Password",
      "button": "Login",
      "register": "Don't have an account? Sign up"
    },
    "register": {
      "title": "Register",
      "name": "Name",
      "email": "Email",
      "password": "Password",
      "confirmPassword": "Confirm Password",
      "button": "Register",
      "login": "Already have an account? Sign in"
    }
  },
  "errors": {
    "required": "This field is required",
    "invalidEmail": "Invalid email",
    "passwordMismatch": "Passwords don't match",
    "minLength": "Minimum {min} characters",
    "networkError": "Connection error. Please try again.",
    "serverError": "Internal server error",
    "unauthorized": "Unauthorized",
    "forbidden": "Access denied"
  },
  "success": {
    "saved": "Saved successfully!",
    "created": "Created successfully!",
    "updated": "Updated successfully!",
    "deleted": "Deleted successfully!",
    "imported": "Imported successfully!"
  }
}
```

#### 4.4 Arquivo es-es.json (Español España)
```json
{
  "common": {
    "loading": "Cargando...",
    "save": "Guardar",
    "cancel": "Cancelar",
    "delete": "Eliminar",
    "edit": "Editar",
    "create": "Crear",
    "update": "Actualizar",
    "search": "Buscar",
    "filter": "Filtrar",
    "export": "Exportar",
    "import": "Importar",
    "yes": "Sí",
    "no": "No",
    "close": "Cerrar",
    "back": "Atrás",
    "next": "Siguiente",
    "previous": "Anterior",
    "submit": "Enviar",
    "clear": "Limpiar",
    "reset": "Restablecer"
  },
  "navigation": {
    "dashboard": "Panel",
    "transactions": "Transacciones",
    "categories": "Categorías",
    "wallets": "Carteras",
    "reports": "Informes",
    "settings": "Configuración",
    "admin": "Administración",
    "logout": "Salir"
  },
  "dashboard": {
    "title": "Panel",
    "overview": "Resumen",
    "totalBalance": "Saldo Total",
    "monthlyIncome": "Ingresos Mensuales",
    "monthlyExpenses": "Gastos Mensuales",
    "recentTransactions": "Transacciones Recientes",
    "welcomeMessage": "¡Bienvenido a tu control financiero!"
  },
  "admin": {
    "title": "Administración",
    "access": {
      "denied": "Acceso denegado. Solo los super administradores pueden acceder a esta área."
    },
    "localization": {
      "title": "Gestión de Localización",
      "selector": {
        "label": "Idioma del Sistema",
        "placeholder": "Selecciona un idioma"
      }
    }
  }
}
```

### 5. Migração e Scripts

#### 5.1 Script de Migração (migrate_localization.js)
```javascript
// migrate_localization.js
import { Client } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function migrateLocalization() {
  try {
    await client.connect();
    console.log('🔗 Conectado ao banco de dados');

    // 1. Criar tabela system_localization
    console.log('📋 Criando tabela system_localization...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS system_localization (
        id SERIAL PRIMARY KEY,
        locale_code VARCHAR(10) NOT NULL UNIQUE,
        locale_name VARCHAR(100) NOT NULL,
        is_active BOOLEAN NOT NULL DEFAULT false,
        is_default BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
        created_by INTEGER REFERENCES usuarios(id),
        updated_at TIMESTAMP WITH TIME ZONE,
        updated_by INTEGER REFERENCES usuarios(id),
        
        CONSTRAINT unique_default_locale CHECK (
          (is_default = true AND is_active = true) OR is_default = false
        )
      )
    `);

    // 2. Criar função e trigger para garantir apenas um idioma padrão
    console.log('🔧 Criando trigger para idioma único...');
    await client.query(`
      CREATE OR REPLACE FUNCTION ensure_single_default_locale()
      RETURNS TRIGGER AS $$
      BEGIN
        IF NEW.is_default = true THEN
          UPDATE system_localization 
          SET is_default = false 
          WHERE id != NEW.id AND is_default = true;
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await client.query(`
      DROP TRIGGER IF EXISTS trigger_single_default_locale ON system_localization;
      CREATE TRIGGER trigger_single_default_locale
        BEFORE INSERT OR UPDATE ON system_localization
        FOR EACH ROW
        EXECUTE FUNCTION ensure_single_default_locale();
    `);

    // 3. Criar tabela localization_strings
    console.log('📋 Criando tabela localization_strings...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS localization_strings (
        id SERIAL PRIMARY KEY,
        string_key VARCHAR(255) NOT NULL,
        locale_code VARCHAR(10) NOT NULL,
        string_value TEXT NOT NULL,
        string_context VARCHAR(500),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'),
        updated_at TIMESTAMP WITH TIME ZONE,
        
        FOREIGN KEY (locale_code) REFERENCES system_localization(locale_code) ON DELETE CASCADE,
        UNIQUE(string_key, locale_code)
      )
    `);

    // 4. Criar índices
    console.log('📊 Criando índices...');
    await client.query(`CREATE INDEX IF NOT EXISTS idx_localization_strings_key ON localization_strings(string_key)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_localization_strings_locale ON localization_strings(locale_code)`);

    // 5. Inserir idiomas iniciais
    console.log('🌐 Inserindo idiomas iniciais...');
    await client.query(`
      INSERT INTO system_localization (locale_code, locale_name, is_active, is_default) 
      VALUES 
        ('pt-br', 'Português Brasil', true, true),
        ('en-us', 'English US', false, false),
        ('es-es', 'Español España', false, false)
      ON CONFLICT (locale_code) DO NOTHING
    `);

    // 6. Importar strings do arquivo pt-br.json se existir
    const ptBrPath = path.join(process.cwd(), 'locales', 'pt-br.json');
    if (fs.existsSync(ptBrPath)) {
      console.log('📥 Importando strings pt-br...');
      const ptBrStrings = JSON.parse(fs.readFileSync(ptBrPath, 'utf8'));
      
      const flattenObject = (obj, prefix = '') => {
        let result = {};
        for (const key in obj) {
          const newKey = prefix ? `${prefix}.${key}` : key;
          if (typeof obj[key] === 'object' && obj[key] !== null) {
            Object.assign(result, flattenObject(obj[key], newKey));
          } else {
            result[newKey] = String(obj[key]);
          }
        }
        return result;
      };

      const flatStrings = flattenObject(ptBrStrings);
      
      for (const [key, value] of Object.entries(flatStrings)) {
        await client.query(`
          INSERT INTO localization_strings (string_key, locale_code, string_value)
          VALUES ($1, 'pt-br', $2)
          ON CONFLICT (string_key, locale_code) DO UPDATE SET
            string_value = EXCLUDED.string_value,
            updated_at = CURRENT_TIMESTAMP
        `, [key, value]);
      }
      
      console.log(`✅ Importadas ${Object.keys(flatStrings).length} strings para pt-br`);
    }

    console.log('✅ Migração de localização concluída com sucesso!');
    
  } catch (error) {
    console.error('❌ Erro na migração:', error);
    throw error;
  } finally {
    await client.end();
  }
}

// Executar migração
migrateLocalization().catch(console.error);
```

#### 5.2 Script de Importação (import_locales.js)
```javascript
// import_locales.js
import { Client } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function importLocaleStrings(localeCode) {
  try {
    await client.connect();
    
    const filePath = path.join(process.cwd(), 'locales', `${localeCode}.json`);
    
    if (!fs.existsSync(filePath)) {
      console.error(`❌ Arquivo ${localeCode}.json não encontrado`);
      return;
    }

    console.log(`📥 Importando strings para ${localeCode}...`);
    
    const jsonContent = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    const flattenObject = (obj, prefix = '') => {
      let result = {};
      for (const key in obj) {
        const newKey = prefix ? `${prefix}.${key}` : key;
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          Object.assign(result, flattenObject(obj[key], newKey));
        } else {
          result[newKey] = String(obj[key]);
        }
      }
      return result;
    };

    const flatStrings = flattenObject(jsonContent);
    
    let importedCount = 0;
    for (const [key, value] of Object.entries(flatStrings)) {
      try {
        await client.query(`
          INSERT INTO localization_strings (string_key, locale_code, string_value)
          VALUES ($1, $2, $3)
          ON CONFLICT (string_key, locale_code) DO UPDATE SET
            string_value = EXCLUDED.string_value,
            updated_at = CURRENT_TIMESTAMP
        `, [key, localeCode, value]);
        importedCount++;
      } catch (error) {
        console.warn(`⚠️  Erro ao importar chave ${key}:`, error.message);
      }
    }
    
    console.log(`✅ Importadas ${importedCount} strings para ${localeCode}`);
    
  } catch (error) {
    console.error('❌ Erro na importação:', error);
  } finally {
    await client.end();
  }
}

// Obter locale da linha de comando
const locale = process.argv[2];
if (!locale) {
  console.error('❌ Uso: node import_locales.js <locale-code>');
  console.error('Exemplo: node import_locales.js en-us');
  process.exit(1);
}

importLocaleStrings(locale);
```

### 6. Integração com App Principal

#### 6.1 Atualizar App.tsx
```typescript
// client/src/App.tsx - Adicionar LocalizationProvider
import { LocalizationProvider } from "@/contexts/LocalizationContext";

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <LocalizationProvider>
          <AutoThemeProvider>
            <NotificationsProvider>
              <AnimatePresence mode="wait">
                <Router />
              </AnimatePresence>
              <Toaster />
            </NotificationsProvider>
          </AutoThemeProvider>
        </LocalizationProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
```

#### 6.2 Atualizar utils.ts para suporte a localização
```typescript
// client/src/lib/utils.ts - Adicionar função de formatação de moeda por locale
import { format, parseISO } from "date-fns";
import { ptBR, enUS, es } from "date-fns/locale";

const locales = {
  'pt-br': ptBR,
  'en-us': enUS,
  'es-es': es,
};

export function formatCurrency(value: number, locale: string = 'pt-br'): string {
  const currencyMap = {
    'pt-br': { currency: 'BRL', locale: 'pt-BR' },
    'en-us': { currency: 'USD', locale: 'en-US' },
    'es-es': { currency: 'EUR', locale: 'es-ES' },
  };
  
  const config = currencyMap[locale] || currencyMap['pt-br'];
  
  return new Intl.NumberFormat(config.locale, {
    style: "currency",
    currency: config.currency,
  }).format(value);
}

export function formatDate(date: Date | string, formatStr: string = "dd MMM, yyyy", locale: string = 'pt-br'): string {
  const dateLocale = locales[locale] || locales['pt-br'];
  
  if (typeof date === "string") {
    const dateOnly = date.split('T')[0];
    const [year, month, day] = dateOnly.split('-');
    const localDate = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
    return format(localDate, formatStr, { locale: dateLocale });
  }
  
  return format(date, formatStr, { locale: dateLocale });
}
```

### 7. Variáveis de Ambiente

#### 7.1 Adicionar ao .env
```env
# Localização
DEFAULT_LOCALE=pt-br
SUPPORTED_LOCALES=pt-br,en-us,es-es
LOCALE_FILES_PATH=./locales
```

### 8. Comandos NPM

#### 8.1 Adicionar ao package.json
```json
{
  "scripts": {
    "migrate:localization": "node migrate_localization.js",
    "import:locale": "node import_locales.js",
    "export:locale": "node export_locales.js"
  }
}
```

## Fluxo de Implementação

### Fase 1: Configuração Base
1. **Migração do Banco de Dados**
   - Executar `migrate_localization.js`
   - Verificar criação das tabelas
   - Testar triggers e constraints

2. **Implementação Backend**
   - Adicionar schemas no Drizzle
   - Implementar controllers de localização
   - Adicionar rotas de administração
   - Implementar middleware de localização

### Fase 2: Frontend Base
1. **Context e Hooks**
   - Implementar LocalizationContext
   - Criar hook useTranslation
   - Integrar com App principal

2. **Componentes Admin**
   - Página de administração de idiomas
   - Seletor de idioma para super admin
   - Interface de importação de strings

### Fase 3: Arquivos de Localização
1. **Criação dos JSONs**
   - Arquivo pt-br.json (base)
   - Arquivo en-us.json
   - Arquivo es-es.json

2. **Scripts de Importação**
   - Script de importação automática
   - Validação de chaves obrigatórias
   - Logs de progresso

### Fase 4: Integração Completa
1. **Substituição de Strings**
   - Substituir textos hardcoded por chaves de tradução
   - Implementar formatação de números/datas por locale
   - Testes de interface

2. **Validação e Testes**
   - Testar mudança de idiomas
   - Verificar permissões de super admin
   - Validar fallbacks para chaves não encontradas

## Arquivos que Devem Ser Alterados

### Backend
- `shared/schema.ts` - Adicionar novas tabelas
- `server/controllers/localization.controller.ts` - Novo arquivo
- `server/middleware/localization.middleware.ts` - Novo arquivo
- `server/routes.ts` - Adicionar rotas de localização
- `server/storage.ts` - Métodos de acesso aos dados

### Frontend
- `client/src/contexts/LocalizationContext.tsx` - Novo arquivo
- `client/src/hooks/useTranslation.ts` - Novo arquivo
- `client/src/components/admin/LocaleSelector.tsx` - Novo arquivo
- `client/src/pages/admin/localization.tsx` - Novo arquivo
- `client/src/App.tsx` - Integrar LocalizationProvider
- `client/src/lib/utils.ts` - Adicionar formatação por locale
- Todos os componentes existentes - Substituir strings por traduções

### Arquivos de Configuração
- `locales/pt-br.json` - Novo arquivo
- `locales/en-us.json` - Novo arquivo
- `locales/es-es.json` - Novo arquivo
- `migrate_localization.js` - Novo arquivo
- `import_locales.js` - Novo arquivo
- `package.json` - Adicionar scripts

### Banco de Dados
- Nova tabela: `system_localization`
- Nova tabela: `localization_strings`
- Triggers e funções de validação

## Considerações de Segurança

1. **Acesso Restrito**: Apenas super_admin pode gerenciar idiomas
2. **Validação de Entrada**: Validar códigos ISO 639-1
3. **Sanitização**: Sanitizar strings importadas
4. **Backup**: Backup antes de importar novos idiomas
5. **Logs**: Registrar todas as alterações de localização

## Considerações de Performance

1. **Cache**: Implementar cache para strings de localização
2. **Lazy Loading**: Carregar apenas idioma ativo
3. **CDN**: Considerar CDN para arquivos de localização
4. **Compressão**: Compressão gzip para arquivos JSON grandes

## Manutenção e Expansão

1. **Novos Idiomas**: Processo para adicionar novos idiomas
2. **Atualizações**: Processo para atualizar traduções
3. **Qualidade**: Revisão de traduções por nativos
4. **Automação**: Scripts para detectar chaves não traduzidas
5. **Documentação**: Manter documentação atualizada

Este plano fornece uma implementação completa e robusta de localização para a aplicação, seguindo as melhores práticas e mantendo a segurança através do controle de acesso por super administradores.