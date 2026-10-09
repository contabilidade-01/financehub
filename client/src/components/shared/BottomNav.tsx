import { useLocation } from "wouter";
import { LayoutDashboard, ArrowLeftRight, Plus, BarChart3, Menu, Users, CalendarCheck, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { isPathActive, useNavigation } from "@/components/shared/navigation";
import { pedirNovoLancamento } from "@/lib/novo-lancamento";

interface BottomNavProps {
  onOpenMenu: () => void;
  menuOpen?: boolean;
}

/**
 * Barra de navegação inferior (somente < lg): Início, Lançamentos, + Novo,
 * Relatórios e Menu. Respeita o ambiente PF (/) ou PJ (/p/...).
 */
export function BottomNav({ onOpenMenu, menuOpen }: BottomNavProps) {
  const [location, navigate] = useLocation();
  const { primary, consoleAdmin } = useNavigation();

  const itemClass = (active: boolean) =>
    cn(
      "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-md py-1.5 text-[11px] font-medium leading-tight",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active ? "text-primary" : "text-muted-foreground hover:text-foreground",
    );

  // Console do super admin: atalhos de administração (sem "+ Novo lançamento").
  if (consoleAdmin) {
    const atalhos = [
      { icon: LayoutDashboard, texto: "Painel", path: "/admin", ativo: location === "/admin" },
      { icon: Users, texto: "Usuários", path: "/admin/users", ativo: isPathActive(location, "/admin/users") },
      { icon: CalendarCheck, texto: "Assinaturas", path: "/admin/assinaturas", ativo: isPathActive(location, "/admin/assinaturas") },
      { icon: Flag, texto: "Flags", path: "/admin/feature-flags", ativo: isPathActive(location, "/admin/feature-flags") },
    ];
    return (
      <nav aria-label="Navegação rápida" className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-safe lg:hidden">
        <div className="mx-auto flex h-[var(--mobile-nav-h)] max-w-md items-stretch px-2">
          {atalhos.map((a) => (
            <button key={a.path} type="button" className={itemClass(a.ativo)} aria-current={a.ativo ? "page" : undefined} onClick={() => navigate(a.path)}>
              <a.icon className="h-5 w-5" aria-hidden="true" />
              <span>{a.texto}</span>
            </button>
          ))}
          <button type="button" className={itemClass(!!menuOpen)} onClick={onOpenMenu} aria-haspopup="dialog" aria-expanded={!!menuOpen}>
            <Menu className="h-5 w-5" aria-hidden="true" />
            <span>Menu</span>
          </button>
        </div>
      </nav>
    );
  }

  const inicioAtivo = isPathActive(location, primary.inicio);
  const lancAtivo = isPathActive(location, primary.lancamentos);
  const relAtivo = isPathActive(location, primary.relatorios);

  return (
    <nav
      aria-label="Navegação rápida"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-safe lg:hidden"
    >
      <div className="mx-auto flex h-[var(--mobile-nav-h)] max-w-md items-stretch px-2">
        <button type="button" className={itemClass(inicioAtivo)} aria-current={inicioAtivo ? "page" : undefined} onClick={() => navigate(primary.inicio)}>
          <LayoutDashboard className="h-5 w-5" aria-hidden="true" />
          <span>Início</span>
        </button>
        <button type="button" className={itemClass(lancAtivo)} aria-current={lancAtivo ? "page" : undefined} onClick={() => navigate(primary.lancamentos)}>
          <ArrowLeftRight className="h-5 w-5" aria-hidden="true" />
          <span>Lançamentos</span>
        </button>
        <div className="flex flex-1 items-center justify-center">
          <button
            type="button"
            onClick={() => pedirNovoLancamento(navigate, primary.lancamentos, location)}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-md hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="Novo lançamento"
            data-testid="bottom-nav-novo"
          >
            <Plus className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <button type="button" className={itemClass(relAtivo)} aria-current={relAtivo ? "page" : undefined} onClick={() => navigate(primary.relatorios)}>
          <BarChart3 className="h-5 w-5" aria-hidden="true" />
          <span>Relatórios</span>
        </button>
        <button type="button" className={itemClass(!!menuOpen)} onClick={onOpenMenu} aria-haspopup="dialog" aria-expanded={!!menuOpen}>
          <Menu className="h-5 w-5" aria-hidden="true" />
          <span>Menu</span>
        </button>
      </div>
    </nav>
  );
}

export default BottomNav;
