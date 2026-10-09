import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
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
import { buttonVariants } from "@/components/ui/button";

export interface ConfirmOptions {
  title: ReactNode;
  description?: ReactNode;
  confirmText?: string;
  cancelText?: string;
  /** Ação destrutiva (excluir/remover): botão vermelho. */
  destructive?: boolean;
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

/**
 * Substitui window.confirm() por um AlertDialog acessível.
 * Uso: const confirmar = useConfirm(); if (await confirmar({ title: "Excluir?" })) ...
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((opts) => {
    const normalized = typeof opts === "string" ? { title: opts } : opts;
    setOptions(normalized);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (value: boolean) => {
    resolver.current?.(value);
    resolver.current = null;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <AlertDialog open={!!options} onOpenChange={(open) => !open && close(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{options?.title}</AlertDialogTitle>
            {options?.description ? (
              <AlertDialogDescription>{options.description}</AlertDialogDescription>
            ) : (
              <AlertDialogDescription className="sr-only">Confirme a ação</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => close(false)}>{options?.cancelText || "Cancelar"}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => close(true)}
              className={options?.destructive ? buttonVariants({ variant: "destructive" }) : undefined}
            >
              {options?.confirmText || "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (ctx) return ctx;
  // Fora do provider (não deveria acontecer): cai no confirm nativo.
  return async (opts) => window.confirm(typeof opts === "string" ? opts : String(opts.title));
}
