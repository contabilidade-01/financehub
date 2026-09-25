import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { SessaoImportacao } from "./SessaoImportacao";
import { api, dataBr, type Escopo, type Rascunho } from "./api";

/**
 * Importação de extrato bancário (OFX, CSV, Excel) — PF e PJ.
 * A sessão fica salva no servidor: fechar a aba, cair a conexão ou trocar de
 * aparelho não perde nada; o rascunho aparece em "Importações em andamento".
 */
export function ImportacaoExtrato({ escopo, empresaId }: { escopo: Escopo; empresaId?: number | null }) {
  const { toast } = useToast();
  const [sessaoId, setSessaoId] = useState<number | null>(() => {
    const q = new URLSearchParams(window.location.search).get("id");
    return q ? Number(q) : null;
  });
  const [enviando, setEnviando] = useState(false);
  const [arrastando, setArrastando] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Mantém a sessão aberta na URL (voltar/avançar do navegador e recarregar a página funcionam).
  useEffect(() => {
    const url = new URL(window.location.href);
    if (sessaoId) url.searchParams.set("id", String(sessaoId));
    else url.searchParams.delete("id");
    window.history.replaceState(null, "", url.toString());
  }, [sessaoId]);

  const filtroEscopo = `escopo=${escopo}${empresaId ? `&empresa_id=${empresaId}` : ""}`;
  const { data: rascunhos = [], refetch } = useQuery<Rascunho[]>({
    queryKey: ["/api/importacoes", "rascunho", escopo, empresaId],
    queryFn: () => api(`/api/importacoes?status=rascunho&${filtroEscopo}`),
    enabled: !sessaoId,
  });
  const { data: concluidas = [] } = useQuery<(Rascunho & { concluido_em: string; resultado: any })[]>({
    queryKey: ["/api/importacoes", "concluida", escopo, empresaId],
    queryFn: () => api(`/api/importacoes?status=concluida&${filtroEscopo}`),
    enabled: !sessaoId,
  });

  const enviar = useCallback(async (arquivo: File | undefined) => {
    if (!arquivo) return;
    if (arquivo.size > 10 * 1024 * 1024) {
      toast({ title: "Arquivo maior que 10 MB", variant: "destructive" });
      return;
    }
    const form = new FormData();
    form.append("arquivo", arquivo);
    form.append("escopo", escopo);
    if (empresaId) form.append("empresa_id", String(empresaId));
    setEnviando(true);
    try {
      const r = await api<{ id: number; ja_importado_em: string | null; conta_reconhecida: boolean }>("/api/importacoes", { method: "POST", form });
      if (r.ja_importado_em) {
        toast({ title: "Este arquivo já foi importado antes", description: `Em ${new Date(r.ja_importado_em).toLocaleDateString("pt-BR")}. Os lançamentos repetidos aparecem como “Já importado”.` });
      } else if (r.conta_reconhecida) {
        toast({ title: "Conta bancária reconhecida pelo arquivo" });
      }
      setSessaoId(r.id);
    } catch (e: any) {
      toast({ title: "Não foi possível ler o arquivo", description: e?.message, variant: "destructive" });
    } finally {
      setEnviando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }, [escopo, empresaId, toast]);

  if (sessaoId) {
    return <SessaoImportacao id={sessaoId} onVoltar={() => { setSessaoId(null); refetch(); }} />;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Importar extrato bancário</CardTitle>
          <CardDescription>
            OFX (recomendado), CSV ou Excel exportado do internet banking. Você revisa e classifica antes de qualquer lançamento
            entrar no financeiro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label
            onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastando(false); void enviar(e.dataTransfer.files?.[0]); }}
            className={cn(
              "relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center transition-colors",
              arrastando ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40",
              enviando && "pointer-events-none opacity-60",
            )}
          >
            {enviando ? <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /> : <Upload className="h-8 w-8 text-muted-foreground" />}
            <span className="text-sm font-medium">{enviando ? "Lendo arquivo…" : "Arraste o arquivo aqui ou clique para escolher"}</span>
            <span className="text-xs text-muted-foreground">.ofx, .csv, .xlsx ou .xls — até 10 MB</span>
            <input
              ref={inputRef}
              type="file"
              accept=".ofx,.qfx,.csv,.txt,.xlsx,.xls,.xlsm,.ods"
              className="sr-only"
              onChange={(e) => void enviar(e.target.files?.[0])}
            />
          </label>
        </CardContent>
      </Card>

      {rascunhos.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Importações em andamento</CardTitle>
            <CardDescription>Salvas automaticamente. Continue de onde parou.</CardDescription>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {rascunhos.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSessaoId(r.id)}
                className="flex w-full items-center gap-3 px-6 py-3 text-left hover:bg-muted/40"
              >
                <FileSpreadsheet className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{r.arquivo_nome}</div>
                  <div className="text-xs text-muted-foreground">
                    {r.total_linhas} lançamento(s){r.conta_nome ? ` · ${r.conta_nome}` : " · conta não definida"}
                    {r.sem_categoria > 0 && ` · ${r.sem_categoria} sem categoria`}
                    {" · "}editado em {new Date(r.atualizado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}
                  </div>
                </div>
                <span className="text-sm text-primary">Continuar</span>
              </button>
            ))}
          </CardContent>
        </Card>
      )}

      {concluidas.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Últimas importações</CardTitle>
          </CardHeader>
          <CardContent className="divide-y p-0">
            {concluidas.slice(0, 10).map((r) => (
              <button key={r.id} type="button" onClick={() => setSessaoId(r.id)} className="flex w-full items-center gap-3 px-6 py-3 text-left hover:bg-muted/40">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{r.arquivo_nome}</div>
                  <div className="text-xs text-muted-foreground">
                    {dataBr(r.concluido_em)}{r.conta_nome ? ` · ${r.conta_nome}` : ""}
                    {r.resultado && ` · ${r.resultado.criados} criado(s), ${r.resultado.conciliados} conciliado(s)`}
                  </div>
                </div>
              </button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
