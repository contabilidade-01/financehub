import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PjDRE from "@/pages/pj/relatorios/dre";
import PjFluxoCaixa from "@/pages/pj/relatorios/fluxo-caixa";
import FluxoProjetadoView from "@/components/shared/FluxoProjetadoView";

/**
 * Relatórios PJ — abas:
 *  - DRE: resumo do período (leigo-friendly, 6 linhas).
 *  - Fluxo de Caixa: visão gerencial mensal (avançada/CFO), contas × meses.
 *  - Projetado: mesma matriz olhando para a frente, com o que está em aberto.
 */
export default function PjRelatorios({ empresaId }: { empresaId: number }) {
  return (
    <div className="p-4">
      <Tabs defaultValue="dre">
        <TabsList>
          <TabsTrigger value="dre">DRE (resumo)</TabsTrigger>
          <TabsTrigger value="fluxo">Fluxo de Caixa</TabsTrigger>
          <TabsTrigger value="projetado">Fluxo Projetado</TabsTrigger>
        </TabsList>
        <TabsContent value="dre" className="mt-2">
          <PjDRE empresaId={empresaId} />
        </TabsContent>
        <TabsContent value="fluxo" className="mt-2">
          <PjFluxoCaixa empresaId={empresaId} />
        </TabsContent>
        <TabsContent value="projetado" className="mt-2">
          <FluxoProjetadoView
            endpoint={`/api/empresas/${empresaId}/relatorios/fluxo-projetado`}
            titulo="Fluxo de Caixa Projetado"
            subtitulo="Plano de contas da empresa"
            habilitado={!!empresaId}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
