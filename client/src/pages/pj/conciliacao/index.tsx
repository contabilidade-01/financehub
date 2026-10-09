import { useState } from "react";
import { Link } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ImportacaoExtrato } from "@/components/importacao/ImportacaoExtrato";
import Importar from "./Importar";
import { FLAG_IMPORTACAO_EXTRATO_V2, useFlag } from "@/hooks/use-flag";
import Bancada from "./Bancada";
import { Upload, BarChart3 } from "lucide-react";

export default function ConciliacaoPage({ empresaId }: { empresaId: number }) {
  const [activeTab, setActiveTab] = useState("importar");
  // Nova importação (sessão salva + classificação + conciliação) atrás da flag.
  const { ativa: importacaoV2 } = useFlag(FLAG_IMPORTACAO_EXTRATO_V2);

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Conciliação bancária</h1>
        <p className="text-sm text-muted-foreground">
          Importe o extrato do banco, classifique e concilie com os lançamentos já existentes.
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
            <span>Importar extrato</span>
          </TabsTrigger>
          <TabsTrigger value="bancada" className="gap-2">
            <BarChart3 className="h-4 w-4" />
            <span>Movimentos anteriores</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="importar" className="mt-6">
          {importacaoV2 ? (
            <ImportacaoExtrato escopo="pj" empresaId={empresaId} />
          ) : (
            <Importar empresaId={empresaId} onIrParaBancada={() => setActiveTab("bancada")} />
          )}
        </TabsContent>

        <TabsContent value="bancada" className="mt-6">
          <Bancada empresaId={empresaId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
