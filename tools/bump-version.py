#!/usr/bin/env python3
"""يضيف رقم نسخة (?v=) لكل ملفات js/css المحلية عشان المتصفح ما يستخدمش نسخة قديمة من الكاش.
شغّله قبل كل commit:  python3 tools/bump-version.py"""
import re, time, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
v = time.strftime("%Y%m%d%H%M%S")
pat = re.compile(r'''(["'])((?:\.{1,2}/|js/|css/)[^"'?\s]+\.(?:js|css))(?:\?v=[^"']*)?\1''')
files = list(root.glob("*.html")) + list((root / "js").rglob("*.js"))
for f in files:
    s = f.read_text(encoding="utf-8")
    n = pat.sub(lambda m: f'{m.group(1)}{m.group(2)}?v={v}{m.group(1)}', s)
    if n != s:
        f.write_text(n, encoding="utf-8")
print("version", v)
