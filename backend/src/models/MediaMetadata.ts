import mongoose, { Schema, Document, Types } from 'mongoose';

export type StorageProviderType = 'gridfs' | 'r2' | 's3' | 'local';
export type MediaStatus = 'uploading' | 'ready' | 'deleted';

export interface IMediaMetadata extends Document {
  mediaKey: string;
  originalName: string;
  mimeType: string;
  size: number;
  checksum?: string;
  storageProvider: StorageProviderType;
  objectKey: string;
  bucket?: string;
  uploaderId?: Types.ObjectId;
  conversationId?: Types.ObjectId;
  status: MediaStatus;
  referenceCount: number;
  width?: number;
  height?: number;
  duration?: number;
  url: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const MediaMetadataSchema: Schema = new Schema(
  {
    mediaKey: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
    },
    mimeType: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    size: {
      type: Number,
      required: true,
      min: 0,
    },
    checksum: {
      type: String,
      trim: true,
      index: true,
    },
    storageProvider: {
      type: String,
      enum: ['gridfs', 'r2', 's3', 'local'],
      default: 'gridfs',
      index: true,
    },
    objectKey: {
      type: String,
      required: true,
      trim: true,
    },
    bucket: {
      type: String,
      trim: true,
    },
    uploaderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true,
    },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      index: true,
    },
    status: {
      type: String,
      enum: ['uploading', 'ready', 'deleted'],
      default: 'ready',
      index: true,
    },
    referenceCount: {
      type: Number,
      default: 1,
      min: 0,
    },
    width: {
      type: Number,
    },
    height: {
      type: Number,
    },
    duration: {
      type: Number,
    },
    url: {
      type: String,
      required: true,
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for fast query lookups
MediaMetadataSchema.index({ conversationId: 1, status: 1, createdAt: -1 });
MediaMetadataSchema.index({ uploaderId: 1, createdAt: -1 });

export const MediaMetadata = mongoose.model<IMediaMetadata>(
  'MediaMetadata',
  MediaMetadataSchema
);
