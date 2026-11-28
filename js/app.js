import { applyI18n, toggleLang, t } from "./i18n.js?v=20261128075446";
import { requireSession, logout } from "./session.js?v=20261128075446";
import { setSession } from "./data.js?v=20261128075446";
import { can } from "./perms.js?v=20261128075446";
import { applyPreview, openPicker, exitPreview } from "./viewas.js?v=20261128075446";
import { setPreviewMode, toast } from "./util.js?v=20261128075446";

applyI18n();
document.getElementById("logoutBtn").addEventListener("click", logout);
const sidebarEl = document.getElementById("sidebar");
const backdrop = document.getElementById("sidebarBackdrop");
const toggleSidebar = (open) => { sidebarEl.classList.toggle("open", open); backdrop.classList.toggle("show", open); };
document.getElementById("moreBtn").addEventListener("click", () => toggleSidebar(!sidebarEl.classList.contains("open")));
backdrop.addEventListener("click", () => toggleSidebar(false));

// الجداول: كل خلية بتاخد اسم العمود عشان تتعرض ككروت على الموبايل
function labelTables(scope) {
  scope.querySelectorAll("table.table:not(.perm-table):not(.no-stack)").forEach((tb) => {
    const heads = [...tb.querySelectorAll(":scope > thead th")].map((th) => th.textContent.trim());
    if (!heads.length) return;
    tb.classList.add("stackable");
    tb.querySelectorAll(":scope > tbody > tr").forEach((tr) => [...tr.children].forEach((td, i) => { if (!td.hasAttribute("data-label")) td.setAttribute("data-label", heads[i] || ""); }));
  });
}
new MutationObserver(() => { labelTables(document.getElementById("viewRoot")); labelTables(document.getElementById("appModalBody")); })
  .observe(document.body, { childList: true, subtree: true });

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
document.getElementById("userInitial").textContent = (session.profile.name || "?").trim().charAt(0);
document.getElementById("roleBadge").textContent = preview ? t("previewing") : t(isAdmin ? "role_admin" : "role_employee");

const views = {
  dashboard: { load: () => import("./views/dashboard.js?v=20261128075446") },
  courses: { perm: "courses", load: () => import("./views/courses.js?v=20261128075446") },
  course: { perm: "courses", load: () => import("./views/courses.js?v=20261128075446"), detail: true },
  groups: { perm: "groups", load: () => import("./views/groups.js?v=20261128075446") },
  group: { perm: "groups", load: () => import("./views/groups.js?v=20261128075446"), detail: true },
  students: { perm: "students", load: () => import("./views/students.js?v=20261128075446") },
  student: { perm: "students", load: () => import("./views/students.js?v=20261128075446"), detail: true },
  instructors: { perm: "instructors", load: () => import("./views/instructors.js?v=20261128075446") },
  instructor: { perm: "instructors", load: () => import("./views/instructors.js?v=20261128075446"), detail: true },
  departments: { admin: true, load: () => import("./views/departments.js?v=20261128075446") },
  employees: { admin: true, load: () => import("./views/employees.js?v=20261128075446") },
  audit: { perm: "auditLog", load: () => import("./views/audit.js?v=20261128075446") },
  finance: { load: () => import("./views/finance.js?v=20261128075446") },
  settings: { admin: true, load: () => import("./views/settings.js?v=20261128075446") },
  trash: { admin: true, load: () => import("./views/trash.js?v=20261128075446") }
};

// إخفاء الأجزاء اللي المستخدم مالوش صلاحية عليها
document.querySelectorAll("#sideNav [data-admin]").forEach((a) => a.classList.toggle("d-none", !isAdmin));
document.querySelectorAll("#sideNav [data-perm], #bottomNav [data-perm]").forEach((a) => a.classList.toggle("d-none", !can(session, a.dataset.perm)));
document.querySelectorAll("#sideNav [data-perm-any], #bottomNav [data-perm-any]").forEach((a) => a.classList.toggle("d-none", !a.dataset.permAny.split(",").some((m) => can(session, m))));
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
  document.querySelectorAll("#sideNav .nav-link, #bottomNav a").forEach((a) => a.classList.toggle("active", a.dataset.view === navKey));
  toggleSidebar(false);
  window.scrollTo(0, 0);
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
import("./search.js?v=20261128075446").then((m) => m.initSearch(session));
