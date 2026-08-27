import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { LayoutDashboard, CreditCard, TrendingUp, DollarSign, Users, Bell, Settings } from 'lucide-react';
import { ThemeConfig } from '@/utils/theme-manager';

// Função para converter HEX para HSL (para CSS variables)
function hexToHsl(hex: string): string {
  if (!hex.startsWith('#') || hex.length !== 7) return '0 0% 0%';
  
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

interface ThemePreviewProps {
  theme: ThemeConfig;
  mode: 'light' | 'dark';
  className?: string;
  title?: string;
}

export function ThemePreview({ theme, mode, className, title }: ThemePreviewProps) {
  // Gerar CSS variables a partir do tema (converter HEX para HSL)
  const cssVars = {
    '--background': hexToHsl(theme.background),
    '--foreground': hexToHsl(theme.foreground),
    '--primary': hexToHsl(theme.primary),
    '--primary-foreground': hexToHsl(theme.primaryForeground),
    '--secondary': hexToHsl(theme.secondary),
    '--secondary-foreground': hexToHsl(theme.secondaryForeground),
    '--muted': hexToHsl(theme.muted),
    '--muted-foreground': hexToHsl(theme.mutedForeground),
    '--accent': hexToHsl(theme.accent),
    '--accent-foreground': hexToHsl(theme.accentForeground),
    '--border': hexToHsl(theme.border),
    '--card': hexToHsl(theme.card),
    '--card-foreground': hexToHsl(theme.cardForeground),
    '--destructive': hexToHsl(theme.destructive),
    '--destructive-foreground': hexToHsl(theme.destructiveForeground),
    '--input': hexToHsl(theme.border),
    '--ring': hexToHsl(theme.primary),
  } as React.CSSProperties;

  return (
    <div 
      className={cn(
        "border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-4 bg-gray-50 dark:bg-gray-900/50",
        className
      )}
      style={cssVars}
    >
      {title && (
        <div className="mb-3 text-center">
          <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {title}
          </h3>
        </div>
      )}
      
      {/* Preview Container */}
      <div className="bg-background text-foreground rounded-lg overflow-hidden shadow-lg border border-border min-h-[400px]">
        {/* Header */}
        <div className="bg-card border-b border-border px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <LayoutDashboard className="w-5 h-5 text-primary" />
              <span className="font-semibold text-card-foreground">Magen</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge className="bg-primary text-primary-foreground">Pro</Badge>
              <Button variant="ghost" size="sm">
                <Bell className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm">
                <Settings className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Stats Cards */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-card-foreground flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-primary" />
                  Receitas
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold text-card-foreground">R$ 15.450</div>
                <div className="text-xs text-muted-foreground">+12% este mês</div>
              </CardContent>
            </Card>

            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-card-foreground flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-secondary" />
                  Gastos
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-lg font-bold text-card-foreground">R$ 8.720</div>
                <div className="text-xs text-muted-foreground">-5% este mês</div>
              </CardContent>
            </Card>
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            <Button className="w-full bg-primary text-primary-foreground hover:bg-primary/90">
              <CreditCard className="w-4 h-4 mr-2" />
              Nova Transação
            </Button>
            
            <Button variant="secondary" className="w-full bg-secondary text-secondary-foreground hover:bg-secondary/90">
              <Users className="w-4 h-4 mr-2" />
              Gerenciar Usuários
            </Button>

            <Button variant="outline" className="w-full border-border text-foreground hover:bg-accent hover:text-accent-foreground">
              Ver Relatórios
            </Button>
          </div>

          {/* Sample List */}
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-foreground">Transações Recentes</h4>
            <div className="space-y-1">
              <div className="flex justify-between items-center p-2 bg-muted rounded text-sm">
                <span className="text-muted-foreground">Compra no mercado</span>
                <span className="text-destructive">-R$ 127,50</span>
              </div>
              <div className="flex justify-between items-center p-2 bg-muted rounded text-sm">
                <span className="text-muted-foreground">Salário</span>
                <span className="text-green-600">+R$ 4.500,00</span>
              </div>
              <div className="flex justify-between items-center p-2 bg-muted rounded text-sm">
                <span className="text-muted-foreground">Conta de luz</span>
                <span className="text-destructive">-R$ 89,30</span>
              </div>
            </div>
          </div>

          {/* Status Indicators */}
          <div className="flex gap-2 flex-wrap">
            <Badge className="bg-primary text-primary-foreground">Ativo</Badge>
            <Badge variant="secondary" className="bg-secondary text-secondary-foreground">Pendente</Badge>
            <Badge variant="outline" className="border-border text-foreground">Processando</Badge>
            <Badge variant="destructive" className="bg-destructive text-destructive-foreground">Erro</Badge>
          </div>
        </div>
      </div>

      {/* Theme Info */}
      <div className="mt-3 text-xs text-gray-500 dark:text-gray-400 text-center space-y-1">
        <div>Modo: <span className="font-medium capitalize">{mode}</span></div>
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div>Primary: {theme.primary}</div>
          <div>Secondary: {theme.secondary}</div>
        </div>
      </div>
    </div>
  );
}

// Temas padrão para exemplo (formato HEX)
export const defaultLightTheme: ThemeConfig = {
  background: '#FAFAFA',
  foreground: '#0F0F0F',
  primary: '#FF64B3',
  primaryForeground: '#FAFAFA',
  secondary: '#00D9A7',
  secondaryForeground: '#171717',
  muted: '#F5F5F5',
  mutedForeground: '#737373',
  accent: '#F5F5F5',
  accentForeground: '#262626',
  border: '#E5E5E5',
  card: '#FFFFFF',
  cardForeground: '#0F0F0F',
  destructive: '#EF4444',
  destructiveForeground: '#FAFAFA',
};

export const defaultDarkTheme: ThemeConfig = {
  background: '#0F0F0F',
  foreground: '#FAFAFA',
  primary: '#FF64B3',
  primaryForeground: '#FAFAFA',
  secondary: '#00D9A7',
  secondaryForeground: '#171717',
  muted: '#262626',
  mutedForeground: '#A3A3A3',
  accent: '#262626',
  accentForeground: '#FAFAFA',
  border: '#262626',
  card: '#0F0F0F',
  cardForeground: '#FAFAFA',
  destructive: '#7F1D1D',
  destructiveForeground: '#FAFAFA',
};