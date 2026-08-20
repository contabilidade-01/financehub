import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface Consentimento {
  id: number;
  usuario_id: number;
  nome: string;
  email: string;
  versao: string;
  aceito_em: string;
  ip: string | null;
  user_agent: string | null;
}

function formatarData(iso: string): string {
  try {
    return new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return iso;
  }
}

export default function AdminLgpd() {
  const { data, isLoading, error } = useQuery<Consentimento[]>({
    queryKey: ["/api/admin/lgpd/consentimentos"],
    queryFn: () => apiRequest("/api/admin/lgpd/consentimentos"),
  });

  const consentimentos = data || [];

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Consentimentos LGPD</h1>
        <p className="text-sm text-muted-foreground">
          Registro de aceite da Política de Privacidade por usuário — data, versão e origem, para
          comprovação legal.
        </p>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="p-3 border-b text-sm text-muted-foreground">
          Total de aceites: <strong>{consentimentos.length}</strong>
        </div>

        {isLoading && <div className="p-6 text-center text-muted-foreground">Carregando…</div>}
        {error && <div className="p-6 text-center text-red-500">Erro ao carregar os consentimentos.</div>}

        {!isLoading && !error && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left border-b bg-muted/40">
                  <th className="p-3 font-medium">Usuário</th>
                  <th className="p-3 font-medium">E-mail</th>
                  <th className="p-3 font-medium">Aceito em</th>
                  <th className="p-3 font-medium">Versão</th>
                  <th className="p-3 font-medium">IP</th>
                </tr>
              </thead>
              <tbody>
                {consentimentos.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted-foreground">
                      Nenhum consentimento registrado ainda.
                    </td>
                  </tr>
                )}
                {consentimentos.map((c) => (
                  <tr key={c.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-3 font-medium">{c.nome || `#${c.usuario_id}`}</td>
                    <td className="p-3 text-muted-foreground">{c.email}</td>
                    <td className="p-3 tabular-nums">{formatarData(c.aceito_em)}</td>
                    <td className="p-3">{c.versao}</td>
                    <td className="p-3 text-muted-foreground">{c.ip || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
