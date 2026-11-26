import { fs } from "../firebase.js?v=20261126232651";
import { t } from "../i18n.js?v=20261126232651";
import { esc } from "../util.js?v=20261126232651";
import { col } from "../data.js?v=20261126232651";
import { MODULES, label } from "../perms.js?v=20261126232651";

const entityLabel = (e) => {
  const m = MODULES.find((x) => x.key === e);
  if (e === "treasuries") return t("treasuries_entity");
  return m ? label(m) : t(e) || e;
};

function fmt(ts) {
  if (!ts) return "-";
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleString("en-GB", { dateStyle: "short", timeStyle: "short" });
}

export async function render(root) {
  root.innerHTML = `<h1 class="h4 fw-bold mb-4">${t("audit_log")}</h1>
    <div class="card card-soft"><div class="table-responsive"><table class="table table-sm align-middle mb-0">
      <thead><tr><th>${t("when")}</th><th>${t("actor")}</th><th>${t("action")}</th><th>${t("section")}</th><th>${t("item")}</th></tr></thead>
      <tbody id="auditRows"><tr><td colspan="5" class="text-center text-muted py-4">...</td></tr></tbody></table></div></div>
    <p class="text-muted small mt-2">${t("audit_note")}</p>`;
  const snap = await fs.getDocs(fs.query(col("auditLog"), fs.orderBy("at", "desc"), fs.limit(200)));
  const body = root.querySelector("#auditRows");
  if (snap.empty) { body.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">${t("no_data")}</td></tr>`; return; }
  body.innerHTML = snap.docs.map((d) => {
    const x = d.data();
    return `<tr><td class="small text-nowrap" dir="ltr">${fmt(x.at)}</td><td>${esc(x.actorName)}</td>
      <td><span class="badge audit-${esc(x.action)}">${esc(t("a_" + x.action))}</span></td>
      <td>${esc(entityLabel(x.entity))}</td><td>${esc(x.label)}</td></tr>`;
  }).join("");
}
