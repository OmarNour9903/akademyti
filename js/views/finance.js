import { fs } from "../firebase.js?v=20261126230347";
import { t } from "../i18n.js?v=20261126230347";
import { esc, toast, openModal, UserError } from "../util.js?v=20261126230347";
import { col, ref, audit, session } from "../data.js?v=20261126230347";
import { can } from "../perms.js?v=20261126230347";
import { fmtMoney } from "../crud.js?v=20261126230347";
import { paymentsTable, bindReprint, enrollmentTotals, instState, today } from "../enroll.js?v=20261126230347";

let tab = "payments";

export async function render(root) {
  const S = session();
  const tabs = [
    can(S, "payments", "view") && ["payments", "bi-receipt", "payments_tab"],
    can(S, "enrollments", "view") && ["overdue", "bi-exclamation-triangle", "overdue_tab"],
    S.role === "admin" && ["treasuries", "bi-safe", "treasuries"]
  ].filter(Boolean);
  if (!tabs.find((x) => x[0] === tab)) tab = tabs[0] ? tabs[0][0] : "";
  root.innerHTML = `<h1 class="h4 fw-bold mb-3">${t("finance")}</h1>
    <ul class="nav nav-pills mb-3">${tabs.map(([k, i, l]) => `<li class="nav-item"><a class="nav-link ${k === tab ? "active" : ""}" href="javascript:void(0)" data-tab="${k}"><i class="bi ${i}"></i> ${t(l)}</a></li>`).join("")}</ul>
    <div id="tabBody"><div class="text-center py-4"><div class="spinner-border"></div></div></div>`;
  root.querySelectorAll("[data-tab]").forEach((a) => a.addEventListener("click", () => { tab = a.dataset.tab; render(root); }));
  const box = root.querySelector("#tabBody");
  if (tab === "payments") await payments(box);
  else if (tab === "overdue") await overdue(box);
  else if (tab === "treasuries") await treasuries(box, () => render(root));
}

async function payments(box) {
  const from = today().slice(0, 8) + "01";
  box.innerHTML = `<div class="card card-soft p-3 mb-3"><div class="row g-2 align-items-end">
      <div class="col-auto"><label class="form-label small mb-1">${t("from")}</label><input type="date" id="fFrom" class="form-control form-control-sm" value="${from}"></div>
      <div class="col-auto"><label class="form-label small mb-1">${t("to")}</label><input type="date" id="fTo" class="form-control form-control-sm" value="${today()}"></div>
      <div class="col-auto"><button id="fGo" class="btn btn-sm btn-brand">${t("show")}</button></div>
      <div class="col text-end" id="fSum"></div></div></div>
    <div class="card card-soft p-3" id="pList"></div>`;
  const load = async () => {
    const a = box.querySelector("#fFrom").value, b = box.querySelector("#fTo").value;
    const snap = await fs.getDocs(fs.query(col("payments"), fs.where("date", ">=", a), fs.where("date", "<=", b)));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((x, y) => (y.code || "").localeCompare(x.code || ""));
    const sum = list.reduce((s, p) => s + (Number(p.amount) || 0), 0);
    box.querySelector("#fSum").innerHTML = `${t("total_collected")}: <b class="text-success fs-5">${fmtMoney(sum)}</b> <span class="text-muted small">(${list.length})</span>`;
    const lb = box.querySelector("#pList");
    lb.innerHTML = list.length ? paymentsTable(list) : `<p class="text-muted text-center mb-0 py-3">${t("no_payments")}</p>`;
    bindReprint(lb, list);
  };
  box.querySelector("#fGo").addEventListener("click", load);
  await load();
}

async function overdue(box) {
  const snap = await fs.getDocs(fs.query(col("enrollments"), fs.where("status", "==", "active")));
  const rows = [];
  snap.forEach((d) => {
    const e = { id: d.id, ...d.data() };
    if (e.deleted) return;
    (e.installments || []).forEach((i) => { if (instState(i) === "overdue") rows.push({ e, i }); });
  });
  rows.sort((a, b) => (a.i.dueDate || "").localeCompare(b.i.dueDate || ""));
  const total = rows.reduce((s, r) => s + (r.i.amount - (r.i.paid || 0)), 0);
  box.innerHTML = `<div class="card card-soft p-3">
    <div class="mb-3">${t("overdue_total")}: <b class="text-danger fs-5">${fmtMoney(total)}</b> <span class="text-muted small">(${rows.length})</span></div>
    ${rows.length ? `<div class="table-responsive"><table class="table table-sm table-hover align-middle mb-0">
      <thead><tr><th>${t("student")}</th><th>${t("group")}</th><th>${t("installment")}</th><th>${t("due_date")}</th><th>${t("days_late")}</th><th>${t("left")}</th></tr></thead>
      <tbody>${rows.map(({ e, i }) => `<tr class="row-link" data-href="#student/${e.studentId}">
        <td>${esc(e.studentCode)} ${esc(e.studentName)}</td><td class="small">${esc(e.groupCode)}</td><td>#${i.no}</td>
        <td dir="ltr" class="text-end">${esc(i.dueDate)}</td><td class="text-danger">${Math.floor((new Date(today()) - new Date(i.dueDate)) / 864e5)}</td>
        <td class="fw-semibold text-danger">${fmtMoney(i.amount - (i.paid || 0))}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="text-muted text-center mb-0 py-3">${t("no_overdue")}</p>`}</div>`;
  box.querySelectorAll("tr[data-href]").forEach((tr) => tr.addEventListener("click", () => { location.hash = tr.dataset.href; }));
}

async function treasuries(box, reload) {
  const snap = await fs.getDocs(col("treasuries"));
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => !x.deleted);
  box.innerHTML = `<div class="card card-soft p-3">
    <div class="d-flex mb-3"><p class="text-muted small mb-0">${t("treasuries_note")}</p>
      <button id="addT" class="btn btn-sm btn-brand ms-auto text-nowrap"><i class="bi bi-plus-lg"></i> ${t("add_treasury")}</button></div>
    ${list.length ? `<table class="table align-middle mb-0"><thead><tr><th>${t("treasury")}</th><th>${t("balance")}</th></tr></thead>
      <tbody>${list.map((x) => `<tr><td class="fw-semibold">${esc(x.name)}</td><td class="fs-5">${fmtMoney(x.balance || 0)}</td></tr>`).join("")}</tbody></table>`
      : `<p class="text-muted text-center mb-0 py-3">${t("no_treasuries")}</p>`}</div>`;
  box.querySelector("#addT").addEventListener("click", () => {
    openModal(t("add_treasury"), `<label class="form-label">${t("treasury_name")}</label><input name="name" class="form-control" required placeholder="${t("treasury_ph")}">`, async (form) => {
      const name = form.name.value.trim();
      if (!name) throw new UserError("required");
      const r = await fs.addDoc(col("treasuries"), { name, balance: 0, deleted: false, createdAt: fs.serverTimestamp() });
      await audit("create", "treasuries", r.id, name);
      toast(t("saved"));
      reload();
    }, { size: "md" });
  });
}
