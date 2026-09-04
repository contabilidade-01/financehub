import { useAuth } from "@/hooks/use-auth";

const MS_DIA = 1000 * 60 * 60 * 24;
const AVISO_VENCIMENTO_DIAS = 7;

export function useSubscriptionStatus() {
  const { user } = useAuth();

  const isAdmin = (): boolean => {
    const tipo = (user as any)?.tipo_usuario;
    return tipo === 'super_admin' || tipo === 'admin';
  };

  const expirationDate = user?.data_expiracao_assinatura || null;

  const daysRemaining = ((): number | null => {
    if (!expirationDate) return null;
    const ms = new Date(expirationDate).getTime() - Date.now();
    return Math.ceil(ms / MS_DIA);
  })();

  const isAdminUser = isAdmin();

  const isSubscriptionExpired = (): boolean => {
    if (!user) return false;
    if (isAdminUser) return false;
    if (expirationDate) {
      return new Date(expirationDate) <= new Date();
    }
    return true;
  };

  const hasActiveAccess = (): boolean => {
    if (!user) return false;
    if (isAdminUser) return true;
    if (expirationDate) {
      return new Date(expirationDate) > new Date();
    }
    return false;
  };

  const status = String((user as any)?.status_assinatura || "");
  const isTrial = status.startsWith("degustacao");
  const showExpiringSoonBanner =
    !isAdminUser &&
    hasActiveAccess() &&
    daysRemaining != null &&
    daysRemaining >= 0 &&
    daysRemaining <= AVISO_VENCIMENTO_DIAS;

  return {
    user,
    isAdmin: isAdminUser,
    isSubscriptionExpired: isSubscriptionExpired(),
    hasActiveAccess: hasActiveAccess(),
    expirationDate,
    daysRemaining,
    isTrial,
    showExpiringSoonBanner,
  };
}
