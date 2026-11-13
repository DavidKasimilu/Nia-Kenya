// Cloudflare Turnstile helper. Paste your SITE key below (the public one, not the secret).
// Leave empty to run without CAPTCHA.
(() => {
  const SITE_KEY = "";
  let token = null, wid = null, loading = false;
  function render() {
    const el = document.getElementById("cfTurnstile");
    if (!el || wid !== null || !window.turnstile) return;
    wid = window.turnstile.render(el, { sitekey: SITE_KEY, theme: "light", callback: (t) => (token = t), "expired-callback": () => (token = null), "error-callback": () => (token = null) });
  }
  window.__niaTsReady = render;
  window.NiaCaptcha = {
    // Returns the current token (single use) and asks Turnstile for a fresh one.
    token() { const t = token; token = null; if (wid !== null && window.turnstile) window.turnstile.reset(wid); return t || undefined; },
    // Waits (up to ~20s) until Cloudflare has verified the visitor, then returns a fresh single-use token.
    async getToken() {
      if (!SITE_KEY) return undefined;
      this.ensure();
      for (let i = 0; i < 130; i++) { if (token) return this.token(); await new Promise((r) => setTimeout(r, 150)); }
      return undefined;
    },
    ensure() {
      if (!SITE_KEY) return;
      if (window.turnstile) return render();
      if (loading) return; loading = true;
      const s = document.createElement("script"); s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=__niaTsReady"; s.async = true; document.head.appendChild(s);
    },
  };
})();
