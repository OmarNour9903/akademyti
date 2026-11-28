import { db, fs } from "../firebase.js?v=20261128083523";
import { t } from "../i18n.js?v=20261128083523";
import { esc, toast, openModal, confirmBox, UserError } from "../util.js?v=20261128083523";
import { col, ref, userRef, audit, listActive, softDelete } from "../data.js?v=20261128083523";
import { MODULES, SPECIAL, ACTIONS, label, moduleActions, effective } from "../perms.js?v=20261128083523";

export async function render(root) {
  root.innerHTML = `
    <div class="d-flex align-items-center mb-4">
      <h1 class="h4 fw-bold mb-0">${t("departments")}</h1>
      <button id="addDept" class="btn btn-brand ms-auto"><i class="bi bi-plus-lg"></i> ${t("add_department")}</button>
    </div>
    <div class="card card-soft"><div class="table-responsive">
      <table class="table align-middle mb-0">
        <thead><tr><th>${t("dept_name")}</th><th>${t("employees_count")}</th><th>${t("permissions")}</th><th></th></tr></thead>
        <tbody id="deptRows"><tr><td colspan="4" class="text-center text-muted py-4">...</td></tr></tbody>
      </table>
    </div></div>`;
  root.querySelector("#addDept").addEventListener("click", () => openForm(null, () => render(root)));
  await loadRows(root);
}

async function loadRows(root) {
  const [depts, emps] = await Promise.all([listActive("departments"), listActive("employees")]);
  const body = root.querySelector("#deptRows");
  if (!depts.length) { body.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">${t("no_data")}</td></tr>`; return; }
  body.innerHTML = depts.map((d) => {
    const count = emps.filter((e) => e.departmentId === d.id).length;
    const nPerms = Object.values(d.perms || {}).reduce((s, a) => s + a.length, 0) + (d.special || []).length;
    return `<tr>
      <td class="fw-semibold">${esc(d.name)}</td>
      <td>${count}</td>
      <td><span class="badge text-bg-light">${nPerms}</span></td>
      <td class="text-end text-nowrap">
        <button class="btn btn-sm btn-outline-secondary" data-edit="${d.id}"><i class="bi bi-pencil-square"></i> ${t("edit")}</button>
        <button class="btn btn-sm btn-outline-danger" data-del="${d.id}"><i class="bi bi-trash3"></i></button>
      </td></tr>`;
  }).join("");
  body.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openForm(depts.find((d) => d.id === b.dataset.edit), () => render(root))));
  body.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    const d = depts.find((x) => x.id === b.dataset.del);
    if (emps.some((e) => e.departmentId === d.id)) { toast(t("dept_has_employees"), "warning"); return; }
    if (!(await confirmBox(`${t("confirm_delete")} "${d.name}"؟`))) return;
    await softDelete("departments", d.id, d.name);
    toast(t("moved_to_trash"));
    render(root);
  }));
}

function matrixHtml(dept) {
  const has = (m, a) => ((dept && dept.perms && dept.perms[m]) || []).includes(a);
  const rows = MODULES.map((m) => `<tr><td>${esc(label(m))}</td>${ACTIONS.map((a) => `<td class="text-center">${
    moduleActions(m).includes(a) ? `<input class="form-check-input" type="checkbox" name="p:${m.key}:${a}" ${has(m.key, a) ? "checked" : ""}>` : "<span class=\"text-muted\">—</span>"
  }</td>`).join("")}</tr>`).join("");
  const special = SPECIAL.map((s) => `<div class="col-md-6"><div class="form-check">
      <input class="form-check-input" type="checkbox" id="s_${s.key}" name="s:${s.key}" ${((dept && dept.special) || []).includes(s.key) ? "checked" : ""}>
      <label class="form-check-label" for="s_${s.key}">${esc(label(s))}</label></div></div>`).join("");
  return `<div class="table-responsive"><table class="table table-sm align-middle perm-table">
      <thead><tr><th></th>${ACTIONS.map((a) => `<th class="text-center">${t("act_" + a)}</th>`).join("")}</tr></thead>
      <tbody>${rows}</tbody></table></div>
    <h6 class="fw-bold mt-3">${t("special_perms")}</h6><div class="row g-2">${special}</div>`;
}

export function readMatrix(form) {
  const perms = {}; const special = [];
  for (const el of form.querySelectorAll("input[type=checkbox]")) {
    if (!el.checked) continue;
    const [kind, k, a] = el.name.split(":");
    if (kind === "p") (perms[k] = perms[k] || []).push(a);
    if (kind === "s") special.push(k);
  }
  return { perms, special };
}

function openForm(dept, done) {
  const html = `
    <div class="mb-3"><label class="form-label">${t("dept_name")}</label>
      <input name="name" class="form-control" required value="${esc(dept ? dept.name : "")}"></div>
    <h6 class="fw-bold">${t("permissions")}</h6>
    <p class="text-muted small">${t("perms_hint")}</p>
    ${matrixHtml(dept)}`;
  openModal(dept ? t("edit_department") : t("add_department"), html, async (form) => {
    const name = form.name.value.trim();
    if (!name) throw new UserError("required");
    const { perms, special } = readMatrix(form);
    const data = { name, perms, special };
    if (!dept) {
      const r = await fs.addDoc(col("departments"), { ...data, deleted: false, createdAt: fs.serverTimestamp() });
      await audit("create", "departments", r.id, name, null, data);
    } else {
      await fs.updateDoc(ref("departments", dept.id), { ...data, updatedAt: fs.serverTimestamp() });
      await syncEmployees(dept.id, data);
      await audit("update", "departments", dept.id, name, { name: dept.name, perms: dept.perms, special: dept.special }, data);
    }
    toast(t("saved"));
    done();
  });
}

// لما صلاحيات القسم تتغير، نحدّث الصلاحية النهائية لكل موظف فيه
export async function syncEmployees(deptId, dept) {
  const emps = await listActive("employees", fs.where("departmentId", "==", deptId));
  if (!emps.length) return;
  const batch = fs.writeBatch(db);
  for (const e of emps) {
    const eff = effective(dept, e.overrides || {}, e.specialOverrides || {});
    batch.update(userRef(e.uid), eff);
  }
  await batch.commit();
}
