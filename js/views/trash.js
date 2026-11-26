import { db, fs } from "../firebase.js?v=20261126224610";
import { t } from "../i18n.js?v=20261126224610";
import { esc, toast, confirmBox } from "../util.js?v=20261126224610";
import { col, ref, userRef, restore, purge } from "../data.js?v=20261126224610";

// الأجزاء اللي بتدخل السلة (هتزيد مع كل مرحلة)
const SOURCES = [
  { key: "departments", title: () => (x) => x.name },
  { key: "employees", title: () => (x) => `${x.code} ${x.name}` },
  { key: "courses", title: () => (x) => `${x.code} ${x.name}` },
  { key: "groups", title: () => (x) => `${x.code} ${x.courseName || ""}` },
  { key: "students", title: () => (x) => `${x.code} ${x.name}` },
  { key: "instructors", title: () => (x) => `${x.code} ${x.name}` }
];

export async function render(root) {
  root.innerHTML = `<h1 class="h4 fw-bold mb-1">${t("trash")}</h1>
    <p class="text-muted small mb-4">${t("trash_note")}</p>
    <div class="card card-soft"><div class="table-responsive"><table class="table align-middle mb-0">
      <thead><tr><th>${t("section")}</th><th>${t("item")}</th><th>${t("deleted_by")}</th><th></th></tr></thead>
      <tbody id="trashRows"><tr><td colspan="4" class="text-center text-muted py-4">...</td></tr></tbody></table></div></div>`;
  const items = [];
  for (const s of SOURCES) {
    const snap = await fs.getDocs(fs.query(col(s.key), fs.where("deleted", "==", true)));
    snap.forEach((d) => items.push({ src: s.key, id: d.id, data: d.data(), title: s.title()(d.data()) }));
  }
  const body = root.querySelector("#trashRows");
  if (!items.length) { body.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-4">${t("trash_empty")}</td></tr>`; return; }
  body.innerHTML = items.map((it, i) => `<tr>
    <td>${t(it.src)}</td><td class="fw-semibold">${esc(it.title)}</td><td class="small">${esc(it.data.deletedBy || "-")}</td>
    <td class="text-end text-nowrap">
      <button class="btn btn-sm btn-outline-success" data-restore="${i}"><i class="bi bi-arrow-counterclockwise"></i> ${t("restore")}</button>
      <button class="btn btn-sm btn-outline-danger" data-purge="${i}"><i class="bi bi-x-octagon"></i> ${t("purge")}</button>
    </td></tr>`).join("");
  body.querySelectorAll("[data-restore]").forEach((b) => b.addEventListener("click", async () => {
    const it = items[b.dataset.restore];
    await restore(it.src, it.id, it.title);
    if (it.src === "employees") await fs.updateDoc(userRef(it.data.uid), { status: it.data.status || "active" });
    toast(t("restored"));
    render(root);
  }));
  body.querySelectorAll("[data-purge]").forEach((b) => b.addEventListener("click", async () => {
    const it = items[b.dataset.purge];
    if (!(await confirmBox(`${t("purge_confirm")} "${it.title}"`, { label: t("purge") }))) return;
    await purge(it.src, it.id, it.title);
    toast(t("purged"));
    render(root);
  }));
}
