import { fs } from "../firebase.js?v=20261126234443";
import { t } from "../i18n.js?v=20261126234443";
import { esc, UserError } from "../util.js?v=20261126234443";
import { col, session, nextNumber, codeFormat } from "../data.js?v=20261126234443";
import { can, hasSpecial } from "../perms.js?v=20261126234443";
import { crudView, statusBadge, infoGrid, getOne, fmtMoney } from "../crud.js?v=20261126234443";

const statuses = ["open", "running", "finished", "cancelled", "archived"];
let cache = { courses: [], instructors: [] };

async function loadRefs() {
  const [c, i] = await Promise.all([fs.getDocs(col("courses")), can(session(), "instructors", "view") ? fs.getDocs(col("instructors")) : Promise.resolve({ docs: [] })]);
  cache.courses = c.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => !x.deleted && x.status !== "archived");
  cache.instructors = i.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => !x.deleted && x.status !== "archived");
}

const seats = (g) => Math.max(0, (Number(g.capacity) || 0) - (Number(g.enrolledCount) || 0));

export function groupsTable(groups, withCourse = true) {
  if (!groups.length) return `<p class="text-muted small mb-0">${t("no_data")}</p>`;
  return `<div class="table-responsive"><table class="table table-sm table-hover align-middle mb-0">
    <thead><tr><th>${t("code")}</th>${withCourse ? `<th>${t("course")}</th>` : ""}<th>${t("start_date")}</th><th>${t("mode")}</th><th>${t("instructors")}</th><th>${t("seats")}</th><th>${t("status")}</th></tr></thead>
    <tbody>${groups.map((g) => `<tr class="row-link" onclick="location.hash='#group/${g.id}'">
      <td><span class="badge text-bg-light font-monospace">${esc(g.code)}</span></td>
      ${withCourse ? `<td>${esc(g.courseName)}</td>` : ""}
      <td dir="ltr" class="text-end">${esc(g.startDate || "-")}</td>
      <td>${t("mode_" + (g.mode || "offline"))}</td>
      <td class="small">${esc((g.instructorNames || []).join("، ") || "-")}</td>
      <td><span class="${seats(g) ? "text-success" : "text-danger"} fw-semibold">${seats(g)}</span> / ${esc(g.capacity)}</td>
      <td>${statusBadge(g.status)}</td></tr>`).join("")}</tbody></table></div>`;
}

export const view = crudView({
  coll: "groups", title: "groups", addLabel: "add_group", detail: "group",
  makeCode: async (data) => {
    const course = cache.courses.find((c) => c.id === data.courseId);
    const n = await nextNumber(`groups_${data.courseId}`);
    const f = await codeFormat("groups");
    return `${course.code}${f.sep}${f.prefix}${String(n).padStart(Number(f.digits) || 1, "0")}`;
  },
  fields: async (existing) => {
    await loadRefs();
    const lockPrice = !hasSpecial(session(), "changePrice");
    return [
      { name: "courseId", label: "course", type: "select", required: true, disabled: !!existing, options: cache.courses.map((c) => ({ value: c.id, label: `${c.code} — ${c.name}` })) },
      { name: "status", label: "status", type: "select", default: "open", options: statuses.map((s) => ({ value: s, label: t("st_" + s) })) },
      { name: "startDate", label: "start_date", type: "date" },
      { name: "endDate", label: "end_date", type: "date" },
      { name: "schedule", label: "schedule", col: "col-12", hint: "schedule_hint" },
      { name: "mode", label: "mode", type: "select", default: "offline", options: ["offline", "online"].map((m) => ({ value: m, label: t("mode_" + m) })) },
      { name: "capacity", label: "capacity", type: "number", min: 1, required: true },
      { name: "location", label: "location" },
      { name: "link", label: "online_link", ltr: true },
      { name: "price", label: "group_price", type: "number", min: 0, disabled: lockPrice, hint: lockPrice ? "price_from_course" : "price_default_hint" },
      { name: "instructorIds", label: "instructors", type: "checks", col: "col-12", options: cache.instructors.map((i) => ({ value: i.id, label: `${i.code} — ${i.name}` })) }
    ];
  },
  prepare: async (data, existing) => {
    const courseId = existing ? existing.courseId : data.courseId;
    const course = cache.courses.find((c) => c.id === courseId) || {};
    if (!existing) {
      if (!course.id) throw new UserError("required");
      data.courseCode = course.code; data.courseName = course.name; data.enrolledCount = 0;
      if (data.price == null) data.price = Number(course.price) || 0;
    } else if (data.price == null && !("price" in data)) { /* السعر مقفول */ }
    if (data.capacity < 1) throw new UserError("err_capacity");
    if (data.instructorIds) data.instructorNames = data.instructorIds.map((iid) => (cache.instructors.find((i) => i.id === iid) || {}).name || "");
    data.name = data.courseName || existing?.courseName || "";
    return data;
  },
  columns: [
    { key: "code", label: "code", render: (x) => `<span class="badge text-bg-light font-monospace">${esc(x.code)}</span>` },
    { key: "courseName", label: "course" },
    { key: "startDate", label: "start_date", render: (x) => `<span dir="ltr">${esc(x.startDate || "-")}</span>` },
    { key: "mode", label: "mode", render: (x) => t("mode_" + (x.mode || "offline")) },
    { key: "instructorNames", label: "instructors", render: (x) => `<span class="small">${esc((x.instructorNames || []).join("، ") || "-")}</span>` },
    { key: "capacity", label: "seats", render: (x) => `<span class="${seats(x) ? "text-success" : "text-danger"} fw-semibold">${seats(x)}</span> / ${esc(x.capacity)}` },
    { key: "status", label: "status", render: (x) => statusBadge(x.status) }
  ]
});

export const render = (root) => view.render(root);

export async function renderDetail(root, id) {
  const S = session();
  const g = await getOne("groups", id);
  if (!g || g.deleted) { root.innerHTML = `<div class="alert alert-warning">${t("not_found")}</div>`; return; }
  root.innerHTML = `
    <a href="#course/${g.courseId}" class="small text-decoration-none"><i class="bi bi-arrow-right"></i> ${esc(g.courseName)}</a>
    <div class="d-flex flex-wrap align-items-center gap-2 my-3">
      <span class="badge text-bg-dark font-monospace fs-6">${esc(g.code)}</span>
      <h1 class="h4 fw-bold mb-0">${esc(g.courseName)}</h1> ${statusBadge(g.status)}
      ${can(S, "groups", "edit") ? `<button id="editBtn" class="btn btn-sm btn-outline-secondary ms-auto"><i class="bi bi-pencil-square"></i> ${t("edit")}</button>` : ""}
    </div>
    <div class="row g-3">
      <div class="col-lg-6"><div class="card card-soft p-4 h-100">
        ${infoGrid([["start_date", `<span dir="ltr">${esc(g.startDate)}</span>`], ["end_date", `<span dir="ltr">${esc(g.endDate)}</span>`], ["schedule", esc(g.schedule)],
          ["mode", t("mode_" + (g.mode || "offline"))], ["location", esc(g.location)], ["online_link", g.link ? `<a href="${esc(g.link)}" target="_blank" rel="noopener" dir="ltr">${esc(g.link)}</a>` : ""],
          ["group_price", fmtMoney(g.price)], ["seats", `${seats(g)} / ${esc(g.capacity)}`]])}
      </div></div>
      <div class="col-lg-6"><div class="card card-soft p-4 h-100">
        <h2 class="h6 fw-bold mb-3">${t("instructors")}</h2>
        ${(g.instructorIds || []).length ? g.instructorIds.map((iid, i) => `<a href="#instructor/${iid}" class="badge text-bg-light text-decoration-none fs-6 fw-normal me-1 mb-1">${esc((g.instructorNames || [])[i] || iid)}</a>`).join("") : `<span class="text-muted small">${t("no_data")}</span>`}
      </div></div>
      <div class="col-12"><div class="card card-soft p-4"><h2 class="h6 fw-bold mb-3">${t("group_students")}</h2><div id="stuBox"></div></div></div>
    </div>`;
  import("../enroll.js?v=20261126234443").then((m) => m.enrolledStudents(root.querySelector("#stuBox"), "groupId", id));
  if (root.querySelector("#editBtn")) root.querySelector("#editBtn").addEventListener("click", () => view.openForm(g, () => renderDetail(root, id)));
}
