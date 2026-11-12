// ---------------------------------------------------------------------
// PAYSTACK SETTINGS: the only file you edit to switch keys.
// Put your PUBLIC keys here (they start with pk_). They are safe to ship in the browser.
// NEVER put a secret key (sk_...) in this file. The secret key lives in Supabase Vault.
// ---------------------------------------------------------------------
window.NIA_PAY_CONFIG = {
  mode: "test", // change to "live" when you are ready to take real payments
  keys: {
    test: "pk_test_f9bc53c6f5640bb20ca81bc3a9f827c82e232459",
    live: "pk_live_REPLACE_ME",
  },
  currency: "KES",
};
