import { Readable } from 'stream';

export interface StorageUploadOptions {
  filename: string;
  mimeType: string;
  originalName?: string;
  conversationId?: string;
  uploaderId?: string;
  size?: number;
  buffer?: Buffer;
}

export interface StorageUploadResult {
  key: string;
  url: string;
  storageProvider: 'gridfs' | 'r2' | 's3' | 'local';
  size: number;
  mimeType: string;
  originalName: string;
  checksum?: string;
}

export interface StorageRangeResult {
  stream: Readable;
  totalLength: number;
  contentLength: number;
  mimeType: string;
  start: number;
  end: number;
}

export interface StorageFileMetadata {
  key: string;
  size: number;
  mimeType: string;
  originalName?: string;
  lastModified?: Date;
  storageProvider: 'gridfs' | 'r2' | 's3' | 'local';
  checksum?: string;
}

export interface PresignedUploadOptions {
  key: string;
  mimeType: string;
  maxSizeBytes?: number;
  expiresInSeconds?: number;
  uploaderId?: string;
  conversationId?: string;
}

export interface PresignedUploadResult {
  uploadUrl: string;
  key: string;
  publicUrl?: string;
  expiresAt: Date;
  headers?: Record<string, string>;
}

export interface IMediaStorageProvider {
  readonly providerName: 'gridfs' | 'r2' | 's3' | 'local';

  /**
   * Uploads a file stream or buffer into the storage provider
   */
  upload(
    fileStreamOrBuffer: Readable | Buffer,
    options: StorageUploadOptions
  ): Promise<StorageUploadResult>;

  /**
   * Retrieves full file stream from the storage provider
   */
  getStream(key: string): Promise<{ stream: Readable; metadata: StorageFileMetadata }>;

  /**
   * Retrieves a partial byte-range stream (HTTP 206) for video/audio seeking
   */
  getRangeStream(
    key: string,
    start: number,
    end: number
  ): Promise<StorageRangeResult>;

  /**
   * Checks whether a file exists in the storage provider
   */
  exists(key: string): Promise<boolean>;

  /**
   * Fetches metadata for an existing file
   */
  getMetadata(key: string): Promise<StorageFileMetadata | null>;

  /**
   * Deletes a file from the storage provider
   */
  delete(key: string): Promise<boolean>;

  /**
   * Generates a direct presigned upload URL if supported (e.g. S3/R2)
   */
  getPresignedUploadUrl?(
    options: PresignedUploadOptions
  ): Promise<PresignedUploadResult>;
}
