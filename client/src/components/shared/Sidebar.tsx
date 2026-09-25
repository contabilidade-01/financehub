import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { LayoutDashboard, LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { VersionDisplay } from "@/components/shared/VersionDisplay";
import { ThemeToggleSimple } from "@/components/theme-toggle-simple";
import { useTheme } from "next-themes";
import { useTranslation } from "@/contexts/LocalizationContext";
import { useSystemConfig } from "@/contexts/SystemConfigContext";
import { cn, getInitials } from "@/lib/utils";
import { isPathActive, useNavigation, type NavGroup } from "@/components/shared/navigation";

/** Logo do sistema (upload do admin em /api/logo) com ícone de reserva. */
function BrandLogo({ size = "md" }: { size?: "sm" | "md" }) {
  const { resolvedTheme } = useTheme();
  const { config: systemConfig } = useSystemConfig();
  const nomeSistema = systemConfig.system_name || "Khesef";
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const theme = resolvedTheme === "dark" ? "dark" : "light";
    let cancelled = false;
    const load = () => {
      const url = `/api/logo?theme=${theme}`;
      const img = new window.Image();
      img.onload = () => {
        if (!cancelled) {
          setLogoUrl(url);
          setChecked(true);
        }
      };
      img.onerror = () => {
        if (!cancelled) {
          setLogoUrl(null);
          setChecked(true);
        }
      };
      img.src = url;
    };
    load();
    window.addEventListener("logo-updated", load);
    return () => {
      cancelled = true;
      window.removeEventListener("logo-updated", load);
    };
  }, [resolvedTheme]);

  const box = size === "sm" ? "h-8 w-8" : "h-9 w-9";
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <div className={cn("relative shrink-0 overflow-hidden rounded-md", box)}>
        {logoUrl ? (
          <img src={logoUrl} alt="" className={cn("object-contain", box)} />
        ) : checked ? (
          <span className={cn("flex items-center justify-center rounded-md bg-primary text-primary-foreground", box)}>
            <LayoutDashboard className="h-4 w-4" />
          </span>
        ) : null}
      </div>
      <span className="truncate text-base font-semibold tracking-tight">{nomeSistema}</span>
    </div>
  );
}

function NavList({
  groups,
  activePath,
  onNavigate,
}: {
  groups: NavGroup[];
  activePath: string | null;
  onNavigate: (path: string) => void;
}) {
  return (
    <nav aria-label="Menu principal" className="space-y-5">
      {groups.map((group) => (
        <div key={group.label}>
          <p className="mb-1.5 px-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {group.label}
          </p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = item.path === activePath;
              const Icon = item.icon;
              return (
                <li key={item.path}>
                  <a
                    href={item.path}
                    onClick={(e) => {
                      if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                      e.preventDefault();
                      onNavigate(item.path);
                    }}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "flex h-9 items-center gap-3 rounded-md px-3 text-sm transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "bg-primary/10 font-medium text-primary"
                        : "text-foreground/80 hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground")} />
                    <span className="truncate">{item.text}</span>
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function UserBlock({ onLogoutClick }: { onLogoutClick: () => void }) {
  const { user } = useNavigation();
  const { t } = useTranslation();
  const nome = user?.nome || "Usuário";
  return (
    <div className="border-t p-3">
      <div className="flex items-center gap-3 rounded-md px-1 py-1">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground">
          {getInitials(nome) || "U"}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{nome}</p>
          <p className="truncate text-xs text-muted-foreground">{user?.email || ""}</p>
        </div>
        <ThemeToggleSimple />
      </div>
      <Button variant="ghost" size="sm" className="mt-1 w-full justify-start text-muted-foreground" onClick={onLogoutClick}>
        <LogOut className="h-4 w-4" />
        {t("navigation.logout", "Sair")}
      </Button>
      <div className="pt-1 text-center">
        <VersionDisplay />
      </div>
    </div>
  );
}

interface SidebarProps {
  /** Drawer do mobile — controlado pelo layout (também aberto pela barra inferior). */
  mobileOpen?: boolean;
  onMobileOpenChange?: (open: boolean) => void;
}

function Sidebar({ mobileOpen, onMobileOpenChange }: SidebarProps) {
  const [location, navigate] = useLocation();
  const { t } = useTranslation();
  const { groups, showAdminHeader } = useNavigation();
  const [internalOpen, setInternalOpen] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);

  const isOpen = mobileOpen ?? internalOpen;
  const setOpen = onMobileOpenChange ?? setInternalOpen;

  // Item ativo = rota mais específica que casa com a URL (evita dois itens marcados).
  const activePath = useMemo(() => {
    let best: string | null = null;
    for (const g of groups) {
      for (const it of g.items) {
        if (isPathActive(location, it.path) && (!best || it.path.length > best.length)) best = it.path;
      }
    }
    return best;
  }, [groups, location]);

  const go = (path: string) => {
    navigate(path);
    setOpen(false);
  };

  const logout = async () => {
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });
      if (response.ok) {
        window.location.href = "/";
      }
    } catch (error) {
      console.error("Erro ao fazer logout:", error);
    }
  };

  const askLogout = () => {
    setOpen(false);
    setConfirmLogout(true);
  };

  return (
    <>
      {/* Mobile: cabeçalho fixo e compacto */}
      <header
        className={cn(
          "sticky z-40 flex h-14 items-center justify-between border-b bg-background px-4 lg:hidden",
          showAdminHeader ? "top-[var(--admin-header-h)]" : "top-0",
        )}
      >
        <a
          href="/"
          onClick={(e) => {
            e.preventDefault();
            go(groups[0]?.items[0]?.path || "/");
          }}
          className="min-w-0"
        >
          <BrandLogo size="sm" />
        </a>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Abrir menu"
          data-testid="mobile-menu-button"
          onClick={() => setOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
      </header>

      {/* Mobile: menu lateral (Radix Sheet: foco preso, Esc e rolagem travada) */}
      <Sheet open={isOpen} onOpenChange={setOpen}>
        <SheetContent side="left" className="flex w-[85vw] max-w-xs flex-col gap-0 p-0 pl-safe">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Navegação principal</SheetDescription>
          <div className="flex h-14 items-center border-b px-4 pt-safe">
            <BrandLogo size="sm" />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 py-4">
            <NavList groups={groups} activePath={activePath} onNavigate={go} />
          </div>
          <div className="pb-safe">
            <UserBlock onLogoutClick={askLogout} />
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop: barra lateral fixa */}
      <aside
        className={cn(
          "fixed bottom-0 left-0 z-30 hidden w-64 flex-col border-r bg-sidebar text-sidebar-foreground lg:flex",
          showAdminHeader ? "top-[var(--admin-header-h)]" : "top-0",
        )}
      >
        <div className="flex h-16 shrink-0 items-center px-5">
          <BrandLogo />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          <NavList groups={groups} activePath={activePath} onNavigate={go} />
        </div>
        <UserBlock onLogoutClick={askLogout} />
      </aside>

      <AlertDialog open={confirmLogout} onOpenChange={setConfirmLogout}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair do sistema?</AlertDialogTitle>
            <AlertDialogDescription>
              Você precisará entrar novamente para acessar sua conta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={logout}>{t("navigation.logout", "Sair")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default Sidebar;
