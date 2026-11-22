const GATEWAY_URL = "https://nia-gateway.davidkasimilu71.workers.dev";
const EDGE_KEY = "cf-worker-edge-managed";
const sb = window.supabase ? window.supabase.createClient(GATEWAY_URL, EDGE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icons = () => window.__icons && window.__icons();
const dt = (d) => new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
const SL = { pending: "Awaiting approval", published: "Live", closed: "Closed", draft: "Draft" }, ST = ["reviewing", "shortlisted", "contacted", "rejected"];
const badge = (s, l) => `<span class="badge b-${esc(s)}">${esc(l || s)}</span>`;
let user, profile = {}, ep = null, listings = [], fields = [], tab = "listings";

function toast(t) { const d = document.createElement("div"); d.className = "toast"; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 3200); }
function openModal(h) { $("modalBody").innerHTML = h; $("modal").classList.remove("hidden"); icons(); }
function closeModal() { $("modal").classList.add("hidden"); }
function confirmBox(title, msg, ok) { return new Promise((res) => { openModal(`<h2>${esc(title)}</h2><p class="sub">${esc(msg)}</p><button class="btn btn-danger" id="cY" style="width:100%">${esc(ok)}</button><button class="btn btn-ghost" id="cN">Cancel</button>`); $("cY").onclick = () => { closeModal(); res(true); }; $("cN").onclick = () => { closeModal(); res(false); }; }); }
const fail = (id, t) => { const m = $(id); m.className = "message error"; m.textContent = t; };
const resumePath = (v) => (v && /^https?:/.test(v) ? (v.includes("/object/public/resumes/") ? decodeURIComponent(v.split("/object/public/resumes/")[1].split("?")[0]) : null) : v || null);
const logoPath = (u) => (u && u.includes("/object/public/listing-logos/") ? decodeURIComponent(u.split("/object/public/listing-logos/")[1].split("?")[0]) : null);

document.addEventListener("DOMContentLoaded", async () => {
  if (!sb) return;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return (location.href = "index.html");
  user = session.user;
  const { data: p } = await sb.from("profiles").select("role,status,full_name").eq("id", user.id).maybeSingle();
  if (p?.status === "banned") { await sb.auth.signOut(); return (location.href = "index.html"); }
  if (["admin", "moderator"].includes(p?.role)) return (location.href = "admin.html");
  profile = p || {};
  $("logoutBtn").onclick = async () => { await sb.auth.signOut(); location.href = "index.html"; };
  $("modal").onclick = (e) => { if (e.target === $("modal")) closeModal(); };
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });
  const [r, f] = await Promise.all([sb.from("employer_profiles").select("*").eq("user_id", user.id).maybeSingle(), sb.from("application_fields").select("*").eq("active", true).order("sort_order")]);
  ep = r.data; fields = f.data || []; render();
});

function info(icon, title, text, extra = "") { $("view").innerHTML = `<div class="emp-card"><div class="emp-ic"><i data-lucide="${icon}" class="icon"></i></div><h2>${esc(title)}</h2><p class="sub">${text}</p>${extra}</div>`; icons(); }
function render() {
  if (ep) $("orgName").textContent = ep.org_name;
  if (!ep || ep.status === "rejected") return applyView();
  if (ep.status === "pending") return info("clock", "Application received", "We are reviewing your organisation. You will get a notification here once it is approved.");
  if (profile.role !== "employer") return info("clock", "Almost there", "Your account is being set up. Please refresh in a moment.");
  dashboard();
}

function applyView() {
  const rej = ep && ep.status === "rejected";
  info("building-2", "Become an employer on Nia", `Tell us about your organisation. We review every employer before they can post.${rej ? `<br><br><b>Your last application was not approved.</b> ${esc(ep.admin_note || "")} You can update the details and apply again.` : ""}`,
    `<div id="am" class="message hidden"></div><form id="af">
      <div class="form-group"><label>Organisation name</label><input name="org_name" required maxlength="120" value="${esc(ep?.org_name)}"></div>
      <div class="two"><div class="form-group"><label>Contact person</label><input name="contact_name" maxlength="100" value="${esc(ep?.contact_name || profile.full_name)}"></div><div class="form-group"><label>Phone</label><input name="phone" type="tel" maxlength="30" value="${esc(ep?.phone)}"></div></div>
      <div class="form-group"><label>Website (optional)</label><input name="website" maxlength="200" placeholder="https://" value="${esc(ep?.website)}"></div>
      <div class="form-group"><label>About your organisation</label><textarea name="about" rows="4" maxlength="800" placeholder="What you do and what kind of roles you hire for" style="width:100%;padding:.75rem .9rem;border:1px solid var(--line);border-radius:10px;font:inherit">${esc(ep?.about)}</textarea></div>
      <button class="btn btn-submit" id="as">Submit for approval</button></form>`);
  $("af").onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target), v = (k) => String(f.get(k) || "").trim() || null; $("as").disabled = true;
    const { error } = await sb.from("employer_profiles").upsert({ user_id: user.id, org_name: v("org_name"), contact_name: v("contact_name"), phone: v("phone"), website: v("website"), about: v("about"), status: "pending" }, { onConflict: "user_id" });
    $("as").disabled = false; if (error) return fail("am", error.message);
    const r = await sb.from("employer_profiles").select("*").eq("user_id", user.id).maybeSingle(); ep = r.data; render();
  };
}

function dashboard() {
  $("view").innerHTML = `<div class="seg"><button data-v="listings">Listings</button><button data-v="applicants">Applicants</button></div><div id="pane"></div>`;
  document.querySelectorAll(".seg button").forEach((b) => (b.onclick = () => { tab = b.dataset.v; show(); }));
  show();
}
function show() { document.querySelectorAll(".seg button").forEach((b) => b.classList.toggle("on", b.dataset.v === tab)); tab === "listings" ? showListings() : showApplicants(); }

async function loadListings() { const { data } = await sb.from("opportunities").select("*").eq("employer_id", user.id).order("created_at", { ascending: false }); listings = data || []; }

async function showListings() {
  const [, a] = await Promise.all([loadListings(), sb.from("applications").select("opportunity_id,status")]);
  const C = {}; (a.data || []).filter((x) => x.status !== "withdrawn").forEach((x) => (C[x.opportunity_id] = (C[x.opportunity_id] || 0) + 1));
  $("pane").innerHTML = `<div class="bar" style="justify-content:flex-end"><button class="btn btn-green" id="np"><i data-lucide="plus" class="icon"></i> Post a listing</button></div>
    <div class="rows">${listings.map((o) => `<div class="r"><div class="grow"><h3>${esc(o.title)}</h3><p>${esc(o.location)} · ${esc(o.type)}${o.deadline ? " · closes " + dt(o.deadline) : ""} · ${C[o.id] || 0} applicant(s)</p></div>${badge(o.status === "published" ? "live" : o.status === "pending" ? "open" : o.status, SL[o.status])}
      <div class="acts"><button class="ib" data-e="${esc(o.id)}"><i data-lucide="pencil" class="icon"></i><span>Edit</span></button>${o.status !== "closed" ? `<button class="ib" data-c="${esc(o.id)}"><i data-lucide="lock" class="icon"></i><span>Close</span></button>` : ""}<button class="ib d" data-d="${esc(o.id)}"><i data-lucide="trash-2" class="icon"></i><span>Delete</span></button></div></div>`).join("") || `<div class="empty">No listings yet. Post your first one. It goes live after a quick review.</div>`}</div>`;
  icons(); $("np").onclick = () => listingForm();
  $("pane").onclick = async (e) => {
    const b = e.target.closest("button[data-e],button[data-c],button[data-d]"); if (!b) return; const o = listings.find((x) => x.id === (b.dataset.e || b.dataset.c || b.dataset.d));
    if (b.dataset.e) return listingForm(o);
    if (b.dataset.c) { const { error } = await sb.from("opportunities").update({ status: "closed" }).eq("id", o.id); if (error) return toast(error.message); toast("Listing closed."); return showListings(); }
    if (await confirmBox("Delete listing?", `"${o.title}" and its applications will be removed.`, "Delete")) { const p = logoPath(o.logo_url); const { error } = await sb.from("opportunities").delete().eq("id", o.id); if (error) return toast(error.message); if (p) sb.storage.from("listing-logos").remove([p]); toast("Deleted."); showListings(); }
  };
}

function listingForm(o = {}) {
  const req = new Set(o.required_fields || []);
  openModal(`<button class="close-btn" id="x"><i data-lucide="x" class="icon"></i></button><h2>${o.id ? "Edit listing" : "Post a listing"}</h2><p class="sub">${o.id && o.status === "published" ? "Changing a live listing sends it for approval again." : "New listings go live after a quick review."}</p><div id="fm" class="message hidden"></div>
  <form id="lf"><div class="form-group"><label>Title</label><input name="title" required maxlength="120" value="${esc(o.title)}"></div>
  <div class="two"><div class="form-group"><label>Company shown to students</label><input name="company" required value="${esc(o.company || ep.org_name)}"></div><div class="form-group"><label>Location</label><input name="location" required value="${esc(o.location)}"></div></div>
  <div class="two"><div class="form-group"><label>Type</label><select name="type">${["Job", "Internship", "Attachment"].map((t) => `<option ${o.type === t ? "selected" : ""}>${t}</option>`).join("")}</select></div><div class="form-group"><label>Application deadline (optional)</label><input type="date" name="deadline" value="${o.deadline ? new Date(o.deadline).toLocaleDateString("en-CA") : ""}"></div></div>
  <div class="form-group"><label>Logo (optional)</label>${o.logo_url ? `<div style="display:flex;align-items:center;gap:.7rem;margin-bottom:.4rem"><img src="${esc(o.logo_url)}" alt="" style="width:44px;height:44px;object-fit:contain;border:1px solid var(--line);border-radius:10px"><label style="font-weight:500;font-size:.88rem"><input type="checkbox" name="rmlogo"> Remove logo</label></div>` : ""}<input type="file" name="logo" accept="image/png,image/jpeg,image/webp"><small style="color:var(--mute)">PNG, JPG or WebP, up to 1 MB.</small></div>
  <div class="form-group"><label>Description</label><textarea name="description" rows="5" required style="width:100%;padding:.75rem .9rem;border:1px solid var(--line);border-radius:10px;font:inherit">${esc(o.description)}</textarea></div>
  <div class="form-group"><label>Details to collect from applicants</label><div class="checks2">${fields.map((f) => `<label><input type="checkbox" name="rf" value="${esc(f.key)}" ${req.has(f.key) ? "checked" : ""}> ${esc(f.label)}</label>`).join("")}</div></div>
  <p class="sub" style="font-size:.82rem">Never ask applicants to pay anything. Listings that ask for money are removed.</p>
  <button class="btn btn-submit" id="sv">${o.id ? "Save changes" : "Submit for review"}</button></form>`);
  $("x").onclick = closeModal;
  $("lf").onsubmit = async (e) => {
    e.preventDefault(); const f = new FormData(e.target), dl = f.get("deadline"), file = f.get("logo"); $("sv").disabled = true;
    const bad = (t) => { fail("fm", t); $("sv").disabled = false; };
    const row = { title: f.get("title").trim(), company: f.get("company").trim(), location: f.get("location").trim(), type: f.get("type"), description: f.get("description").trim(), deadline: dl ? new Date(dl + "T23:59:59+03:00").toISOString() : null, required_fields: f.getAll("rf") };
    if (file && file.size) {
      const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[file.type]; if (!ext) return bad("Logo must be a PNG, JPG or WebP image."); if (file.size > 1048576) return bad("Logo must be 1 MB or smaller.");
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`, up = await sb.storage.from("listing-logos").upload(path, file, { contentType: file.type }); if (up.error) return bad("Logo upload failed: " + up.error.message);
      row.logo_url = sb.storage.from("listing-logos").getPublicUrl(path).data.publicUrl;
    } else if (f.get("rmlogo")) row.logo_url = null;
    const { error } = await (o.id ? sb.from("opportunities").update(row).eq("id", o.id) : sb.from("opportunities").insert([{ ...row, status: "pending" }]));
    if (error) return bad(error.message);
    const old = logoPath(o.logo_url); if (o.id && old && (row.logo_url === null || (row.logo_url && row.logo_url !== o.logo_url))) sb.storage.from("listing-logos").remove([old]);
    closeModal(); toast(o.id ? "Saved." : "Submitted. It goes live after review."); showListings();
  };
}

async function showApplicants(sel) {
  await loadListings();
  if (!listings.length) { $("pane").innerHTML = `<div class="empty">Post a listing to start receiving applicants.</div>`; return; }
  const id = sel || listings[0].id;
  const { data: apps } = await sb.from("applications").select("*").eq("opportunity_id", id).neq("status", "withdrawn").order("created_at", { ascending: false });
  const ids = [...new Set((apps || []).map((a) => a.user_id))], pr = ids.length ? (await sb.from("profiles").select("id,full_name,phone,whatsapp,county,institution,course,resume_url").in("id", ids)).data || [] : [], P = Object.fromEntries(pr.map((x) => [x.id, x]));
  $("pane").innerHTML = `<div class="toolbar"><select id="lsel">${listings.map((o) => `<option value="${esc(o.id)}" ${o.id === id ? "selected" : ""}>${esc(o.title)}</option>`).join("")}</select></div>
    <div class="rows">${(apps || []).map((a) => `<div class="r" data-a="${esc(a.id)}" style="cursor:pointer"><div class="grow"><h3>${esc(P[a.user_id]?.full_name || a.user_email)}</h3><p>${esc(a.user_email)} · applied ${dt(a.created_at)}</p></div>${badge(a.status)}<span class="ib"><i data-lucide="eye" class="icon"></i><span>View</span></span></div>`).join("") || `<div class="empty">No applicants yet for this listing.</div>`}</div>`;
  icons(); $("lsel").onchange = () => showApplicants($("lsel").value);
  $("pane").onclick = (e) => { const r = e.target.closest("[data-a]"); if (r) detail(apps.find((a) => a.id === r.dataset.a), P[apps.find((a) => a.id === r.dataset.a).user_id] || {}, id); };
}

function detail(a, p, lid) {
  const label = (k) => fields.find((f) => f.key === k)?.label || k, cv = a.resume_url || p.resume_url;
  const rows = [["Email", a.user_email], ["Phone", p.phone], ["WhatsApp", p.whatsapp], ["County", p.county], ["Institution", p.institution], ["Course", p.course]].filter((r) => r[1]);
  openModal(`<button class="close-btn" id="x"><i data-lucide="x" class="icon"></i></button><h2>${esc(p.full_name || a.user_email)}</h2><p class="sub">Applied ${dt(a.created_at)}</p>
  <dl class="dl">${rows.map((r) => `<dt>${r[0]}</dt><dd>${esc(r[1])}</dd>`).join("")}${Object.entries(a.answers || {}).map(([k, v]) => `<dt>${esc(label(k))}</dt><dd>${esc(v)}</dd>`).join("")}</dl>
  ${cv ? `<button class="btn btn-ghost btn-sm" id="cv"><i data-lucide="file-text" class="icon"></i> Open CV</button>` : ""}
  <div class="form-group" style="margin-top:1rem"><label>Status</label><select id="st">${(ST.includes(a.status) ? ST : ["new", ...ST]).map((s) => `<option ${a.status === s ? "selected" : ""}>${s}</option>`).join("")}</select><small style="color:var(--mute)">The applicant is emailed when you shortlist, contact or reject.</small></div>
  <button class="btn btn-submit" id="sv">Save status</button>`);
  $("x").onclick = closeModal;
  if (cv) $("cv").onclick = async () => { const w = window.open("", "_blank"), { data, error } = await sb.storage.from("resumes").createSignedUrl(resumePath(cv), 300); if (error) { w && w.close(); return toast("Could not open the CV."); } w.location = data.signedUrl; };
  $("sv").onclick = async () => { const s = $("st").value; if (s === "new") return closeModal(); const { error } = await sb.rpc("employer_set_application_status", { p_id: a.id, p_status: s }); if (error) return toast(error.message); closeModal(); toast("Status updated."); showApplicants(lid); };
}
