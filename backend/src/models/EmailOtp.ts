import mongoose, { Schema, Document } from 'mongoose';

export interface IEmailOtp extends Document {
  email: string;
  otp: string;
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
  otp: {
    type: String,
    required: true,
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
