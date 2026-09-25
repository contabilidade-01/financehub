/*
 * Service worker mínimo do Khesef (PWA instalável).
 *
 * - Guarda em cache SOMENTE arquivos estáticos com hash (/assets/*), ícones e fontes.
 * - NUNCA intercepta /api, WebSocket, uploads nem a navegação (index.html):
 *   dados financeiros e a versão do app sempre vêm da rede.
 */
const CACHE = "khesef-static-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isCacheable(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith("/api")) return false;
  return (
    url.pathname.startsWith("/assets/") ||
    /^\/(icon-[\w-]+|favicon-[\w-]+|apple-touch-icon)\.png$/.test(url.pathname)
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (!isCacheable(url)) return; // deixa o navegador buscar normalmente

  // /assets/* têm hash no nome (imutáveis): cache primeiro, rede como reserva.
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.type === "basic") cache.put(req, res.clone());
      return res;
    }),
  );
});
