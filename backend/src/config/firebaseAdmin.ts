import * as admin from 'firebase-admin';
import fs from 'fs';
import path from 'path';
import { ENV } from './env';

let isConfiguredWithCredentials = false;

if (!admin.apps.length) {
  try {
    let serviceAccount: any = null;

    // 1. Check environment variable FIREBASE_SERVICE_ACCOUNT (JSON or Base64 JSON)
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        const raw = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
        if (raw.startsWith('{')) {
          serviceAccount = JSON.parse(raw);
        } else {
          // Attempt base64 decode
          const decoded = Buffer.from(raw, 'base64').toString('utf8');
          serviceAccount = JSON.parse(decoded);
        }
      } catch (err) {
        console.warn('[FirebaseAdmin] Failed to parse FIREBASE_SERVICE_ACCOUNT env string:', err);
      }
    }

    // 2. Check local file paths
    if (!serviceAccount) {
      const candidatePaths = [
        path.resolve(__dirname, '../../service-account.json'),
        path.resolve(__dirname, '../../firebase-service-account.json'),
        path.resolve(__dirname, '../../../firebase-service-account.json'),
      ];

      for (const p of candidatePaths) {
        if (fs.existsSync(p)) {
          try {
            serviceAccount = JSON.parse(fs.readFileSync(p, 'utf8'));
            console.log(`[FirebaseAdmin] Loaded Service Account from file: ${p}`);
            break;
          } catch (e) {
            console.warn(`[FirebaseAdmin] Failed to read ${p}:`, e);
          }
        }
      }
    }

    if (serviceAccount && serviceAccount.project_id && serviceAccount.private_key) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id || ENV.FIREBASE_PROJECT_ID,
      });
      isConfiguredWithCredentials = true;
      console.log(`[FirebaseAdmin] Initialized with Service Account for Project: ${serviceAccount.project_id}`);
    } else {
      admin.initializeApp({
        projectId: ENV.FIREBASE_PROJECT_ID,
      });
      console.warn(`[FirebaseAdmin] Initialized with Project ID ONLY (${ENV.FIREBASE_PROJECT_ID}). Google OAuth2 Service Account is missing for FCM HTTP v1 dispatch.`);
    }
  } catch (error) {
    console.error('[FirebaseAdmin] Initialization error:', error);
  }
}

export const isFirebaseReady = () => isConfiguredWithCredentials;
export const adminAuth = admin.auth();
export default admin;
