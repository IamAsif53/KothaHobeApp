import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const ENV = {
  PORT: process.env.PORT || '5000',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/kotha_hobe',
  JWT_SECRET: process.env.JWT_SECRET || 'kotha_hobe_super_secret_jwt_key_2026_production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '30d',
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'kotha-hobe-app',
  NODE_ENV: process.env.NODE_ENV || 'development',
};
