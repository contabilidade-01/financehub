import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
// Tema crítico precisa entrar no bundle de produção (não servir /src/theme-critical.js cru)
import "./theme-critical.js";
import { ThemeProvider } from "next-themes";

createRoot(document.getElementById("root")!).render(
  <ThemeProvider attribute="class" defaultTheme="dark">
    <App />
  </ThemeProvider>
);
