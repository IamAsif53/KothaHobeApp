import mongoose from 'mongoose';
import { ENV } from './env';

let mongoMemoryServer: any = null;

export const connectDB = async (): Promise<void> => {
  try {
    // Attempt connection to MongoDB Atlas
    await mongoose.connect(ENV.MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    const maskedUri = ENV.MONGODB_URI.replace(/:([^:@]+)@/, ':****@');
    console.log(`[Database] Connected to MongoDB Atlas at: ${maskedUri}`);
  } catch (error) {
    console.warn('[Database] MongoDB Atlas connection error:', (error as Error).message);
    console.warn('[Database] Spawning embedded MongoDB instance fallback...');
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
