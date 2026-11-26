const dict = {
  ar: {
    brand: "أكاديميتي",
    tagline: "نظام إدارة الأكاديميات",
    login_title: "تسجيل الدخول",
    email: "البريد الإلكتروني",
    password: "كلمة المرور",
    login: "دخول",
    forgot: "نسيت كلمة المرور؟",
    reset_sent: "اتبعتلك إيميل لإعادة تعيين كلمة المرور.",
    enter_email_first: "اكتب الإيميل الأول.",
    err_login: "الإيميل أو كلمة المرور غلط.",
    err_no_account: "الحساب ده مش مربوط بأي أكاديمية.",
    err_inactive: "الحساب ده موقوف. كلّم إدارة الأكاديمية.",
    err_generic: "حصلت مشكلة، جرّب تاني.",
    logout: "خروج",
    lang: "English",
    dashboard: "لوحة التحكم",
    courses: "الكورسات",
    students: "الطلاب",
    instructors: "المحاضرين",
    finance: "الحسابات",
    employees: "الموظفين",
    settings: "الإعدادات",
    search_code: "ابحث بالكود أو الاسم...",
    total_trainees: "إجمالي المتدربين",
    current_trainees: "متدربين في كورسات حالية",
    available_courses: "الكورسات المتاحة",
    coming_soon: "الجزء ده هيتبني في المرحلة الجاية.",
    owner_console: "لوحة مالك المنصة",
    academies: "الأكاديميات",
    new_academy: "أكاديمية جديدة",
    academy_name: "اسم الأكاديمية",
    admin_name: "اسم مدير النظام",
    admin_email: "إيميل مدير النظام",
    admin_password: "كلمة مرور مبدئية (6 حروف على الأقل)",
    create: "إنشاء",
    created_ok: "الأكاديمية اتعملت. ابعت لمدير النظام الإيميل وكلمة المرور.",
    status: "الحالة",
    active: "نشطة",
    suspended: "موقوفة",
    created_at: "تاريخ الإنشاء",
    no_academies: "مفيش أكاديميات لسه.",
    welcome: "أهلاً"
  },
  en: {
    brand: "Akademyti",
    tagline: "Academy management system",
    login_title: "Sign in",
    email: "Email",
    password: "Password",
    login: "Sign in",
    forgot: "Forgot password?",
    reset_sent: "A password reset email has been sent.",
    enter_email_first: "Enter your email first.",
    err_login: "Wrong email or password.",
    err_no_account: "This account is not linked to any academy.",
    err_inactive: "This account is suspended. Contact the academy.",
    err_generic: "Something went wrong, try again.",
    logout: "Sign out",
    lang: "العربية",
    dashboard: "Dashboard",
    courses: "Courses",
    students: "Students",
    instructors: "Instructors",
    finance: "Finance",
    employees: "Employees",
    settings: "Settings",
    search_code: "Search by code or name...",
    total_trainees: "Total trainees",
    current_trainees: "Trainees in current courses",
    available_courses: "Available courses",
    coming_soon: "This section is coming in the next phase.",
    owner_console: "Platform owner console",
    academies: "Academies",
    new_academy: "New academy",
    academy_name: "Academy name",
    admin_name: "Admin name",
    admin_email: "Admin email",
    admin_password: "Initial password (min 6 chars)",
    create: "Create",
    created_ok: "Academy created. Send the admin their email and password.",
    status: "Status",
    active: "Active",
    suspended: "Suspended",
    created_at: "Created",
    no_academies: "No academies yet.",
    welcome: "Welcome"
  }
};

let lang = "ar";
try { lang = localStorage.getItem("lang") || "ar"; } catch (e) { /* storage unavailable */ }

export const t = (key) => (dict[lang] && dict[lang][key]) || key;
export const currentLang = () => lang;

export function applyI18n() {
  const html = document.documentElement;
  html.lang = lang;
  html.dir = lang === "ar" ? "rtl" : "ltr";
  const css = document.getElementById("bs-css");
  if (css) {
    css.href = lang === "ar"
      ? "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.rtl.min.css"
      : "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css";
  }
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
}

export function toggleLang() {
  lang = lang === "ar" ? "en" : "ar";
  try { localStorage.setItem("lang", lang); } catch (e) { /* ignore */ }
  applyI18n();
}

export function formatDate(d) {
  if (!d) return "-";
  const date = d.toDate ? d.toDate() : new Date(d);
  return date.toLocaleDateString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB");
}
