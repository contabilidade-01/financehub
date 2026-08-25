import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useLocation } from "wouter";
import type { Empresa } from "@shared/schema";

import PjDashboard from "@/pages/pj/dashboard";
import PjTransactions from "@/pages/pj/transactions";
import PjCategorias from "@/pages/pj/categorias";
import PjEmpresas from "@/pages/pj/empresas";
import PjRelatorios from "@/pages/pj/relatorios";
import PjFaturas from "@/pages/pj/faturas";
import ConciliacaoPage from "@/pages/pj/conciliacao";
import MetasPage from "@/pages/metas";

/**
 * PjRouter — resolve a empresa ativa e renderiza o componente PJ correto.
 * Não interfere com rotas PF. Montado apenas em /p/*.
 * Se o usuário não tem empresas, redireciona para PjEmpresas (cadastro).
 */
export default function PjRouter() {
  const [location] = useLocation();

  const { data: empresas = [], isLoading } = useQuery<Empresa[]>({
    queryKey: ["/api/empresas"],
  });

  // Para multi-empresa: usa a primeira ativa (MVP). Futuramente: seletor.
  const [empresaSelecionada, setEmpresaSelecionada] = useState<number | null>(null);

  const empresaAtiva = empresaSelecionada ?? empresas[0]?.id ?? null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Carregando empresas...</p>
      </div>
    );
  }

  // Se nenhuma empresa, redirecionar para cadastro
  if (empresas.length === 0 || !empresaAtiva) {
    return <PjEmpresas />;
  }

  // Seletor de empresa (multi-empresa futuro)
  const EmpresaSelector = () => (
    empresas.length > 1 ? (
      <div className="px-4 py-2 border-b">
        <select
          className="text-sm border rounded px-2 py-1"
          value={empresaAtiva}
          onChange={(e) => setEmpresaSelecionada(Number(e.target.value))}
        >
          {empresas.map((emp) => (
            <option key={emp.id} value={emp.id}>
              {emp.nome_fantasia ?? emp.razao_social}
            </option>
          ))}
        </select>
      </div>
    ) : null
  );

  // Roteamento interno PJ
  const subPath = location.replace(/^\/p\/?/, "").split("/")[0] || "dashboard";

  const renderPage = () => {
    switch (subPath) {
      case "dashboard":
        return <PjDashboard empresaId={empresaAtiva} />;
      case "transacoes":
        return <PjTransactions empresaId={empresaAtiva} />;
      case "categorias":
        return <PjCategorias empresaId={empresaAtiva} />;
      case "empresas":
        return <PjEmpresas />;
      case "relatorios":
        return <PjRelatorios empresaId={empresaAtiva} />;
      case "faturas":
        return <PjFaturas empresaId={empresaAtiva} />;
      case "conciliacao":
        return <ConciliacaoPage empresaId={empresaAtiva} />;
      case "metas":
        // Metas escopadas pelo login (backend define empresa_id da empresa do login).
        return <MetasPage variant="pj" empresaId={empresaAtiva} />;
      default:
        return <PjDashboard empresaId={empresaAtiva} />;
    }
  };

  return (
    <div>
      <EmpresaSelector />
      {renderPage()}
    </div>
  );
}
