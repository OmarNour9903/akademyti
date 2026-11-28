// التشغيل اليومي: المحاضرات والحضور، التقييمات، الانضباط، المحتوى
import { fs } from "./firebase.js?v=20261128080337";
import { t } from "./i18n.js?v=20261128080337";
import { esc, toast, openModal, confirmBox, UserError } from "./util.js?v=20261128080337";
import { col, ref, audit, softDelete, session } from "./data.js?v=20261128080337";
import { can } from "./perms.js?v=20261128080337";
import { today } from "./enroll.js?v=20261128080337";

const noPerm = () => `<p class="text-muted small mb-0">${t("no_permission")}</p>`;
const empty = (key = "no_data") => `<p class="text-muted small mb-0">${t(key)}</p>`;
const byName = () => session().profile.name || session().user.email || "";
const r1 = (n) => Math.round(n * 10) / 10;
const afterClose = (fn) => document.getElementById("appModal").addEventListener("hidden.bs.modal", fn, { once: true });

// ===== الحضور =====
export const ATT = ["present", "late", "excused", "absent"];
const ATT_ICON = { present: "bi-check-lg", late: "bi-clock", excused: "bi-envelope-paper", absent: "bi-x-lg" };
export const attBadge = (s) => (s ? `<span class="badge att-${s}"><i class="bi ${ATT_ICON[s]}"></i> ${t("att_" + s)}</span>` : `<span class="text-muted small">—</span>`);

const clean = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => !x.deleted);
const byDate = (a, b) => (a.date || "").localeCompare(b.date || "") || (a.no || 0) - (b.no || 0);

export async function groupSessionsList(groupId) {
  return clean(await fs.getDocs(fs.query(col("sessions"), fs.where("groupId", "==", groupId)))).sort(byDate);
}
export async function studentSessionsList(studentId) {
  return clean(await fs.getDocs(fs.query(col("sessions"), fs.where("studentIds", "array-contains", studentId)))).sort(byDate);
}

// نسبة الحضور: (حاضر + متأخر) ÷ (المحاضرات المسجّلة − الغياب بعذر)
export function attStats(sessions, studentId) {
  const s = { present: 0, late: 0, excused: 0, absent: 0, total: 0 };
  for (const x of sessions) {
    const st = (x.attendance || {})[studentId];
    if (!st) continue;
    s[st]++; s.total++;
  }
  const base = s.total - s.excused;
  s.pct = base > 0 ? Math.round(((s.present + s.late) / base) * 100) : null;
  return s;
}
export const pctText = (p) => (p == null ? "-" : `${p}%`);
const pctClass = (p) => (p == null ? "" : p >= 75 ? "text-success" : p >= 50 ? "text-warning-emphasis" : "text-danger");

// التقدير من 10 ← وصف
export const autoGrade = (pct) => (pct == null ? null : r1(pct / 10));
export function gradeLabel(n) {
  if (n == null || n === "") return "";
  const v = Number(n);
  return t(v >= 9 ? "gr_excellent" : v >= 8 ? "gr_vgood" : v >= 6.5 ? "gr_good" : v >= 5 ? "gr_pass" : "gr_weak");
}
export const gradeText = (n) => (n == null || n === "" ? "-" : `${r1(Number(n))}/10 <span class="text-muted small">${gradeLabel(n)}</span>`);

// ===== محاضرات المجموعة =====
export async function groupSessions(box, group, onChange) {
  const S = session();
  if (!can(S, "sessions", "view")) { box.innerHTML = noPerm(); return; }
  const list = await groupSessionsList(group.id);
  const canAdd = can(S, "sessions", "add"), canEdit = can(S, "sessions", "edit"), canDel = can(S, "sessions", "delete");
  const reload = () => { groupSessions(box, group, onChange); if (onChange) onChange(); };
  box.innerHTML = `<div class="d-flex flex-wrap align-items-center gap-2 mb-3"><h2 class="h6 fw-bold mb-0">${t("sessions")}</h2>
      <span class="text-muted small">${list.length} ${t("session_unit")}</span>
      ${canAdd ? `<button class="btn btn-sm btn-brand ms-auto" id="addSession"><i class="bi bi-plus-lg"></i> ${t("add_session")}</button>` : ""}</div>
    ${list.length ? `<div class="table-responsive"><table class="table table-sm align-middle mb-0">
      <thead><tr><th>#</th><th>${t("date")}</th><th>${t("topic")}</th><th>${t("instructor")}</th><th>${t("hours")}</th><th>${t("attendance")}</th><th></th></tr></thead>
      <tbody>${list.map((x) => {
        const v = Object.values(x.attendance || {});
        const came = v.filter((a) => a === "present" || a === "late").length;
        return `<tr><td class="text-muted">${esc(x.no || "")}</td><td dir="ltr" class="text-end text-nowrap">${esc(x.date)}</td><td>${esc(x.topic || "-")}</td>
          <td class="small">${esc(x.instructorName || "-")}</td><td>${esc(x.hours ?? "-")}</td>
          <td>${v.length ? `<span class="fw-semibold">${came}</span> / ${v.length}` : `<span class="badge text-bg-warning">${t("att_not_taken")}</span>`}</td>
          <td class="text-nowrap text-end">
            ${canEdit ? `<button class="btn btn-sm btn-wide btn-success" data-att="${x.id}"><i class="bi bi-person-check"></i> ${t(v.length ? "edit_attendance" : "take_attendance")}</button>
              <button class="btn btn-sm btn-outline-secondary" data-edit="${x.id}" title="${t("edit")}" aria-label="${t("edit")}"><i class="bi bi-pencil-square"></i></button>` : ""}
            ${canDel ? `<button class="btn btn-sm btn-outline-danger" data-del="${x.id}" title="${t("delete")}" aria-label="${t("delete")}"><i class="bi bi-trash3"></i></button>` : ""}
          </td></tr>`; }).join("")}</tbody></table></div>` : empty("no_sessions")}`;
  const find = (id) => list.find((x) => x.id === id);
  box.querySelector("#addSession")?.addEventListener("click", () => openSession(group, null, list, reload));
  box.querySelectorAll("[data-att]").forEach((b) => b.addEventListener("click", () => openAttendance(find(b.dataset.att), group, reload)));
  box.querySelectorAll("[data-edit]").forEach((b) => b.addEventListener("click", () => openSession(group, find(b.dataset.edit), list, reload)));
  box.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", async () => {
    const x = find(b.dataset.del);
    if (!(await confirmBox(`${t("confirm_delete")} "${t("session")} ${x.no || ""} — ${x.date}"؟`))) return;
    await softDelete("sessions", x.id, `${group.code} — ${t("session")} ${x.no || ""} (${x.date})`);
    toast(t("moved_to_trash"));
    reload();
  }));
}

function openSession(group, existing, list, done) {
  const ids = group.instructorIds || [];
  const opts = ids.map((iid, i) => `<option value="${esc(iid)}" ${existing ? (existing.instructorId === iid ? "selected" : "") : i === 0 ? "selected" : ""}>${esc((group.instructorNames || [])[i] || iid)}</option>`).join("");
  const html = `<div class="row g-3">
    <div class="col-md-6"><label class="form-label">${t("date")} <span class="text-danger">*</span></label><input name="date" type="date" class="form-control" required value="${esc(existing ? existing.date : today())}"></div>
    <div class="col-md-6"><label class="form-label">${t("hours")}</label><input name="hours" type="number" min="0" step="any" class="form-control" value="${esc(existing ? existing.hours ?? "" : "")}"><div class="form-text">${t("hours_hint")}</div></div>
    <div class="col-12"><label class="form-label">${t("topic")}</label><input name="topic" class="form-control" value="${esc(existing ? existing.topic : "")}"></div>
    <div class="col-12"><label class="form-label">${t("instructor")}</label><select name="instructorId" class="form-select"><option value="">—</option>${opts}</select></div>
    <div class="col-12"><label class="form-label">${t("notes")}</label><textarea name="notes" rows="2" class="form-control">${esc(existing ? existing.notes : "")}</textarea></div>
  </div>`;
  openModal(existing ? `${t("edit")} — ${t("session")} ${existing.no || ""}` : `${t("add_session")} — ${group.code}`, html, async (form) => {
    const date = form.date.value;
    if (!date) throw new UserError("required");
    const iid = form.instructorId.value;
    const idx = ids.indexOf(iid);
    const data = {
      date, topic: form.topic.value.trim(), notes: form.notes.value.trim(),
      hours: form.hours.value === "" ? null : Number(form.hours.value),
      instructorId: iid, instructorName: idx >= 0 ? (group.instructorNames || [])[idx] || "" : ""
    };
    if (data.hours != null && (data.hours < 0 || Number.isNaN(data.hours))) throw new UserError("err_hours");
    if (existing) {
      await fs.updateDoc(ref("sessions", existing.id), { ...data, updatedAt: fs.serverTimestamp() });
      await audit("update", "sessions", existing.id, `${group.code} — ${t("session")} ${existing.no || ""}`, { date: existing.date, topic: existing.topic }, data);
      toast(t("saved"));
      done();
      return;
    }
    const no = list.reduce((m, x) => Math.max(m, x.no || 0), 0) + 1;
    const r = fs.doc(col("sessions"));
    const doc = { ...data, no, groupId: group.id, groupCode: group.code, courseId: group.courseId, courseName: group.courseName,
      attendance: {}, studentIds: [], names: {}, deleted: false, createdAt: fs.serverTimestamp(), createdBy: byName() };
    await fs.setDoc(r, doc);
    await audit("create", "sessions", r.id, `${group.code} — ${t("session")} ${no} (${date})`, null, data);
    toast(t("saved"));
    // بعد الحفظ على طول نفتح الحضور لو معاه صلاحية التعديل
    if (can(session(), "sessions", "edit")) afterClose(() => openAttendance({ id: r.id, ...doc }, group, done));
    else done();
  }, { size: "md" });
}

// شاشة الحضور: كل طالب في سطر، و4 زراير. الطلاب اللي لسه ما اتسجلوش بيبدأوا "حاضر"
export async function openAttendance(sess, group, done) {
  let students = [];
  if (can(session(), "enrollments", "view")) {
    const snap = await fs.getDocs(fs.query(col("enrollments"), fs.where("groupId", "==", group.id), fs.where("status", "==", "active")));
    students = clean(snap).map((e) => ({ id: e.studentId, code: e.studentCode, name: e.studentName }));
  }
  const att = sess.attendance || {};
  // اللي اتسجل حضوره قبل كده ونُقل أو اتلغى اشتراكه يفضل ظاهر
  Object.keys(att).forEach((sid) => {
    if (!students.find((s) => s.id === sid)) {
      const n = (sess.names || {})[sid] || sid;
      students.push({ id: sid, code: n.split(" ")[0], name: n.split(" ").slice(1).join(" "), former: true });
    }
  });
  if (!students.length) { toast(t(can(session(), "enrollments", "view") ? "no_group_students" : "att_need_enroll_perm"), "warning"); done(); return; }
  students.sort((a, b) => (a.code || "").localeCompare(b.code || ""));
  const fresh = !Object.keys(att).length;
  const row = (s, i) => {
    const cur = att[s.id] || (fresh ? "present" : "");
    return `<div class="att-row" data-sid="${esc(s.id)}">
      <div class="att-who"><span class="code-chip">${esc(s.code)}</span> <span class="fw-semibold">${esc(s.name)}</span>${s.former ? ` <span class="badge text-bg-light">${t("att_former")}</span>` : ""}</div>
      <div class="att-opts" role="radiogroup" aria-label="${esc(s.name)}">${ATT.map((a) => `
        <input type="radio" class="btn-check" name="a_${i}" id="a_${i}_${a}" value="${a}" ${cur === a ? "checked" : ""} autocomplete="off">
        <label class="btn btn-sm att-btn att-btn-${a}" for="a_${i}_${a}"><i class="bi ${ATT_ICON[a]}"></i><span>${t("att_" + a)}</span></label>`).join("")}</div>
    </div>`;
  };
  const html = `<div class="d-flex flex-wrap align-items-center gap-2 mb-3">
      <span class="small text-muted">${esc(group.code)} — ${t("session")} ${esc(sess.no || "")} — <bdi>${esc(sess.date)}</bdi></span>
      <span class="ms-auto small" id="attCount"></span>
      <button type="button" class="btn btn-sm btn-outline-success" id="allPresent"><i class="bi bi-check2-all"></i> ${t("all_present")}</button>
    </div>
    ${fresh ? `<p class="form-text mt-0">${t("att_default_note")}</p>` : ""}
    <div class="att-list">${students.map(row).join("")}</div>`;
  const body = openModal(t("attendance"), html, async (form) => {
    const out = {}, names = { ...(sess.names || {}) };
    students.forEach((s, i) => {
      const v = form.querySelector(`input[name="a_${i}"]:checked`);
      if (v) { out[s.id] = v.value; names[s.id] = `${s.code} ${s.name}`; }
    });
    await fs.updateDoc(ref("sessions", sess.id), { attendance: out, studentIds: Object.keys(out), names, takenBy: byName(), takenAt: fs.serverTimestamp(), updatedAt: fs.serverTimestamp() });
    const c = Object.values(out);
    await audit("update", "sessions", sess.id, `${group.code} — ${t("attendance")} ${t("session")} ${sess.no || ""}`, null,
      { present: c.filter((x) => x === "present").length, late: c.filter((x) => x === "late").length, excused: c.filter((x) => x === "excused").length, absent: c.filter((x) => x === "absent").length });
    toast(t("saved"));
    done();
  }, { submitLabel: t("save_attendance"), size: "lg" });
  const count = () => {
    const v = [...body.querySelectorAll("input.btn-check:checked")].map((x) => x.value);
    body.querySelector("#attCount").innerHTML = `${t("att_present")}: <b>${v.filter((x) => x === "present" || x === "late").length}</b> / ${students.length} · ${t("att_absent")}: <b class="text-danger">${v.filter((x) => x === "absent").length}</b>`;
  };
  body.addEventListener("change", count);
  body.querySelector("#allPresent").addEventListener("click", () => { students.forEach((s, i) => { body.querySelector(`#a_${i}_present`).checked = true; }); count(); });
  count();
}

// ===== التقييمات =====
export async function loadEvaluations(field, value) {
  return clean(await fs.getDocs(fs.query(col("evaluations"), fs.where(field, "==", value))));
}
export const effectiveAttGrade = (ev, stats) => (ev && ev.attendanceGrade != null && ev.attendanceGrade !== "" ? Number(ev.attendanceGrade) : autoGrade(stats.pct));

export function openEvaluation(e, stats, ev, done) {
  const auto = autoGrade(stats.pct);
  const html = `<p class="mb-3"><b>${esc(e.studentCode)} ${esc(e.studentName)}</b> — ${esc(e.groupCode)} ${esc(e.courseName)}</p>
    <div class="row g-3">
      <div class="col-md-6"><label class="form-label">${t("att_grade")}</label>
        <input name="attendanceGrade" type="number" min="0" max="10" step="0.5" class="form-control" value="${esc(ev && ev.attendanceGrade != null ? ev.attendanceGrade : "")}" placeholder="${auto == null ? "" : auto}">
        <div class="form-text">${t("att_grade_hint")} ${auto == null ? t("no_att_yet") : `${auto}/10 (${pctText(stats.pct)})`}</div></div>
      <div class="col-md-6"><label class="form-label">${t("part_grade")}</label>
        <input name="participationGrade" type="number" min="0" max="10" step="0.5" class="form-control" value="${esc(ev ? ev.participationGrade ?? "" : "")}"></div>
      <div class="col-12"><label class="form-label">${t("eval_notes")}</label><textarea name="notes" rows="3" class="form-control">${esc(ev ? ev.notes : "")}</textarea></div>
    </div>`;
  openModal(`${t("evaluation")} — ${e.studentCode}`, html, async (form) => {
    const num = (v) => (v === "" ? null : Number(v));
    const a = num(form.attendanceGrade.value), p = num(form.participationGrade.value);
    if ([a, p].some((x) => x != null && (Number.isNaN(x) || x < 0 || x > 10))) throw new UserError("err_grade");
    const data = { attendanceGrade: a, participationGrade: p, notes: form.notes.value.trim(), updatedBy: byName(), updatedAt: fs.serverTimestamp() };
    const r = ref("evaluations", e.id);
    if (ev) await fs.updateDoc(r, data);
    else await fs.setDoc(r, { ...data, enrollmentId: e.id, studentId: e.studentId, studentCode: e.studentCode, studentName: e.studentName,
      groupId: e.groupId, groupCode: e.groupCode, courseId: e.courseId, courseName: e.courseName, deleted: false, createdAt: fs.serverTimestamp() });
    await audit(ev ? "update" : "create", "evaluations", e.id, `${e.studentCode} — ${e.groupCode}`, ev ? { attendanceGrade: ev.attendanceGrade ?? null, participationGrade: ev.participationGrade ?? null } : null, { attendanceGrade: a, participationGrade: p });
    toast(t("saved"));
    done();
  }, { size: "md" });
}
const canEval = (ev) => can(session(), "evaluations", ev ? "edit" : "add");

// جدول حضور وتقييم طلاب المجموعة
export async function groupEvaluations(box, group) {
  const S = session();
  if (!can(S, "evaluations", "view") || !can(S, "enrollments", "view")) { box.innerHTML = noPerm(); return; }
  const [es, evs, sessions] = await Promise.all([
    fs.getDocs(fs.query(col("enrollments"), fs.where("groupId", "==", group.id))),
    loadEvaluations("groupId", group.id),
    can(S, "sessions", "view") ? groupSessionsList(group.id) : Promise.resolve([])
  ]);
  const list = clean(es).filter((e) => e.status === "active");
  if (!list.length) { box.innerHTML = empty("no_group_students"); return; }
  const reload = () => groupEvaluations(box, group);
  const rows = list.map((e) => ({ e, st: attStats(sessions, e.studentId), ev: evs.find((x) => x.id === e.id) }));
  box.innerHTML = `<div class="table-responsive"><table class="table table-sm align-middle mb-0">
    <thead><tr><th>${t("code")}</th><th>${t("full_name")}</th><th>${t("attendance")}</th><th>${t("att_grade")}</th><th>${t("part_grade")}</th><th>${t("eval_notes")}</th><th></th></tr></thead>
    <tbody>${rows.map(({ e, st, ev }) => `<tr>
      <td><a href="#student/${e.studentId}" class="code-chip text-decoration-none">${esc(e.studentCode)}</a></td><td>${esc(e.studentName)}</td>
      <td><span class="fw-semibold ${pctClass(st.pct)}">${pctText(st.pct)}</span> <span class="text-muted small">(${st.present + st.late}/${st.total})</span></td>
      <td>${gradeText(effectiveAttGrade(ev, st))}</td><td>${gradeText(ev ? ev.participationGrade : null)}</td>
      <td class="small text-muted">${esc(ev && ev.notes ? ev.notes : "-")}</td>
      <td class="text-end">${canEval(ev) ? `<button class="btn btn-sm btn-wide btn-outline-primary" data-ev="${e.id}"><i class="bi bi-star-half"></i> ${t("evaluate")}</button>` : ""}</td></tr>`).join("")}</tbody></table></div>`;
  box.querySelectorAll("[data-ev]").forEach((b) => b.addEventListener("click", () => {
    const r = rows.find((x) => x.e.id === b.dataset.ev);
    openEvaluation(r.e, r.st, r.ev, reload);
  }));
}

// ===== الانضباط =====
export const DISC = ["warning", "caution", "suspension"];
export const RESTRICT = ["portal", "content", "enroll", "attend"];
const DISC_ICON = { warning: "bi-exclamation-circle", caution: "bi-exclamation-triangle", suspension: "bi-slash-circle" };
const addDays = (iso, n) => { const d = new Date(iso + "T00:00:00"); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

export async function loadDiscipline(studentId) {
  return clean(await fs.getDocs(fs.query(col("discipline"), fs.where("studentId", "==", studentId))))
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}
// حالة الفصل المؤقت بتتحسب من التاريخ: ساري / خلص / اترفع
export function discState(d) {
  if (d.type !== "suspension") return "recorded";
  if (d.liftedAt) return "lifted";
  const now = today();
  if (now < d.date) return "upcoming";
  return now <= d.endDate ? "in_force" : "ended";
}
export const activeSuspension = (list) => list.find((d) => d.type === "suspension" && discState(d) === "in_force");

export function disciplineTable(list, reload, { withCourse = true } = {}) {
  if (!list.length) return empty("no_discipline");
  const canEdit = can(session(), "discipline", "edit"), canDel = can(session(), "discipline", "delete");
  return `<div class="table-responsive"><table class="table table-sm align-middle mb-0">
    <thead><tr><th>${t("date")}</th><th>${t("disc_type")}</th>${withCourse ? `<th>${t("course")}</th>` : ""}<th>${t("reason")}</th><th>${t("disc_by")}</th><th>${t("status")}</th><th></th></tr></thead>
    <tbody>${list.map((d) => { const st = discState(d); return `<tr>
      <td dir="ltr" class="text-end text-nowrap">${esc(d.date)}</td>
      <td><span class="badge disc-${d.type}"><i class="bi ${DISC_ICON[d.type]}"></i> ${t("disc_" + d.type)}</span></td>
      ${withCourse ? `<td class="small">${esc(d.courseName || t("disc_general"))}</td>` : ""}
      <td>${esc(d.reason)}${d.type === "suspension" ? `<div class="small text-muted">${d.days} ${t("days")} — ${t("until")} <bdi>${esc(d.endDate)}</bdi>${(d.restrictions || []).length ? ` — ${t("disc_blocked")}: ${d.restrictions.map((r) => t("rs_" + r)).join("، ")}` : ""}</div>` : ""}
        ${d.liftedAt ? `<div class="small text-success">${t("lifted_by")} ${esc(d.liftedBy)}: ${esc(d.liftReason)}</div>` : ""}</td>
      <td class="small">${esc(d.by)}</td>
      <td>${st === "recorded" ? "" : `<span class="badge ds-${st}">${t("ds_" + st)}</span>`}</td>
      <td class="text-end text-nowrap">
        ${canEdit && (st === "in_force" || st === "upcoming") ? `<button class="btn btn-sm btn-wide btn-outline-success" data-lift="${d.id}"><i class="bi bi-unlock"></i> ${t("lift_suspension")}</button>` : ""}
        ${canDel ? `<button class="btn btn-sm btn-outline-danger" data-ddel="${d.id}" title="${t("delete")}" aria-label="${t("delete")}"><i class="bi bi-trash3"></i></button>` : ""}
      </td></tr>`; }).join("")}</tbody></table></div>`;
}

export function bindDiscipline(box, list, reload) {
  box.querySelectorAll("[data-lift]").forEach((b) => b.addEventListener("click", () => {
    const d = list.find((x) => x.id === b.dataset.lift);
    openModal(t("lift_suspension"), `<p class="mb-2">${esc(d.studentCode)} ${esc(d.studentName)} — ${esc(d.reason)}</p>
      <label class="form-label">${t("lift_reason")} <span class="text-danger">*</span></label><input name="reason" class="form-control" required>`, async (form) => {
      const reason = form.reason.value.trim();
      if (!reason) throw new UserError("required");
      await fs.updateDoc(ref("discipline", d.id), { liftedAt: fs.serverTimestamp(), liftedBy: byName(), liftReason: reason, updatedAt: fs.serverTimestamp() });
      await audit("update", "discipline", d.id, `${d.studentCode} — ${t("lift_suspension")}`, null, { reason });
      toast(t("saved"));
      reload();
    }, { submitLabel: t("lift_suspension"), size: "md" });
  }));
  box.querySelectorAll("[data-ddel]").forEach((b) => b.addEventListener("click", async () => {
    const d = list.find((x) => x.id === b.dataset.ddel);
    if (!(await confirmBox(`${t("confirm_delete")} "${t("disc_" + d.type)} — ${d.date}"؟`))) return;
    await softDelete("discipline", d.id, `${d.studentCode} — ${t("disc_" + d.type)} (${d.date})`);
    toast(t("moved_to_trash"));
    reload();
  }));
}

// courses: [{id, name}] من اشتراكات الطالب. selCourse: الكورس المختار في الفلتر
export function openDiscipline(student, courses, selCourse, done) {
  const html = `<div class="row g-3">
    <div class="col-md-6"><label class="form-label">${t("disc_type")} <span class="text-danger">*</span></label>
      <select name="type" class="form-select">${DISC.map((d) => `<option value="${d}">${t("disc_" + d)}</option>`).join("")}</select></div>
    <div class="col-md-6"><label class="form-label">${t("date")} <span class="text-danger">*</span></label><input name="date" type="date" class="form-control" value="${today()}" required></div>
    <div class="col-12"><label class="form-label">${t("course")}</label><select name="courseId" class="form-select">
      <option value="">${t("disc_general")}</option>${courses.map((c) => `<option value="${esc(c.id)}" ${c.id === selCourse ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></div>
    <div class="col-12"><label class="form-label">${t("reason")} <span class="text-danger">*</span></label><textarea name="reason" rows="2" class="form-control" required></textarea></div>
    <div class="col-12 d-none" id="suspBox"><div class="row g-3">
      <div class="col-md-4"><label class="form-label">${t("susp_days")} <span class="text-danger">*</span></label><input name="days" type="number" min="1" step="1" class="form-control" value="7"></div>
      <div class="col-md-8"><label class="form-label">${t("disc_blocked")}</label><div class="checks-box">${RESTRICT.map((r) => `<div class="form-check">
        <input class="form-check-input" type="checkbox" name="restrict" value="${r}" id="rs_${r}" checked><label class="form-check-label" for="rs_${r}">${t("rs_" + r)}</label></div>`).join("")}</div>
        <div class="form-text">${t("restrict_note")}</div></div>
    </div></div>
  </div>`;
  const body = openModal(`${t("add_discipline")} — ${student.code}`, html, async (form) => {
    const type = form.type.value, reason = form.reason.value.trim(), date = form.date.value;
    if (!reason || !date) throw new UserError("required");
    const c = courses.find((x) => x.id === form.courseId.value);
    const data = { studentId: student.id, studentCode: student.code, studentName: student.name, type, reason, date,
      courseId: c ? c.id : "", courseName: c ? c.name : "", by: byName(), deleted: false, createdAt: fs.serverTimestamp() };
    if (type === "suspension") {
      const days = Math.floor(Number(form.days.value));
      if (!(days >= 1)) throw new UserError("err_days");
      data.days = days; data.endDate = addDays(date, days - 1);
      data.restrictions = [...form.querySelectorAll('input[name="restrict"]:checked')].map((x) => x.value);
    }
    const r = fs.doc(col("discipline"));
    await fs.setDoc(r, data);
    await audit("create", "discipline", r.id, `${student.code} — ${t("disc_" + type)}`, null, { type, reason, date, days: data.days || null });
    toast(t("saved"));
    done();
  }, { size: "md" });
  const sync = () => body.querySelector("#suspBox").classList.toggle("d-none", body.querySelector('[name="type"]').value !== "suspension");
  body.querySelector('[name="type"]').addEventListener("change", sync);
}

// ===== المحتوى (لينكات لحد ما ننقل على Blaze ونفعّل رفع الملفات) =====
export const CONTENT_TYPES = ["video", "pdf", "slides", "image", "file", "link"];
const CT_ICON = { video: "bi-play-btn", pdf: "bi-file-earmark-pdf", slides: "bi-easel", image: "bi-image", file: "bi-file-earmark-zip", link: "bi-link-45deg" };

// scope: { courseId, courseName, group? } — في صفحة الكورس بيظهر كل محتوى الكورس، وفي صفحة المجموعة محتوى الكورس العام + المجموعة دي
export async function contentSection(box, scope) {
  const S = session();
  if (!can(S, "content", "view")) { box.innerHTML = noPerm(); return; }
  let list = clean(await fs.getDocs(fs.query(col("content"), fs.where("courseId", "==", scope.courseId))));
  if (scope.group) list = list.filter((x) => !x.groupId || x.groupId === scope.group.id);
  list.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  const reload = () => contentSection(box, scope);
  const canEdit = can(S, "content", "edit"), canDel = can(S, "content", "delete");
  box.innerHTML = `<div class="d-flex flex-wrap align-items-center gap-2 mb-3"><h2 class="h6 fw-bold mb-0">${t("content")}</h2>
      ${can(S, "content", "add") ? `<button class="btn btn-sm btn-brand ms-auto" id="addContent"><i class="bi bi-plus-lg"></i> ${t("add_content")}</button>` : ""}</div>
    ${list.length ? `<ul class="content-list">${list.map((x) => `<li>
      <i class="bi ${CT_ICON[x.type] || "bi-link-45deg"} ct-icon"></i>
      <div class="flex-grow-1 min-w-0"><a href="${esc(x.url)}" target="_blank" rel="noopener" class="fw-semibold">${esc(x.title)}</a>
        <div class="small text-muted">${t("ct_" + x.type)} · ${x.groupCode ? `${t("group")} <bdi class="code-chip">${esc(x.groupCode)}</bdi>` : t("whole_course")} · <bdi>${esc(x.date)}</bdi> · ${esc(x.by)}</div></div>
      <span class="text-nowrap">${canEdit ? `<button class="btn btn-sm btn-outline-secondary" data-cedit="${x.id}" title="${t("edit")}" aria-label="${t("edit")}"><i class="bi bi-pencil-square"></i></button>` : ""}
      ${canDel ? `<button class="btn btn-sm btn-outline-danger" data-cdel="${x.id}" title="${t("delete")}" aria-label="${t("delete")}"><i class="bi bi-trash3"></i></button>` : ""}</span></li>`).join("")}</ul>` : empty("no_content")}`;
  const find = (id) => list.find((x) => x.id === id);
  box.querySelector("#addContent")?.addEventListener("click", () => openContent(scope, null, reload));
  box.querySelectorAll("[data-cedit]").forEach((b) => b.addEventListener("click", () => openContent(scope, find(b.dataset.cedit), reload)));
  box.querySelectorAll("[data-cdel]").forEach((b) => b.addEventListener("click", async () => {
    const x = find(b.dataset.cdel);
    if (!(await confirmBox(`${t("confirm_delete")} "${x.title}"؟`))) return;
    await softDelete("content", x.id, x.title);
    toast(t("moved_to_trash"));
    reload();
  }));
}

function openContent(scope, existing, done) {
  const v = (k, d = "") => esc(existing ? existing[k] ?? d : d);
  const html = `<div class="row g-3">
    <div class="col-12"><label class="form-label">${t("title")} <span class="text-danger">*</span></label><input name="title" class="form-control" required value="${v("title")}"></div>
    <div class="col-md-5"><label class="form-label">${t("ct_type")}</label><select name="type" class="form-select">${CONTENT_TYPES.map((c) => `<option value="${c}" ${existing && existing.type === c ? "selected" : ""}>${t("ct_" + c)}</option>`).join("")}</select></div>
    <div class="col-md-7"><label class="form-label">${t("date")}</label><input name="date" type="date" class="form-control" value="${v("date", today())}"></div>
    <div class="col-12"><label class="form-label">${t("link")} <span class="text-danger">*</span></label><input name="url" type="url" dir="ltr" class="form-control" required placeholder="https://" value="${v("url")}">
      <div class="form-text">${t("content_link_hint")}</div></div>
    ${scope.group ? `<div class="col-12"><label class="form-label">${t("ct_scope")}</label><select name="scope" class="form-select">
      <option value="group" ${!existing || existing.groupId ? "selected" : ""}>${t("this_group_only")} (${esc(scope.group.code)})</option>
      <option value="course" ${existing && !existing.groupId ? "selected" : ""}>${t("whole_course")}</option></select></div>` : ""}
  </div>`;
  openModal(existing ? `${t("edit")} — ${existing.title}` : t("add_content"), html, async (form) => {
    const title = form.title.value.trim(), url = form.url.value.trim();
    if (!title || !url) throw new UserError("required");
    if (!/^https?:\/\//i.test(url)) throw new UserError("err_url");
    const forGroup = scope.group && form.scope && form.scope.value === "group";
    const data = { title, url, type: form.type.value, date: form.date.value || today(),
      groupId: forGroup ? scope.group.id : (existing && !scope.group ? existing.groupId || "" : ""), groupCode: forGroup ? scope.group.code : (existing && !scope.group ? existing.groupCode || "" : "") };
    if (existing) {
      await fs.updateDoc(ref("content", existing.id), { ...data, updatedAt: fs.serverTimestamp() });
      await audit("update", "content", existing.id, title, { title: existing.title, url: existing.url }, data);
    } else {
      const r = fs.doc(col("content"));
      await fs.setDoc(r, { ...data, courseId: scope.courseId, courseName: scope.courseName, by: byName(), deleted: false, createdAt: fs.serverTimestamp() });
      await audit("create", "content", r.id, title, null, data);
    }
    toast(t("saved"));
    done();
  }, { size: "md" });
}

// ===== محاضرات المحاضر (ساعات التدريس) =====
export async function instructorSessions(box, instId) {
  if (!can(session(), "sessions", "view")) { box.innerHTML = noPerm(); return []; }
  const list = clean(await fs.getDocs(fs.query(col("sessions"), fs.where("instructorId", "==", instId)))).sort(byDate).reverse();
  const hours = r1(list.reduce((s, x) => s + (Number(x.hours) || 0), 0));
  box.innerHTML = list.length ? `<p class="small mb-2">${t("sessions")}: <b>${list.length}</b> · ${t("total_hours")}: <b>${hours}</b></p>
    <div class="table-responsive"><table class="table table-sm align-middle mb-0">
    <thead><tr><th>${t("date")}</th><th>${t("group")}</th><th>${t("topic")}</th><th>${t("hours")}</th><th>${t("attendance")}</th></tr></thead>
    <tbody>${list.map((x) => { const v = Object.values(x.attendance || {}); return `<tr>
      <td dir="ltr" class="text-end text-nowrap">${esc(x.date)}</td><td><a href="#group/${x.groupId}" class="code-chip text-decoration-none">${esc(x.groupCode)}</a></td>
      <td>${esc(x.topic || "-")}</td><td>${esc(x.hours ?? "-")}</td>
      <td>${v.length ? `${v.filter((a) => a === "present" || a === "late").length} / ${v.length}` : "-"}</td></tr>`; }).join("")}</tbody></table></div>` : empty("no_sessions");
  return list;
}
