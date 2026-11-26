import { currentLang } from "./i18n.js?v=20261126225035";

export const ACTIONS = ["view", "add", "edit", "delete"];

// الأجزاء اللي ليها صلاحيات (الأقسام والموظفين والإعدادات والسلة للمدير بس)
export const MODULES = [
  { key: "courses", ar: "الكورسات", en: "Courses" },
  { key: "groups", ar: "المجموعات", en: "Groups" },
  { key: "sessions", ar: "المحاضرات والحضور", en: "Sessions & attendance" },
  { key: "content", ar: "المحتوى", en: "Content" },
  { key: "students", ar: "الطلاب", en: "Students" },
  { key: "evaluations", ar: "التقييمات", en: "Evaluations" },
  { key: "discipline", ar: "الانضباط", en: "Discipline" },
  { key: "instructors", ar: "المحاضرين", en: "Instructors" },
  { key: "enrollments", ar: "الاشتراكات والأقساط", en: "Enrollments & installments" },
  { key: "payments", ar: "الدفعات", en: "Payments" },
  { key: "expenses", ar: "المصروفات", en: "Expenses" },
  { key: "reports", ar: "التقارير المالية", en: "Financial reports", actions: ["view"] },
  { key: "auditLog", ar: "سجل النشاط", en: "Activity log", actions: ["view"] }
];

export const SPECIAL = [
  { key: "changePrice", ar: "تعديل الأسعار", en: "Change prices" },
  { key: "discount", ar: "عمل خصومات", en: "Give discounts" },
  { key: "refund", ar: "استرداد فلوس", en: "Refunds" },
  { key: "transferStudent", ar: "نقل طالب بين المجموعات", en: "Transfer students" },
  { key: "resetPassword", ar: "إعادة تعيين الباسوردات", en: "Reset passwords" },
  { key: "overrideCapacity", ar: "تخطي العدد الأقصى للمجموعة", en: "Override group capacity" }
];

export const label = (x) => (currentLang() === "ar" ? x.ar : x.en);
export const moduleActions = (m) => m.actions || ACTIONS;

// الصلاحية النهائية = صلاحيات القسم + المسموح للموظف − الممنوع عليه
export function effective(dept, overrides = {}, specialOverrides = {}) {
  const perms = {};
  for (const m of MODULES) {
    const set = new Set((dept && dept.perms && dept.perms[m.key]) || []);
    for (const a of ACTIONS) {
      const o = overrides[m.key] && overrides[m.key][a];
      if (o === "allow") set.add(a);
      if (o === "deny") set.delete(a);
    }
    const arr = moduleActions(m).filter((a) => set.has(a));
    if (arr.length) perms[m.key] = arr;
  }
  const sp = new Set((dept && dept.special) || []);
  for (const s of SPECIAL) {
    if (specialOverrides[s.key] === "allow") sp.add(s.key);
    if (specialOverrides[s.key] === "deny") sp.delete(s.key);
  }
  return { perms, special: [...sp] };
}

export function can(session, module, action = "view") {
  if (session.role === "admin") return true;
  return ((session.profile.perms || {})[module] || []).includes(action);
}

export function hasSpecial(session, key) {
  if (session.role === "admin") return true;
  return (session.profile.special || []).includes(key);
}
