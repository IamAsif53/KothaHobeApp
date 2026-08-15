import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const ENV = {
  PORT: process.env.PORT || '5000',
  MONGODB_URI:
    process.env.MONGODB_URI ||
    'mongodb://jiaulasif:iI0OqchzHmf3kDVV@ac-uph9exc-shard-00-00.jrphc7a.mongodb.net:27017,ac-uph9exc-shard-00-01.jrphc7a.mongodb.net:27017,ac-uph9exc-shard-00-02.jrphc7a.mongodb.net:27017/kotha_hobe?ssl=true&replicaSet=atlas-l80cpa-shard-0&authSource=admin&appName=SignUpInfo',
  JWT_SECRET: process.env.JWT_SECRET || 'kotha_hobe_super_secret_jwt_key_2026_production',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '30d',
  FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || 'kothahobe-315c6',
  RESEND_API_KEY: process.env.RESEND_API_KEY || '',
  GMAIL_USER: process.env.GMAIL_USER || '',
  GMAIL_APP_PASSWORD: process.env.GMAIL_APP_PASSWORD || '',
  BREVO_API_KEY: process.env.BREVO_API_KEY || '',
  BREVO_SENDER_EMAIL: process.env.BREVO_SENDER_EMAIL || 'u2104053@student.cuet.ac.bd',
  BREVO_SMTP_LOGIN: process.env.BREVO_SMTP_LOGIN || '',
  BREVO_SMTP_PASSWORD: process.env.BREVO_SMTP_PASSWORD || '',
  NODE_ENV: process.env.NODE_ENV || 'development',
};
