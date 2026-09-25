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
