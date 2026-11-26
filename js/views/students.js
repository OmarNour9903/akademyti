import { t } from "../i18n.js?v=20261126224220";
import { esc, toast } from "../util.js?v=20261126224220";
import { session } from "../data.js?v=20261126224220";
import { can, hasSpecial } from "../perms.js?v=20261126224220";
import { crudView, statusBadge, infoGrid, getOne } from "../crud.js?v=20261126224220";
import { createLogin, sendReset, passwordField } from "../accounts.js?v=20261126224220";

const statuses = ["active", "suspended", "archived"];

function age(birth) {
  if (!birth) return "";
  const b = new Date(birth); const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--;
  return a >= 0 ? `${a} ${t("years")}` : "";
}

export const view = crudView({
  coll: "students", title: "students", addLabel: "add_student", codePrefix: "STD", codePad: 5, detail: "student",
  fields: async (existing) => [
    { name: "name", label: "full_name", required: true },
    { name: "phone", label: "phone", type: "tel", ltr: true, required: true },
    { name: "email", label: "email", type: "email", ltr: true, disabled: !!(existing && existing.uid) },
    { name: "birthDate", label: "birth_date", type: "date" },
    { name: "university", label: "university" },
    { name: "faculty", label: "faculty" },
    { name: "year", label: "study_year" },
    { name: "address", label: "address" },
    { name: "status", label: "status", type: "select", default: "active", options: statuses.map((s) => ({ value: s, label: t("st_" + s) })) },
    ...(existing ? [] : [passwordField]),
    { name: "notes", label: "notes", type: "textarea", col: "col-12" }
  ],
  beforeCreate: async (data, form, id) => {
    const pass = form.elements.password ? form.elements.password.value : "";
    if (!pass) return {};
    const uid = await createLogin("student", id, data.name, data.email, pass);
    return { uid };
  },
  columns: [
    { key: "code", label: "code", render: (x) => `<span class="badge text-bg-light font-monospace">${esc(x.code)}</span>` },
    { key: "name", label: "full_name", render: (x) => `<span class="fw-semibold">${esc(x.name)}</span>` },
    { key: "phone", label: "phone", render: (x) => `<span dir="ltr">${esc(x.phone || "-")}</span>` },
    { key: "faculty", label: "faculty" },
    { key: "status", label: "status", render: (x) => statusBadge(x.status) }
  ]
});

export const render = (root) => view.render(root);

export async function renderDetail(root, id) {
  const S = session();
  const s = await getOne("students", id);
  if (!s || s.deleted) { root.innerHTML = `<div class="alert alert-warning">${t("not_found")}</div>`; return; }
  const soon = (title) => `<div class="col-md-6"><div class="card card-soft p-4 h-100"><h2 class="h6 fw-bold mb-2">${t(title)}</h2><p class="text-muted small mb-0">${t("after_finance_phase")}</p></div></div>`;
  const accountBox = s.uid
    ? `<span class="badge text-bg-success">${t("has_portal")}</span> ${hasSpecial(S, "resetPassword") && s.email ? `<button id="resetBtn" class="btn btn-sm btn-outline-primary ms-2">${t("send_reset")}</button>` : ""}`
    : `<span class="badge text-bg-light">${t("no_portal")}</span> ${can(S, "students", "add") ? `<button id="loginBtn" class="btn btn-sm btn-outline-primary ms-2">${t("create_portal")}</button>` : ""}`;
  root.innerHTML = `
    <a href="#students" class="small text-decoration-none"><i class="bi bi-arrow-right"></i> ${t("students")}</a>
    <div class="d-flex flex-wrap align-items-center gap-2 my-3">
      <span class="badge text-bg-dark font-monospace fs-6">${esc(s.code)}</span>
      <h1 class="h4 fw-bold mb-0">${esc(s.name)}</h1> ${statusBadge(s.status)}
      ${can(S, "students", "edit") ? `<button id="editBtn" class="btn btn-sm btn-outline-secondary ms-auto"><i class="bi bi-pencil"></i> ${t("edit")}</button>` : ""}
    </div>
    <div class="row g-3">
      <div class="col-12"><div class="card card-soft p-4">
        <div class="row">
          <div class="col-lg-6">${infoGrid([["phone", `<span dir="ltr">${esc(s.phone)}</span>`], ["email", `<span dir="ltr">${esc(s.email)}</span>`], ["birth_date", s.birthDate ? `<span dir="ltr">${esc(s.birthDate)}</span> (${age(s.birthDate)})` : ""], ["address", esc(s.address)]])}</div>
          <div class="col-lg-6">${infoGrid([["university", esc(s.university)], ["faculty", esc(s.faculty)], ["study_year", esc(s.year)], ["portal_account", accountBox]])}</div>
        </div>
        ${s.notes ? `<hr><h2 class="h6 fw-bold">${t("notes")}</h2><p class="mb-0 pre-line">${esc(s.notes)}</p>` : ""}
      </div></div>
      ${soon("student_courses")}${soon("payments_history")}${soon("attendance_evaluation")}${soon("discipline_log")}
    </div>`;
  const reload = () => renderDetail(root, id);
  root.querySelector("#editBtn")?.addEventListener("click", () => view.openForm(s, reload));
  root.querySelector("#resetBtn")?.addEventListener("click", async () => { await sendReset(s.email); toast(t("reset_sent_to") + " " + s.email); });
  root.querySelector("#loginBtn")?.addEventListener("click", () => import("./portal-account.js?v=20261126224220").then((m) => m.openCreateLogin("students", "student", s, reload)));
}
