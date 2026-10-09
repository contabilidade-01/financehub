import { TitulosPage } from "./titulos";

/** Contas a receber: títulos de receita (mesma tela e regras de Contas a pagar). */
export default function ContasReceberPage({ empresaId }: { empresaId: number }) {
  return <TitulosPage empresaId={empresaId} tipo="Receita" />;
}
