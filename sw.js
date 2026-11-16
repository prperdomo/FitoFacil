// Permite abrir o FitoFácil sem internet depois da primeira visita.
// Com rede, sempre busca a versão nova; sem rede, usa a cópia guardada.
var CACHE = "fitofacil-v1";
var CORE = [
  "./", "index.html", "style.css", "app.js", "auth.js", "synonyms.js", "data.js",
  "manifest.webmanifest", "icons/favicon.svg", "icons/icon-192.png", "icons/icon-512.png"
];

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE).then(function (cache) { return cache.addAll(CORE); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (event) {
  var req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  // "no-cache" faz o navegador conferir com o servidor se o arquivo mudou,
  // em vez de reaproveitar por minutos a cópia que ele mesmo guardou.
  event.respondWith(
    fetch(req.url, { cache: "no-cache" }).then(function (res) {
      if (res.ok) {
        var copy = res.clone();
        caches.open(CACHE).then(function (cache) { cache.put(req, copy); });
      }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) { return hit || caches.match("index.html"); });
    })
  );
});
