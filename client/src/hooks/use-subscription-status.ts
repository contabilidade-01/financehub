import { useAuth } from "@/hooks/use-auth";
import { diasAteSP } from "../../../shared/datas-sp";

const AVISO_VENCIMENTO_DIAS = 7;

export function useSubscriptionStatus() {
  const { user } = useAuth();

  const isAdmin = (): boolean => {
    const tipo = (user as any)?.tipo_usuario;
    return tipo === 'super_admin' || tipo === 'admin';
  };

  const expirationDate = user?.data_expiracao_assinatura || null;

  // Dias de calendário em São Paulo: vencer hoje às 20h é "hoje", não "amanhã".
  // (O corte de acesso abaixo continua pelo horário exato.)
  const daysRemaining = diasAteSP(expirationDate);

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
