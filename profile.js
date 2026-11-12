const GATEWAY_URL = "https://nia-gateway.davidkasimilu71.workers.dev";
const EDGE_KEY = "cf-worker-edge-managed";
const sb = window.supabase ? window.supabase.createClient(GATEWAY_URL, EDGE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icons = () => window.__icons && window.__icons();
const STATUS = { new: "Submitted", reviewing: "In review", shortlisted: "Shortlisted", contacted: "Contacted", rejected: "Not selected" };
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
  ["profile", "applications", "settings"].forEach((x) => $("tab-" + x).classList.toggle("hidden", x !== t));
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
  showTab(["applications", "settings"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "profile");
  $("profileForm").onsubmit = saveProfile; $("pwForm").onsubmit = changePw;
  $("profileResume").onchange = uploadCv;
  $("deleteCvBtn").onclick = () => $("confirmModal").classList.remove("hidden");
  $("confirmNo").onclick = () => $("confirmModal").classList.add("hidden");
  $("confirmYes").onclick = removeCv;
  $("bigAvatar").onclick = openAvatars; $("avClose").onclick = () => $("avatarModal").classList.add("hidden");
  $("avFile").onchange = uploadAvatar;
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") document.querySelectorAll(".modal-overlay").forEach((m) => m.classList.add("hidden")); });
  loadApplications();
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
  const { data, error } = await sb.from("applications").select("id,status,created_at,opportunities(title,company,location)").eq("user_id", user.id).order("created_at", { ascending: false });
  const box = $("applicationsList");
  if (error) return (box.innerHTML = `<div class="empty">Could not load applications.</div>`);
  box.innerHTML = (data || []).length ? data.map((a) => { const o = a.opportunities || {}, s = a.status || "new"; return `<div class="app"><div class="co">${esc((o.company || "?")[0].toUpperCase())}</div><div class="grow"><h3>${esc(o.title || "Opportunity removed")}</h3><p>${esc(o.company || "")}${o.location ? " · " + esc(o.location) : ""} · Applied ${new Date(a.created_at).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}</p></div><span class="badge st-${esc(s)}">${esc(STATUS[s] || s)}</span></div>`; }).join("") : `<div class="empty">You haven't applied to anything yet.<br><a href="dashboard.html" style="text-decoration:underline;font-weight:600">Browse opportunities</a></div>`;
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
