import mongoose from 'mongoose';
import { ENV } from './env';

let mongoMemoryServer: any = null;

export const connectDB = async (): Promise<void> => {
  try {
    // Attempt standard connection
    await mongoose.connect(ENV.MONGODB_URI, {
      serverSelectionTimeoutMS: 2000,
    });
    console.log(`[Database] Connected to MongoDB at: ${ENV.MONGODB_URI}`);
  } catch (error) {
    console.warn('[Database] Local MongoDB not reachable. Spawning embedded MongoDB instance...');
    try {
      const { MongoMemoryServer } = await import('mongodb-memory-server');
      mongoMemoryServer = await MongoMemoryServer.create();
      const mongoUri = mongoMemoryServer.getUri();
      await mongoose.connect(mongoUri);
      console.log(`[Database] Embedded MongoDB Server Running at: ${mongoUri}`);
    } catch (memErr) {
      console.error('[Database] Failed to start embedded MongoDB:', memErr);
      if (ENV.NODE_ENV === 'production') {
        process.exit(1);
      }
    }
  }
};

export const disconnectDB = async (): Promise<void> => {
  await mongoose.disconnect();
  if (mongoMemoryServer) {
    await mongoMemoryServer.stop();
  }
};
