import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";

/** Espelho das constantes de server/services/feature-flags-logic.ts (nunca use literal solto). */
export const FLAG_IMPORTACAO_EXTRATO_V2 = "importacao_extrato_v2";

/** Flag ativa para o usuário logado. Super admin sempre vê (como no servidor). */
export function useFlag(chave: string): { ativa: boolean; carregando: boolean } {
  const { user } = useAuth() as { user?: { tipo_usuario?: string } };
  const superAdmin = user?.tipo_usuario === "super_admin";
  const { data, isLoading } = useQuery<{ flags: Record<string, boolean> }>({
    queryKey: ["minhas-flags"],
    enabled: !!user && !superAdmin,
    queryFn: async () => {
      const res = await fetch("/api/flags", { credentials: "include" });
      if (!res.ok) return { flags: {} };
      return res.json();
    },
    staleTime: 60_000,
  });
  if (superAdmin) return { ativa: true, carregando: false };
  return { ativa: !!data?.flags?.[chave], carregando: !!user && isLoading };
}
