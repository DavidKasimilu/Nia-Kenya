// Device check, once per day. Needs captcha-config.js loaded first and the updated Cloudflare Worker.
// 1. A visitor with no valid pass sees the Cloudflare check once. The Worker verifies it and returns a signed
//    pass that lasts 24 hours and is kept in this browser.
// 2. While the pass is valid, sign-in and sign-up buttons are ready immediately and no check is shown.
// 3. Buttons passed to NiaCaptcha.watch([...ids]) stay grey until a pass exists; tapping one while grey shows a notice.
// 4. NiaCaptcha.fetch adds the pass to requests. Give it to createClient via { global: { fetch: NiaCaptcha.fetch } }.
(() => {
  const GATEWAY = "https://nia-gateway.davidkasimilu71.workers.dev";
  const SITE_KEY = (window.NIA_CAPTCHA && window.NIA_CAPTCHA.siteKey) || "";
  const LS = "nia_pass";
  let wid = null, loading = false, buttons = [], mem = null;

  function getPass() {
    let d = mem;
    if (!d) { try { d = JSON.parse(localStorage.getItem(LS) || "null"); } catch (e) { d = null; } }
    if (d && d.p && d.e - Date.now() > 60000) { mem = d; return d.p; }
    mem = null; return null;
  }
  const sync = () => buttons.forEach((b) => b.classList.toggle("cap-wait", !!SITE_KEY && !getPass()));
  function notice(msg) { const d = document.createElement("div"); d.className = "cap-toast"; d.textContent = msg; document.body.appendChild(d); setTimeout(() => d.remove(), 2800); }

  async function claim(t) {
    try {
      const r = await fetch(GATEWAY + "/nia/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: t }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.pass) throw new Error(j.msg || "Verification failed. Please try again.");
      mem = { p: j.pass, e: j.expires_at };
      try { localStorage.setItem(LS, JSON.stringify(mem)); } catch (e) {}
      if (wid !== null && window.turnstile) { try { window.turnstile.remove(wid); } catch (e) {} wid = null; }
      sync();
    } catch (e) {
      notice(e.message || "Verification failed. Please try again.");
      if (wid !== null && window.turnstile) window.turnstile.reset(wid);
    }
  }
  function render() {
    const el = document.getElementById("cfTurnstile");
    if (!el || wid !== null || !window.turnstile || getPass()) return;
    wid = window.turnstile.render(el, { sitekey: SITE_KEY, theme: "light", callback: claim, "expired-callback": () => window.turnstile.reset(wid), "error-callback": () => {} });
  }
  window.__niaTsReady = render;

  const api = (window.NiaCaptcha = {
    // fetch wrapper: adds the pass; if the Worker says the pass is no longer valid, asks for a new check
    fetch: async (input, init = {}) => {
      const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
      const p = getPass(); if (p) headers.set("x-nia-pass", p);
      const res = await fetch(input, { ...init, headers });
      if (res.status === 403) {
        try { const j = await res.clone().json(); if (j.error_code === "device_check_required") { mem = null; try { localStorage.removeItem(LS); } catch (e) {} sync(); api.ensure(); } } catch (e) {}
      }
      return res;
    },
    watch(ids) {
      buttons = ids.map((id) => document.getElementById(id)).filter(Boolean);
      buttons.forEach((b) => b.addEventListener("click", (e) => {
        if (SITE_KEY && !getPass()) { e.preventDefault(); e.stopImmediatePropagation(); notice("Verifying your device. Please wait a moment, the button will turn on when it is done."); api.ensure(); }
      }, true));
      sync(); setInterval(() => { sync(); if (SITE_KEY && !getPass()) api.ensure(); }, 30000);
    },
    ensure() {
      if (!SITE_KEY || getPass()) return;
      if (window.turnstile) return render();
      if (loading) return; loading = true;
      const s = document.createElement("script"); s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__niaTsReady"; s.async = true; document.head.appendChild(s);
    },
  });
})();
