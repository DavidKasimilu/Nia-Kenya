// Remembers an affiliate code from a link like  index.html?ref=ABC1234  for 30 days.
(() => {
  const c = new URLSearchParams(location.search).get("ref");
  if (c && /^[A-Za-z0-9]{4,12}$/.test(c)) { try { localStorage.setItem("nia_ref", JSON.stringify({ c: c.toUpperCase(), t: Date.now() })); } catch (e) {} }
})();
