import { TitulosPage } from "./titulos";

/** Contas a pagar: títulos de despesa (mesma tela e regras de Contas a receber). */
export default function ContasPagarPage({ empresaId }: { empresaId: number }) {
  return <TitulosPage empresaId={empresaId} tipo="Despesa" />;
}
