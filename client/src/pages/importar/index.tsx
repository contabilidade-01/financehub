import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Upload, CreditCard, Tag, FileWarning, CheckCircle2, AlertCircle } from "lucide-react";

interface PreviewResult {
  total: number;
  novasContasAPagar: number;
  novosReembolsos: number;
  totalReembolsavel: number;
  duplicadas: number;
  categoriasNovas: string[];
  formasNovas: { nome: string; cartao: boolean; diaVencimento: number | null }[];
  cartoesIncompletos: string[];
  erros: { linha: number; motivo: string; conteudo: string }[];
  amostra: { vencimento: string; descricao: string; categoria: string; forma: string; valor: number; reembolsavel: boolean }[];
}

interface CommitResult {
  contasCriadas: number;
  reembolsosCriados: number;
  duplicadasPuladas: number;
  categoriasCriadas: number;
  formasCriadas: number;
  cartoesCriados: number;
  erros: { linha: number; motivo: string; conteudo: string }[];
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default function ImportarLancamentos() {
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

  const analisar = async () => {
    if (!file) return;
    setLoading(true); setErro(null); setResult(null);
    try { setPreview(await enviar("/api/importacao/lancamentos/preview")); }
    catch (e: any) { setErro(e.message); }
    finally { setLoading(false); }
  };

  const confirmar = async () => {
    if (!file) return;
    setLoading(true); setErro(null);
    try { setResult(await enviar("/api/importacao/lancamentos")); setPreview(null); }
    catch (e: any) { setErro(e.message); }
    finally { setLoading(false); }
  };

  const reset = () => { setFile(null); setPreview(null); setResult(null); setErro(null); };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation();
    setDragActive(e.type === "dragenter" || e.type === "dragover");
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragActive(false);
    if (e.dataTransfer.files?.[0]) { setFile(e.dataTransfer.files[0]); setPreview(null); setResult(null); }
  };

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">📥 Importar Lançamentos</h1>
        <p className="text-muted-foreground">
          Suba sua planilha de controle (.xlsx ou .csv). Despesas comuns viram <b>contas a pagar</b>;
          linhas com “reembolso pendente” vão para <b>A Receber</b> e continuam compondo a fatura do cartão.
        </p>
        <p className="text-sm text-amber-700 dark:text-amber-300 mt-2">
          Na coluna <b>forma</b>, use o <b>nome do cartão</b> (ex.: <code>CC Nubank PF</code>, <code>CC Mercado Pago</code>, <code>CC Inter PJ · Venc. 25</code>).
          Evite só “Cartão de Crédito” — isso é genérico e não cria o cartão certo.
        </p>
        <a
          href="/modelo-lancamentos.csv"
          download="modelo-lancamentos.csv"
          className="inline-block text-sm text-primary underline mt-1 mr-4"
        >
          Baixar planilha modelo
        </a>
        <a
          href="/lancamentos-pf-exemplo.xlsx"
          download="lancamentos-pf-exemplo.xlsx"
          className="inline-block text-sm text-primary underline mt-1"
        >
          Baixar exemplo com cartões CC …
        </a>
      </div>

      {/* Resultado final */}
      {result ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-green-700">
              <CheckCircle2 className="h-6 w-6" /> Importação concluída!
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Stat n={result.contasCriadas} label="Contas a pagar" tone="green" />
              <Stat n={result.reembolsosCriados} label="A receber" tone="blue" />
              <Stat n={result.cartoesCriados} label="Cartões criados" tone="blue" />
              <Stat n={result.categoriasCriadas} label="Categorias novas" tone="amber" />
              <Stat n={result.duplicadasPuladas} label="Duplicadas (puladas)" tone="muted" />
            </div>
            {result.erros.length > 0 && (
              <p className="text-sm text-muted-foreground">{result.erros.length} linha(s) ignorada(s) por erro.</p>
            )}
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={reset}>Importar outra</Button>
              <Button className="flex-1" onClick={() => (window.location.href = result.reembolsosCriados ? "/reembolsos" : "/contas-pagar")}>
                {result.reembolsosCriados ? "Ver A Receber" : "Ver Contas a Pagar"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Upload */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <div
                onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                className={`relative border-2 border-dashed rounded-lg p-8 text-center transition ${
                  dragActive ? "border-primary bg-primary/5" : "border-muted-foreground/20 hover:border-primary/50"
                }`}
              >
                <Upload className="h-10 w-10 mx-auto mb-2 text-muted-foreground" />
                <p className="font-medium">Arraste a planilha ou <span className="text-primary">clique para selecionar</span></p>
                <p className="text-sm text-muted-foreground mt-1">.xlsx ou .csv — colunas: data/vencimento, descrição, categoria, forma, valor</p>
                <input type="file" accept=".csv,.xlsx,.xls" id="file-input" className="hidden"
                  onChange={(e) => { if (e.target.files?.[0]) { setFile(e.target.files[0]); setPreview(null); setResult(null); } }} />
                <label htmlFor="file-input" className="absolute inset-0 cursor-pointer" />
              </div>

              {file && (
                <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3 text-sm">
                  <span className="font-medium truncate">{file.name}</span>
                  <Button size="sm" onClick={analisar} disabled={loading}>
                    {loading && !preview ? "Analisando..." : "Analisar"}
                  </Button>
                </div>
              )}

              {erro && (
                <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-3 text-sm text-red-700 dark:text-red-300">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" /> <span>{erro}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pré-visualização */}
          {preview && (
            <Card>
              <CardHeader>
                <CardTitle>Pré-visualização</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  <Stat n={preview.novasContasAPagar} label="Contas a pagar" tone="green" />
                  <Stat n={preview.novosReembolsos} label="A receber" tone="blue" />
                  <Stat n={preview.formasNovas.length} label="Formas/cartões novos" tone="blue" />
                  <Stat n={preview.categoriasNovas.length} label="Categorias novas" tone="amber" />
                  <Stat n={preview.duplicadas} label="Duplicadas (pular)" tone="muted" />
                </div>

                {preview.novosReembolsos > 0 && (
                  <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-3 text-sm text-blue-800 dark:text-blue-300">
                    <CreditCard className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>
                      {preview.novosReembolsos} lançamento(s), total de {fmt(preview.totalReembolsavel)}, ficarão na fatura do cartão e em A Receber, sem afetar seu fluxo de caixa.
                    </span>
                  </div>
                )}

                {preview.formasNovas.length > 0 && (
                  <Bloco icon={<CreditCard className="h-4 w-4" />} titulo="Formas e cartões que serão criados">
                    {preview.formasNovas.map((f) => (
                      <Badge key={f.nome} variant="secondary" className="mr-1 mb-1">
                        {f.cartao ? "💳 " : ""}{f.nome}{f.diaVencimento ? ` · venc. ${f.diaVencimento}` : ""}
                      </Badge>
                    ))}
                  </Bloco>
                )}

                {preview.formasNovas.some((f) => /cartao[_]?credito|cart[aã]o de cr[eé]dito/i.test(f.nome)) &&
                  !preview.formasNovas.some((f) => f.cartao && /^CC\b/i.test(f.nome)) && (
                  <div className="flex items-start gap-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-3 text-sm text-red-800 dark:text-red-300">
                    <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>
                      A planilha só traz forma genérica (<b>cartao_credito</b> / Cartão de Crédito).
                      Para criar Nubank, Mercado Pago, Inter etc., a coluna <b>forma</b> precisa ter o nome do cartão
                      (ex.: <code>CC Nubank PF</code>). Sem isso o sistema não consegue separar os cartões.
                    </span>
                  </div>
                )}

                {preview.categoriasNovas.length > 0 && (
                  <Bloco icon={<Tag className="h-4 w-4" />} titulo="Categorias que serão criadas">
                    {preview.categoriasNovas.map((c) => (
                      <Badge key={c} variant="outline" className="mr-1 mb-1">{c}</Badge>
                    ))}
                  </Bloco>
                )}

                {preview.cartoesIncompletos.length > 0 && (
                  <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-3 text-sm text-amber-800 dark:text-amber-300">
                    <FileWarning className="h-4 w-4 mt-0.5 flex-shrink-0" />
                    <span>Cartões sem limite/fechamento (só vencimento): {preview.cartoesIncompletos.join(", ")}. Dá pra completar depois em Formas de Pagamento.</span>
                  </div>
                )}

                {preview.erros.length > 0 && (
                  <div className="text-sm text-red-700 dark:text-red-300">
                    <p className="font-medium">{preview.erros.length} linha(s) com erro (serão ignoradas):</p>
                    <ul className="list-disc ml-5 mt-1">
                      {preview.erros.slice(0, 8).map((e, i) => (
                        <li key={i}>Linha {e.linha}: {e.motivo} {e.conteudo ? `("${e.conteudo}")` : ""}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Amostra */}
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-muted-foreground text-left">
                      <tr><th className="p-2">Vencimento</th><th className="p-2">Descrição</th><th className="p-2">Categoria</th><th className="p-2">Forma</th><th className="p-2 text-right">Valor</th></tr>
                    </thead>
                    <tbody>
                      {preview.amostra.map((l, i) => (
                        <tr key={i} className="border-t">
                          <td className="p-2 whitespace-nowrap">{new Date(l.vencimento + "T00:00:00").toLocaleDateString("pt-BR")}</td>
                          <td className="p-2">
                            {l.descricao}
                            {l.reembolsavel && <Badge variant="secondary" className="ml-2 text-[10px]">A receber</Badge>}
                          </td>
                          <td className="p-2">{l.categoria}</td>
                          <td className="p-2">{l.forma}</td>
                          <td className="p-2 text-right whitespace-nowrap">{fmt(l.valor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.total > preview.amostra.length && (
                    <p className="text-xs text-muted-foreground mt-2">Mostrando {preview.amostra.length} de {preview.total} lançamentos.</p>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={reset}>Cancelar</Button>
                  <Button className="flex-1" onClick={confirmar} disabled={loading || (preview.novasContasAPagar + preview.novosReembolsos) === 0}>
                    {loading ? "Importando..." : `Confirmar importação (${preview.novasContasAPagar + preview.novosReembolsos})`}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ n, label, tone }: { n: number; label: string; tone: "green" | "blue" | "amber" | "muted" }) {
  const cls = {
    green: "bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300",
    blue: "bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300",
    amber: "bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300",
    muted: "bg-muted/50 text-foreground",
  }[tone];
  return (
    <div className={`rounded-lg p-4 text-center ${cls}`}>
      <p className="text-2xl font-bold">{n}</p>
      <p className="text-xs mt-1 opacity-80">{label}</p>
    </div>
  );
}

function Bloco({ icon, titulo, children }: { icon: React.ReactNode; titulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="flex items-center gap-2 text-sm font-medium mb-2">{icon} {titulo}</p>
      <div>{children}</div>
    </div>
  );
}
