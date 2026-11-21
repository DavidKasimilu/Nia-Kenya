// Mobile bottom navigation (Instagram-style) for the student pages. Hidden on desktop by CSS.
// Each page sets <body data-page="home|programs|profile">. Pages call NiaNav.setAvatar(html) once they know the photo.
(() => {
  const page = document.body.dataset.page;
  const items = [
    ["home", "dashboard.html", "briefcase", "Opportunities"],
    ["programs", "programs.html", "sparkles", "Programs"],
    ["search", "dashboard.html#search", "search", "Search"],
    ["saved", "profile.html#saved", "bookmark", "Saved"],
    ["profile", "profile.html", null, "Profile"],
  ];
  const nav = document.createElement("nav");
  nav.className = "bn"; nav.setAttribute("aria-label", "Main");
  nav.innerHTML = items.map(([k, href, icon, label]) => `<a href="${href}" data-k="${k}" aria-label="${label}" title="${label}">${icon ? `<i data-lucide="${icon}" class="icon"></i>` : `<span class="bn-av" id="bnAv"></span>`}</a>`).join("");
  document.body.appendChild(nav); document.body.classList.add("has-bn");
  const mark = () => {
    const saved = page === "profile" && location.hash === "#saved";
    nav.querySelectorAll("a").forEach((a) => { const k = a.dataset.k; a.classList.toggle("on", (k === page && !(page === "profile" && saved)) || (k === "saved" && saved)); });
  };
  mark(); window.addEventListener("hashchange", mark);
  nav.querySelector('[data-k="search"]').addEventListener("click", (e) => { const b = document.getElementById("searchBtn"); if (page === "home" && b) { e.preventDefault(); b.click(); } });
  window.NiaNav = { setAvatar(html) { const el = document.getElementById("bnAv"); if (el) el.innerHTML = html; } };
  if (window.lucide) window.lucide.createIcons();
})();
