const GATEWAY_URL = "https://nia-gateway.davidkasimilu71.workers.dev";
const EDGE_KEY = "cf-worker-edge-managed";
const sb = window.supabase ? window.supabase.createClient(GATEWAY_URL, EDGE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icons = () => window.__icons && window.__icons();
const TYPE_ICON = { job: "briefcase", internship: "graduation-cap", attachment: "building-2" };
const TYPES = ["All", "Job", "Internship", "Attachment"], PAGE = 12, NONE = "00000000-0000-0000-0000-000000000000";
const REASONS = { scam: "Looks like a scam", asks_for_payment: "Asks for payment", misleading: "Misleading or inaccurate", expired: "Already closed or expired", other: "Something else" };
const state = { user: null, profile: null, staff: false, items: [], total: 0, applied: new Set(), saved: new Set(), fields: {}, type: "All", current: null, seq: 0, subActive: false, required: false, plan: null };
const clean = (v) => v.replace(/[%,()*\\]/g, " ").trim();

function toast(t) { const d = document.createElement("div"); d.className = "toast"; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 3200); }
function coHtml(o) { return o.logo_url ? `<div class="co lg"><img src="${esc(o.logo_url)}" alt="" onerror="this.remove()"></div>` : `<div class="co ty"><i data-lucide="${TYPE_ICON[String(o.type || "").toLowerCase()] || "briefcase"}" class="icon"></i></div>`; }
function ago(iso) { const d = Math.floor((Date.now() - new Date(iso)) / 864e5); return d <= 0 ? "Today" : d === 1 ? "1 day ago" : d < 30 ? d + " days ago" : new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short" }); }
function isOpen(o) { return o.status !== "closed" && (!o.deadline || new Date(o.deadline) > new Date()); }
function avatarHtml(p, email) { const n = (p?.full_name || email || "?").trim()[0].toUpperCase(); return p?.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="" onerror="this.replaceWith(document.createTextNode('${esc(n)}'))">` : esc(n); }
const closeAll = () => ["applyModal", "reportModal", "payModal"].forEach((m) => $(m).classList.add("hidden"));

document.addEventListener("DOMContentLoaded", async () => {
  if (!sb) return;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return (location.href = "index.html");
  state.user = session.user;
  const { data: p } = await sb.from("profiles").select("status, role, resume_url, full_name, phone, whatsapp, county, avatar_url").eq("id", session.user.id).maybeSingle();
  if (p?.status === "banned") { await sb.auth.signOut(); alert("Your account has been suspended. Please contact administration."); return (location.href = "index.html"); }
  state.profile = p || {}; state.staff = ["admin", "moderator"].includes(p?.role);

  $("avatarBtn").innerHTML = avatarHtml(p, session.user.email);
  $("menuName").textContent = p?.full_name || "Student"; $("menuEmail").textContent = session.user.email;
  if (state.staff) $("adminLink").classList.remove("hidden");
  $("avatarBtn").onclick = (e) => { e.stopPropagation(); const m = $("menu"); m.classList.toggle("hidden"); $("avatarBtn").setAttribute("aria-expanded", !m.classList.contains("hidden")); };
  document.addEventListener("click", (e) => { if (!$("menu").contains(e.target)) $("menu").classList.add("hidden"); });
  $("logoutBtn").onclick = async () => { await sb.auth.signOut(); location.href = "index.html"; };

  $("chips").innerHTML = TYPES.map((t) => `<button class="chip${t === state.type ? " on" : ""}" data-t="${t}">${t === "All" ? "All" : t === "Saved" ? "Saved" : t + "s"}</button>`).join("");
  $("chips").onclick = (e) => { const b = e.target.closest(".chip"); if (!b) return; state.type = b.dataset.t; document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", c === b)); loadFeed(true); };
  let t; const deb = () => { clearTimeout(t); t = setTimeout(() => loadFeed(true), 300); };
  const dot = () => $("searchDot").classList.toggle("hidden", !($("searchInput").value.trim() || $("locationFilterInput").value.trim()));
  $("searchInput").oninput = () => { dot(); deb(); }; $("locationFilterInput").oninput = () => { dot(); deb(); };
  $("searchBtn").onclick = () => { const p = $("searchPanel"); p.classList.toggle("hidden"); $("searchBtn").setAttribute("aria-expanded", !p.classList.contains("hidden")); if (!p.classList.contains("hidden")) $("searchInput").focus(); };
  $("searchClear").onclick = () => { $("searchInput").value = ""; $("locationFilterInput").value = ""; dot(); loadFeed(true); };
  $("moreBtn").onclick = () => loadFeed(false);
  $("feed").onclick = (e) => {
    const b = e.target.closest("[data-apply],[data-save],[data-report]"); if (!b) return;
    if (b.dataset.apply) openApply(b.dataset.apply); else if (b.dataset.save) toggleSave(b.dataset.save); else openReport(b.dataset.report);
  };
  ["applyClose", "applyCancel"].forEach((id) => ($(id).onclick = closeAll)); ["reportClose", "reportCancel", "payClose"].forEach((id) => ($(id).onclick = closeAll)); $("payGo").onclick = startPayment;
  ["applyModal", "reportModal", "payModal"].forEach((m) => ($(m).onclick = (e) => { if (e.target === $(m)) closeAll(); }));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeAll(); });
  $("applyForm").onsubmit = submitApply; $("reportForm").onsubmit = submitReport;
  $("reportReason").innerHTML = `<option value="">Select a reason…</option>` + Object.entries(REASONS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("");

  const [a, s, f, n, su, pl, rq] = await Promise.all([
    sb.from("applications").select("opportunity_id").eq("user_id", session.user.id),
    sb.from("saved_listings").select("opportunity_id").eq("user_id", session.user.id),
    sb.from("application_fields").select("*"),
    sb.from("announcements").select("message").eq("active", true).order("created_at", { ascending: false }).limit(1),
    sb.from("subscriptions").select("paid_until").eq("user_id", session.user.id).maybeSingle(),
    sb.from("plans").select("*").eq("code", "monthly").maybeSingle(),
    sb.from("app_settings").select("value").eq("key", "subscriptions_required").maybeSingle(),
  ]);
  state.subActive = !!(su.data && new Date(su.data.paid_until) > new Date()); state.plan = pl.data; state.required = rq.data?.value === true;
  state.applied = new Set((a.data || []).map((x) => x.opportunity_id)); state.saved = new Set((s.data || []).map((x) => x.opportunity_id));
  (f.data || []).forEach((x) => (state.fields[x.key] = x));
  if (n.data?.[0]) { $("announceText").textContent = n.data[0].message; $("announce").classList.remove("hidden"); }
  loadFeed(true); icons();
});

async function loadFeed(reset) {
  const my = ++state.seq;
  if (reset) { state.items = []; $("feed").innerHTML = `<div class="skel"></div><div class="skel"></div><div class="skel"></div>`; $("moreBtn").classList.add("hidden"); }
  const from = state.items.length;
  let q = sb.from("opportunities").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(from, from + PAGE - 1);
  if (state.type === "Saved") q = q.in("id", state.saved.size ? [...state.saved] : [NONE]); else if (state.type !== "All") q = q.ilike("type", state.type);
  const s = clean($("searchInput").value), l = clean($("locationFilterInput").value);
  if (s) q = q.or(`title.ilike.%${s}%,company.ilike.%${s}%`);
  if (l) q = q.ilike("location", `%${l}%`);
  const { data, count, error } = await q; if (my !== state.seq) return;
  if (error) { $("feed").innerHTML = `<div class="empty">Could not load opportunities. Please refresh.</div>`; return; }
  state.items = state.items.concat(data || []); state.total = count ?? state.items.length; render();
}

function render() {
  $("count").textContent = `${state.total} ${state.total === 1 ? "opportunity" : "opportunities"}`;
  $("feed").innerHTML = state.items.length ? state.items.map(card).join("") : `<div class="empty"><i data-lucide="${state.type === "Saved" ? "bookmark" : "search-x"}" class="icon"></i><p>${state.type === "Saved" ? "You haven't saved anything yet." : "No opportunities match your filters."}</p></div>`;
  $("moreBtn").classList.toggle("hidden", state.items.length >= state.total); icons();
}

function card(o) {
  const done = state.applied.has(o.id), open = isOpen(o), sv = state.saved.has(o.id);
  const btn = done ? `<span class="badge"><i data-lucide="check" class="icon"></i> Applied</span>` : open ? `<button class="btn btn-primary" data-apply="${esc(o.id)}">Apply <i data-lucide="arrow-right" class="icon"></i></button>` : `<span class="badge gray">Closed</span>`;
  return `<article class="job"><div class="job-top">${coHtml(o)}<div><h3>${esc(o.title)}</h3><div class="company">${esc(o.company)}</div></div>
  <div class="tools"><button class="tool${sv ? " on" : ""}" data-save="${esc(o.id)}" aria-label="${sv ? "Remove from saved" : "Save listing"}" title="${sv ? "Saved" : "Save"}"><i data-lucide="bookmark" class="icon"></i></button><button class="tool" data-report="${esc(o.id)}" aria-label="Report listing" title="Report"><i data-lucide="flag" class="icon"></i></button></div></div>
  <div class="meta"><span><i data-lucide="map-pin" class="icon"></i>${esc(o.location)}</span><span><i data-lucide="tag" class="icon"></i>${esc(o.type)}</span><span><i data-lucide="clock" class="icon"></i>${ago(o.created_at)}</span>${o.deadline ? `<span><i data-lucide="calendar" class="icon"></i>Closes ${new Date(o.deadline).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}</span>` : ""}</div>
  <p class="desc">${esc(o.description)}</p><div class="job-foot"><span class="badge gray">${esc(o.type)}</span>${btn}</div></article>`;
}

async function toggleSave(id) {
  const on = state.saved.has(id);
  const { error } = on ? await sb.from("saved_listings").delete().match({ user_id: state.user.id, opportunity_id: id }) : await sb.from("saved_listings").insert([{ user_id: state.user.id, opportunity_id: id }]);
  if (error) return toast(error.message);
  if (on) { state.saved.delete(id); if (state.type === "Saved") { state.items = state.items.filter((x) => x.id !== id); state.total = Math.max(0, state.total - 1); } } else state.saved.add(id);
  render(); toast(on ? "Removed from saved." : "Saved.");
}

function openReport(id) {
  if (state.staff) return toast("Use the admin console to manage listings.");
  const o = state.items.find((x) => x.id === id); if (!o) return;
  state.current = o; $("reportFor").textContent = `${o.title} · ${o.company}`; $("reportForm").reset(); $("reportMsg").classList.add("hidden"); $("reportModal").classList.remove("hidden");
}
async function submitReport(e) {
  e.preventDefault(); const o = state.current, b = $("reportSubmit"); b.disabled = true;
  const { error } = await sb.from("listing_reports").insert([{ opportunity_id: o.id, reporter_id: state.user.id, reason: $("reportReason").value, details: $("reportDetails").value.trim() || null }]); b.disabled = false;
  if (error) { const m = $("reportMsg"); m.className = "message error"; m.textContent = error.code === "23505" ? "You have already reported this listing." : error.message; return; }
  closeAll(); toast("Thank you. Our team will review this listing.");
}

function fieldHtml(k) {
  const f = state.fields[k]; if (!f) return "";
  const pre = state.profile?.[k] || "", id = "f_" + k, lab = `<label for="${id}">${esc(f.label)}</label>`; let inp;
  if (f.input_type === "textarea") inp = `<textarea id="${id}" name="${k}" rows="3" required>${esc(pre)}</textarea>`;
  else if (f.input_type === "select" || f.input_type === "boolean") { const opts = f.input_type === "boolean" ? ["Yes", "No"] : f.options || []; inp = `<select id="${id}" name="${k}" required><option value="">Select…</option>${opts.map((x) => `<option>${esc(x)}</option>`).join("")}</select>`; }
  else inp = `<input id="${id}" name="${k}" type="${esc(f.input_type)}" value="${esc(pre)}" required />`;
  return `<div class="form-group">${lab}${inp}${f.help_text ? `<small style="color:var(--mute)">${esc(f.help_text)}</small>` : ""}</div>`;
}
function openApply(id) {
  if (state.staff) return toast("Administrators can't apply for opportunities.");
  const o = state.items.find((x) => x.id === id); if (!o) return;
  if (state.required && !state.subActive) return openPaywall(o);
  state.current = o; $("applyTitle").textContent = o.title; $("applyCompany").textContent = `${o.company} · ${o.location}`;
  $("applyFields").innerHTML = (o.required_fields || []).map(fieldHtml).join("");
  const noCv = !state.profile?.resume_url; $("applyWarn").classList.toggle("hidden", !noCv); $("applySubmit").disabled = noCv;
  $("applyMsg").classList.add("hidden"); $("applyModal").classList.remove("hidden"); icons();
}
async function submitApply(e) {
  e.preventDefault(); const o = state.current; if (!o) return;
  const answers = {}; new FormData($("applyForm")).forEach((v, k) => (answers[k] = String(v).trim()));
  const btn = $("applySubmit"); btn.disabled = true; btn.textContent = "Submitting…";
  const { error } = await sb.from("applications").insert([{ opportunity_id: o.id, user_id: state.user.id, user_email: state.user.email, resume_url: state.profile.resume_url, answers }]);
  btn.disabled = false; btn.textContent = "Submit application";
  if (error && /row-level security|42501/i.test((error.code || "") + error.message)) { closeAll(); state.subActive = false; return openPaywall(o); }
  if (error) { const m = $("applyMsg"); m.className = "message error"; m.textContent = error.code === "23505" ? "You have already applied to this opportunity." : error.message.replace(/^.*Missing required detail: /, "Please fill in: "); return; }
  state.applied.add(o.id); closeAll(); render(); toast("Application submitted. Good luck!");
}

/* ---------- Membership paywall ---------- */
function openPaywall(o) {
  state.current = o; $("payFor").textContent = `To apply for ${o.title}, you need an active membership.`;
  $("payPrice").textContent = "KES " + (state.plan?.amount_kes ?? 250); $("payMsg").classList.add("hidden");
  $("payGo").disabled = false; $("payGo").textContent = "Subscribe with M-Pesa or card"; $("payModal").classList.remove("hidden"); icons();
}
function payErr(t) { const m = $("payMsg"); m.className = "message error"; m.textContent = t; $("payGo").disabled = false; $("payGo").textContent = "Subscribe with M-Pesa or card"; }
async function startPayment() {
  if (!state.plan) return payErr("Membership is not available right now.");
  $("payGo").disabled = true; $("payMsg").classList.add("hidden");
  await NiaPay.subscribe({
    sb, user: state.user, plan: state.plan,
    onBusy: (v) => ($("payGo").textContent = v ? "Confirming your payment…" : "Subscribe with M-Pesa or card"),
    onClose: () => { if (!state.subActive) $("payGo").disabled = false; },
    onError: payErr,
    onDone: () => { state.subActive = true; $("payModal").classList.add("hidden"); toast("You are subscribed. Welcome!"); openApply(state.current.id); },
  });
}
