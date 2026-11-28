// مستحقات المحاضر: النسبة بتتحسب على المحصّل فعلاً من طلاب المجموعة
import { fs } from "./firebase.js?v=20261128082152";
import { t } from "./i18n.js?v=20261128082152";
import { esc } from "./util.js?v=20261128082152";
import { col, session } from "./data.js?v=20261128082152";
import { can } from "./perms.js?v=20261128082152";
import { fmtMoney } from "./crud.js?v=20261128082152";

const r2 = (n) => Math.round(n * 100) / 100;

export async function instructorDues(box, inst, groups, sessions = []) {
  const S = session();
  if (!can(S, "payments", "view") || !can(S, "expenses", "view")) { box.innerHTML = `<p class="text-muted small mb-0">${t("dues_need_perm")}</p>`; return; }
  if (!inst.payType) { box.innerHTML = `<p class="text-muted small mb-0">${t("dues_no_scheme")}</p>`; return; }
  const paidSnap = await fs.getDocs(fs.query(col("transactions"), fs.where("instructorId", "==", inst.id)));
  const paidTx = paidSnap.docs.map((d) => d.data()).filter((x) => x.type === "expense" && !x.reversedBy);
  const rows = [];
  for (const g of groups) {
    let base = null, due = null;
    if (inst.payType === "percentage") {
      const ps = (await fs.getDocs(fs.query(col("payments"), fs.where("groupId", "==", g.id)))).docs.map((d) => d.data()).filter((p) => !p.reversedBy);
      // الاسترداد بيتوزع على المجموعات حسب المدفوع فيها (عشان الطالب اللي اتنقل ودفع في مجموعته القديمة)
      let refunded = 0;
      for (const eid of [...new Set(ps.map((p) => p.enrollmentId))]) {
        const [allP, tx] = await Promise.all([
          fs.getDocs(fs.query(col("payments"), fs.where("enrollmentId", "==", eid))),
          fs.getDocs(fs.query(col("transactions"), fs.where("enrollmentId", "==", eid)))
        ]);
        const total = allP.docs.map((d) => d.data()).filter((p) => !p.reversedBy).reduce((a, p) => a + p.amount, 0);
        const here = ps.filter((p) => p.enrollmentId === eid).reduce((a, p) => a + p.amount, 0);
        const ref = tx.docs.map((d) => d.data()).filter((x) => x.type === "refund" && !x.reversedBy).reduce((a, x) => a + x.amount, 0);
        if (total > 0) refunded += (ref * here) / total;
      }
      base = r2(ps.reduce((a, p) => a + p.amount, 0) - refunded);
      due = r2(base * (Number(inst.payAmount) || 0) / 100);
    } else if (inst.payType === "perStudent") {
      const es = await fs.getDocs(fs.query(col("enrollments"), fs.where("groupId", "==", g.id), fs.where("status", "==", "active")));
      base = es.size;
      due = r2(base * (Number(inst.payAmount) || 0));
    } else if (inst.payType === "hourly" && can(S, "sessions", "view")) {
      base = r2(sessions.filter((x) => x.groupId === g.id).reduce((s2, x) => s2 + (Number(x.hours) || 0), 0));
      due = r2(base * (Number(inst.payAmount) || 0));
    }
    const paid = r2(paidTx.filter((x) => x.groupId === g.id).reduce((s, x) => s + x.amount, 0));
    rows.push({ g, base, due, paid, left: due == null ? null : r2(due - paid) });
  }
  const general = r2(paidTx.filter((x) => !x.groupId).reduce((s, x) => s + x.amount, 0));
  const baseLabel = { percentage: "dues_base_collected", perStudent: "dues_base_students", hourly: can(S, "sessions", "view") ? "dues_base_hours" : null }[inst.payType];
  const canPay = can(S, "expenses", "add");
  box.innerHTML = `
    ${["salary", "hourly"].includes(inst.payType) ? `<p class="small text-muted">${t(inst.payType === "salary" ? "dues_salary_note" : "dues_hourly_note")} ${fmtMoney(inst.payAmount)}</p>` : ""}
    ${rows.length ? `<div class="table-responsive"><table class="table table-sm align-middle mb-2">
      <thead><tr><th>${t("group")}</th>${baseLabel ? `<th>${t(baseLabel)}</th><th>${t("dues_due")}</th>` : ""}<th>${t("dues_paid")}</th>${baseLabel ? `<th>${t("left")}</th>` : ""}<th></th></tr></thead>
      <tbody>${rows.map((r) => `<tr><td><a href="#group/${r.g.id}">${esc(r.g.code)}</a></td>
        ${baseLabel ? `<td>${inst.payType === "percentage" ? fmtMoney(r.base) : r.base}</td><td>${fmtMoney(r.due)}</td>` : ""}
        <td class="text-success">${fmtMoney(r.paid)}</td>
        ${baseLabel ? `<td class="fw-semibold ${r.left > 0 ? "text-danger" : ""}">${fmtMoney(r.left)}</td>` : ""}
        <td>${canPay ? `<button class="btn btn-sm btn-wide btn-outline-success" data-payout="${r.g.id}" data-amt="${r.left > 0 ? r.left : ""}"><i class="bi bi-cash-coin"></i> ${t("pay_out")}</button>` : ""}</td></tr>`).join("")}</tbody></table></div>` : `<p class="text-muted small">${t("no_data")}</p>`}
    ${general ? `<p class="small">${t("dues_general_paid")}: <b>${fmtMoney(general)}</b></p>` : ""}
    ${canPay ? `<button class="btn btn-sm btn-outline-success" data-payout="" data-amt=""><i class="bi bi-cash-coin"></i> ${t("pay_out_general")}</button>` : ""}`;
  box.querySelectorAll("[data-payout]").forEach((b) => b.addEventListener("click", async () => {
    const { openExpense } = await import("./views/finance.js?v=20261128082152");
    const g = groups.find((x) => x.id === b.dataset.payout);
    openExpense(() => instructorDues(box, inst, groups), {
      categoryName: t("instructor_pay_cat"), instructorId: inst.id, groupId: g ? g.id : "", amount: b.dataset.amt,
      reason: `${t("instructor_pay_cat")} — ${inst.name}${g ? ` — ${g.code}` : ""}`
    });
  }));
}
