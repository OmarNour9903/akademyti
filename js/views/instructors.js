import { fs } from "../firebase.js?v=20261128080223";
import { t } from "../i18n.js?v=20261128080223";
import { esc, toast } from "../util.js?v=20261128080223";
import { col, session } from "../data.js?v=20261128080223";
import { can, hasSpecial } from "../perms.js?v=20261128080223";
import { crudView, statusBadge, infoGrid, getOne, fmtMoney } from "../crud.js?v=20261128080223";
import { createLogin, sendReset, passwordField } from "../accounts.js?v=20261128080223";
import { groupsTable } from "./groups.js?v=20261128080223";

const statuses = ["active", "suspended", "archived"];
const payTypes = ["salary", "percentage", "perStudent", "hourly"];
const payText = (x) => {
  if (!x.payType) return "-";
  const amt = x.payType === "percentage" ? `${x.payAmount ?? 0}%` : fmtMoney(x.payAmount);
  return `${t("pay_" + x.payType)} — ${amt}`;
};

export const view = crudView({
  coll: "instructors", title: "instructors", addLabel: "add_instructor", codePrefix: "INS", detail: "instructor",
  fields: async (existing) => [
    { name: "name", label: "full_name", required: true },
    { name: "specialty", label: "specialty" },
    { name: "phone", label: "phone", type: "tel", ltr: true, required: true },
    { name: "email", label: "email", type: "email", ltr: true, disabled: !!(existing && existing.uid) },
    { name: "qualifications", label: "qualifications" },
    { name: "status", label: "status", type: "select", default: "active", options: statuses.map((s) => ({ value: s, label: t("st_" + s) })) },
    { name: "payType", label: "pay_type", type: "select", empty: true, options: payTypes.map((p) => ({ value: p, label: t("pay_" + p) })) },
    { name: "payAmount", label: "pay_amount", type: "number", min: 0, hint: "pay_amount_hint" },
    ...(existing ? [] : [passwordField]),
    { name: "bio", label: "bio", type: "textarea", col: "col-12" }
  ],
  beforeCreate: async (data, form, id) => {
    const pass = form.elements.password ? form.elements.password.value : "";
    if (!pass) return {};
    return { uid: await createLogin("instructor", id, data.name, data.email, pass) };
  },
  columns: [
    { key: "code", label: "code", render: (x) => `<span class="badge text-bg-light font-monospace">${esc(x.code)}</span>` },
    { key: "name", label: "full_name", render: (x) => `<span class="fw-semibold">${esc(x.name)}</span>` },
    { key: "specialty", label: "specialty" },
    { key: "phone", label: "phone", render: (x) => `<span dir="ltr">${esc(x.phone || "-")}</span>` },
    { key: "status", label: "status", render: (x) => statusBadge(x.status) }
  ]
});

export const render = (root) => view.render(root);

export async function renderDetail(root, id) {
  const S = session();
  const x = await getOne("instructors", id);
  if (!x || x.deleted) { root.innerHTML = `<div class="alert alert-warning">${t("not_found")}</div>`; return; }
  const accountBox = x.uid
    ? `<span class="badge text-bg-success">${t("has_portal")}</span> ${hasSpecial(S, "resetPassword") && x.email ? `<button id="resetBtn" class="btn btn-sm btn-outline-primary ms-2">${t("send_reset")}</button>` : ""}`
    : `<span class="badge text-bg-light">${t("no_portal")}</span> ${can(S, "instructors", "add") ? `<button id="loginBtn" class="btn btn-sm btn-outline-primary ms-2">${t("create_portal")}</button>` : ""}`;
  root.innerHTML = `
    <a href="#instructors" class="small text-decoration-none"><i class="bi bi-arrow-right"></i> ${t("instructors")}</a>
    <div class="d-flex flex-wrap align-items-center gap-2 my-3">
      <span class="badge text-bg-dark font-monospace fs-6">${esc(x.code)}</span>
      <h1 class="h4 fw-bold mb-0">${esc(x.name)}</h1> ${statusBadge(x.status)}
      ${can(S, "instructors", "edit") ? `<button id="editBtn" class="btn btn-sm btn-outline-secondary ms-auto"><i class="bi bi-pencil-square"></i> ${t("edit")}</button>` : ""}
    </div>
    <div class="row g-3">
      <div class="col-lg-6"><div class="card card-soft p-4 h-100">
        ${infoGrid([["specialty", esc(x.specialty)], ["phone", `<span dir="ltr">${esc(x.phone)}</span>`], ["email", `<span dir="ltr">${esc(x.email)}</span>`],
          ["qualifications", esc(x.qualifications)], ["pay_type", payText(x)], ["portal_account", accountBox]])}
      </div></div>
      <div class="col-lg-6"><div class="card card-soft p-4 h-100">
        <h2 class="h6 fw-bold mb-2">${t("bio")}</h2><p class="pre-line mb-0">${esc(x.bio || "-")}</p>
      </div></div>
      <div class="col-12"><div class="card card-soft p-4">
        <h2 class="h6 fw-bold mb-3">${t("groups_taught")}</h2><div id="groupsBox" class="text-muted small">...</div>
      </div></div>
      <div class="col-12"><div class="card card-soft p-4">
        <h2 class="h6 fw-bold mb-3">${t("sessions_taught")}</h2><div id="sesBox" class="small text-muted">...</div>
      </div></div>
      <div class="col-12"><div class="card card-soft p-4">
        <h2 class="h6 fw-bold mb-3">${t("instructor_dues")}</h2><div id="duesBox" class="small text-muted">...</div>
      </div></div>
    </div>`;
  const reload = () => renderDetail(root, id);
  root.querySelector("#editBtn")?.addEventListener("click", () => view.openForm(x, reload));
  root.querySelector("#resetBtn")?.addEventListener("click", async () => { await sendReset(x.email); toast(t("reset_sent_to") + " " + x.email); });
  root.querySelector("#loginBtn")?.addEventListener("click", () => import("./portal-account.js?v=20261128080223").then((m) => m.openCreateLogin("instructors", "instructor", x, reload)));
  if (!can(S, "groups", "view")) { root.querySelector("#groupsBox").textContent = t("no_permission"); root.querySelector("#duesBox").textContent = t("no_permission"); return; }
  const snap = await fs.getDocs(fs.query(col("groups"), fs.where("instructorIds", "array-contains", id)));
  const groups = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((g) => !g.deleted);
  root.querySelector("#groupsBox").innerHTML = groupsTable(groups);
  const ops = await import("../ops.js?v=20261128080223");
  const sessions = await ops.instructorSessions(root.querySelector("#sesBox"), id);
  import("../dues.js?v=20261128080223").then((m) => m.instructorDues(root.querySelector("#duesBox"), x, groups, sessions)).catch((e) => console.error(e));
}
