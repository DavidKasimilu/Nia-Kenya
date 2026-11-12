const GATEWAY_URL = "https://nia-gateway.davidkasimilu71.workers.dev";
const EDGE_KEY = "cf-worker-edge-managed";
const sb = window.supabase ? window.supabase.createClient(GATEWAY_URL, EDGE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icons = () => window.__icons && window.__icons();
const dt = (d) => new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
const badge = (s) => `<span class="badge b-${esc(s)}">${esc(s)}</span>`;
const ST = ["new", "reviewing", "shortlisted", "contacted", "rejected"];
let me, isAdmin = false, fields = [];
const resumePath = (v) => (v && /^https?:/.test(v) ? (v.includes("/object/public/resumes/") ? decodeURIComponent(v.split("/object/public/resumes/")[1].split("?")[0]) : null) : v || null);

function toast(t) { const d = document.createElement("div"); d.className = "toast"; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 3000); }
function openModal(html) { $("modalBody").innerHTML = html + ""; $("modal").classList.remove("hidden"); icons(); }
function closeModal() { $("modal").classList.add("hidden"); }
function confirmBox(title, msg, ok) {
  return new Promise((res) => {
    openModal(`<h2>${esc(title)}</h2><p class="sub">${esc(msg)}</p><button class="btn btn-danger" id="cY" style="width:100%">${esc(ok)}</button><button class="btn btn-ghost" id="cN">Cancel</button>`);
    $("cY").onclick = () => { closeModal(); res(true); }; $("cN").onclick = () => { closeModal(); res(false); };
  });
}
async function log(action, type, id, details = {}) { await sb.from("audit_log").insert([{ actor_id: me.id, actor_email: me.email, action, target_type: type, target_id: String(id || ""), details }]); }
function head(t, s, btn = "") { return `<div class="bar"><div><h1>${esc(t)}</h1><p class="sub" style="margin-bottom:0">${esc(s)}</p></div>${btn}</div>`; }
const empty = (t) => `<div class="empty">${esc(t)}</div>`;

document.addEventListener("DOMContentLoaded", async () => {
  if (!sb) return;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return (location.href = "index.html");
  me = session.user;
  const { data: p } = await sb.from("profiles").select("role,status").eq("id", me.id).maybeSingle();
  if (!["admin", "moderator"].includes(p?.role) || p.status === "banned") return (location.href = "dashboard.html");
  isAdmin = p.role === "admin"; if (!isAdmin) document.querySelectorAll("[data-admin]").forEach((e) => e.remove());
  $("logoutBtn").onclick = async () => { await sb.auth.signOut(); location.href = "index.html"; };
  $("modal").onclick = (e) => { if (e.target === $("modal")) closeModal(); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
  const f = await sb.from("application_fields").select("*").order("sort_order"); fields = f.data || [];
  window.addEventListener("hashchange", route); route();
});

const views = { reports: reportsView, fields: fieldsView, overview, opportunities, applications, users, avatars, announcements, audit };
async function route() {
  let v = views[location.hash.slice(1)] ? location.hash.slice(1) : "overview";
  if (!isAdmin && ["fields", "avatars", "announcements", "audit"].includes(v)) v = "overview";
  document.querySelectorAll("#nav a[data-v]").forEach((a) => a.classList.toggle("on", a.dataset.v === v));
  $("view").onclick = null; $("view").innerHTML = empty("Loading…");
  try { await views[v](); } catch (e) { $("view").innerHTML = empty("Something went wrong: " + e.message); }
  icons(); window.scrollTo(0, 0);
}

/* ---------- Overview ---------- */
async function overview() {
  const [s, r] = await Promise.all([sb.rpc("admin_dashboard_stats"), sb.from("applications").select("id,user_email,created_at,opportunities(title)").order("created_at", { ascending: false }).limit(6)]);
  if (s.error) throw s.error; const d = s.data, days = d.applications_by_day || [], max = Math.max(1, ...days.map((x) => x.count));
  const st = (i, l, v, n) => `<div class="stat"><div class="l"><i data-lucide="${i}" class="icon"></i>${l}</div><div class="v">${v}</div><div class="n">${n || "&nbsp;"}</div></div>`;
  $("view").innerHTML = head("Overview", "How Nia is doing right now.") +
    `<div class="stats">${st("briefcase", "Open listings", d.opportunities_open, d.opportunities_total + " total")}${st("inbox", "Applications", d.applications_total, d.applications_new + " new, " + d.applications_7d + " this week")}${st("users", "Students", d.students_total, "+" + d.students_7d + " this week")}${st("user-x", "Banned", d.users_banned)}</div>
    <div class="cols"><div class="panel"><h2>Applications, last 14 days</h2><div class="chart">${days.map((x) => `<div style="height:${(x.count / max) * 100}%" data-t="${esc(x.day)}: ${x.count}"></div>`).join("")}</div></div>
    <div class="panel"><h2>Latest applications</h2>${(r.data || []).map((a) => `<p style="font-size:.88rem;margin-bottom:.6rem"><b>${esc(a.opportunities?.title || "Removed listing")}</b><br><span style="color:var(--mute)">${esc(a.user_email)} · ${dt(a.created_at)}</span></p>`).join("") || "<p style='color:var(--mute)'>Nothing yet.</p>"}</div></div>`;
}

/* ---------- Opportunities ---------- */
async function opportunities() {
  const { data, error } = await sb.from("opportunities").select("*").order("created_at", { ascending: false }); if (error) throw error;
  $("view").innerHTML = head("Listings", "Create and manage opportunities.", `<button class="btn btn-green" id="newOpp"><i data-lucide="plus" class="icon"></i> New listing</button>`) +
    `<div class="rows">${(data || []).map((o) => `<div class="r"><div class="grow"><h3>${esc(o.title)}</h3><p>${esc(o.company)} · ${esc(o.location)} · ${esc(o.type)}${o.deadline ? " · closes " + dt(o.deadline) : ""}</p></div>${badge(o.status)}
      <div class="acts"><button class="ib" data-e="${esc(o.id)}" title="Edit"><i data-lucide="pencil" class="icon"></i><span>Edit</span></button><button class="ib" data-t="${esc(o.id)}" title="${o.status === "published" ? "Close" : "Publish"}"><i data-lucide="${o.status === "published" ? "lock" : "send"}" class="icon"></i><span>${o.status === "published" ? "Close" : "Publish"}</span></button>${isAdmin ? `<button class="ib d" data-d="${esc(o.id)}" title="Delete"><i data-lucide="trash-2" class="icon"></i><span>Delete</span></button>` : ""}</div></div>`).join("") || empty("No listings yet.")}</div>`;
  $("newOpp").onclick = () => oppForm();
  $("view").onclick = async (e) => {
    const b = e.target.closest("button[data-e],button[data-t],button[data-d]"); if (!b) return;
    const o = data.find((x) => x.id === (b.dataset.e || b.dataset.t || b.dataset.d));
    if (b.dataset.e) return oppForm(o);
    if (b.dataset.t) { const ns = o.status === "published" ? "closed" : "published"; const { error } = await sb.from("opportunities").update({ status: ns }).eq("id", o.id); if (error) return toast(error.message); await log("opportunity." + ns, "opportunity", o.id, { title: o.title }); toast("Listing " + ns + "."); return route(); }
    if (await confirmBox("Delete listing?", `"${o.title}" and all its applications will be removed.`, "Delete")) { const { error } = await sb.from("opportunities").delete().eq("id", o.id); if (error) return toast(error.message); await log("opportunity.delete", "opportunity", o.id, { title: o.title }); toast("Deleted."); route(); }
  };
}
function oppForm(o = {}) {
  const req = new Set(o.required_fields || []);
  openModal(`<button class="close-btn" id="x"><i data-lucide="x" class="icon"></i></button><h2>${o.id ? "Edit listing" : "New listing"}</h2><p class="sub">Fill in the details students will see.</p><div id="fm" class="message hidden"></div>
  <form id="of"><div class="form-group"><label>Title</label><input name="title" required value="${esc(o.title)}"></div>
  <div class="two"><div class="form-group"><label>Company</label><input name="company" required value="${esc(o.company)}"></div><div class="form-group"><label>Location</label><input name="location" required value="${esc(o.location)}"></div></div>
  <div class="two"><div class="form-group"><label>Type</label><select name="type">${["Job", "Internship", "Attachment"].map((t) => `<option ${o.type === t ? "selected" : ""}>${t}</option>`).join("")}</select></div>
  <div class="form-group"><label>Status</label><select name="status">${["published", "draft", "closed"].map((t) => `<option ${(o.status || "published") === t ? "selected" : ""}>${t}</option>`).join("")}</select></div></div>
  <div class="form-group"><label>Application deadline (optional)</label><input type="date" name="deadline" value="${o.deadline ? new Date(o.deadline).toLocaleDateString("en-CA") : ""}"></div>
  <div class="form-group"><label>Description</label><textarea name="description" rows="5" required>${esc(o.description)}</textarea></div>
  <div class="form-group"><label>Details to collect from applicants</label><div class="checks2">${fields.filter((f) => f.active).map((f) => `<label><input type="checkbox" name="rf" value="${esc(f.key)}" ${req.has(f.key) ? "checked" : ""}> ${esc(f.label)}</label>`).join("")}</div></div>
  <button class="btn btn-submit" id="sv">${o.id ? "Save changes" : "Publish listing"}</button></form>`);
  $("x").onclick = closeModal;
  $("of").onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target), dl = f.get("deadline");
    const row = { title: f.get("title").trim(), company: f.get("company").trim(), location: f.get("location").trim(), type: f.get("type"), status: f.get("status"), description: f.get("description").trim(), deadline: dl ? new Date(dl + "T23:59:59+03:00").toISOString() : null, required_fields: f.getAll("rf") };
    $("sv").disabled = true;
    const q = o.id ? sb.from("opportunities").update(row).eq("id", o.id).select("id").single() : sb.from("opportunities").insert([row]).select("id").single();
    const { data, error } = await q; $("sv").disabled = false;
    if (error) { const m = $("fm"); m.className = "message error"; m.textContent = error.message; return; }
    await log(o.id ? "opportunity.update" : "opportunity.create", "opportunity", data.id, { title: row.title }); closeModal(); toast("Saved."); route();
  };
}

/* ---------- Applications ---------- */
async function applications() {
  const [a, o] = await Promise.all([sb.from("applications").select("*,opportunities(title,company)").order("created_at", { ascending: false }), sb.from("opportunities").select("id,title").order("title")]);
  if (a.error) throw a.error; const ids = [...new Set(a.data.map((x) => x.user_id).filter(Boolean))];
  const pr = ids.length ? (await sb.from("profiles").select("id,full_name,phone,whatsapp,county,institution,course,resume_url").in("id", ids)).data || [] : [];
  const P = Object.fromEntries(pr.map((x) => [x.id, x])); let list = a.data;
  let lim = 25;
  const draw = () => {
    const fo = $("fOpp").value, fs = $("fSt").value, q = $("fQ").value.toLowerCase();
    list = a.data.filter((x) => (!fo || x.opportunity_id === fo) && (!fs || x.status === fs) && (!q || (x.user_email + " " + (P[x.user_id]?.full_name || "")).toLowerCase().includes(q)));
    $("appRows").innerHTML = (list.slice(0, lim).map((x) => `<div class="r" data-a="${esc(x.id)}" style="cursor:pointer"><div class="grow"><h3>${esc(P[x.user_id]?.full_name || x.user_email)}</h3><p>${esc(x.opportunities?.title || "Removed listing")} · ${dt(x.created_at)}</p></div>${badge(x.status)}<span class="ib"><i data-lucide="pencil" class="icon"></i><span>Update</span></span></div>`).join("") || empty("No applications match.")) + (list.length > lim ? `<button class="btn btn-ghost" id="appMore">Show more (${list.length - lim} left)</button>` : "");
    if ($("appMore")) $("appMore").onclick = () => { lim += 25; draw(); };
    icons();
  };
  $("view").innerHTML = head("Applicants", "Review and contact applicants.", `<button class="btn btn-ghost" id="csv"><i data-lucide="download" class="icon"></i> Export CSV</button>`) +
    `<div class="toolbar"><input id="fQ" placeholder="Search name or email"><select id="fOpp"><option value="">All listings</option>${o.data.map((x) => `<option value="${esc(x.id)}">${esc(x.title)}</option>`).join("")}</select><select id="fSt"><option value="">All statuses</option>${[...ST, "withdrawn"].map((s) => `<option>${s}</option>`).join("")}</select></div><div class="rows" id="appRows"></div>`;
  ["fQ", "fOpp", "fSt"].forEach((i) => ($(i).oninput = () => { lim = 25; draw(); })); draw();
  $("appRows").onclick = (e) => { const r = e.target.closest("[data-a]"); if (r) appDetail(list.find((x) => x.id === r.dataset.a), P[list.find((x) => x.id === r.dataset.a).user_id] || {}); };
  $("csv").onclick = () => {
    const keys = [...new Set(list.flatMap((x) => Object.keys(x.answers || {})))], q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["Listing", "Company", "Name", "Email", "Phone", "Status", "Applied", ...keys]].concat(list.map((x) => [x.opportunities?.title, x.opportunities?.company, P[x.user_id]?.full_name, x.user_email, P[x.user_id]?.phone, x.status, new Date(x.created_at).toISOString().slice(0, 10), ...keys.map((k) => (x.answers || {})[k])]));
    const url = URL.createObjectURL(new Blob(["\ufeff" + rows.map((r) => r.map(q).join(",")).join("\n")], { type: "text/csv" }));
    Object.assign(document.createElement("a"), { href: url, download: "nia-applicants.csv" }).click(); URL.revokeObjectURL(url);
  };
}
function appDetail(a, p) {
  const label = (k) => fields.find((f) => f.key === k)?.label || k, cv = a.resume_url || p.resume_url;
  const rows = [["Email", a.user_email], ["Phone", p.phone], ["WhatsApp", p.whatsapp], ["County", p.county], ["Institution", p.institution], ["Course", p.course]].filter((r) => r[1]);
  openModal(`<button class="close-btn" id="x"><i data-lucide="x" class="icon"></i></button><h2>${esc(p.full_name || a.user_email)}</h2><p class="sub">${esc(a.opportunities?.title || "")} · applied ${dt(a.created_at)}</p>
  <dl class="dl">${rows.map((r) => `<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join("")}${Object.entries(a.answers || {}).map(([k, v]) => `<dt>${esc(label(k))}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
  ${cv ? `<button class="btn btn-ghost btn-sm" id="cvOpen"><i data-lucide="file-text" class="icon"></i> Open CV</button>` : ""}
  <div class="form-group" style="margin-top:1rem"><label>Status</label><select id="aSt">${(a.status === "withdrawn" ? [...ST, "withdrawn"] : ST).map((s) => `<option ${a.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
  <div class="form-group"><label>Private notes</label><textarea id="aNote" rows="3">${esc(a.admin_notes)}</textarea></div><button class="btn btn-submit" id="aSave">Save</button>`);
  $("x").onclick = closeModal;
  if (cv) $("cvOpen").onclick = async () => { const w = window.open("", "_blank"), { data, error } = await sb.storage.from("resumes").createSignedUrl(resumePath(cv), 300); if (error) { w && w.close(); return toast("Could not open CV."); } w.location = data.signedUrl; };
  $("aSave").onclick = async () => { const { error } = await sb.from("applications").update({ status: $("aSt").value, admin_notes: $("aNote").value.trim() || null }).eq("id", a.id); if (error) return toast(error.message); await log("application.update", "application", a.id, { status: $("aSt").value }); closeModal(); toast("Saved."); route(); };
}

/* ---------- Users ---------- */
async function users() {
  const { data, error } = await sb.from("profiles").select("id,email,full_name,role,status,created_at,institution").order("created_at", { ascending: false }); if (error) throw error;
  let lim = 25;
  const draw = () => {
    const q = $("uQ").value.toLowerCase(); const l = data.filter((u) => !q || ((u.full_name || "") + u.email).toLowerCase().includes(q));
    $("uRows").innerHTML = (l.slice(0, lim).map((u) => `<div class="r"><div class="grow"><h3>${esc(u.full_name || u.email)}</h3><p>${esc(u.email)} · joined ${dt(u.created_at)}${u.institution ? " · " + esc(u.institution) : ""}</p></div>${u.role !== "student" ? badge(u.role).replace("b-" + u.role, "b-published") : ""}${badge(u.status || "active")}
      ${isAdmin && u.role !== "admin" && u.id !== me.id ? `<div class="acts"><button class="ib" data-m="${esc(u.id)}" title="${u.role === "moderator" ? "Remove moderator" : "Make moderator"}"><i data-lucide="${u.role === "moderator" ? "shield-off" : "shield"}" class="icon"></i><span>${u.role === "moderator" ? "Remove moderator" : "Make moderator"}</span></button><button class="ib" data-b="${esc(u.id)}" title="${u.status === "banned" ? "Unban" : "Ban"}"><i data-lucide="${u.status === "banned" ? "user-check" : "ban"}" class="icon"></i><span>${u.status === "banned" ? "Unban" : "Ban"}</span></button><button class="ib d" data-x="${esc(u.id)}" title="Delete"><i data-lucide="trash-2" class="icon"></i><span>Delete</span></button></div>` : ""}</div>`).join("") || empty("No users found.")) + (l.length > lim ? `<button class="btn btn-ghost" id="uMore">Show more (${l.length - lim} left)</button>` : ""); icons(); if ($("uMore")) $("uMore").onclick = () => { lim += 25; draw(); };
  };
  $("view").innerHTML = head("Users", data.length + " registered accounts.") + `<div class="toolbar"><input id="uQ" placeholder="Search name or email"></div><div class="rows" id="uRows"></div>`;
  $("uQ").oninput = () => { lim = 25; draw(); }; draw();
  $("uRows").onclick = async (e) => {
    const b = e.target.closest("button"); if (!b) return; const u = data.find((x) => x.id === (b.dataset.b || b.dataset.x || b.dataset.m));
    if (b.dataset.m) { const nr = u.role === "moderator" ? "student" : "moderator"; const { error } = await sb.from("profiles").update({ role: nr }).eq("id", u.id); if (error) return toast(error.message); await log("user.role", "user", u.id, { email: u.email, role: nr }); toast("Role set to " + nr + "."); return route(); }
    if (b.dataset.b) { const ns = u.status === "banned" ? "active" : "banned"; if (ns === "banned" && !(await confirmBox("Ban this user?", u.email + " will lose access immediately.", "Ban"))) return; const { error } = await sb.from("profiles").update({ status: ns }).eq("id", u.id); if (error) return toast(error.message); await log("user." + (ns === "banned" ? "ban" : "unban"), "user", u.id, { email: u.email }); toast("User " + ns + "."); return route(); }
    if (await confirmBox("Delete this user?", u.email + " and all their applications will be permanently removed.", "Delete")) { const { error } = await sb.rpc("delete_user_by_admin", { target_user_id: u.id }); if (error) return toast(error.message); toast("User deleted."); route(); }
  };
}

/* ---------- Avatars ---------- */
async function avatars() {
  const { data, error } = await sb.from("avatars").select("*").order("created_at", { ascending: false }); if (error) throw error;
  $("view").innerHTML = head("Default avatars", "New students get one of these at random. They can swap it later.", `<label class="btn btn-green" for="avUp"><i data-lucide="upload" class="icon"></i> Add avatars</label><input id="avUp" type="file" multiple accept="image/png,image/jpeg,image/webp" class="hidden">`) +
    `<div class="panel"><div class="avs">${(data || []).map((a) => `<figure class="${a.active ? "" : "off"}"><img src="${esc(a.url)}" alt=""><button class="ib" data-t="${esc(a.id)}" title="${a.active ? "Disable" : "Enable"}"><i data-lucide="${a.active ? "eye" : "eye-off"}" class="icon"></i></button> <button class="ib d" data-d="${esc(a.id)}" title="Delete"><i data-lucide="trash-2" class="icon"></i></button></figure>`).join("") || empty("No avatars yet. Add a few square images (up to 2 MB each).")}</div></div>`;
  $("avUp").onchange = async (e) => {
    let n = 0; for (const f of e.target.files) {
      const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[f.type]; if (!ext || f.size > 2097152) { toast("Skipped " + f.name); continue; }
      const path = `defaults/${Date.now()}_${n}.${ext}`, up = await sb.storage.from("avatars").upload(path, f, { contentType: f.type }); if (up.error) { toast(up.error.message); continue; }
      const { error } = await sb.from("avatars").insert([{ url: sb.storage.from("avatars").getPublicUrl(path).data.publicUrl, label: f.name, created_by: me.id }]); if (!error) n++;
    } if (n) { await log("avatar.add", "avatar", "", { count: n }); toast(n + " added."); route(); }
  };
  $("view").onclick = async (e) => {
    const b = e.target.closest("button"); if (!b) return; const a = data.find((x) => x.id === (b.dataset.t || b.dataset.d)); if (!a) return;
    if (b.dataset.t) { await sb.from("avatars").update({ active: !a.active }).eq("id", a.id); return route(); }
    if (await confirmBox("Delete avatar?", "Users who already have it keep their copy.", "Delete")) { const p = a.url.split("/object/public/avatars/")[1]; if (p) await sb.storage.from("avatars").remove([decodeURIComponent(p)]); await sb.from("avatars").delete().eq("id", a.id); route(); }
  };
}

/* ---------- Announcements ---------- */
async function announcements() {
  const { data, error } = await sb.from("announcements").select("*").order("created_at", { ascending: false }); if (error) throw error;
  $("view").innerHTML = head("Announcements", "The newest active message shows as a banner on the student feed.") +
    `<form class="panel" id="af" style="margin-bottom:1rem"><div class="form-group"><label>New message</label><input id="aMsg" maxlength="200" required placeholder="e.g. New attachment listings are live"></div><button class="btn btn-primary">Publish</button></form>
    <div class="rows">${(data || []).map((a) => `<div class="r"><div class="grow"><h3>${esc(a.message)}</h3><p>${dt(a.created_at)}</p></div>${badge(a.active ? "active" : "draft").replace("draft", "off")}<div class="acts"><button class="ib" data-t="${esc(a.id)}" title="Toggle"><i data-lucide="${a.active ? "eye-off" : "eye"}" class="icon"></i><span>Toggle</span></button><button class="ib d" data-d="${esc(a.id)}" title="Delete"><i data-lucide="trash-2" class="icon"></i><span>Delete</span></button></div></div>`).join("") || empty("No announcements yet.")}</div>`;
  $("af").onsubmit = async (e) => { e.preventDefault(); const { error } = await sb.from("announcements").insert([{ message: $("aMsg").value.trim(), created_by: me.id }]); if (error) return toast(error.message); await log("announcement.create", "announcement", "", { message: $("aMsg").value.trim() }); route(); };
  $("view").onclick = async (e) => { const b = e.target.closest("button[data-t],button[data-d]"); if (!b) return; const a = data.find((x) => x.id === (b.dataset.t || b.dataset.d)); if (b.dataset.t) await sb.from("announcements").update({ active: !a.active }).eq("id", a.id); else await sb.from("announcements").delete().eq("id", a.id); route(); };
}

/* ---------- Audit log ---------- */
async function audit() {
  const { data, error } = await sb.from("audit_log").select("*").order("created_at", { ascending: false }).limit(100); if (error) throw error;
  $("view").innerHTML = head("Audit log", "The last 100 admin actions.") + `<div class="rows">${(data || []).map((l) => `<div class="r"><div class="grow"><h3>${esc(l.action)}</h3><p>${esc(l.actor_email || "system")} · ${new Date(l.created_at).toLocaleString("en-KE")}${l.details && Object.keys(l.details).length ? " · " + esc(Object.values(l.details).join(", ")) : ""}</p></div></div>`).join("") || empty("No activity logged yet.")}</div>`;
}

/* ---------- Applicant-detail catalog ---------- */
const slug = (s) => { const k = s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""); return /^[a-z]/.test(k) ? k : "f_" + k; };
async function fieldsView() {
  const { data, error } = await sb.from("application_fields").select("*").order("sort_order"); if (error) throw error; fields = data;
  $("view").innerHTML = head("Applicant details", "The questions you can ask applicants when posting a listing.", `<button class="btn btn-green" id="nf"><i data-lucide="plus" class="icon"></i> New detail</button>`) +
    `<div class="rows">${data.map((f) => `<div class="r"><div class="grow"><h3>${esc(f.label)}</h3><p>${esc(f.key)} · ${esc(f.input_type)}${f.help_text ? " · " + esc(f.help_text) : ""}</p></div>${badge(f.active ? "active" : "off")}<div class="acts"><button class="ib" data-e="${esc(f.key)}" title="Edit"><i data-lucide="pencil" class="icon"></i><span>Edit</span></button><button class="ib" data-t="${esc(f.key)}" title="${f.active ? "Disable" : "Enable"}"><i data-lucide="${f.active ? "eye-off" : "eye"}" class="icon"></i><span>${f.active ? "Disable" : "Enable"}</span></button></div></div>`).join("")}</div>`;
  $("nf").onclick = () => fieldForm();
  $("view").onclick = async (e) => {
    const b = e.target.closest("button"); if (!b) return; const f = data.find((x) => x.key === (b.dataset.e || b.dataset.t)); if (!f) return;
    if (b.dataset.e) return fieldForm(f);
    if (f.active) { const { count } = await sb.from("opportunities").select("id", { count: "exact", head: true }).contains("required_fields", [f.key]); if (count) return toast(`Used by ${count} listing(s). Remove it from them first.`); }
    const { error } = await sb.from("application_fields").update({ active: !f.active }).eq("key", f.key); if (error) return toast(error.message);
    await log("field." + (f.active ? "disable" : "enable"), "field", f.key); route();
  };
}
function fieldForm(f = {}) {
  const types = ["text", "tel", "email", "url", "textarea", "date", "number", "select", "boolean"];
  openModal(`<button class="close-btn" id="x"><i data-lucide="x" class="icon"></i></button><h2>${f.key ? "Edit detail" : "New detail"}</h2><p class="sub">Applicants fill this in when a listing requires it.</p><div id="fm" class="message hidden"></div>
  <form id="ff"><div class="form-group"><label>Label</label><input name="label" required value="${esc(f.label)}" placeholder="e.g. Do you have a driving licence?"></div>
  <div class="two"><div class="form-group"><label>Answer type</label><select name="input_type">${types.map((t) => `<option ${f.input_type === t ? "selected" : ""}>${t}</option>`).join("")}</select></div><div class="form-group"><label>Order</label><input type="number" name="sort_order" value="${f.sort_order ?? 200}"></div></div>
  <div class="form-group" id="optBox"><label>Choices (comma separated, for "select")</label><input name="options" value="${esc((f.options || []).join(", "))}" placeholder="Option A, Option B"></div>
  <div class="form-group"><label>Help text (optional)</label><input name="help_text" value="${esc(f.help_text)}"></div><button class="btn btn-submit">Save</button></form>`);
  $("x").onclick = closeModal;
  const sync = () => $("optBox").classList.toggle("hidden", $("ff").input_type.value !== "select"); $("ff").input_type.onchange = sync; sync();
  $("ff").onsubmit = async (e) => {
    e.preventDefault(); const d = new FormData(e.target), t = d.get("input_type"), opts = t === "select" ? d.get("options").split(",").map((x) => x.trim()).filter(Boolean) : null;
    if (t === "select" && !opts.length) { const m = $("fm"); m.className = "message error"; m.textContent = "Add at least one choice."; return; }
    const row = { label: d.get("label").trim(), input_type: t, options: opts, help_text: d.get("help_text").trim() || null, sort_order: Number(d.get("sort_order")) || 0 };
    const { error } = f.key ? await sb.from("application_fields").update(row).eq("key", f.key) : await sb.from("application_fields").insert([{ key: slug(row.label), ...row }]);
    if (error) { const m = $("fm"); m.className = "message error"; m.textContent = error.code === "23505" ? "A detail with that name already exists." : error.message; return; }
    await log(f.key ? "field.update" : "field.create", "field", f.key || slug(row.label), { label: row.label }); closeModal(); toast("Saved."); route();
  };
}

/* ---------- Reports ---------- */
const REASONS = { scam: "Looks like a scam", asks_for_payment: "Asks for payment", misleading: "Misleading or inaccurate", expired: "Already closed or expired", other: "Something else" };
async function reportsView() {
  const { data, error } = await sb.from("listing_reports").select("*,opportunities(id,title,company,status)").order("created_at", { ascending: false }).limit(300); if (error) throw error;
  const ids = [...new Set(data.map((x) => x.reporter_id))];
  const pr = ids.length ? (await sb.from("profiles").select("id,email,full_name").in("id", ids)).data || [] : []; const P = Object.fromEntries(pr.map((x) => [x.id, x]));
  const RST = ["open", "reviewing", "resolved", "dismissed"];
  $("view").innerHTML = head("Reports", "Listings students have flagged.") + `<div class="toolbar"><select id="rSt"><option value="">All reports</option>${RST.map((s) => `<option ${s === "open" ? "selected" : ""}>${s}</option>`).join("")}</select></div><div class="rows" id="rRows"></div>`;
  const draw = () => {
    const f = $("rSt").value, l = data.filter((x) => !f || x.status === f);
    $("rRows").innerHTML = l.map((x) => `<div class="r" data-r="${esc(x.id)}" style="cursor:pointer"><div class="grow"><h3>${esc(REASONS[x.reason] || x.reason)}: ${esc(x.opportunities?.title || "Removed listing")}</h3><p>${esc(P[x.reporter_id]?.email || "unknown")} · ${dt(x.created_at)}</p></div>${badge(x.status)}<span class="ib"><i data-lucide="eye" class="icon"></i><span>Review</span></span></div>`).join("") || empty("No reports here."); icons();
  };
  $("rSt").onchange = draw; draw();
  $("rRows").onclick = (e) => {
    const row = e.target.closest("[data-r]"); if (!row) return; const x = data.find((y) => y.id === row.dataset.r), o = x.opportunities || {};
    openModal(`<button class="close-btn" id="x"><i data-lucide="x" class="icon"></i></button><h2>${esc(REASONS[x.reason] || x.reason)}</h2><p class="sub">${esc(o.title || "Removed listing")} ${o.company ? "· " + esc(o.company) : ""}</p>
    <dl class="dl"><dt>Reported by</dt><dd>${esc(P[x.reporter_id]?.email || "unknown")}</dd><dt>Date</dt><dd>${dt(x.created_at)}</dd><dt>Details</dt><dd>${esc(x.details || "None given")}</dd><dt>Listing status</dt><dd>${esc(o.status || "removed")}</dd></dl>
    <div class="form-group"><label>Report status</label><select id="rNew">${RST.map((s) => `<option ${x.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>
    <div class="form-group"><label>Private notes</label><textarea id="rNote" rows="3">${esc(x.admin_notes)}</textarea></div>
    <button class="btn btn-submit" id="rSave">Save</button>${o.id && o.status === "published" ? `<button class="btn btn-ghost" id="rClose" style="width:100%;margin-top:.5rem"><i data-lucide="lock" class="icon"></i> Close this listing</button>` : ""}`);
    $("x").onclick = closeModal;
    $("rSave").onclick = async () => { const { error } = await sb.from("listing_reports").update({ status: $("rNew").value, admin_notes: $("rNote").value.trim() || null }).eq("id", x.id); if (error) return toast(error.message); await log("report." + $("rNew").value, "report", x.id, { listing: o.title }); closeModal(); toast("Saved."); route(); };
    if ($("rClose")) $("rClose").onclick = async () => { const { error } = await sb.from("opportunities").update({ status: "closed" }).eq("id", o.id); if (error) return toast(error.message); await log("opportunity.closed", "opportunity", o.id, { title: o.title, via: "report" }); closeModal(); toast("Listing closed."); route(); };
  };
}
