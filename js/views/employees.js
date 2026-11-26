import { db, fs, createAccount } from "../firebase.js?v=20261126231907";
import { t } from "../i18n.js?v=20261126231907";
import { esc, toast, openModal, confirmBox, UserError } from "../util.js?v=20261126231907";
import { col, ref, userRef, audit, listActive, nextEntityCode, softDelete, session } from "../data.js?v=20261126231907";
import { MODULES, SPECIAL, ACTIONS, label, moduleActions, effective } from "../perms.js?v=20261126231907";

let depts = [];

export async function render(root) {
  root.innerHTML = `
    <div class="d-flex align-items-center mb-4">
      <h1 class="h4 fw-bold mb-0">${t("employees")}</h1>
      <button id="addEmp" class="btn btn-brand ms-auto"><i class="bi bi-person-plus"></i> ${t("add_employee")}</button>
    </div>
    <div class="card card-soft"><div class="table-responsive">
      <table class="table align-middle mb-0">
        <thead><tr><th>${t("code")}</th><th>${t("name")}</th><th>${t("department")}</th><th>${t("email")}</th><th>${t("phone")}</th><th>${t("status")}</th><th></th></tr></thead>
        <tbody id="empRows"><tr><td colspan="7" class="text-center text-muted py-4">...</td></tr></tbody>
      </table>
    </div></div>`;
  const reload = () => render(root);
  root.querySelector("#addEmp").addEventListener("click", async () => {
    if (!depts.length) { toast(t("need_department_first"), "warning"); return; }
    openCreate(reload);
  });
  await loadRows(root, reload);
}

async function loadRows(root, reload) {
  const [d, emps] = await Promise.all([listActive("departments"), listActive("employees")]);
  depts = d;
  emps.sort((a, b) => (a.code || "").localeCompare(b.code || ""));
  const body = root.querySelector("#empRows");
  if (!emps.length) { body.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">${t("no_data")}</td></tr>`; return; }
  const deptName = (id) => (depts.find((x) => x.id === id) || {}).name || "-";
  body.innerHTML = emps.map((e) => `<tr>
      <td><span class="badge text-bg-light font-monospace">${esc(e.code)}</span></td>
      <td class="fw-semibold">${esc(e.name)}</td>
      <td>${esc(deptName(e.departmentId))}</td>
      <td class="small">${esc(e.email)}</td>
      <td class="small">${esc(e.phone || "-")}</td>
      <td><span class="badge ${e.status === "active" ? "text-bg-success" : "text-bg-secondary"}">${t(e.status === "active" ? "st_active" : "st_suspended")}</span></td>
      <td class="text-end text-nowrap">
        <button class="btn btn-sm btn-outline-primary" data-perm="${e.id}" title="${t("permissions")}"><i class="bi bi-shield-lock"></i></button>
        <button class="btn btn-sm btn-outline-secondary" data-edit="${e.id}" title="${t("edit")}"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-warning" data-toggle="${e.id}" title="${t(e.status === "active" ? "suspend" : "activate")}"><i class="bi ${e.status === "active" ? "bi-pause-circle" : "bi-play-circle"}"></i></button>
        <button class="btn btn-sm btn-outline-danger" data-del="${e.id}" title="${t("delete")}"><i class="bi bi-trash"></i></button>
      </td></tr>`).join("");
  const find = (id) => emps.find((e) => e.id === id);
  body.querySelectorAll("[data-perm]").forEach((b) => b.addEventListener("click", () => openPerms(find(b.dataset.perm), reload)));
  body.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openEdit(find(b.dataset.edit), reload)));
  body.querySelectorAll("[data-toggle]").forEach((b) => b.addEventListener("click", () => toggleStatus(find(b.dataset.toggle), reload)));
  body.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    const e = find(b.dataset.del);
    if (!(await confirmBox(`${t("confirm_delete")} "${e.name}"؟ ${t("delete_emp_note")}`))) return;
    await fs.updateDoc(userRef(e.uid), { status: "disabled" });
    await softDelete("employees", e.id, `${e.code} ${e.name}`);
    toast(t("moved_to_trash"));
    reload();
  }));
}

const deptOptions = (sel) => depts.map((d) => `<option value="${d.id}" ${d.id === sel ? "selected" : ""}>${esc(d.name)}</option>`).join("");

function openCreate(done) {
  const html = `<div class="row g-3">
    <div class="col-md-6"><label class="form-label">${t("name")}</label><input name="name" class="form-control" required></div>
    <div class="col-md-6"><label class="form-label">${t("phone")}</label><input name="phone" class="form-control" dir="ltr"></div>
    <div class="col-md-6"><label class="form-label">${t("email")}</label><input name="email" type="email" class="form-control" dir="ltr" required></div>
    <div class="col-md-6"><label class="form-label">${t("initial_password")}</label><input name="password" class="form-control" dir="ltr" minlength="6" autocomplete="off" required></div>
    <div class="col-12"><label class="form-label">${t("department")}</label><select name="departmentId" class="form-select" required>${deptOptions()}</select></div>
    <div class="col-12"><p class="text-muted small mb-0">${t("emp_password_note")}</p></div></div>`;
  openModal(t("add_employee"), html, async (form) => {
    const name = form.name.value.trim();
    const email = form.email.value.trim().toLowerCase();
    const password = form.password.value;
    const departmentId = form.departmentId.value;
    if (!name || !email || password.length < 6 || !departmentId) throw new UserError("required");
    let uid;
    try { uid = await createAccount(email, password); } catch (e) {
      if (e.code === "auth/email-already-in-use") throw new UserError("err_email_used");
      if (e.code === "auth/invalid-email") throw new UserError("err_invalid_email");
      throw e;
    }
    const code = await nextEntityCode("employees");
    const S = session();
    const dept = depts.find((d) => d.id === departmentId);
    const eff = effective(dept);
    const empRef = fs.doc(col("employees"));
    const emp = { code, name, email, phone: form.phone.value.trim(), departmentId, uid, status: "active", overrides: {}, specialOverrides: {}, deleted: false, createdAt: fs.serverTimestamp() };
    const batch = fs.writeBatch(db);
    batch.set(empRef, emp);
    batch.set(userRef(uid), { tenantId: S.tenant.id, type: "employee", refId: empRef.id, name, email, status: "active", ...eff, createdAt: fs.serverTimestamp() });
    await batch.commit();
    await audit("create", "employees", empRef.id, `${code} ${name}`, null, { code, name, email, departmentId });
    toast(`${t("saved")} — ${code}`);
    done();
  });
}

function openEdit(e, done) {
  const html = `<div class="row g-3">
    <div class="col-md-6"><label class="form-label">${t("name")}</label><input name="name" class="form-control" required value="${esc(e.name)}"></div>
    <div class="col-md-6"><label class="form-label">${t("phone")}</label><input name="phone" class="form-control" dir="ltr" value="${esc(e.phone || "")}"></div>
    <div class="col-md-6"><label class="form-label">${t("email")}</label><input class="form-control" dir="ltr" value="${esc(e.email)}" disabled></div>
    <div class="col-md-6"><label class="form-label">${t("department")}</label><select name="departmentId" class="form-select">${deptOptions(e.departmentId)}</select></div></div>`;
  openModal(`${t("edit")} — ${e.code}`, html, async (form) => {
    const name = form.name.value.trim();
    if (!name) throw new UserError("required");
    const upd = { name, phone: form.phone.value.trim(), departmentId: form.departmentId.value };
    const dept = depts.find((d) => d.id === upd.departmentId);
    const batch = fs.writeBatch(db);
    batch.update(ref("employees", e.id), { ...upd, updatedAt: fs.serverTimestamp() });
    batch.update(userRef(e.uid), { name, ...effective(dept, e.overrides || {}, e.specialOverrides || {}) });
    await batch.commit();
    await audit("update", "employees", e.id, `${e.code} ${name}`, { name: e.name, phone: e.phone, departmentId: e.departmentId }, upd);
    toast(t("saved"));
    done();
  });
}

function cellSelect(name, current, inherited) {
  const base = inherited ? "✓" : "✗";
  return `<select class="form-select form-select-sm perm-select" name="${name}">
    <option value="" ${!current ? "selected" : ""}>${t("inherit")} (${base})</option>
    <option value="allow" ${current === "allow" ? "selected" : ""}>${t("allow")}</option>
    <option value="deny" ${current === "deny" ? "selected" : ""}>${t("deny")}</option></select>`;
}

function openPerms(e, done) {
  const dept = depts.find((d) => d.id === e.departmentId) || {};
  const ov = e.overrides || {}; const sov = e.specialOverrides || {};
  const inh = (m, a) => ((dept.perms || {})[m] || []).includes(a);
  const rows = MODULES.map((m) => `<tr><td class="text-nowrap">${esc(label(m))}</td>${ACTIONS.map((a) => `<td>${
    moduleActions(m).includes(a) ? cellSelect(`p:${m.key}:${a}`, (ov[m.key] || {})[a], inh(m.key, a)) : "<span class=\"text-muted\">—</span>"
  }</td>`).join("")}</tr>`).join("");
  const special = SPECIAL.map((s) => `<tr><td>${esc(label(s))}</td><td>${cellSelect(`s:${s.key}`, sov[s.key], (dept.special || []).includes(s.key))}</td></tr>`).join("");
  const html = `<p class="text-muted small">${t("emp_perms_hint")} <b>${esc(dept.name || "-")}</b></p>
    <div class="table-responsive"><table class="table table-sm align-middle perm-table">
      <thead><tr><th></th>${ACTIONS.map((a) => `<th>${t("act_" + a)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>
    <h6 class="fw-bold mt-3">${t("special_perms")}</h6>
    <table class="table table-sm align-middle perm-table"><tbody>${special}</tbody></table>`;
  openModal(`${t("permissions")} — ${e.code} ${e.name}`, html, async (form) => {
    const overrides = {}; const specialOverrides = {};
    for (const sel of form.querySelectorAll("select.perm-select")) {
      if (!sel.value) continue;
      const [kind, k, a] = sel.name.split(":");
      if (kind === "p") (overrides[k] = overrides[k] || {})[a] = sel.value;
      else specialOverrides[k] = sel.value;
    }
    const eff = effective(dept, overrides, specialOverrides);
    const batch = fs.writeBatch(db);
    batch.update(ref("employees", e.id), { overrides, specialOverrides, updatedAt: fs.serverTimestamp() });
    batch.update(userRef(e.uid), eff);
    await batch.commit();
    await audit("permissions", "employees", e.id, `${e.code} ${e.name}`, { overrides: e.overrides, specialOverrides: e.specialOverrides }, { overrides, specialOverrides });
    toast(t("saved"));
    done();
  }, { size: "xl" });
}

async function toggleStatus(e, done) {
  const status = e.status === "active" ? "suspended" : "active";
  if (status === "suspended" && !(await confirmBox(`${t("suspend")} "${e.name}"؟ ${t("suspend_note")}`, { label: t("suspend") }))) return;
  const batch = fs.writeBatch(db);
  batch.update(ref("employees", e.id), { status });
  batch.update(userRef(e.uid), { status });
  await batch.commit();
  await audit(status === "active" ? "activate" : "suspend", "employees", e.id, `${e.code} ${e.name}`);
  toast(t("saved"));
  done();
}
