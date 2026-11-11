const GATEWAY_URL = "https://nia-gateway.davidkasimilu71.workers.dev";
const EDGE_KEY = "cf-worker-edge-managed";
const sb = window.supabase ? window.supabase.createClient(GATEWAY_URL, EDGE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icons = () => window.__icons && window.__icons();
const toast = (t) => { const d = document.createElement("div"); d.className = "toast"; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 3200); };
const ST = { new: ["Submitted", ""], reviewing: ["In review", ""], shortlisted: ["Shortlisted", "good"], contacted: ["Contacted", "good"], rejected: ["Not selected", "bad"] };
let user, profile = {};

function paintAvatar() {
  const n = (profile.full_name || user.email || "?").trim()[0].toUpperCase();
  const html = profile.avatar_url ? `<img src="${esc(profile.avatar_url)}" alt="" onerror="this.replaceWith(document.createTextNode('${esc(n)}'))">` : esc(n);
  $("avLg").innerHTML = html; $("avatarBtn").innerHTML = html; $("menuName").textContent = profile.full_name || "Student";
}
function paintCv() {
  const has = !!profile.resume_url;
  $("cvName").textContent = has ? "CV uploaded" : "No CV uploaded"; $("cvHint").textContent = has ? "Used for all your applications" : "Add one to start applying";
  $("cvView").classList.toggle("hidden", !has); $("cvRemoveBtn").classList.toggle("hidden", !has); $("cvUploadBtn").textContent = has ? "Replace" : "Upload";
  if (has) $("cvView").href = profile.resume_url;
}
async function saveProfileFields(patch) {
  const { error } = await sb.from("profiles").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", user.id);
  if (error) { toast("Could not save: " + error.message); return false; }
  Object.assign(profile, patch); return true;
}
function showTab(t) {
  document.querySelectorAll(".ptab").forEach((b) => b.classList.toggle("on", b.dataset.tab === t));
  ["profile", "applications", "settings"].forEach((x) => $("tab-" + x).classList.toggle("hidden", x !== t));
  if (t === "applications") loadApps();
}

document.addEventListener("DOMContentLoaded", async () => {
  if (!sb) return;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return (location.href = "index.html");
  user = session.user;
  const { data: p } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
  if (p?.status === "banned") { await sb.auth.signOut(); return (location.href = "index.html"); }
  profile = p || {};
  $("pEmail").textContent = user.email; $("menuEmail").textContent = user.email;
  if (profile.role === "admin") $("adminLink").classList.remove("hidden");
  const map = { fFull: "full_name", fPhone: "phone", fWa: "whatsapp", fCounty: "county", fInst: "institution", fCourse: "course", fBio: "bio" };
  Object.entries(map).forEach(([id, k]) => ($(id).value = profile[k] || ""));
  paintAvatar(); paintCv();

  $("avatarBtn").onclick = (e) => { e.stopPropagation(); const m = $("menu"); m.classList.toggle("hidden"); $("avatarBtn").setAttribute("aria-expanded", !m.classList.contains("hidden")); };
  document.addEventListener("click", (e) => { if (!$("menu").contains(e.target)) $("menu").classList.add("hidden"); });
  const out = async () => { await sb.auth.signOut(); location.href = "index.html"; };
  $("logoutBtn").onclick = out; $("logoutBtn2").onclick = out;
  $("ptabs").onclick = (e) => { const b = e.target.closest(".ptab"); if (b) { showTab(b.dataset.tab); history.replaceState(null, "", "#" + b.dataset.tab); } };
  document.querySelectorAll("[data-go]").forEach((a) => (a.onclick = () => { showTab(a.dataset.go); $("menu").classList.add("hidden"); }));
  const h = location.hash.slice(1); if (["applications", "settings"].includes(h)) showTab(h);

  $("profileForm").onsubmit = async (e) => {
    e.preventDefault(); const patch = {}; Object.entries(map).forEach(([id, k]) => (patch[k] = $(id).value.trim() || null));
    $("saveBtn").disabled = true; if (await saveProfileFields(patch)) { toast("Profile saved"); paintAvatar(); } $("saveBtn").disabled = false;
  };

  $("uploadAvatarBtn").onclick = () => $("avatarFile").click();
  $("avatarFile").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!/^image\/(png|jpe?g|webp)$/.test(f.type) || f.size > 2 * 1024 * 1024) return toast("Use a PNG, JPG or WebP image under 2 MB.");
    const path = `${user.id}/avatar_${Date.now()}.${f.name.split(".").pop().toLowerCase()}`;
    const { error } = await sb.storage.from("avatars").upload(path, f, { upsert: true });
    if (error) return toast("Upload failed: " + error.message);
    if (await saveProfileFields({ avatar_url: sb.storage.from("avatars").getPublicUrl(path).data.publicUrl })) { paintAvatar(); toast("Photo updated"); }
  };
  $("pickAvatarBtn").onclick = async () => {
    const box = $("defaults"); box.classList.toggle("hidden"); if (box.dataset.loaded) return;
    const { data } = await sb.from("avatars").select("url,label").eq("active", true);
    box.innerHTML = (data || []).map((a) => `<button type="button" data-u="${esc(a.url)}" aria-label="${esc(a.label || "Avatar")}"><img src="${esc(a.url)}" alt=""></button>`).join("") || `<p class="sub">No default avatars yet.</p>`;
    box.dataset.loaded = 1;
    box.onclick = async (e) => { const b = e.target.closest("button"); if (b && await saveProfileFields({ avatar_url: b.dataset.u })) { paintAvatar(); toast("Avatar updated"); } };
  };

  $("cvUploadBtn").onclick = () => $("cvFile").click();
  $("cvFile").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!/\.(pdf|docx?)$/i.test(f.name) || f.size > 5 * 1024 * 1024) return toast("Use a PDF or Word file under 5 MB.");
    const path = `${user.id}/resume_${Date.now()}.${f.name.split(".").pop().toLowerCase()}`;
    const { error } = await sb.storage.from("resumes").upload(path, f, { upsert: true });
    if (error) return toast("Upload failed: " + error.message);
    await removeOldCv();
    if (await saveProfileFields({ resume_url: sb.storage.from("resumes").getPublicUrl(path).data.publicUrl })) { paintCv(); toast("CV saved"); }
  };
  $("cvRemoveBtn").onclick = async () => {
    if (!confirm("Remove your CV? You will need to upload one again to apply.")) return;
    await removeOldCv(); if (await saveProfileFields({ resume_url: null })) { paintCv(); toast("CV removed"); }
  };

  $("pwForm").onsubmit = async (e) => {
    e.preventDefault(); if ($("pw1").value !== $("pw2").value) return toast("Passwords do not match.");
    $("pwBtn").disabled = true; const { error } = await sb.auth.updateUser({ password: $("pw1").value });
    $("pwBtn").disabled = false; if (error) return toast(error.message);
    $("pwForm").reset(); toast("Password updated");
  };
  icons();
});

async function removeOldCv() {
  const m = (profile.resume_url || "").split("/storage/v1/object/public/resumes/")[1];
  if (m) await sb.storage.from("resumes").remove([decodeURIComponent(m)]);
}

async function loadApps() {
  const box = $("appsList");
  const { data: apps, error } = await sb.from("applications").select("opportunity_id, created_at, status").eq("user_id", user.id).order("created_at", { ascending: false });
  if (error) return (box.innerHTML = `<p class="message error">Could not load applications.</p>`);
  if (!apps?.length) return (box.innerHTML = `<h2>No applications yet</h2><p class="sub">Browse <a href="dashboard.html" style="text-decoration:underline">opportunities</a> and apply to your first one.</p>`);
  const { data: opps } = await sb.from("opportunities").select("id,title,company,location,type").in("id", apps.map((a) => a.opportunity_id));
  const m = new Map((opps || []).map((o) => [o.id, o]));
  box.innerHTML = apps.map((a) => {
    const o = m.get(a.opportunity_id), [label, cls] = ST[a.status] || ST.new;
    return `<div class="app"><div><h3>${esc(o?.title || "Removed opportunity")}</h3><p>${o ? esc(o.company) + " · " + esc(o.location) + " · " : ""}Applied ${new Date(a.created_at).toLocaleDateString("en-KE", { day: "numeric", month: "short", year: "numeric" })}</p></div><span class="st ${cls}">${label}</span></div>`;
  }).join("");
}
