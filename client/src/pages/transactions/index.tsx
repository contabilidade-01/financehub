import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Transaction, TransactionStatus, TransactionType, Category, PaymentMethod } from "@shared/schema";
import { TransactionForm } from "@/components/shared/TransactionForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useWebSocket } from "@/hooks/useWebSocket";
import { BadgeStack } from "@/components/shared/TransactionBadge";
import { TransactionRow } from "@/components/shared/TransactionRow";
import { TransactionCard } from "@/components/shared/TransactionCard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  X,
  FilterIcon,
  MoreVertical,
  PlusIcon,
  Trash2Icon,
  PencilIcon,
  ChevronDown,
  Check,
  CheckCircle2,
  RotateCcw,
  FileSpreadsheet,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useTheme } from "next-themes";
import { useTranslation } from "@/contexts/LocalizationContext";
import { translateCategoryName, translatePaymentMethodName } from "@/utils/localization";
import { motion, AnimatePresence } from "framer-motion";

// Custom dropdown components with proper positioning - copied from working modal
function TypeFilterDropdown({ value, onChange, t }: { value: string; onChange: (value: string) => void; t: (key: string, fallback: string) => string }) {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const getDisplayText = () => {
    switch (value) {
      case TransactionType.INCOME:
        return t('transactions.filters.income', 'Receitas');
      case TransactionType.EXPENSE:
        return t('transactions.filters.expense', 'Despesas');
      default:
        return t('transactions.filters.all_types', 'Todos os tipos');
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-muted-foreground">{t('transactions.filters.type', 'Tipo')}</label>
      <div ref={selectRef} className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex h-10 w-[160px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <span>{getDisplayText()}</span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </button>
        
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 rounded-md border bg-popover text-popover-foreground shadow-md max-h-[300px] overflow-y-auto">
            <div className="p-1">
              <button
                type="button"
                className="relative flex w-full items-center rounded-sm py-1.5 pl-8 pr-2 text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  onChange("all");
                  setIsOpen(false);
                }}
              >
                {value === "all" && (
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    <Check className="h-4 w-4" />
                  </span>
                )}
                {t('transactions.filters.all_types', 'Todos os tipos')}
              </button>
              <button
                type="button"
                className="relative flex w-full items-center rounded-sm py-1.5 pl-8 pr-2 text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  onChange(TransactionType.INCOME);
                  setIsOpen(false);
                }}
              >
                {value === TransactionType.INCOME && (
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    <Check className="h-4 w-4" />
                  </span>
                )}
                {t('transactions.filters.income', 'Receitas')}
              </button>
              <button
                type="button"
                className="relative flex w-full items-center rounded-sm py-1.5 pl-8 pr-2 text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  onChange(TransactionType.EXPENSE);
                  setIsOpen(false);
                }}
              >
                {value === TransactionType.EXPENSE && (
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    <Check className="h-4 w-4" />
                  </span>
                )}
                {t('transactions.filters.expense', 'Despesas')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Status filter dropdown with proper positioning
function StatusFilterDropdown({ value, onChange, t }: { value: string; onChange: (value: string) => void; t: (key: string, fallback: string) => string }) {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const getDisplayText = () => {
    switch (value) {
      case TransactionStatus.COMPLETED:
        return t('transactions.filters.completed', 'Efetivadas');
      case TransactionStatus.PENDING:
        return t('transactions.filters.pending', 'Pendentes');
      case TransactionStatus.SCHEDULED:
        return t('transactions.filters.scheduled', 'Agendadas');
      case TransactionStatus.CANCELED:
        return t('transactions.filters.cancelled', 'Canceladas');
      default:
        return t('transactions.filters.all_status', 'Todos os status');
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-muted-foreground">{t('transactions.filters.status', 'Status')}</label>
      <div ref={selectRef} className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex h-10 w-[170px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <span>{getDisplayText()}</span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </button>
        
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 rounded-md border bg-popover text-popover-foreground shadow-md max-h-[300px] overflow-y-auto">
            <div className="p-1">
              <button
                type="button"
                className="relative flex w-full items-center rounded-sm py-1.5 pl-8 pr-2 text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  onChange("all");
                  setIsOpen(false);
                }}
              >
                {value === "all" && (
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    <Check className="h-4 w-4" />
                  </span>
                )}
                {t('transactions.filters.all_status', 'Todos os status')}
              </button>
              <button
                type="button"
                className="relative flex w-full items-center rounded-sm py-1.5 pl-8 pr-2 text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  onChange(TransactionStatus.COMPLETED);
                  setIsOpen(false);
                }}
              >
                {value === TransactionStatus.COMPLETED && (
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    <Check className="h-4 w-4" />
                  </span>
                )}
                {t('transactions.filters.completed', 'Efetivadas')}
              </button>
              <button
                type="button"
                className="relative flex w-full items-center rounded-sm py-1.5 pl-8 pr-2 text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  onChange(TransactionStatus.PENDING);
                  setIsOpen(false);
                }}
              >
                {value === TransactionStatus.PENDING && (
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    <Check className="h-4 w-4" />
                  </span>
                )}
                {t('transactions.filters.pending', 'Pendentes')}
              </button>
              <button
                type="button"
                className="relative flex w-full items-center rounded-sm py-1.5 pl-8 pr-2 text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  onChange(TransactionStatus.SCHEDULED);
                  setIsOpen(false);
                }}
              >
                {value === TransactionStatus.SCHEDULED && (
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    <Check className="h-4 w-4" />
                  </span>
                )}
                {t('transactions.filters.scheduled', 'Agendadas')}
              </button>
              <button
                type="button"
                className="relative flex w-full items-center rounded-sm py-1.5 pl-8 pr-2 text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  onChange(TransactionStatus.CANCELED);
                  setIsOpen(false);
                }}
              >
                {value === TransactionStatus.CANCELED && (
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    <Check className="h-4 w-4" />
                  </span>
                )}
                {t('transactions.filters.cancelled', 'Canceladas')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Category filter dropdown with proper positioning
function CategoryFilterDropdown({ 
  value, 
  onChange, 
  categories,
  t
}: { 
  value: string; 
  onChange: (value: string) => void;
  categories: Category[];
  t: (key: string, fallback: string) => string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const getDisplayText = () => {
    if (value === "all") return t('transactions.filters.all_categories', 'Todas as categorias');
    const category = categories.find(cat => cat.id.toString() === value);
    return category ? translateCategoryName(category.nome, t) : t('transactions.filters.all_categories', 'Todas as categorias');
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-muted-foreground">{t('transactions.filters.category', 'Categoria')}</label>
      <div ref={selectRef} className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex h-10 w-[180px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <span>{getDisplayText()}</span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </button>
        
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 rounded-md border bg-popover text-popover-foreground shadow-md max-h-[300px] overflow-y-auto">
            <div className="p-1">
              <button
                type="button"
                className="relative flex w-full items-center rounded-sm py-1.5 pl-8 pr-2 text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  onChange("all");
                  setIsOpen(false);
                }}
              >
                {value === "all" && (
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    <Check className="h-4 w-4" />
                  </span>
                )}
                {t('transactions.filters.all_categories', 'Todas as categorias')}
              </button>
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className="relative flex w-full items-center rounded-sm py-1.5 pl-8 pr-2 text-sm hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    onChange(category.id.toString());
                    setIsOpen(false);
                  }}
                >
                  {value === category.id.toString() && (
                    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                      <Check className="h-4 w-4" />
                    </span>
                  )}
                  <div className="flex items-center">
                    <div 
                      className="w-3 h-3 rounded-full mr-2" 
                      style={{ backgroundColor: category.cor || "#6C63FF" }}
                    ></div>
                    {translateCategoryName(category.nome, t)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Payment method filter dropdown with proper positioning
function PaymentMethodFilterDropdown({ 
  value, 
  onChange, 
  paymentMethods,
  t
}: { 
  value: string; 
  onChange: (value: string) => void;
  paymentMethods: PaymentMethod[];
  t: (key: string, fallback: string) => string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const getDisplayText = () => {
    if (value === "all") return t('transactions.filters.all_payment_methods', 'Todas as formas');
    const method = paymentMethods.find(pm => pm.id.toString() === value);
    return method ? translatePaymentMethodName(method.nome, t) : t('transactions.filters.all_payment_methods', 'Todas as formas');
  };

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-muted-foreground">{t('transactions.filters.payment_method', 'Forma de Pagamento')}</label>
      <div ref={selectRef} className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex h-10 w-[190px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <span>{getDisplayText()}</span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </button>
        
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 rounded-md border bg-popover text-popover-foreground shadow-md max-h-[300px] overflow-y-auto">
            <div className="p-1">
              <button
                type="button"
                className="relative flex w-full items-center rounded-sm py-1.5 pl-8 pr-2 text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => {
                  onChange("all");
                  setIsOpen(false);
                }}
              >
                {value === "all" && (
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                    <Check className="h-4 w-4" />
                  </span>
                )}
                {t('transactions.filters.all_payment_methods', 'Todas as formas')}
              </button>
              {paymentMethods.map((method) => (
                <button
                  key={method.id}
                  type="button"
                  className="relative flex w-full items-center rounded-sm py-1.5 pl-8 pr-2 text-sm hover:bg-accent hover:text-accent-foreground"
                  onClick={() => {
                    onChange(method.id.toString());
                    setIsOpen(false);
                  }}
                >
                  {value === method.id.toString() && (
                    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                      <Check className="h-4 w-4" />
                    </span>
                  )}
                  {translatePaymentMethodName(method.nome, t)}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const ActionsDropdown = ({ onEdit, onDelete, t }: { onEdit: () => void; onDelete: () => void; t: (key: string, fallback: string) => string }) => {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  return (
    <div ref={selectRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      
      {isOpen && (
        <div className="absolute z-50 right-0 mt-1 rounded-md border bg-popover text-popover-foreground shadow-md min-w-[120px]">
          <div className="p-1">
            <button
              type="button"
              className="relative flex w-full items-center rounded-sm py-1.5 pl-8 pr-2 text-sm hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                onEdit();
                setIsOpen(false);
              }}
            >
              <PencilIcon className="absolute left-2 h-4 w-4" />
              {t('common.edit', 'Editar')}
            </button>
            <button
              type="button"
              className="relative flex w-full items-center rounded-sm py-1.5 pl-8 pr-2 text-sm hover:bg-accent hover:text-accent-foreground"
              onClick={() => {
                onDelete();
                setIsOpen(false);
              }}
            >
              <Trash2Icon className="absolute left-2 h-4 w-4" />
              {t('common.delete', 'Excluir')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

type Periodo = "all" | "current_month" | "previous_month" | "next_month" | "year" | "custom";
type Ordenacao = "data_desc" | "data_asc" | "valor_desc" | "valor_asc";

function PeriodFilterDropdown({
  value, onChange, t,
}: { value: Periodo; onChange: (v: Periodo) => void; t: (key: string, fallback: string) => string }) {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const opcoes: { id: Periodo; label: string }[] = [
    { id: "current_month", label: t('transactions.filters.current_month', 'Mês vigente') },
    { id: "previous_month", label: 'Mês anterior' },
    { id: "next_month", label: t('transactions.filters.next_month', 'Próximo mês') },
    { id: "year", label: 'Ano corrente' },
    { id: "all", label: t('transactions.filters.all_periods', 'Tudo') },
    { id: "custom", label: t('transactions.filters.custom_period', 'Personalizado') },
  ];
  const atual = opcoes.find((o) => o.id === value) ?? opcoes[0];

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-muted-foreground">{t('transactions.filters.period', 'Período')}</label>
      <div ref={selectRef} className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex h-10 w-[170px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <span>{atual.label}</span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </button>

        {isOpen && (
          <div className="absolute z-50 w-full mt-1 rounded-md border bg-popover text-popover-foreground shadow-md max-h-[300px] overflow-y-auto">
            <div className="p-1">
              {opcoes.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className="relative flex w-full items-center rounded-sm py-1.5 pl-8 pr-2 text-sm hover:bg-accent hover:text-accent-foreground"
                  onClick={() => { onChange(o.id); setIsOpen(false); }}
                >
                  {value === o.id && (
                    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                      <Check className="h-4 w-4" />
                    </span>
                  )}
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SortFilterDropdown({
  value, onChange,
}: { value: Ordenacao; onChange: (v: Ordenacao) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const selectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (selectRef.current && !selectRef.current.contains(event.target as Node)) setIsOpen(false);
    };
    if (isOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const opcoes: { id: Ordenacao; label: string }[] = [
    { id: "data_desc", label: "Data ↓" },
    { id: "data_asc", label: "Data ↑" },
    { id: "valor_desc", label: "Valor ↓" },
    { id: "valor_asc", label: "Valor ↑" },
  ];
  const atual = opcoes.find((o) => o.id === value) ?? opcoes[0];

  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-muted-foreground">Ordenação</label>
      <div ref={selectRef} className="relative">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex h-10 w-[130px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <span>{atual.label}</span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </button>
        {isOpen && (
          <div className="absolute z-50 w-full mt-1 rounded-md border bg-popover text-popover-foreground shadow-md">
            <div className="p-1">
              {opcoes.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  className="relative flex w-full items-center rounded-sm py-1.5 pl-8 pr-2 text-sm hover:bg-accent hover:text-accent-foreground"
                  onClick={() => { onChange(o.id); setIsOpen(false); }}
                >
                  {value === o.id && (
                    <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                      <Check className="h-4 w-4" />
                    </span>
                  )}
                  {o.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SubtotalCard({
  label, value, tone, hint,
}: { label: string; value: string; tone: "neutral" | "income" | "expense"; hint?: string }) {
  const cor =
    tone === "income" ? "text-emerald-500"
    : tone === "expense" ? "text-rose-500"
    : "text-foreground";
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <p className="text-[11px] font-label text-muted-foreground">{label}</p>
      <p className={`mt-1 text-xl font-numeric font-semibold ${cor}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

// AAAA-MM-DD do primeiro/último dia do mês, com offset de meses.
function limitesDoMes(offsetMeses: number): { de: string; ate: string } {
  const hoje = new Date();
  const inicio = new Date(hoje.getFullYear(), hoje.getMonth() + offsetMeses, 1);
  const fim = new Date(hoje.getFullYear(), hoje.getMonth() + offsetMeses + 1, 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return { de: iso(inicio), ate: iso(fim) };
}

function limitesDoAno(): { de: string; ate: string } {
  const y = new Date().getFullYear();
  return { de: `${y}-01-01`, ate: `${y}-12-31` };
}

function pmEhCartao(pm: PaymentMethod | undefined) {
  if (!pm) return false;
  return pm.dia_fechamento != null && pm.dia_vencimento != null;
}

// Data de referência da transação: vencimento quando existe (conta a pagar).
function dataRef(t: Transaction): string {
  const v = (t as any).data_vencimento || t.data_transacao;
  return String(v).slice(0, 10);
}

export default function Transactions() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const [isTransactionFormOpen, setIsTransactionFormOpen] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null);
  const [deletingTransaction, setDeletingTransaction] = useState<Transaction | null>(null);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [paymentMethodFilter, setPaymentMethodFilter] = useState<string>("all");
  const [periodFilter, setPeriodFilter] = useState<Periodo>("current_month");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [searchQuery, setSearchQuery] = useState("");
  const [valorMin, setValorMin] = useState("");
  const [valorMax, setValorMax] = useState("");
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("data_desc");
  const { toast } = useToast();
  
  // WebSocket para atualizações em tempo real
  const { isConnected, connectionError, badges, dismissBadge, clearAllBadges, markAsViewed, totalCount, shakingTransactions, triggerTransactionShake, clearTransactionShake } = useWebSocket();

  const { data: transactions, isLoading, refetch } = useQuery<Transaction[]>({
    queryKey: ["/api/transactions"]
  });
  
  // Log quando transações são carregadas
  useEffect(() => {
    if (transactions) {
      console.log('[Transactions] Query executada com sucesso:', transactions.length, 'transações');
    }
  }, [transactions]);
  
  // Buscar as categorias para exibir o nome correto na tabela
  const { data: categories } = useQuery<Category[]>({
    queryKey: ["/api/categories"]
  });

  // Buscar as formas de pagamento para o filtro
  const { data: paymentMethods } = useQuery<PaymentMethod[]>({
    queryKey: ["/api/payment-methods"]
  });

  const getStatusLabel = (status: TransactionStatus) => {
    switch (status) {
      case TransactionStatus.COMPLETED:
        return t('transactions.filters.completed', 'Efetivadas');
      case TransactionStatus.PENDING:
        return t('transactions.filters.pending', 'Pendentes');
      case TransactionStatus.SCHEDULED:
        return t('transactions.filters.scheduled', 'Agendadas');
      case TransactionStatus.CANCELED:
        return t('transactions.filters.cancelled', 'Canceladas');
      default:
        return status;
    }
  };

  const getPaymentMethodDisplay = (transaction: Transaction) => {
    const method = paymentMethods?.find((m) => m.id === transaction.forma_pagamento_id);
    if (method) {
      const nome = translatePaymentMethodName(method.nome, t);
      return pmEhCartao(method) ? `CC ${nome}` : nome;
    }
    if (transaction.metodo_pagamento) {
      return translatePaymentMethodName(transaction.metodo_pagamento, t);
    }
    return getPaymentMethodName(transaction.forma_pagamento_id ?? null);
  };

  const filteredTransactions = (transactions || [])
    .filter((transaction) => {
    const matchesType = typeFilter === "all" || transaction.tipo === typeFilter;
    const matchesStatus = statusFilter === "all" || transaction.status === statusFilter;
    const matchesCategory = categoryFilter === "all" || transaction.categoria_id?.toString() === categoryFilter;
    
    // Handle payment method filtering - check both forma_pagamento_id and metodo_pagamento text field
    let matchesPaymentMethod = false;
    if (paymentMethodFilter === "all") {
      matchesPaymentMethod = true;
    } else {
      const selectedPaymentMethod = paymentMethods?.find(pm => pm.id.toString() === paymentMethodFilter);
      if (selectedPaymentMethod) {
        // Check both foreign key reference and text field
        const matchesById = transaction.forma_pagamento_id?.toString() === paymentMethodFilter;
        const matchesByName = transaction.metodo_pagamento === selectedPaymentMethod.nome;
        matchesPaymentMethod = matchesById || matchesByName;
      }
    }
    
    const matchesSearch = searchQuery === "" || 
      transaction.descricao.toLowerCase().includes(searchQuery.toLowerCase());

    let matchesPeriodo = true;
    if (periodFilter !== "all") {
      const { de, ate } =
        periodFilter === "current_month" ? limitesDoMes(0)
        : periodFilter === "previous_month" ? limitesDoMes(-1)
        : periodFilter === "next_month" ? limitesDoMes(1)
        : periodFilter === "year" ? limitesDoAno()
        : { de: customFrom, ate: customTo };
      const d = dataRef(transaction);
      if (de && d < de) matchesPeriodo = false;
      if (ate && d > ate) matchesPeriodo = false;
    }

    const absValor = Math.abs(Number(transaction.valor) || 0);
    const minOk = valorMin === "" || absValor >= Number(valorMin);
    const maxOk = valorMax === "" || absValor <= Number(valorMax);

    return matchesType && matchesStatus && matchesCategory && matchesPaymentMethod && matchesSearch && matchesPeriodo && minOk && maxOk;
  })
  .slice()
  .sort((a, b) => {
    if (ordenacao === "data_asc" || ordenacao === "data_desc") {
      const da = dataRef(a);
      const db = dataRef(b);
      return ordenacao === "data_asc" ? da.localeCompare(db) : db.localeCompare(da);
    }
    const va = Math.abs(Number(a.valor) || 0);
    const vb = Math.abs(Number(b.valor) || 0);
    return ordenacao === "valor_asc" ? va - vb : vb - va;
  });

  // Subtotais do que está visível na lista (respeita todos os filtros).
  const subtotais = filteredTransactions.reduce(
    (acc, t) => {
      const v = Number(t.valor) || 0;
      if (t.tipo === TransactionType.INCOME) acc.receitas += v;
      else if ((t as any).reembolsavel) acc.aReceber += v;
      else acc.despesas += v;
      if (t.status === TransactionStatus.PENDING || t.status === TransactionStatus.SCHEDULED) {
        if (t.tipo === TransactionType.INCOME) acc.abertoReceitas += v;
        else if (!(t as any).reembolsavel) acc.abertoDespesas += v;
      }
      acc.qtd++;
      return acc;
    },
    { receitas: 0, despesas: 0, aReceber: 0, abertoReceitas: 0, abertoDespesas: 0, qtd: 0 },
  );
  const saldoFiltrado = subtotais.receitas - subtotais.despesas;
  const saldoEmAberto = subtotais.abertoReceitas - subtotais.abertoDespesas;

  const handleDeleteTransaction = async (id: number) => {
    try {
      await apiRequest(`/api/transactions/${id}`, {
        method: "DELETE"
      });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/payment-methods/totals"] });
      toast({
        title: t('transactions.transaction_deleted', 'Transação excluída'),
        description: t('transactions.delete_success', 'A transação foi excluída com sucesso.'),
      });
      setDeletingTransaction(null);
    } catch (error) {
      toast({
        title: t('transactions.error', 'Erro'),
        description: t('transactions.delete_error', 'Não foi possível excluir a transação.'),
        variant: "destructive",
      });
    }
  };

  const handlePagar = async (id: number) => {
    try {
      await apiRequest(`/api/transactions/${id}/pagar`, { method: "PUT" });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vencimentos"] });
      toast({ title: "Baixa realizada" });
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "Não foi possível baixar", variant: "destructive" });
    }
  };

  const handleReabrir = async (id: number) => {
    try {
      await apiRequest(`/api/transactions/${id}/reabrir`, { method: "PUT" });
      queryClient.invalidateQueries({ queryKey: ["/api/transactions"] });
      queryClient.invalidateQueries({ queryKey: ["/api/wallet/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vencimentos"] });
      toast({ title: "Lançamento reaberto" });
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message || "Não foi possível reabrir", variant: "destructive" });
    }
  };

  const exportXlsx = async () => {
    try {
      const XLSX = await import("xlsx");
      const rows = filteredTransactions.map((t) => ({
        Data: formatDate(t.data_transacao),
        Descrição: t.descricao,
        Tipo: t.tipo,
        Valor: Number(t.valor) || 0,
        Status: getStatusLabel(t.status),
        Forma: getPaymentMethodDisplay(t),
        Classificação: getCategoryName(t.categoria_id ?? null),
        Parcela:
          (t as any).parcela_num && (t as any).parcela_total
            ? `${(t as any).parcela_num}/${(t as any).parcela_total}`
            : "",
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Lançamentos");
      XLSX.writeFile(wb, `lancamentos-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } catch (e: any) {
      toast({ title: "Erro ao exportar", description: e?.message, variant: "destructive" });
    }
  };

  const editTransaction = (transaction: Transaction) => {
    setEditingTransaction(transaction);
    setIsTransactionFormOpen(true);
  };

  const getCategoryName = (categoryId: number | null) => {
    if (!categoryId) return t('transactions.table.uncategorized', 'Sem categoria');
    const category = categories?.find(c => c.id === categoryId);
    return category ? translateCategoryName(category.nome, t) : t('transactions.table.category_not_found', 'Categoria não encontrada');
  };

  const getPaymentMethodName = (paymentMethodId: number | null) => {
    if (!paymentMethodId) return t('transactions.table.not_specified', 'Não informado');
    const method = paymentMethods?.find(m => m.id === paymentMethodId);
    return method ? translatePaymentMethodName(method.nome, t) : t('transactions.table.method_not_found', 'Método não encontrado');
  };

  // Limpar badges quando transações são carregadas (usuário visualizou a lista)
  useEffect(() => {
    if (transactions && transactions.length > 0) {
      markAsViewed();
    }
  }, [transactions, markAsViewed]);

  return (
    <>
      <header className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div className="mb-4 md:mb-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl md:text-3xl font-bold mb-1">{t('transactions.title', 'Transações')}</h1>
              {/* Indicador de conexão WebSocket */}
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'} animate-pulse`}></div>
                <span className="text-xs text-gray-400">
                  {isConnected ? t('transactions.realtime_active', 'Tempo real ativo') : t('transactions.disconnected', 'Desconectado')}
                </span>
              </div>
            </div>
            {/* Badges de novas transações */}
            {badges.length > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <BadgeStack badges={badges} onDismiss={dismissBadge} />
                {totalCount > 1 && (
                  <button
                    onClick={clearAllBadges}
                    className="text-xs text-gray-400 hover:text-gray-300 underline transition-colors"
                  >
                    {t('transactions.clear_all', 'Limpar todas')} ({totalCount})
                  </button>
                )}
              </div>
            )}
            <p className="text-gray-400">{t('transactions.subtitle', 'Gerencie suas transações financeiras')}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportXlsx} disabled={filteredTransactions.length === 0}>
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              XLSX
            </Button>
            <Button onClick={() => {
              setEditingTransaction(null);
              setIsTransactionFormOpen(true);
            }} className="neon-border">
              <PlusIcon className="mr-2 h-4 w-4" />
              {t('transactions.new_transaction', 'Nova Transação')}
            </Button>
            
            {false && (
            /* Botão de teste temporário */
            <Button 
              onClick={() => {
                console.log('[TESTE] Status WebSocket:', { isConnected, connectionError });
                console.log('[TESTE] Shaking transactions:', shakingTransactions);
                console.log('[TESTE] Badges:', badges);
                console.log('[TESTE] Transações atuais:', transactions?.length);
                
                // Testar shake manual
                if (transactions && transactions.length > 0) {
                  const firstTransaction = transactions[0];
                  triggerTransactionShake(firstTransaction.id);
                  console.log('[TESTE] Shake ativado para transação:', firstTransaction.id);
                }
              }} 
              variant="outline"
              className="text-xs"
            >
              🧪 Teste
            </Button>
            )}
          </div>
        </div>
      </header>

      <div className={`glass-card neon-border rounded-2xl ${theme === 'light' ? 'bg-white' : ''}`}>
        <div className={`p-5 ${theme === 'light' ? 'text-gray-900' : ''}`}>
          <div className="flex flex-col md:flex-row gap-4 mb-6 md:items-end">
            <div className="flex-1">
              <label className="text-sm font-medium text-muted-foreground block mb-1">
                {t('transactions.filters.search_label', 'Busca')}
              </label>
              <Input
                placeholder={t('transactions.filters.search_placeholder', 'Buscar transações...')}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-dark-purple/10 h-10"
              />
            </div>
            <div className="flex flex-wrap gap-4">
              <TypeFilterDropdown
                value={typeFilter}
                onChange={setTypeFilter}
                t={t}
              />

              <StatusFilterDropdown
                value={statusFilter}
                onChange={setStatusFilter}
                t={t}
              />

              <CategoryFilterDropdown
                value={categoryFilter}
                onChange={setCategoryFilter}
                categories={categories || []}
                t={t}
              />

              <PaymentMethodFilterDropdown
                value={paymentMethodFilter}
                onChange={setPaymentMethodFilter}
                paymentMethods={paymentMethods || []}
                t={t}
              />

              <PeriodFilterDropdown value={periodFilter} onChange={setPeriodFilter} t={t} />

              <SortFilterDropdown value={ordenacao} onChange={setOrdenacao} />

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-muted-foreground">Valor mín</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  value={valorMin}
                  onChange={(e) => setValorMin(e.target.value)}
                  className="h-10 w-[110px] bg-dark-purple/10"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-muted-foreground">Valor máx</label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="∞"
                  value={valorMax}
                  onChange={(e) => setValorMax(e.target.value)}
                  className="h-10 w-[110px] bg-dark-purple/10"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-muted-foreground">{t('transactions.table.actions', 'Ações')}</label>
                <div className="h-10 flex items-center justify-end">
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setTypeFilter("all");
                      setStatusFilter("all");
                      setCategoryFilter("all");
                      setPaymentMethodFilter("all");
                      setPeriodFilter("current_month");
                      setCustomFrom("");
                      setCustomTo("");
                      setSearchQuery("");
                      setValorMin("");
                      setValorMax("");
                      setOrdenacao("data_desc");
                    }}
                    className="bg-dark-purple/10"
                  >
                    {t('transactions.filters.clear_filters', 'Limpar Filtros')}
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {periodFilter === "custom" && (
            <div className="flex flex-wrap items-end gap-4 mb-6">
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-muted-foreground">{t('transactions.filters.date_from', 'De')}</label>
                <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="h-10 w-[170px] bg-dark-purple/10" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-sm font-medium text-muted-foreground">{t('transactions.filters.date_to', 'Até')}</label>
                <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="h-10 w-[170px] bg-dark-purple/10" />
              </div>
            </div>
          )}

          {/* Subtotais do resultado filtrado */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <SubtotalCard
              label="Total Receitas"
              value={formatCurrency(subtotais.receitas)}
              tone="income"
            />
            <SubtotalCard
              label="Total Despesas"
              value={formatCurrency(subtotais.despesas)}
              tone="expense"
            />
            <SubtotalCard
              label="Saldo em aberto"
              value={formatCurrency(saldoEmAberto)}
              tone={saldoEmAberto >= 0 ? "income" : "expense"}
              hint="Somente não baixados"
            />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <SubtotalCard
              label="Lançamentos (incl. baixados)"
              value={String(subtotais.qtd)}
              tone="neutral"
            />
            <SubtotalCard
              label="Receitas (incl. baixados)"
              value={formatCurrency(subtotais.receitas)}
              tone="income"
            />
            <SubtotalCard
              label="Despesas (incl. baixados)"
              value={formatCurrency(subtotais.despesas)}
              tone="expense"
              hint={subtotais.aReceber > 0
                ? `${t('transactions.subtotal.reimbursable', 'A receber')}: ${formatCurrency(subtotais.aReceber)}`
                : undefined}
            />
            <SubtotalCard
              label="Saldo (incl. baixados)"
              value={formatCurrency(saldoFiltrado)}
              tone={saldoFiltrado >= 0 ? "income" : "expense"}
            />
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr>
                    <th className="text-left pb-4 text-xs font-label text-gray-400">{t('transactions.table.description', 'DESCRIÇÃO')}</th>
                    <th className="text-left pb-4 text-xs font-label text-gray-400">FORMA</th>
                    <th className="text-left pb-4 text-xs font-label text-gray-400">{t('transactions.table.category', 'CATEGORIA')}</th>
                    <th className="text-left pb-4 text-xs font-label text-gray-400">{t('transactions.table.date', 'DATA')}</th>
                    <th className="text-left pb-4 text-xs font-label text-gray-400">{t('transactions.table.value', 'VALOR')}</th>
                    <th className="text-left pb-4 text-xs font-label text-gray-400">{t('transactions.table.status', 'STATUS')}</th>
                    <th className="text-right pb-4 text-xs font-label text-gray-400">{t('transactions.table.actions', 'AÇÕES')}</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading ? (
                    <tr>
                      <td colSpan={7} className="py-4 text-center">{t('common.loading', 'Carregando...')}</td>
                    </tr>
                  ) : filteredTransactions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-4 text-center">{t('transactions.table.no_transactions', 'Nenhuma transação encontrada')}</td>
                    </tr>
                  ) : (
                    filteredTransactions.map((transaction) => (
                      <TransactionRow 
                        key={transaction.id} 
                        isShaking={shakingTransactions.has(transaction.id)}
                        className="cursor-pointer border-t border-white/5"
                      >
                        <td className="py-4 pr-4">
                          <div className="flex items-center">
                            <div className={`w-8 h-8 rounded-full ${transaction.tipo === TransactionType.INCOME ? 'bg-green-500/20' : 'bg-red-500/20'} flex items-center justify-center mr-3`}>
                              {transaction.tipo === TransactionType.INCOME ? (
                                <ArrowUpIcon className="h-4 w-4 text-green-500" />
                              ) : (
                                <ArrowDownIcon className="h-4 w-4 text-red-500" />
                              )}
                            </div>
                            <div>
                              <div className="font-medium">
                                {transaction.descricao}
                                {transaction.reembolsavel && (
                                  <span className="ml-2 rounded bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-500">A receber</span>
                                )}
                              </div>
                              {(transaction as any).parcela_num && (transaction as any).parcela_total ? (
                                <div className="text-xs text-gray-400">
                                  {(transaction as any).parcela_num}/{(transaction as any).parcela_total}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        </td>
                        <td className="py-4 whitespace-nowrap text-sm text-muted-foreground">
                          {getPaymentMethodDisplay(transaction)}
                        </td>
                        <td className="py-4 whitespace-nowrap">
                          <span className="px-2 py-1 rounded-lg bg-primary/10 text-primary text-xs">
                            {getCategoryName(transaction.categoria_id ?? null)}
                          </span>
                        </td>
                        <td className="py-4 whitespace-nowrap">
                          <span className="text-gray-400">{formatDate(transaction.data_transacao)}</span>
                        </td>
                        <td className="py-4 whitespace-nowrap">
                          <span className={`${transaction.tipo === TransactionType.INCOME ? 'text-green-400' : 'text-red-400'} font-numeric`}>
                            {transaction.tipo === TransactionType.INCOME ? '+ ' : '- '}
                            {formatCurrency(Number(transaction.valor))}
                          </span>
                        </td>
                        <td className="py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 rounded-lg text-xs
                            ${theme === 'light' && transaction.status === TransactionStatus.COMPLETED ? 'bg-emerald-400 text-white' : ''}
                            ${theme === 'light' && transaction.status === TransactionStatus.PENDING ? 'bg-yellow-400 text-gray-900' : ''}
                            ${theme === 'light' && transaction.status === TransactionStatus.SCHEDULED ? 'bg-blue-400 text-white' : ''}
                            ${theme === 'light' && transaction.status === TransactionStatus.CANCELED ? 'bg-red-400 text-white' : ''}
                            ${theme !== 'light' && transaction.status === TransactionStatus.COMPLETED ? 'bg-emerald-500/10 text-emerald-400' : ''}
                            ${theme !== 'light' && transaction.status === TransactionStatus.PENDING ? 'bg-yellow-500/10 text-yellow-400' : ''}
                            ${theme !== 'light' && transaction.status === TransactionStatus.SCHEDULED ? 'bg-blue-500/10 text-blue-400' : ''}
                            ${theme !== 'light' && transaction.status === TransactionStatus.CANCELED ? 'bg-red-500/10 text-red-400' : ''}
                          `}>
                            {getStatusLabel(transaction.status)}
                          </span>
                        </td>
                        <td className="py-4 whitespace-nowrap text-right">
                          <div className="inline-flex items-center gap-1">
                            {(transaction.status === TransactionStatus.PENDING ||
                              transaction.status === TransactionStatus.SCHEDULED) && (
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Dar baixa"
                                onClick={() => handlePagar(transaction.id)}
                              >
                                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              </Button>
                            )}
                            {transaction.status === TransactionStatus.COMPLETED && (
                              <Button
                                size="sm"
                                variant="ghost"
                                title="Reabrir"
                                onClick={() => handleReabrir(transaction.id)}
                              >
                                <RotateCcw className="h-4 w-4" />
                              </Button>
                            )}
                            <ActionsDropdown
                              onEdit={() => editTransaction(transaction)}
                              onDelete={() => setDeletingTransaction(transaction)}
                              t={t}
                            />
                          </div>
                        </td>
                      </TransactionRow>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile Card View */}
          <div className="md:hidden space-y-4">
            {isLoading ? (
              <div className="text-center py-8 text-gray-400">{t('common.loading', 'Carregando...')}</div>
            ) : filteredTransactions.length === 0 ? (
              <div className="text-center py-8 text-gray-400">
                {t('transactions.table.no_transactions', 'Nenhuma transação encontrada')}
              </div>
            ) : (
              filteredTransactions.map((transaction) => (
                <TransactionCard 
                  key={transaction.id} 
                  isShaking={shakingTransactions.has(transaction.id)}
                  className={`rounded-lg p-4 border ${theme === 'light' ? 'bg-white border-gray-100' : 'bg-white/5 border-white/10'}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center flex-1">
                      <div className={`w-10 h-10 rounded-full ${transaction.tipo === TransactionType.INCOME ? 'bg-green-500/20' : 'bg-red-500/20'} flex items-center justify-center mr-3 flex-shrink-0`}>
                        {transaction.tipo === TransactionType.INCOME ? (
                          <ArrowUpIcon className="h-5 w-5 text-green-500" />
                        ) : (
                          <ArrowDownIcon className="h-5 w-5 text-red-500" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`font-medium truncate ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>
                          {transaction.descricao}
                        </div>
                        {transaction.reembolsavel && (
                          <span className="inline-block rounded bg-blue-500/10 px-2 py-0.5 text-[10px] text-blue-500">A receber</span>
                        )}
                        {(transaction as any).parcela_num && (transaction as any).parcela_total ? (
                          <div className={`text-xs ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>
                            {(transaction as any).parcela_num}/{(transaction as any).parcela_total}
                          </div>
                        ) : null}
                        <div className={`text-sm ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>{getPaymentMethodDisplay(transaction)}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 ml-2">
                      {(transaction.status === TransactionStatus.PENDING ||
                        transaction.status === TransactionStatus.SCHEDULED) && (
                        <Button size="sm" variant="ghost" onClick={() => handlePagar(transaction.id)}>
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        </Button>
                      )}
                      {transaction.status === TransactionStatus.COMPLETED && (
                        <Button size="sm" variant="ghost" onClick={() => handleReabrir(transaction.id)}>
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                      <ActionsDropdown
                        onEdit={() => editTransaction(transaction)}
                        onDelete={() => setDeletingTransaction(transaction)}
                        t={t}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <span className={`text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-gray-400'}`}>{t('transactions.table.value', 'Valor')}:</span>
                      <span className={`${transaction.tipo === TransactionType.INCOME ? 'text-green-500' : 'text-red-500'} font-numeric font-medium`}>
                        {transaction.tipo === TransactionType.INCOME ? '+ ' : '- '}
                        {formatCurrency(Number(transaction.valor))}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className={`text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-gray-400'}`}>{t('transactions.table.category', 'Categoria')}:</span>
                      <span className="px-2 py-1 rounded-lg bg-primary/10 text-primary text-xs">
                        {getCategoryName(transaction.categoria_id ?? null)}
                      </span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className={`text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-gray-400'}`}>{t('transactions.table.date', 'Data')}:</span>
                      <span className={`text-sm ${theme === 'light' ? 'text-gray-600' : 'text-gray-300'}`}>{formatDate(transaction.data_transacao)}</span>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className={`text-sm font-medium ${theme === 'light' ? 'text-gray-700' : 'text-gray-400'}`}>{t('transactions.table.status', 'Status')}:</span>
                      <span className={`px-2 py-1 rounded-lg text-xs
                        ${theme === 'light' && transaction.status === TransactionStatus.COMPLETED ? 'bg-emerald-400 text-white' : ''}
                        ${theme === 'light' && transaction.status === TransactionStatus.PENDING ? 'bg-yellow-400 text-gray-900' : ''}
                        ${theme === 'light' && transaction.status === TransactionStatus.SCHEDULED ? 'bg-blue-400 text-white' : ''}
                        ${theme === 'light' && transaction.status === TransactionStatus.CANCELED ? 'bg-red-400 text-white' : ''}
                        ${theme !== 'light' && transaction.status === TransactionStatus.COMPLETED ? 'bg-emerald-500/10 text-emerald-400' : ''}
                        ${theme !== 'light' && transaction.status === TransactionStatus.PENDING ? 'bg-yellow-500/10 text-yellow-400' : ''}
                        ${theme !== 'light' && transaction.status === TransactionStatus.SCHEDULED ? 'bg-blue-500/10 text-blue-400' : ''}
                        ${theme !== 'light' && transaction.status === TransactionStatus.CANCELED ? 'bg-red-500/10 text-red-400' : ''}
                      `}>
                        {getStatusLabel(transaction.status)}
                      </span>
                    </div>
                  </div>
                </TransactionCard>
              ))
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isTransactionFormOpen && (
          <>
            {/* Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
              className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
              onClick={() => setIsTransactionFormOpen(false)}
            />
            
            {/* Modal */}
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <motion.div
                initial={{ 
                  opacity: 0, 
                  scale: 0.8,
                  y: 50
                }}
                animate={{ 
                  opacity: 1, 
                  scale: 1,
                  y: 0
                }}
                exit={{ 
                  opacity: 0, 
                  scale: 0.8,
                  y: 50
                }}
                transition={{ 
                  type: "spring",
                  damping: 25,
                  stiffness: 300,
                  duration: 0.3
                }}
                className={`${theme === 'light' ? 'bg-white border border-gray-200' : 'glass-card'} w-full max-w-[600px] max-h-[90vh] overflow-y-auto rounded-lg p-6 relative`}
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={() => setIsTransactionFormOpen(false)}
                  className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 z-10"
                >
                  <X className="h-5 w-5" />
                  <span className="sr-only">{t('common.close', 'Fechar')}</span>
                </button>
                <TransactionForm 
                  transaction={editingTransaction}
                  onSuccess={() => {
                    setIsTransactionFormOpen(false);
                    refetch();
                    queryClient.invalidateQueries({ queryKey: ["/api/wallet/current"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/summary"] });
                    queryClient.invalidateQueries({ queryKey: ["/api/payment-methods/totals"] });
                    toast({
                      title: editingTransaction ? t('transactions.transaction_updated', 'Transação atualizada') : t('transactions.transaction_created', 'Transação criada'),
                      description: editingTransaction 
                        ? t('transactions.update_success', 'A transação foi atualizada com sucesso.') 
                        : t('transactions.create_success', 'A transação foi criada com sucesso.'),
                    });
                  }}
                />
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      <AlertDialog open={!!deletingTransaction} onOpenChange={(open) => !open && setDeletingTransaction(null)}>
        <AlertDialogContent className="glass-card">
          <AlertDialogHeader>
            <AlertDialogTitle>{t('transactions.delete_transaction', 'Excluir transação')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('transactions.confirm_delete', 'Tem certeza que deseja excluir esta transação? Esta ação não pode ser desfeita.')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel', 'Cancelar')}</AlertDialogCancel>
            <AlertDialogAction 
              onClick={() => deletingTransaction && handleDeleteTransaction(deletingTransaction.id)}
              className="bg-destructive"
            >
              {t('common.delete', 'Excluir')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
