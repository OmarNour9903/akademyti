import { db, fs } from "../firebase.js?v=20261126234443";
import { t } from "../i18n.js?v=20261126234443";
import { esc, toast, openModal, UserError, confirmBox } from "../util.js?v=20261126234443";
import { col, ref, audit, session, listActive } from "../data.js?v=20261126234443";
import { can } from "../perms.js?v=20261126234443";
import { fmtMoney } from "../crud.js?v=20261126234443";
import { paymentsTable, bindReprint, instState, today } from "../enroll.js?v=20261126234443";
import { myTreasuries, recordTx, readBalance, balRef, tAccess, TREASURY_PERMS, migrateLegacy } from "../money.js?v=20261126234443";

let tab = "payments";
const monthStart = () => today().slice(0, 8) + "01";

export async function render(root) {
  const S = session();
  let mine = await myTreasuries();
  if (S.role === "admin" && await migrateLegacy(mine)) mine = await myTreasuries();
  const tabs = [
    can(S, "payments", "view") && ["payments", "bi-receipt", "payments_tab"],
    (can(S, "expenses", "view") || can(S, "expenses", "add")) && ["expenses", "bi-wallet2", "expenses_tab"],
    (S.role === "admin" || mine.some((x) => tAccess(x, "transfer") || tAccess(x, "viewTx"))) && ["moves", "bi-arrow-left-right", "moves_tab"],
    can(S, "enrollments", "view") && ["overdue", "bi-exclamation-triangle", "overdue_tab"],
    (S.role === "admin" || mine.length) && ["treasuries", "bi-safe", "treasuries"]
  ].filter(Boolean);
  if (!tabs.find((x) => x[0] === tab)) tab = tabs[0] ? tabs[0][0] : "";
  root.innerHTML = `<h1 class="h4 fw-bold mb-3">${t("finance")}</h1>
    <ul class="nav nav-pills mb-3 flex-wrap">${tabs.map(([k, i, l]) => `<li class="nav-item"><a class="nav-link ${k === tab ? "active" : ""}" href="javascript:void(0)" data-tab="${k}"><i class="bi ${i}"></i> ${t(l)}</a></li>`).join("")}</ul>
    <div id="tabBody"><div class="text-center py-4"><div class="spinner-border"></div></div></div>`;
  root.querySelectorAll("[data-tab]").forEach((a) => a.addEventListener("click", () => { tab = a.dataset.tab; render(root); }));
  const box = root.querySelector("#tabBody");
  const reload = () => render(root);
  try {
    if (tab === "payments") await payments(box, reload);
    else if (tab === "expenses") await expenses(box, reload);
    else if (tab === "moves") await moves(box, reload);
    else if (tab === "overdue") await overdue(box);
    else if (tab === "treasuries") await treasuries(box, reload, mine);
  } catch (e) { console.error(e); box.innerHTML = `<div class="alert alert-danger">${t("err_generic")}</div>`; }
}

function dateFilter(box, onGo, extra = "") {
  box.insertAdjacentHTML("beforeend", `<div class="card card-soft p-3 mb-3"><div class="row g-2 align-items-end">
    <div class="col-6 col-md-auto"><label class="form-label small mb-1">${t("from")}</label><input type="date" class="form-control form-control-sm f-from" value="${monthStart()}"></div>
    <div class="col-6 col-md-auto"><label class="form-label small mb-1">${t("to")}</label><input type="date" class="form-control form-control-sm f-to" value="${today()}"></div>
    <div class="col-12 col-md-auto"><button class="btn btn-brand f-go w-100">${t("show")}</button></div>
    <div class="col-12 col-md text-md-end f-sum"></div>${extra}</div></div>`);
  const go = () => onGo(box.querySelector(".f-from").value, box.querySelector(".f-to").value);
  box.querySelector(".f-go").addEventListener("click", go);
  return go;
}

async function payments(box, reload) {
  box.innerHTML = "";
  const go = dateFilter(box, async (a, b) => {
    const snap = await fs.getDocs(fs.query(col("payments"), fs.where("date", ">=", a), fs.where("date", "<=", b)));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((x, y) => (y.code || "").localeCompare(x.code || ""));
    const sum = list.filter((p) => !p.reversedBy).reduce((s, p) => s + (Number(p.amount) || 0), 0);
    box.querySelector(".f-sum").innerHTML = `${t("total_collected")}: <b class="text-success fs-5">${fmtMoney(sum)}</b> <span class="text-muted small">(${list.length})</span>`;
    const lb = box.querySelector("#pList");
    lb.innerHTML = list.length ? paymentsTable(list) : `<p class="text-muted text-center mb-0 py-3">${t("no_payments")}</p>`;
    bindReprint(lb, list, reload);
  });
  box.insertAdjacentHTML("beforeend", `<div class="card card-soft p-3" id="pList"></div>`);
  await go();
}

// ===== المصروفات =====
async function expenses(box, reload) {
  const S = session();
  box.innerHTML = can(S, "expenses", "add") ? `<div class="mb-3"><button id="addExp" class="btn btn-brand"><i class="bi bi-plus-lg"></i> ${t("add_expense")}</button></div>` : "";
  box.querySelector("#addExp")?.addEventListener("click", () => openExpense(reload));
  if (!can(S, "expenses", "view")) { box.insertAdjacentHTML("beforeend", `<p class="text-muted small">${t("expenses_add_only")}</p>`); return; }
  const go = dateFilter(box, async (a, b) => {
    const snap = await fs.getDocs(fs.query(col("transactions"), fs.where("date", ">=", a), fs.where("date", "<=", b)));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => ["expense", "refund"].includes(x.type)).sort((x, y) => (y.code || "").localeCompare(x.code || ""));
    const sum = list.filter((x) => !x.reversedBy).reduce((s, x) => s + x.amount, 0);
    box.querySelector(".f-sum").innerHTML = `${t("total_expenses")}: <b class="text-danger fs-5">${fmtMoney(sum)}</b> <span class="text-muted small">(${list.length})</span>`;
    box.querySelector("#eList").innerHTML = list.length ? txTable(list) : `<p class="text-muted text-center mb-0 py-3">${t("no_data")}</p>`;
    bindTxReverse(box, list, reload);
  });
  box.insertAdjacentHTML("beforeend", `<div class="card card-soft p-3" id="eList"></div>`);
  await go();
}

export async function openExpense(done, preset = {}) {
  const [trs, cats, groups, insts] = await Promise.all([
    myTreasuries("withdraw"), listActive("expenseCategories"),
    can(session(), "groups", "view") ? listActive("groups") : [], can(session(), "instructors", "view") ? listActive("instructors") : []
  ]);
  if (!trs.length) { toast(t("no_withdraw_treasury"), "warning"); return; }
  const html = `<div class="row g-3">
    <div class="col-md-6"><label class="form-label">${t("expense_category")} <span class="text-danger">*</span></label>
      <select name="categoryId" class="form-select" required>${cats.map((c) => `<option value="${c.id}" ${preset.categoryName === c.name ? "selected" : ""}>${esc(c.name)}</option>`).join("")}<option value="__other" ${preset.categoryName && !cats.some((c) => c.name === preset.categoryName) ? "selected" : ""}>${t("other_item")}</option></select></div>
    <div class="col-md-6 other-wrap"><label class="form-label">${t("other_item_name")}</label><input name="otherName" class="form-control" value="${esc(preset.categoryName && !cats.some((c) => c.name === preset.categoryName) ? preset.categoryName : "")}"></div>
    <div class="col-md-4"><label class="form-label">${t("amount")} <span class="text-danger">*</span></label><input name="amount" type="number" min="0.01" step="any" class="form-control" required value="${esc(preset.amount || "")}"></div>
    <div class="col-md-4"><label class="form-label">${t("treasury")}</label><select name="treasuryId" class="form-select">${trs.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select></div>
    <div class="col-md-4"><label class="form-label">${t("pay_date")}</label><input name="date" type="date" class="form-control" value="${today()}"></div>
    <div class="col-12"><label class="form-label">${t("expense_reason")} <span class="text-danger">*</span></label><input name="reason" class="form-control" required value="${esc(preset.reason || "")}"></div>
    <div class="col-md-6"><label class="form-label">${t("link_group")}</label><select name="groupId" class="form-select"><option value="">—</option>${groups.map((g) => `<option value="${g.id}" ${preset.groupId === g.id ? "selected" : ""}>${esc(g.code)} — ${esc(g.courseName)}</option>`).join("")}</select></div>
    <div class="col-md-6"><label class="form-label">${t("link_instructor")}</label><select name="instructorId" class="form-select"><option value="">—</option>${insts.map((i) => `<option value="${i.id}" ${preset.instructorId === i.id ? "selected" : ""}>${esc(i.code)} — ${esc(i.name)}</option>`).join("")}</select></div>
  </div>`;
  const body = openModal(t("add_expense"), html, async (form) => {
    const amount = Number(form.amount.value);
    const reason = form.reason.value.trim();
    const catId = form.categoryId.value;
    const cat = cats.find((c) => c.id === catId);
    const categoryName = catId === "__other" ? form.otherName.value.trim() : cat && cat.name;
    if (!(amount > 0) || !reason || !categoryName) throw new UserError("required");
    const tr = trs.find((x) => x.id === form.treasuryId.value);
    const g = groups.find((x) => x.id === form.groupId.value);
    const ins = insts.find((x) => x.id === form.instructorId.value);
    const r = await recordTx({ type: "expense", amount, treasuryId: tr.id, treasuryName: tr.name, deltas: { [tr.id]: -amount }, date: form.date.value || today(),
      reason, categoryId: catId === "__other" ? "" : catId, categoryName, groupId: g ? g.id : "", groupCode: g ? g.code : "", courseId: g ? g.courseId : "",
      instructorId: ins ? ins.id : "", instructorName: ins ? ins.name : "" });
    toast(`${t("saved")} — ${r.code}`);
    done();
  }, { size: "lg" });
  const form = body.closest("form");
  const toggle = () => body.querySelector(".other-wrap").classList.toggle("d-none", form.categoryId.value !== "__other");
  form.categoryId.addEventListener("change", toggle); toggle();
}

function txTable(list) {
  return `<div class="table-responsive"><table class="table table-sm align-middle mb-0">
    <thead><tr><th>${t("code")}</th><th>${t("pay_date")}</th><th>${t("type")}</th><th>${t("item")}</th><th>${t("amount")}</th><th>${t("treasury")}</th><th>${t("reason")}</th><th>${t("by")}</th><th></th></tr></thead>
    <tbody>${list.map((x) => `<tr class="${x.reversedBy ? "text-decoration-line-through text-muted" : ""}">
      <td class="font-monospace small">${esc(x.code)}</td><td dir="ltr" class="text-end small">${esc(x.date)}</td>
      <td><span class="badge tx-${esc(x.type)}">${t("tx_" + x.type)}</span></td>
      <td class="small">${esc(x.categoryName || x.studentName || "")}${x.instructorName ? ` — ${esc(x.instructorName)}` : ""}${x.groupCode ? ` <span class="text-muted">(${esc(x.groupCode)})</span>` : ""}</td>
      <td class="fw-semibold">${fmtMoney(x.amount)}</td>
      <td class="small">${esc(x.treasuryName)}${x.toTreasuryName ? ` ← ${esc(x.toTreasuryName)}` : ""}</td>
      <td class="small">${esc(x.reason || "")}</td><td class="small">${esc(x.createdBy)}</td>
      <td>${x.reversedBy ? `<span class="badge text-bg-danger">${t("reversed")}</span>` : (session().role === "admin" && x.type !== "reversal" && x.type !== "refund" ? `<button class="btn btn-sm btn-outline-danger" data-txrev="${x.id}" title="${t("reverse")}" aria-label="${t("reverse")}"><i class="bi bi-arrow-return-left"></i></button>` : "")}</td></tr>`).join("")}</tbody></table></div>`;
}

function bindTxReverse(box, list, reload) {
  box.querySelectorAll("[data-txrev]").forEach((b) => b.addEventListener("click", () => {
    const x = list.find((y) => y.id === b.dataset.txrev);
    openModal(t("reverse"), `<p>${t("reverse_tx_note")}</p><p><b>${esc(x.code)}</b> — ${t("tx_" + x.type)} — <b>${fmtMoney(x.amount)}</b></p>
      <label class="form-label">${t("reverse_reason")} <span class="text-danger">*</span></label><input name="reason" class="form-control" required>`, async (form) => {
      const reason = form.reason.value.trim();
      if (!reason) throw new UserError("required");
      const deltas = {};
      Object.entries(x.deltas || {}).forEach(([k, v]) => { deltas[k] = -v; });
      await recordTx({ type: "reversal", amount: x.amount, treasuryId: x.treasuryId, treasuryName: x.treasuryName, toTreasuryId: x.toTreasuryId || null, toTreasuryName: x.toTreasuryName || null,
        deltas, reason, date: today(), reversedTxId: x.id },
      { write: (tx, txId) => tx.update(ref("transactions", x.id), { reversedBy: txId, reversedAt: fs.serverTimestamp() }) });
      toast(t("saved"));
      reload();
    }, { submitLabel: t("reverse"), danger: true, size: "md" });
  }));
}

// ===== التحويلات وكل الحركات =====
async function moves(box, reload) {
  const S = session();
  const transferable = await myTreasuries("transfer");
  box.innerHTML = transferable.length ? `<div class="mb-3"><button id="addTr" class="btn btn-brand"><i class="bi bi-arrow-left-right"></i> ${t("new_transfer")}</button></div>` : "";
  box.querySelector("#addTr")?.addEventListener("click", () => openTransfer(transferable, reload));
  const visible = S.role === "admin" ? null : (await myTreasuries("viewTx")).map((x) => x.id);
  if (visible && !visible.length) return;
  const go = dateFilter(box, async (a, b) => {
    let list = [];
    if (visible) {
      for (const tid of visible) {
        const snap = await fs.getDocs(fs.query(col("transactions"), fs.where("treasuryId", "==", tid)));
        snap.forEach((d) => list.push({ id: d.id, ...d.data() }));
      }
      list = list.filter((x) => x.date >= a && x.date <= b);
    } else {
      const snap = await fs.getDocs(fs.query(col("transactions"), fs.where("date", ">=", a), fs.where("date", "<=", b)));
      list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    }
    list.sort((x, y) => (y.code || "").localeCompare(x.code || ""));
    box.querySelector(".f-sum").innerHTML = `<span class="text-muted small">${list.length} ${t("moves_count")}</span>`;
    box.querySelector("#mList").innerHTML = list.length ? txTable(list) : `<p class="text-muted text-center mb-0 py-3">${t("no_data")}</p>`;
    bindTxReverse(box, list, reload);
  });
  box.insertAdjacentHTML("beforeend", `<div class="card card-soft p-3" id="mList"></div>`);
  await go();
}

async function openTransfer(froms, done) {
  const all = await myTreasuries();
  const allTargets = session().role === "admin" ? all : (await fs.getDocs(col("treasuryNames"))).docs.map((d) => ({ id: d.id, ...d.data() }));
  const html = `<div class="row g-3">
    <div class="col-md-6"><label class="form-label">${t("from_treasury")}</label><select name="from" class="form-select">${froms.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select></div>
    <div class="col-md-6"><label class="form-label">${t("to_treasury")}</label><select name="to" class="form-select">${allTargets.filter((x) => !x.deleted).map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select></div>
    <div class="col-md-6"><label class="form-label">${t("amount")} <span class="text-danger">*</span></label><input name="amount" type="number" min="0.01" step="any" class="form-control" required></div>
    <div class="col-md-6"><label class="form-label">${t("pay_date")}</label><input name="date" type="date" class="form-control" value="${today()}"></div>
    <div class="col-12"><label class="form-label">${t("reason")} <span class="text-danger">*</span></label><input name="reason" class="form-control" required></div></div>`;
  openModal(t("new_transfer"), html, async (form) => {
    const from = froms.find((x) => x.id === form.from.value);
    const to = allTargets.find((x) => x.id === form.to.value);
    const amount = Number(form.amount.value);
    const reason = form.reason.value.trim();
    if (!from || !to || !(amount > 0) || !reason) throw new UserError("required");
    if (from.id === to.id) throw new UserError("err_same_treasury");
    const r = await recordTx({ type: "transfer", amount, treasuryId: from.id, treasuryName: from.name, toTreasuryId: to.id, toTreasuryName: to.name,
      deltas: { [from.id]: -amount, [to.id]: amount }, reason, date: form.date.value || today() });
    toast(`${t("saved")} — ${r.code}`);
    done();
  }, { size: "md" });
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
    <div class="mb-3">${t("overdue_total")}: <b class="text-danger fs-5">${fmtMoney(Math.round(total * 100) / 100)}</b> <span class="text-muted small">(${rows.length})</span></div>
    ${rows.length ? `<div class="table-responsive"><table class="table table-sm table-hover align-middle mb-0">
      <thead><tr><th>${t("student")}</th><th>${t("group")}</th><th>${t("installment")}</th><th>${t("due_date")}</th><th>${t("days_late")}</th><th>${t("left")}</th></tr></thead>
      <tbody>${rows.map(({ e, i }) => `<tr class="row-link" data-href="#student/${e.studentId}">
        <td>${esc(e.studentCode)} ${esc(e.studentName)}</td><td class="small">${esc(e.groupCode)}</td><td>#${i.no}</td>
        <td dir="ltr" class="text-end">${esc(i.dueDate)}</td><td class="text-danger">${Math.round((new Date(today()) - new Date(i.dueDate)) / 864e5)}</td>
        <td class="fw-semibold text-danger">${fmtMoney(Math.round((i.amount - (i.paid || 0)) * 100) / 100)}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="text-muted text-center mb-0 py-3">${t("no_overdue")}</p>`}</div>`;
  box.querySelectorAll("tr[data-href]").forEach((tr) => tr.addEventListener("click", () => { location.hash = tr.dataset.href; }));
}

// ===== الخزن =====
async function treasuries(box, reload, list) {
  const S = session();
  const isAdmin = S.role === "admin";
  const rows = [];
  for (const x of list) {
    const showBal = tAccess(x, "viewBalance");
    let bal = showBal ? await readBalance(x.id) : null;
    rows.push({ x, bal, showBal });
  }
  box.innerHTML = `<div class="card card-soft p-3">
    <div class="d-flex mb-3 gap-2"><p class="text-muted small mb-0">${t(isAdmin ? "treasuries_note_admin" : "treasuries_note_emp")}</p>
      ${isAdmin ? `<button id="addT" class="btn btn-sm btn-brand ms-auto text-nowrap"><i class="bi bi-plus-lg"></i> ${t("add_treasury")}</button>` : ""}</div>
    ${rows.length ? `<table class="table align-middle mb-0"><thead><tr><th>${t("treasury")}</th><th>${t("balance")}</th><th>${t("my_perms")}</th><th></th></tr></thead>
      <tbody>${rows.map(({ x, bal, showBal }) => `<tr><td class="fw-semibold">${esc(x.name)}</td>
        <td class="fs-5">${showBal ? fmtMoney(bal || 0) : `<span class="text-muted small"><i class="bi bi-eye-slash"></i> ${t("hidden")}</span>`}</td>
        <td class="small">${TREASURY_PERMS.filter((p) => tAccess(x, p)).map((p) => `<span class="badge text-bg-light">${t("tp_" + p)}</span>`).join(" ")}</td>
        <td class="text-end">${isAdmin ? `<button class="btn btn-sm btn-outline-primary" data-access="${x.id}"><i class="bi bi-shield-lock"></i> ${t("treasury_access")}</button>` : ""}</td></tr>`).join("")}</tbody></table>`
      : `<p class="text-muted text-center mb-0 py-3">${t("no_treasuries")}</p>`}</div>`;
  box.querySelector("#addT")?.addEventListener("click", () => {
    openModal(t("add_treasury"), `<label class="form-label">${t("treasury_name")}</label><input name="name" class="form-control" required placeholder="${t("treasury_ph")}">`, async (form) => {
      const name = form.name.value.trim();
      if (!name) throw new UserError("required");
      const r = fs.doc(col("treasuries"));
      const batch = fs.writeBatch(db);
      batch.set(r, { name, members: [], access: {}, deleted: false, createdAt: fs.serverTimestamp() });
      batch.set(balRef(r.id), { balance: 0, lastTxId: "", lastTxColl: "" });
      batch.set(ref("treasuryNames", r.id), { name });
      await batch.commit();
      await audit("create", "treasuries", r.id, name);
      toast(t("saved"));
      reload();
    }, { size: "md" });
  });
  box.querySelectorAll("[data-access]").forEach((b) => b.addEventListener("click", () => openAccess(list.find((y) => y.id === b.dataset.access), reload)));
}

async function openAccess(tr, done) {
  const emps = (await listActive("employees")).filter((e) => e.uid);
  const acc = tr.access || {};
  const html = `<p class="text-muted small">${t("treasury_access_hint")}</p>
    ${emps.length ? `<div class="table-responsive"><table class="table table-sm align-middle perm-table">
      <thead><tr><th>${t("employee")}</th>${TREASURY_PERMS.map((p) => `<th class="text-center">${t("tp_" + p)}</th>`).join("")}</tr></thead>
      <tbody>${emps.map((e) => `<tr><td class="text-nowrap">${esc(e.code)} ${esc(e.name)}</td>${TREASURY_PERMS.map((p) => `<td class="text-center"><input class="form-check-input" type="checkbox" name="${e.uid}:${p}" ${(acc[e.uid] || {})[p] ? "checked" : ""}></td>`).join("")}</tr>`).join("")}</tbody></table></div>`
      : `<p class="text-muted">${t("no_data")}</p>`}`;
  openModal(`${t("treasury_access")} — ${tr.name}`, html, async (form) => {
    const access = {};
    form.querySelectorAll("input[type=checkbox]").forEach((c) => {
      const [uid, p] = c.name.split(":");
      if (c.checked) (access[uid] = access[uid] || {})[p] = true;
    });
    const members = Object.keys(access);
    await fs.updateDoc(ref("treasuries", tr.id), { access, members });
    await audit("permissions", "treasuries", tr.id, tr.name, { access: tr.access || {} }, { access });
    toast(t("saved"));
    done();
  }, { size: "xl" });
}
