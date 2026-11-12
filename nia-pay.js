// Small Paystack helper. Usage anywhere:
//   await NiaPay.subscribe({ sb, user, plan, onDone, onError, onBusy, onClose })
// Needs paystack-config.js loaded first.
(() => {
  const cfg = window.NIA_PAY_CONFIG || {};
  const key = () => (cfg.keys || {})[cfg.mode || "test"];
  function loadSdk() {
    return new Promise((res, rej) => {
      if (window.PaystackPop) return res();
      const s = document.createElement("script"); s.src = "https://js.paystack.co/v1/inline.js";
      s.onload = res; s.onerror = () => rej(new Error("Could not load Paystack. Check your connection.")); document.head.appendChild(s);
    });
  }
  window.NiaPay = {
    ready() { const k = key(); return !!k && /^pk_(test|live)_/.test(k) && !/REPLACE_ME/.test(k); },
    async checkout({ email, userId, amountKES, planCode = "monthly", onSuccess, onClose }) {
      if (!this.ready()) throw new Error("Payments are not set up yet.");
      await loadSdk();
      const ref = `nia-${String(userId).slice(0, 8)}-${Date.now()}`; // Paystack allows letters, numbers, - . =
      try { localStorage.setItem("nia_last_ref", ref); } catch (e) {}
      window.PaystackPop.setup({
        key: key(), email, amount: Math.round(amountKES * 100), currency: cfg.currency || "KES", ref,
        metadata: { user_id: userId, plan_code: planCode },
        callback: (r) => { onSuccess && onSuccess((r && r.reference) || ref); },
        onClose: () => { onClose && onClose(); },
      }).openIframe();
    },
    // Pay, then ask the database to verify with Paystack and extend the membership.
    async subscribe({ sb, user, plan, onDone, onError, onBusy, onClose }) {
      try {
        await this.checkout({
          email: user.email, userId: user.id, amountKES: plan.amount_kes, planCode: plan.code, onClose,
          onSuccess: async (ref) => {
            onBusy && onBusy(true);
            const { data, error } = await sb.rpc("activate_subscription", { p_reference: ref });
            onBusy && onBusy(false);
            if (error) return onError && onError(error.message + " Your payment reference is " + ref + ". You can retry under Profile, then Subscription.");
            this.clearRef(); onDone && onDone(data);
          },
        });
      } catch (e) { onError && onError(e.message); }
    },
    async recheck(sb) { const ref = this.lastRef(); if (!ref) return { error: { message: "No recent payment found on this device." } }; const r = await sb.rpc("activate_subscription", { p_reference: ref }); if (!r.error) this.clearRef(); return r; },
    lastRef() { try { return localStorage.getItem("nia_last_ref"); } catch (e) { return null; } },
    clearRef() { try { localStorage.removeItem("nia_last_ref"); } catch (e) {} },
  };
})();
