import { db, fs } from "./firebase.js";
import { applyI18n, toggleLang } from "./i18n.js";
import { requireSession, logout } from "./session.js";

applyI18n();
document.getElementById("langBtn").addEventListener("click", toggleLang);
document.getElementById("logoutBtn").addEventListener("click", logout);
document.getElementById("menuBtn").addEventListener("click", () => document.getElementById("sidebar").classList.toggle("open"));

const session = await requireSession(["admin", "employee"]);
const tid = session.tenant.id;
document.getElementById("tenantName").textContent = session.tenant.name;
document.getElementById("userName").textContent = session.profile.name;

function showView(name) {
  document.querySelectorAll("#sideNav .nav-link").forEach((a) => a.classList.toggle("active", a.dataset.view === name));
  document.getElementById("view-dashboard").classList.toggle("d-none", name !== "dashboard");
  document.getElementById("view-placeholder").classList.toggle("d-none", name === "dashboard");
  document.getElementById("sidebar").classList.remove("open");
}
window.addEventListener("hashchange", () => showView(location.hash.slice(1) || "dashboard"));
showView(location.hash.slice(1) || "dashboard");

async function count(q) {
  try { return (await fs.getCountFromServer(q)).data().count; } catch (e) { console.error(e); return "-"; }
}

async function loadStats() {
  const col = (name) => fs.collection(db, "tenants", tid, name);
  document.getElementById("statTotal").textContent = await count(col("students"));
  document.getElementById("statCurrent").textContent = await count(fs.query(col("enrollments"), fs.where("status", "==", "active")));
  document.getElementById("statCourses").textContent = await count(fs.query(col("courses"), fs.where("status", "==", "available")));
}
loadStats();
