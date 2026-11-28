import { fs } from "./firebase.js?v=20261128083523";
import { t } from "./i18n.js?v=20261128083523";
import { esc } from "./util.js?v=20261128083523";
import { col } from "./data.js?v=20261128083523";
import { can } from "./perms.js?v=20261128083523";

// بحث موحّد بالكود أو الاسم أو الموبايل أو الإيميل
const SOURCES = [
  { coll: "students", hash: "student", icon: "bi-person", label: "student" },
  { coll: "courses", hash: "course", icon: "bi-journal-bookmark", label: "course" },
  { coll: "groups", hash: "group", icon: "bi-collection", label: "group" },
  { coll: "instructors", hash: "instructor", icon: "bi-person-video3", label: "instructor" }
];
let cache = null, cacheAt = 0;

async function load(session) {
  if (cache && Date.now() - cacheAt < 60000) return cache;
  const out = [];
  await Promise.all(SOURCES.filter((s) => can(session, s.coll)).map(async (s) => {
    const snap = await fs.getDocs(col(s.coll));
    snap.forEach((d) => { const x = d.data(); if (!x.deleted) out.push({ ...s, id: d.id, code: x.code, name: x.name || x.courseName || "", phone: x.phone || "", email: x.email || "" }); });
  }));
  cache = out; cacheAt = Date.now();
  return out;
}

export function initSearch(session) {
  const box = document.getElementById("searchBox");
  const res = document.getElementById("searchResults");
  let timer;
  const hide = () => res.classList.add("d-none");
  const run = async (go) => {
    if (go) clearTimeout(timer);
    const q = box.value.trim().toLowerCase();
    if (!q) { hide(); return; }
    const all = await load(session);
    const exact = all.find((x) => (x.code || "").toLowerCase() === q);
    if (go && exact) { clearTimeout(timer); box.value = ""; hide(); location.hash = `#${exact.hash}/${exact.id}`; return; }
    const hits = all.filter((x) => [x.code, x.name, x.phone, x.email].some((v) => String(v).toLowerCase().includes(q))).slice(0, 12);
    res.innerHTML = hits.length ? hits.map((x) => `<a class="search-item" href="#${x.hash}/${x.id}">
      <i class="bi ${x.icon}"></i><span class="badge text-bg-light font-monospace">${esc(x.code)}</span>
      <span class="flex-grow-1">${esc(x.name)}</span><span class="text-muted small">${t(x.label)}</span></a>`).join("")
      : `<div class="p-3 text-muted small">${t("no_results")}</div>`;
    res.classList.remove("d-none");
  };
  box.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(() => run(false), 250); });
  box.addEventListener("keydown", (e) => { if (e.key === "Enter") run(true); if (e.key === "Escape") hide(); });
  res.addEventListener("click", () => { box.value = ""; hide(); });
  document.addEventListener("click", (e) => { if (!e.target.closest(".search-wrap")) hide(); });
  window.addEventListener("hashchange", () => { cache = null; clearTimeout(timer); box.value = ""; hide(); });
}
