import * as admin from 'firebase-admin';
import { ENV } from './env';

if (!admin.apps.length) {
  try {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: ENV.FIREBASE_PROJECT_ID,
      });
      console.log('[FirebaseAdmin] Initialized with Service Account');
    } else {
      admin.initializeApp({
        projectId: ENV.FIREBASE_PROJECT_ID,
      });
      console.log(`[FirebaseAdmin] Initialized with Project ID: ${ENV.FIREBASE_PROJECT_ID}`);
    }
  } catch (error) {
    console.error('[FirebaseAdmin] Initialization error:', error);
  }
}

export const adminAuth = admin.auth();
export default admin;
