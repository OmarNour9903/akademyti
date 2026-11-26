# أكاديميتي (Akademyti)

منصة SaaS لإدارة أكاديميات الكورسات: كورسات، مجموعات، طلاب، محاضرين، حضور، ماليات وخزن، وصلاحيات تفصيلية.

- المتطلبات الكاملة: [docs/SPEC.md](docs/SPEC.md)
- التقنية: HTML + CSS + JavaScript (ES Modules) + Bootstrap 5 RTL + Firebase (Auth + Firestore)
- الاستضافة: GitHub Pages — https://omarnour9903.github.io/akademyti/

## الصفحات
| الصفحة | لمين |
|---|---|
| `index.html` | تسجيل الدخول للكل |
| `owner.html` | مالك المنصة: إنشاء وإيقاف الأكاديميات |
| `app.html` | مدير الأكاديمية والموظفين |

## قبل كل commit
شغّل `python3 tools/bump-version.py` عشان المتصفحات تاخد النسخة الجديدة ومتفضلش على الكاش.

## نشر قواعد Firestore
القواعد في `firestore.rules`. تتنشر من Firebase Console ← Firestore ← Rules، أو بـ `firebase deploy --only firestore:rules`.

## الحالة
المرحلة 0: الدخول، لوحة مالك المنصة، هيكل لوحة الأكاديمية.
