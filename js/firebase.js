import { firebaseConfig, SDK } from "./config.js?v=20261126225035";
const { initializeApp, deleteApp } = await import(`${SDK}/firebase-app.js`);
const authMod = await import(`${SDK}/firebase-auth.js`);
const fs = await import(`${SDK}/firebase-firestore.js`);

export const app = initializeApp(firebaseConfig);
export const auth = authMod.getAuth(app);
export const db = fs.getFirestore(app);
export { authMod, fs };

// إنشاء حساب لمستخدم تاني من غير ما المستخدم الحالي يخرج من حسابه
export async function createAccount(email, password) {
  const secondary = initializeApp(firebaseConfig, "secondary-" + Date.now());
  const secAuth = authMod.getAuth(secondary);
  try {
    const cred = await authMod.createUserWithEmailAndPassword(secAuth, email, password);
    return cred.user.uid;
  } finally {
    await authMod.signOut(secAuth).catch(() => {});
    await deleteApp(secondary).catch(() => {});
  }
}
