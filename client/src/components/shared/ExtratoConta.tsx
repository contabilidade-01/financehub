import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, Plus } from "lucide-react";
import * as XLSX from "xlsx";

export type LinhaExtrato = {
  id: number;
  descricao: string;
  valor: number | string;
  tipo: string;
  data_transacao: string;
  categoria?: string | null;
  categoria_codigo?: string | null;
  forma?: string | null;
  parcela_num?: number | null;
  parcela_total?: number | null;
  saldo?: number;
};

export type ExtratoContaData = {
  saldo_inicial?: number;
  saldo_final?: number;
  saldo?: number;
  entradas?: number;
  saidas?: number;
  lancamentos: LinhaExtrato[];
};

const money = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);

const dataBR = (s: string) => {
  const [y, m, d] = String(s).slice(0, 10).split("-");
  if (!y || !m || !d) return s;
  return `${d}/${m}/${y}`;
};

type Props = {
  titulo: string;
  periodoLabel?: string;
  loading?: boolean;
  data?: ExtratoContaData | null;
  onNovoLancamento?: () => void;
  onFechar?: () => void;
};

/** Extrato bancário compartilhado: saldo anterior, linhas com saldo, saldo final, XLSX. */
export default function ExtratoConta({
  titulo,
  periodoLabel,
  loading,
  data,
  onNovoLancamento,
  onFechar,
}: Props) {
  const linhas = data?.lancamentos || [];
  const saldoIni = Number(data?.saldo_inicial ?? 0);
  const saldoFim = Number(
    data?.saldo_final ??
      (linhas.length ? Number(linhas[linhas.length - 1]?.saldo ?? 0) : saldoIni),
  );

  const exportar = () => {
    const rows = [
      {
        Data: "",
        Histórico: "SALDO ANTERIOR",
        Forma: "",
        Valor: "",
        Saldo: saldoIni,
      },
      ...linhas.map((l) => {
        const valor = Number(l.valor) || 0;
        const receita = l.tipo === "Receita";
        const parcela =
          l.parcela_num && l.parcela_total && l.parcela_total > 1
            ? ` (${l.parcela_num}/${l.parcela_total})`
            : "";
        const cat = l.categoria
          ? ` · ${l.categoria_codigo ? `${l.categoria_codigo} — ` : ""}${l.categoria}`
          : "";
        return {
          Data: dataBR(l.data_transacao),
          Histórico: `${l.descricao}${parcela}${cat}`,
          Forma: l.forma || "",
          Valor: receita ? valor : -valor,
          Saldo: Number(l.saldo ?? 0),
        };
      }),
      {
        Data: "",
        Histórico: "SALDO FINAL",
        Forma: "",
        Valor: "",
        Saldo: saldoFim,
      },
    ];
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Extrato");
    XLSX.writeFile(wb, `extrato-${titulo.replace(/\s+/g, "-").toLowerCase()}.xlsx`);
  };

  if (loading) {
    return (
      <div className="space-y-2 py-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-0 flex-1 gap-2">
      <div>
        <p className="text-sm font-medium">{titulo}</p>
        {periodoLabel && (
          <p className="text-xs text-muted-foreground capitalize">{periodoLabel}</p>
        )}
      </div>

      <div className="rounded-lg border border-border/60 px-3 py-2 text-sm flex items-center justify-between">
        <span className="text-muted-foreground">Saldo anterior</span>
        <span className={saldoIni < 0 ? "text-red-500 font-semibold" : "font-semibold"}>
          {money(saldoIni)}
        </span>
      </div>

      <div className="overflow-y-auto flex-1 min-h-0 border rounded-lg">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-background border-b text-xs text-muted-foreground">
            <tr>
              <th className="text-left p-2 font-medium">Data</th>
              <th className="text-left p-2 font-medium">Histórico</th>
              <th className="text-left p-2 font-medium hidden sm:table-cell">Forma</th>
              <th className="text-right p-2 font-medium">Valor</th>
              <th className="text-right p-2 font-medium">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {linhas.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center text-muted-foreground py-8">
                  Nenhum lançamento neste período.
                </td>
              </tr>
            ) : (
              linhas.map((l) => {
                const valor = Number(l.valor) || 0;
                const receita = l.tipo === "Receita";
                const signed = receita ? valor : -valor;
                const parcela =
                  l.parcela_num && l.parcela_total && Number(l.parcela_total) > 1
                    ? ` (${l.parcela_num}/${l.parcela_total})`
                    : "";
                const cat = l.categoria
                  ? ` · ${l.categoria_codigo ? `${l.categoria_codigo} — ` : ""}${l.categoria}`
                  : "";
                const saldoLinha = Number(l.saldo ?? 0);
                return (
                  <tr key={l.id} className="border-b border-border/40">
                    <td className="p-2 whitespace-nowrap align-top">{dataBR(l.data_transacao)}</td>
                    <td className="p-2 align-top min-w-0">
                      <span className="font-medium">{l.descricao}{parcela}</span>
                      {cat && (
                        <span className="block text-xs text-muted-foreground truncate">{cat.slice(3)}</span>
                      )}
                    </td>
                    <td className="p-2 align-top text-xs whitespace-nowrap hidden sm:table-cell">
                      {l.forma || "—"}
                    </td>
                    <td
                      className={`p-2 text-right align-top font-medium whitespace-nowrap ${
                        signed < 0 ? "text-red-500" : "text-emerald-600"
                      }`}
                    >
                      {signed < 0 ? "−" : "+"}
                      {money(Math.abs(signed))}
                    </td>
                    <td
                      className={`p-2 text-right align-top whitespace-nowrap ${
                        saldoLinha < 0 ? "text-red-500" : ""
                      }`}
                    >
                      {money(saldoLinha)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-border/60 px-3 py-2 text-sm flex items-center justify-between">
        <span className="text-muted-foreground">Saldo final</span>
        <span className={saldoFim < 0 ? "text-red-500 font-semibold" : "font-semibold"}>
          {money(saldoFim)}
        </span>
      </div>

      {(data?.entradas != null || data?.saidas != null) && (
        <p className="text-xs text-muted-foreground">
          Entradas {money(Number(data?.entradas) || 0)} · Saídas {money(Number(data?.saidas) || 0)}
        </p>
      )}

      <div className="flex flex-wrap gap-2 justify-end pt-1">
        <Button type="button" variant="outline" size="sm" className="gap-1" onClick={exportar}>
          <Download className="h-4 w-4" />
          Exportar XLSX
        </Button>
        {onNovoLancamento && (
          <Button type="button" size="sm" className="gap-1" onClick={onNovoLancamento}>
            <Plus className="h-4 w-4" />
            Novo lançamento
          </Button>
        )}
        {onFechar && (
          <Button type="button" variant="outline" size="sm" onClick={onFechar}>
            Fechar
          </Button>
        )}
      </div>
    </div>
  );
}
