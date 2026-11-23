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
function head(t, s, btn = "") { return btn ? `<div class="bar" style="justify-content:flex-end;align-items:center">${btn}</div>` : ""; }
const empty = (t) => `<div class="empty">${esc(t)}</div>`;

document.addEventListener("DOMContentLoaded", async () => {
  if (!sb) return;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return (location.href = "index.html");
  me = session.user;
  const { data: p } = await sb.from("profiles").select("role,status").eq("id", me.id).maybeSingle();
  if (!["admin", "moderator"].includes(p?.role) || p.status === "banned") return (location.href = "dashboard.html");
  isAdmin = p.role === "admin"; buildNav();
  $("logoutBtn").onclick = async () => { await sb.auth.signOut(); location.href = "index.html"; };
  $("modal").onclick = (e) => { if (e.target === $("modal")) closeModal(); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
  const f = await sb.from("application_fields").select("*").order("sort_order"); fields = f.data || [];
  window.addEventListener("hashchange", route); route();
});

const views = { messages: messagesView, employers: employersView, programs: programsView, affiliates: affiliatesView, billing: billingView, reports: reportsView, fields: fieldsView, overview, opportunities, applications, users, avatars, announcements, audit };
async function route() {
  let v = views[location.hash.slice(1)] ? location.hash.slice(1) : "overview";
  if (!isAdmin && ["employers", "programs", "affiliates", "billing", "fields", "avatars", "announcements", "audit"].includes(v)) v = "overview";
  document.querySelectorAll("#nav a[data-v]").forEach((a) => a.classList.toggle("on", a.dataset.v === v));
  document.querySelectorAll("#nav .grp").forEach((b) => b.classList.toggle("on", GROUPS.find((x) => x.id === b.dataset.g).items.some((i) => i[0] === v))); closePop();
  $("view").onclick = null; $("view").innerHTML = empty("Loading…");
  try { await views[v](); } catch (e) { $("view").innerHTML = empty("Something went wrong: " + e.message); }
  icons(); window.scrollTo(0, 0);
}

/* ---------- Overview ---------- */
async function overview() {
  const [s, r, rep] = await Promise.all([sb.rpc("admin_dashboard_stats"), sb.from("applications").select("id,user_email,created_at,opportunities(title)").order("created_at", { ascending: false }).limit(6), sb.from("listing_reports").select("id", { count: "exact", head: true }).eq("status", "open")]);
  if (s.error) throw s.error; const d = s.data, days = d.applications_by_day || [], max = Math.max(1, ...days.map((x) => x.count));
  const st = (i, l, v, n) => `<div class="stat"><div class="l"><i data-lucide="${i}" class="icon"></i>${l}</div><div class="v">${v}</div><div class="n">${n || "&nbsp;"}</div></div>`;
  $("view").innerHTML = head("Overview", "How Nia is doing right now.") +
    `<div class="stats">${st("briefcase", "Open listings", d.opportunities_open, d.opportunities_total + " total")}${st("inbox", "Applications", d.applications_total, d.applications_new + " new, " + d.applications_7d + " this week")}${st("users", "Students", d.students_total, "+" + d.students_7d + " this week")}${st("user-x", "Banned", d.users_banned)}<a class="stat" href="#reports" style="display:block"><div class="l"><i data-lucide="flag" class="icon"></i>Open reports</div><div class="v">${rep.count ?? 0}</div><div class="n">${rep.count ? "Needs review" : "All clear"}</div></a></div>
    <div class="cols"><div class="panel"><h2>Applications, last 14 days</h2><div class="chart">${days.map((x) => `<div style="height:${(x.count / max) * 100}%" data-t="${esc(x.day)}: ${x.count}"></div>`).join("")}</div></div>
    <div class="panel"><h2>Latest applications</h2>${(r.data || []).map((a) => `<p style="font-size:.88rem;margin-bottom:.6rem"><b>${esc(a.opportunities?.title || "Removed listing")}</b><br><span style="color:var(--mute)">${esc(a.user_email)} · ${dt(a.created_at)}</span></p>`).join("") || "<p style='color:var(--mute)'>Nothing yet.</p>"}</div></div>`;
}

/* ---------- Opportunities ---------- */
function logoPath(u) { return u && u.includes("/object/public/listing-logos/") ? decodeURIComponent(u.split("/object/public/listing-logos/")[1].split("?")[0]) : null; }
async function dropLogos(list, remaining) {
  const keep = new Set((remaining || []).map((x) => x.logo_url).filter(Boolean));
  const paths = list.map((o) => (keep.has(o.logo_url) ? null : logoPath(o.logo_url))).filter(Boolean);
  if (paths.length) await sb.storage.from("listing-logos").remove([...new Set(paths)]);
}
async function opportunities() {
  const [o, st, epr] = await Promise.all([sb.from("opportunities").select("*").order("created_at", { ascending: false }), sb.rpc("admin_listing_stats"), sb.from("employer_profiles").select("user_id,org_name")]);
  if (o.error) throw o.error;
  const data = o.data || [], S = Object.fromEntries((st.data || []).map((x) => [x.opportunity_id, x])), sel = new Set(), E = Object.fromEntries((epr.data || []).map((e) => [e.user_id, e.org_name])); let lim = 25;
  const btn = (k, id, icon, label, cls = "") => `<button class="ib ${cls}" data-${k}="${esc(id)}"><i data-lucide="${icon}" class="icon"></i><span>${label}</span></button>`;
  const row = (x) => { const s = S[x.id] || {}, pub = x.status === "published"; return `<div class="r"><input type="checkbox" class="ck" data-k="${esc(x.id)}" ${sel.has(x.id) ? "checked" : ""} aria-label="Select listing"><div class="grow"><h3>${esc(x.title)}</h3><p>${esc(x.company)} · ${esc(x.location)} · ${esc(x.type)}${x.deadline ? " · closes " + dt(x.deadline) : ""}${x.employer_id && E[x.employer_id] ? " · by " + esc(E[x.employer_id]) : ""}${x.featured ? " · ★ featured" : ""}</p><p>${s.applicants ?? 0} applicants · ${s.saves ?? 0} saved${s.open_reports ? ` · <b style="color:var(--red)">${s.open_reports} open report(s)</b>` : ""}</p></div>${badge(x.status)}<div class="acts">${btn("e", x.id, "pencil", "Edit")}${btn("t", x.id, pub ? "lock" : "send", pub ? "Close" : x.status === "pending" ? "Approve" : "Publish")}${isAdmin ? btn("f", x.id, "star", x.featured ? "Unfeature" : "Feature") : ""}${btn("c", x.id, "copy", "Duplicate")}${s.applicants ? btn("m", x.id, "mail", "Message") : ""}${isAdmin ? btn("d", x.id, "trash-2", "Delete", "d") : ""}</div></div>`; };
  function bar() { $("bulk").style.display = sel.size ? "flex" : "none"; $("bulkN").textContent = sel.size + " selected"; }
  function draw() { $("oRows").innerHTML = (data.slice(0, lim).map(row).join("") || empty("No listings yet.")) + (data.length > lim ? `<button class="btn btn-ghost" id="oMore">Show more (${data.length - lim} left)</button>` : ""); icons(); if ($("oMore")) $("oMore").onclick = () => { lim += 25; draw(); }; bar(); }
  $("view").innerHTML = head("", "", `<button class="btn btn-green" id="newOpp"><i data-lucide="plus" class="icon"></i> New listing</button>`) +
    `<div class="toolbar" id="bulk" style="display:none;align-items:center"><b id="bulkN"></b><button class="btn btn-ghost" data-bulk="published">Publish</button><button class="btn btn-ghost" data-bulk="closed">Close</button>${isAdmin ? `<button class="btn btn-ghost" data-bulk="delete" style="color:var(--red)">Delete</button>` : ""}<button class="btn btn-ghost" data-bulk="all">Select all</button><button class="btn btn-ghost" data-bulk="clear">Clear</button></div><div class="rows" id="oRows"></div>`;
  draw(); $("newOpp").onclick = () => oppForm();
  $("view").onchange = (e) => { const c = e.target.closest(".ck"); if (!c) return; c.checked ? sel.add(c.dataset.k) : sel.delete(c.dataset.k); bar(); };
  $("view").onclick = async (e) => {
    const b = e.target.closest("button"); if (!b) return; const d = b.dataset;
    if (d.bulk) {
      const ids = [...sel];
      if (d.bulk === "all") { data.forEach((x) => sel.add(x.id)); return draw(); }
      if (d.bulk === "clear") { sel.clear(); return draw(); }
      if (!ids.length) return;
      if (d.bulk === "delete") {
        if (!(await confirmBox("Delete " + ids.length + " listing(s)?", "Their applications will be removed too.", "Delete"))) return;
        await dropLogos(data.filter((x) => sel.has(x.id)), data.filter((x) => !sel.has(x.id)));
        const { error } = await sb.from("opportunities").delete().in("id", ids); if (error) return toast(error.message);
        await log("opportunity.bulk_delete", "opportunity", "", { count: ids.length }); toast("Deleted."); return route();
      }
      const { error } = await sb.from("opportunities").update({ status: d.bulk }).in("id", ids); if (error) return toast(error.message);
      await log("opportunity.bulk_" + d.bulk, "opportunity", "", { count: ids.length }); toast("Done."); return route();
    }
    const x = data.find((y) => y.id === (d.e || d.t || d.c || d.m || d.d || d.f)); if (!x) return;
    if (d.f) { const { error } = await sb.from("opportunities").update({ featured: !x.featured }).eq("id", x.id); if (error) return toast(error.message); await log(x.featured ? "opportunity.unfeature" : "opportunity.feature", "opportunity", x.id, { title: x.title }); return route(); }
    if (d.e) return oppForm(x);
    if (d.c) return oppForm({ ...x, id: undefined, created_at: undefined, title: "Copy of " + x.title, status: "draft" });
    if (d.t) { const ns = x.status === "published" ? "closed" : "published"; const { error } = await sb.from("opportunities").update({ status: ns }).eq("id", x.id); if (error) return toast(error.message); await log("opportunity." + ns, "opportunity", x.id, { title: x.title }); toast("Listing " + ns + "."); return route(); }
    if (d.m) {
      openModal(`<button class="close-btn" id="mx"><i data-lucide="x" class="icon"></i></button><h2>Message applicants</h2><p class="sub">${esc(x.title)}: ${S[x.id]?.applicants ?? 0} applicant(s) will see this in their notifications.</p><div id="fm" class="message hidden"></div><div class="form-group"><label>Title</label><input id="mT" maxlength="120"></div><div class="form-group"><label>Message</label><textarea id="mB" rows="4" maxlength="500"></textarea></div><button class="btn btn-submit" id="mGo">Send</button>`);
      $("mx").onclick = closeModal;
      $("mGo").onclick = async () => { const t = $("mT").value.trim(), fail = (s) => { const m = $("fm"); m.className = "message error"; m.textContent = s; }; if (!t) return fail("Add a title."); const r = await sb.rpc("send_opportunity_message", { p_opp: x.id, p_title: t, p_body: $("mB").value.trim() || null }); if (r.error) return fail(r.error.message); closeModal(); toast("Sent to " + r.data + " applicant(s)."); };
      return;
    }
    if (d.d && (await confirmBox("Delete listing?", `"${x.title}" and all its applications will be removed.`, "Delete"))) {
      await dropLogos([x], data.filter((y) => y.id !== x.id));
      const { error } = await sb.from("opportunities").delete().eq("id", x.id); if (error) return toast(error.message);
      await log("opportunity.delete", "opportunity", x.id, { title: x.title }); toast("Deleted."); route();
    }
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
  <div class="form-group"><label>Logo or icon (optional)</label>${o.logo_url ? `<div style="display:flex;align-items:center;gap:.7rem;margin-bottom:.4rem"><img src="${esc(o.logo_url)}" alt="" style="width:44px;height:44px;object-fit:contain;border:1px solid var(--line);border-radius:10px"><label style="font-weight:500;font-size:.88rem"><input type="checkbox" name="rmlogo"> Remove logo</label></div>` : ""}<input type="file" name="logo" accept="image/png,image/jpeg,image/webp"><small style="color:var(--mute)">PNG, JPG or WebP, up to 1 MB. If empty, a default icon for the listing type is shown.</small></div>
  <div class="form-group"><label>Description</label><textarea name="description" rows="5" required>${esc(o.description)}</textarea></div>
  <div class="form-group"><label>Details to collect from applicants</label><div class="checks2">${fields.filter((f) => f.active).map((f) => `<label><input type="checkbox" name="rf" value="${esc(f.key)}" ${req.has(f.key) ? "checked" : ""}> ${esc(f.label)}</label>`).join("")}</div></div>
  <button class="btn btn-submit" id="sv">${o.id ? "Save changes" : "Publish listing"}</button></form>`);
  $("x").onclick = closeModal;
  $("of").onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target), dl = f.get("deadline");
    const row = { title: f.get("title").trim(), company: f.get("company").trim(), location: f.get("location").trim(), type: f.get("type"), status: f.get("status"), description: f.get("description").trim(), deadline: dl ? new Date(dl + "T23:59:59+03:00").toISOString() : null, required_fields: f.getAll("rf") };
    $("sv").disabled = true;
    const file = f.get("logo"), bad = (t) => { const m = $("fm"); m.className = "message error"; m.textContent = t; $("sv").disabled = false; };
    if (file && file.size) {
      const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[file.type];
      if (!ext) return bad("Logo must be a PNG, JPG or WebP image."); if (file.size > 1048576) return bad("Logo must be 1 MB or smaller.");
      const path = `${crypto.randomUUID()}.${ext}`, up = await sb.storage.from("listing-logos").upload(path, file, { contentType: file.type });
      if (up.error) return bad("Logo upload failed: " + up.error.message);
      row.logo_url = sb.storage.from("listing-logos").getPublicUrl(path).data.publicUrl;
    } else if (f.get("rmlogo")) row.logo_url = null; else if (!o.id && o.logo_url) row.logo_url = o.logo_url;
    const q = o.id ? sb.from("opportunities").update(row).eq("id", o.id).select("id").single() : sb.from("opportunities").insert([row]).select("id").single();
    const { data, error } = await q; $("sv").disabled = false;
    if (error) { const m = $("fm"); m.className = "message error"; m.textContent = error.message; return; }
    const oldLogo = o.id ? logoPath(o.logo_url) : null;
    if (oldLogo && (row.logo_url === null || (row.logo_url && row.logo_url !== o.logo_url))) { const { count } = await sb.from("opportunities").select("id", { count: "exact", head: true }).eq("logo_url", o.logo_url).neq("id", data.id); if (!count) await sb.storage.from("listing-logos").remove([oldLogo]); }
    await log(o.id ? "opportunity.update" : "opportunity.create", "opportunity", data.id, { title: row.title }); closeModal(); toast("Saved."); route();
  };
}

/* ---------- Applications ---------- */
async function applications() {
  const [a, o] = await Promise.all([sb.from("applications").select("*,opportunities(title,company)").order("created_at", { ascending: false }), sb.from("opportunities").select("id,title").order("title")]);
  if (a.error) throw a.error; const ids = [...new Set(a.data.map((x) => x.user_id).filter(Boolean))];
  const pr = ids.length ? (await sb.from("profiles").select("id,full_name,phone,whatsapp,county,institution,course,resume_url").in("id", ids)).data || [] : [];
  const P = Object.fromEntries(pr.map((x) => [x.id, x])); let list = a.data;
  let lim = 25; const selA = new Set();
  const draw = () => {
    const fo = $("fOpp").value, fs = $("fSt").value, q = $("fQ").value.toLowerCase();
    list = a.data.filter((x) => (!fo || x.opportunity_id === fo) && (!fs || x.status === fs) && (!q || (x.user_email + " " + (P[x.user_id]?.full_name || "")).toLowerCase().includes(q)));
    $("appRows").innerHTML = (list.slice(0, lim).map((x) => `<div class="r" data-a="${esc(x.id)}" style="cursor:pointer"><input type="checkbox" class="ck" data-k="${esc(x.id)}" ${selA.has(x.id) ? "checked" : ""} aria-label="Select applicant"><div class="grow"><h3>${esc(P[x.user_id]?.full_name || x.user_email)}</h3><p>${esc(x.opportunities?.title || "Removed listing")} · ${dt(x.created_at)}</p></div>${badge(x.status)}<span class="ib"><i data-lucide="pencil" class="icon"></i><span>Update</span></span></div>`).join("") || empty("No applications match.")) + (list.length > lim ? `<button class="btn btn-ghost" id="appMore">Show more (${list.length - lim} left)</button>` : "");
    if ($("appMore")) $("appMore").onclick = () => { lim += 25; draw(); };
    icons();
  };
  $("view").innerHTML = head("Applicants", "Review and contact applicants.", `<button class="btn btn-ghost" id="csv"><i data-lucide="download" class="icon"></i> Export CSV</button>`) +
    `<div class="toolbar"><input id="fQ" placeholder="Search name or email"><select id="fOpp"><option value="">All listings</option>${o.data.map((x) => `<option value="${esc(x.id)}">${esc(x.title)}</option>`).join("")}</select><select id="fSt"><option value="">All statuses</option>${[...ST, "withdrawn"].map((s) => `<option>${s}</option>`).join("")}</select></div><div class="toolbar" id="aBulk" style="display:none;align-items:center"><b id="aBulkN"></b><select id="aBulkSt" class="sel">${ST.map((s) => `<option>${s}</option>`).join("")}</select><button class="btn btn-primary" id="aBulkGo">Set status</button><button class="btn btn-ghost" id="aBulkClr">Clear</button></div><div class="rows" id="appRows"></div>`;
  ["fQ", "fOpp", "fSt"].forEach((i) => ($(i).oninput = () => { lim = 25; draw(); })); draw();
  const aBar = () => { $("aBulk").style.display = selA.size ? "flex" : "none"; $("aBulkN").textContent = selA.size + " selected"; };
  $("appRows").onchange = (e) => { const c = e.target.closest(".ck"); if (!c) return; c.checked ? selA.add(c.dataset.k) : selA.delete(c.dataset.k); aBar(); };
  $("aBulkClr").onclick = () => { selA.clear(); draw(); aBar(); };
  $("aBulkGo").onclick = async () => {
    const ids = [...selA], status = $("aBulkSt").value; if (!ids.length) return;
    if (!(await confirmBox("Set " + ids.length + " application(s) to " + status + "?", "Students get an email when the status becomes shortlisted, contacted or rejected.", "Update"))) return;
    const { error } = await sb.from("applications").update({ status }).in("id", ids); if (error) return toast(error.message);
    await log("application.bulk_status", "application", "", { count: ids.length, status }); toast("Updated."); route();
  };
  $("appRows").onclick = (e) => { if (e.target.closest(".ck")) return; const r = e.target.closest("[data-a]"); if (r) appDetail(list.find((x) => x.id === r.dataset.a), P[list.find((x) => x.id === r.dataset.a).user_id] || {}); };
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
    if (await confirmBox("Delete this user?", u.email + " and all their applications will be permanently removed.", "Delete")) { for (const bucket of ["resumes", "avatars"]) { const { data: fl } = await sb.storage.from(bucket).list(u.id); if (fl && fl.length) await sb.storage.from(bucket).remove(fl.map((f) => `${u.id}/${f.name}`)); } const { error } = await sb.rpc("delete_user_by_admin", { target_user_id: u.id }); if (error) return toast(error.message); toast("User deleted."); route(); }
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
    `<form class="panel" id="af" style="margin-bottom:1rem"><div class="form-group"><label>New message (sent to every student's notifications)</label><input id="aMsg" maxlength="200" required placeholder="e.g. New attachment listings are live"></div><button class="btn btn-primary">Publish</button></form>
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

/* ---------- Billing ---------- */
async function billingView() {
  const since = new Date(Date.now() - 30 * 864e5).toISOString();
  const [st, pl, py, act, rev] = await Promise.all([
    sb.from("app_settings").select("value").eq("key", "subscriptions_required").maybeSingle(),
    sb.from("plans").select("*").order("sort_order"),
    sb.from("payments").select("*").order("created_at", { ascending: false }).limit(50),
    sb.from("subscriptions").select("user_id", { count: "exact", head: true }).gt("paid_until", new Date().toISOString()),
    sb.from("payments").select("amount_kes").eq("source", "paystack").gte("created_at", since).limit(5000),
  ]);
  const on = st.data?.value === true, plans = pl.data || [], list = py.data || [], rev30 = (rev.data || []).reduce((s, p) => s + Number(p.amount_kes), 0);
  const ids = [...new Set(list.map((p) => p.user_id).filter(Boolean))], pr = ids.length ? (await sb.from("profiles").select("id,email").in("id", ids)).data || [] : [], E = Object.fromEntries(pr.map((x) => [x.id, x.email]));
  const stat = (i, l, v, n) => `<div class="stat"><div class="l"><i data-lucide="${i}" class="icon"></i>${l}</div><div class="v">${v}</div><div class="n">${n || "&nbsp;"}</div></div>`;
  $("view").innerHTML = head("Billing", "Membership settings and payments.") +
    `<div class="stats" style="grid-template-columns:repeat(3,1fr)">${stat("users", "Active members", act.count ?? 0)}${stat("banknote", "Revenue, last 30 days", "KES " + rev30.toLocaleString("en-KE"), "Paystack payments")}${stat("lock", "Paywall", on ? "ON" : "OFF", on ? "Applying needs a membership" : "Everyone applies free")}</div>
    <div class="cols"><div class="panel"><h2>Paywall</h2><p style="color:var(--ink-2);font-size:.9rem;margin-bottom:1rem">${on ? "Students need an active membership to apply." : "Everyone can apply for free. Turn this on when you are ready to charge."}</p><button class="btn ${on ? "btn-ghost" : "btn-green"}" id="payToggle">${on ? "Turn paywall off" : "Turn paywall on"}</button>
    <h2 style="margin-top:1.4rem">Plan prices (KES)</h2>${plans.map((p) => `<div class="toolbar" style="align-items:center"><span style="min-width:90px">${esc(p.name)}</span><input type="number" min="1" data-pa="${esc(p.code)}" value="${esc(p.amount_kes)}" style="max-width:110px;flex:none;min-width:0"><button class="btn btn-primary" data-ps="${esc(p.code)}">Save</button></div>`).join("")}</div>
    <div class="panel"><h2>Give free membership</h2><form id="grantForm"><div class="form-group"><label>Student email</label><input id="gEmail" type="email" required></div><div class="form-group"><label>Days</label><input id="gDays" type="number" min="1" max="365" value="30" required></div><div class="form-group"><label>Note (optional)</label><input id="gNote"></div><button class="btn btn-primary">Grant</button></form></div></div>
    <h2 style="margin:1.5rem 0 .75rem;font-size:1.05rem">Recent payments</h2><div class="rows">${list.map((p) => `<div class="r"><div class="grow"><h3>${p.source === "admin_grant" ? "Free membership" : "KES " + Number(p.amount_kes)}</h3><p>${esc(E[p.user_id] || "deleted account")} · ${dt(p.created_at)} · ${p.days_added} days</p></div>${badge(p.source === "admin_grant" ? "off" : "active").replace("off", "gift").replace("active", "paid")}</div>`).join("") || empty("No payments yet.")}</div>`;
  $("payToggle").onclick = async () => {
    if (!on && !(await confirmBox("Turn the paywall on?", "Students without an active membership will no longer be able to apply.", "Turn on"))) return;
    const { error } = await sb.from("app_settings").upsert({ key: "subscriptions_required", value: !on, updated_at: new Date().toISOString() }); if (error) return toast(error.message);
    await log("paywall." + (on ? "off" : "on"), "settings", "subscriptions_required"); toast("Paywall " + (on ? "off" : "on") + "."); route();
  };
  $("view").onclick = async (e) => { const b = e.target.closest("[data-ps]"); if (!b) return; const code = b.dataset.ps, v = parseInt(document.querySelector(`[data-pa="${code}"]`).value, 10); if (!(v > 0)) return toast("Enter a valid price."); const { error } = await sb.from("plans").update({ amount_kes: v }).eq("code", code); if (error) return toast(error.message); await log("plan.price", "plan", code, { amount_kes: v }); toast("Price updated."); };
  $("grantForm").onsubmit = async (e) => { e.preventDefault(); const { error } = await sb.rpc("admin_grant_subscription", { p_email: $("gEmail").value.trim(), p_days: parseInt($("gDays").value, 10), p_note: $("gNote").value.trim() || null }); if (error) return toast(error.message); toast("Membership granted."); route(); };
}

/* ---------- Affiliates ---------- */
async function affiliatesView() {
  const [af, cm, rf, st] = await Promise.all([
    sb.from("affiliates").select("*").order("created_at", { ascending: false }).limit(500),
    sb.from("commissions").select("affiliate_id,amount_kes,status").limit(10000),
    sb.from("profiles").select("referred_by").not("referred_by", "is", null).limit(10000),
    sb.from("app_settings").select("key,value").in("key", ["affiliate_default_rate", "affiliate_mode"]),
  ]);
  if (af.error) throw af.error;
  const S = Object.fromEntries((st.data || []).map((x) => [x.key, x.value])), rate = Number(S.affiliate_default_rate ?? 20), mode = S.affiliate_mode || "every";
  const ids = (af.data || []).map((a) => a.user_id), pr = ids.length ? (await sb.from("profiles").select("id,email,full_name").in("id", ids)).data || [] : [], P = Object.fromEntries(pr.map((x) => [x.id, x]));
  const T = {}; (cm.data || []).forEach((c) => { const t = (T[c.affiliate_id] ||= { pending: 0, paid: 0 }); if (c.status === "pending") t.pending += Number(c.amount_kes); if (c.status === "paid") t.paid += Number(c.amount_kes); });
  const R = {}; (rf.data || []).forEach((x) => (R[x.referred_by] = (R[x.referred_by] || 0) + 1));
  const kes = (n) => "KES " + Number(n || 0).toLocaleString("en-KE");
  $("view").innerHTML = head("Affiliates", "People earning commission for referrals.") +
    `<div class="panel" style="margin-bottom:1rem"><h2>Program settings</h2><div class="toolbar"><label style="display:flex;align-items:center;gap:.5rem;font-size:.9rem">Default rate (%) <input type="number" id="dRate" min="20" max="100" value="${rate}" style="width:90px;flex:none;min-width:0"></label>
      <select id="dMode"><option value="every" ${mode === "every" ? "selected" : ""}>Commission on every payment</option><option value="first" ${mode === "first" ? "selected" : ""}>Commission on first payment only</option></select><button class="btn btn-primary" id="dSave">Save</button></div>
      <small style="color:var(--mute)">The rate can never go below 20%. A new rate applies to affiliates who join afterwards. Change an individual affiliate's rate below.</small></div>
    <div class="rows" id="afRows">${(af.data || []).map((a) => { const t = T[a.user_id] || { pending: 0, paid: 0 }, p = P[a.user_id] || {};
      return `<div class="r"><div class="grow"><h3>${esc(p.full_name || p.email || "Unknown")} <span style="color:var(--mute);font-weight:500">${esc(a.code)}</span></h3><p>${esc(p.email || "")} · ${R[a.user_id] || 0} referred · pending ${kes(t.pending)} · paid ${kes(t.paid)}${a.payout_phone ? " · M-Pesa " + esc(a.payout_phone) : ""}</p></div>${badge(a.status === "active" ? "active" : "banned").replace("banned", "suspended")}${a.rate}%
      <div class="acts"><button class="ib" data-rate="${esc(a.user_id)}"><i data-lucide="percent" class="icon"></i><span>Rate</span></button>${t.pending > 0 ? `<button class="ib" data-pay="${esc(a.user_id)}"><i data-lucide="banknote" class="icon"></i><span>Mark paid</span></button>` : ""}<button class="ib" data-sus="${esc(a.user_id)}"><i data-lucide="${a.status === "active" ? "pause" : "play"}" class="icon"></i><span>${a.status === "active" ? "Suspend" : "Activate"}</span></button></div></div>`; }).join("") || empty("No affiliates yet.")}</div>`;
  $("dSave").onclick = async () => {
    for (const [key, value] of [["affiliate_default_rate", Number($("dRate").value)], ["affiliate_mode", $("dMode").value]]) { const { error } = await sb.from("app_settings").upsert({ key, value, updated_at: new Date().toISOString() }); if (error) return toast(error.message); }
    await log("affiliate.settings", "settings", "affiliate", { rate: $("dRate").value, mode: $("dMode").value }); toast("Saved.");
  };
  $("afRows").onclick = async (e) => {
    const b = e.target.closest("button"); if (!b) return; const id = b.dataset.rate || b.dataset.pay || b.dataset.sus, a = af.data.find((x) => x.user_id === id), p = P[id] || {};
    if (b.dataset.sus) { const { error } = await sb.from("affiliates").update({ status: a.status === "active" ? "suspended" : "active" }).eq("user_id", id); if (error) return toast(error.message); await log("affiliate." + (a.status === "active" ? "suspend" : "activate"), "user", id); return route(); }
    if (b.dataset.rate) {
      openModal(`<button class="close-btn" id="x"><i data-lucide="x" class="icon"></i></button><h2>Commission rate</h2><p class="sub">${esc(p.email || "")} (minimum 20%)</p><div class="form-group"><label>Rate (%)</label><input id="rIn" type="number" min="20" max="100" value="${a.rate}"></div><button class="btn btn-submit" id="rGo">Save rate</button>`);
      $("x").onclick = closeModal; $("rGo").onclick = async () => { const { error } = await sb.from("affiliates").update({ rate: Number($("rIn").value) }).eq("user_id", id); if (error) return toast(error.message.includes("check") ? "Rate must be between 20 and 100." : error.message); await log("affiliate.rate", "user", id, { rate: $("rIn").value }); closeModal(); route(); };
      return;
    }
    const t = T[id] || { pending: 0 };
    openModal(`<button class="close-btn" id="x"><i data-lucide="x" class="icon"></i></button><h2>Mark as paid</h2><p class="sub">Send ${kes(t.pending)} to ${esc(a.payout_phone || "the affiliate (no number saved)")} by M-Pesa first, then enter the reference.</p><div class="form-group"><label>M-Pesa reference</label><input id="pRef" placeholder="e.g. SKL2ABC123"></div><button class="btn btn-submit" id="pGo">Mark ${kes(t.pending)} as paid</button>`);
    $("x").onclick = closeModal; $("pGo").onclick = async () => { const { error } = await sb.rpc("admin_mark_commissions_paid", { p_affiliate: id, p_ref: $("pRef").value }); if (error) return toast(error.message); closeModal(); toast("Marked as paid."); route(); };
  };
}

/* ---------- Grouped menu ---------- */
const GROUPS = [
  { id: "opp", label: "Opportunities", icon: "briefcase", items: [["opportunities", "Listings", "briefcase"], ["applications", "Applicants", "inbox"], ["messages", "Messages", "mail"], ["reports", "Reports", "flag"], ["employers", "Employers", "building-2", 1], ["programs", "Programs", "sparkles", 1], ["fields", "Applicant details", "list-checks", 1]] },
  { id: "ppl", label: "People", icon: "users", items: [["users", "Users", "users"], ["avatars", "Avatars", "image", 1]] },
  { id: "money", label: "Money", icon: "wallet", items: [["billing", "Billing", "wallet", 1], ["affiliates", "Affiliates", "handshake", 1]] },
  { id: "plat", label: "Platform", icon: "settings-2", items: [["announcements", "Announcements", "megaphone", 1], ["audit", "Audit log", "scroll-text", 1]] },
];
const closePop = () => { const p = $("navPop"); if (p) p.classList.add("hidden"); };
function buildNav() {
  const nav = $("nav"), sp = nav.querySelector(".sp");
  GROUPS.forEach((g) => {
    const items = g.items.filter((i) => !i[3] || isAdmin); if (!items.length) return;
    const b = document.createElement("button"); b.className = "grp"; b.dataset.g = g.id;
    b.innerHTML = `<i data-lucide="${g.icon}" class="icon"></i><span>${g.label}</span><i data-lucide="chevron-right" class="icon chev"></i>`;
    b.onclick = (e) => { e.stopPropagation(); togglePop(b, items); };
    nav.insertBefore(b, sp);
  });
  document.addEventListener("click", closePop); window.addEventListener("resize", closePop); nav.addEventListener("scroll", closePop);
  icons();
}
function togglePop(btn, items) {
  const pop = $("navPop"); if (!pop.classList.contains("hidden") && pop.dataset.for === btn.dataset.g) return closePop();
  const cur = location.hash.slice(1) || "overview"; pop.dataset.for = btn.dataset.g;
  pop.innerHTML = items.map((i) => `<a href="#${i[0]}" class="${cur === i[0] ? "on" : ""}"><i data-lucide="${i[2]}" class="icon"></i>${i[1]}</a>`).join("");
  pop.classList.remove("hidden"); icons();
  const r = btn.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
  if (innerWidth <= 860) { pop.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + "px"; pop.style.top = Math.max(8, r.top - h - 8) + "px"; }
  else { pop.style.left = r.right + 8 + "px"; pop.style.top = Math.max(8, Math.min(r.top, innerHeight - h - 8)) + "px"; }
  pop.onclick = closePop;
}

/* ---------- Programs ---------- */
async function programsView() {
  const [pg, su] = await Promise.all([sb.from("programs").select("*").order("created_at", { ascending: false }), sb.from("program_signups").select("*").order("created_at", { ascending: false }).limit(2000)]);
  if (pg.error) throw pg.error;
  const C = {}; (su.data || []).forEach((x) => (C[x.program_id] = (C[x.program_id] || 0) + 1));
  $("view").innerHTML = head("", "", `<button class="btn btn-green" id="np"><i data-lucide="plus" class="icon"></i> New program</button>`) +
    `<div class="rows">${(pg.data || []).map((p) => `<div class="r"><div class="grow"><h3>${esc(p.title)}</h3><p>${esc(p.kind)} · ${esc(p.summary)}</p></div>${badge(p.status)}<div class="acts"><button class="ib" data-s="${esc(p.id)}"><i data-lucide="users" class="icon"></i><span>Signups (${C[p.id] || 0})</span></button><button class="ib" data-e="${esc(p.id)}"><i data-lucide="pencil" class="icon"></i><span>Edit</span></button><button class="ib d" data-d="${esc(p.id)}"><i data-lucide="trash-2" class="icon"></i><span>Delete</span></button></div></div>`).join("") || empty("No programs yet.")}</div>`;
  $("np").onclick = () => programForm();
  $("view").onclick = async (e) => {
    const b = e.target.closest("button[data-e],button[data-d],button[data-s]"); if (!b) return; const p = pg.data.find((x) => x.id === (b.dataset.e || b.dataset.d || b.dataset.s));
    if (b.dataset.e) return programForm(p);
    if (b.dataset.d) { if (await confirmBox("Delete program?", `"${p.title}" and its signups will be removed.`, "Delete")) { const { error } = await sb.from("programs").delete().eq("id", p.id); if (error) return toast(error.message); await log("program.delete", "program", p.id, { title: p.title }); route(); } return; }
    const list = (su.data || []).filter((x) => x.program_id === p.id), ids = list.map((x) => x.user_id), pr = ids.length ? (await sb.from("profiles").select("id,email,full_name,phone").in("id", ids)).data || [] : [], P = Object.fromEntries(pr.map((x) => [x.id, x]));
    openModal(`<button class="close-btn" id="x"><i data-lucide="x" class="icon"></i></button><h2>${esc(p.title)}</h2><p class="sub">${list.length} signup(s)</p><div class="rows">${list.map((x) => `<div class="r"><div class="grow"><h3>${esc(P[x.user_id]?.full_name || P[x.user_id]?.email || "Unknown")}</h3><p>${esc(P[x.user_id]?.email || "")}${P[x.user_id]?.phone ? " · " + esc(P[x.user_id].phone) : ""}${x.message ? " · " + esc(x.message) : ""}</p></div><select class="sel" data-sg="${esc(x.id)}">${["new", "contacted", "accepted", "declined"].map((s) => `<option ${x.status === s ? "selected" : ""}>${s}</option>`).join("")}</select></div>`).join("") || empty("No signups yet.")}</div>`);
    $("x").onclick = closeModal;
    $("modalBody").onchange = async (ev) => { const s = ev.target.closest("[data-sg]"); if (!s) return; const { error } = await sb.from("program_signups").update({ status: s.value }).eq("id", s.dataset.sg); toast(error ? error.message : "Saved."); };
  };
}
function programForm(p = {}) {
  openModal(`<button class="close-btn" id="x"><i data-lucide="x" class="icon"></i></button><h2>${p.id ? "Edit program" : "New program"}</h2><p class="sub">Shown to students on the Programs page.</p><div id="fm" class="message hidden"></div>
  <form id="pf"><div class="form-group"><label>Title</label><input name="title" required maxlength="120" value="${esc(p.title)}"></div>
  <div class="two"><div class="form-group"><label>Type</label><select name="kind">${["affiliate", "ambassador", "other"].map((k) => `<option ${p.kind === k ? "selected" : ""}>${k}</option>`).join("")}</select></div><div class="form-group"><label>Status</label><select name="status">${["published", "draft", "closed"].map((k) => `<option ${(p.status || "published") === k ? "selected" : ""}>${k}</option>`).join("")}</select></div></div>
  <div class="form-group"><label>Short summary</label><input name="summary" required maxlength="200" value="${esc(p.summary)}"></div>
  <div class="form-group"><label>Reward (optional)</label><input name="reward" maxlength="80" placeholder="e.g. 20% commission" value="${esc(p.reward)}"></div>
  <div class="form-group"><label>Details</label><textarea name="description" rows="5">${esc(p.description)}</textarea></div>
  <button class="btn btn-submit" id="sv">${p.id ? "Save changes" : "Publish program"}</button></form>`);
  $("x").onclick = closeModal;
  $("pf").onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target), row = { title: f.get("title").trim(), kind: f.get("kind"), status: f.get("status"), summary: f.get("summary").trim(), reward: f.get("reward").trim() || null, description: f.get("description").trim() || null };
    $("sv").disabled = true; const { data, error } = await (p.id ? sb.from("programs").update(row).eq("id", p.id).select("id").single() : sb.from("programs").insert([row]).select("id").single()); $("sv").disabled = false;
    if (error) { const m = $("fm"); m.className = "message error"; m.textContent = error.message; return; }
    await log(p.id ? "program.update" : "program.create", "program", data.id, { title: row.title }); closeModal(); toast("Saved."); route();
  };
}

/* ---------- Employers ---------- */
async function employersView() {
  const [ep, ls] = await Promise.all([sb.from("employer_profiles").select("*").order("created_at", { ascending: false }), sb.from("opportunities").select("employer_id,status").not("employer_id", "is", null)]);
  if (ep.error) throw ep.error;
  const ids = (ep.data || []).map((e) => e.user_id), pr = ids.length ? (await sb.from("profiles").select("id,email").in("id", ids)).data || [] : [], P = Object.fromEntries(pr.map((x) => [x.id, x.email]));
  const C = {}; (ls.data || []).forEach((l) => { const c = (C[l.employer_id] ||= { live: 0, pending: 0 }); if (l.status === "published") c.live++; if (l.status === "pending") c.pending++; });
  const waiting = Object.values(C).reduce((n, c) => n + c.pending, 0);
  $("view").innerHTML = (waiting ? `<div class="toolbar" style="align-items:center"><b>${waiting} listing(s) awaiting approval</b><a class="btn btn-primary" href="#opportunities">Review listings</a></div>` : "") +
    `<div class="rows">${(ep.data || []).map((e) => { const c = C[e.user_id] || { live: 0, pending: 0 };
      return `<div class="r"><div class="grow"><h3>${esc(e.org_name)}</h3><p>${esc(P[e.user_id] || "")}${e.contact_name ? " · " + esc(e.contact_name) : ""}${e.phone ? " · " + esc(e.phone) : ""}${e.website ? " · " + esc(e.website) : ""}</p><p>${esc(e.about || "")}</p><p>${c.live} live · ${c.pending} awaiting approval</p></div><span class="badge b-${esc(e.status)}">${esc(e.status)}</span>
      <div class="acts">${e.status !== "approved" ? `<button class="ib" data-ok="${esc(e.user_id)}"><i data-lucide="check" class="icon"></i><span>Approve</span></button>` : ""}${e.status !== "rejected" ? `<button class="ib d" data-no="${esc(e.user_id)}"><i data-lucide="x" class="icon"></i><span>${e.status === "approved" ? "Revoke" : "Reject"}</span></button>` : ""}</div></div>`; }).join("") || empty("No employer applications yet.")}</div>`;
  icons();
  $("view").onclick = async (e) => {
    const b = e.target.closest("button[data-ok],button[data-no]"); if (!b) return; const id = b.dataset.ok || b.dataset.no, em = (ep.data || []).find((x) => x.user_id === id);
    if (b.dataset.ok) { if (!(await confirmBox("Approve " + em.org_name + "?", "They will be able to post listings. Each listing still needs your approval.", "Approve"))) return; const { error } = await sb.rpc("admin_review_employer", { p_user: id, p_approve: true, p_note: null }); if (error) return toast(error.message); toast("Approved."); return route(); }
    openModal(`<button class="close-btn" id="x"><i data-lucide="x" class="icon"></i></button><h2>${em.status === "approved" ? "Revoke" : "Reject"} ${esc(em.org_name)}</h2><p class="sub">${em.status === "approved" ? "Their live and pending listings will be closed. " : ""}The note below is shown to them.</p><div class="form-group"><label>Note (optional)</label><textarea id="nt" rows="3" maxlength="300"></textarea></div><button class="btn btn-danger" id="go" style="width:100%">${em.status === "approved" ? "Revoke" : "Reject"}</button>`);
    $("x").onclick = closeModal; $("go").onclick = async () => { const { error } = await sb.rpc("admin_review_employer", { p_user: id, p_approve: false, p_note: $("nt").value.trim() || null }); if (error) return toast(error.message); closeModal(); toast("Done."); route(); };
  };
}

/* ---------- Messages (history of what was sent about each opportunity) ---------- */
async function messagesView() {
  const [m, rc, ls, ops] = await Promise.all([
    sb.from("opportunity_messages").select("*").order("created_at", { ascending: false }).limit(500),
    sb.from("message_recipients").select("message_id,read_at").limit(50000),
    sb.rpc("admin_listing_stats"),
    sb.from("opportunities").select("id,title,company").order("title"),
  ]);
  if (m.error) throw m.error;
  const R = {}; (rc.data || []).forEach((x) => { const r = (R[x.message_id] ||= { read: 0 }); if (x.read_at) r.read++; });
  const withApplicants = new Set((ls.data || []).filter((x) => Number(x.applicants) > 0).map((x) => x.opportunity_id));
  const opts = [...new Map((m.data || []).filter((x) => x.opportunity_id).map((x) => [x.opportunity_id, x.opp_title])).entries()];
  $("view").innerHTML = head("", "", `<button class="btn btn-green" id="nm"><i data-lucide="plus" class="icon"></i> New message</button>`) +
    `<div class="toolbar"><select id="mf"><option value="">All listings</option>${opts.map(([id, t]) => `<option value="${esc(id)}">${esc(t)}</option>`).join("")}</select></div><div class="rows" id="mRows"></div>`;
  const draw = () => {
    const f = $("mf").value, l = (m.data || []).filter((x) => !f || x.opportunity_id === f);
    $("mRows").innerHTML = l.map((x) => `<div class="r" data-m="${esc(x.id)}" style="cursor:pointer"><div class="grow"><h3>${esc(x.title)}</h3><p>${esc(x.opp_title)}${x.opp_company ? " · " + esc(x.opp_company) : ""} · from ${esc(x.sender_name)} · ${dt(x.created_at)}</p><p>${x.recipient_count} recipient(s) · ${(R[x.id] || { read: 0 }).read} read</p></div><span class="ib"><i data-lucide="eye" class="icon"></i><span>View</span></span></div>`).join("") || empty("No messages sent yet.");
    icons();
  };
  $("mf").onchange = draw; draw();
  $("mRows").onclick = (e) => {
    const r = e.target.closest("[data-m]"); if (!r) return; const x = m.data.find((y) => y.id === r.dataset.m);
    openModal(`<button class="close-btn" id="x"><i data-lucide="x" class="icon"></i></button><h2>${esc(x.title)}</h2><p class="sub">${esc(x.opp_title)} · from ${esc(x.sender_name)} (${esc(x.sender_role)}) · ${dt(x.created_at)}</p><p style="white-space:pre-wrap;color:var(--ink-2);margin-bottom:1rem">${esc(x.body || "(no message text)")}</p><p class="sub" style="margin:0">${x.recipient_count} recipient(s), ${(R[x.id] || { read: 0 }).read} have read it.</p>`);
    $("x").onclick = closeModal;
  };
  $("nm").onclick = () => {
    const choices = (ops.data || []).filter((o) => withApplicants.has(o.id));
    if (!choices.length) return toast("No listing has applicants yet.");
    openModal(`<button class="close-btn" id="x"><i data-lucide="x" class="icon"></i></button><h2>New message</h2><p class="sub">Sent to everyone who applied to the listing.</p><div id="fm" class="message hidden"></div>
      <div class="form-group"><label>Listing</label><select id="nl">${choices.map((o) => `<option value="${esc(o.id)}">${esc(o.title)}${o.company ? " · " + esc(o.company) : ""}</option>`).join("")}</select></div>
      <div class="form-group"><label>Title</label><input id="nt" maxlength="120"></div><div class="form-group"><label>Message</label><textarea id="nb" rows="4" maxlength="500"></textarea></div><button class="btn btn-submit" id="go">Send</button>`);
    $("x").onclick = closeModal;
    $("go").onclick = async () => { const t = $("nt").value.trim(), bad = (s) => { const f = $("fm"); f.className = "message error"; f.textContent = s; }; if (!t) return bad("Add a title."); const r = await sb.rpc("send_opportunity_message", { p_opp: $("nl").value, p_title: t, p_body: $("nb").value.trim() || null }); if (r.error) return bad(r.error.message); closeModal(); toast("Sent to " + r.data + " applicant(s)."); route(); };
  };
}
