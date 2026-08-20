import { useQuery, useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Upload, AlertCircle, CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

interface ContaBancaria {
  id: number;
  banco: string;
  agencia: string | null;
  numero: string | null;
}

interface ImportResult {
  importacao_id: number;
  total: number;
  conciliados: number;
  a_classificar: number;
  duplicados: number;
  saldo_final_informado: number | null;
}

export default function Importar({ empresaId }: { empresaId: number }) {
  const [selectedContaId, setSelectedContaId] = useState<string>("");
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const { data: contas = [] } = useQuery<ContaBancaria[]>({
    queryKey: [`/api/empresas/${empresaId}/contas-bancarias`],
    queryFn: () => apiRequest(`/api/empresas/${empresaId}/contas-bancarias`),
  });

  const importMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch(`/api/empresas/${empresaId}/conciliacao/importar`, {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!response.ok) throw new Error(await response.text());
      return response.json();
    },
    onSuccess: (data) => {
      setResult(data);
      setFile(null);
      setSelectedContaId("");
    },
  });

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    const files = e.dataTransfer.files;
    if (files && files[0]) {
      setFile(files[0]);
    }
  };

  const handleImport = async () => {
    if (!file || !selectedContaId) {
      alert("Selecione uma conta e um arquivo OFX");
      return;
    }
    const formData = new FormData();
    formData.append("arquivo", file);
    formData.append("conta_bancaria_id", selectedContaId);
    importMutation.mutate(formData);
  };

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Importar Extrato</h2>

      {!result ? (
        <Card className="p-6 space-y-4">
          <div>
            <Label htmlFor="conta">Selecionar Conta *</Label>
            <Select value={selectedContaId} onValueChange={setSelectedContaId}>
              <SelectTrigger id="conta">
                <SelectValue placeholder="Escolha uma conta bancária..." />
              </SelectTrigger>
              <SelectContent>
                {contas.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.banco} {c.agencia && `/ ${c.agencia}`} {c.numero && `/ ${c.numero}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {contas.length === 0 && (
              <p className="text-sm text-destructive mt-1">Nenhuma conta bancária encontrada. Crie uma primeira.</p>
            )}
          </div>

          {/* Drag & Drop */}
          <div
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition ${
              dragActive
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/20 hover:border-primary/50"
            }`}
          >
            <Upload className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
            <p className="font-medium">
              Arraste um arquivo OFX ou <span className="text-primary">clique para selecionar</span>
            </p>
            <p className="text-sm text-muted-foreground mt-1">Apenas arquivos .ofx (OFX 1.x ou 2.x)</p>
            <input
              type="file"
              accept=".ofx"
              onChange={(e) => e.target.files && setFile(e.target.files[0])}
              className="hidden"
              id="file-input"
            />
            <label htmlFor="file-input" className="absolute inset-0 cursor-pointer" />
          </div>

          {file && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
              <p className="font-medium text-blue-900">Arquivo selecionado:</p>
              <p className="text-blue-700">{file.name}</p>
            </div>
          )}

          <Button
            onClick={handleImport}
            disabled={!file || !selectedContaId || importMutation.isPending}
            className="w-full"
          >
            {importMutation.isPending ? "Processando..." : "Importar Extrato"}
          </Button>

          {importMutation.isError && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
              <p className="font-medium">Erro ao importar</p>
              <p>{(importMutation.error as any)?.message || "Tente novamente"}</p>
            </div>
          )}
        </Card>
      ) : (
        <Card className="p-6 space-y-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-lg">Importação concluída!</p>
              <p className="text-sm text-muted-foreground">
                {result.total} movimento(s) processado(s)
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-muted/50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold">{result.total}</p>
              <p className="text-xs text-muted-foreground mt-1">Total</p>
            </div>
            <div className="bg-green-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-green-700">{result.conciliados}</p>
              <p className="text-xs text-green-600 mt-1">Conciliados</p>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-yellow-700">{result.a_classificar}</p>
              <p className="text-xs text-yellow-600 mt-1">A Classificar</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-4 text-center">
              <p className="text-2xl font-bold text-blue-700">{result.duplicados}</p>
              <p className="text-xs text-blue-600 mt-1">Duplicados</p>
            </div>
          </div>

          {result.saldo_final_informado && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-700">
                <span className="font-medium">Saldo informado no extrato:</span> R$ {result.saldo_final_informado.toFixed(2)}
              </p>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => {
                setResult(null);
                setFile(null);
              }}
            >
              Importar Outro
            </Button>
            <Button className="flex-1" onClick={() => window.location.hash = "#/p/conciliacao/bancada"}>
              Ir para Bancada
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
