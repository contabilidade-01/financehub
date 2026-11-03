import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

type Aviso = { id: number; titulo: string; texto: string; criado_em: string };

/** Links no texto viram clicáveis; o resto fica como texto puro (sem HTML). */
function TextoComLinks({ texto }: { texto: string }) {
  const partes = texto.split(/(https?:\/\/[^\s]+)/g);
  return (
    <>
      {partes.map((p, i) =>
        /^https?:\/\//.test(p) ? (
          <a key={i} href={p} className="underline font-medium" target="_blank" rel="noreferrer">
            {p}
          </a>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

/** Avisos enviados pelo admin com o canal "no app": ficam no topo até o cliente clicar em Entendi. */
export function AvisosNoApp() {
  const { isAuthenticated } = useAuth();
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["/api/avisos/meus"],
    enabled: isAuthenticated,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const r = await fetch("/api/avisos/meus", { credentials: "include" });
      if (!r.ok) return [] as Aviso[];
      return ((await r.json()).avisos || []) as Aviso[];
    },
  });
  const lido = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/avisos/${id}/lido`, { method: "POST", credentials: "include" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/avisos/meus"] }),
  });

  if (!data?.length) return null;
  return (
    <div className="space-y-3 mb-4">
      {data.map((a) => (
        <div key={a.id} role="status" className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <Megaphone className="h-5 w-5 mt-0.5 text-primary shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{a.titulo}</p>
              <p className="mt-1 text-sm whitespace-pre-wrap break-words">
                <TextoComLinks texto={a.texto} />
              </p>
              <Button size="sm" className="mt-3" disabled={lido.isPending} onClick={() => lido.mutate(a.id)}>
                Entendi
              </Button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
