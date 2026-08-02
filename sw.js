/* ===================================================================
   INDÚSTRIA 360 — Service Worker
   Estratégia:
   - HTML (index.html, dashboard.html): network-first, cai para cache
     só se estiver offline (garante que o gate/token e a telemetria
     estejam sempre atualizados quando há conexão).
   - CSS/JS/imagens/ícones: stale-while-revalidate. Responde na hora
     com o que já está em cache (rápido), e em paralelo busca uma
     versão nova na rede pra atualizar o cache — a visita seguinte já
     vem atualizada sozinha. NÃO depende de bumping manual de versão:
     toda visita com internet automaticamente refresca o cache.
   =================================================================== */

const CACHE_NAME = "industria360-cache";

const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/main.js",
  "./js/i18n.js",
  "./js/i18n/pt.json",
  "./js/i18n/en.json",
  "./js/i18n/es.json",
  "./js/i18n/zh.json",
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

  // vídeos ficam FORA do cache do PWA: o navegador usa requisições
  // "Range" pra buscar só pedaços do arquivo (necessário pra tocar sem
  // baixar tudo de uma vez), e isso não combina bem com o Cache API
  // simples que usamos aqui — deixamos o navegador cuidar disso nativamente.
  if (/\.(mp4|webm|mov)$/.test(url.pathname)) {
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
    // stale-while-revalidate para estáticos (CSS/JS/imagens/ícones):
    // devolve o cache imediatamente se existir, e sempre dispara uma
    // busca na rede em paralelo para manter o cache atualizado —
    // é essa busca em paralelo que elimina a necessidade de bump manual.
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(req).then((cached) => {
          const networkFetch = fetch(req)
            .then((res) => {
              if (res && res.ok) cache.put(req, res.clone());
              return res;
            })
            .catch(() => cached);
          return cached || networkFetch;
        })
      )
    );
  }
});
