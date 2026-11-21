const GATEWAY_URL = "https://nia-gateway.davidkasimilu71.workers.dev";
const EDGE_KEY = "cf-worker-edge-managed";
const sb = window.supabase ? window.supabase.createClient(GATEWAY_URL, EDGE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icons = () => window.__icons && window.__icons();
const KIND = { affiliate: ["handshake", "Affiliate"], ambassador: ["users", "Ambassador"], other: ["sparkles", "Program"] };
let user, profile = {}, items = [], joined = new Set(), staff = false;

function toast(t) { const d = document.createElement("div"); d.className = "toast"; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 3000); }

document.addEventListener("DOMContentLoaded", async () => {
  if (!sb) return;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return (location.href = "index.html");
  user = session.user;
  const { data: p } = await sb.from("profiles").select("status, role, full_name, avatar_url").eq("id", user.id).maybeSingle();
  if (p?.status === "banned") { await sb.auth.signOut(); return (location.href = "index.html"); }
  profile = p || {}; staff = ["admin", "moderator"].includes(p?.role);
  const n = (p?.full_name || user.email || "?").trim()[0].toUpperCase();
  $("avatarBtn").innerHTML = p?.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="" onerror="this.replaceWith(document.createTextNode('${esc(n)}'))">` : esc(n);
  if (window.NiaNav) NiaNav.setAvatar($("avatarBtn").innerHTML);
  $("menuName").textContent = p?.full_name || "Student"; $("menuEmail").textContent = user.email;
  if (staff) $("adminLink").classList.remove("hidden");
  $("avatarBtn").onclick = (e) => { e.stopPropagation(); $("menu").classList.toggle("hidden"); };
  document.addEventListener("click", (e) => { if (!$("menu").contains(e.target)) $("menu").classList.add("hidden"); });
  $("logoutBtn").onclick = async () => { await sb.auth.signOut(); location.href = "index.html"; };
  $("pgClose").onclick = () => $("pgModal").classList.add("hidden");
  $("pgModal").onclick = (e) => { if (e.target === $("pgModal")) $("pgModal").classList.add("hidden"); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("pgModal").classList.add("hidden"); });

  const [pg, su] = await Promise.all([sb.from("programs").select("*").neq("status", "draft").order("created_at", { ascending: false }), sb.from("program_signups").select("program_id").eq("user_id", user.id)]);
  items = pg.data || []; joined = new Set((su.data || []).map((x) => x.program_id));
  $("list").onclick = (e) => { const b = e.target.closest("[data-p]"); if (b) openProgram(b.dataset.p); };
  render(pg.error);
  const h = location.hash.slice(1); if (h && items.some((x) => x.id === h)) openProgram(h);
});

function render(err) {
  $("list").innerHTML = err ? `<div class="empty">Could not load programs. Please refresh.</div>` : items.length ? items.map((p) => {
    const k = KIND[p.kind] || KIND.other, closed = p.status === "closed";
    return `<article class="job"><div class="job-top"><div class="co ty"><i data-lucide="${k[0]}" class="icon"></i></div><div><h3>${esc(p.title)}</h3><div class="company">${k[1]}${p.reward ? " · " + esc(p.reward) : ""}</div></div></div>
    <p class="desc">${esc(p.summary)}</p><div class="job-foot"><span class="badge gray">${k[1]}</span>${closed ? `<span class="badge gray">Closed</span>` : joined.has(p.id) ? `<span class="badge"><i data-lucide="check" class="icon"></i> Interested</span>` : `<button class="btn btn-primary" data-p="${esc(p.id)}">Learn more <i data-lucide="arrow-right" class="icon"></i></button>`}</div></article>`;
  }).join("") : `<div class="empty"><i data-lucide="sparkles" class="icon"></i><p>No programs right now. Check back soon.</p></div>`;
  icons();
}

function openProgram(id) {
  const p = items.find((x) => x.id === id); if (!p) return; const k = KIND[p.kind] || KIND.other;
  const action = p.kind === "affiliate" ? `<a class="btn btn-green btn-lg" style="width:100%" href="profile.html#affiliate">Open the affiliate program</a>`
    : staff ? `<p class="fine">Staff accounts cannot sign up.</p>`
    : `<div id="pgMsg" class="message hidden"></div><form id="pgForm"><div class="form-group"><label for="pgNote">Tell us a little about you (optional)</label><textarea id="pgNote" rows="3" maxlength="500"></textarea></div><button class="btn btn-green btn-lg" id="pgGo" style="width:100%">I am interested</button></form>`;
  $("pgBody").innerHTML = `<h2>${esc(p.title)}</h2><p class="sub">${k[1]}${p.reward ? " · " + esc(p.reward) : ""}</p><p style="white-space:pre-wrap;color:var(--ink-2);font-size:.95rem;margin-bottom:1.25rem">${esc(p.description || p.summary)}</p>${action}`;
  $("pgModal").classList.remove("hidden");
  if ($("pgForm")) $("pgForm").onsubmit = async (e) => {
    e.preventDefault(); $("pgGo").disabled = true;
    const { error } = await sb.from("program_signups").insert([{ program_id: p.id, user_id: user.id, message: $("pgNote").value.trim() || null }]); $("pgGo").disabled = false;
    if (error) { const m = $("pgMsg"); m.className = "message error"; m.textContent = error.code === "23505" ? "You have already signed up for this program." : error.message; return; }
    joined.add(p.id); $("pgModal").classList.add("hidden"); render(); toast("Thanks! We will be in touch.");
  };
  icons();
}
