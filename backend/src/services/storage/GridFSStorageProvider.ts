import mongoose from 'mongoose';
import { Readable, PassThrough } from 'stream';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  IMediaStorageProvider,
  StorageUploadOptions,
  StorageUploadResult,
  StorageRangeResult,
  StorageFileMetadata,
} from './IMediaStorageProvider';

const UPLOADS_DIR = path.resolve(__dirname, '../../../../uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

export class GridFSStorageProvider implements IMediaStorageProvider {
  readonly providerName = 'gridfs' as const;
  private bucket: mongoose.mongo.GridFSBucket | null = null;

  private getBucket(): mongoose.mongo.GridFSBucket {
    if (!this.bucket) {
      const db = mongoose.connection.db;
      if (!db) {
        throw new Error('Database connection not established yet for GridFS');
      }
      this.bucket = new mongoose.mongo.GridFSBucket(db, {
        bucketName: 'mediaFiles',
        chunkSizeBytes: 4 * 1024 * 1024, // 4MB chunk size for high-throughput streaming
      });
    }
    return this.bucket;
  }

  async upload(
    fileStreamOrBuffer: Readable | Buffer,
    options: StorageUploadOptions
  ): Promise<StorageUploadResult> {
    const bucket = this.getBucket();
    const hash = crypto.createHash('sha256');

    let buffer: Buffer;
    if (Buffer.isBuffer(fileStreamOrBuffer)) {
      buffer = fileStreamOrBuffer;
      hash.update(buffer);
    } else {
      const chunks: Buffer[] = [];
      await new Promise<void>((resolve, reject) => {
        fileStreamOrBuffer.on('data', (chunk) => {
          const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          chunks.push(buf);
          hash.update(buf);
        });
        fileStreamOrBuffer.on('end', () => resolve());
        fileStreamOrBuffer.on('error', (err) => reject(err));
      });
      buffer = Buffer.concat(chunks);
    }

    const checksum = hash.digest('hex');
    const size = buffer.length;

    const uploadStream = bucket.openUploadStream(options.filename, {
      contentType: options.mimeType,
      metadata: {
        originalName: options.originalName || options.filename,
        mimeType: options.mimeType,
        conversationId: options.conversationId,
        uploaderId: options.uploaderId,
        size,
        checksum,
      },
    });

    await new Promise<void>((resolve, reject) => {
      uploadStream.on('finish', () => resolve());
      uploadStream.on('error', (err) => reject(err));
      uploadStream.end(buffer);
    });

    // Optional background local disk cache for sub-millisecond local reads
    try {
      const diskPath = path.join(UPLOADS_DIR, options.filename);
      fs.writeFile(diskPath, buffer, (err) => {
        if (err) console.warn('[GridFSStorageProvider] Local disk cache notice:', err.message);
      });
    } catch {
      // Ignore disk caching errors
    }

    return {
      key: options.filename,
      url: `/api/messages/media/${options.filename}`,
      storageProvider: 'gridfs',
      size,
      mimeType: options.mimeType,
      originalName: options.originalName || options.filename,
      checksum,
    };
  }

  async getStream(key: string): Promise<{ stream: Readable; metadata: StorageFileMetadata }> {
    const bucket = this.getBucket();
    const cleanKey = path.basename(key);

    const files = await bucket.find({ filename: cleanKey }).toArray();
    if (files && files.length > 0) {
      const fileDoc = files[0];
      const stream = bucket.openDownloadStreamByName(cleanKey);
      const metadata: StorageFileMetadata = {
        key: cleanKey,
        size: fileDoc.length,
        mimeType: fileDoc.contentType || (fileDoc.metadata as any)?.mimeType || 'application/octet-stream',
        originalName: (fileDoc.metadata as any)?.originalName || cleanKey,
        lastModified: fileDoc.uploadDate,
        storageProvider: 'gridfs',
        checksum: (fileDoc.metadata as any)?.checksum,
      };
      return { stream, metadata };
    }

    // Disk fallback for legacy files
    const filePath = path.join(UPLOADS_DIR, cleanKey);
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      const stream = fs.createReadStream(filePath);
      return {
        stream,
        metadata: {
          key: cleanKey,
          size: stat.size,
          mimeType: 'application/octet-stream',
          originalName: cleanKey,
          lastModified: stat.mtime,
          storageProvider: 'local',
        },
      };
    }

    throw new Error(`File "${cleanKey}" not found in GridFS or local storage`);
  }

  async getRangeStream(
    key: string,
    start: number,
    end: number
  ): Promise<StorageRangeResult> {
    const bucket = this.getBucket();
    const cleanKey = path.basename(key);

    const files = await bucket.find({ filename: cleanKey }).toArray();
    if (files && files.length > 0) {
      const fileDoc = files[0];
      const totalLength = fileDoc.length;
      const validStart = Math.max(0, start);
      const validEnd = Math.min(totalLength - 1, end);
      const contentLength = validEnd - validStart + 1;
      const mimeType =
        fileDoc.contentType || (fileDoc.metadata as any)?.mimeType || 'application/octet-stream';

      const stream = bucket.openDownloadStreamByName(cleanKey, {
        start: validStart,
        end: validEnd + 1,
      });

      return {
        stream,
        totalLength,
        contentLength,
        mimeType,
        start: validStart,
        end: validEnd,
      };
    }

    // Disk fallback
    const filePath = path.join(UPLOADS_DIR, cleanKey);
    if (fs.existsSync(filePath)) {
      const stat = fs.statSync(filePath);
      const totalLength = stat.size;
      const validStart = Math.max(0, start);
      const validEnd = Math.min(totalLength - 1, end);
      const contentLength = validEnd - validStart + 1;

      const stream = fs.createReadStream(filePath, {
        start: validStart,
        end: validEnd,
      });

      return {
        stream,
        totalLength,
        contentLength,
        mimeType: 'application/octet-stream',
        start: validStart,
        end: validEnd,
      };
    }

    throw new Error(`File "${cleanKey}" not found for range streaming`);
  }

  async exists(key: string): Promise<boolean> {
    try {
      const bucket = this.getBucket();
      const cleanKey = path.basename(key);
      const count = await bucket.find({ filename: cleanKey }).count();
      if (count > 0) return true;
      const filePath = path.join(UPLOADS_DIR, cleanKey);
      return fs.existsSync(filePath);
    } catch {
      return false;
    }
  }

  async getMetadata(key: string): Promise<StorageFileMetadata | null> {
    try {
      const bucket = this.getBucket();
      const cleanKey = path.basename(key);
      const files = await bucket.find({ filename: cleanKey }).toArray();
      if (files && files.length > 0) {
        const fileDoc = files[0];
        return {
          key: cleanKey,
          size: fileDoc.length,
          mimeType:
            fileDoc.contentType ||
            (fileDoc.metadata as any)?.mimeType ||
            'application/octet-stream',
          originalName: (fileDoc.metadata as any)?.originalName || cleanKey,
          lastModified: fileDoc.uploadDate,
          storageProvider: 'gridfs',
          checksum: (fileDoc.metadata as any)?.checksum,
        };
      }
      return null;
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const bucket = this.getBucket();
      const cleanKey = path.basename(key);
      const files = await bucket.find({ filename: cleanKey }).toArray();
      if (files && files.length > 0) {
        for (const file of files) {
          await bucket.delete(file._id);
        }
      }
      const filePath = path.join(UPLOADS_DIR, cleanKey);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      return true;
    } catch (err: any) {
      console.error('[GridFSStorageProvider] Delete error:', err);
      return false;
    }
  }
}
