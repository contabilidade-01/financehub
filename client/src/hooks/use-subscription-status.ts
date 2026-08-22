import { useAuth } from "@/hooks/use-auth";

export function useSubscriptionStatus() {
  const { user } = useAuth();

  const isAdmin = (): boolean => {
    const tipo = (user as any)?.tipo_usuario;
    return tipo === 'super_admin' || tipo === 'admin';
  };

  const isSubscriptionExpired = (): boolean => {
    if (!user) return false;
    if (isAdmin()) return false; // admin nunca expira

    // Fonte única: expirado = sem data futura de expiração.
    if (user.data_expiracao_assinatura) {
      return new Date(user.data_expiracao_assinatura) <= new Date();
    }
    // Sem data de expiração = sem plano → tratar como expirado (mostra a tela de assinar).
    return true;
  };

  const hasActiveAccess = (): boolean => {
    if (!user) return false;
    if (isAdmin()) return true; // admin sempre tem acesso

    // Acesso = tem data de expiração no futuro.
    if (user.data_expiracao_assinatura) {
      return new Date(user.data_expiracao_assinatura) > new Date();
    }
    // Sem data = sem acesso.
    return false;
  };

  return {
    user,
    isSubscriptionExpired: isSubscriptionExpired(),
    hasActiveAccess: hasActiveAccess(),
    expirationDate: user?.data_expiracao_assinatura
  };
}