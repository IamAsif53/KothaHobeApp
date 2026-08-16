import mongoose, { Schema, Document } from 'mongoose';

export interface IEmailOtp extends Document {
  email: string;
  otpHash: string;
  attempts: number;
  expiresAt: Date;
  createdAt: Date;
}

const EmailOtpSchema: Schema = new Schema({
  email: {
    type: String,
    required: true,
    lowercase: true,
    trim: true,
    index: true,
  },
  otpHash: {
    type: String,
    required: true,
  },
  attempts: {
    type: Number,
    default: 0,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expires: 0 }, // TTL index: auto-deletes when expired
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

export const EmailOtp = mongoose.model<IEmailOtp>('EmailOtp', EmailOtpSchema);
