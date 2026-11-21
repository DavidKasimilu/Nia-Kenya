// Notification bell for the student pages: unread badge, history panel. Needs the page's Supabase client `sb`.
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ago = (iso) => { const m = Math.floor((Date.now() - new Date(iso)) / 6e4); return m < 1 ? "Just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.floor(m / 60) + " h ago" : Math.floor(m / 1440) + " d ago"; };
  const ICON = { announcement: "megaphone", program: "sparkles", system: "bell" };
  document.addEventListener("DOMContentLoaded", async () => {
    if (typeof sb === "undefined" || !sb) return;
    const bar = document.querySelector(".topbar-in"); if (!bar) return;
    const { data: { session } } = await sb.auth.getSession(); if (!session) return;
    let box = bar.querySelector(".tb-right");
    if (!box) { box = document.createElement("div"); box.className = "tb-right"; bar.insertBefore(box, bar.querySelector("#searchBtn") || bar.querySelector(".me")); }
    const btn = document.createElement("button");
    btn.className = "tb-btn"; btn.id = "bellBtn"; btn.setAttribute("aria-label", "Notifications");
    btn.innerHTML = `<i data-lucide="bell" class="icon"></i><span class="nbadge hidden" id="bellN"></span>`; box.appendChild(btn);
    const panel = document.createElement("div"); panel.className = "np hidden"; panel.id = "notifPanel";
    panel.innerHTML = `<div class="np-head"><b>Notifications</b><button class="tb-btn" id="npClose" aria-label="Close"><i data-lucide="x" class="icon"></i></button></div><div class="np-list" id="npList"></div>`;
    document.body.appendChild(panel); if (window.lucide) window.lucide.createIcons();
    const badge = document.getElementById("bellN"), list = document.getElementById("npList");
    const setBadge = (n) => { badge.textContent = n > 99 ? "99+" : n; badge.classList.toggle("hidden", !(n > 0)); };
    async function refresh() { try { const { data } = await sb.rpc("my_unread_notifications"); if (typeof data === "number") setBadge(data); } catch (e) {} }
    const close = () => panel.classList.add("hidden");
    async function open() {
      list.innerHTML = `<div class="empty" style="border:0">Loading…</div>`; panel.classList.remove("hidden");
      const unread = parseInt(badge.textContent, 10) || 0;
      const { data, error } = await sb.from("notifications").select("*").order("created_at", { ascending: false }).limit(50);
      if (error) { list.innerHTML = `<div class="empty" style="border:0">Could not load notifications.</div>`; return; }
      list.innerHTML = (data || []).length ? data.map((n, i) => `<div class="ni ${i < unread ? "new" : ""} ${n.link && !/^[a-z]+:/i.test(n.link) ? "link" : ""}" data-l="${esc(n.link || "")}"><div class="mi2"><i data-lucide="${ICON[n.kind] || "bell"}" class="icon"></i></div><div><h4>${esc(n.title)}</h4>${n.body ? `<p>${esc(n.body)}</p>` : ""}<small>${ago(n.created_at)}</small></div></div>`).join("") : `<div class="empty" style="border:0">No notifications yet.</div>`;
      if (window.lucide) window.lucide.createIcons();
      setBadge(0); sb.rpc("mark_notifications_seen");
    }
    btn.onclick = (e) => { e.stopPropagation(); panel.classList.contains("hidden") ? open() : close(); };
    document.getElementById("npClose").onclick = close;
    list.onclick = (e) => { const it = e.target.closest(".ni.link"); if (it) location.href = it.dataset.l; };
    document.addEventListener("click", (e) => { if (!panel.contains(e.target) && e.target !== btn) close(); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    refresh(); setInterval(refresh, 60000); document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  });
})();
