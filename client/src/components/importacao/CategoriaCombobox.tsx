import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import type { Categoria } from "./api";

interface Props {
  categorias: Categoria[];
  tipo: "Receita" | "Despesa";
  valor: number | null;
  onChange: (id: number | null) => void;
  /** Cria uma categoria/conta nova com o texto digitado e devolve o id. */
  onCriar: (nome: string, tipo: "Receita" | "Despesa") => Promise<number | null>;
  escopo: "pf" | "pj";
  disabled?: boolean;
  className?: string;
  placeholder?: string;
}

/**
 * Escolha da categoria (PF) ou conta do plano de contas (PJ) com busca.
 * Mostra só as do tipo do lançamento (entrada → Receita, saída → Despesa) e
 * permite criar uma nova sem sair da tela.
 */
export function CategoriaCombobox({ categorias, tipo, valor, onChange, onCriar, escopo, disabled, className, placeholder }: Props) {
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [criando, setCriando] = useState(false);
  const doTipo = useMemo(
    () => categorias.filter((c) => c.tipo === tipo).sort((a, b) => (a.codigo || a.nome).localeCompare(b.codigo || b.nome, "pt-BR", { numeric: true })),
    [categorias, tipo],
  );
  const atual = categorias.find((c) => c.id === valor);
  const rotulo = (c: Categoria) => (escopo === "pj" && c.codigo ? `${c.codigo} ${c.nome}` : c.nome);
  const existeIgual = doTipo.some((c) => c.nome.toLowerCase() === busca.trim().toLowerCase());

  const criar = async () => {
    const nome = busca.trim();
    if (nome.length < 2) return;
    setCriando(true);
    try {
      const id = await onCriar(nome, tipo);
      if (id) {
        onChange(id);
        setAberto(false);
        setBusca("");
      }
    } finally {
      setCriando(false);
    }
  };

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <Button
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
      <PopoverContent className="w-[--radix-popover-trigger-width] min-w-[260px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar…" value={busca} onValueChange={setBusca} />
          <CommandList className="max-h-64">
            <CommandEmpty className="py-3 text-center text-sm text-muted-foreground">Nada encontrado.</CommandEmpty>
            <CommandGroup heading={tipo === "Receita" ? "Entradas" : "Saídas"}>
              {doTipo.map((c) => (
                <CommandItem key={c.id} value={`${rotulo(c)} ${c.id}`} onSelect={() => { onChange(c.id); setAberto(false); setBusca(""); }}>
                  <Check className={cn("mr-2 h-4 w-4", valor === c.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{rotulo(c)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {busca.trim().length >= 2 && !existeIgual && (
            <div className="border-t p-1">
              <Button type="button" variant="ghost" size="sm" className="w-full justify-start" disabled={criando} onClick={criar}>
                <Plus className="mr-2 h-4 w-4" />
                Criar {escopo === "pj" ? "conta" : "categoria"} “{busca.trim()}”
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
