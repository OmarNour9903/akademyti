import { fs } from "../firebase.js?v=20261128083523";
import { t } from "../i18n.js?v=20261128083523";
import { esc, toast, openModal } from "../util.js?v=20261128083523";
import { ref, audit } from "../data.js?v=20261128083523";
import { createLogin } from "../accounts.js?v=20261128083523";

// إنشاء حساب بوابة لطالب أو محاضر موجود
export function openCreateLogin(coll, type, x, done) {
  const html = `<div class="row g-3">
    <div class="col-md-6"><label class="form-label">${t("email")}</label><input name="email" type="email" class="form-control" dir="ltr" value="${esc(x.email || "")}" required></div>
    <div class="col-md-6"><label class="form-label">${t("initial_password")}</label><input name="password" class="form-control" dir="ltr" minlength="6" autocomplete="off" required></div></div>`;
  openModal(`${t("create_portal")} — ${x.code}`, html, async (form) => {
    const email = form.email.value.trim().toLowerCase();
    const uid = await createLogin(type, x.id, x.name, email, form.password.value);
    await fs.updateDoc(ref(coll, x.id), { uid, email });
    await audit("update", coll, x.id, `${x.code} ${x.name}`, null, { portal: true, email });
    toast(t("saved"));
    done();
  }, { size: "md" });
}
