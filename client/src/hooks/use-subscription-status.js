"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.useSubscriptionStatus = useSubscriptionStatus;
const use_auth_1 = require("@/hooks/use-auth");
const MS_DIA = 1000 * 60 * 60 * 24;
const AVISO_VENCIMENTO_DIAS = 7;
function useSubscriptionStatus() {
    const { user } = (0, use_auth_1.useAuth)();
    const isAdmin = () => {
        const tipo = user === null || user === void 0 ? void 0 : user.tipo_usuario;
        return tipo === 'super_admin' || tipo === 'admin';
    };
    const expirationDate = (user === null || user === void 0 ? void 0 : user.data_expiracao_assinatura) || null;
    const daysRemaining = (() => {
        if (!expirationDate)
            return null;
        const ms = new Date(expirationDate).getTime() - Date.now();
        return Math.ceil(ms / MS_DIA);
    })();
    const isAdminUser = isAdmin();
    const isSubscriptionExpired = () => {
        if (!user)
            return false;
        if (isAdminUser)
            return false;
        if (expirationDate) {
            return new Date(expirationDate) <= new Date();
        }
        return true;
    };
    const hasActiveAccess = () => {
        if (!user)
            return false;
        if (isAdminUser)
            return true;
        if (expirationDate) {
            return new Date(expirationDate) > new Date();
        }
        return false;
    };
    const status = String((user === null || user === void 0 ? void 0 : user.status_assinatura) || "");
    const isTrial = status.startsWith("degustacao");
    const showExpiringSoonBanner = !isAdminUser &&
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
