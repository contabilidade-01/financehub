/**
 * Bus minúsculo para abrir/reabrir um CAPÍTULO específico do tour guiado de
 * qualquer lugar da aplicação (ex.: botão "?" na Sidebar, ou o botão "?" de
 * uma página específica como Plano de Contas ou Relatórios) sem precisar
 * levantar estado global só para isso.
 */
export type TourChapterId = "inicio" | "plano-contas" | "relatorios" | "outros-recursos";

const EVENT_NAME = "khesef:open-guided-tour";

/** Abre o tour. Sem argumento, abre o capítulo inicial (boas-vindas + WhatsApp). */
export function openGuidedTour(chapterId: TourChapterId = "inicio"): void {
  try {
    window.dispatchEvent(new CustomEvent<{ chapterId: TourChapterId }>(EVENT_NAME, { detail: { chapterId } }));
  } catch {
    /* ambiente sem window (SSR/teste) — ignora */
  }
}

export function onOpenGuidedTour(handler: (chapterId: TourChapterId) => void): () => void {
  const listener = (e: Event) => {
    const chapterId = (e as CustomEvent<{ chapterId: TourChapterId }>).detail?.chapterId || "inicio";
    handler(chapterId);
  };
  window.addEventListener(EVENT_NAME, listener);
  return () => window.removeEventListener(EVENT_NAME, listener);
}
