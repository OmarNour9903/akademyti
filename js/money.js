// الخزن والحركات المالية (مصروفات، تحويلات، استرداد، حركات عكسية)
import { db, fs } from "./firebase.js?v=20261128083421";
import { t } from "./i18n.js?v=20261128083421";
import { UserError } from "./util.js?v=20261128083421";
import { col, ref, audit, nextNumber, session } from "./data.js?v=20261128083421";

export const TREASURY_PERMS = ["viewBalance", "viewTx", "deposit", "withdraw", "transfer"];
const round2 = (n) => Math.round(Number(n) * 100) / 100;

const actingUid = () => { const S = session(); return S.preview ? S.preview.uid || "__none__" : S.user.uid; };

export function tAccess(tr, perm) {
  const S = session();
  if (S.role === "admin") return true;
  return !!(((tr.access || {})[actingUid()] || {})[perm]);
}

// الخزن اللي المستخدم ليه صلاحية معيّنة عليها
export async function myTreasuries(perm) {
  const S = session();
  const q = S.role === "admin" ? col("treasuries") : fs.query(col("treasuries"), fs.where("members", "array-contains", actingUid()));
  const snap = await fs.getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => !x.deleted && (!perm || tAccess(x, perm)));
}

export const balRef = (id) => ref("treasuryBalances", id);

// نقل الخزن القديمة (اللي رصيدها جوه مستند الخزنة) للنظام الجديد — المدير بس
export async function migrateLegacy(list) {
  const legacy = list.filter((x) => x.balance != null);
  for (const x of legacy) {
    try {
      const batch = fs.writeBatch(db);
      batch.set(balRef(x.id), { balance: x.balance || 0, lastTxId: "", lastTxColl: "" });
      batch.set(ref("treasuryNames", x.id), { name: x.name });
      batch.update(ref("treasuries", x.id), { balance: fs.deleteField(), lastTxId: fs.deleteField(), members: x.members || [], access: x.access || {} });
      await batch.commit();
    } catch (e) { console.error("migrate treasury", e); }
  }
  return legacy.length;
}

export async function readBalance(id) {
  try { const s = await fs.getDoc(balRef(id)); return s.exists() ? s.data().balance || 0 : null; } catch (e) { return null; }
}

export async function newTxCode(date) {
  const year = (date || new Date().toISOString()).slice(0, 4);
  const n = await nextNumber(`trx_${year}`);
  return `TRX-${year}-${String(n).padStart(6, "0")}`;
}

// تسجيل حركة: بتحدّث رصيد الخزنة/الخزن في نفس العملية. extra(tx, txId) لتحديثات إضافية في نفس الـ transaction
export async function recordTx(data, extra) {
  const S = session();
  const amount = round2(data.amount);
  if (!(amount > 0)) throw new UserError("required");
  const code = await newTxCode(data.date);
  const tRef = fs.doc(col("transactions"));
  const deltas = { ...data.deltas };
  const doc = {
    ...data, amount, code, deltas, createdBy: S.profile.name || "", createdByUid: S.user.uid, createdAt: fs.serverTimestamp()
  };
  try {
    await fs.runTransaction(db, async (tx) => {
      if (extra) await extra.read?.(tx);
      tx.set(tRef, doc);
      for (const [tid, d] of Object.entries(deltas)) {
        tx.update(balRef(tid), { balance: fs.increment(d), lastTxId: tRef.id, lastTxColl: "transactions" });
      }
      if (extra) await extra.write?.(tx, tRef.id);
    });
  } catch (e) {
    if (e.code === "permission-denied") throw new UserError("err_tx_denied");
    throw e;
  }
  await audit("create", "transactions", tRef.id, `${code} — ${t("tx_" + data.type)} — ${amount}`, null, { type: data.type, amount, treasury: data.treasuryName, to: data.toTreasuryName || null, reason: data.reason || "" });
  return { id: tRef.id, code };
}
