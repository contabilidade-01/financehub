import FluxoProjetadoView from "@/components/shared/FluxoProjetadoView";

/**
 * Fluxo de caixa projetado PF — matriz das categorias do usuário × meses.
 */
export default function FluxoProjetadoPF() {
  return (
    <div className="p-4 md:p-6">
      <FluxoProjetadoView
        endpoint="/api/fluxo-caixa/projetado"
        titulo="Fluxo de Caixa Projetado"
        subtitulo="Suas categorias, mês a mês"
      />
    </div>
  );
}
