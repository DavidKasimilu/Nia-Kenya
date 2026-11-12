// Adds a Subresource Integrity hash to the Lucide <script> tag in every HTML file.
// Run once from the repo root, with internet access:  node tools/add-sri.mjs   (Node 18+)
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
const URL_ = "https://cdn.jsdelivr.net/npm/lucide@0.469.0/dist/umd/lucide.min.js";
const buf = Buffer.from(await (await fetch(URL_)).arrayBuffer());
const hash = "sha384-" + createHash("sha384").update(buf).digest("base64");
const tag = `<script src="${URL_}"></script>`;
let n = 0;
for (const f of readdirSync(".").filter((x) => x.endsWith(".html"))) {
  const s = readFileSync(f, "utf8");
  if (s.includes(tag)) { writeFileSync(f, s.replace(tag, `<script src="${URL_}" integrity="${hash}" crossorigin="anonymous"></script>`)); n++; }
}
console.log(`${hash}\nAdded to ${n} file(s).`);
