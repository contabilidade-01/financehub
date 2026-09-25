import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Check, ChevronsUpDown, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { compararCodigos, grupoEfetivo, ROTULO_GRUPO } from "@shared/plano-contas-grupos";

export interface ContaOpcao {
  id: number;
  nome: string;
  tipo: "Receita" | "Despesa" | string;
  codigo?: string;
  parent_id?: number | null;
}

export interface GrupoPlano {
  id: number;
  codigo: string;
  nome: string;
  tipo: string;
  classificacao?: string | null;
  grupo_gerencial?: string | null;
}

type Tipo = "Receita" | "Despesa";

interface Props {
  categorias: ContaOpcao[];
  tipo: Tipo;
  valor: number | null;
  onChange: (id: number | null) => void;
  /** Cria a conta/categoria com o nome digitado (e o grupo escolhido, no PJ) e devolve o id. */
  onCriar?: (nome: string, tipo: Tipo, grupoId?: number | null) => Promise<number | null>;
  escopo: "pf" | "pj";
  /** Grupos do plano PJ: a lista sai agrupada e a conta nova pergunta o grupo. */
  grupos?: GrupoPlano[];
  disabled?: boolean;
  className?: string;
  placeholder?: string;
  id?: string;
}

/**
 * Escolha da categoria (PF) ou conta do plano (PJ) com busca, mostrando só as do
 * tipo do lançamento, e criação de conta nova sem sair do formulário.
 */
export function ContaPlanoCombobox({ categorias, tipo, valor, onChange, onCriar, escopo, grupos, disabled, className, placeholder, id }: Props) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [criando, setCriando] = useState(false);
  // Nome da conta a criar enquanto o usuário escolhe o grupo (passo 2 do popover).
  const [nomeNovo, setNomeNovo] = useState<string | null>(null);

  const doTipo = useMemo(
    () => categorias.filter((c) => c.tipo === tipo).sort((a, b) => compararCodigos(a.codigo || a.nome, b.codigo || b.nome)),
    [categorias, tipo],
  );
  const gruposDoTipo = useMemo(
    () => (grupos || [])
      .filter((g) => (tipo === "Receita" ? true : grupoEfetivo(g) !== "receita"))
      .sort((a, b) => {
        // Receita: grupos de receita primeiro; despesa: ordem do plano.
        if (tipo === "Receita") {
          const ra = grupoEfetivo(a) === "receita" ? 0 : 1;
          const rb = grupoEfetivo(b) === "receita" ? 0 : 1;
          if (ra !== rb) return ra - rb;
        }
        return compararCodigos(a.codigo, b.codigo);
      }),
    [grupos, tipo],
  );
  const secoes = useMemo(() => {
    if (!grupos?.length) return [{ id: 0, titulo: tipo === "Receita" ? "Entradas" : "Saídas", contas: doTipo }];
    const porGrupo = gruposDoTipo
      .map((g) => ({ id: g.id, titulo: `${g.codigo} ${g.nome}`, contas: doTipo.filter((c) => c.parent_id === g.id) }))
      .filter((s) => s.contas.length);
    const soltas = doTipo.filter((c) => !grupos.some((g) => g.id === c.parent_id));
    return soltas.length ? [...porGrupo, { id: -1, titulo: "Outras contas", contas: soltas }] : porGrupo;
  }, [grupos, gruposDoTipo, doTipo, tipo]);

  const atual = categorias.find((c) => c.id === valor);
  const rotulo = (c: ContaOpcao) => (escopo === "pj" && c.codigo ? `${c.codigo} ${c.nome}` : c.nome);
  const existeIgual = doTipo.some((c) => c.nome.toLowerCase() === busca.trim().toLowerCase());

  const fechar = () => {
    setAberto(false);
    setBusca("");
    setNomeNovo(null);
  };

  const criar = async (nome: string, grupoId?: number | null) => {
    if (!onCriar || nome.length < 2) return;
    setCriando(true);
    try {
      const novoId = await onCriar(nome, tipo, grupoId ?? null);
      if (novoId) {
        onChange(novoId);
        fechar();
      }
    } finally {
      setCriando(false);
    }
  };

  const pedirCriacao = () => {
    const nome = busca.trim();
    if (nome.length < 2) return;
    // Com grupos, a conta nova precisa de um lugar na árvore: pergunta antes.
    if (escopo === "pj" && gruposDoTipo.length) setNomeNovo(nome);
    else void criar(nome);
  };

  return (
    <Popover open={aberto} onOpenChange={(o) => (o ? setAberto(true) : fechar())}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={aberto}
          disabled={disabled}
          className={cn("h-9 w-full justify-between px-3 font-normal", !atual && "text-muted-foreground", className)}
        >
          <span className="truncate">{atual ? rotulo(atual) : placeholder || (escopo === "pj" ? "Conta do plano" : "Categoria")}</span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[280px] p-0" align="start">
        {nomeNovo !== null ? (
          <div className="p-1">
            <div className="flex items-center gap-1 px-1 py-1.5">
              <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Voltar" onClick={() => setNomeNovo(null)}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0 text-sm">
                <div className="truncate font-medium">Nova conta “{nomeNovo}”</div>
                <div className="text-xs text-muted-foreground">Em qual grupo ela entra?</div>
              </div>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {gruposDoTipo.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  disabled={criando}
                  onClick={() => criar(nomeNovo, g.id)}
                  className="flex w-full items-start gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent disabled:opacity-50"
                >
                  <span className="w-6 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">{g.codigo}</span>
                  <span className="min-w-0">
                    <span className="block truncate">{g.nome}</span>
                    <span className="block text-xs text-muted-foreground">{ROTULO_GRUPO[grupoEfetivo(g)]}</span>
                  </span>
                </button>
              ))}
            </div>
            {criando && <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Criando…</div>}
          </div>
        ) : (
          <Command>
            <CommandInput placeholder="Buscar…" value={busca} onValueChange={setBusca} />
            <CommandList className="max-h-64">
              <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">Nada encontrado.</CommandEmpty>
              {secoes.map((s) => (
                <CommandGroup key={s.id} heading={s.titulo}>
                  {s.contas.map((c) => (
                    <CommandItem key={c.id} value={`${rotulo(c)} ${c.id}`} onSelect={() => { onChange(c.id); fechar(); }}>
                      <Check className={cn("mr-2 h-4 w-4", valor === c.id ? "opacity-100" : "opacity-0")} />
                      <span className="truncate">{rotulo(c)}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
            {onCriar && busca.trim().length >= 2 && !existeIgual && (
              <div className="border-t p-1">
                <Button type="button" variant="ghost" size="sm" className="w-full justify-start" disabled={criando} onClick={pedirCriacao}>
                  <Plus className="mr-2 h-4 w-4" />
                  Criar {escopo === "pj" ? "conta" : "categoria"} “{busca.trim()}”
                </Button>
              </div>
            )}
          </Command>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Plano de contas PJ pronto para formulários: contas analíticas ativas, grupos
 * e a criação de conta nova (que já atualiza todas as telas que usam o plano).
 */
export function usePlanoContasPj(empresaId: number | null | undefined) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const base = `/api/empresas/${empresaId}/contas`;
  const { data: plano = [], isLoading } = useQuery<any[]>({
    queryKey: [`${base}?arvore=1`],
    queryFn: async () => {
      const r = await fetch(`${base}?arvore=1`, { credentials: "include" });
      if (!r.ok) throw new Error("Falha ao carregar o plano de contas");
      return r.json();
    },
    enabled: !!empresaId,
  });
  // Linhas completas do plano (EmpresaConta + lançamentos): servem de ContaOpcao e de conta para filtros.
  const contas = useMemo(() => plano.filter((c) => !c.sintetica && c.ativo) as (ContaOpcao & Record<string, any>)[], [plano]);
  const grupos: GrupoPlano[] = useMemo(() => plano.filter((c) => c.sintetica && c.ativo), [plano]);

  const criarConta = async (nome: string, tipo: Tipo, grupoId?: number | null): Promise<number | null> => {
    const grupo = grupos.find((g) => g.id === grupoId);
    const ge = grupo ? grupoEfetivo(grupo) : null;
    try {
      const r = await fetch(base, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome,
          tipo,
          parent_id: grupo?.id ?? null,
          classificacao: ge === "despesa_fixa" ? "FIXA" : ge === "custo_variavel" || ge === "deducao" ? "VARIAVEL" : "OUTRA",
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data?.error || "Erro ao criar a conta");
      await Promise.all([
        qc.invalidateQueries({ queryKey: [`${base}?arvore=1`] }),
        qc.invalidateQueries({ queryKey: [base] }),
      ]);
      toast({ title: `Conta ${data.codigo ? `${data.codigo} ` : ""}“${nome}” criada` });
      return data.id as number;
    } catch (e: any) {
      toast({ title: "Não foi possível criar a conta", description: e?.message, variant: "destructive" });
      return null;
    }
  };

  return { contas, grupos, criarConta, carregando: isLoading };
}
