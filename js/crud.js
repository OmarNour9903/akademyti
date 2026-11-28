// محرك عام لصفحات القوايم والفورمز (كورسات، طلاب، محاضرين، مجموعات)
import { db, fs } from "./firebase.js?v=20261128080337";
import { t } from "./i18n.js?v=20261128080337";
import { esc, toast, openModal, confirmBox, UserError } from "./util.js?v=20261128080337";
import { col, ref, audit, nextEntityCode, softDelete, session } from "./data.js?v=20261128080337";
import { can } from "./perms.js?v=20261128080337";

export const STATUS_BADGE = {
  active: "text-bg-success", available: "text-bg-success", open: "text-bg-success", running: "text-bg-primary",
  suspended: "text-bg-warning", paused: "text-bg-warning", finished: "text-bg-secondary", cancelled: "text-bg-danger", archived: "text-bg-dark"
};
export const statusBadge = (s) => `<span class="badge ${STATUS_BADGE[s] || "text-bg-light"}">${esc(t("st_" + s))}</span>`;

export function fieldHtml(f, value) {
  const v = value ?? f.default ?? "";
  const req = f.required ? "required" : "";
  const dir = f.ltr ? 'dir="ltr"' : "";
  const colCls = f.col || "col-md-6";
  const lab = `<label class="form-label">${t(f.label)}${f.required ? ' <span class="text-danger">*</span>' : ""}</label>`;
  let input;
  if (f.type === "textarea") input = `<textarea name="${f.name}" class="form-control" rows="3" ${req}>${esc(v)}</textarea>`;
  else if (f.type === "select") input = `<select name="${f.name}" class="form-select" ${req} ${f.disabled ? "disabled" : ""}>${
    (f.empty ? `<option value="">—</option>` : "") + f.options.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? "selected" : ""}>${esc(o.label)}</option>`).join("")}</select>`;
  else if (f.type === "checks") {
    const sel = Array.isArray(v) ? v : [];
    input = `<div class="checks-box">${f.options.length ? f.options.map((o) => `<div class="form-check">
      <input class="form-check-input" type="checkbox" name="${f.name}" value="${esc(o.value)}" id="${f.name}_${esc(o.value)}" ${sel.includes(o.value) ? "checked" : ""}>
      <label class="form-check-label" for="${f.name}_${esc(o.value)}">${esc(o.label)}</label></div>`).join("") : `<span class="text-muted small">${t("no_data")}</span>`}</div>`;
  } else input = `<input name="${f.name}" type="${f.type || "text"}" class="form-control" value="${esc(v)}" ${req} ${dir} ${f.disabled ? "disabled" : ""} ${f.min != null ? `min="${f.min}"` : ""} ${f.type === "number" ? 'step="any"' : ""} autocomplete="off">`;
  const hint = f.hint ? `<div class="form-text">${t(f.hint)}</div>` : "";
  return `<div class="${colCls}">${lab}${input}${hint}</div>`;
}

export function readFields(form, fields) {
  const out = {};
  for (const f of fields) {
    if (f.disabled || f.virtual) continue;
    if (f.type === "checks") { out[f.name] = [...form.querySelectorAll(`input[name="${f.name}"]:checked`)].map((x) => x.value); continue; }
    const el = form.elements[f.name];
    if (!el) continue;
    let v = el.value.trim();
    if (f.type === "number") v = v === "" ? null : Number(v);
    if (f.type === "email") v = v.toLowerCase();
    if (f.required && (v === "" || v == null)) throw new UserError("required");
    out[f.name] = v;
  }
  return out;
}

// cfg: { coll, title, icon, codeEntity, codePrefix, codePad, fields(existing)->[], columns:[{key,label,render}], detail, statuses, defaultStatus, prepare(data, existing, form), afterSave(id, data, existing, form), extraCreateFields }
export function crudView(cfg) {
  let showArchived = false;
  let query = "";

  async function render(root) {
    const S = session();
    const canAdd = can(S, cfg.coll, "add");
    root.innerHTML = `
      <div class="d-flex flex-wrap align-items-center gap-2 mb-4">
        <h1 class="h4 fw-bold mb-0">${t(cfg.title)}</h1>
        <div class="ms-auto d-flex gap-2 align-items-center">
          <input class="form-control form-control-sm list-filter" placeholder="${t("filter")}" value="${esc(query)}">
          <div class="form-check form-switch mb-0 text-nowrap"><input class="form-check-input" type="checkbox" id="arch" ${showArchived ? "checked" : ""}>
            <label class="form-check-label small" for="arch">${t("show_archived")}</label></div>
          ${canAdd ? `<button class="btn btn-brand btn-sm text-nowrap" id="addBtn"><i class="bi bi-plus-lg"></i> ${t(cfg.addLabel)}</button>` : ""}
        </div>
      </div>
      <div class="card card-soft"><div class="table-responsive"><table class="table table-hover align-middle mb-0">
        <thead><tr>${cfg.columns.map((c) => `<th>${t(c.label)}</th>`).join("")}<th></th></tr></thead>
        <tbody id="rows"><tr><td colspan="${cfg.columns.length + 1}" class="text-center text-muted py-4"><div class="spinner-border spinner-border-sm"></div></td></tr></tbody>
      </table></div></div>`;
    const reload = () => render(root);
    if (canAdd) root.querySelector("#addBtn").addEventListener("click", () => openForm(null, reload));
    root.querySelector("#arch").addEventListener("change", (e) => { showArchived = e.target.checked; reload(); });
    const snap = await fs.getDocs(fs.query(col(cfg.coll), ...(cfg.constraints || [])));
    let items = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => !x.deleted && (showArchived || x.status !== "archived"));
    const ts = (x) => (x.createdAt && x.createdAt.seconds) || 0;
    items.sort((a, b) => ts(b) - ts(a) || (b.code || "").localeCompare(a.code || ""));
    const filterInput = root.querySelector(".list-filter");
    const body = root.querySelector("#rows");
    const draw = () => {
      const q = query.toLowerCase();
      const list = q ? items.filter((x) => [x.code, x.name, x.phone, x.email, x.courseName].some((v) => String(v || "").toLowerCase().includes(q))) : items;
      if (!list.length) { body.innerHTML = `<tr><td colspan="${cfg.columns.length + 1}" class="text-center text-muted py-4">${t("no_data")}</td></tr>`; return; }
      body.innerHTML = list.map((x) => `<tr class="${cfg.detail ? "row-link" : ""}" data-id="${x.id}">
        ${cfg.columns.map((c) => `<td>${c.render ? c.render(x) : esc(x[c.key] ?? "-")}</td>`).join("")}
        <td class="text-end text-nowrap">
          ${can(S, cfg.coll, "edit") ? `<button class="btn btn-sm btn-outline-secondary" data-edit="${x.id}" title="${t("edit")}"><i class="bi bi-pencil-square"></i></button>` : ""}
          ${can(S, cfg.coll, "delete") ? `<button class="btn btn-sm btn-outline-danger" data-del="${x.id}" title="${t("delete")}"><i class="bi bi-trash3"></i></button>` : ""}
        </td></tr>`).join("");
      const find = (id) => items.find((x) => x.id === id);
      body.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", (e) => { e.stopPropagation(); openForm(find(b.dataset.edit), reload); }));
      body.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async (e) => {
        e.stopPropagation();
        const x = find(b.dataset.del);
        if (!(await confirmBox(`${t("confirm_delete")} "${x.code} ${x.name || ""}"؟`))) return;
        await softDelete(cfg.coll, x.id, `${x.code} ${x.name || ""}`);
        toast(t("moved_to_trash"));
        reload();
      }));
      if (cfg.detail) body.querySelectorAll("tr.row-link").forEach((tr) => tr.addEventListener("click", () => { location.hash = `#${cfg.detail}/${tr.dataset.id}`; }));
    };
    filterInput.addEventListener("input", () => { query = filterInput.value; draw(); });
    draw();
  }

  async function openForm(existing, done) {
    const fields = await cfg.fields(existing);
    const html = `<div class="row g-3">${fields.map((f) => fieldHtml(f, existing ? existing[f.name] : undefined)).join("")}</div>`;
    const title = existing ? `${t("edit")} — ${existing.code}` : t(cfg.addLabel);
    openModal(title, html, async (form) => {
      let data = readFields(form, fields);
      if (cfg.prepare) data = (await cfg.prepare(data, existing, form)) || data;
      if (!existing) {
        const code = cfg.makeCode ? await cfg.makeCode(data) : await nextEntityCode(cfg.codeEntity || cfg.coll);
        const r = fs.doc(col(cfg.coll));
        const extra = cfg.beforeCreate ? (await cfg.beforeCreate({ ...data, code }, form, r.id)) || {} : {};
        const doc = { ...data, ...extra, code, deleted: false, createdAt: fs.serverTimestamp(), createdBy: session().profile.name || "" };
        await fs.setDoc(r, doc);
        await audit("create", cfg.coll, r.id, `${code} ${data.name || ""}`, null, doc);
        if (cfg.afterSave) await cfg.afterSave(r.id, { ...doc }, null, form, data);
        toast(`${t("saved")} — ${code}`);
      } else {
        const upd = { ...data, updatedAt: fs.serverTimestamp() };
        await fs.updateDoc(ref(cfg.coll, existing.id), upd);
        const before = {}; Object.keys(data).forEach((k) => { before[k] = existing[k] ?? null; });
        await audit("update", cfg.coll, existing.id, `${existing.code} ${data.name || existing.name || ""}`, before, data);
        if (cfg.afterSave) await cfg.afterSave(existing.id, { ...existing, ...data }, existing, form, data);
        toast(t("saved"));
      }
      done();
    }, { size: cfg.formSize || "lg" });
  }

  return { render, openForm };
}

// كارت معلومات في صفحة التفاصيل
export function infoGrid(pairs) {
  const empty = (v) => v == null || String(v).replace(/<(?!button|a |img)[^>]*>/g, "").replace(/\(\s*\)/g, "").trim() === "";
  return `<dl class="row info-grid mb-0">${pairs.filter((p) => p).map(([k, v]) => `<dt class="col-5 col-sm-4">${t(k)}</dt><dd class="col-7 col-sm-8">${empty(v) ? "-" : v}</dd>`).join("")}</dl>`;
}

export async function getOne(coll, id) {
  const s = await fs.getDoc(ref(coll, id));
  return s.exists() ? { id: s.id, ...s.data() } : null;
}

export const fmtMoney = (n) => (n == null || n === "" ? "-" : `${Number(n).toLocaleString("en-US")} ${t("egp")}`);
export const fmtDateStr = (s) => (s ? esc(s) : "-");
