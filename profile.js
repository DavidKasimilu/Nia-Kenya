const GATEWAY_URL = "https://nia-gateway.davidkasimilu71.workers.dev";
const EDGE_KEY = "cf-worker-edge-managed";
const sb = window.supabase ? window.supabase.createClient(GATEWAY_URL, EDGE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icons = () => window.__icons && window.__icons();
const STATUS = { new: "Submitted", reviewing: "In review", shortlisted: "Shortlisted", contacted: "Contacted", rejected: "Not selected", withdrawn: "Withdrawn" };
let user, profile = {};

function say(text, err) { const m = $("statusMessage"); m.textContent = text; m.className = "message " + (err ? "error" : "info"); window.scrollTo({ top: 0, behavior: "smooth" }); }
function initial() { return (profile.full_name || user.email || "?").trim()[0].toUpperCase(); }
function paintAvatars() {
  const img = profile.avatar_url ? `<img src="${esc(profile.avatar_url)}" alt="" onerror="this.remove()">` : "";
  $("avatarBtn").innerHTML = img || esc(initial());
  $("bigAvatar").innerHTML = (img || esc(initial())) + `<span><i data-lucide="camera" class="icon"></i></span>`;
  $("displayFullName").textContent = profile.full_name || "Graduate"; $("menuName").textContent = profile.full_name || "Student"; icons();
}
function showTab(t) {
  document.querySelectorAll(".ptab").forEach((b) => b.classList.toggle("active", b.dataset.tab === t));
  ["profile", "applications", "saved", "subscription", "settings"].forEach((x) => $("tab-" + x).classList.toggle("hidden", x !== t));
  if (location.hash.slice(1) !== t) history.replaceState(null, "", "#" + t);
}
const resumePath = (v) => (v && /^https?:/.test(v) ? pathOf(v, "resumes") : v || null);
const pathOf = (url, bucket) => (url && url.includes(`/object/public/${bucket}/`) ? decodeURIComponent(url.split(`/object/public/${bucket}/`)[1].split("?")[0]) : null);

document.addEventListener("DOMContentLoaded", async () => {
  if (!sb) return;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return (location.href = "index.html");
  user = session.user;
  const { data } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (data?.status === "banned") { await sb.auth.signOut(); return (location.href = "index.html"); }
  profile = data || {}; if (["admin", "moderator"].includes(profile.role)) $("adminLink").classList.remove("hidden");
  $("displayEmail").textContent = $("menuEmail").textContent = $("profileEmail").value = user.email || "";
  $("profileFullName").value = profile.full_name || user.user_metadata?.full_name || "";
  [["Phone", "phone"], ["Whatsapp", "whatsapp"], ["County", "county"], ["Institution", "institution"], ["Course", "course"], ["Bio", "bio"]].forEach(([i, k]) => ($("profile" + i).value = profile[k] || ""));
  paintAvatars(); renderCv();

  $("avatarBtn").onclick = (e) => { e.stopPropagation(); $("menu").classList.toggle("hidden"); };
  document.addEventListener("click", (e) => { if (!$("menu").contains(e.target)) $("menu").classList.add("hidden"); });
  const out = async () => { await sb.auth.signOut(); location.href = "index.html"; };
  $("logoutBtn").onclick = out; $("logoutBtn2").onclick = out;
  document.querySelectorAll(".ptab").forEach((b) => (b.onclick = () => showTab(b.dataset.tab)));
  showTab(["applications", "saved", "subscription", "settings"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "profile");
  $("profileForm").onsubmit = saveProfile; $("pwForm").onsubmit = changePw;
  $("profileResume").onchange = uploadCv;
  $("deleteCvBtn").onclick = () => $("confirmModal").classList.remove("hidden");
  $("confirmNo").onclick = () => $("confirmModal").classList.add("hidden");
  $("confirmYes").onclick = removeCv;
  $("bigAvatar").onclick = openAvatars; $("avClose").onclick = () => $("avatarModal").classList.add("hidden");
  $("avFile").onchange = uploadAvatar;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") document.querySelectorAll(".modal-overlay").forEach((m) => m.classList.add("hidden")); });
  loadApplications(); loadSaved(); loadSub();
});

async function saveProfile(e) {
  e.preventDefault(); const b = $("saveProfileBtn"); b.disabled = true; b.textContent = "Saving…";
  const v = (id) => $(id).value.trim();
  const row = { id: user.id, email: user.email, full_name: v("profileFullName"), phone: v("profilePhone"), whatsapp: v("profileWhatsapp"), county: v("profileCounty"), institution: v("profileInstitution"), course: v("profileCourse"), bio: v("profileBio"), updated_at: new Date().toISOString() };
  const { error } = await sb.from("profiles").upsert(row, { onConflict: "id" });
  b.disabled = false; b.textContent = "Save changes";
  if (error) return say("Could not save: " + error.message, true);
  Object.assign(profile, row); paintAvatars(); say("Profile saved.");
}

function renderCv() {
  const u = profile.resume_url;
  $("resumeStatus").innerHTML = u ? `<a href="#" id="viewCv">View current CV</a>` : `<span style="color:var(--mute)">No CV uploaded yet</span>`;
  if (u) $("viewCv").onclick = viewCv;
  $("deleteCvBtn").classList.toggle("hidden", !u); $("uploadLbl").textContent = u ? "Replace" : "Upload";
}
async function uploadCv() {
  const f = $("profileResume").files[0]; if (!f) return;
  if (f.size > 30 * 1024 * 1024) return say("File is larger than 30 MB.", true);
  $("uploadLbl").textContent = "Uploading…";
  const path = `${user.id}/${Date.now()}_${f.name.replace(/[^\w.\-]/g, "_")}`;
  const up = await sb.storage.from("resumes").upload(path, f, { upsert: false });
  if (up.error) { renderCv(); return say("Upload failed: " + up.error.message, true); }
  const url = path, old = resumePath(profile.resume_url);
  const { error } = await sb.from("profiles").update({ resume_url: url, updated_at: new Date().toISOString() }).eq("id", user.id);
  if (error) return say("Could not save CV: " + error.message, true);
  if (old) sb.storage.from("resumes").remove([old]);
  profile.resume_url = url; renderCv(); say("CV uploaded.");
}
async function viewCv(e) {
  e.preventDefault(); const w = window.open("", "_blank"), { data, error } = await sb.storage.from("resumes").createSignedUrl(resumePath(profile.resume_url), 300);
  if (error) { w && w.close(); return say("Could not open CV: " + error.message, true); } w.location = data.signedUrl;
}
async function removeCv() {
  $("confirmModal").classList.add("hidden"); const old = resumePath(profile.resume_url);
  const { error } = await sb.from("profiles").update({ resume_url: null, updated_at: new Date().toISOString() }).eq("id", user.id);
  if (error) return say("Could not remove CV: " + error.message, true);
  if (old) sb.storage.from("resumes").remove([old]);
  profile.resume_url = null; renderCv(); say("CV removed.");
}

async function setAvatar(url) {
  const { error } = await sb.from("profiles").update({ avatar_url: url, updated_at: new Date().toISOString() }).eq("id", user.id);
  if (error) return say("Could not update photo: " + error.message, true);
  profile.avatar_url = url; paintAvatars(); $("avatarModal").classList.add("hidden"); say("Photo updated.");
}
async function openAvatars() {
  $("avatarModal").classList.remove("hidden");
  const { data } = await sb.from("avatars").select("url,label").eq("active", true);
  $("avGrid").innerHTML = (data || []).map((a) => `<button type="button" data-u="${esc(a.url)}" class="${a.url === profile.avatar_url ? "sel" : ""}" aria-label="${esc(a.label || "Avatar")}"><img src="${esc(a.url)}" alt=""></button>`).join("") || `<small style="color:var(--mute)">No default avatars yet.</small>`;
  $("avGrid").onclick = (e) => { const b = e.target.closest("button"); if (b) setAvatar(b.dataset.u); };
}
async function uploadAvatar() {
  const f = $("avFile").files[0]; if (!f) return;
  if (f.size > 2 * 1024 * 1024) return say("Photo is larger than 2 MB.", true);
  const ext = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" }[f.type]; if (!ext) return say("Use a PNG, JPG or WebP image.", true);
  const path = `${user.id}/${Date.now()}.${ext}`, up = await sb.storage.from("avatars").upload(path, f, { contentType: f.type });
  if (up.error) return say("Upload failed: " + up.error.message, true);
  const old = pathOf(profile.avatar_url, "avatars");
  await setAvatar(sb.storage.from("avatars").getPublicUrl(path).data.publicUrl);
  if (old && old.startsWith(user.id + "/")) sb.storage.from("avatars").remove([old]);
}

async function loadApplications() {
  const { data, error } = await sb.from("applications").select("id,status,created_at,opportunities(title,company,location,type,logo_url)").eq("user_id", user.id).order("created_at", { ascending: false });
  const box = $("applicationsList");
  if (error) return (box.innerHTML = `<div class="empty">Could not load applications.</div>`);
  box.innerHTML = (data || []).length ? data.map((a) => { const o = a.opportunities || {}, s = a.status || "new"; return `<div class="app">${coHtml(o)}<div class="grow"><h3>${esc(o.title || "Opportunity removed")}</h3><p>${esc(o.company || "")}${o.location ? " · " + esc(o.location) : ""} · Applied ${new Date(a.created_at).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}</p></div><span class="badge st-${esc(s)}">${esc(STATUS[s] || s)}</span>${["new", "reviewing"].includes(s) ? `<button class="btn btn-ghost btn-sm" data-w="${esc(a.id)}">Withdraw</button>` : ""}</div>`; }).join("") : `<div class="empty">You haven't applied to anything yet.<br><a href="dashboard.html" style="text-decoration:underline;font-weight:600">Browse opportunities</a></div>`;
}

async function changePw(e) {
  e.preventDefault(); const a = $("newPw").value;
  if (a !== $("newPw2").value) return say("Passwords do not match.", true);
  $("pwBtn").disabled = true; const { error } = await sb.auth.updateUser({ password: a }); $("pwBtn").disabled = false;
  if (error) return say(error.message, true);
  $("pwForm").reset(); say("Password updated.");
}

/* ---------- Data download and account deletion ---------- */
document.addEventListener("DOMContentLoaded", () => {
  $("exportBtn").onclick = async () => {
    const { data, error } = await sb.rpc("export_my_data"); if (error) return say(error.message, true);
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    Object.assign(document.createElement("a"), { href: url, download: "my-nia-data.json" }).click(); URL.revokeObjectURL(url); say("Your data was downloaded.");
  };
  $("deleteAcctBtn").onclick = () => {
    if (["admin", "moderator"].includes(profile.role)) return say("Staff accounts cannot be deleted here. Ask another admin to remove the account.", true);
    $("delConfirm").value = ""; $("delGo").disabled = true; $("delMsg").classList.add("hidden"); $("deleteModal").classList.remove("hidden");
  };
  $("delNo").onclick = () => $("deleteModal").classList.add("hidden");
  $("delConfirm").oninput = () => ($("delGo").disabled = $("delConfirm").value.trim() !== "DELETE");
  $("delGo").onclick = async () => {
    const b = $("delGo"); b.disabled = true; b.textContent = "Deleting…";
    for (const bucket of ["resumes", "avatars"]) { const { data } = await sb.storage.from(bucket).list(user.id); if (data?.length) await sb.storage.from(bucket).remove(data.map((f) => `${user.id}/${f.name}`)); }
    const { error } = await sb.rpc("delete_my_account");
    if (error) { const m = $("delMsg"); m.className = "message error"; m.textContent = error.message; b.disabled = false; b.textContent = "Delete permanently"; return; }
    try { await sb.auth.signOut(); } catch (e) {}
    location.href = "index.html";
  };
});

/* ---------- Saved listings and withdrawing ---------- */
async function loadSaved() {
  const box = $("savedList");
  const { data, error } = await sb.from("saved_listings").select("created_at,opportunities(id,title,company,location,deadline,type,logo_url)").eq("user_id", user.id).order("created_at", { ascending: false });
  if (error) return (box.innerHTML = `<div class="empty">Could not load saved listings.</div>`);
  const rows = (data || []).filter((x) => x.opportunities);
  box.innerHTML = rows.length ? rows.map((s) => { const o = s.opportunities; return `<div class="app">${coHtml(o)}<div class="grow"><h3>${esc(o.title)}</h3><p>${esc(o.company)} · ${esc(o.location)}${o.deadline ? " · closes " + new Date(o.deadline).toLocaleDateString("en-KE", { day: "numeric", month: "short" }) : ""}</p></div><button class="btn btn-ghost btn-sm" data-u="${esc(o.id)}">Remove</button></div>`; }).join("")  : `<div class="empty">Nothing saved yet.<br><a href="dashboard.html" style="text-decoration:underline;font-weight:600">Browse opportunities</a></div>`;
}
let wdId = null;
document.addEventListener("DOMContentLoaded", () => {
  $("savedList").onclick = async (e) => {
    const b = e.target.closest("[data-u]"); if (!b) return;
    const { error } = await sb.from("saved_listings").delete().match({ user_id: user.id, opportunity_id: b.dataset.u });
    if (error) return say(error.message, true); loadSaved();
  };
  $("applicationsList").onclick = (e) => { const b = e.target.closest("[data-w]"); if (b) { wdId = b.dataset.w; $("wdModal").classList.remove("hidden"); } };
  $("wdNo").onclick = () => $("wdModal").classList.add("hidden");
  $("wdYes").onclick = async () => {
    $("wdModal").classList.add("hidden"); const { error } = await sb.rpc("withdraw_application", { p_id: wdId });
    if (error) return say(error.message, true); say("Application withdrawn."); loadApplications();
  };
});

/* ---------- Subscription ---------- */
let subPlan = null;
async function loadSub() {
  const box = $("subBox");
  const [pl, su, py, rq] = await Promise.all([
    sb.from("plans").select("*").eq("code", "monthly").maybeSingle(),
    sb.from("subscriptions").select("paid_until").eq("user_id", user.id).maybeSingle(),
    sb.from("payments").select("created_at,amount_kes,source,days_added").eq("user_id", user.id).order("created_at", { ascending: false }).limit(20),
    sb.from("app_settings").select("value").eq("key", "subscriptions_required").maybeSingle(),
  ]);
  subPlan = pl.data; const end = su.data ? new Date(su.data.paid_until) : null, active = !!end && end > new Date(), staff = ["admin", "moderator"].includes(profile.role), price = subPlan?.amount_kes ?? 250;
  const fmt = (d) => new Date(d).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" });
  box.innerHTML = `<div class="pcard"><h2>Membership</h2>
    ${staff ? `<p style="color:var(--ink-2)">Staff accounts do not need a membership.</p>` : `
    <p style="margin-bottom:.4rem">${active ? `<span class="badge">Active</span> until <b>${fmt(end)}</b>` : `<span class="badge gray">Not subscribed</span>`}</p>
    <p style="color:var(--ink-2);font-size:.92rem;margin-bottom:1rem">${rq.data?.value === true ? "A membership lets you apply to opportunities." : "Applications are free for now. Membership will be required soon."} It costs <b>KES ${price}</b> for 30 days, paid by M-Pesa or card through Paystack. We never charge you automatically, and we email you before it ends.</p>
    <div id="subMsg" class="message hidden"></div>
    <button class="btn btn-green" id="subGo">${active ? "Add 30 more days" : "Subscribe for KES " + price}</button>
    ${NiaPay.lastRef() ? `<button class="btn btn-ghost" id="subCheck" style="margin-left:.5rem">Check my last payment</button>` : ""}`}
  </div>
  <div class="pcard"><h2>Payment history</h2>${(py.data || []).length ? py.data.map((p) => `<div class="app" style="padding:.7rem 1rem"><div class="grow"><h3>${p.source === "admin_grant" ? "Free membership" : "KES " + Number(p.amount_kes)}</h3><p>${fmt(p.created_at)} · ${p.days_added} days</p></div></div>`).join("") : `<p style="color:var(--mute);font-size:.9rem">No payments yet.</p>`}</div>`;
  const msg = (t, err) => { const m = $("subMsg"); if (!m) return; m.className = "message " + (err ? "error" : "info"); m.textContent = t; };
  if ($("subGo")) $("subGo").onclick = async () => {
    if (!subPlan) return msg("Membership is not available right now.", true);
    $("subGo").disabled = true;
    await NiaPay.subscribe({ sb, user, plan: subPlan, onClose: () => ($("subGo") && ($("subGo").disabled = false)), onError: (t) => { msg(t, true); $("subGo").disabled = false; }, onBusy: (v) => v && msg("Confirming your payment…"), onDone: () => { say("Membership active. Thank you!"); loadSub(); } });
  };
  if ($("subCheck")) $("subCheck").onclick = async () => { const r = await NiaPay.recheck(sb); if (r.error) return msg(r.error.message, true); say("Payment confirmed."); loadSub(); };
}

const TYPE_ICON = { job: "briefcase", internship: "graduation-cap", attachment: "building-2" };
function coHtml(o) { return o.logo_url ? `<div class="co lg"><img src="${esc(o.logo_url)}" alt="" onerror="this.remove()"></div>` : `<div class="co ty"><i data-lucide="${TYPE_ICON[String(o.type || "").toLowerCase()] || "briefcase"}" class="icon"></i></div>`; }
document.addEventListener("DOMContentLoaded", () => ["applicationsList", "savedList"].forEach((id) => new MutationObserver(() => icons()).observe($(id), { childList: true })));
