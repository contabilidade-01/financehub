import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  CreditCard,
  Repeat,
  CalendarClock,
  HandCoins,
  Upload,
  Target,
  BarChart3,
  LineChart,
  Banknote,
  Bell,
  Tag,
  Settings,
  DollarSign,
  Receipt,
  Waypoints,
  TrendingUp,
  Shield,
  Users,
  CalendarCheck,
  Search,
  Palette,
  Wrench,
  Flag,
  MessageSquare,
  Bot,
  ShieldCheck,
  Landmark,
  ListChecks,
  ListTree,
  Building2,
  FileUp,
  FileSearch,
  Contact,
  Layers,
  ArrowRightLeft,
  PieChart,
  Database,
  Globe,
  Percent,
  UserCog,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useTranslation } from "@/contexts/LocalizationContext";
import { rotuloModalidade, temErpPj } from "@shared/modalidade";
import { FLAG_IMPORTACAO_EXTRATO_V2, FLAG_INTEGRACAO_CORA } from "@/hooks/use-flag";

export interface NavItem {
  icon: LucideIcon;
  text: string;
  path: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/** Rotas principais do ambiente (PF em "/", PJ em "/p/..."). */
export interface PrimaryRoutes {
  inicio: string;
  lancamentos: string;
  relatorios: string;
}

export function isPathActive(location: string, path: string): boolean {
  if (path === "/") return location === "/";
  return location === path || location.startsWith(path + "/") || location.startsWith(path + "?");
}

/**
 * Menu do usuário logado. PJ vê só o ambiente PJ; PF vê só o PF (sem itens
 * repetidos). Admin ganha a seção de administração.
 */
export function useNavigation() {
  const { user: userData } = useAuth();
  const { t } = useTranslation();

  const isDirectAdmin = userData?.tipo_usuario === "super_admin";
  const shouldShowAdminItems = isDirectAdmin || userData?.tipo_usuario === "admin";
  const isImpersonating = !!(userData && "isImpersonating" in userData && (userData as any).isImpersonating);
  const isPJ = userData?.tipo_pessoa === "juridica";

  const { data: flagsData } = useQuery({
    queryKey: ["minhas-flags"],
    enabled: !!userData && !isDirectAdmin,
    queryFn: async () => {
      const res = await fetch("/api/flags", { credentials: "include" });
      if (!res.ok) return { flags: {} as Record<string, boolean> };
      return res.json();
    },
  });
  const temOrquestrador =
    isDirectAdmin || !!(flagsData?.flags as Record<string, boolean> | undefined)?.orquestrador_deepseek;
  // Importação de extrato v2 (atrás de flag; super admin sempre vê).
  const temImportacaoV2 =
    isDirectAdmin || !!(flagsData?.flags as Record<string, boolean> | undefined)?.[FLAG_IMPORTACAO_EXTRATO_V2];
  // Recebimentos Cora (atrás de flag; super admin sempre vê).
  const temCora =
    isDirectAdmin || !!(flagsData?.flags as Record<string, boolean> | undefined)?.[FLAG_INTEGRACAO_CORA];
  const itemImportarExtrato = (path: string): NavItem[] =>
    temImportacaoV2 ? [{ icon: FileUp, text: "Importar extrato", path }] : [];

  const secoesPF: NavGroup[] = [
    {
      label: t("navigation.sections.main", "PRINCIPAL"),
      items: [
        { icon: LayoutDashboard, text: t("navigation.dashboard", "Dashboard"), path: "/" },
        { icon: ArrowLeftRight, text: t("navigation.transactions", "Transações"), path: "/transactions" },
        { icon: Wallet, text: "Contas", path: "/contas-cartoes" },
        { icon: CreditCard, text: "Cartões de Crédito", path: "/cartoes" },
        { icon: Repeat, text: "Mensalidades", path: "/mensalidades" },
        { icon: CalendarClock, text: "Vencimentos", path: "/contas-pagar" },
        { icon: HandCoins, text: "A Receber", path: "/reembolsos" },
        ...itemImportarExtrato("/importar-extrato"),
        { icon: Upload, text: "Importar Lançamentos", path: "/importar" },
        { icon: Target, text: "Metas e Sonhos", path: "/metas" },
        { icon: BarChart3, text: t("navigation.reports", "Relatórios"), path: "/reports" },
        { icon: LineChart, text: "Fluxo Projetado", path: "/fluxo-projetado" },
        { icon: Banknote, text: "Formas de pagamento", path: "/payment-methods" },
        { icon: Bell, text: t("navigation.reminders", "Lembretes"), path: "/reminders" },
      ],
    },
  ];

  // Menu PJ agrupado. O rótulo do primeiro grupo mostra a modalidade (PJ MEI / PJ ME).
  const secoesPJ: NavGroup[] = [
    {
      label: rotuloModalidade(userData as any).toUpperCase(),
      items: [
        { icon: LayoutDashboard, text: "Dashboard", path: "/p/dashboard" },
        { icon: ArrowLeftRight, text: "Transações", path: "/p/transacoes" },
        { icon: Landmark, text: "Contas bancárias", path: "/p/contas-bancarias" },
        { icon: CreditCard, text: "Cartões e Faturas", path: "/p/faturas" },
        { icon: CalendarClock, text: "Vencimentos", path: "/p/vencimentos" },
        { icon: Repeat, text: "Mensalidades", path: "/p/mensalidades" },
        { icon: HandCoins, text: "Reembolsos a Receber", path: "/p/reembolsos" },
        { icon: ListChecks, text: "Conciliação", path: "/p/conciliacao" },
        { icon: Upload, text: "Importar Lançamentos", path: "/p/importar" },
      ],
    },
    // Gestão (ERP) — só a modalidade PJ ME.
    ...(temErpPj(userData as any)
      ? [{
          label: "GESTÃO",
          items: [
            { icon: HandCoins, text: "Contas a receber", path: "/p/contas-receber" },
            { icon: Receipt, text: "Contas a pagar", path: "/p/contas-pagar" },
            ...(temCora ? [{ icon: Landmark, text: "Recebimentos Cora", path: "/p/recebimentos-cora" }] : []),
            { icon: PieChart, text: "DRE gerencial", path: "/p/dre-gerencial" },
            { icon: Waypoints, text: "Razão e mapa do dinheiro", path: "/p/razao" },
            { icon: TrendingUp, text: "Projeção de caixa", path: "/p/projecoes" },
            { icon: ArrowRightLeft, text: "Transferências", path: "/p/transferencias" },
            ...itemImportarExtrato("/p/importar-extrato"),
          ],
        }]
      : []),
    {
      label: "RELATÓRIOS",
      items: [
        { icon: BarChart3, text: "Relatórios", path: "/p/relatorios" },
        { icon: Target, text: "Metas", path: "/p/metas" },
      ],
    },
    {
      label: "CADASTROS",
      items: [
        { icon: ListTree, text: "Plano de Contas", path: "/p/categorias" },
        ...(temErpPj(userData as any)
          ? [
              { icon: Contact, text: "Clientes e fornecedores", path: "/p/clientes-fornecedores" },
              { icon: Layers, text: "Centros de custo", path: "/p/centros-custo" },
            ]
          : []),
        { icon: Building2, text: "Minhas Empresas", path: "/p/empresas" },
      ],
    },
  ];

  const userGroups: NavGroup[] = [
    ...(isPJ ? secoesPJ : secoesPF),
    {
      label: t("navigation.sections.settings", "CONFIGURAÇÕES"),
      items: [
        // "Categorias" é do PF; no PJ o equivalente é "Plano de Contas".
        ...(!isPJ ? [{ icon: Tag, text: t("navigation.categories", "Categorias"), path: "/categories" }] : []),
        { icon: Settings, text: t("navigation.settings", "Configurações"), path: "/settings" },
      ],
    },
    {
      label: t("navigation.sections.billing", "ASSINATURA"),
      items: [
        { icon: DollarSign, text: t("navigation.billing_settings", "Minha Assinatura"), path: "/billing/settings" },
        { icon: Receipt, text: t("navigation.invoices", "Faturas"), path: "/billing/invoices" },
      ],
    },
  ];

  const orquestradorItem: NavItem = { icon: Bot, text: "Orquestrador (DeepSeek)", path: "/admin/orquestrador" };

  const adminGroups: NavGroup[] = [
    {
      label: t("navigation.sections.admin", "ADMINISTRAÇÃO"),
      items: [
        { icon: Shield, text: t("navigation.admin_dashboard", "Dashboard Admin"), path: "/admin" },
        { icon: Users, text: t("navigation.users", "Usuários"), path: "/admin/users" },
        { icon: CalendarCheck, text: t("navigation.subscriptions", "Assinaturas"), path: "/admin/assinaturas" },
        { icon: Banknote, text: t("navigation.billing", "Pagamentos"), path: "/admin/billing" },
        { icon: Search, text: t("navigation.manage_payments", "Gerenciar Pagamentos"), path: "/admin/payments" },
        { icon: CreditCard, text: t("navigation.payment_settings", "Config. Pagamento"), path: "/admin/payment-settings" },
        { icon: Palette, text: t("navigation.customize", "Personalizar"), path: "/admin/customize" },
        { icon: Wrench, text: t("navigation.maintenance", "Manutenção"), path: "/admin/maintenance" },
        { icon: Flag, text: "Feature flags", path: "/admin/feature-flags" },
        { icon: MessageSquare, text: "Simulador WhatsApp", path: "/admin/simular-whatsapp" },
        { icon: FileSearch, text: "Auditoria da IA", path: "/admin/ia-auditoria" },
        ...(temOrquestrador ? [orquestradorItem] : []),
        { icon: ShieldCheck, text: "Consentimentos LGPD", path: "/admin/lgpd" },
      ],
    },
  ];

  // Console do super admin: só o que é preciso para administrar o sistema,
  // agrupado por área. As telas de finanças pessoais e "Minha Assinatura" não
  // fazem sentido aqui (para ver como o cliente, use "Acessar como" em Usuários).
  // Ao personificar, o usuário da sessão é o cliente e o menu volta a ser o dele.
  const consoleAdmin = isDirectAdmin && !isImpersonating;
  const consoleGroups: NavGroup[] = [
    {
      label: "VISÃO GERAL",
      items: [{ icon: Shield, text: "Painel", path: "/admin" }],
    },
    {
      label: "CLIENTES",
      items: [
        { icon: Users, text: "Usuários", path: "/admin/users" },
        { icon: CalendarCheck, text: "Assinaturas e vencimentos", path: "/admin/assinaturas" },
        { icon: ShieldCheck, text: "Consentimentos LGPD", path: "/admin/lgpd" },
      ],
    },
    {
      label: "COBRANÇA",
      items: [
        { icon: BarChart3, text: "Painel de pagamentos", path: "/admin/billing" },
        { icon: Search, text: "Buscar pagamentos", path: "/admin/payments" },
        { icon: Percent, text: "Asaas, multa e juros", path: "/admin/payment-settings" },
      ],
    },
    {
      label: "WHATSAPP E IA",
      items: [
        { icon: MessageSquare, text: "Simulador WhatsApp", path: "/admin/simular-whatsapp" },
        { icon: FileSearch, text: "Auditoria da IA", path: "/admin/ia-auditoria" },
        orquestradorItem,
      ],
    },
    {
      label: "PRODUTO",
      items: [
        { icon: Flag, text: "Feature flags", path: "/admin/feature-flags" },
        { icon: Palette, text: "Marca e aparência", path: "/admin/customize" },
        { icon: Globe, text: "Idiomas", path: "/admin/language-settings" },
      ],
    },
    {
      label: "SISTEMA",
      items: [
        { icon: Database, text: "Banco de dados e backup", path: "/admin/database" },
        { icon: Wrench, text: "Manutenção", path: "/admin/maintenance" },
      ],
    },
    {
      label: "MINHA CONTA",
      items: [{ icon: UserCog, text: "Perfil e senha", path: "/settings" }],
    },
  ];

  let groups: NavGroup[] = consoleAdmin
    ? consoleGroups
    : shouldShowAdminItems
      ? [...userGroups, ...adminGroups]
      : userGroups;
  if (temOrquestrador && !shouldShowAdminItems) {
    groups = [...groups, { label: "IA", items: [orquestradorItem] }];
  }

  const primary: PrimaryRoutes = consoleAdmin
    ? { inicio: "/admin", lancamentos: "/admin/users", relatorios: "/admin/assinaturas" }
    : isPJ
      ? { inicio: "/p/dashboard", lancamentos: "/p/transacoes", relatorios: "/p/relatorios" }
      : { inicio: "/", lancamentos: "/transactions", relatorios: "/reports" };

  return {
    groups,
    primary,
    isPJ,
    consoleAdmin,
    user: userData,
    showAdminHeader: isDirectAdmin || isImpersonating,
  };
}
