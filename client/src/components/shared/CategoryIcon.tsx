import {
  Home,
  Car,
  UtensilsCrossed,
  HeartPulse,
  GraduationCap,
  Gamepad2,
  Shirt,
  Wrench,
  Wallet,
  Briefcase,
  TrendingUp,
  Gift,
  Undo2,
  PlusCircle,
  MinusCircle,
  Tag,
  ShoppingBag,
  ShoppingCart,
  Building2,
  Receipt,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Ícone de categoria. O campo `icone` da categoria pode ser:
 *  - um emoji (dados antigos / criados pelo usuário) → renderizado como texto;
 *  - uma chave do seletor de ícones (home, car, food...) → ícone lucide equivalente;
 *  - qualquer outra coisa → ícone genérico (etiqueta).
 */
const ICONES: Record<string, LucideIcon> = {
  home: Home,
  car: Car,
  food: UtensilsCrossed,
  health: HeartPulse,
  school: GraduationCap,
  entertainment: Gamepad2,
  clothing: Shirt,
  services: Wrench,
  salary: Wallet,
  freelance: Briefcase,
  investments: TrendingUp,
  gift: Gift,
  refund: Undo2,
  "misc-income": PlusCircle,
  "misc-expense": MinusCircle,
  tag: Tag,
  "price-tag-3": Tag,
  "shopping-bag": ShoppingBag,
  "shopping-cart": ShoppingCart,
  briefcase: Briefcase,
  building: Building2,
  "building-2": Building2,
  receipt: Receipt,
};

function isEmoji(value: string): boolean {
  // Qualquer caractere fora do ASCII básico é tratado como emoji/símbolo digitado.
  return /[^\u0000-\u007f]/.test(value);
}

interface CategoryIconProps {
  icon?: string | null;
  className?: string;
}

export function CategoryIcon({ icon, className }: CategoryIconProps) {
  const value = (icon || "").trim();
  if (value && isEmoji(value)) {
    return (
      <span className={cn("leading-none", className)} aria-hidden="true">
        {value}
      </span>
    );
  }
  const key = value.replace(/^ri-/, "").replace(/-(line|fill)$/, "");
  const Icon = ICONES[key] || Tag;
  return <Icon className={cn("h-4 w-4", className)} aria-hidden="true" />;
}

export default CategoryIcon;
