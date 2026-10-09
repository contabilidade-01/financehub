/**
 * Plano que vale para um usuário — regra ÚNICA usada no checkout, na renovação,
 * na sincronização com o Asaas e no reajuste em lote quando o admin muda preço.
 *
 *  1. Planos da modalidade (PF / PJ MEI / PJ ME) via filtrarPlanosPorTipo;
 *     padrão = o mais barato (a lista vem ordenada por preço).
 *  2. plano_forcado_id (ex.: PJ + Consultoria) vence, se ativo e do mesmo tipo.
 */
import { filtrarPlanosPorTipo } from "../storage";

type PlanoBase = { id: number; planCode: string; active?: boolean | null; tipoPessoa?: string | null; portePj?: string | null };
type UsuarioPlano = { id?: number; tipo_pessoa?: string | null; porte_pj?: string | null; plano_forcado_id?: number | null };

export function resolverPlanoDoUsuario<T extends PlanoBase>(user: UsuarioPlano | any, plans: T[]): T | undefined {
  const tipoPessoa = user?.tipo_pessoa as string | null | undefined;
  const candidatos = filtrarPlanosPorTipo(plans, tipoPessoa, user?.porte_pj);
  let plan = candidatos[0];
  const forcadoId = user?.plano_forcado_id;
  if (forcadoId) {
    const forcado = plans.find((p) => p.id === Number(forcadoId) && p.active !== false);
    if (forcado && (forcado.tipoPessoa === (tipoPessoa || "fisica") || forcado.tipoPessoa == null)) {
      plan = forcado;
    } else {
      console.warn(`[Assinatura] plano_forcado_id=${forcadoId} inválido para user=${user?.id}; usando padrão.`);
    }
  }
  return plan;
}
