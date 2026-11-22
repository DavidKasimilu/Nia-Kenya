// Registers the service worker and powers any [data-install] button (shown only when the browser allows installing).
(() => {
  if ("serviceWorker" in navigator) window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  let deferred = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferred = e; document.querySelectorAll("[data-install]").forEach((b) => b.classList.remove("hidden")); });
  window.addEventListener("appinstalled", () => { deferred = null; document.querySelectorAll("[data-install]").forEach((b) => b.classList.add("hidden")); });
  document.addEventListener("click", async (e) => { const b = e.target.closest("[data-install]"); if (!b || !deferred) return; deferred.prompt(); try { await deferred.userChoice; } catch (x) {} deferred = null; b.classList.add("hidden"); });
})();
