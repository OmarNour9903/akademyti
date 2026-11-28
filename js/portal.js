import "./update-check.js?v=20261128083523";
import { applyI18n, toggleLang } from "./i18n.js?v=20261128083523";
import { requireSession, logout } from "./session.js?v=20261128083523";

applyI18n();
document.getElementById("langBtn").addEventListener("click", toggleLang);
document.getElementById("logoutBtn").addEventListener("click", logout);
const s = await requireSession(["student", "instructor"]);
document.getElementById("tenantName").textContent = s.tenant.name;
document.getElementById("userName").textContent = s.profile.name;
