import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Readable } from 'stream';
import crypto from 'crypto';
import path from 'path';
import {
  IMediaStorageProvider,
  StorageUploadOptions,
  StorageUploadResult,
  StorageRangeResult,
  StorageFileMetadata,
  PresignedUploadOptions,
  PresignedUploadResult,
} from './IMediaStorageProvider';

export interface ObjectStorageConfig {
  endpoint?: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  publicDomain?: string;
  forcePathStyle?: boolean;
}

export class ObjectStorageProvider implements IMediaStorageProvider {
  readonly providerName: 'r2' | 's3';
  private s3Client: S3Client;
  private bucket: string;
  private publicDomain?: string;

  constructor(config?: Partial<ObjectStorageConfig>) {
    const endpoint =
      config?.endpoint ||
      process.env.R2_ENDPOINT ||
      process.env.S3_ENDPOINT;

    this.bucket =
      config?.bucket ||
      process.env.R2_BUCKET ||
      process.env.S3_BUCKET ||
      'kotha-hobe-media';

    const accessKeyId =
      config?.accessKeyId ||
      process.env.R2_ACCESS_KEY_ID ||
      process.env.S3_ACCESS_KEY_ID ||
      '';

    const secretAccessKey =
      config?.secretAccessKey ||
      process.env.R2_SECRET_ACCESS_KEY ||
      process.env.S3_SECRET_ACCESS_KEY ||
      '';

    const region =
      config?.region ||
      process.env.R2_REGION ||
      process.env.S3_REGION ||
      (endpoint?.includes('r2.cloudflarestorage.com') ? 'auto' : 'us-east-1');

    this.publicDomain =
      config?.publicDomain ||
      process.env.R2_PUBLIC_DOMAIN ||
      process.env.S3_PUBLIC_DOMAIN;

    this.providerName = endpoint?.includes('r2.cloudflarestorage.com') ? 'r2' : 's3';

    this.s3Client = new S3Client({
      endpoint: endpoint || undefined,
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      forcePathStyle: config?.forcePathStyle ?? true,
    });
  }

  async upload(
    fileStreamOrBuffer: Readable | Buffer,
    options: StorageUploadOptions
  ): Promise<StorageUploadResult> {
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

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: options.filename,
      Body: buffer,
      ContentType: options.mimeType,
      Metadata: {
        originalname: encodeURIComponent(options.originalName || options.filename),
        mimetype: options.mimeType,
        uploaderid: options.uploaderId || '',
        conversationid: options.conversationId || '',
        checksum,
      },
    });

    await this.s3Client.send(command);

    return {
      key: options.filename,
      url: `/api/messages/media/${options.filename}`,
      storageProvider: this.providerName,
      size,
      mimeType: options.mimeType,
      originalName: options.originalName || options.filename,
      checksum,
    };
  }

  async getStream(key: string): Promise<{ stream: Readable; metadata: StorageFileMetadata }> {
    const cleanKey = path.basename(key);
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: cleanKey,
    });

    const response = await this.s3Client.send(command);
    if (!response.Body) {
      throw new Error(`Empty body returned for object "${cleanKey}"`);
    }

    const stream = response.Body as Readable;
    const metadata: StorageFileMetadata = {
      key: cleanKey,
      size: Number(response.ContentLength || 0),
      mimeType: response.ContentType || 'application/octet-stream',
      originalName: response.Metadata?.originalname ? decodeURIComponent(response.Metadata.originalname) : cleanKey,
      lastModified: response.LastModified,
      storageProvider: this.providerName,
      checksum: response.Metadata?.checksum,
    };

    return { stream, metadata };
  }

  async getRangeStream(
    key: string,
    start: number,
    end: number
  ): Promise<StorageRangeResult> {
    const cleanKey = path.basename(key);

    // Fetch total object length via HeadObject first to validate boundaries
    const headCommand = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: cleanKey,
    });
    const headRes = await this.s3Client.send(headCommand);
    const totalLength = Number(headRes.ContentLength || 0);

    const validStart = Math.max(0, start);
    const validEnd = Math.min(totalLength - 1, end);
    const contentLength = validEnd - validStart + 1;
    const mimeType = headRes.ContentType || 'application/octet-stream';

    const getCommand = new GetObjectCommand({
      Bucket: this.bucket,
      Key: cleanKey,
      Range: `bytes=${validStart}-${validEnd}`,
    });

    const response = await this.s3Client.send(getCommand);
    if (!response.Body) {
      throw new Error(`Empty stream returned for object range "${cleanKey}"`);
    }

    return {
      stream: response.Body as Readable,
      totalLength,
      contentLength,
      mimeType,
      start: validStart,
      end: validEnd,
    };
  }

  async exists(key: string): Promise<boolean> {
    try {
      const cleanKey = path.basename(key);
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: cleanKey,
      });
      await this.s3Client.send(command);
      return true;
    } catch {
      return false;
    }
  }

  async getMetadata(key: string): Promise<StorageFileMetadata | null> {
    try {
      const cleanKey = path.basename(key);
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: cleanKey,
      });
      const response = await this.s3Client.send(command);
      return {
        key: cleanKey,
        size: Number(response.ContentLength || 0),
        mimeType: response.ContentType || 'application/octet-stream',
        originalName: response.Metadata?.originalname ? decodeURIComponent(response.Metadata.originalname) : cleanKey,
        lastModified: response.LastModified,
        storageProvider: this.providerName,
        checksum: response.Metadata?.checksum,
      };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const cleanKey = path.basename(key);
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: cleanKey,
      });
      await this.s3Client.send(command);
      return true;
    } catch (err) {
      console.error('[ObjectStorageProvider] Delete error:', err);
      return false;
    }
  }

  async getPresignedUploadUrl(
    options: PresignedUploadOptions
  ): Promise<PresignedUploadResult> {
    const cleanKey = path.basename(options.key);
    const expiresIn = options.expiresInSeconds || 900; // 15 minutes default

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: cleanKey,
      ContentType: options.mimeType,
      Metadata: {
        mimetype: options.mimeType,
        uploaderid: options.uploaderId || '',
        conversationid: options.conversationId || '',
      },
    });

    const uploadUrl = await getSignedUrl(this.s3Client, command, { expiresIn });
    const expiresAt = new Date(Date.now() + expiresIn * 1000);

    return {
      uploadUrl,
      key: cleanKey,
      publicUrl: this.publicDomain ? `${this.publicDomain}/${cleanKey}` : undefined,
      expiresAt,
      headers: {
        'Content-Type': options.mimeType,
      },
    };
  }
}
