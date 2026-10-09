import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { AlertTriangle, CalendarClock, Clock, Users, CalendarCheck, Percent, Flag, MessageSquare, Database, FileSearch } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";

type Assinatura = {
  id: number; nome: string; status_assinatura: string | null;
  situacao: string; dias_para_vencer: number | null;
};

/** Topo do painel: o que precisa de ação hoje + atalhos das tarefas do dia a dia. */
export function AdminAtencaoHoje() {
  const { data: lista = [] } = useQuery<Assinatura[]>({
    queryKey: ["/api/admin/assinaturas"],
    queryFn: () => apiRequest("/api/admin/assinaturas"),
  });

  const degustacaoAcabando = lista.filter(
    (a) => String(a.status_assinatura || "").startsWith("degustacao") && a.dias_para_vencer != null && a.dias_para_vencer >= 0 && a.dias_para_vencer <= 3,
  );
  const vencidos = lista.filter((a) => a.situacao === "vencido");
  const venceBreve = lista.filter((a) => a.situacao === "vence_breve" && !String(a.status_assinatura || "").startsWith("degustacao"));

  const cartoes = [
    { icon: Clock, titulo: "Degustação terminando (≤ 3 dias)", itens: degustacaoAcabando, cor: "text-blue-600", dica: "Converter em assinantes" },
    { icon: AlertTriangle, titulo: "Acesso vencido", itens: vencidos, cor: "text-expense", dica: "Cobrar ou renovar" },
    { icon: CalendarClock, titulo: "Assinantes vencendo (≤ 7 dias)", itens: venceBreve, cor: "text-amber-600", dica: "Conferir cobrança" },
  ];

  const atalhos = [
    { icon: Users, texto: "Usuários", path: "/admin/users" },
    { icon: CalendarCheck, texto: "Assinaturas", path: "/admin/assinaturas" },
    { icon: Percent, texto: "Asaas, multa e juros", path: "/admin/payment-settings" },
    { icon: Flag, texto: "Feature flags", path: "/admin/feature-flags" },
    { icon: MessageSquare, texto: "Simulador WhatsApp", path: "/admin/simular-whatsapp" },
    { icon: FileSearch, texto: "Auditoria da IA", path: "/admin/ia-auditoria" },
    { icon: Database, texto: "Backup", path: "/admin/database" },
  ];

  return (
    <div className="space-y-4 mb-8">
      <div className="grid gap-3 md:grid-cols-3">
        {cartoes.map((c) => (
          <Card key={c.titulo}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium flex items-center gap-2 text-foreground">
                <c.icon className={`h-4 w-4 ${c.cor}`} /> {c.titulo}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-2xl font-bold ${c.itens.length ? c.cor : "text-foreground"}`}>{c.itens.length}</div>
              {c.itens.length ? (
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {c.itens.slice(0, 4).map((a) => (
                    <li key={a.id} className="truncate">
                      {a.nome}
                      {a.dias_para_vencer != null && (
                        <span className="ml-1">({a.dias_para_vencer < 0 ? `há ${-a.dias_para_vencer}d` : a.dias_para_vencer === 0 ? "hoje" : `em ${a.dias_para_vencer}d`})</span>
                      )}
                    </li>
                  ))}
                  {c.itens.length > 4 && <li>e mais {c.itens.length - 4}…</li>}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-muted-foreground">Nada pendente</p>
              )}
              {c.itens.length > 0 && (
                <Link href="/admin/assinaturas" className="mt-2 inline-block text-xs font-medium text-primary hover:underline">{c.dica} →</Link>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {atalhos.map((a) => (
          <Link key={a.path} href={a.path} className="inline-flex items-center gap-1.5 rounded-md border bg-card px-3 py-1.5 text-sm hover:bg-muted">
            <a.icon className="h-4 w-4 text-muted-foreground" /> {a.texto}
          </Link>
        ))}
      </div>
    </div>
  );
}
