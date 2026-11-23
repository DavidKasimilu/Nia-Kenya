const GATEWAY_URL = "https://nia-gateway.davidkasimilu71.workers.dev";
const EDGE_KEY = "cf-worker-edge-managed";
const sb = window.supabase ? window.supabase.createClient(GATEWAY_URL, EDGE_KEY, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icons = () => window.__icons && window.__icons();
const ago = (iso) => { const m = Math.floor((Date.now() - new Date(iso)) / 6e4); return m < 1 ? "Just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.floor(m / 60) + " h ago" : Math.floor(m / 1440) + " d ago"; };
let user, items = [], open = null;

document.addEventListener("DOMContentLoaded", async () => {
  if (!sb) return;
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return (location.href = "index.html");
  user = session.user;
  const { data: p } = await sb.from("profiles").select("status, role, full_name, avatar_url").eq("id", user.id).maybeSingle();
  if (p?.status === "banned") { await sb.auth.signOut(); return (location.href = "index.html"); }
  if (p?.role === "employer") return (location.href = "employer.html");
  const n = (p?.full_name || user.email || "?").trim()[0].toUpperCase();
  $("avatarBtn").innerHTML = p?.avatar_url ? `<img src="${esc(p.avatar_url)}" alt="" onerror="this.replaceWith(document.createTextNode('${esc(n)}'))">` : esc(n);
  if (window.NiaNav) NiaNav.setAvatar($("avatarBtn").innerHTML);
  $("menuName").textContent = p?.full_name || "Student"; $("menuEmail").textContent = user.email;
  if (["admin", "moderator"].includes(p?.role)) $("adminLink").classList.remove("hidden");
  $("avatarBtn").onclick = (e) => { e.stopPropagation(); $("menu").classList.toggle("hidden"); };
  document.addEventListener("click", (e) => { if (!$("menu").contains(e.target)) $("menu").classList.add("hidden"); });
  $("logoutBtn").onclick = async () => { await sb.auth.signOut(); location.href = "index.html"; };
  $("readAll").onclick = async () => { await sb.rpc("mark_all_messages_read"); items.forEach((r) => (r.read_at ||= new Date().toISOString())); render(); if (window.NiaNav) NiaNav.refreshMessages(); };
  $("list").onclick = (e) => { const c = e.target.closest("[data-m]"); if (c) toggle(c.dataset.m); };
  const { data, error } = await sb.from("message_recipients").select("read_at, created_at, opportunity_messages(id,title,body,opp_title,opp_company,sender_name,sender_role,created_at)").eq("user_id", user.id).order("created_at", { ascending: false }).limit(100);
  if (error) { $("list").innerHTML = `<div class="empty">Could not load messages. Please refresh.</div>`; return; }
  items = (data || []).filter((r) => r.opportunity_messages); render();
});

function render() {
  const unread = items.filter((r) => !r.read_at).length; $("readAll").classList.toggle("hidden", !unread);
  $("list").innerHTML = items.length ? items.map((r) => { const m = r.opportunity_messages, isOpen = open === m.id, emp = m.sender_role === "employer";
    return `<article class="msg ${r.read_at ? "" : "new"} ${isOpen ? "open" : ""}" data-m="${esc(m.id)}"><div class="mi2"><i data-lucide="${emp ? "building-2" : "megaphone"}" class="icon"></i></div>
      <div class="mb"><div class="mh"><b>${esc(m.sender_name)}</b><small>${ago(m.created_at)}</small></div><div class="mo">About: ${esc(m.opp_title)}${m.opp_company ? " · " + esc(m.opp_company) : ""}</div><h4>${esc(m.title)}</h4>${m.body ? `<p class="mt">${esc(m.body)}</p>` : ""}</div>${r.read_at ? "" : `<span class="udot" aria-label="Unread"></span>`}</article>`; }).join("")
    : `<div class="empty"><i data-lucide="message-square" class="icon"></i><p>No messages yet. When Nia or an employer writes to you about an opportunity you applied for, it will appear here.</p></div>`;
  icons();
}

async function toggle(id) {
  open = open === id ? null : id;
  const r = items.find((x) => x.opportunity_messages.id === id);
  if (r && !r.read_at) { r.read_at = new Date().toISOString(); sb.rpc("mark_messages_read", { p_ids: [id] }).then(() => window.NiaNav && NiaNav.refreshMessages()); }
  render();
}
