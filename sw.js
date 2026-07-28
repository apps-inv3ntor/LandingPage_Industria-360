/* ===================================================================
   INDÚSTRIA 360 — Service Worker
   Estratégia:
   - HTML (index.html, dashboard.html): network-first, cai para cache
     só se estiver offline (garante que o gate/token e a telemetria
     estejam sempre atualizados quando há conexão).
   - CSS/JS/imagens/ícones: cache-first (mudam pouco, carregam mais
     rápido e habilitam funcionamento do "app instalado" com sinal
     fraco de rede).
   =================================================================== */

const CACHE_NAME = "industria360-v1";

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/main.js",
  "./manifest.json",
  "./assets/hero/hero-banner.jpg",
  "./assets/thumbs/pmp-pmo.png",
  "./assets/thumbs/pcm-eam-cmms.png",
  "./assets/thumbs/bpm-cbok.png",
  "./assets/thumbs/lean-six-sigma.png",
  "./assets/thumbs/sst-sgg.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-192.png",
  "./icons/icon-maskable-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // não intercepta chamadas de telemetria (Apps Script), YouTube ou
  // qualquer requisição cross-origin — deixa seguir direto pra rede
  if (req.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  // dashboard.html fica FORA do cache do PWA, de propósito: não gera
  // ícone/instalação, não fica salvo na Cache Storage do navegador,
  // sempre busca direto da rede e sempre exige a senha de admin —
  // dispositivo nenhum (mobile ou desktop) guarda uma cópia local dele.
  if (url.pathname.endsWith("dashboard.html")) {
    event.respondWith(fetch(req));
    return;
  }

  const isHTML = req.headers.get("accept")?.includes("text/html");

  if (isHTML) {
    // network-first para HTML
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((cached) => cached || caches.match("./index.html")))
    );
  } else {
    // cache-first para estáticos (CSS/JS/imagens/ícones)
    event.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req).then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, copy));
          return res;
        });
      })
    );
  }
});
