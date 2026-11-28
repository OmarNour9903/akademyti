import { fs } from "../firebase.js?v=20261128080337";
import { t } from "../i18n.js?v=20261128080337";
import { esc } from "../util.js?v=20261128080337";
import { col, session } from "../data.js?v=20261128080337";
import { can, hasSpecial } from "../perms.js?v=20261128080337";
import { crudView, statusBadge, infoGrid, getOne, fmtMoney } from "../crud.js?v=20261128080337";
import { groupsTable } from "./groups.js?v=20261128080337";

const statuses = ["available", "paused", "archived"];

export const view = crudView({
  coll: "courses", title: "courses", addLabel: "add_course", codePrefix: "CRS", detail: "course",
  fields: async (existing) => [
    { name: "name", label: "course_name", required: true },
    { name: "nameEn", label: "course_name_en", ltr: true },
    { name: "category", label: "category" },
    { name: "price", label: "default_price", type: "number", min: 0, required: true, disabled: !!existing && !hasSpecial(session(), "changePrice"), hint: existing && !hasSpecial(session(), "changePrice") ? "price_locked" : null },
    { name: "durationHours", label: "duration_hours", type: "number", min: 0 },
    { name: "sessionsCount", label: "sessions_count", type: "number", min: 0 },
    { name: "status", label: "status", type: "select", default: "available", options: statuses.map((s) => ({ value: s, label: t("st_" + s) })) },
    { name: "description", label: "description", type: "textarea", col: "col-12" }
  ],
  columns: [
    { key: "code", label: "code", render: (x) => `<span class="badge text-bg-light font-monospace">${esc(x.code)}</span>` },
    { key: "name", label: "course_name", render: (x) => `<span class="fw-semibold">${esc(x.name)}</span>` },
    { key: "category", label: "category" },
    { key: "price", label: "default_price", render: (x) => fmtMoney(x.price) },
    { key: "status", label: "status", render: (x) => statusBadge(x.status) }
  ]
});

export const render = (root) => view.render(root);

export async function renderDetail(root, id) {
  const S = session();
  const c = await getOne("courses", id);
  if (!c || c.deleted) { root.innerHTML = `<div class="alert alert-warning">${t("not_found")}</div>`; return; }
  root.innerHTML = `
    <a href="#courses" class="small text-decoration-none"><i class="bi bi-arrow-right"></i> ${t("courses")}</a>
    <div class="d-flex flex-wrap align-items-center gap-2 my-3">
      <span class="badge text-bg-dark font-monospace fs-6">${esc(c.code)}</span>
      <h1 class="h4 fw-bold mb-0">${esc(c.name)}</h1> ${statusBadge(c.status)}
      ${can(S, "courses", "edit") ? `<button id="editBtn" class="btn btn-sm btn-outline-secondary ms-auto"><i class="bi bi-pencil-square"></i> ${t("edit")}</button>` : ""}
    </div>
    <div class="row g-3">
      <div class="col-lg-5"><div class="card card-soft p-4 h-100">
        <h2 class="h6 fw-bold mb-3">${t("course_info")}</h2>
        ${infoGrid([["course_name_en", esc(c.nameEn)], ["category", esc(c.category)], ["default_price", fmtMoney(c.price)],
          ["duration_hours", esc(c.durationHours)], ["sessions_count", esc(c.sessionsCount)], ["description", esc(c.description)]])}
      </div></div>
      <div class="col-lg-7"><div class="card card-soft p-4 h-100">
        <h2 class="h6 fw-bold mb-3">${t("instructors_taught")}</h2><div id="instList" class="text-muted small">...</div>
      </div></div>
      <div class="col-12"><div class="card card-soft p-4">
        <div class="d-flex align-items-center mb-3"><h2 class="h6 fw-bold mb-0">${t("groups")}</h2>
        ${can(S, "groups", "add") ? `<a href="#groups" class="btn btn-sm btn-brand ms-auto"><i class="bi bi-plus-lg"></i> ${t("add_group")}</a>` : ""}</div>
        <div id="groupsBox"></div>
      </div></div>
      <div class="col-12"><div class="card card-soft p-4">
        <h2 class="h6 fw-bold mb-3">${t("course_students")}</h2><div id="stuBox"></div>
      </div></div>
      <div class="col-12"><div class="card card-soft p-4" id="contentBox"></div></div>
    </div>`;
  import("../ops.js?v=20261128080337").then((m) => m.contentSection(root.querySelector("#contentBox"), { courseId: c.id, courseName: c.name }));
  if (root.querySelector("#editBtn")) root.querySelector("#editBtn").addEventListener("click", () => view.openForm(c, () => renderDetail(root, id)));
  import("../enroll.js?v=20261128080337").then((m) => m.enrolledStudents(root.querySelector("#stuBox"), "courseId", id));
  if (!can(S, "groups", "view")) { root.querySelector("#groupsBox").innerHTML = `<p class="text-muted small">${t("no_permission")}</p>`; root.querySelector("#instList").textContent = t("no_permission"); return; }
  const snap = await fs.getDocs(fs.query(col("groups"), fs.where("courseId", "==", id)));
  const groups = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((g) => !g.deleted);
  root.querySelector("#groupsBox").innerHTML = groupsTable(groups, false);
  const names = {};
  groups.forEach((g) => (g.instructorIds || []).forEach((iid, i) => { names[iid] = (g.instructorNames || [])[i] || iid; }));
  root.querySelector("#instList").innerHTML = Object.keys(names).length
    ? Object.entries(names).map(([iid, n]) => `<a href="#instructor/${iid}" class="badge text-bg-light text-decoration-none fs-6 fw-normal me-1 mb-1">${esc(n)}</a>`).join("")
    : t("no_data");
}
