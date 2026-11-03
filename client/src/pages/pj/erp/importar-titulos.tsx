import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Download, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ContaPlanoCombobox, usePlanoContasPj } from "@/components/shared/ContaPlanoCombobox";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { apiErp, brl, dataBr } from "./comum";
import type { TipoTitulo } from "./titulos";

type Campo = "descricao" | "valor" | "data_vencimento" | "contato" | "categoria" | "data_competencia" | "data_pagamento" | "documento" | "centro_custo";
interface Definicao { chave: Campo; rotulo: string; obrigatorio: boolean; descricao: string }
interface Analise {
  tipo: TipoTitulo;
  cabecalho: string[];
  linhas: string[][];
  linha_cabecalho: number;
  campos: Definicao[];
  sugestao: Partial<Record<Campo, number>>;
  previa: { itens: number; erros: number };
}
interface Resultado {
  simulacao: boolean; total: number; criados: number; pagos: number; pagos_sem_conta: number; duplicados: number;
  contatos_novos: string[]; contas_novas: string[]; sem_conta_do_plano: number; erros: { linha: number; motivo: string; conteudo: string }[];
}

const TX = {
  Receita: { titulo: "Importar contas a receber", pessoa: "cliente", modelo: "/modelo-contas-receber.csv", feito: "recebidas" },
  Despesa: { titulo: "Importar contas a pagar", pessoa: "fornecedor", modelo: "/modelo-contas-pagar.csv", feito: "pagas" },
} as const;

/** Link do modelo de planilha (mesmas colunas que a importação espera). */
export function LinkModelo({ tipo }: { tipo: TipoTitulo }) {
  return (
    <a href={TX[tipo].modelo} download className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
      <Download className="h-3.5 w-3.5" />Baixar modelo (.csv)
    </a>
  );
}

/**
 * Importação por planilha em 4 passos: arquivo → o que é cada coluna → prévia → resultado.
 * Qualquer planilha serve: o cliente aponta a coluna de cada campo do sistema.
 */
export function ImportarTitulosDialog({ empresaId, tipo, aberto, onFechar, onImportado }: { empresaId: number; tipo: TipoTitulo; aberto: boolean; onFechar: () => void; onImportado: () => void }) {
  const tx = TX[tipo];
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [passo, setPasso] = useState<1 | 2 | 3 | 4>(1);
  const [arrastando, setArrastando] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [mapa, setMapa] = useState<Partial<Record<Campo, number>>>({});
  const [opcoes, setOpcoes] = useState({ criar_contatos: true, criar_contas: false, categoria_padrao_id: null as number | null, conta_bancaria_id: "" });
  const [simulacao, setSimulacao] = useState<Resultado | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const { contas: categorias, grupos, criarConta } = usePlanoContasPj(empresaId);
  const { data: bancos = [] } = useQuery<any[]>({ queryKey: [`/api/empresas/${empresaId}/contas-bancarias`], queryFn: () => apiErp(`/api/empresas/${empresaId}/contas-bancarias`), enabled: aberto });

  const reiniciar = () => { setPasso(1); setAnalise(null); setMapa({}); setSimulacao(null); setResultado(null); };
  const fechar = () => { reiniciar(); onFechar(); };

  const enviar = async (arquivo?: File) => {
    if (!arquivo) return;
    if (arquivo.size > 8 * 1024 * 1024) { toast({ title: "Arquivo maior que 8 MB", variant: "destructive" }); return; }
    const form = new FormData();
    form.append("arquivo", arquivo);
    form.append("tipo", tipo);
    setCarregando(true);
    try {
      const res = await fetch(`/api/empresas/${empresaId}/erp/titulos/importar/analisar`, { method: "POST", credentials: "include", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      setAnalise(data);
      setMapa(data.sugestao || {});
      setPasso(2);
    } catch (e: any) {
      toast({ title: "Não foi possível ler a planilha", description: e?.message, variant: "destructive" });
    } finally {
      setCarregando(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  // Monta os itens a partir do mapeamento (a validação fina é do servidor).
  const itens = useMemo(() => {
    if (!analise) return [];
    const col = (l: string[], k: Campo) => (mapa[k] !== undefined && mapa[k]! >= 0 ? String(l[mapa[k]!] ?? "").trim() : "");
    return analise.linhas.map((l, i) => ({
      linha: analise.linha_cabecalho + 2 + i,
      descricao: col(l, "descricao"), valor: col(l, "valor"), data_vencimento: col(l, "data_vencimento"),
      data_competencia: col(l, "data_competencia"), data_pagamento: col(l, "data_pagamento"),
      contato: col(l, "contato"), categoria: col(l, "categoria"), documento: col(l, "documento"), centro_custo: col(l, "centro_custo"),
    }));
  }, [analise, mapa]);

  const obrigatoriosOk = !!analise && analise.campos.filter((c) => c.obrigatorio).every((c) => mapa[c.chave] !== undefined && mapa[c.chave]! >= 0);
  const temPagamento = mapa.data_pagamento !== undefined && mapa.data_pagamento >= 0;

  /** Normaliza datas/valores no cliente para o servidor validar e simular. */
  const normalizar = () => itens.map((it) => ({
    ...it,
    data_vencimento: isoDe(it.data_vencimento), data_competencia: isoDe(it.data_competencia) || null, data_pagamento: isoDe(it.data_pagamento) || null,
  }));

  const chamar = async (simular: boolean) => {
    setCarregando(true);
    try {
      const r = await apiErp<Resultado>(`/api/empresas/${empresaId}/erp/titulos/importar`, {
        method: "POST",
        body: { tipo, itens: normalizar(), simular, ...opcoes, conta_bancaria_id: opcoes.conta_bancaria_id || null },
      });
      if (simular) { setSimulacao(r); setPasso(3); }
      else { setResultado(r); setPasso(4); onImportado(); }
    } catch (e: any) {
      toast({ title: simular ? "Não foi possível montar a prévia" : "Não foi possível importar", description: e?.message, variant: "destructive" });
    } finally {
      setCarregando(false);
    }
  };

  return (
    <Dialog open={aberto} onOpenChange={(o) => !o && fechar()}>
      <DialogContent className="max-h-[92dvh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tx.titulo}</DialogTitle>
          <DialogDescription>
            Passo {passo} de 4 · {["Escolha a planilha", "Diga o que é cada coluna", "Confira a prévia", "Pronto"][passo - 1]}
          </DialogDescription>
        </DialogHeader>

        {passo === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Serve qualquer planilha (.xlsx, .xls ou .csv) com uma linha por título. No próximo passo você indica qual coluna é a descrição, o valor,
              o vencimento, o {tx.pessoa} e a conta do plano. Se preferir começar do zero, use o modelo pronto.
            </p>
            <LinkModelo tipo={tipo} />
            <label
              onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
              onDragLeave={() => setArrastando(false)}
              onDrop={(e) => { e.preventDefault(); setArrastando(false); void enviar(e.dataTransfer.files?.[0]); }}
              className={cn("flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-10 text-center", arrastando ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40", carregando && "pointer-events-none opacity-60")}
            >
              {carregando ? <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /> : <Upload className="h-8 w-8 text-muted-foreground" />}
              <span className="text-sm font-medium">{carregando ? "Lendo planilha…" : "Arraste a planilha aqui ou clique para escolher"}</span>
              <span className="text-xs text-muted-foreground">.xlsx, .xls ou .csv — até 8 MB e 3.000 linhas</span>
              <input ref={inputRef} type="file" accept=".xlsx,.xls,.xlsm,.csv,.txt" className="sr-only" onChange={(e) => void enviar(e.target.files?.[0])} />
            </label>
          </div>
        )}

        {passo === 2 && analise && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileSpreadsheet className="h-4 w-4" />{analise.linhas.length} linha(s) de dados · {analise.cabecalho.length} coluna(s)
              {analise.linha_cabecalho < 0 && <Badge variant="outline" className="font-normal">sem cabeçalho reconhecido</Badge>}
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {analise.campos.map((c) => (
                <div key={c.chave} className="space-y-1">
                  <Label className="text-xs">{c.rotulo}{c.obrigatorio && <span className="text-destructive"> *</span>}</Label>
                  <Select value={mapa[c.chave] !== undefined && mapa[c.chave]! >= 0 ? String(mapa[c.chave]) : "__nenhuma"} onValueChange={(v) => setMapa({ ...mapa, [c.chave]: v === "__nenhuma" ? -1 : Number(v) })}>
                    <SelectTrigger className={cn(c.obrigatorio && (mapa[c.chave] === undefined || mapa[c.chave]! < 0) && "border-destructive")}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__nenhuma">{c.obrigatorio ? "Escolha a coluna…" : "Não tem na planilha"}</SelectItem>
                      {analise.cabecalho.map((h, i) => <SelectItem key={i} value={String(i)}>{h}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] leading-snug text-muted-foreground">{c.descricao}</p>
                </div>
              ))}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Prévia das primeiras linhas, já com as suas colunas</Label>
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40 text-muted-foreground">
                    <tr>{["Vencimento", "Descrição", capital(tx.pessoa), "Conta do plano", "Valor", temPagamento ? "Pago/recebido em" : ""].filter(Boolean).map((h) => <th key={h} className="px-2 py-1.5 text-left font-medium">{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {itens.slice(0, 6).map((it, i) => (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1 tabular-nums">{dataBr(isoDe(it.data_vencimento)) || <span className="text-destructive">{it.data_vencimento || "—"}</span>}</td>
                        <td className="max-w-[260px] truncate px-2 py-1">{it.descricao || <span className="text-destructive">—</span>}</td>
                        <td className="max-w-[160px] truncate px-2 py-1 text-muted-foreground">{it.contato || "—"}</td>
                        <td className="max-w-[160px] truncate px-2 py-1 text-muted-foreground">{it.categoria || "—"}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{it.valor || <span className="text-destructive">—</span>}</td>
                        {temPagamento && <td className="px-2 py-1 tabular-nums">{dataBr(isoDe(it.data_pagamento)) || (it.data_pagamento ? <span className="text-destructive">{it.data_pagamento}</span> : "em aberto")}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid gap-3 rounded-md border bg-muted/30 p-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Conta do plano padrão (quando a linha não traz uma)</Label>
                <ContaPlanoCombobox categorias={categorias} grupos={grupos} tipo={tipo} valor={opcoes.categoria_padrao_id} onChange={(id) => setOpcoes({ ...opcoes, categoria_padrao_id: id })} onCriar={criarConta} escopo="pj" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Conta bancária das linhas já {tx.feito}</Label>
                <Select value={opcoes.conta_bancaria_id || "__nenhuma"} onValueChange={(v) => setOpcoes({ ...opcoes, conta_bancaria_id: v === "__nenhuma" ? "" : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__nenhuma">{temPagamento ? "Não baixar: deixar tudo em aberto" : "Não se aplica"}</SelectItem>
                    {bancos.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.nome || b.banco}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={opcoes.criar_contatos} onCheckedChange={(v) => setOpcoes({ ...opcoes, criar_contatos: !!v })} />Cadastrar {tx.pessoa}s que não existem</label>
              <label className="flex items-center gap-2 text-sm"><Checkbox checked={opcoes.criar_contas} onCheckedChange={(v) => setOpcoes({ ...opcoes, criar_contas: !!v })} />Criar contas do plano que não existem</label>
            </div>
          </div>
        )}

        {passo === 3 && simulacao && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat n={simulacao.criados} r="Serão criadas" />
              <Stat n={simulacao.pagos} r={`Já ${tx.feito} (baixadas)`} />
              <Stat n={simulacao.duplicados} r="Duplicadas (puladas)" />
              <Stat n={simulacao.erros.length} r="Linhas com erro" alerta={simulacao.erros.length > 0} />
            </div>
            {simulacao.sem_conta_do_plano > 0 && (
              <Aviso>{simulacao.sem_conta_do_plano} linha(s) sem conta do plano. Volte e escolha a conta padrão ou marque “criar contas que não existem”.</Aviso>
            )}
            {simulacao.pagos_sem_conta > 0 && (
              <Aviso>{simulacao.pagos_sem_conta} linha(s) têm data de {tipo === "Receita" ? "recebimento" : "pagamento"} mas nenhuma conta bancária foi escolhida: ficarão em aberto.</Aviso>
            )}
            {simulacao.contatos_novos.length > 0 && (
              <div className="text-sm">
                <span className="font-medium">{capital(tx.pessoa)}s a cadastrar:</span>{" "}
                {simulacao.contatos_novos.slice(0, 20).map((n) => <Badge key={n} variant="secondary" className="mr-1 mb-1 font-normal">{n}</Badge>)}
                {simulacao.contatos_novos.length > 20 && <span className="text-muted-foreground">e mais {simulacao.contatos_novos.length - 20}</span>}
              </div>
            )}
            {simulacao.contas_novas.length > 0 && (
              <div className="text-sm"><span className="font-medium">Contas do plano a criar:</span> {simulacao.contas_novas.map((n) => <Badge key={n} variant="outline" className="mr-1 mb-1 font-normal">{n}</Badge>)}</div>
            )}
            {simulacao.erros.length > 0 && (
              <div className="max-h-40 overflow-y-auto rounded-md border text-xs">
                {simulacao.erros.slice(0, 50).map((e, i) => (
                  <div key={i} className="flex gap-2 border-b px-2 py-1 last:border-0"><span className="w-14 shrink-0 text-muted-foreground">linha {e.linha}</span><span>{e.motivo}</span><span className="truncate text-muted-foreground">{e.conteudo}</span></div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Total na planilha: {simulacao.total}. Linhas com erro e duplicadas não entram; o resto é importado de uma vez.</p>
          </div>
        )}

        {passo === 4 && resultado && (
          <div className="space-y-4">
            <div className="flex items-start gap-3"><CheckCircle2 className="mt-0.5 h-6 w-6 text-emerald-600" /><div><p className="text-lg font-semibold">Importação concluída</p><p className="text-sm text-muted-foreground">{resultado.criados} título(s) criado(s){resultado.pagos ? `, ${resultado.pagos} já baixado(s)` : ""}{resultado.duplicados ? `, ${resultado.duplicados} duplicado(s) pulado(s)` : ""}.</p></div></div>
            {(resultado.contatos_novos.length > 0 || resultado.contas_novas.length > 0) && (
              <p className="text-sm text-muted-foreground">Cadastrados: {resultado.contatos_novos.length} {tx.pessoa}(s) e {resultado.contas_novas.length} conta(s) do plano.</p>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {passo === 2 && <Button variant="ghost" onClick={reiniciar}>Outro arquivo</Button>}
          {passo === 3 && <Button variant="ghost" onClick={() => setPasso(2)}>Voltar</Button>}
          {passo === 4 ? (
            <Button onClick={fechar}>Fechar</Button>
          ) : (
            <>
              <Button variant="outline" onClick={fechar}>Cancelar</Button>
              {passo === 2 && <Button onClick={() => chamar(true)} disabled={!obrigatoriosOk || carregando}>{carregando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Ver prévia</Button>}
              {passo === 3 && <Button onClick={() => chamar(false)} disabled={carregando || !simulacao || simulacao.criados === 0 || simulacao.sem_conta_do_plano > 0}>{carregando && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Importar {simulacao?.criados ?? 0} título(s)</Button>}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ n, r, alerta }: { n: number; r: string; alerta?: boolean }) {
  return (
    <div className="rounded-md border p-3">
      <div className={cn("text-xl font-semibold tabular-nums", alerta && "text-destructive")}>{n}</div>
      <div className="text-xs text-muted-foreground">{r}</div>
    </div>
  );
}
function Aviso({ children }: { children: React.ReactNode }) {
  return <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>{children}</span></div>;
}
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** dd/mm/aaaa, dd/mm/aa, aaaa-mm-dd, dd-mm-aaaa → ISO ("" se não reconhecer). */
export function isoDe(s: string): string {
  const t = String(s || "").trim();
  if (!t) return "";
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (m) return `${m[3].length === 2 ? 2000 + Number(m[3]) : m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "";
}
// brl é usado pelos chamadores que exibem totais; mantido exportado por conveniência.
export { brl };
