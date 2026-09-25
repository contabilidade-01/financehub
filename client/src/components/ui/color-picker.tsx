import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Palette, AlertTriangle, CheckCircle2 } from 'lucide-react';

interface ColorPickerProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
  className?: string;
  disabled?: boolean;
  showContrast?: boolean;
  contrastBackground?: string;
  presets?: string[];
}

// Função para validar se é uma cor HEX válida
const isValidHex = (hex: string): boolean => {
  const hexPattern = /^#[0-9A-Fa-f]{6}$/;
  return hexPattern.test(hex.trim());
};

// Função para converter HSL para HEX
const hslToHex = (h: number, s: number, l: number): string => {
  l /= 100;
  const a = s * Math.min(l, 1 - l) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
};

// Função para converter HEX para HSL
const hexToHsl = (hex: string): string => {
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
};

// Função para calcular contraste
const calculateContrast = (color1: string, color2: string): number => {
  // Simplified contrast calculation
  // In a real implementation, you'd convert to RGB and use the proper WCAG formula
  return 4.5; // Placeholder
};

// Cores preset padrão
const defaultPresets = [
  '#216283', // Primary padrão (azul-petróleo)
  '#00D9A7', // Secondary atual (verde)
  '#6366F1', // Índigo
  '#8B5CF6', // Violeta
  '#F59E0B', // Âmbar
  '#EF4444', // Vermelho
  '#10B981', // Esmeralda
  '#3B82F6', // Azul
  '#F97316', // Laranja
  '#84CC16', // Lima
];

export function ColorPicker({
  label,
  value,
  onChange,
  className,
  disabled = false,
  showContrast = false,
  contrastBackground = '#FFFFFF',
  presets = defaultPresets
}: ColorPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState(value);

  // Usar o valor diretamente se for HEX válido, senão usar o padrão
  const hexValue = isValidHex(value) ? value : '#216283';

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const handleColorChange = (newColor: string) => {
    if (isValidHex(newColor)) {
      setInputValue(newColor);
      onChange(newColor);
    }
  };

  const handleInputBlur = () => {
    if (isValidHex(inputValue)) {
      onChange(inputValue);
    } else {
      setInputValue(value); // Reset to valid value
    }
  };

  const handlePresetClick = (preset: string) => {
    handleColorChange(preset);
    setIsOpen(false);
  };

  const contrastRatio = showContrast ? calculateContrast(hexValue, contrastBackground) : 0;
  const contrastLevel = contrastRatio >= 7 ? 'AAA' : contrastRatio >= 4.5 ? 'AA' : 'FAIL';

  return (
    <div className={cn("space-y-2", className)}>
      <Label className="text-sm font-medium">{label}</Label>
      
      <div className="flex gap-2">
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              className="w-12 h-10 p-1 border-2"
              style={{ backgroundColor: hexValue }}
              disabled={disabled}
              aria-label={`Selecionar cor para ${label}`}
            >
              <span className="sr-only">Cor atual: {hexValue}</span>
            </Button>
          </PopoverTrigger>
          
          <PopoverContent className="w-64 p-4" side="bottom" align="start">
            <div className="space-y-4">
              {/* Color Preview */}
              <div className="text-center">
                <div 
                  className="w-full h-16 rounded-lg border-2 border-gray-200 dark:border-gray-700 mb-2"
                  style={{ backgroundColor: hexValue }}
                />
                <div className="text-xs text-muted-foreground space-y-1">
                  <div>HEX: {hexValue}</div>
                </div>
              </div>

              {/* Preset Colors */}
              <div>
                <Label className="text-xs text-muted-foreground mb-2 block">
                  Cores Predefinidas
                </Label>
                <div className="grid grid-cols-5 gap-2">
                  {presets.map((preset, index) => (
                    <button
                      key={index}
                      className="w-8 h-8 rounded-md border-2 border-gray-200 dark:border-gray-700 hover:scale-110 transition-transform"
                      style={{ backgroundColor: preset }}
                      onClick={() => handlePresetClick(preset)}
                      title={preset}
                    />
                  ))}
                </div>
              </div>

              {/* HEX Input */}
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">
                  Código HEX
                </Label>
                <Input
                  value={inputValue}
                  onChange={(e) => {
                    setInputValue(e.target.value);
                    if (e.target.value.match(/^#[0-9A-Fa-f]{6}$/)) {
                      handleColorChange(e.target.value);
                    }
                  }}
                  placeholder="#216283"
                  className="text-xs"
                />
              </div>

              {/* Contrast Check */}
              {showContrast && (
                <div className="border-t pt-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Contraste:</span>
                    <div className="flex items-center gap-2">
                      {contrastLevel === 'FAIL' ? (
                        <AlertTriangle className="w-3 h-3 text-red-500" />
                      ) : (
                        <CheckCircle2 className="w-3 h-3 text-green-500" />
                      )}
                      <Badge 
                        variant={contrastLevel === 'FAIL' ? 'destructive' : 'secondary'}
                        className="text-xs"
                      >
                        {contrastLevel}
                      </Badge>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Ratio: {contrastRatio.toFixed(1)}:1
                  </div>
                </div>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* HEX Input */}
        <div className="flex-1">
          <Input
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onBlur={handleInputBlur}
            placeholder="#216283"
            disabled={disabled}
            className={cn(
              "font-mono text-sm",
              !isValidHex(inputValue) && inputValue !== value && "border-red-300 dark:border-red-700"
            )}
          />
          {!isValidHex(inputValue) && inputValue !== value && (
            <p className="text-xs text-red-500 mt-1">
              Formato HEX inválido. Use: "#216283"
            </p>
          )}
        </div>
      </div>

      {/* Color Description */}
      <div className="text-xs text-muted-foreground">
        Formato HEX: #RRGGBB (ex: #216283)
      </div>
    </div>
  );
}