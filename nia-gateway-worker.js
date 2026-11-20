// Nia Gateway (Cloudflare Worker). Your original proxy, plus a 24-hour "device pass".
//
// New pieces:
//   POST /nia/verify   Verifies a Cloudflare Turnstile token once, returns a signed pass valid for 24 hours.
//   Protected auth calls (sign-up, password sign-in, password reset, resend code, OTP) must carry that pass
//   in the "x-nia-pass" header. Token refresh and everything else are NOT affected.
//
// Worker settings (Cloudflare dashboard > your Worker > Settings > Variables and Secrets):
//   SUPABASE_URL, SUPABASE_ANON_KEY   (you already have these)
//   TURNSTILE_SECRET  (secret)  your Turnstile SECRET key
//   PASS_SECRET       (secret)  any long random string (32+ characters) used to sign passes
//   REQUIRE_PASS      (text)    set to 1 to enforce passes. Leave unset while rolling out.
//   NIA_KV            (optional KV namespace binding) enables per-IP rate limits on email-sending calls.

const ALLOWED_HOSTS = ["localhost", "127.0.0.1", "davidkasimilu.github.io", "nkepe.github.io"];
const PASS_TTL_MS = 24 * 60 * 60 * 1000;

const isProtected = (path, url) =>
  path === "/auth/v1/signup" ||
  path === "/auth/v1/recover" ||
  path === "/auth/v1/resend" ||
  path === "/auth/v1/otp" ||
  (path === "/auth/v1/token" && url.searchParams.get("grant_type") === "password");
const SENDS_EMAIL = ["/auth/v1/signup", "/auth/v1/recover", "/auth/v1/resend", "/auth/v1/otp"];

const enc = new TextEncoder();
const b64u = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uStr = (s) => b64u(enc.encode(s));
const fromB64uStr = (s) => { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return new TextDecoder().decode(Uint8Array.from(atob(s), (c) => c.charCodeAt(0))); };
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data))));
}
const safeEq = (a, b) => { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; };

async function passValid(request, env) {
  const [payload, sig] = (request.headers.get("x-nia-pass") || "").split(".");
  if (!payload || !sig || !env.PASS_SECRET) return false;
  if (!safeEq(sig, await hmac(env.PASS_SECRET, payload))) return false;
  let d; try { d = JSON.parse(fromB64uStr(payload)); } catch (e) { return false; }
  if (!d.e || d.e < Date.now()) return false;
  const ua = (await hmac(env.PASS_SECRET, "ua:" + (request.headers.get("User-Agent") || ""))).slice(0, 16);
  return safeEq(String(d.u || ""), ua);
}

// Optional per-IP counter (needs the NIA_KV binding). Any KV error means "not limited" so sign-in never breaks.
async function limited(env, key, max, windowSec) {
  if (!env.NIA_KV) return false;
  try {
    const k = `rl:${key}:${Math.floor(Date.now() / (windowSec * 1000))}`;
    const n = parseInt((await env.NIA_KV.get(k)) || "0", 10);
    if (n >= max) return true;
    await env.NIA_KV.put(k, String(n + 1), { expirationTtl: Math.max(60, windowSec * 2) });
  } catch (e) {}
  return false;
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin");

    const isAllowedOrigin =
      !origin ||
      origin.startsWith("http://localhost:") ||
      origin.startsWith("http://127.0.0.1:") ||
      origin === "https://davidkasimilu.github.io" ||
      origin === "https://nkepe.github.io";

    const corsHeaders = {
      "Access-Control-Allow-Origin": origin || "*",
      "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-nia-pass, x-supabase-api-version, prefer, range, accept-profile, content-profile, *",
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Max-Age": "86400",
    };
    const json = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...corsHeaders } });

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const incomingUrl = new URL(request.url);

    if (incomingUrl.pathname === "/" || incomingUrl.pathname === "") {
      return json(200, { status: "active", message: "Nia Gateway is operational." });
    }

    if (!isAllowedOrigin) {
      return json(403, { error: "Forbidden: Origin not authorized." });
    }

    const ip = request.headers.get("CF-Connecting-IP") || "";

    // ---- Device pass: verify Turnstile once, hand back a 24-hour signed pass ----
    if (incomingUrl.pathname === "/nia/verify") {
      if (request.method !== "POST") return json(405, { msg: "Method not allowed." });
      if (!env.TURNSTILE_SECRET || !env.PASS_SECRET) return json(500, { msg: "Verification is not configured." });
      if (await limited(env, `v:${ip}`, 20, 3600)) return json(429, { msg: "Too many attempts. Please try again later." });
      let token = null;
      try { token = (await request.json()).token; } catch (e) {}
      if (typeof token !== "string" || !token || token.length > 2048) return json(400, { msg: "Missing verification token." });
      const form = new FormData();
      form.append("secret", env.TURNSTILE_SECRET); form.append("response", token); if (ip) form.append("remoteip", ip);
      let out;
      try { out = await (await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form })).json(); }
      catch (e) { return json(502, { msg: "Could not reach the verification service. Please try again." }); }
      if (!out.success || (out.hostname && !ALLOWED_HOSTS.includes(out.hostname))) return json(403, { msg: "Verification failed. Please try again." });
      const exp = Date.now() + PASS_TTL_MS;
      const ua = (await hmac(env.PASS_SECRET, "ua:" + (request.headers.get("User-Agent") || ""))).slice(0, 16);
      const payload = b64uStr(JSON.stringify({ e: exp, u: ua }));
      return json(200, { pass: `${payload}.${await hmac(env.PASS_SECRET, payload)}`, expires_at: exp });
    }

    // ---- Protect sign-up, password sign-in, reset, resend and OTP ----
    if (isProtected(incomingUrl.pathname, incomingUrl)) {
      if (env.REQUIRE_PASS === "1" && !(await passValid(request, env))) {
        return json(403, { code: 403, error_code: "device_check_required", msg: "Please verify your device and try again." });
      }
      if (SENDS_EMAIL.includes(incomingUrl.pathname) && (await limited(env, `e:${ip}`, 8, 3600))) {
        return json(429, { code: 429, error_code: "over_request_rate_limit", msg: "Too many requests. Please try again later." });
      }
    }

    try {
      const backendBase = env.SUPABASE_URL.replace(/\/+$/, "");
      const destinationUrl = `${backendBase}${incomingUrl.pathname}${incomingUrl.search}`;

      // Clone original headers
      const forwardHeaders = new Headers(request.headers);

      // Remove hop-by-hop & host headers that confuse Kong
      forwardHeaders.delete("host");
      forwardHeaders.delete("cf-connecting-ip");
      forwardHeaders.delete("cf-ray");
      forwardHeaders.delete("cf-visitor");
      forwardHeaders.delete("x-nia-pass"); // never forward the device pass to Supabase

      // ALWAYS supply the legitimate publishable/anon key as apikey
      forwardHeaders.set("apikey", env.SUPABASE_ANON_KEY);

      // If client sent the placeholder key or no auth header at all, substitute the real anon key
      const currentAuth = forwardHeaders.get("authorization");
      if (!currentAuth || currentAuth === "Bearer cf-worker-edge-managed") {
        forwardHeaders.set("authorization", `Bearer ${env.SUPABASE_ANON_KEY}`);
      }

      let requestBody = null;
      if (!["GET", "HEAD"].includes(request.method)) {
        requestBody = await request.arrayBuffer();
      }

      const response = await fetch(destinationUrl, {
        method: request.method,
        headers: forwardHeaders,
        body: requestBody,
        redirect: "follow",
      });

      const responseHeaders = new Headers(response.headers);
      for (const [key, value] of Object.entries(corsHeaders)) {
        responseHeaders.set(key, value);
      }

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
      });

    } catch (err) {
      return json(502, { error: "Gateway error", message: err.message });
    }
  },
};
