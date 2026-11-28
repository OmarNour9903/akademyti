// "عين" المدير: يشوف السيستم بصلاحيات قسم أو موظف معيّن (معاينة للقراءة بس)
import { t } from "./i18n.js?v=20261128080337";
import { esc, openModal } from "./util.js?v=20261128080337";
import { listActive } from "./data.js?v=20261128080337";
import { effective } from "./perms.js?v=20261128080337";

const KEY = "viewAs";

export function getPreview() {
  try { return JSON.parse(sessionStorage.getItem(KEY) || "null"); } catch (e) { return null; }
}

export function exitPreview() {
  try { sessionStorage.removeItem(KEY); } catch (e) { /* ignore */ }
  location.reload();
}

// يطبّق المعاينة على الجلسة (المدير بس)
export function applyPreview(session) {
  const p = getPreview();
  if (!p || session.role !== "admin" || p.tenantId !== session.tenant.id) return null;
  session.realRole = "admin";
  session.role = "employee";
  session.preview = p;
  session.profile = { ...session.profile, perms: p.perms, special: p.special };
  return p;
}

export async function openPicker(session) {
  const [depts, emps] = await Promise.all([listActive("departments"), listActive("employees")]);
  const opts = [
    ...depts.map((d) => `<option value="d:${d.id}">${t("department")}: ${esc(d.name)}</option>`),
    ...emps.map((e) => `<option value="e:${e.id}">${t("employee")}: ${esc(e.code)} — ${esc(e.name)}</option>`)
  ].join("");
  const html = `<p class="text-muted small">${t("view_as_hint")}</p>
    <select name="target" class="form-select" required>${opts || `<option value="">${t("no_data")}</option>`}</select>`;
  openModal(t("view_as"), html, async (form) => {
    const [kind, id] = form.target.value.split(":");
    if (!id) return false;
    let p;
    if (kind === "d") {
      const d = depts.find((x) => x.id === id);
      p = { kind, id, name: d.name, ...effective(d) };
    } else {
      const e = emps.find((x) => x.id === id);
      const d = depts.find((x) => x.id === e.departmentId);
      p = { kind, id, uid: e.uid || "", name: `${e.code} ${e.name}`, ...effective(d, e.overrides || {}, e.specialOverrides || {}) };
    }
    p.tenantId = session.tenant.id;
    try { sessionStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
    location.hash = "#dashboard";
    location.reload();
  }, { submitLabel: t("view_as_go"), size: "md", allowInPreview: true });
}
