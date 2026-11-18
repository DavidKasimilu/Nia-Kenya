// Shared alert-preferences form (used by the dashboard modal and the profile Alerts tab).
(() => {
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const TYPES = [["Job", "Jobs"], ["Internship", "Internships"], ["Attachment", "Attachments"]];
  window.NiaAlerts = {
    formHtml(p = {}) {
      const on = new Set(p.types || []);
      return `<div class="form-group"><label>Opportunity types</label><div class="alchecks">${TYPES.map(([v, l]) => `<label><input type="checkbox" name="altype" value="${v}" ${on.has(v) ? "checked" : ""}> ${l}</label>`).join("")}</div><small style="color:var(--mute)">Leave all unticked for any type.</small></div>
      <div class="form-group"><label for="alKw">Keyword (optional)</label><input id="alKw" maxlength="60" placeholder="e.g. engineering, finance" value="${esc(p.keyword)}"></div>
      <div class="form-group"><label for="alLoc">Location (optional)</label><input id="alLoc" maxlength="60" placeholder="e.g. Nairobi" value="${esc(p.location)}"></div>
      <label class="consent"><input type="checkbox" id="alOn" ${p.enabled === false ? "" : "checked"}> <span>Email me a daily summary when new opportunities match.</span></label>`;
    },
    read(root) {
      return { types: [...root.querySelectorAll('input[name="altype"]:checked')].map((x) => x.value), keyword: root.querySelector("#alKw").value.trim() || null, location: root.querySelector("#alLoc").value.trim() || null, enabled: root.querySelector("#alOn").checked };
    },
    async load(sb, uid) { const { data } = await sb.from("alert_prefs").select("*").eq("user_id", uid).maybeSingle(); return data; },
    async save(sb, uid, v) { return sb.from("alert_prefs").upsert({ user_id: uid, ...v }, { onConflict: "user_id" }); },
  };
})();
