import { fs } from "../firebase.js?v=20261126233856";
import { t } from "../i18n.js?v=20261126233856";
import { col, session } from "../data.js?v=20261126233856";
import { can } from "../perms.js?v=20261126233856";

const card = (icon, cls, key, id) => `<div class="col-md-6 col-xl-3"><div class="card stat-card p-3 d-flex flex-row align-items-center gap-3">
  <div class="stat-icon ${cls}"><i class="bi ${icon}"></i></div>
  <div><div class="text-muted small">${t(key)}</div><div class="stat-value" id="${id}">-</div></div></div></div>`;

async function count(q) {
  try { return (await fs.getCountFromServer(q)).data().count; } catch (e) { console.error(e); return "-"; }
}

export async function render(root) {
  const S = session();
  const cards = [];
  if (can(S, "students")) cards.push(card("bi-people-fill", "c1", "total_trainees", "statTotal"));
  if (can(S, "enrollments")) cards.push(card("bi-person-check-fill", "c2", "current_trainees", "statCurrent"));
  if (can(S, "courses")) cards.push(card("bi-journal-check", "c3", "available_courses", "statCourses"));
  if (can(S, "enrollments")) cards.push(card("bi-exclamation-triangle-fill", "c4", "overdue_card", "statOverdue"));
  root.innerHTML = `<h1 class="h4 fw-bold mb-4">${t("dashboard")}</h1>
    ${cards.length ? `<div class="row g-3">${cards.join("")}</div>` : `<div class="card card-soft p-4 text-muted">${t("welcome_no_stats")}</div>`}`;
  const set = async (id, q) => { const el = root.querySelector("#" + id); if (el) el.textContent = await count(q); };
  set("statTotal", fs.query(col("students"), fs.where("deleted", "==", false)));
  set("statCurrent", fs.query(col("enrollments"), fs.where("status", "==", "active")));
  if (root.querySelector("#statOverdue")) {
    import("../enroll.js?v=20261126233856").then(async (m) => {
      const snap = await fs.getDocs(fs.query(col("enrollments"), fs.where("status", "==", "active")));
      let n = 0, amt = 0;
      snap.forEach((d) => { const e = d.data(); if (e.deleted) return; const x = m.enrollmentTotals(e); n += x.overdueCount; amt += x.overdueAmount; });
      const el = root.querySelector("#statOverdue");
      el.innerHTML = `${n} <span class="fs-6 text-danger">(${amt.toLocaleString("en-US")})</span>`;
      el.closest(".card").classList.add("row-link");
      el.closest(".card").addEventListener("click", () => { location.hash = "#finance"; });
    }).catch((e) => console.error(e));
  }
  set("statCourses", fs.query(col("courses"), fs.where("status", "==", "available"), fs.where("deleted", "==", false)));
}
