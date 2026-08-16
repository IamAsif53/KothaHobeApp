import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBUty96ZuZcHZVaC_AoX7pf7uex3McYJg8",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "chatapp-2436d.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "chatapp-2436d",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "chatapp-2436d.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "905207907324",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:905207907324:android:d38698f61df84713e2a879",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Enable language matching browser / locale
auth.languageCode = 'en';

export { RecaptchaVerifier, signInWithPhoneNumber };
export type { ConfirmationResult };
