import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";

type Decisao = { tool: string; args: Record<string, unknown>; ok: boolean; resumo: string };
type Evento = {
  id: number;
  data_criacao: string;
  usuario_id: number | null;
  usuario_nome: string | null;
  tipo_mensagem: string | null;
  mensagem_raw: string | null;
  resultado: string;
  etapa: string | null;
  detalhe: string | null;
  provider: string | null;
  modelo: string | null;
  decisoes: Decisao[] | null;
};

const TODOS = "todos";

function corResultado(r: string): "default" | "secondary" | "destructive" | "outline" {
  if (r === "sucesso") return "secondary";
  if (["bug", "auth", "sem_credito", "erro_parsing"].includes(r)) return "destructive";
  return "outline";
}

/** Resumo legível do resultado de uma ferramenta (categoria, valor, ajustes, erro). */
function resumoResultado(d: Decisao): string {
  try {
    const r = JSON.parse(d.resumo);
    if (r.error) return `Erro: ${r.error}`;
    if (r.precisa_confirmacao || r.precisa_valor || r.precisa_tipo || r.precisa_meio) return `Perguntou ao cliente: ${r.mensagem || ""}`;
    const partes = [
      r.tipo && r.valor != null ? `${r.tipo} R$ ${Number(r.valor).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}` : "",
      r.categoria ? `categoria ${r.categoria}${r.origem_categoria ? ` (via ${r.origem_categoria})` : ""}` : "",
      r.conta ? `conta ${r.conta}` : "",
      r.data_transacao ? `data ${String(r.data_transacao).slice(0, 10)}` : "",
      Array.isArray(r.ajustes_texto) ? `ajustes: ${r.ajustes_texto.join("; ")}` : "",
    ].filter(Boolean);
    return partes.join(" · ") || d.resumo.slice(0, 160);
  } catch {
    return d.resumo.slice(0, 160);
  }
}

export default function IaAuditoriaPage() {
  const [resultado, setResultado] = useState(TODOS);
  const [dias, setDias] = useState("7");
  const [busca, setBusca] = useState("");

  const { data, isLoading } = useQuery<{ eventos: Evento[]; resumo: { resultado: string; total: number }[] }>({
    queryKey: ["/api/admin/ia/eventos", resultado, dias, busca],
    queryFn: async () => {
      const qs = new URLSearchParams({ dias, limite: "100" });
      if (resultado !== TODOS) qs.set("resultado", resultado);
      if (busca.trim().length >= 2) qs.set("q", busca.trim());
      const r = await fetch(`/api/admin/ia/eventos?${qs}`, { credentials: "include" });
      if (!r.ok) throw new Error("Falha ao carregar eventos");
      return r.json();
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Auditoria da IA</h1>
        <p className="text-sm text-muted-foreground">
          Cada mensagem do WhatsApp com o que a IA decidiu: ferramentas chamadas, categoria escolhida e o motivo, e as
          correções aplicadas a partir do texto do cliente.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(data?.resumo || []).map((r) => (
          <Badge key={r.resultado} variant={corResultado(r.resultado)} className="tabular-nums">
            {r.resultado}: {r.total}
          </Badge>
        ))}
      </div>

      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="text-base">Mensagens</CardTitle>
            <CardDescription>Mais recentes primeiro (até 100).</CardDescription>
          </div>
          <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-3">
            <Input placeholder="Buscar no texto" value={busca} onChange={(e) => setBusca(e.target.value)} />
            <Select value={resultado} onValueChange={setResultado}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={TODOS}>Todos os resultados</SelectItem>
                <SelectItem value="sucesso">Sucesso</SelectItem>
                <SelectItem value="bug">Erro interno</SelectItem>
                <SelectItem value="transitorio">Falha temporária</SelectItem>
                <SelectItem value="sem_credito">Sem crédito na IA</SelectItem>
              </SelectContent>
            </Select>
            <Select value={dias} onValueChange={setDias}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Últimas 24 horas</SelectItem>
                <SelectItem value="7">Últimos 7 dias</SelectItem>
                <SelectItem value="30">Últimos 30 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          )}
          {!isLoading && !data?.eventos?.length && (
            <p className="text-sm text-muted-foreground">Nenhuma mensagem no período.</p>
          )}
          {data?.eventos?.map((e) => (
            <div key={e.id} className="rounded-md border p-3">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="tabular-nums">{new Date(e.data_criacao).toLocaleString("pt-BR")}</span>
                <span>·</span>
                <span>{e.usuario_nome || (e.usuario_id ? `#${e.usuario_id}` : "sem usuário")}</span>
                {e.tipo_mensagem && <span>· {e.tipo_mensagem}</span>}
                <Badge variant={corResultado(e.resultado)} className="ml-auto">{e.resultado}</Badge>
              </div>
              {e.mensagem_raw && <p className="mt-2 whitespace-pre-wrap break-words text-sm">{e.mensagem_raw}</p>}
              {e.detalhe && <p className="mt-1 text-xs text-destructive">{e.etapa}: {e.detalhe}</p>}
              {!!e.decisoes?.length && (
                <ul className="mt-2 space-y-1 border-l pl-3">
                  {e.decisoes.map((d, i) => (
                    <li key={i} className="text-xs">
                      <span className={d.ok ? "font-medium" : "font-medium text-amber-700 dark:text-amber-400"}>{d.tool}</span>
                      <span className="text-muted-foreground"> — {resumoResultado(d)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
