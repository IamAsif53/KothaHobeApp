import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from 'firebase/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyDemoConfigKeyForProductionKothaHobe",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "kotha-hobe-app.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "kotha-hobe-app",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "kotha-hobe-app.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "109876543210",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:109876543210:web:abc123def456",
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);

// Enable language matching browser / locale
auth.languageCode = 'en';

export { RecaptchaVerifier, signInWithPhoneNumber };
export type { ConfirmationResult };
