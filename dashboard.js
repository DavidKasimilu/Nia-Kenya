const GATEWAY_URL = "https://nia-gateway.davidkasimilu71.workers.dev";
const EDGE_KEY = "cf-worker-edge-managed";
const sb = window.supabase ? window.supabase.createClient(GATEWAY_URL, EDGE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icons = () => window.__icons && window.__icons();
const TYPES = ["All", "Job", "Internship", "Attachment"];
const state = { user: null, profile: null, isAdmin: false, opps: [], applied: new Set(), fields: {}, type: "All", current: null };

function toast(t) { const d = document.createElement("div"); d.className = "toast"; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 3200); }
function ago(iso) { const d = Math.floor((Date.now() - new Date(iso)) / 864e5); return d <= 0 ? "Today" : d === 1 ? "1 day ago" : d < 30 ? d + " days ago" : new Date(iso).toLocaleDateString("en-KE", { day: "numeric", month: "short" }); }
function isOpen(o) { return o.status !== "closed" && (!o.deadline || new Date(o.deadline) > new Date()); }
function avatarHtml(p, email) { const n = (p?.full_name || email || "?").trim()[0].toUpperCase(); return p?.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="" onerror="this.replaceWith(document.createTextNode('${esc(n)}'))">` : esc(n); }

document.addEventListener("DOMContentLoaded", async () => {
  if (!sb) return;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return (location.href = "index.html");
  state.user = session.user;
  const { data: p } = await sb.from("profiles").select("status, role, resume_url, full_name, phone, whatsapp, county, avatar_url").eq("id", session.user.id).maybeSingle();
  if (p?.status === "banned") { await sb.auth.signOut(); alert("Your account has been suspended. Please contact administration."); return (location.href = "index.html"); }
  state.profile = p || {}; state.isAdmin = p?.role === "admin";

  $("avatarBtn").innerHTML = avatarHtml(p, session.user.email);
  $("menuName").textContent = p?.full_name || "Student"; $("menuEmail").textContent = session.user.email;
  if (state.isAdmin) $("adminLink").classList.remove("hidden");
  $("avatarBtn").onclick = (e) => { e.stopPropagation(); const m = $("menu"); m.classList.toggle("hidden"); $("avatarBtn").setAttribute("aria-expanded", !m.classList.contains("hidden")); };
  document.addEventListener("click", (e) => { if (!$("menu").contains(e.target)) $("menu").classList.add("hidden"); });
  $("logoutBtn").onclick = async () => { await sb.auth.signOut(); location.href = "index.html"; };

  $("chips").innerHTML = TYPES.map((t) => `<button class="chip${t === "All" ? " on" : ""}" data-t="${t}">${t === "All" ? "All" : t + "s"}</button>`).join("");
  $("chips").onclick = (e) => { const b = e.target.closest(".chip"); if (!b) return; state.type = b.dataset.t; document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("on", c === b)); render(); };
  $("searchInput").oninput = render; $("locationFilterInput").oninput = render;
  ["applyClose", "applyCancel"].forEach((id) => ($(id).onclick = closeApply));
  $("applyModal").onclick = (e) => { if (e.target === $("applyModal")) closeApply(); };
  $("applyForm").onsubmit = submitApply;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeApply(); });

  const [o, a, f, n] = await Promise.all([
    sb.from("opportunities").select("*").order("created_at", { ascending: false }),
    sb.from("applications").select("opportunity_id").eq("user_id", session.user.id),
    sb.from("application_fields").select("*"),
    sb.from("announcements").select("message").eq("active", true).order("created_at", { ascending: false }).limit(1),
  ]);
  state.opps = o.data || []; state.applied = new Set((a.data || []).map((x) => x.opportunity_id));
  (f.data || []).forEach((x) => (state.fields[x.key] = x));
  if (n.data?.[0]) { $("announceText").textContent = n.data[0].message; $("announce").classList.remove("hidden"); }
  if (o.error) $("feed").innerHTML = `<div class="empty">Could not load opportunities. Please refresh.</div>`; else render();
  icons();
});

function render() {
  const q = $("searchInput").value.trim().toLowerCase(), loc = $("locationFilterInput").value.trim().toLowerCase();
  const list = state.opps.filter((o) => (state.type === "All" || o.type?.toLowerCase() === state.type.toLowerCase()) && (!q || (o.title + " " + o.company).toLowerCase().includes(q)) && (!loc || (o.location || "").toLowerCase().includes(loc)));
  $("count").textContent = `${list.length} ${list.length === 1 ? "opportunity" : "opportunities"}`;
  $("feed").innerHTML = list.length ? list.map(card).join("") : `<div class="empty"><i data-lucide="search-x" class="icon"></i><p>No opportunities match your filters.</p></div>`;
  $("feed").querySelectorAll("[data-apply]").forEach((b) => (b.onclick = () => openApply(b.dataset.apply)));
  icons();
}

function card(o) {
  const done = state.applied.has(o.id), open = isOpen(o);
  const btn = done ? `<span class="badge"><i data-lucide="check" class="icon"></i> Applied</span>` : open ? `<button class="btn btn-primary" data-apply="${esc(o.id)}">Apply <i data-lucide="arrow-right" class="icon"></i></button>` : `<span class="badge gray">Closed</span>`;
  return `<article class="job"><div class="job-top"><div class="co">${esc((o.company || "?")[0].toUpperCase())}</div><div><h3>${esc(o.title)}</h3><div class="company">${esc(o.company)}</div></div></div>
  <div class="meta"><span><i data-lucide="map-pin" class="icon"></i>${esc(o.location)}</span><span><i data-lucide="tag" class="icon"></i>${esc(o.type)}</span><span><i data-lucide="clock" class="icon"></i>${ago(o.created_at)}</span>${o.deadline ? `<span><i data-lucide="calendar" class="icon"></i>Closes ${new Date(o.deadline).toLocaleDateString("en-KE", { day: "numeric", month: "short" })}</span>` : ""}</div>
  <p class="desc">${esc(o.description)}</p><div class="job-foot"><span class="badge gray">${esc(o.type)}</span>${btn}</div></article>`;
}

function fieldHtml(k) {
  const f = state.fields[k]; if (!f) return "";
  const pre = state.profile?.[k] || "", id = "f_" + k, lab = `<label for="${id}">${esc(f.label)}</label>`;
  let inp;
  if (f.input_type === "textarea") inp = `<textarea id="${id}" name="${k}" rows="3" required>${esc(pre)}</textarea>`;
  else if (f.input_type === "select" || f.input_type === "boolean") {
    const opts = f.input_type === "boolean" ? ["Yes", "No"] : f.options || [];
    inp = `<select id="${id}" name="${k}" required><option value="">Select…</option>${opts.map((x) => `<option>${esc(x)}</option>`).join("")}</select>`;
  } else inp = `<input id="${id}" name="${k}" type="${esc(f.input_type)}" value="${esc(pre)}" required />`;
  return `<div class="form-group">${lab}${inp}${f.help_text ? `<small style="color:var(--mute)">${esc(f.help_text)}</small>` : ""}</div>`;
}

function openApply(id) {
  if (state.isAdmin) return toast("Administrators can't apply for opportunities.");
  const o = state.opps.find((x) => x.id === id); if (!o) return;
  state.current = o; $("applyTitle").textContent = o.title; $("applyCompany").textContent = `${o.company} · ${o.location}`;
  $("applyFields").innerHTML = (o.required_fields || []).map(fieldHtml).join("");
  const noCv = !state.profile?.resume_url; $("applyWarn").classList.toggle("hidden", !noCv); $("applySubmit").disabled = noCv;
  $("applyMsg").classList.add("hidden"); $("applyModal").classList.remove("hidden"); icons();
}
function closeApply() { $("applyModal").classList.add("hidden"); }

async function submitApply(e) {
  e.preventDefault(); const o = state.current; if (!o) return;
  const answers = {}; new FormData($("applyForm")).forEach((v, k) => (answers[k] = String(v).trim()));
  const btn = $("applySubmit"); btn.disabled = true; btn.textContent = "Submitting…";
  const { error } = await sb.from("applications").insert([{ opportunity_id: o.id, user_id: state.user.id, user_email: state.user.email, resume_url: state.profile.resume_url, answers }]);
  btn.disabled = false; btn.textContent = "Submit application";
  if (error) { const m = $("applyMsg"); m.className = "message error"; m.textContent = error.code === "23505" ? "You have already applied to this opportunity." : error.message.replace(/^.*Missing required detail: /, "Please fill in: "); return; }
  state.applied.add(o.id); closeApply(); render(); toast("Application submitted. Good luck!");
}
