import mongoose, { Schema, Document, Types } from 'mongoose';

export type UploadSessionStatus = 'pending' | 'completed' | 'expired' | 'aborted';

export interface IUploadSession extends Document {
  sessionId: string;
  mediaKey: string;
  uploaderId: Types.ObjectId;
  conversationId: Types.ObjectId;
  storageProvider: 'r2' | 's3' | 'gridfs';
  objectKey: string;
  originalName: string;
  mimeType: string;
  expectedSize?: number;
  uploadUrl?: string;
  status: UploadSessionStatus;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UploadSessionSchema: Schema = new Schema(
  {
    sessionId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    mediaKey: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    uploaderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    storageProvider: {
      type: String,
      enum: ['r2', 's3', 'gridfs'],
      required: true,
      default: 'gridfs',
    },
    objectKey: {
      type: String,
      required: true,
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
    },
    expectedSize: {
      type: Number,
      min: 0,
    },
    uploadUrl: {
      type: String,
    },
    status: {
      type: String,
      enum: ['pending', 'completed', 'expired', 'aborted'],
      default: 'pending',
      index: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 }, // Automatic TTL cleanup of abandoned upload sessions
    },
  },
  {
    timestamps: true,
  }
);

export const UploadSession = mongoose.model<IUploadSession>(
  'UploadSession',
  UploadSessionSchema
);
