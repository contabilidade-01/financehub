import { useEffect, useRef } from "react";

/**
 * Atalho "+ Novo" da barra inferior (mobile): abre o formulário de novo
 * lançamento na tela de lançamentos do ambiente (PF ou PJ).
 *
 * - Se o usuário já está na tela, dispara um evento.
 * - Senão, navega com ?novo=1 e a tela abre o formulário ao montar.
 */
export const NOVO_LANCAMENTO_EVENT = "khesef:novo-lancamento";

export function pedirNovoLancamento(
  navigate: (to: string) => void,
  rotaLancamentos: string,
  locationAtual: string,
) {
  if (locationAtual === rotaLancamentos) {
    window.dispatchEvent(new Event(NOVO_LANCAMENTO_EVENT));
  } else {
    navigate(`${rotaLancamentos}?novo=1`);
  }
}

/** Usado pela tela de lançamentos para abrir o formulário quando pedido. */
export function useNovoLancamento(abrir: () => void) {
  const abrirRef = useRef(abrir);
  abrirRef.current = abrir;

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("novo") === "1") {
        params.delete("novo");
        const qs = params.toString();
        window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : ""));
        abrirRef.current();
      }
    } catch {
      /* ignora */
    }
    const handler = () => abrirRef.current();
    window.addEventListener(NOVO_LANCAMENTO_EVENT, handler);
    return () => window.removeEventListener(NOVO_LANCAMENTO_EVENT, handler);
  }, []);
}
