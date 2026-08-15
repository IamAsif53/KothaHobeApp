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
  NODE_ENV: process.env.NODE_ENV || 'development',
};
