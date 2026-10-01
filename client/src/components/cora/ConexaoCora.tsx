import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, FileKey2, Loader2, PlugZap, RefreshCw, ShieldCheck, Upload, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfirm } from "@/components/shared/ConfirmDialog";
import { useToast } from "@/hooks/use-toast";
import { HelpVideoButton } from "@/components/shared/HelpVideoButton";

export interface Conexao {
  ambiente: "stage" | "producao";
  client_id: string;
  conta_bancaria_id: number | null;
  status: "pendente" | "conectada" | "erro";
  ultimo_erro: string | null;
  webhook_registrado: boolean;
  multa_pct: number;
  juros_mes_pct: number;
  ultimo_sync_em: string | null;
  tem_certificado: boolean;
  tem_chave: boolean;
  /** manual = a empresa lança e dá baixa; cora = os boletos da conta Cora entram sozinhos. */
  modo_recebimento: "manual" | "cora";
  ultima_importacao: ResultadoImportacao | null;
}

export interface ResultadoImportacao {
  listadas: number;
  criadas: number;
  vinculadas: number;
  atualizadas: number;
  baixadas: number;
  canceladas: number;
  ignoradas: number;
  falhas: number;
  em: string;
}

export function resumoImportacao(u: ResultadoImportacao | null | undefined): string {
  if (!u) return "Nenhuma importação feita ainda.";
  const quando = new Date(u.em);
  const data = isNaN(quando.getTime()) ? "" : ` em ${quando.toLocaleString("pt-BR")}`;
  const partes = [
    `${u.listadas} boleto(s) lido(s)`,
    `${u.criadas + u.vinculadas} novo(s) em Contas a receber`,
    `${u.baixadas} recebido(s)`,
    ...(u.canceladas ? [`${u.canceladas} cancelado(s)`] : []),
    ...(u.falhas ? [`${u.falhas} falha(s)`] : []),
  ];
  return `Última importação${data}: ${partes.join(", ")}.`;
}

async function api<T = any>(url: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(url, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error || `Erro ${r.status}`);
  return d as T;
}

export function useConexaoCora(empresaId: number | null | undefined) {
  const url = `/api/empresas/${empresaId}/integracoes/cora`;
  const q = useQuery<Conexao | null>({ queryKey: [url], queryFn: () => api(url), enabled: !!empresaId, retry: false });
  return { ...q, url, conectada: q.data?.status === "conectada" };
}

/** Lê um arquivo .pem/.crt/.key escolhido pelo usuário (o conteúdo vai cifrado para o servidor). */
function CampoArquivo({ id, rotulo, jaEnviado, valor, onValor, aceitar }: { id: string; rotulo: string; jaEnviado: boolean; valor: string; onValor: (t: string) => void; aceitar: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [nome, setNome] = useState("");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" onClick={() => ref.current?.click()}>
          <Upload className="mr-2 h-4 w-4" />{valor ? "Trocar arquivo" : "Escolher arquivo"}
        </Button>
        <span className="min-w-0 truncate text-sm text-muted-foreground">
          {valor ? nome : jaEnviado ? "Já enviado (guardado com criptografia)" : "Nenhum arquivo"}
        </span>
      </div>
      <input
        ref={ref}
        id={id}
        type="file"
        accept={aceitar}
        className="sr-only"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          if (f.size > 50_000) return onValor("");
          setNome(f.name);
          onValor(await f.text());
        }}
      />
    </div>
  );
}

/**
 * Conexão da empresa com o Cora (Integração Direta). O próprio usuário gera no
 * app do Cora o Client ID, o certificado e a chave privada e envia aqui.
 */
export function ConexaoCora({ empresaId, bancos }: { empresaId: number; bancos: { id: number; nome?: string | null; banco: string }[] }) {
  const { toast } = useToast();
  const confirmar = useConfirm();
  const qc = useQueryClient();
  const { data: atual, isLoading, url } = useConexaoCora(empresaId);
  const [form, setForm] = useState<null | { ambiente: "stage" | "producao"; client_id: string; certificado: string; chave: string; multa_pct: string; juros_mes_pct: string; conta_bancaria_id: string }>(null);
  const [ocupado, setOcupado] = useState<"" | "salvar" | "testar" | "webhook" | "remover" | "modo" | "importar">("");

  const f = form ?? {
    ambiente: atual?.ambiente ?? "stage",
    client_id: atual?.client_id ?? "",
    certificado: "",
    chave: "",
    multa_pct: String(atual?.multa_pct ?? 2).replace(".", ","),
    juros_mes_pct: String(atual?.juros_mes_pct ?? 1).replace(".", ","),
    conta_bancaria_id: atual?.conta_bancaria_id ? String(atual.conta_bancaria_id) : "",
  };
  const mudar = (p: Partial<typeof f>) => setForm({ ...f, ...p });

  const executar = async (acao: typeof ocupado, fn: () => Promise<Conexao | any>, ok: (r: any) => string) => {
    setOcupado(acao);
    try {
      const r = await fn();
      qc.setQueryData([url], r?.status ? r : undefined);
      qc.invalidateQueries({ queryKey: [url] });
      qc.invalidateQueries({ queryKey: [`/api/empresas/${empresaId}/contas-bancarias`] });
      const msg = ok(r);
      if (r?.status === "erro") toast({ title: "Não conectou", description: r.ultimo_erro || "Confira os dados.", variant: "destructive" });
      else toast({ title: msg });
      return r;
    } catch (e: any) {
      toast({ title: "Não foi possível concluir", description: e?.message, variant: "destructive" });
    } finally {
      setOcupado("");
    }
  };

  const salvar = () =>
    executar("salvar", () => api(url, "PUT", {
      ...f,
      multa_pct: f.multa_pct.replace(",", "."),
      juros_mes_pct: f.juros_mes_pct.replace(",", "."),
      conta_bancaria_id: f.conta_bancaria_id || null,
    }), () => "Conta Cora conectada").then((r) => { if (r) setForm(null); });

  const remover = async () => {
    if (!(await confirmar({ title: "Desconectar o Cora?", description: "As credenciais são apagadas. Cobranças já emitidas continuam no Cora, mas deixam de ser baixadas automaticamente, e a importação das contas a receber para.", confirmText: "Desconectar", destructive: true }))) return;
    executar("remover", () => api(url, "DELETE"), () => "Cora desconectado");
  };

  const mudarModo = (modo: "manual" | "cora") => {
    if (!atual || modo === atual.modo_recebimento) return;
    executar("modo", () => api(`${url}/modo`, "PUT", { modo }), () =>
      modo === "cora" ? "Contas a receber passam a vir da conta Cora" : "Contas a receber voltam ao lançamento manual");
  };

  const importarAgora = async () => {
    setOcupado("importar");
    try {
      const r = await api<ResultadoImportacao>(`${url}/importar`, "POST");
      qc.invalidateQueries({ queryKey: [url] });
      qc.invalidateQueries({ predicate: (q) => String(q.queryKey[0]).includes(`/api/empresas/${empresaId}/`) });
      toast({ title: "Importação concluída", description: resumoImportacao(r) });
    } catch (e: any) {
      toast({ title: "Não foi possível importar", description: e?.message, variant: "destructive" });
    } finally {
      setOcupado("");
    }
  };

  if (isLoading) return <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Carregando…</div>;

  return (
    <div className="space-y-4">
      {atual && (
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              {atual.status === "conectada"
                ? <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-700 dark:text-emerald-400" />
                : <XCircle className="mt-0.5 h-5 w-5 text-red-700 dark:text-red-400" />}
              <div className="text-sm">
                <div className="font-medium">
                  {atual.status === "conectada" ? "Conectado ao Cora" : atual.status === "erro" ? "Falha na conexão" : "Conexão pendente"}
                  <Badge variant="outline" className="ml-2 font-normal">{atual.ambiente === "producao" ? "Produção" : "Sandbox (stage)"}</Badge>
                </div>
                <div className="text-muted-foreground">
                  {atual.status === "erro" && atual.ultimo_erro}
                  {atual.status === "conectada" && (atual.webhook_registrado ? "Pagamentos entram sozinhos (aviso do Cora ativo)." : "Ative o aviso de pagamento para a baixa ser imediata.")}
                  {atual.ultimo_sync_em && ` Última conferência: ${new Date(atual.ultimo_sync_em).toLocaleString("pt-BR")}.`}
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" disabled={!!ocupado} onClick={() => executar("testar", () => api(`${url}/testar`, "POST"), () => "Conexão testada: tudo certo")}>
                {ocupado === "testar" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PlugZap className="mr-2 h-4 w-4" />}Testar conexão
              </Button>
              {atual.status === "conectada" && (
                <Button size="sm" variant={atual.webhook_registrado ? "outline" : "default"} disabled={!!ocupado} onClick={() => executar("webhook", () => api(`${url}/webhook`, "POST"), () => "Aviso de pagamento ativado")}>
                  {ocupado === "webhook" && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{atual.webhook_registrado ? "Reativar aviso" : "Ativar aviso de pagamento"}
                </Button>
              )}
              <Button variant="ghost" size="sm" disabled={!!ocupado} onClick={remover}>Desconectar</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{atual ? "Dados da conexão" : "Conectar a conta Cora da empresa"}</CardTitle>
            <CardDescription>
              No app do Cora: Conta → Integrações via APIs → Integração Direta. Gere o Client ID e baixe o certificado e a chave privada.
              Comece pelo ambiente de testes (stage); quando funcionar, troque para produção.
            </CardDescription>
          </div>
          <HelpVideoButton
            titulo="Como conectar a conta Cora"
            descricao="Passo a passo rápido de onde gerar o Client ID, o certificado e a chave privada no app do Cora, e como colar aqui."
          />
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label>Ambiente</Label>
            <Tabs value={f.ambiente} onValueChange={(v) => mudar({ ambiente: v as any })}>
              <TabsList>
                <TabsTrigger value="stage">Sandbox (stage)</TabsTrigger>
                <TabsTrigger value="producao">Produção</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="cora-client">Client ID</Label>
            <Input id="cora-client" autoComplete="off" value={f.client_id} onChange={(e) => mudar({ client_id: e.target.value.trim() })} placeholder="int-..." />
          </div>
          <CampoArquivo id="cora-cert" rotulo="Certificado (.pem)" aceitar=".pem,.crt,.cer" jaEnviado={!!atual?.tem_certificado} valor={f.certificado} onValor={(t) => mudar({ certificado: t })} />
          <CampoArquivo id="cora-chave" rotulo="Chave privada (.key)" aceitar=".key,.pem" jaEnviado={!!atual?.tem_chave} valor={f.chave} onValor={(t) => mudar({ chave: t })} />
          <div className="space-y-1.5">
            <Label>Conta bancária que recebe</Label>
            <Select value={f.conta_bancaria_id || "auto"} onValueChange={(v) => mudar({ conta_bancaria_id: v === "auto" ? "" : v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Criar/usar a conta "Cora"</SelectItem>
                {bancos.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.nome || b.banco}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="cora-multa">Multa (%)</Label>
              <Input id="cora-multa" inputMode="decimal" value={f.multa_pct} onChange={(e) => mudar({ multa_pct: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cora-juros">Juros ao mês (%)</Label>
              <Input id="cora-juros" inputMode="decimal" value={f.juros_mes_pct} onChange={(e) => mudar({ juros_mes_pct: e.target.value })} />
            </div>
          </div>
          <p className="flex items-start gap-2 text-xs text-muted-foreground sm:col-span-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            O certificado e a chave são guardados com criptografia e nunca voltam para a tela. Multa limitada a 2% (Código de Defesa do Consumidor).
          </p>
          <div className="flex justify-end gap-2 sm:col-span-2">
            {form && <Button variant="outline" onClick={() => setForm(null)}>Descartar</Button>}
            <Button onClick={salvar} disabled={!!ocupado || !f.client_id || (!atual && (!f.certificado || !f.chave))}>
              {ocupado === "salvar" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileKey2 className="mr-2 h-4 w-4" />}
              {atual ? "Salvar e testar" : "Conectar"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {atual && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contas a receber</CardTitle>
            <CardDescription>De onde vêm as contas a receber desta empresa.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <RadioGroup value={atual.modo_recebimento} onValueChange={(v) => mudarModo(v as "manual" | "cora")} disabled={!!ocupado} className="gap-3">
              <label htmlFor="modo-manual" className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[[data-state=checked]]:border-primary">
                <RadioGroupItem id="modo-manual" value="manual" className="mt-0.5" />
                <div className="space-y-1">
                  <div className="text-sm font-medium">Lançamento manual</div>
                  <p className="text-xs text-muted-foreground">
                    Você cria as contas a receber e dá baixa quando recebe. Se quiser, emite o boleto pelo Cora em Contas a receber → "Cobrar via Cora".
                  </p>
                </div>
              </label>
              <label htmlFor="modo-cora" className="flex cursor-pointer items-start gap-3 rounded-md border p-3 has-[[data-state=checked]]:border-primary">
                <RadioGroupItem id="modo-cora" value="cora" className="mt-0.5" disabled={atual.status !== "conectada"} />
                <div className="space-y-1">
                  <div className="text-sm font-medium">Importar da API Cora</div>
                  <p className="text-xs text-muted-foreground">
                    Os boletos emitidos na conta Cora entram sozinhos: pago vai para Transações como recebido (na data e no valor pagos),
                    em aberto fica em Contas a receber, cancelado some. O cliente do boleto é cadastrado em Clientes e a receita entra na conta
                    "Recebimentos via Cora". A conferência roda a cada 30 minutos e no aviso do Cora.
                  </p>
                  {atual.status !== "conectada" && <p className="text-xs text-amber-700 dark:text-amber-400">Teste a conexão antes de escolher esta opção.</p>}
                </div>
              </label>
            </RadioGroup>
            {atual.modo_recebimento === "cora" && (
              <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                <span>{resumoImportacao(atual.ultima_importacao)}</span>
                <Button size="sm" variant="outline" className="shrink-0" disabled={!!ocupado} onClick={importarAgora}>
                  {ocupado === "importar" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Importar agora
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
