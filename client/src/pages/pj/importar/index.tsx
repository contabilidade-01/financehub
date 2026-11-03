import { useEffect, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, CreditCard, Tag, CheckCircle2, AlertCircle, HandCoins, Users, Columns3 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { temErpPj } from "@shared/modalidade";

type Campo = "data" | "valor" | "entrada" | "saida" | "descricao" | "contato" | "categoria" | "forma";
type Mapa = Record<Campo, number>;
type TipoImport = "auto" | "Despesa" | "Receita";

/** Campos do sistema que a pessoa liga às colunas da planilha (* = obrigatório). */
const CAMPOS: { k: Campo; r: string; ajuda?: string }[] = [
  { k: "data", r: "Vencimento / data de pagamento ou recebimento *" },
  { k: "valor", r: "Valor *", ajuda: "Ou use as colunas Entrada e Saída abaixo" },
  { k: "descricao", r: "Descrição" },
  { k: "contato", r: "Cliente ou fornecedor" },
  { k: "categoria", r: "Categoria (plano de contas)" },
  { k: "forma", r: "Forma de pagamento" },
  { k: "entrada", r: "Entrada (valor a receber)" },
  { k: "saida", r: "Saída (valor a pagar)" },
];

interface PreviewResult {
  total: number;
  contasAPagar: number;
  contasAReceber?: number;
  totalAPagar?: number;
  totalAReceber?: number;
  contatosNovos?: string[];
  colunas?: string[];
  amostraBruta?: string[][];
  mapa?: Mapa;
  tipo?: TipoImport;
  reembolsosPessoais: number;
  totalReembolsos: number;
  duplicadas: number;
  categoriasNovas: string[];
  formasNovas: { nome: string; cartao: boolean; diaVencimento: number | null }[];
  erros: { linha: number; motivo: string; conteudo: string }[];
  amostra: { vencimento: string; descricao: string; categoria: string; forma: string; valor: number; reembolsoPessoal: boolean; tipo?: "Despesa" | "Receita"; contato?: string }[];
}

interface CommitResult {
  contasCriadas: number;
  contasAPagarCriadas?: number;
  contasAReceberCriadas?: number;
  contatosCriados?: number;
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
  const { user } = useAuth() as { user?: any };
  const erp = temErpPj(user);
  // ?tipo=Receita (vindo de Contas a receber) já abre com "tudo a receber".
  const [tipo, setTipo] = useState<TipoImport>(() => {
    const t = new URLSearchParams(window.location.search).get("tipo");
    return t === "Receita" || t === "Despesa" ? t : "auto";
  });
  // null = colunas reconhecidas automaticamente; depois de mexer, vale o escolhido.
  const [mapa, setMapa] = useState<Mapa | null>(null);
  const primeiro = useRef(true);

  const enviar = async (rota: string, opts: { mapa?: Mapa | null; tipo?: TipoImport } = {}): Promise<any> => {
    const fd = new FormData();
    fd.append("arquivo", file!);
    const t = opts.tipo ?? tipo;
    const m = opts.mapa !== undefined ? opts.mapa : mapa;
    fd.append("tipo", t);
    if (m) fd.append("mapa", JSON.stringify(m));
    const resp = await fetch(rota, { method: "POST", credentials: "include", body: fd });
    if (!resp.ok) {
      let msg = "Falha ao processar o arquivo.";
      try { msg = (await resp.json()).error || msg; } catch { /* texto */ }
      throw new Error(msg);
    }
    return resp.json();
  };

  const base = `/api/empresas/${empresaId}/importacao/lancamentos`;
  const analisar = async (opts: { mapa?: Mapa | null; tipo?: TipoImport } = {}) => {
    if (!file) return;
    setLoading(true); setErro(null); setResult(null);
    try { setPreview(await enviar(`${base}/preview`, opts)); }
    catch (e: any) { setErro(e.message); }
    finally { setLoading(false); }
  };
  // Trocar o tipo ou uma coluna refaz a pré-visualização na hora.
  useEffect(() => {
    if (primeiro.current) { primeiro.current = false; return; }
    if (file && preview) void analisar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, mapa]);
  const trocarColuna = (campo: Campo, v: string) => {
    const atual = mapa ?? preview?.mapa;
    if (!atual) return;
    setMapa({ ...atual, [campo]: Number(v) });
  };
  const confirmar = async () => {
    if (!file) return;
    setLoading(true); setErro(null);
    try { setResult(await enviar(base)); setPreview(null); }
    catch (e: any) { setErro(e.message); }
    finally { setLoading(false); }
  };
  const reset = () => { setFile(null); setPreview(null); setResult(null); setErro(null); setMapa(null); };
  const escolherArquivo = (f: File | null) => { setFile(f); setPreview(null); setMapa(null); };

  return (
    <div className="container mx-auto p-6 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">Importar contas a pagar e a receber</h1>
        <p className="text-muted-foreground">
          Qualquer planilha (.xlsx, .xls ou .csv): depois de enviar, você confere qual coluna é a data, o valor, o cliente ou fornecedor etc.
          Tudo entra em aberto: despesas viram contas a pagar e receitas viram contas a receber. O grupo de reembolsos pessoais vai para <b>Reembolsos a Receber</b>.
        </p>
        <p className="text-sm text-amber-700 dark:text-amber-300 mt-2">
          Na coluna forma, use o nome real do cartão (ex.: <code>CC Inter PJ · Venc. 25</code>), não só “Cartão de Crédito”.
        </p>
        <a href="/modelo-lancamentos-pj.csv" download="modelo-lancamentos-pj.csv" className="inline-block text-sm text-primary underline mt-1 mr-4">
          Modelo de contas a pagar
        </a>
        <a href="/modelo-contas-receber-pj.csv" download="modelo-contas-receber-pj.csv" className="inline-block text-sm text-primary underline mt-1 mr-4">
          Modelo de contas a receber
        </a>
        <a href="/lancamentos-pj-exemplo.xlsx" download="lancamentos-pj-exemplo.xlsx" className="inline-block text-sm text-primary underline mt-1">
          Baixar exemplo preenchido (87 lançamentos)
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
              <Stat n={result.contasAPagarCriadas ?? result.contasCriadas} label="Contas a pagar" />
              {result.contasAReceberCriadas !== undefined && <Stat n={result.contasAReceberCriadas} label="Contas a receber" />}
              {!!result.contatosCriados && <Stat n={result.contatosCriados} label="Clientes/fornecedores novos" />}
              <Stat n={result.reembolsosCriados} label="Reembolsos à pessoa" />
              <Stat n={result.cartoesCriados} label="Cartões criados" />
              <Stat n={result.duplicadasPuladas} label="Duplicadas (puladas)" />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" className="flex-1" onClick={reset}>Importar outra</Button>
              {result.reembolsosCriados > 0 && (
                <Button className="flex-1" variant="secondary" onClick={() => (window.location.href = "/p/reembolsos")}>
                  Ver reembolsos
                </Button>
              )}
              {erp && !!result.contasAReceberCriadas && (
                <Button className="flex-1" variant="secondary" onClick={() => (window.location.href = "/p/contas-receber")}>
                  Ver contas a receber
                </Button>
              )}
              {result.contasCriadas > 0 && (
                <Button className="flex-1" onClick={() => (window.location.href = erp ? "/p/contas-pagar" : "/p/vencimentos")}>
                  {erp ? "Ver contas a pagar" : "Ver vencimentos"}
                </Button>
              )}
              {result.contasCriadas === 0 && result.reembolsosCriados === 0 && (
                <Button className="flex-1" onClick={() => (window.location.href = "/p/transacoes")}>
                  Ver transações
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card
          className={`border-dashed ${dragActive ? "border-primary" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
          onDragLeave={() => setDragActive(false)}
          onDrop={(e) => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files?.[0]) escolherArquivo(e.dataTransfer.files[0]); }}
        >
          <CardContent className="p-6 space-y-4">
            <label className="flex flex-col items-center justify-center gap-2 cursor-pointer py-8">
              <Upload className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm">{file ? file.name : "Arraste o .xlsx/.csv ou clique para escolher"}</span>
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => escolherArquivo(e.target.files?.[0] ?? null)} />
            </label>
            <div className="space-y-1">
              <Label>O que a planilha traz</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as TipoImport)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Pagar e receber juntos (valor negativo ou coluna Saída = a pagar)</SelectItem>
                  <SelectItem value="Despesa">Só contas a pagar</SelectItem>
                  <SelectItem value="Receita">Só contas a receber</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {erro && <p className="text-sm text-red-600 flex items-center gap-2"><AlertCircle className="h-4 w-4" />{erro}</p>}
            <Button onClick={() => void analisar()} disabled={!file || loading} className="w-full">{loading ? "Analisando…" : "Pré-visualizar"}</Button>
          </CardContent>
        </Card>
      )}

      {preview && preview.colunas && preview.mapa && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg"><Columns3 className="h-5 w-5" /> Colunas da planilha</CardTitle>
            <CardDescription>Reconhecemos as colunas pelo nome. Confira e troque o que não estiver certo; a pré-visualização atualiza na hora.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              {CAMPOS.map((c) => {
                const atual = (mapa ?? preview.mapa!)[c.k];
                return (
                  <div key={c.k} className="space-y-1">
                    <Label className="text-xs">{c.r}</Label>
                    <Select value={String(atual ?? -1)} onValueChange={(v) => trocarColuna(c.k, v)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="-1">Não usar</SelectItem>
                        {preview.colunas!.map((nome, i) => (
                          <SelectItem key={i} value={String(i)}>
                            {nome}{preview.amostraBruta?.[0]?.[i] ? ` (ex.: ${String(preview.amostraBruta[0][i]).slice(0, 24)})` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {c.ajuda && <p className="text-[11px] text-muted-foreground">{c.ajuda}</p>}
                  </div>
                );
              })}
            </div>
            {!!preview.amostraBruta?.length && (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead><tr className="bg-muted/50 text-left">{preview.colunas.map((n, i) => <th key={i} className="p-2 whitespace-nowrap font-medium">{n}</th>)}</tr></thead>
                  <tbody>
                    {preview.amostraBruta.map((r, i) => (
                      <tr key={i} className="border-t">{r.map((v, j) => <td key={j} className="p-2 whitespace-nowrap">{v}</td>)}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {preview && (
        <Card>
          <CardHeader><CardTitle>Pré-visualização</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat n={preview.contasAPagar} label={preview.totalAPagar !== undefined ? `A pagar · ${fmt(preview.totalAPagar)}` : "Contas a pagar"} />
              {preview.contasAReceber !== undefined && <Stat n={preview.contasAReceber} label={`A receber · ${fmt(preview.totalAReceber ?? 0)}`} />}
              <Stat n={preview.reembolsosPessoais} label="Reembolsos à pessoa" />
              <Stat n={preview.categoriasNovas.length} label="Contas novas" />
              <Stat n={preview.duplicadas} label="Duplicadas (pular)" />
            </div>
            {preview.reembolsosPessoais > 0 && (
              <div className="flex items-start gap-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-3 text-sm">
                <HandCoins className="h-4 w-4 mt-0.5" />
                <span>
                  {preview.reembolsosPessoais} grupo(s) de reembolso, {fmt(preview.totalReembolsos)}.
                  Ficam em <b>Reembolsos a Receber</b> até marcar como recebido.
                </span>
              </div>
            )}
            {preview.formasNovas.length > 0 && (
              <div>
                <p className="text-sm font-medium mb-1 flex items-center gap-1"><CreditCard className="h-4 w-4" /> Cartões novos a cadastrar</p>
                {preview.formasNovas.map((f) => (
                  <Badge key={f.nome} variant="secondary" className="mr-1 mb-1">💳 {f.nome}</Badge>
                ))}
              </div>
            )}
            {!!preview.contatosNovos?.length && (
              <div>
                <p className="text-sm font-medium mb-1 flex items-center gap-1"><Users className="h-4 w-4" /> Clientes e fornecedores que serão cadastrados</p>
                {preview.contatosNovos.slice(0, 40).map((c) => <Badge key={c} variant="outline" className="mr-1 mb-1">{c}</Badge>)}
                {preview.contatosNovos.length > 40 && <span className="text-xs text-muted-foreground">e mais {preview.contatosNovos.length - 40}</span>}
              </div>
            )}
            {preview.erros.length > 0 && (
              <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm dark:border-amber-900 dark:bg-amber-950/30">
                <p className="font-medium flex items-center gap-1"><AlertCircle className="h-4 w-4" /> {preview.erros.length} linha(s) ficam de fora</p>
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {preview.erros.slice(0, 8).map((e, i) => <li key={i}>Linha {e.linha}: {e.motivo}{e.conteudo ? ` (“${e.conteudo.slice(0, 40)}”)` : ""}</li>)}
                </ul>
                <p className="mt-1 text-xs">Se forem muitas, confira as colunas acima.</p>
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
                  <th className="p-2">Vencimento</th><th className="p-2">Tipo</th><th className="p-2">Descrição</th><th className="p-2">Cliente/fornecedor</th><th className="p-2">Categoria</th><th className="p-2">Forma</th><th className="p-2 text-right">Valor</th>
                </tr></thead>
                <tbody>
                  {preview.amostra.map((l, i) => (
                    <tr key={i} className="border-t">
                      <td className="p-2 whitespace-nowrap">{l.vencimento.split("-").reverse().join("/")}</td>
                      <td className="p-2 whitespace-nowrap">{l.reembolsoPessoal ? "Reembolso" : l.tipo === "Receita" ? "A receber" : "A pagar"}</td>
                      <td className="p-2">{l.descricao}</td>
                      <td className="p-2">{l.contato || "—"}</td>
                      <td className="p-2">{l.categoria}</td>
                      <td className="p-2">{l.forma}</td>
                      <td className="p-2 text-right font-numeric">{fmt(l.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button onClick={confirmar} disabled={loading || preview.total === 0} className="w-full">{loading ? "Importando…" : "Confirmar importação"}</Button>
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
