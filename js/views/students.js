import { t } from "../i18n.js?v=20261128080223";
import { esc, toast } from "../util.js?v=20261128080223";
import { session } from "../data.js?v=20261128080223";
import { can, hasSpecial } from "../perms.js?v=20261128080223";
import { crudView, statusBadge, infoGrid, getOne, fmtMoney } from "../crud.js?v=20261128080223";
import { createLogin, sendReset, passwordField } from "../accounts.js?v=20261128080223";
import { loadStudentEnrollments, loadStudentPayments, renderStudentEnrollments, renderStudentPayments, enrollmentTotals } from "../enroll.js?v=20261128080223";
import { studentSessionsList, attStats, pctText, attBadge, loadEvaluations, effectiveAttGrade, gradeText, openEvaluation, loadDiscipline, activeSuspension, disciplineTable, bindDiscipline, openDiscipline } from "../ops.js?v=20261128080223";

const statuses = ["active", "suspended", "archived"];

function age(birth) {
  if (!birth) return "";
  const b = new Date(birth); const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--;
  return a >= 0 ? `${a} ${t("years")}` : "";
}

export const view = crudView({
  coll: "students", title: "students", addLabel: "add_student", codePrefix: "STD", codePad: 5, detail: "student",
  fields: async (existing) => [
    { name: "name", label: "full_name", required: true },
    { name: "phone", label: "phone", type: "tel", ltr: true, required: true },
    { name: "email", label: "email", type: "email", ltr: true, disabled: !!(existing && existing.uid) },
    { name: "birthDate", label: "birth_date", type: "date" },
    { name: "university", label: "university" },
    { name: "faculty", label: "faculty" },
    { name: "year", label: "study_year" },
    { name: "address", label: "address" },
    { name: "status", label: "status", type: "select", default: "active", options: statuses.map((s) => ({ value: s, label: t("st_" + s) })) },
    ...(existing ? [] : [passwordField]),
    { name: "notes", label: "notes", type: "textarea", col: "col-12" }
  ],
  beforeCreate: async (data, form, id) => {
    const pass = form.elements.password ? form.elements.password.value : "";
    if (!pass) return {};
    const uid = await createLogin("student", id, data.name, data.email, pass);
    return { uid };
  },
  columns: [
    { key: "code", label: "code", render: (x) => `<span class="badge text-bg-light font-monospace">${esc(x.code)}</span>` },
    { key: "name", label: "full_name", render: (x) => `<span class="fw-semibold">${esc(x.name)}</span>` },
    { key: "phone", label: "phone", render: (x) => `<span dir="ltr">${esc(x.phone || "-")}</span>` },
    { key: "faculty", label: "faculty" },
    { key: "status", label: "status", render: (x) => statusBadge(x.status) }
  ]
});

export const render = (root) => view.render(root);

// الكورس المختار في فلتر صفحة كل طالب (بيفضل محفوظ لما الصفحة تتحدث بعد دفعة أو تقييم)
const courseFilter = {};

export async function renderDetail(root, id) {
  const S = session();
  const s = await getOne("students", id);
  if (!s || s.deleted) { root.innerHTML = `<div class="alert alert-warning">${t("not_found")}</div>`; return; }
  const P = { enr: can(S, "enrollments", "view"), pay: can(S, "payments", "view"), ses: can(S, "sessions", "view"), ev: can(S, "evaluations", "view"), disc: can(S, "discipline", "view") };
  const [enrolls, pays, sessions, evals, discs] = await Promise.all([
    P.enr ? loadStudentEnrollments(id) : [], P.pay ? loadStudentPayments(id) : [], P.ses ? studentSessionsList(id) : [],
    P.ev ? loadEvaluations("studentId", id) : [], P.disc ? loadDiscipline(id) : []
  ]);
  // الكورسات اللي ليها أي بيانات للطالب ده
  const courses = [];
  const addCourse = (cid, name) => { if (cid && !courses.find((c) => c.id === cid)) courses.push({ id: cid, name: name || cid }); };
  enrolls.forEach((e) => addCourse(e.courseId, e.courseName));
  [...sessions, ...pays, ...evals, ...discs].forEach((x) => addCourse(x.courseId, x.courseName));
  if (courseFilter[id] && !courses.find((c) => c.id === courseFilter[id])) courseFilter[id] = "";
  const susp = activeSuspension(discs);

  const accountBox = s.uid
    ? `<span class="badge text-bg-success">${t("has_portal")}</span> ${hasSpecial(S, "resetPassword") && s.email ? `<button id="resetBtn" class="btn btn-sm btn-outline-primary ms-2">${t("send_reset")}</button>` : ""}`
    : `<span class="badge text-bg-light">${t("no_portal")}</span> ${can(S, "students", "add") ? `<button id="loginBtn" class="btn btn-sm btn-outline-primary ms-2">${t("create_portal")}</button>` : ""}`;
  root.innerHTML = `
    <a href="#students" class="small text-decoration-none"><i class="bi bi-arrow-right"></i> ${t("students")}</a>
    <div class="d-flex flex-wrap align-items-center gap-2 my-3">
      <span class="badge text-bg-dark font-monospace fs-6">${esc(s.code)}</span>
      <h1 class="h4 fw-bold mb-0">${esc(s.name)}</h1> ${statusBadge(s.status)}
      ${susp ? `<span class="badge ds-in_force"><i class="bi bi-slash-circle"></i> ${t("suspended_until")} <bdi>${esc(susp.endDate)}</bdi></span>` : ""}
      ${can(S, "students", "edit") ? `<button id="editBtn" class="btn btn-sm btn-outline-secondary ms-auto"><i class="bi bi-pencil-square"></i> ${t("edit")}</button>` : ""}
    </div>
    <div class="row g-3">
      <div class="col-12"><div class="card card-soft p-4">
        <div class="row">
          <div class="col-lg-6">${infoGrid([["phone", `<span dir="ltr">${esc(s.phone)}</span>`], ["email", `<span dir="ltr">${esc(s.email)}</span>`], ["birth_date", s.birthDate ? `<span dir="ltr">${esc(s.birthDate)}</span> (${age(s.birthDate)})` : ""], ["address", esc(s.address)]])}</div>
          <div class="col-lg-6">${infoGrid([["university", esc(s.university)], ["faculty", esc(s.faculty)], ["study_year", esc(s.year)], ["portal_account", accountBox]])}</div>
        </div>
        ${s.notes ? `<hr><h2 class="h6 fw-bold">${t("notes")}</h2><p class="mb-0 pre-line">${esc(s.notes)}</p>` : ""}
      </div></div>
      ${courses.length ? `<div class="col-12"><div class="course-filter" role="tablist" aria-label="${t("filter_by_course")}">
        <span class="cf-label">${t("filter_by_course")}</span>
        <button type="button" class="cf-btn" data-course="">${t("all_courses")}</button>
        ${courses.map((c) => `<button type="button" class="cf-btn" data-course="${esc(c.id)}">${esc(c.name)}</button>`).join("")}
      </div></div>` : ""}
      <div class="col-12" id="statBox"></div>
      <div class="col-12"><div class="card card-soft p-4" id="enrollBox"></div></div>
      <div class="col-12"><div class="card card-soft p-4" id="attBox"></div></div>
      <div class="col-12"><div class="card card-soft p-4"><h2 class="h6 fw-bold mb-3">${t("payments_history")}</h2><div id="payBox"></div></div></div>
      <div class="col-12"><div class="card card-soft p-4" id="discBox"></div></div>
    </div>`;
  const reload = () => renderDetail(root, id);
  root.querySelector("#editBtn")?.addEventListener("click", () => view.openForm(s, reload));
  root.querySelector("#resetBtn")?.addEventListener("click", async () => { await sendReset(s.email); toast(t("reset_sent_to") + " " + s.email); });
  root.querySelector("#loginBtn")?.addEventListener("click", () => import("./portal-account.js?v=20261128080223").then((m) => m.openCreateLogin("students", "student", s, reload)));

  const draw = () => {
    const cid = courseFilter[id] || "";
    const pick = (list) => (cid ? list.filter((x) => x.courseId === cid) : list);
    root.querySelectorAll(".cf-btn").forEach((b) => { const on = b.dataset.course === cid; b.classList.toggle("active", on); b.setAttribute("aria-selected", on); });
    const E = pick(enrolls), PY = pick(pays), SE = pick(sessions), D = pick(discs);

    // ملخص سريع للاختيار الحالي
    const st = attStats(SE, id);
    const money = E.reduce((a, e) => { const x = enrollmentTotals(e); a.total += x.total; a.paid += x.paid; a.rem += x.remaining; a.od += x.overdueCount; return a; }, { total: 0, paid: 0, rem: 0, od: 0 });
    const tile = (label, value, cls = "") => `<div class="stat-tile"><span class="st-label">${t(label)}</span><span class="st-value ${cls}">${value}</span></div>`;
    root.querySelector("#statBox").innerHTML = `<div class="stat-row">
      ${P.enr ? tile("enrolled_courses", E.length) : ""}
      ${P.ses ? tile("attendance_rate", pctText(st.pct), st.pct == null ? "" : st.pct >= 75 ? "text-success" : "text-danger") + tile("absences", st.absent, st.absent ? "text-danger" : "") : ""}
      ${P.enr ? tile("collected", fmtMoney(money.paid), "text-success") + tile("left", fmtMoney(money.rem), money.rem > 0 ? "text-danger" : "") + tile("overdue_inst", money.od, money.od ? "text-danger" : "") : ""}
      ${P.disc ? tile("disc_count", D.length, D.length ? "text-warning-emphasis" : "") : ""}
    </div>`;

    const eb = root.querySelector("#enrollBox");
    if (!P.enr) eb.innerHTML = `<h2 class="h6 fw-bold mb-2">${t("student_courses")}</h2><p class="text-muted small mb-0">${t("no_permission")}</p>`;
    else renderStudentEnrollments(eb, s, E, reload);

    drawAttendance(root.querySelector("#attBox"), { s, cid, E, SE, evals, P, reload, select: (c) => { courseFilter[id] = c; draw(); window.scrollTo({ top: 0, behavior: "smooth" }); } });

    const pb = root.querySelector("#payBox");
    if (!P.pay) pb.innerHTML = `<p class="text-muted small mb-0">${t("no_permission")}</p>`;
    else renderStudentPayments(pb, PY);

    const db = root.querySelector("#discBox");
    db.innerHTML = `<div class="d-flex align-items-center mb-3"><h2 class="h6 fw-bold mb-0">${t("discipline_log")}</h2>
      ${can(S, "discipline", "add") ? `<button class="btn btn-sm btn-outline-danger ms-auto" id="discBtn"><i class="bi bi-exclamation-octagon"></i> ${t("add_discipline")}</button>` : ""}</div>
      ${P.disc ? disciplineTable(D, reload, { withCourse: !cid }) : `<p class="text-muted small mb-0">${t("no_permission")}</p>`}`;
    if (P.disc) bindDiscipline(db, D, reload);
    db.querySelector("#discBtn")?.addEventListener("click", () => openDiscipline(s, courses, cid, reload));
  };
  root.querySelectorAll(".cf-btn").forEach((b) => b.addEventListener("click", () => { courseFilter[id] = b.dataset.course; draw(); }));
  draw();
}

// الحضور والتقييم: في "كل الكورسات" ملخص لكل اشتراك، وفي كورس معيّن تفاصيل كل محاضرة
function drawAttendance(box, { s, cid, E, SE, evals, P, reload, select }) {
  const head = `<h2 class="h6 fw-bold mb-3">${t("attendance_evaluation")}</h2>`;
  if (!P.ses && !P.ev) { box.innerHTML = head + `<p class="text-muted small mb-0">${t("no_permission")}</p>`; return; }
  const statsFor = (e) => attStats(SE.filter((x) => x.courseId === e.courseId), s.id);
  const evFor = (e) => evals.find((x) => x.id === e.id);
  const canEv = (ev) => can(session(), "evaluations", ev ? "edit" : "add");
  const evBtn = (e, ev) => (P.ev && canEv(ev) && e.status !== "cancelled" ? `<button class="btn btn-sm btn-outline-primary" data-ev="${e.id}"><i class="bi bi-star-half"></i> ${t("evaluate")}</button>` : "");
  let html = head;
  if (!cid) {
    if (!E.length && !SE.length) { box.innerHTML = head + `<p class="text-muted small mb-0">${t("no_att_yet")}</p>`; return; }
    html += E.length ? `<div class="table-responsive"><table class="table table-sm align-middle mb-0">
      <thead><tr><th>${t("course")}</th><th>${t("group")}</th>${P.ses ? `<th>${t("attendance")}</th>` : ""}${P.ev ? `<th>${t("att_grade")}</th><th>${t("part_grade")}</th>` : ""}<th></th></tr></thead>
      <tbody>${E.map((e) => { const st = statsFor(e), ev = evFor(e); return `<tr>
        <td class="fw-semibold">${esc(e.courseName)}</td><td><bdi class="code-chip">${esc(e.groupCode)}</bdi> ${e.status !== "active" ? statusBadge(e.status) : ""}</td>
        ${P.ses ? `<td><b>${pctText(st.pct)}</b> <span class="text-muted small">(${st.present + st.late}/${st.total})</span></td>` : ""}
        ${P.ev ? `<td>${gradeText(effectiveAttGrade(ev, st))}</td><td>${gradeText(ev ? ev.participationGrade : null)}</td>` : ""}
        <td class="text-end text-nowrap">${evBtn(e, ev)} <button class="btn btn-sm btn-outline-secondary" data-sel="${esc(e.courseId)}">${t("course_details")}</button></td></tr>`; }).join("")}</tbody></table></div>`
      : `<p class="text-muted small mb-0">${t("att_need_enroll_perm")}</p>`;
  } else {
    html += E.map((e) => { const st = statsFor(e), ev = evFor(e); return `<div class="eval-card">
      <div class="d-flex flex-wrap align-items-center gap-2 mb-2"><bdi class="code-chip">${esc(e.groupCode)}</bdi> <span class="fw-semibold">${esc(e.courseName)}</span> ${statusBadge(e.status)}<span class="ms-auto">${evBtn(e, ev)}</span></div>
      ${P.ses ? `<div class="att-summary">${["present", "late", "excused", "absent"].map((a) => `<span>${attBadge(a)} <b>${st[a]}</b></span>`).join("")}<span>${t("attendance_rate")}: <b>${pctText(st.pct)}</b></span></div>` : ""}
      ${P.ev ? `<div class="small mt-2">${t("att_grade")}: ${gradeText(effectiveAttGrade(ev, st))} · ${t("part_grade")}: ${gradeText(ev ? ev.participationGrade : null)}
        ${ev && ev.notes ? `<div class="pre-line mt-1">${t("eval_notes")}: ${esc(ev.notes)}</div>` : ""}${ev ? `<div class="text-muted mt-1">${t("by")} ${esc(ev.updatedBy)}</div>` : ""}</div>` : ""}
    </div>`; }).join("");
    if (P.ses) html += SE.length ? `<h3 class="h6 fw-semibold mt-3 mb-2">${t("sessions_log")}</h3><div class="table-responsive"><table class="table table-sm align-middle mb-0">
      <thead><tr><th>#</th><th>${t("date")}</th><th>${t("group")}</th><th>${t("topic")}</th><th>${t("status")}</th></tr></thead>
      <tbody>${SE.map((x) => `<tr><td class="text-muted">${esc(x.no || "")}</td><td dir="ltr" class="text-end text-nowrap">${esc(x.date)}</td>
        <td><a href="#group/${x.groupId}" class="code-chip text-decoration-none">${esc(x.groupCode)}</a></td><td>${esc(x.topic || "-")}</td><td>${attBadge((x.attendance || {})[s.id])}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="text-muted small mt-2 mb-0">${t("no_att_yet")}</p>`;
  }
  box.innerHTML = html;
  box.querySelectorAll("[data-sel]").forEach((b) => b.addEventListener("click", () => select(b.dataset.sel)));
  box.querySelectorAll("[data-ev]").forEach((b) => b.addEventListener("click", () => {
    const e = E.find((x) => x.id === b.dataset.ev);
    openEvaluation(e, statsFor(e), evFor(e), reload);
  }));
}
