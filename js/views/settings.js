import { db, fs } from "../firebase.js?v=20261126231907";
import { t } from "../i18n.js?v=20261126231907";
import { esc, toast, UserError, confirmBox, isPreview } from "../util.js?v=20261126231907";
import { col, ref, audit, session, DEFAULT_CODES, codeFormat, formatCode, resetCodeCache } from "../data.js?v=20261126231907";

const ENTITIES = [["students", "students"], ["courses", "courses"], ["instructors", "instructors"], ["employees", "employees"], ["groups", "groups_suffix"]];

export async function render(root) {
  const S = session();
  resetCodeCache();
  const fmts = {};
  for (const [k] of ENTITIES) fmts[k] = await codeFormat(k);
  const cats = (await fs.getDocs(col("expenseCategories"))).docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => !x.deleted);
  root.innerHTML = `<h1 class="h4 fw-bold mb-4">${t("settings")}</h1>
  <div class="row g-3">
    <div class="col-lg-5"><div class="card card-soft p-4 h-100">
      <h2 class="h6 fw-bold mb-3">${t("academy_info")}</h2>
      <label class="form-label">${t("academy_name")}</label>
      <div class="input-group"><input id="acName" class="form-control" value="${esc(S.tenant.name)}"><button id="saveName" class="btn btn-brand">${t("save")}</button></div>
    </div></div>
    <div class="col-lg-7"><div class="card card-soft p-4 h-100">
      <h2 class="h6 fw-bold mb-1">${t("expense_categories")}</h2>
      <p class="text-muted small">${t("expense_categories_hint")}</p>
      <div class="d-flex flex-wrap gap-2 mb-3" id="catList">${cats.map((c) => `<span class="badge text-bg-light fs-6 fw-normal">${esc(c.name)} <a href="javascript:void(0)" class="text-danger ms-1" data-delcat="${c.id}"><i class="bi bi-x"></i></a></span>`).join("") || `<span class="text-muted small">${t("no_data")}</span>`}</div>
      <div class="input-group"><input id="catName" class="form-control" placeholder="${t("category_ph")}"><button id="addCat" class="btn btn-outline-primary">${t("add")}</button></div>
    </div></div>
    <div class="col-12"><div class="card card-soft p-4">
      <h2 class="h6 fw-bold mb-1">${t("code_formats")}</h2>
      <p class="text-muted small">${t("code_formats_hint")}</p>
      <div class="table-responsive"><table class="table align-middle mb-3">
        <thead><tr><th></th><th>${t("code_prefix")}</th><th>${t("code_sep")}</th><th>${t("code_digits")}</th><th>${t("code_example")}</th></tr></thead>
        <tbody>${ENTITIES.map(([k, l]) => `<tr data-ent="${k}">
          <td class="fw-semibold">${t(l)}</td>
          <td><input class="form-control form-control-sm c-prefix" maxlength="8" value="${esc(fmts[k].prefix)}" dir="ltr"></td>
          <td><select class="form-select form-select-sm c-sep">${[["-", "-"], ["", t("no_sep")], ["/", "/"], [".", "."]].map(([v, lb]) => `<option value="${v}" ${fmts[k].sep === v ? "selected" : ""}>${esc(lb)}</option>`).join("")}</select></td>
          <td><input class="form-control form-control-sm c-digits" type="number" min="1" max="8" value="${esc(fmts[k].digits)}"></td>
          <td class="font-monospace c-example" dir="ltr"></td></tr>`).join("")}</tbody></table></div>
      <button id="saveCodes" class="btn btn-brand">${t("save")}</button>
    </div></div>
  </div>`;
  const rows = [...root.querySelectorAll("tr[data-ent]")];
  const read = (tr) => ({ prefix: tr.querySelector(".c-prefix").value.trim().toUpperCase(), sep: tr.querySelector(".c-sep").value, digits: Math.min(8, Math.max(1, Number(tr.querySelector(".c-digits").value) || 1)) });
  const preview = () => rows.forEach((tr) => {
    const f = read(tr);
    tr.querySelector(".c-example").textContent = tr.dataset.ent === "groups" ? `${formatCode(read(rows[1]), 7)}${f.sep}${f.prefix}${String(3).padStart(f.digits, "0")}` : formatCode(f, 1);
  });
  rows.forEach((tr) => tr.querySelectorAll("input,select").forEach((el) => el.addEventListener("input", preview)));
  preview();
  const guard = () => { if (isPreview()) throw new UserError("preview_readonly"); };
  root.querySelector("#saveCodes").addEventListener("click", async () => {
    try {
      guard();
      const data = {};
      for (const tr of rows) {
        const f = read(tr);
        if (!/^[A-Z؀-ۿ0-9]{1,8}$/.test(f.prefix)) throw new UserError("err_code_prefix");
        data[tr.dataset.ent] = f;
      }
      const prefixes = ["students", "courses", "instructors", "employees"].map((k) => data[k].prefix);
      if (new Set(prefixes).size !== prefixes.length) throw new UserError("err_code_dupe");
      await fs.setDoc(ref("settings", "codes"), { ...data, updatedAt: fs.serverTimestamp() });
      await audit("update", "settings", "codes", t("code_formats"), null, data);
      resetCodeCache();
      toast(t("saved"));
    } catch (e) { toast(e.userMessage || t("err_generic"), "danger"); console.error(e); }
  });
  root.querySelector("#saveName").addEventListener("click", async () => {
    try {
      guard();
      const name = root.querySelector("#acName").value.trim();
      if (!name) throw new UserError("required");
      const batch = fs.writeBatch(db);
      batch.update(fs.doc(db, "tenants", S.tenant.id), { name });
      batch.set(ref("settings", "general"), { name }, { merge: true });
      await batch.commit();
      await audit("update", "settings", "general", name, { name: S.tenant.name }, { name });
      S.tenant.name = name;
      document.getElementById("tenantName").textContent = name;
      toast(t("saved"));
    } catch (e) { toast(e.userMessage || t("err_generic"), "danger"); console.error(e); }
  });
  root.querySelector("#addCat").addEventListener("click", async () => {
    try {
      guard();
      const name = root.querySelector("#catName").value.trim();
      if (!name) throw new UserError("required");
      const r = await fs.addDoc(col("expenseCategories"), { name, fixed: true, deleted: false, createdAt: fs.serverTimestamp() });
      await audit("create", "expenseCategories", r.id, name);
      render(root);
    } catch (e) { toast(e.userMessage || t("err_generic"), "danger"); console.error(e); }
  });
  root.querySelectorAll("[data-delcat]").forEach((a) => a.addEventListener("click", async () => {
    const c = cats.find((x) => x.id === a.dataset.delcat);
    if (!(await confirmBox(`${t("confirm_delete")} "${c.name}"؟`))) return;
    await fs.updateDoc(ref("expenseCategories", c.id), { deleted: true });
    await audit("delete", "expenseCategories", c.id, c.name);
    render(root);
  }));
}
