// Membership plan chooser shared by the dashboard paywall and the profile Subscription tab.
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  window.NiaPlans = {
    html(plans, sel) {
      return `<div class="plans">${plans.map((p) => `<label class="plan ${p.code === sel ? "on" : ""}"><span class="pl"><input type="radio" name="plan" value="${esc(p.code)}" ${p.code === sel ? "checked" : ""}><span class="pn">${esc(p.name)}${p.code === "quarterly" ? "<em>Best value</em>" : ""}</span></span><span class="pp">KES ${Number(p.amount_kes)}</span></label>`).join("")}</div>`;
    },
    selected(root) { const r = root.querySelector('input[name="plan"]:checked'); return r ? r.value : null; },
    bind(root) { root.addEventListener("change", () => root.querySelectorAll(".plan").forEach((l) => l.classList.toggle("on", l.querySelector("input").checked))); },
    min(plans) { return plans.length ? Math.min(...plans.map((p) => Number(p.amount_kes))) : 130; },
  };
})();
