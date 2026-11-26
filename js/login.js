import { auth, authMod } from "./firebase.js";
import { applyI18n, toggleLang, t } from "./i18n.js";
import { loadSession, homeFor } from "./session.js";

applyI18n();
document.getElementById("langBtn").addEventListener("click", toggleLang);

const alertBox = document.getElementById("alertBox");
function showAlert(msg, type = "danger") {
  alertBox.className = `alert alert-${type}`;
  alertBox.textContent = msg;
}

const params = new URLSearchParams(location.search);
if (params.get("e")) showAlert(t("err_" + params.get("e")));

let busy = false;
authMod.onAuthStateChanged(auth, async (user) => {
  if (!user || busy) return;
  try { location.replace(homeFor((await loadSession(user)).role)); } catch (e) { /* stay on login */ }
});

document.getElementById("loginForm").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const btn = document.getElementById("loginBtn");
  btn.disabled = true; busy = true;
  try {
    const email = document.getElementById("email").value.trim();
    const pass = document.getElementById("password").value;
    const cred = await authMod.signInWithEmailAndPassword(auth, email, pass);
    const s = await loadSession(cred.user);
    location.replace(homeFor(s.role));
  } catch (e) {
    await authMod.signOut(auth).catch(() => {});
    const code = e.message === "no_account" || e.message === "inactive" ? "err_" + e.message
      : (e.code && e.code.startsWith("auth/")) ? "err_login" : "err_generic";
    showAlert(t(code));
  } finally {
    btn.disabled = false; busy = false;
  }
});

document.getElementById("forgotBtn").addEventListener("click", async () => {
  const email = document.getElementById("email").value.trim();
  if (!email) { showAlert(t("enter_email_first"), "warning"); return; }
  try {
    await authMod.sendPasswordResetEmail(auth, email);
  } catch (e) { /* لا نكشف إن كان الإيميل موجود */ }
  showAlert(t("reset_sent"), "success");
});
