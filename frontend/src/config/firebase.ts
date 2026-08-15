import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBZejROCR-QVo9DMjSdHV1Kl_EqIhidU7Q",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "kothahobe-315c6.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "kothahobe-315c6",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "kothahobe-315c6.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "503082298109",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:503082298109:web:362cc54464f4de593a6c94",
  measurementId: "G-6H6PPFYY34"
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Enable language matching browser / locale
auth.languageCode = 'en';

export { RecaptchaVerifier, signInWithPhoneNumber };
export type { ConfirmationResult };
