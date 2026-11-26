# أكاديميتي (Akademyti)

منصة SaaS لإدارة أكاديميات الكورسات: كورسات، مجموعات، طلاب، محاضرين، حضور، ماليات وخزن، وصلاحيات تفصيلية.

- المتطلبات الكاملة: [docs/SPEC.md](docs/SPEC.md)
- التقنية: HTML + CSS + JavaScript (ES Modules) + Bootstrap 5 RTL + Firebase (Auth + Firestore)
- الاستضافة: GitHub Pages

## الصفحات
| الصفحة | لمين |
|---|---|
| `index.html` | تسجيل الدخول للكل |
| `owner.html` | مالك المنصة: إنشاء وإيقاف الأكاديميات |
| `app.html` | مدير الأكاديمية والموظفين |

## نشر قواعد Firestore
القواعد في `firestore.rules`. تتنشر من Firebase Console ← Firestore ← Rules، أو بـ `firebase deploy --only firestore:rules`.

## الحالة
المرحلة 0: الدخول، لوحة مالك المنصة، هيكل لوحة الأكاديمية.
