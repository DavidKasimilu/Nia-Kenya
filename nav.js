// Mobile bottom navigation (Instagram-style) for the student pages. Hidden on desktop by CSS.
// Each page sets <body data-page="home|programs|profile">. Pages call NiaNav.setAvatar(html) once they know the photo.
(() => {
  const page = document.body.dataset.page;
  const items = [
    ["home", "dashboard.html", "briefcase", "Opportunities"],
    ["programs", "programs.html", "sparkles", "Programs"],
    ["search", "dashboard.html#search", "search", "Search"],
    ["messages", "messages.html", "message-square", "Messages"],
    ["profile", "profile.html", null, "Profile"],
  ];
  const nav = document.createElement("nav");
  nav.className = "bn"; nav.setAttribute("aria-label", "Main");
  nav.innerHTML = items.map(([k, href, icon, label]) => `<a href="${href}" data-k="${k}" aria-label="${label}" title="${label}">${icon ? `<i data-lucide="${icon}" class="icon"></i>` : `<span class="bn-av" id="bnAv"></span>`}</a>`).join("");
  document.body.appendChild(nav); document.body.classList.add("has-bn");
  const mark = () => { nav.querySelectorAll("a").forEach((a) => a.classList.toggle("on", a.dataset.k === page)); };
  mark(); window.addEventListener("hashchange", mark);
  nav.querySelector('[data-k="search"]').addEventListener("click", (e) => { const b = document.getElementById("searchBtn"); if (page === "home" && b) { e.preventDefault(); b.click(); } });
  // Unread messages badge (bottom bar + desktop link)
  const targets = () => [nav.querySelector('[data-k="messages"]'), document.querySelector('.top-links a[href="messages.html"]')].filter(Boolean);
  function setMsgBadge(c) {
    targets().forEach((t) => { let b = t.querySelector(".nbadge"); if (!b) { b = document.createElement("span"); b.className = "nbadge"; t.appendChild(b); } b.textContent = c > 99 ? "99+" : c; b.classList.toggle("hidden", !(c > 0)); });
  }
  async function refreshMessages() { try { if (typeof sb === "undefined" || !sb) return; const { data: { session } } = await sb.auth.getSession(); if (!session) return; const { data } = await sb.rpc("my_unread_messages"); if (typeof data === "number") setMsgBadge(data); } catch (e) {} }
  window.NiaNav = { setAvatar(html) { const el = document.getElementById("bnAv"); if (el) el.innerHTML = html; }, refreshMessages };
  document.addEventListener("DOMContentLoaded", () => { refreshMessages(); setInterval(refreshMessages, 60000); document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshMessages(); }); });
  if (document.readyState !== "loading") refreshMessages();
  if (window.lucide) window.lucide.createIcons();
})();
