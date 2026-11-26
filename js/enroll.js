// الاشتراكات والأقساط والدفعات والإيصالات
import { db, fs } from "./firebase.js?v=20261126230347";
import { t, currentLang } from "./i18n.js?v=20261126230347";
import { esc, toast, openModal, UserError } from "./util.js?v=20261126230347";
import { col, ref, audit, nextCode, nextNumber, session } from "./data.js?v=20261126230347";
import { can, hasSpecial } from "./perms.js?v=20261126230347";
import { fmtMoney, statusBadge } from "./crud.js?v=20261126230347";

export const today = () => new Date().toISOString().slice(0, 10);
const round2 = (n) => Math.round(Number(n) * 100) / 100;

export function instState(i) {
  const paid = Number(i.paid) || 0, amt = Number(i.amount) || 0;
  if (paid >= amt) return "paid";
  if (i.dueDate && i.dueDate < today()) return "overdue";
  return paid > 0 ? "partial" : "due";
}
const instBadge = (s) => `<span class="badge inst-${s}">${t("inst_" + s)}</span>`;

export function enrollmentTotals(e) {
  const insts = e.installments || [];
  const overdue = insts.filter((i) => instState(i) === "overdue");
  return {
    total: Number(e.finalPrice) || 0, paid: Number(e.paid) || 0,
    remaining: round2((Number(e.finalPrice) || 0) - (Number(e.paid) || 0)),
    overdueCount: overdue.length, overdueAmount: round2(overdue.reduce((s, i) => s + (i.amount - (i.paid || 0)), 0))
  };
}

// تقسيم المبلغ على أقساط شهرية متساوية (القسط الأخير ياخد الفرق)
function splitPlan(total, count, firstDate) {
  const n = Math.max(1, Math.min(24, Number(count) || 1));
  const base = Math.floor((total / n) * 100) / 100;
  const out = [];
  const d0 = firstDate ? new Date(firstDate) : new Date();
  for (let k = 0; k < n; k++) {
    const d = new Date(d0); d.setMonth(d.getMonth() + k);
    out.push({ no: k + 1, amount: k === n - 1 ? round2(total - base * (n - 1)) : base, dueDate: d.toISOString().slice(0, 10), paid: 0 });
  }
  return out;
}

// ===== اشتراك جديد =====
export async function openEnroll(student, done) {
  const S = session();
  const snap = await fs.getDocs(fs.query(col("groups"), fs.where("status", "in", ["open", "running"])));
  const groups = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((g) => !g.deleted);
  if (!groups.length) { toast(t("no_open_groups"), "warning"); return; }
  const canDiscount = hasSpecial(S, "discount");
  const canOver = hasSpecial(S, "overrideCapacity");
  const seats = (g) => (Number(g.capacity) || 0) - (Number(g.enrolledCount) || 0);
  const opts = groups.map((g) => `<option value="${g.id}" ${seats(g) <= 0 && !canOver ? "disabled" : ""}>${esc(g.code)} — ${esc(g.courseName)} (${t("seats")}: ${Math.max(0, seats(g))}) — ${fmtMoney(g.price)}</option>`).join("");
  const html = `
    <div class="row g-3">
      <div class="col-12"><label class="form-label">${t("group")} <span class="text-danger">*</span></label><select name="groupId" class="form-select" required><option value="">—</option>${opts}</select></div>
      <div class="col-md-4"><label class="form-label">${t("original_price")}</label><input name="price" class="form-control" disabled></div>
      <div class="col-md-4"><label class="form-label">${t("discount")}</label><input name="discount" type="number" min="0" step="any" class="form-control" value="0" ${canDiscount ? "" : "disabled"}></div>
      <div class="col-md-4"><label class="form-label">${t("final_price")}</label><input name="final" class="form-control fw-bold" disabled></div>
      <div class="col-12 ${canDiscount ? "" : "d-none"}"><label class="form-label">${t("discount_reason")}</label><input name="discountReason" class="form-control" placeholder="${t("discount_reason_ph")}"></div>
      ${canDiscount ? "" : `<div class="col-12"><p class="form-text mt-0">${t("discount_need_perm")}</p></div>`}
      <div class="col-md-4"><label class="form-label">${t("installments_count")}</label><input name="count" type="number" min="1" max="24" class="form-control" value="1"></div>
      <div class="col-md-4"><label class="form-label">${t("first_due")}</label><input name="first" type="date" class="form-control" value="${today()}"></div>
      <div class="col-md-4 d-flex align-items-end"><button type="button" id="genPlan" class="btn btn-outline-primary w-100">${t("generate_plan")}</button></div>
      <div class="col-12"><div id="planBox"></div><div id="planSum" class="small mt-1"></div></div>
    </div>`;
  const body = openModal(`${t("new_enrollment")} — ${student.code} ${student.name}`, html, async (form) => {
    const g = groups.find((x) => x.id === form.groupId.value);
    if (!g) throw new UserError("required");
    if (seats(g) <= 0 && !canOver) throw new UserError("group_full");
    const original = Number(g.price) || 0;
    const discount = canDiscount ? Number(form.discount.value) || 0 : 0;
    const reason = form.discountReason.value.trim();
    if (discount < 0 || discount > original) throw new UserError("err_discount");
    if (discount > 0 && !reason) throw new UserError("err_discount_reason");
    const finalPrice = round2(original - discount);
    const plan = readPlan(form);
    if (!plan.length) throw new UserError("err_plan_empty");
    const sum = round2(plan.reduce((s, i) => s + i.amount, 0));
    if (sum !== finalPrice) throw new UserError("err_plan_sum");
    const dup = await fs.getDocs(fs.query(col("enrollments"), fs.where("studentId", "==", student.id), fs.where("groupId", "==", g.id)));
    if (dup.docs.some((d) => !d.data().deleted && d.data().status === "active")) throw new UserError("err_already_enrolled");
    const eRef = fs.doc(col("enrollments"));
    const doc = {
      studentId: student.id, studentCode: student.code, studentName: student.name,
      groupId: g.id, groupCode: g.code, courseId: g.courseId, courseName: g.courseName,
      originalPrice: original, discount, discountReason: discount > 0 ? reason : "", discountBy: discount > 0 ? (S.profile.name || "") : "",
      finalPrice, paid: 0, installments: plan, status: "active", deleted: false,
      createdAt: fs.serverTimestamp(), createdBy: S.profile.name || ""
    };
    const batch = fs.writeBatch(db);
    batch.set(eRef, doc);
    batch.update(ref("groups", g.id), { enrolledCount: fs.increment(1) });
    await batch.commit();
    await audit("create", "enrollments", eRef.id, `${student.code} ← ${g.code}`, null, { finalPrice, discount, discountReason: doc.discountReason, installments: plan.length });
    toast(t("saved"));
    done();
  }, { submitLabel: t("enroll"), size: "lg" });

  const form = body.closest("form");
  const recalc = () => {
    const g = groups.find((x) => x.id === form.groupId.value);
    const original = g ? Number(g.price) || 0 : 0;
    const disc = Number(form.discount.value) || 0;
    form.price.value = g ? fmtMoney(original) : "";
    form.final.value = g ? fmtMoney(round2(original - disc)) : "";
    return round2(original - disc);
  };
  const drawPlan = () => {
    const total = recalc();
    const plan = splitPlan(total, form.count.value, form.first.value);
    body.querySelector("#planBox").innerHTML = `<table class="table table-sm align-middle mb-0"><thead><tr><th>#</th><th>${t("amount")}</th><th>${t("due_date")}</th></tr></thead><tbody>${
      plan.map((i) => `<tr><td>${i.no}</td><td><input class="form-control form-control-sm plan-amt" type="number" step="any" min="0" value="${i.amount}"></td><td><input class="form-control form-control-sm plan-date" type="date" value="${i.dueDate}"></td></tr>`).join("")}</tbody></table>`;
    body.querySelectorAll(".plan-amt").forEach((el) => el.addEventListener("input", sumCheck));
    sumCheck();
  };
  const sumCheck = () => {
    const sum = round2([...body.querySelectorAll(".plan-amt")].reduce((s, el) => s + (Number(el.value) || 0), 0));
    const total = recalc();
    const ok = sum === total;
    body.querySelector("#planSum").innerHTML = `${t("plan_total")}: <b>${fmtMoney(sum)}</b> ${ok ? `<span class="text-success">✓</span>` : `<span class="text-danger">≠ ${fmtMoney(total)}</span>`}`;
  };
  form.groupId.addEventListener("change", drawPlan);
  form.discount.addEventListener("input", drawPlan);
  form.count.addEventListener("input", drawPlan);
  form.first.addEventListener("change", drawPlan);
  body.querySelector("#genPlan").addEventListener("click", drawPlan);
}

function readPlan(form) {
  const amts = [...form.querySelectorAll(".plan-amt")];
  const dates = [...form.querySelectorAll(".plan-date")];
  return amts.map((el, k) => ({ no: k + 1, amount: round2(Number(el.value) || 0), dueDate: dates[k].value || "", paid: 0 })).filter((i) => i.amount > 0);
}

// ===== جدول الأقساط =====
export function installmentsTable(e, { selectable = false } = {}) {
  const tot = enrollmentTotals(e);
  const rows = (e.installments || []).map((i) => {
    const st = instState(i);
    const left = round2(i.amount - (i.paid || 0));
    return `<tr class="${st === "overdue" ? "table-danger" : ""}">
      ${selectable ? `<td><input class="form-check-input" type="radio" name="instNo" value="${i.no}" ${left <= 0 ? "disabled" : ""} data-left="${left}"></td>` : ""}
      <td>${i.no}</td><td dir="ltr" class="text-end">${esc(i.dueDate || "-")}</td><td>${fmtMoney(i.amount)}</td><td>${fmtMoney(i.paid || 0)}</td><td class="fw-semibold">${fmtMoney(left)}</td><td>${instBadge(st)}</td></tr>`;
  }).join("");
  return `<div class="table-responsive"><table class="table table-sm align-middle mb-2">
    <thead><tr>${selectable ? "<th></th>" : ""}<th>#</th><th>${t("due_date")}</th><th>${t("amount")}</th><th>${t("collected")}</th><th>${t("left")}</th><th>${t("status")}</th></tr></thead>
    <tbody>${rows}</tbody></table></div>
    <div class="totals-bar">
      <span>${t("total_required")}: <b>${fmtMoney(tot.total)}</b></span>
      <span>${t("total_collected")}: <b class="text-success">${fmtMoney(tot.paid)}</b></span>
      <span>${t("total_remaining")}: <b class="${tot.remaining > 0 ? "text-danger" : ""}">${fmtMoney(tot.remaining)}</b></span>
    </div>`;
}

// ===== تسجيل دفعة =====
export async function openPayment(e, done) {
  const S = session();
  const tSnap = await fs.getDocs(col("treasuries"));
  const treasuries = tSnap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => !x.deleted);
  if (!treasuries.length) { toast(t("no_treasuries"), "warning"); return; }
  const methods = ["cash", "transfer", "vodafone", "instapay"];
  const html = `
    <p class="mb-2"><b>${esc(e.studentCode)} ${esc(e.studentName)}</b> — ${esc(e.groupCode)} ${esc(e.courseName)}</p>
    <h6 class="fw-bold">${t("choose_installment")}</h6>
    ${installmentsTable(e, { selectable: true })}
    <div class="row g-3 mt-1">
      <div class="col-md-4"><label class="form-label">${t("amount")} <span class="text-danger">*</span></label><input name="amount" type="number" min="0.01" step="any" class="form-control" required></div>
      <div class="col-md-4"><label class="form-label">${t("pay_method")}</label><select name="method" class="form-select">${methods.map((m) => `<option value="${m}">${t("m_" + m)}</option>`).join("")}</select></div>
      <div class="col-md-4"><label class="form-label">${t("treasury")}</label><select name="treasuryId" class="form-select" required>${treasuries.map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join("")}</select></div>
      <div class="col-md-4"><label class="form-label">${t("pay_date")}</label><input name="date" type="date" class="form-control" value="${today()}" required></div>
      <div class="col-md-8"><label class="form-label">${t("notes")}</label><input name="notes" class="form-control"></div>
    </div>`;
  const body = openModal(t("record_payment"), html, async (form) => {
    const sel = form.querySelector("input[name=instNo]:checked");
    if (!sel) throw new UserError("err_choose_installment");
    const instNo = Number(sel.value);
    const amount = round2(Number(form.amount.value));
    if (!(amount > 0)) throw new UserError("required");
    const treasury = treasuries.find((x) => x.id === form.treasuryId.value);
    const year = (form.date.value || today()).slice(0, 4);
    const n = await nextNumber(`trx_${year}`);
    const code = `TRX-${year}-${String(n).padStart(6, "0")}`;
    const pRef = fs.doc(col("payments"));
    const eRef = ref("enrollments", e.id);
    let receipt;
    await fs.runTransaction(db, async (tx) => {
      const snap = await tx.get(eRef);
      const cur = snap.data();
      const insts = (cur.installments || []).map((i) => ({ ...i }));
      const inst = insts.find((i) => i.no === instNo);
      const left = round2(inst.amount - (inst.paid || 0));
      if (amount > left) throw new UserError("err_amount_gt_left");
      inst.paid = round2((inst.paid || 0) + amount);
      const paid = round2((cur.paid || 0) + amount);
      receipt = {
        code, type: "income", amount, method: form.method.value, date: form.date.value, notes: form.notes.value.trim(),
        enrollmentId: e.id, installmentNo: instNo, studentId: cur.studentId, studentCode: cur.studentCode, studentName: cur.studentName,
        groupId: cur.groupId, groupCode: cur.groupCode, courseId: cur.courseId, courseName: cur.courseName,
        treasuryId: treasury.id, treasuryName: treasury.name, receivedBy: S.profile.name || "", receivedByUid: S.user.uid,
        remainingAfter: round2(cur.finalPrice - paid), createdAt: fs.serverTimestamp()
      };
      tx.set(pRef, receipt);
      tx.update(eRef, { paid, installments: insts, lastPaymentId: pRef.id, updatedAt: fs.serverTimestamp() });
      tx.update(ref("treasuries", treasury.id), { balance: fs.increment(amount), lastTxId: pRef.id });
    });
    await audit("create", "payments", pRef.id, `${code} — ${e.studentCode} — ${amount}`, null, { amount, instNo, treasury: treasury.name });
    toast(`${t("saved")} — ${code}`);
    printReceipt({ ...receipt, createdAt: null });
    done();
  }, { submitLabel: t("save_and_print"), size: "lg" });
  body.querySelectorAll("input[name=instNo]").forEach((r) => r.addEventListener("change", () => { body.closest("form").amount.value = r.dataset.left; }));
}

// ===== الإيصال =====
export function printReceipt(p) {
  const S = session();
  const area = document.getElementById("printArea");
  area.innerHTML = `<div class="receipt">
    <div class="d-flex justify-content-between align-items-start mb-3">
      <div><h2 class="h4 fw-bold mb-0">${esc(S.tenant.name)}</h2><div class="text-muted">${t("receipt")}</div></div>
      <div class="text-end"><div class="font-monospace fw-bold">${esc(p.code)}</div><div dir="ltr">${esc(p.date)}</div></div>
    </div>
    <table class="table table-bordered">
      <tr><th>${t("student")}</th><td>${esc(p.studentCode)} — ${esc(p.studentName)}</td></tr>
      <tr><th>${t("course")}</th><td>${esc(p.courseName)} (${esc(p.groupCode)})</td></tr>
      <tr><th>${t("installment")}</th><td>#${esc(p.installmentNo)}</td></tr>
      <tr><th>${t("amount")}</th><td class="fs-5 fw-bold">${fmtMoney(p.amount)}</td></tr>
      <tr><th>${t("pay_method")}</th><td>${t("m_" + p.method)}</td></tr>
      <tr><th>${t("total_remaining")}</th><td>${fmtMoney(p.remainingAfter)}</td></tr>
      <tr><th>${t("received_by")}</th><td>${esc(p.receivedBy)}</td></tr>
      ${p.notes ? `<tr><th>${t("notes")}</th><td>${esc(p.notes)}</td></tr>` : ""}
    </table>
    <div class="d-flex justify-content-between mt-5"><span>${t("signature")}: ____________</span><span class="small text-muted">${t("powered_by")}</span></div>
  </div>`;
  setTimeout(() => window.print(), 300);
}

// ===== قايمة اشتراكات طالب (صفحة الطالب) =====
export async function studentEnrollments(box, student, reload) {
  const S = session();
  if (!can(S, "enrollments", "view")) { box.innerHTML = `<p class="text-muted small mb-0">${t("no_permission")}</p>`; return; }
  const snap = await fs.getDocs(fs.query(col("enrollments"), fs.where("studentId", "==", student.id)));
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => !x.deleted);
  const head = `<div class="d-flex align-items-center mb-3"><h2 class="h6 fw-bold mb-0">${t("student_courses")}</h2>
    ${can(S, "enrollments", "add") ? `<button class="btn btn-sm btn-brand ms-auto" id="enrollBtn"><i class="bi bi-plus-lg"></i> ${t("new_enrollment")}</button>` : ""}</div>`;
  if (!list.length) { box.innerHTML = head + `<p class="text-muted small mb-0">${t("no_enrollments")}</p>`; }
  else {
    const all = list.reduce((a, e) => { const x = enrollmentTotals(e); a.total += x.total; a.paid += x.paid; a.rem += x.remaining; a.od += x.overdueCount; return a; }, { total: 0, paid: 0, rem: 0, od: 0 });
    box.innerHTML = head + (all.od ? `<div class="alert alert-danger py-2"><i class="bi bi-exclamation-triangle"></i> ${t("overdue_warning")} (${all.od})</div>` : "") +
      list.map((e) => `<div class="enroll-card">
        <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
          <a href="#group/${e.groupId}" class="badge text-bg-light font-monospace text-decoration-none">${esc(e.groupCode)}</a>
          <span class="fw-semibold">${esc(e.courseName)}</span> ${statusBadge(e.status)}
          ${e.discount ? `<span class="badge text-bg-info" title="${esc(e.discountReason)}">${t("discount")}: ${fmtMoney(e.discount)}</span>` : ""}
          ${can(S, "payments", "add") && enrollmentTotals(e).remaining > 0 ? `<button class="btn btn-sm btn-success ms-auto" data-pay="${e.id}"><i class="bi bi-cash"></i> ${t("record_payment")}</button>` : ""}
        </div>
        ${e.discount ? `<p class="small text-muted mb-2">${t("discount_reason")}: ${esc(e.discountReason)} — ${esc(e.discountBy)}</p>` : ""}
        ${installmentsTable(e)}
      </div>`).join("") +
      `<div class="totals-bar grand mt-3"><span>${t("grand_required")}: <b>${fmtMoney(all.total)}</b></span><span>${t("grand_collected")}: <b class="text-success">${fmtMoney(all.paid)}</b></span><span>${t("grand_remaining")}: <b class="${all.rem > 0 ? "text-danger" : ""}">${fmtMoney(all.rem)}</b></span></div>`;
    box.querySelectorAll("[data-pay]").forEach((b) => b.addEventListener("click", () => openPayment(list.find((e) => e.id === b.dataset.pay), reload)));
  }
  box.querySelector("#enrollBtn")?.addEventListener("click", () => openEnroll(student, reload));
}

export async function studentPayments(box, student) {
  const S = session();
  if (!can(S, "payments", "view")) { box.innerHTML = `<p class="text-muted small mb-0">${t("no_permission")}</p>`; return; }
  const snap = await fs.getDocs(fs.query(col("payments"), fs.where("studentId", "==", student.id)));
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (b.code || "").localeCompare(a.code || ""));
  box.innerHTML = list.length ? paymentsTable(list, false) : `<p class="text-muted small mb-0">${t("no_payments")}</p>`;
  bindReprint(box, list);
}

export function paymentsTable(list, withStudent = true) {
  return `<div class="table-responsive"><table class="table table-sm align-middle mb-0">
    <thead><tr><th>${t("code")}</th><th>${t("pay_date")}</th>${withStudent ? `<th>${t("student")}</th>` : ""}<th>${t("course")}</th><th>${t("installment")}</th><th>${t("amount")}</th><th>${t("pay_method")}</th><th>${t("treasury")}</th><th>${t("received_by")}</th><th></th></tr></thead>
    <tbody>${list.map((p) => `<tr>
      <td class="font-monospace small">${esc(p.code)}</td><td dir="ltr" class="text-end small">${esc(p.date)}</td>
      ${withStudent ? `<td><a href="#student/${p.studentId}">${esc(p.studentCode)} ${esc(p.studentName)}</a></td>` : ""}
      <td class="small">${esc(p.groupCode)}</td><td>#${esc(p.installmentNo)}</td><td class="fw-semibold text-success">${fmtMoney(p.amount)}</td>
      <td class="small">${t("m_" + p.method)}</td><td class="small">${esc(p.treasuryName)}</td><td class="small">${esc(p.receivedBy)}</td>
      <td><button class="btn btn-sm btn-outline-secondary" data-print="${p.id}" title="${t("print")}"><i class="bi bi-printer"></i></button></td></tr>`).join("")}</tbody></table></div>`;
}

export function bindReprint(box, list) {
  box.querySelectorAll("[data-print]").forEach((b) => b.addEventListener("click", () => printReceipt(list.find((p) => p.id === b.dataset.print))));
}

// طلاب مجموعة أو كورس
export async function enrolledStudents(box, field, id) {
  const S = session();
  if (!can(S, "enrollments", "view")) { box.innerHTML = `<p class="text-muted small mb-0">${t("no_permission")}</p>`; return; }
  const snap = await fs.getDocs(fs.query(col("enrollments"), fs.where(field, "==", id)));
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => !x.deleted);
  if (!list.length) { box.innerHTML = `<p class="text-muted small mb-0">${t("no_data")}</p>`; return; }
  box.innerHTML = `<div class="table-responsive"><table class="table table-sm table-hover align-middle mb-0">
    <thead><tr><th>${t("code")}</th><th>${t("full_name")}</th>${field === "courseId" ? `<th>${t("group")}</th>` : ""}<th>${t("final_price")}</th><th>${t("collected")}</th><th>${t("left")}</th><th>${t("status")}</th></tr></thead>
    <tbody>${list.map((e) => { const x = enrollmentTotals(e); return `<tr class="row-link" data-href="#student/${e.studentId}">
      <td class="font-monospace small">${esc(e.studentCode)}</td><td>${esc(e.studentName)} ${x.overdueCount ? `<i class="bi bi-exclamation-triangle-fill text-danger" title="${t("overdue_warning")}"></i>` : ""}</td>
      ${field === "courseId" ? `<td class="small">${esc(e.groupCode)}</td>` : ""}
      <td>${fmtMoney(x.total)}</td><td class="text-success">${fmtMoney(x.paid)}</td><td class="${x.remaining > 0 ? "text-danger" : ""}">${fmtMoney(x.remaining)}</td><td>${statusBadge(e.status)}</td></tr>`; }).join("")}</tbody></table></div>`;
  box.querySelectorAll("tr[data-href]").forEach((tr) => tr.addEventListener("click", () => { location.hash = tr.dataset.href; }));
}
