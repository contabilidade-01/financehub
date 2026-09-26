import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Bot, CheckCircle2, CircleSlash, ExternalLink, KeyRound, PauseCircle, PlayCircle, RefreshCw, Wallet } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

type Provedor = {
  id: string; posicao: number; nome: string; modelo: string; configurado: boolean; ligado: boolean;
  situacao: "ok" | "fora" | "desligado" | "sem_chave";
  fora_ate: string | null; motivo: string | null;
  ultima_falha: string | null; ultima_falha_em: string | null; ultimo_ok_em: string | null;
  chamadas_hoje: number; falhas_hoje: number; chamadas_30d: number; falhas_30d: number;
  tokens_entrada_30d: number; tokens_saida_30d: number; custo_estimado_30d_usd: number;
  preco_referencia: { entrada: number; saida: number; fonte: string };
  saldo: { texto: string; valor?: number; moeda?: string } | null;
  painel: string;
};
type Painel = { provedores: Provedor[]; por_origem: { origem: string; provedor: string; chamadas: number }[] };

const ENV: Record<string, string> = {
  openai: "OPENAI_API_KEY (modelo: AI_MODEL)",
  deepseek: "DEEPSEEK_API_KEY (ou AI_FALLBACK_API_KEY) · DEEPSEEK_MODEL",
  gemini: "GEMINI_API_KEY (modelo: GEMINI_CHAT_MODEL ou GEMINI_MODEL)",
  groq: "GROQ_API_KEY (modelo: GROQ_MODEL)",
};
const MOTIVO: Record<string, string> = {
  sem_credito: "sem crédito", auth: "chave inválida", rate_limit: "limite de chamadas", transitorio: "instável", timeout: "sem resposta",
};
const ORIGEM: Record<string, string> = {
  agente: "WhatsApp / agente", orquestrador: "Orquestrador", importacao: "Importação de extrato", conciliacao: "Conciliação", teste: "Testes",
};
const hora = (iso?: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const num = (n: number) => n.toLocaleString("pt-BR");

function SituacaoBadge({ p }: { p: Provedor }) {
  if (p.situacao === "ok") return <Badge className="bg-income/15 text-income border-income/30"><CheckCircle2 className="mr-1 h-3 w-3" />Ativo</Badge>;
  if (p.situacao === "fora") return <Badge className="bg-expense/15 text-expense border-expense/30"><PauseCircle className="mr-1 h-3 w-3" />Fora até {hora(p.fora_ate)} · {MOTIVO[p.motivo || ""] || p.motivo}</Badge>;
  if (p.situacao === "desligado") return <Badge variant="secondary"><CircleSlash className="mr-1 h-3 w-3" />Desligado</Badge>;
  return <Badge variant="outline"><KeyRound className="mr-1 h-3 w-3" />Sem chave</Badge>;
}

export default function IaProvedoresPage() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data, isLoading, refetch, isFetching } = useQuery<Painel>({
    queryKey: ["/api/admin/ia/provedores"],
    queryFn: () => apiRequest("/api/admin/ia/provedores"),
    refetchInterval: 60_000,
  });
  const [ordem, setOrdem] = useState<string[]>([]);
  const [desligados, setDesligados] = useState<string[]>([]);
  useEffect(() => {
    if (data) {
      setOrdem(data.provedores.map((p) => p.id));
      setDesligados(data.provedores.filter((p) => !p.ligado).map((p) => p.id));
    }
  }, [data]);
  const mudou = !!data && (ordem.join() !== data.provedores.map((p) => p.id).join() || desligados.slice().sort().join() !== data.provedores.filter((p) => !p.ligado).map((p) => p.id).sort().join());

  const invalidar = () => qc.invalidateQueries({ queryKey: ["/api/admin/ia/provedores"] });
  const salvar = useMutation({
    mutationFn: () => apiRequest("/api/admin/ia/provedores", { method: "PUT", data: { ordem, desligados } }),
    onSuccess: () => { invalidar(); toast({ title: "Fila salva", description: "Vale a partir da próxima mensagem (até 30 s nas outras instâncias)." }); },
    onError: (e: any) => toast({ title: "Erro", description: e?.error || e?.message, variant: "destructive" }),
  });
  const testar = useMutation({
    mutationFn: (id: string) => apiRequest<{ ok: boolean; ms: number; resposta?: string; erro?: string }>(`/api/admin/ia/provedores/${id}/testar`, { method: "POST", data: {} }),
    onSuccess: (r, id) => {
      invalidar();
      toast(r.ok
        ? { title: `${id}: respondeu em ${r.ms} ms`, description: `Resposta: "${r.resposta}"` }
        : { title: `${id}: falhou`, description: r.erro, variant: "destructive" });
    },
  });
  const reativar = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/admin/ia/provedores/${id}/reativar`, { method: "POST", data: {} }),
    onSuccess: () => { invalidar(); toast({ title: "Provedor de volta à fila" }); },
  });

  const mover = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= ordem.length) return;
    const nova = [...ordem];
    [nova[i], nova[j]] = [nova[j], nova[i]];
    setOrdem(nova);
  };
  const porId = new Map((data?.provedores || []).map((p) => [p.id, p]));
  const ativoAgora = ordem.map((id) => porId.get(id)).find((p) => p && p.situacao === "ok");
  const custoTotal = (data?.provedores || []).reduce((s, p) => s + p.custo_estimado_30d_usd, 0);

  return (
    <div className="space-y-6 p-2">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2"><Bot className="h-6 w-6" /> Provedores de IA</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Fila com troca automática: se um provedor ficar sem crédito ou cair, o próximo assume na mesma mensagem.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
          <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} /> Atualizar
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Card><CardContent className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Atendendo agora</div>
          <div className="text-xl font-bold mt-1">{ativoAgora ? `${ativoAgora.nome}` : "Nenhum disponível"}</div>
          <div className="text-xs text-muted-foreground">{ativoAgora?.modelo || "Verifique as chaves e créditos abaixo"}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Chamadas hoje</div>
          <div className="text-xl font-bold mt-1">{num((data?.provedores || []).reduce((s, p) => s + p.chamadas_hoje, 0))}</div>
          <div className="text-xs text-muted-foreground">{num((data?.provedores || []).reduce((s, p) => s + p.falhas_hoje, 0))} falha(s) contornada(s) pela fila</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Custo estimado (30 dias)</div>
          <div className="text-xl font-bold mt-1">US$ {custoTotal.toFixed(2)}</div>
          <div className="text-xs text-muted-foreground">Pelos tokens usados × preço de referência</div>
        </CardContent></Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Fila de atendimento</CardTitle>
          <CardDescription>Ordem de tentativa. Use as setas para reordenar e a chave para tirar um provedor da fila; depois, salve.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {ordem.map((id, i) => {
            const p = porId.get(id);
            if (!p) return null;
            const ligado = !desligados.includes(id);
            return (
              <div key={id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex flex-col">
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir"><ArrowUp className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => mover(i, 1)} disabled={i === ordem.length - 1} aria-label="Descer"><ArrowDown className="h-4 w-4" /></Button>
                  </div>
                  <div className="text-lg font-bold w-6 text-center text-muted-foreground">{i + 1}º</div>
                  <div className="min-w-[160px] flex-1">
                    <div className="font-semibold">{p.nome}</div>
                    <div className="text-xs text-muted-foreground">{p.modelo}</div>
                  </div>
                  <SituacaoBadge p={p} />
                  <div className="flex items-center gap-2 text-sm">
                    <Switch checked={ligado && p.configurado} disabled={!p.configurado} onCheckedChange={(v) => setDesligados(v ? desligados.filter((x) => x !== id) : [...desligados, id])} aria-label="Na fila" />
                    <span className="text-muted-foreground">Na fila</span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => testar.mutate(id)} disabled={!p.configurado || testar.isPending}><PlayCircle className="h-4 w-4 mr-1" />Testar</Button>
                    {p.situacao === "fora" && <Button size="sm" variant="secondary" onClick={() => reativar.mutate(id)}>Reativar</Button>}
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                  <div><span className="font-medium text-foreground">Uso:</span> hoje {num(p.chamadas_hoje)} · 30 dias {num(p.chamadas_30d)}{p.falhas_30d ? ` (${num(p.falhas_30d)} falhas)` : ""}</div>
                  <div><span className="font-medium text-foreground">Tokens 30d:</span> {num(p.tokens_entrada_30d)} entrada · {num(p.tokens_saida_30d)} saída · ≈ US$ {p.custo_estimado_30d_usd.toFixed(2)}</div>
                  <div className="flex items-center gap-1"><Wallet className="h-3.5 w-3.5" />
                    <span className="font-medium text-foreground">Saldo:</span>{" "}
                    {p.saldo ? p.saldo.texto : p.id === "openai" ? "sem API de saldo (defina OPENAI_ADMIN_KEY para ver o gasto do mês)" : "sem API de saldo"}
                    <a href={p.painel} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center text-primary hover:underline">painel <ExternalLink className="ml-0.5 h-3 w-3" /></a>
                  </div>
                  <div><span className="font-medium text-foreground">Último OK:</span> {hora(p.ultimo_ok_em)}{p.ultima_falha_em ? ` · última falha ${hora(p.ultima_falha_em)}` : ""}</div>
                </div>
                {p.ultima_falha && p.situacao !== "ok" && <p className="mt-2 text-xs text-expense break-words">{p.ultima_falha}</p>}
                {!p.configurado && <p className="mt-2 text-xs text-muted-foreground">Para ativar, defina no EasyPanel: <code>{ENV[id]}</code></p>}
              </div>
            );
          })}
          <div className="flex justify-end">
            <Button onClick={() => salvar.mutate()} disabled={!mudou || salvar.isPending}>{salvar.isPending ? "Salvando…" : "Salvar fila"}</Button>
          </div>
        </CardContent>
      </Card>

      {!!data?.por_origem.length && (
        <Card>
          <CardHeader><CardTitle>Quem usou a IA (30 dias)</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-muted-foreground"><th className="py-1 pr-4 font-medium">Origem</th><th className="py-1 pr-4 font-medium">Provedor</th><th className="py-1 font-medium text-right">Chamadas</th></tr></thead>
                <tbody>
                  {data.por_origem.map((r) => (
                    <tr key={`${r.origem}-${r.provedor}`} className="border-t">
                      <td className="py-1 pr-4">{ORIGEM[r.origem] || r.origem}</td>
                      <td className="py-1 pr-4">{porId.get(r.provedor)?.nome || r.provedor}</td>
                      <td className="py-1 text-right tabular-nums">{num(r.chamadas)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Como funciona</CardTitle></CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p><strong className="text-foreground">Fila:</strong> cada mensagem tenta o 1º provedor disponível. Se ele falhar, a mesma mensagem segue para o próximo — o cliente não percebe a troca.</p>
          <p><strong className="text-foreground">Sem crédito ou chave inválida:</strong> o provedor sai da fila por <strong>30 min</strong> (para não atrasar cada mensagem tentando de novo) e você recebe um aviso no WhatsApp do admin. Passado o prazo, ele é tentado de novo sozinho; ao responder, volta ao seu lugar e você é avisado. Recarregou o crédito? Clique em <em>Reativar</em>.</p>
          <p><strong className="text-foreground">Instabilidade</strong> (erro 5xx, limite de chamadas, demora): o provedor sai por <strong>2 min</strong>.</p>
          <p><strong className="text-foreground">Todos fora:</strong> a fila tenta mesmo assim, na ordem — o crédito pode ter sido recarregado.</p>
          <p><strong className="text-foreground">Orquestrador:</strong> usa o DeepSeek primeiro e cai na fila se ele falhar.</p>
          <p><strong className="text-foreground">Onde a fila vale:</strong> agente do WhatsApp, orquestrador, sugestão de categorias na importação de extrato e conciliação. Áudio (transcrição) e leitura de fotos/PDF seguem com seus provedores próprios.</p>
          <p><strong className="text-foreground">Saldo:</strong> o DeepSeek informa o saldo pela API. A OpenAI não informa saldo pela chave comum — com <code>OPENAI_ADMIN_KEY</code> mostramos o gasto do mês. O Gemini não tem API de saldo; use o link do painel. O custo estimado usa preços de referência e pode diferir da fatura.</p>
        </CardContent>
      </Card>
    </div>
  );
}
