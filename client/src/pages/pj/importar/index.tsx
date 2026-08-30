import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, CreditCard, Tag, CheckCircle2, AlertCircle, HandCoins } from "lucide-react";

interface PreviewResult {
  total: number;
  contasAPagar: number;
  reembolsosPessoais: number;
  totalReembolsos: number;
  duplicadas: number;
  categoriasNovas: string[];
  formasNovas: { nome: string; cartao: boolean; diaVencimento: number | null }[];
  erros: { linha: number; motivo: string; conteudo: string }[];
  amostra: { vencimento: string; descricao: string; categoria: string; forma: string; valor: number; reembolsoPessoal: boolean }[];
}

interface CommitResult {
  contasCriadas: number;
  reembolsosCriados: number;
  duplicadasPuladas: number;
  categoriasCriadas: number;
  cartoesCriados: number;
  erros: { linha: number; motivo: string; conteudo: string }[];
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ImportarLancamentosPj({ empresaId }: { empresaId: number }) {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const enviar = async (rota: string): Promise<any> => {
    const fd = new FormData();
    fd.append("arquivo", file!);
    const resp = await fetch(rota, { method: "POST", credentials: "include", body: fd });
    if (!resp.ok) {
      let msg = "Falha ao processar o arquivo.";
      try { msg = (await resp.json()).error || msg; } catch { /* texto */ }
      throw new Error(msg);
    }
    return resp.json();
  };

  const base = `/api/empresas/${empresaId}/importacao/lancamentos`;
  const analisar = async () => {
    if (!file) return;
    setLoading(true); setErro(null); setResult(null);
    try { setPreview(await enviar(`${base}/preview`)); }
    catch (e: any) { setErro(e.message); }
    finally { setLoading(false); }
  };
  const confirmar = async () => {
    if (!file) return;
    setLoading(true); setErro(null);
    try { setResult(await enviar(base)); setPreview(null); }
    catch (e: any) { setErro(e.message); }
    finally { setLoading(false); }
  };
  const reset = () => { setFile(null); setPreview(null); setResult(null); setErro(null); };

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">Importar lançamentos PJ</h1>
        <p className="text-muted-foreground">
          Planilha do fluxo da empresa (Data, Descrição, Categoria, Forma, Valor).
          Despesas em aberto viram contas a pagar. O grupo <b>Reembolsos a Pagar — Pessoal</b> vai para uma tela à parte.
        </p>
        <p className="text-sm text-amber-700 dark:text-amber-300 mt-2">
          Na coluna forma, use o nome real do cartão (ex.: <code>CC Inter PJ · Venc. 25</code>), não só “Cartão de Crédito”.
        </p>
        <a href="/modelo-lancamentos-pj.csv" download="modelo-lancamentos-pj.csv" className="inline-block text-sm text-primary underline mt-1">
          Baixar planilha modelo PJ
        </a>
      </div>

      {result ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-6 w-6" /> Importação concluída
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat n={result.contasCriadas} label="Contas a pagar" />
              <Stat n={result.reembolsosCriados} label="Reembolsos à pessoa" />
              <Stat n={result.cartoesCriados} label="Cartões criados" />
              <Stat n={result.duplicadasPuladas} label="Duplicadas (puladas)" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={reset}>Importar outra</Button>
              <Button className="flex-1" onClick={() => (window.location.href = result.reembolsosCriados ? "/p/reembolsos" : "/p/transacoes")}>
                {result.reembolsosCriados ? "Ver reembolsos a pagar" : "Ver transações"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card
          className={`border-dashed ${dragActive ? "border-primary" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files?.[0]) { setFile(e.dataTransfer.files[0]); setPreview(null); } }}
        >
          <CardContent className="p-6 space-y-4">
            <label className="flex flex-col items-center justify-center gap-2 cursor-pointer py-8">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm">{file ? file.name : "Arraste o .xlsx/.csv ou clique para escolher"}</span>
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); }} />
            </label>
            {erro && <p className="text-sm text-red-600 flex items-center gap-2"><AlertCircle className="h-4 w-4" />{erro}</p>}
            <Button onClick={analisar} disabled={!file || loading} className="w-full">{loading ? "Analisando…" : "Pré-visualizar"}</Button>
          </CardContent>
        </Card>
      )}

      {preview && (
        <Card>
          <CardHeader><CardTitle>Pré-visualização</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat n={preview.contasAPagar} label="Contas a pagar" />
              <Stat n={preview.reembolsosPessoais} label="Reembolsos à pessoa" />
              <Stat n={preview.categoriasNovas.length} label="Contas novas" />
              <Stat n={preview.duplicadas} label="Duplicadas (pular)" />
            </div>
            {preview.reembolsosPessoais > 0 && (
              <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-3 text-sm">
                <HandCoins className="h-4 w-4 mt-0.5" />
                <span>
                  {preview.reembolsosPessoais} grupo(s) de reembolso à pessoa, {fmt(preview.totalReembolsos)}.
                  Ficam em <b>Reembolsos a Pagar</b>, separados das despesas operacionais do dia a dia.
                </span>
              </div>
            )}
            {preview.formasNovas.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1 flex items-center gap-1"><CreditCard className="h-4 w-4" /> Formas/cartões</p>
                {preview.formasNovas.map((f) => (
                  <Badge key={f.nome} variant="secondary" className="mr-1 mb-1">{f.cartao ? "💳 " : ""}{f.nome}</Badge>
                ))}
              </div>
            )}
            {preview.categoriasNovas.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1 flex items-center gap-1"><Tag className="h-4 w-4" /> Contas que serão criadas</p>
                {preview.categoriasNovas.map((c) => <Badge key={c} variant="outline" className="mr-1 mb-1">{c}</Badge>)}
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-muted-foreground text-left">
                  <th className="p-2">Vencimento</th><th className="p-2">Descrição</th><th className="p-2">Categoria</th><th className="p-2">Forma</th><th className="p-2 text-right">Valor</th>
                </tr></thead>
                <tbody>
                  {preview.amostra.map((l, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2 whitespace-nowrap">{l.vencimento}</td>
                      <td className="p-2">{l.descricao}{l.reembolsoPessoal && <Badge className="ml-2 text-[10px]" variant="secondary">A pagar à pessoa</Badge>}</td>
                      <td className="p-2">{l.categoria}</td>
                      <td className="p-2">{l.forma}</td>
                      <td className="p-2 text-right font-numeric">{fmt(l.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button onClick={confirmar} disabled={loading} className="w-full">{loading ? "Importando…" : "Confirmar importação"}</Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-xl border px-3 py-2">
      <p className="text-xl font-numeric font-semibold">{n}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
