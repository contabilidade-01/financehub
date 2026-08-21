import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import PjDRE from "@/pages/pj/relatorios/dre";
import PjFluxoCaixa from "@/pages/pj/relatorios/fluxo-caixa";

/**
 * Relatórios PJ — abas:
 *  - DRE: resumo do período (leigo-friendly, 6 linhas).
 *  - Fluxo de Caixa: visão gerencial mensal (avançada/CFO), contas × meses.
 */
export default function PjRelatorios({ empresaId }: { empresaId: number }) {
  return (
    <div className="p-4">
      <Tabs defaultValue="dre">
        <TabsList>
          <TabsTrigger value="dre">DRE (resumo)</TabsTrigger>
          <TabsTrigger value="fluxo">Fluxo de Caixa</TabsTrigger>
        </TabsList>
        <TabsContent value="dre" className="mt-2">
          <PjDRE empresaId={empresaId} />
        </TabsContent>
        <TabsContent value="fluxo" className="mt-2">
          <PjFluxoCaixa empresaId={empresaId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
