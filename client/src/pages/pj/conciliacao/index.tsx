import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ContasBancarias from "./ContasBancarias";
import Importar from "./Importar";
import Bancada from "./Bancada";
import { CreditCard, Upload, BarChart3 } from "lucide-react";

export default function ConciliacaoPage({ empresaId }: { empresaId: number }) {
  const [activeTab, setActiveTab] = useState("contas");

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-6xl mx-auto">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="contas" className="gap-2">
            <CreditCard className="h-4 w-4" />
            <span className="hidden sm:inline">Contas</span>
          </TabsTrigger>
          <TabsTrigger value="importar" className="gap-2">
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Importar</span>
          </TabsTrigger>
          <TabsTrigger value="bancada" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Bancada</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contas" className="mt-6">
          <ContasBancarias empresaId={empresaId} />
        </TabsContent>

        <TabsContent value="importar" className="mt-6">
          <Importar empresaId={empresaId} />
        </TabsContent>

        <TabsContent value="bancada" className="mt-6">
          <Bancada empresaId={empresaId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
