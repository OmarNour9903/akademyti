// فحص الاستيرادات قبل الرفع: node tools/check-imports.js
const fs = require("fs"), path = require("path");
const files = [...fs.readdirSync("js").filter((f) => f.endsWith(".js")).map((f) => "js/" + f), ...fs.readdirSync("js/views").map((f) => "js/views/" + f)];
const exp = {};
for (const f of files) {
  const s = fs.readFileSync(f, "utf8"); const names = new Set();
  for (const m of s.matchAll(/export (?:async )?(?:function|const|let|class) (\w+)/g)) names.add(m[1]);
  for (const m of s.matchAll(/export \{([^}]+)\}/g)) m[1].split(",").forEach((x) => names.add(x.trim().split(/\s+as\s+/).pop()));
  exp[path.resolve(f)] = names;
}
let bad = 0;
for (const f of files) {
  const s = fs.readFileSync(f, "utf8"); const imported = new Set();
  for (const m of s.matchAll(/import \{([^}]+)\} from "(\.[^"?]+)/g)) {
    const tgt = path.resolve(path.dirname(f), m[2]);
    for (const n of m[1].split(",").map((x) => x.trim()).filter(Boolean)) { imported.add(n); if (exp[tgt] && !exp[tgt].has(n)) { console.log("MISSING EXPORT", f, n); bad++; } }
  }
  const local = new Set([...s.matchAll(/(?:function|const|let|var|class)\s+(\w+)/g)].map((m) => m[1]));
  const others = new Set(); Object.entries(exp).forEach(([k, v]) => { if (k !== path.resolve(f)) v.forEach((n) => others.add(n)); });
  for (const n of others) if (new RegExp("(?<![\\w.])" + n + "\\(").test(s) && !imported.has(n) && !local.has(n)) { console.log("NOT IMPORTED", f, n); bad++; }
}
console.log(bad ? `${bad} problem(s)` : "imports OK");
process.exit(bad ? 1 : 0);
