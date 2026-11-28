import { auth, db, authMod, fs } from "./firebase.js?v=20261128080223";
import { OWNER_EMAIL } from "./config.js?v=20261128080223";

export const isOwnerUser = (user) => !!user && user.email && user.email.toLowerCase() === OWNER_EMAIL.toLowerCase();

// بيرجع: { user, profile, tenant } أو بيرمي خطأ بكود واضح
export async function loadSession(user) {
  if (isOwnerUser(user)) return { user, role: "owner" };
  const snap = await fs.getDoc(fs.doc(db, "users", user.uid));
  if (!snap.exists()) throw new Error("no_account");
  const profile = snap.data();
  if (profile.status !== "active") throw new Error("inactive");
  const tSnap = await fs.getDoc(fs.doc(db, "tenants", profile.tenantId));
  if (!tSnap.exists() || tSnap.data().status !== "active") throw new Error("inactive");
  return { user, role: profile.type, profile, tenant: { id: tSnap.id, ...tSnap.data() } };
}

export function homeFor(role) {
  if (role === "owner") return "owner.html";
  if (role === "student" || role === "instructor") return "portal.html";
  return "app.html";
}

// حماية الصفحات: لو مش داخل يرجعه لصفحة الدخول
export function requireSession(allowedRoles) {
  return new Promise((resolve) => {
    authMod.onAuthStateChanged(auth, async (user) => {
      if (!user) { location.replace("index.html"); return; }
      try {
        const s = await loadSession(user);
        if (allowedRoles && !allowedRoles.includes(s.role)) { location.replace(homeFor(s.role)); return; }
        resolve(s);
      } catch (e) {
        await authMod.signOut(auth);
        const code = ["no_account", "inactive"].includes(e.message) ? e.message : "generic";
        location.replace("index.html?e=" + code);
      }
    });
  });
}

export async function logout() {
  await authMod.signOut(auth);
  location.replace("index.html");
}
