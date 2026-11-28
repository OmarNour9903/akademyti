// تنبيه "فيه تحديث": لو اترفعت نسخة جديدة والصفحة مفتوحة على القديمة، بيظهر شريط فيه زرار "تحديث"
// الفحص كل دقيقة، ولما الموظف يرجع للتاب. رقم النسخة بيتكتب في version.json من tools/bump-version.py
import { t } from "./i18n.js?v=20261128083523";

const CURRENT = new URL(import.meta.url).searchParams.get("v") || "";
const EVERY = 60 * 1000;
let shown = false, busy = false;

async function check() {
  if (shown || busy || !CURRENT || document.visibilityState === "hidden") return;
  busy = true;
  try {
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: "no-store" });
    if (r.ok) {
      const { v } = await r.json();
      if (v && v !== CURRENT) show(v);
    }
  } catch (e) { /* النت فاصل: نجرب المرة الجاية */ }
  busy = false;
}

function show(v) {
  shown = true;
  const bar = document.createElement("div");
  bar.className = "update-bar";
  bar.setAttribute("role", "alert");
  bar.innerHTML = `<i class="bi bi-arrow-repeat"></i><span class="update-text"></span><button type="button" class="btn btn-sm update-btn"></button>`;
  bar.querySelector(".update-text").textContent = t("update_available");
  bar.querySelector(".update-btn").textContent = t("update_now");
  bar.querySelector(".update-btn").addEventListener("click", () => {
    // رابط جديد عشان المتصفح ما يرجعش الصفحة من الكاش
    const u = new URL(location.href);
    u.searchParams.set("u", v);
    location.replace(u.toString());
  });
  document.body.appendChild(bar);
}

setInterval(check, EVERY);
document.addEventListener("visibilitychange", check);
window.addEventListener("focus", check);
check();
