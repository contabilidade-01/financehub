/**
 * Mesma regra do login: assinatura vencida NÃO bloqueia (o cliente precisa
 * entrar para pagar sozinho); só bloqueia conta desligada pelo admin
 * (ativo=false) que ainda não venceu.
 */
export function contaBloqueadaPeloAdmin(user: any): boolean {
  if (!user) return true;
  const expiradoPorData = !!(user.data_expiracao_assinatura && new Date(user.data_expiracao_assinatura) <= new Date());
  const status = String(user.status_assinatura || "");
  const expiradoParaPagar = expiradoPorData || status.startsWith("degustacao_expirada") || status === "inativa";
  return !expiradoParaPagar && user.ativo !== true;
}
