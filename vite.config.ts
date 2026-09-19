import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { fileURLToPath } from 'url';
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "client", "src"),
      "@shared": path.resolve(__dirname, "shared"),
      "@assets": path.resolve(__dirname, "attached_assets"),
    },
  },
  root: path.resolve(__dirname, "client"),
  build: {
    outDir: path.resolve(__dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Separa bibliotecas grandes em chunks próprios, cacheáveis entre rotas —
        // melhora o carregamento (especialmente no mobile).
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("recharts") || id.includes("/d3-") || id.includes("victory")) return "charts";
          if (id.includes("framer-motion")) return "motion";
          if (id.includes("react-dom") || id.includes("scheduler") || /[\\/]react[\\/]/.test(id)) return "react-vendor";
          if (id.includes("@radix-ui")) return "radix";
          if (id.includes("@tanstack")) return "query";
          if (id.includes("lucide-react")) return "icons";
          // Demais libs: deixa o Rollup dividir junto das rotas que as usam
          // (carregam sob demanda, sem um "vendor" monolítico no início).
        },
      },
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: process.env.NODE_ENV === 'development'
          ? 'http://localhost:5001'
          : 'http://localhost:5000',
        changeOrigin: true,
      },
      '/ws': {
        target: process.env.NODE_ENV === 'development'
          ? 'ws://localhost:5001'
          : 'ws://localhost:5000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
