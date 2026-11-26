// إعدادات Firebase العامة (مش سرية — الأمان في قواعد Firestore)
export const firebaseConfig = {
  apiKey: "AIzaSyCU42UxJpQDH_vwLgMX5G0ureM4tvg0ac8",
  authDomain: "akademyti-f678a.firebaseapp.com",
  projectId: "akademyti-f678a",
  storageBucket: "akademyti-f678a.firebasestorage.app",
  messagingSenderId: "189988313126",
  appId: "1:189988313126:web:490eb72785461d6c912ee7"
};

// مالك المنصة (Super Admin) — لازم يطابق الإيميل في firestore.rules
export const OWNER_EMAIL = "omarnour992003@gmail.com";

export const SDK = "https://www.gstatic.com/firebasejs/10.12.2";
