import { createRoot } from "react-dom/client";
import App from "./App";
// Inter self-hosted (sem CSS bloqueante de CDN).
import "@fontsource-variable/inter";
import "./index.css";
import { ThemeProvider } from "next-themes";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
    <App />
  </ThemeProvider>
);

// PWA: service worker só em produção (cacheia apenas /assets e ícones; nunca /api).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* sem SW o app funciona normalmente */
    });
  });
}
