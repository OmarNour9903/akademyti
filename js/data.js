import { db, fs } from "./firebase.js?v=20261126223043";

let S;
export const setSession = (s) => { S = s; };
export const session = () => S;
export const col = (name) => fs.collection(db, "tenants", S.tenant.id, name);
export const ref = (name, id) => fs.doc(db, "tenants", S.tenant.id, name, id);
export const userRef = (uid) => fs.doc(db, "users", uid);

// كود فريد متسلسل لكل نوع (STD-00001 ...)
export async function nextCode(entity, prefix, pad = 4) {
  const r = ref("counters", entity);
  const n = await fs.runTransaction(db, async (tx) => {
    const snap = await tx.get(r);
    const next = (snap.exists() ? snap.data().n : 0) + 1;
    tx.set(r, { n: next });
    return next;
  });
  return `${prefix}-${String(n).padStart(pad, "0")}`;
}

const plain = (x) => (x == null ? null : JSON.parse(JSON.stringify(x)));

export async function audit(action, entity, entityId, label, before = null, after = null) {
  try {
    await fs.addDoc(col("auditLog"), {
      action, entity, entityId, label: label || "",
      before: plain(before), after: plain(after),
      actorUid: S.user.uid, actorName: S.profile.name || S.user.email,
      at: fs.serverTimestamp()
    });
  } catch (e) { console.error("audit failed", e); }
}

export async function listActive(name, ...constraints) {
  const snap = await fs.getDocs(fs.query(col(name), ...constraints));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((x) => !x.deleted);
}

export async function softDelete(name, id, label) {
  await fs.updateDoc(ref(name, id), { deleted: true, deletedAt: fs.serverTimestamp(), deletedBy: S.profile.name || S.user.email });
  await audit("delete", name, id, label);
}

export async function restore(name, id, label) {
  await fs.updateDoc(ref(name, id), { deleted: false, deletedAt: null, deletedBy: null });
  await audit("restore", name, id, label);
}

export async function purge(name, id, label) {
  await fs.deleteDoc(ref(name, id));
  await audit("purge", name, id, label);
}
