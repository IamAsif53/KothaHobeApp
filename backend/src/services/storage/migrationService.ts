import mongoose from 'mongoose';
import crypto from 'crypto';
import { GridFSStorageProvider } from './GridFSStorageProvider';
import { ObjectStorageProvider } from './ObjectStorageProvider';
import { MediaMetadata } from '../../models/MediaMetadata';

export interface MigrationOptions {
  batchSize?: number;
  limit?: number;
  dryRun?: boolean;
}

export interface MigrationProgress {
  totalFound: number;
  migrated: number;
  skipped: number;
  failed: number;
  errors: Array<{ filename: string; error: string }>;
}

export class MigrationService {
  /**
   * Safely migrates files from MongoDB GridFS to Object Storage (R2 / S3) without deleting source data
   */
  public static async migrateGridFSToObjectStorage(
    options: MigrationOptions = {}
  ): Promise<MigrationProgress> {
    const { batchSize = 20, limit = 0, dryRun = false } = options;

    const db = mongoose.connection.db;
    if (!db) throw new Error('Database not connected');

    const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName: 'mediaFiles' });
    const gridfsProvider = new GridFSStorageProvider();
    const objectProvider = new ObjectStorageProvider();

    const cursor = bucket.find({});
    if (limit > 0) cursor.limit(limit);

    const files = await cursor.toArray();

    const progress: MigrationProgress = {
      totalFound: files.length,
      migrated: 0,
      skipped: 0,
      failed: 0,
      errors: [],
    };

    console.log(`[MigrationService] Starting GridFS -> ${objectProvider.providerName.toUpperCase()} migration (${files.length} candidate files, dryRun: ${dryRun})`);

    for (let i = 0; i < files.length; i += batchSize) {
      const batch = files.slice(i, i + batchSize);

      await Promise.all(
        batch.map(async (fileDoc) => {
          const filename = fileDoc.filename;
          try {
            // Check if already migrated to object storage in MediaMetadata
            const existing = await MediaMetadata.findOne({
              mediaKey: filename,
              storageProvider: { $in: ['r2', 's3'] },
              status: 'ready',
            });

            if (existing) {
              progress.skipped++;
              return;
            }

            // Check if already in cloud bucket
            const inBucket = await objectProvider.exists(filename);
            if (inBucket) {
              if (!dryRun) {
                await MediaMetadata.findOneAndUpdate(
                  { mediaKey: filename },
                  {
                    mediaKey: filename,
                    originalName: (fileDoc.metadata as any)?.originalName || filename,
                    mimeType: fileDoc.contentType || (fileDoc.metadata as any)?.mimeType || 'application/octet-stream',
                    size: fileDoc.length,
                    storageProvider: objectProvider.providerName,
                    objectKey: filename,
                    status: 'ready',
                    url: `/api/messages/media/${filename}`,
                  },
                  { upsert: true, new: true }
                );
              }
              progress.migrated++;
              return;
            }

            if (dryRun) {
              progress.migrated++;
              return;
            }

            // Read from GridFS into memory buffer
            const { stream, metadata } = await gridfsProvider.getStream(filename);
            const chunks: Buffer[] = [];
            const hash = crypto.createHash('sha256');

            await new Promise<void>((resolve, reject) => {
              stream.on('data', (c) => {
                const b = Buffer.isBuffer(c) ? c : Buffer.from(c);
                chunks.push(b);
                hash.update(b);
              });
              stream.on('end', () => resolve());
              stream.on('error', (err) => reject(err));
            });

            const fileBuffer = Buffer.concat(chunks);
            const checksum = hash.digest('hex');

            // Upload to Object Storage
            await objectProvider.upload(fileBuffer, {
              filename,
              mimeType: metadata.mimeType,
              originalName: metadata.originalName,
              size: fileBuffer.length,
            });

            // Record in MediaMetadata
            await MediaMetadata.findOneAndUpdate(
              { mediaKey: filename },
              {
                mediaKey: filename,
                originalName: metadata.originalName || filename,
                mimeType: metadata.mimeType,
                size: fileBuffer.length,
                checksum,
                storageProvider: objectProvider.providerName,
                objectKey: filename,
                status: 'ready',
                url: `/api/messages/media/${filename}`,
              },
              { upsert: true, new: true }
            );

            progress.migrated++;
          } catch (err: any) {
            progress.failed++;
            progress.errors.push({ filename, error: err?.message || 'Unknown error' });
            console.error(`[MigrationService] Failed to migrate ${filename}:`, err);
          }
        })
      );
    }

    console.log(
      `[MigrationService] Migration summary: ${progress.migrated} migrated, ${progress.skipped} skipped, ${progress.failed} failed out of ${progress.totalFound}`
    );

    return progress;
  }
}
