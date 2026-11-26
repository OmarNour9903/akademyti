import { db, fs, createAccount } from "./firebase.js?v=20261126234105";
import { applyI18n, toggleLang, t, formatDate } from "./i18n.js?v=20261126234105";
import { requireSession, logout } from "./session.js?v=20261126234105";

applyI18n();
document.getElementById("langBtn").addEventListener("click", () => { toggleLang(); loadTenants(); });
document.getElementById("logoutBtn").addEventListener("click", logout);
await requireSession(["owner"]);

const alertBox = document.getElementById("alertBox");
const showAlert = (msg, type = "danger") => { alertBox.className = `alert alert-${type}`; alertBox.textContent = msg; };

async function loadTenants() {
  const rows = document.getElementById("tenantRows");
  const snap = await fs.getDocs(fs.query(fs.collection(db, "tenants"), fs.orderBy("createdAt", "desc")));
  rows.replaceChildren();
  if (snap.empty) {
    const tr = rows.insertRow(); const td = tr.insertCell(); td.colSpan = 5; td.className = "text-muted text-center"; td.textContent = t("no_academies");
    return;
  }
  snap.forEach((d) => {
    const x = d.data();
    const tr = rows.insertRow();
    tr.insertCell().textContent = x.name;
    tr.insertCell().textContent = x.adminEmail || "-";
    const st = tr.insertCell();
    const badge = document.createElement("span");
    badge.className = `badge ${x.status === "active" ? "text-bg-success" : "text-bg-secondary"}`;
    badge.textContent = t(x.status);
    st.appendChild(badge);
    tr.insertCell().textContent = formatDate(x.createdAt);
    const act = tr.insertCell();
    const btn = document.createElement("button");
    btn.className = "btn btn-sm btn-outline-secondary";
    btn.textContent = x.status === "active" ? t("suspend") : t("activate");
    btn.addEventListener("click", async () => {
      await fs.updateDoc(fs.doc(db, "tenants", d.id), { status: x.status === "active" ? "suspended" : "active" });
      loadTenants();
    });
    act.appendChild(btn);
  });
}

document.getElementById("tenantForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const btn = document.getElementById("createBtn");
  const name = document.getElementById("tName").value.trim();
  const adminName = document.getElementById("aName").value.trim();
  const adminEmail = document.getElementById("aEmail").value.trim().toLowerCase();
  const pass = document.getElementById("aPass").value;
  if (!name || !adminName || !adminEmail || pass.length < 6) { showAlert(t("err_generic"), "warning"); return; }
  btn.disabled = true;
  try {
    const uid = await createAccount(adminEmail, pass);
    const tenantRef = fs.doc(fs.collection(db, "tenants"));
    const batch = fs.writeBatch(db);
    batch.set(tenantRef, { name, status: "active", adminUid: uid, adminEmail, plan: "founder", createdAt: fs.serverTimestamp() });
    batch.set(fs.doc(db, "users", uid), { tenantId: tenantRef.id, type: "admin", name: adminName, email: adminEmail, status: "active", createdAt: fs.serverTimestamp() });
    batch.set(fs.doc(db, "tenants", tenantRef.id, "settings", "general"), { name, lang: "ar", createdAt: fs.serverTimestamp() });
    await batch.commit();
    ev.target.reset();
    showAlert(t("created_ok"), "success");
    loadTenants();
  } catch (e) {
    console.error(e);
    showAlert(e.code === "auth/email-already-in-use" ? "الإيميل ده مستخدم قبل كده." : t("err_generic"));
  } finally {
    btn.disabled = false;
  }
});

loadTenants();
