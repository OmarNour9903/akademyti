import { applyI18n, toggleLang, t } from "./i18n.js?v=20261126230710";
import { requireSession, logout } from "./session.js?v=20261126230710";
import { setSession } from "./data.js?v=20261126230710";
import { can } from "./perms.js?v=20261126230710";
import { applyPreview, openPicker, exitPreview } from "./viewas.js?v=20261126230710";
import { setPreviewMode, toast } from "./util.js?v=20261126230710";

applyI18n();
document.getElementById("logoutBtn").addEventListener("click", logout);
document.getElementById("menuBtn").addEventListener("click", () => document.getElementById("sidebar").classList.toggle("open"));

const session = await requireSession(["admin", "employee"]);
setSession(session);
const realAdmin = session.role === "admin";
const preview = applyPreview(session);
const isAdmin = session.role === "admin";
if (preview) {
  setPreviewMode(true);
  const bar = document.getElementById("previewBar");
  bar.querySelector("#previewName").textContent = preview.name;
  bar.classList.remove("d-none");
  bar.querySelector("#exitPreview").addEventListener("click", exitPreview);
}
const viewAsBtn = document.getElementById("viewAsBtn");
viewAsBtn.classList.toggle("d-none", !realAdmin);
viewAsBtn.addEventListener("click", () => (preview ? exitPreview() : openPicker(session)));
window.addEventListener("unhandledrejection", (e) => { if (e.reason && e.reason.userMessage) toast(e.reason.userMessage, "warning"); });
document.getElementById("tenantName").textContent = session.tenant.name;
document.getElementById("userName").textContent = session.profile.name;
document.getElementById("roleBadge").textContent = preview ? t("previewing") : t(isAdmin ? "role_admin" : "role_employee");

const views = {
  dashboard: { load: () => import("./views/dashboard.js?v=20261126230710") },
  courses: { perm: "courses", load: () => import("./views/courses.js?v=20261126230710") },
  course: { perm: "courses", load: () => import("./views/courses.js?v=20261126230710"), detail: true },
  groups: { perm: "groups", load: () => import("./views/groups.js?v=20261126230710") },
  group: { perm: "groups", load: () => import("./views/groups.js?v=20261126230710"), detail: true },
  students: { perm: "students", load: () => import("./views/students.js?v=20261126230710") },
  student: { perm: "students", load: () => import("./views/students.js?v=20261126230710"), detail: true },
  instructors: { perm: "instructors", load: () => import("./views/instructors.js?v=20261126230710") },
  instructor: { perm: "instructors", load: () => import("./views/instructors.js?v=20261126230710"), detail: true },
  departments: { admin: true, load: () => import("./views/departments.js?v=20261126230710") },
  employees: { admin: true, load: () => import("./views/employees.js?v=20261126230710") },
  audit: { perm: "auditLog", load: () => import("./views/audit.js?v=20261126230710") },
  finance: { load: () => import("./views/finance.js?v=20261126230710") },
  trash: { admin: true, load: () => import("./views/trash.js?v=20261126230710") }
};

// إخفاء الأجزاء اللي المستخدم مالوش صلاحية عليها
document.querySelectorAll("#sideNav [data-admin]").forEach((a) => a.classList.toggle("d-none", !isAdmin));
document.querySelectorAll("#sideNav [data-perm]").forEach((a) => a.classList.toggle("d-none", !can(session, a.dataset.perm)));
document.querySelectorAll("#sideNav [data-perm-any]").forEach((a) => a.classList.toggle("d-none", !a.dataset.permAny.split(",").some((m) => can(session, m))));
document.querySelectorAll("#sideNav .nav-section").forEach((s) => {
  const any = [...document.querySelectorAll("#sideNav [data-admin], #sideNav [data-perm='auditLog']")].some((a) => !a.classList.contains("d-none"));
  s.classList.toggle("d-none", !any);
});

const root = document.getElementById("viewRoot");

function placeholder() {
  root.innerHTML = `<div class="card card-soft p-5 text-center text-muted"><i class="bi bi-cone-striped fs-1 mb-2"></i><p class="mb-0">${t("coming_soon")}</p></div>`;
}

async function show() {
  const [name, param] = (location.hash.slice(1) || "dashboard").split("/");
  const navKey = { course: "courses", group: "groups", student: "students", instructor: "instructors" }[name] || name;
  document.querySelectorAll("#sideNav .nav-link").forEach((a) => a.classList.toggle("active", a.dataset.view === navKey));
  document.getElementById("sidebar").classList.remove("open");
  const v = views[name];
  if (!v) return placeholder();
  if ((v.admin && !isAdmin) || (v.perm && !can(session, v.perm))) { location.hash = "#dashboard"; return; }
  root.innerHTML = `<div class="text-center text-muted py-5"><div class="spinner-border"></div></div>`;
  try {
    const mod = await v.load();
    if (v.detail) await mod.renderDetail(root, param);
    else await mod.render(root);
  } catch (e) {
    console.error(e);
    root.innerHTML = `<div class="alert alert-danger">${t("err_generic")}</div>`;
  }
}

document.getElementById("langBtn").addEventListener("click", () => {
  toggleLang();
  document.getElementById("roleBadge").textContent = preview ? t("previewing") : t(isAdmin ? "role_admin" : "role_employee");
  show();
});
window.addEventListener("hashchange", show);
show();
import("./search.js?v=20261126230710").then((m) => m.initSearch(session));
