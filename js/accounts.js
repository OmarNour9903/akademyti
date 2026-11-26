import { auth, authMod, fs, createAccount } from "./firebase.js?v=20261126230710";
import { userRef, session } from "./data.js?v=20261126230710";
import { UserError, isPreview } from "./util.js?v=20261126230710";

// حساب دخول لطالب أو محاضر (البوابة)
export async function createLogin(type, refId, name, email, password) {
  if (!email) throw new UserError("err_email_needed");
  if (!password || password.length < 6) throw new UserError("err_password_short");
  let uid;
  try { uid = await createAccount(email, password); } catch (e) {
    if (e.code === "auth/email-already-in-use") throw new UserError("err_email_used");
    if (e.code === "auth/invalid-email") throw new UserError("err_invalid_email");
    throw e;
  }
  await fs.setDoc(userRef(uid), { tenantId: session().tenant.id, type, refId, name, email, status: "active", createdAt: fs.serverTimestamp() });
  return uid;
}

export async function sendReset(email) {
  if (isPreview()) throw new UserError("preview_readonly");
  await authMod.sendPasswordResetEmail(auth, email);
}

export const passwordField = { name: "password", label: "portal_password", type: "text", ltr: true, virtual: true, hint: "portal_password_hint" };
