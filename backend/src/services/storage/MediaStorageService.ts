import { Readable } from 'stream';
import crypto from 'crypto';
import path from 'path';
import { Types } from 'mongoose';
import {
  IMediaStorageProvider,
  StorageUploadOptions,
  StorageUploadResult,
  StorageRangeResult,
  StorageFileMetadata,
  PresignedUploadResult,
} from './IMediaStorageProvider';
import { GridFSStorageProvider } from './GridFSStorageProvider';
import { ObjectStorageProvider } from './ObjectStorageProvider';
import { MediaMetadata, IMediaMetadata } from '../../models/MediaMetadata';
import { UploadSession, IUploadSession } from '../../models/UploadSession';

export class MediaStorageService {
  private static instance: MediaStorageService;
  private primaryProvider: IMediaStorageProvider;
  private gridfsProvider: GridFSStorageProvider;
  private objectProvider: ObjectStorageProvider | null = null;

  private constructor() {
    this.gridfsProvider = new GridFSStorageProvider();

    const providerSetting = (process.env.MEDIA_STORAGE_PROVIDER || 'gridfs').toLowerCase();
    const hasR2Creds = Boolean(
      process.env.R2_ACCESS_KEY_ID && process.env.R2_SECRET_ACCESS_KEY
    );
    const hasS3Creds = Boolean(
      process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
    );

    if (providerSetting === 'r2' || providerSetting === 's3' || hasR2Creds || hasS3Creds) {
      try {
        this.objectProvider = new ObjectStorageProvider();
        if (providerSetting === 'r2' || providerSetting === 's3') {
          this.primaryProvider = this.objectProvider;
          console.log(`[MediaStorageService] Active primary storage provider: ${this.primaryProvider.providerName.toUpperCase()}`);
        } else {
          this.primaryProvider = this.gridfsProvider;
          console.log('[MediaStorageService] Active primary storage provider: GRIDFS (ObjectStorageProvider available for dual-reads)');
        }
      } catch (err) {
        console.warn('[MediaStorageService] ObjectStorageProvider init failed, falling back to GridFS:', err);
        this.primaryProvider = this.gridfsProvider;
      }
    } else {
      this.primaryProvider = this.gridfsProvider;
      console.log('[MediaStorageService] Active primary storage provider: GRIDFS (MongoDB)');
    }
  }

  public static getInstance(): MediaStorageService {
    if (!MediaStorageService.instance) {
      MediaStorageService.instance = new MediaStorageService();
    }
    return MediaStorageService.instance;
  }

  public getPrimaryProviderName(): string {
    return this.primaryProvider.providerName;
  }

  public isDirectCloudUploadSupported(): boolean {
    return (
      this.primaryProvider.providerName === 'r2' ||
      this.primaryProvider.providerName === 's3'
    );
  }

  /**
   * Generates a collision-resistant unique filename while preserving extension
   */
  public generateUniqueFilename(originalName: string, type?: string): string {
    const ext = path.extname(originalName).toLowerCase() || (type === 'audio' ? '.webm' : '.jpg');
    return `${Date.now()}_${crypto.randomBytes(8).toString('hex')}${ext}`;
  }

  /**
   * Upload media stream/buffer through active primary provider and record canonical metadata
   */
  public async upload(
    fileStreamOrBuffer: Readable | Buffer,
    options: {
      originalName: string;
      mimeType: string;
      conversationId?: string;
      uploaderId?: string;
      size?: number;
      type?: string;
    }
  ): Promise<{
    attachment: {
      url: string;
      fileName: string;
      mimeType: string;
      size: number;
      mediaId?: string;
      storageProvider?: string;
      checksum?: string;
    };
    mediaMetadata: IMediaMetadata;
  }> {
    const uniqueFilename = this.generateUniqueFilename(options.originalName, options.type);

    const uploadResult = await this.primaryProvider.upload(fileStreamOrBuffer, {
      filename: uniqueFilename,
      mimeType: options.mimeType,
      originalName: options.originalName,
      conversationId: options.conversationId,
      uploaderId: options.uploaderId,
      size: options.size,
    });

    const mediaMetadata = await MediaMetadata.create({
      mediaKey: uniqueFilename,
      originalName: options.originalName,
      mimeType: options.mimeType,
      size: uploadResult.size,
      checksum: uploadResult.checksum,
      storageProvider: uploadResult.storageProvider,
      objectKey: uniqueFilename,
      uploaderId: options.uploaderId ? new Types.ObjectId(options.uploaderId) : undefined,
      conversationId: options.conversationId ? new Types.ObjectId(options.conversationId) : undefined,
      status: 'ready',
      referenceCount: 1,
      url: uploadResult.url,
    });

    return {
      attachment: {
        url: uploadResult.url,
        fileName: options.originalName,
        mimeType: options.mimeType,
        size: uploadResult.size,
        mediaId: mediaMetadata._id.toString(),
        storageProvider: uploadResult.storageProvider,
        checksum: uploadResult.checksum,
      },
      mediaMetadata,
    };
  }

  /**
   * Initiates a direct-to-cloud presigned upload session
   */
  public async createDirectUploadSession(options: {
    originalName: string;
    mimeType: string;
    conversationId: string;
    uploaderId: string;
    size?: number;
    type?: string;
  }): Promise<{
    sessionId: string;
    uploadUrl: string;
    mediaKey: string;
    storageProvider: string;
    expiresAt: Date;
    headers?: Record<string, string>;
  }> {
    if (!this.objectProvider) {
      throw new Error('Direct cloud uploads are not supported when Object Storage (R2/S3) is not configured');
    }

    const uniqueFilename = this.generateUniqueFilename(options.originalName, options.type);
    const presigned = await this.objectProvider.getPresignedUploadUrl({
      key: uniqueFilename,
      mimeType: options.mimeType,
      maxSizeBytes: 50 * 1024 * 1024,
      expiresInSeconds: 900,
      uploaderId: options.uploaderId,
      conversationId: options.conversationId,
    });

    const sessionId = `session_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;

    await UploadSession.create({
      sessionId,
      mediaKey: uniqueFilename,
      uploaderId: new Types.ObjectId(options.uploaderId),
      conversationId: new Types.ObjectId(options.conversationId),
      storageProvider: this.objectProvider.providerName,
      objectKey: uniqueFilename,
      originalName: options.originalName,
      mimeType: options.mimeType,
      expectedSize: options.size,
      uploadUrl: presigned.uploadUrl,
      status: 'pending',
      expiresAt: presigned.expiresAt,
    });

    return {
      sessionId,
      uploadUrl: presigned.uploadUrl,
      mediaKey: uniqueFilename,
      storageProvider: this.objectProvider.providerName,
      expiresAt: presigned.expiresAt,
      headers: presigned.headers,
    };
  }

  /**
   * Finalizes direct upload session after client uploads directly to R2 / S3
   */
  public async completeDirectUploadSession(
    sessionId: string,
    uploaderId: string
  ): Promise<{
    attachment: {
      url: string;
      fileName: string;
      mimeType: string;
      size: number;
      mediaId: string;
      storageProvider: string;
      checksum?: string;
    };
    mediaMetadata: IMediaMetadata;
  }> {
    const session = await UploadSession.findOne({ sessionId });
    if (!session) {
      throw new Error('Upload session not found or has expired');
    }

    if (session.uploaderId.toString() !== uploaderId.toString()) {
      throw new Error('Unauthorized to complete this upload session');
    }

    if (session.status === 'completed') {
      const existingMeta = await MediaMetadata.findOne({ mediaKey: session.mediaKey });
      if (existingMeta) {
        return {
          attachment: {
            url: existingMeta.url,
            fileName: existingMeta.originalName,
            mimeType: existingMeta.mimeType,
            size: existingMeta.size,
            mediaId: existingMeta._id.toString(),
            storageProvider: existingMeta.storageProvider,
            checksum: existingMeta.checksum,
          },
          mediaMetadata: existingMeta,
        };
      }
    }

    if (!this.objectProvider) {
      throw new Error('Object storage provider is unavailable');
    }

    // Verify object exists in bucket and query exact size
    const objectMeta = await this.objectProvider.getMetadata(session.objectKey);
    if (!objectMeta) {
      throw new Error('Uploaded file could not be verified in cloud storage');
    }

    session.status = 'completed';
    await session.save();

    const relativeUrl = `/api/messages/media/${session.mediaKey}`;

    const mediaMetadata = await MediaMetadata.create({
      mediaKey: session.mediaKey,
      originalName: session.originalName,
      mimeType: session.mimeType || objectMeta.mimeType,
      size: objectMeta.size,
      checksum: objectMeta.checksum,
      storageProvider: session.storageProvider,
      objectKey: session.objectKey,
      uploaderId: session.uploaderId,
      conversationId: session.conversationId,
      status: 'ready',
      referenceCount: 1,
      url: relativeUrl,
    });

    return {
      attachment: {
        url: relativeUrl,
        fileName: session.originalName,
        mimeType: session.mimeType || objectMeta.mimeType,
        size: objectMeta.size,
        mediaId: mediaMetadata._id.toString(),
        storageProvider: session.storageProvider,
        checksum: objectMeta.checksum,
      },
      mediaMetadata,
    };
  }

  /**
   * Transparently resolves and streams a media item from any provider (GridFS, R2, S3, or Local)
   */
  public async getStream(
    keyOrId: string
  ): Promise<{ stream: Readable; metadata: StorageFileMetadata }> {
    const cleanKey = path.basename(keyOrId);

    // 1. Check MediaMetadata collection first for canonical routing
    try {
      const metaDoc = await MediaMetadata.findOne({
        $or: [
          { mediaKey: cleanKey },
          ...(Types.ObjectId.isValid(cleanKey) ? [{ _id: cleanKey }] : []),
        ],
      });

      if (metaDoc && metaDoc.status !== 'deleted') {
        if (
          (metaDoc.storageProvider === 'r2' || metaDoc.storageProvider === 's3') &&
          this.objectProvider
        ) {
          return await this.objectProvider.getStream(metaDoc.objectKey);
        }
        if (metaDoc.storageProvider === 'gridfs') {
          return await this.gridfsProvider.getStream(metaDoc.objectKey);
        }
      }
    } catch {
      // Fall through to dual-check
    }

    // 2. Primary fallback: Check GridFS
    try {
      if (await this.gridfsProvider.exists(cleanKey)) {
        return await this.gridfsProvider.getStream(cleanKey);
      }
    } catch {
      // Fall through
    }

    // 3. Secondary fallback: Check Object Storage
    if (this.objectProvider) {
      try {
        if (await this.objectProvider.exists(cleanKey)) {
          return await this.objectProvider.getStream(cleanKey);
        }
      } catch {
        // Fall through
      }
    }

    // 4. Final attempt on GridFS/Local provider
    return await this.gridfsProvider.getStream(cleanKey);
  }

  /**
   * Transparently resolves and streams byte ranges (HTTP 206) for video/audio seeking
   */
  public async getRangeStream(
    keyOrId: string,
    start: number,
    end: number
  ): Promise<StorageRangeResult> {
    const cleanKey = path.basename(keyOrId);

    // 1. Check MediaMetadata
    try {
      const metaDoc = await MediaMetadata.findOne({
        $or: [
          { mediaKey: cleanKey },
          ...(Types.ObjectId.isValid(cleanKey) ? [{ _id: cleanKey }] : []),
        ],
      });

      if (metaDoc && metaDoc.status !== 'deleted') {
        if (
          (metaDoc.storageProvider === 'r2' || metaDoc.storageProvider === 's3') &&
          this.objectProvider
        ) {
          return await this.objectProvider.getRangeStream(metaDoc.objectKey, start, end);
        }
        if (metaDoc.storageProvider === 'gridfs') {
          return await this.gridfsProvider.getRangeStream(metaDoc.objectKey, start, end);
        }
      }
    } catch {
      // Fall through
    }

    // 2. Primary Fallback: GridFS
    try {
      if (await this.gridfsProvider.exists(cleanKey)) {
        return await this.gridfsProvider.getRangeStream(cleanKey, start, end);
      }
    } catch {
      // Fall through
    }

    // 3. Secondary Fallback: Object Storage
    if (this.objectProvider) {
      try {
        if (await this.objectProvider.exists(cleanKey)) {
          return await this.objectProvider.getRangeStream(cleanKey, start, end);
        }
      } catch {
        // Fall through
      }
    }

    return await this.gridfsProvider.getRangeStream(cleanKey, start, end);
  }

  /**
   * Checks existence across metadata and all storage providers
   */
  public async exists(keyOrId: string): Promise<boolean> {
    const cleanKey = path.basename(keyOrId);
    if (await this.gridfsProvider.exists(cleanKey)) return true;
    if (this.objectProvider && (await this.objectProvider.exists(cleanKey))) return true;
    return false;
  }

  /**
   * Soft deletes or purges media reference
   */
  public async delete(keyOrId: string): Promise<boolean> {
    const cleanKey = path.basename(keyOrId);
    const metaDoc = await MediaMetadata.findOneAndUpdate(
      {
        $or: [
          { mediaKey: cleanKey },
          ...(Types.ObjectId.isValid(cleanKey) ? [{ _id: cleanKey }] : []),
        ],
      },
      { status: 'deleted' }
    );

    if (metaDoc) {
      if (metaDoc.storageProvider === 'gridfs') {
        return await this.gridfsProvider.delete(metaDoc.objectKey);
      }
      if (this.objectProvider) {
        return await this.objectProvider.delete(metaDoc.objectKey);
      }
    }

    const res1 = await this.gridfsProvider.delete(cleanKey);
    const res2 = this.objectProvider ? await this.objectProvider.delete(cleanKey) : false;
    return res1 || res2;
  }
}
