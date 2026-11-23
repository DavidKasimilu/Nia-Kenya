// Nia service worker: lets the site be installed and opens the app shell when offline.
// Network first, so a new deploy shows up straight away. Only same-origin GET requests are handled;
// Supabase, Paystack, Cloudflare and CDN requests are never touched.
const V = "nia-v1";
const SHELL = ["index.html", "dashboard.html", "programs.html", "messages.html", "profile.html", "base.css", "dash.css", "profile.css", "landing.css", "nav.js", "notify.js", "alerts.js", "plans-ui.js", "nia-pay.js", "assets/images/logo1-tight.png", "assets/images/logo2-tight.png"];
self.addEventListener("install", (e) => { e.waitUntil(caches.open(V).then((c) => Promise.allSettled(SHELL.map((u) => c.add(u)))).then(() => self.skipWaiting())); });
self.addEventListener("activate", (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", (e) => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== "GET" || u.origin !== location.origin) return;
  e.respondWith(
    fetch(r).then((res) => { if (res.ok) { const copy = res.clone(); caches.open(V).then((c) => c.put(r, copy)); } return res; })
      .catch(() => caches.match(r).then((m) => m || (r.mode === "navigate" ? caches.match("index.html") : Response.error())))
  );
});
