// Cloudflare Turnstile helper. Paste your SITE key (the public one) below. Leave empty to run without CAPTCHA.
// - Buttons passed to NiaCaptcha.watch([...ids]) stay grey until the device is verified.
// - Tapping a grey button shows a short notice instead of sending the request.
// - A device that passed in the last 24 hours gets the check run quietly in the background (the widget
//   only appears if Cloudflare needs interaction). Supabase still needs one fresh single-use token per request.
(() => {
  const SITE_KEY = "0x4AAAAAAF9-5-fTzVv85E6U";
  const DAY = 864e5;
  let token = null, wid = null, loading = false, buttons = [];
  const verifiedToday = () => { try { return Date.now() - Number(localStorage.getItem("nia_dv") || 0) < DAY; } catch (e) { return false; } };
  const sync = () => buttons.forEach((b) => b.classList.toggle("cap-wait", !!SITE_KEY && !token));
  function notice(msg) { const d = document.createElement("div"); d.className = "cap-toast"; d.textContent = msg; document.body.appendChild(d); setTimeout(() => d.remove(), 2600); }
  function render() {
    const el = document.getElementById("cfTurnstile");
    if (!el || wid !== null || !window.turnstile) return;
    const off = () => { token = null; sync(); };
    wid = window.turnstile.render(el, {
      sitekey: SITE_KEY, theme: "light", appearance: verifiedToday() ? "interaction-only" : "always",
      callback: (t) => { token = t; try { localStorage.setItem("nia_dv", String(Date.now())); } catch (e) {} sync(); },
      "expired-callback": off, "error-callback": off, "timeout-callback": off,
    });
  }
  window.__niaTsReady = render;
  const api = (window.NiaCaptcha = {
    // Single-use token; asks Turnstile for a fresh one straight away.
    token() { const t = token; token = null; if (wid !== null && window.turnstile) window.turnstile.reset(wid); sync(); return t || undefined; },
    // Waits up to ~20s for verification to finish, then returns a token.
    async getToken() {
      if (!SITE_KEY) return undefined;
      api.ensure();
      for (let i = 0; i < 130; i++) { if (token) return api.token(); await new Promise((r) => setTimeout(r, 150)); }
      return undefined;
    },
    watch(ids) {
      buttons = ids.map((id) => document.getElementById(id)).filter(Boolean);
      buttons.forEach((b) => b.addEventListener("click", (e) => { if (SITE_KEY && !token) { e.preventDefault(); e.stopImmediatePropagation(); notice("Verifying your device. Please wait a moment, the button will turn on when it is done."); api.ensure(); } }, true));
      sync();
    },
    ensure() {
      if (!SITE_KEY) return;
      if (window.turnstile) return render();
      if (loading) return; loading = true;
      const s = document.createElement("script"); s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__niaTsReady"; s.async = true; document.head.appendChild(s);
    },
  });
})();
