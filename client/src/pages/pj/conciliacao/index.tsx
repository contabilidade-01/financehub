import { useState } from "react";
import { Link } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import Importar from "./Importar";
import Bancada from "./Bancada";
import { Upload, BarChart3 } from "lucide-react";

export default function ConciliacaoPage({ empresaId }: { empresaId: number }) {
  const [activeTab, setActiveTab] = useState("importar");

  return (
    <div className="space-y-4 p-4 md:p-6 max-w-6xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold">Conciliação bancária</h1>
        <p className="text-sm text-muted-foreground">
          Importe o extrato do banco e case com os lançamentos
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          As contas bancárias agora ficam em{" "}
          <Link href="/p/contas-bancarias" className="underline underline-offset-2 hover:text-foreground">
            Contas bancárias
          </Link>
          .
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="importar" className="gap-2">
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Importar</span>
          </TabsTrigger>
          <TabsTrigger value="bancada" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            <span className="hidden sm:inline">Bancada</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="importar" className="mt-6">
          <Importar empresaId={empresaId} onIrParaBancada={() => setActiveTab("bancada")} />
        </TabsContent>

        <TabsContent value="bancada" className="mt-6">
          <Bancada empresaId={empresaId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
