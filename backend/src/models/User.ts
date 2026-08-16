import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  email: string;
  emailVerified: boolean;
  username?: string;
  usernameNormalized?: string;
  displayName: string;
  avatarUrl?: string;
  isOnline: boolean;
  lastSeen: Date;
  phoneNumber?: string;
  phoneVerified?: boolean;
  firebaseUid?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema(
  {
    email: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    emailVerified: {
      type: Boolean,
      default: true,
    },
    username: {
      type: String,
      trim: true,
    },
    usernameNormalized: {
      type: String,
      unique: true,
      sparse: true,
      index: true,
      lowercase: true,
      trim: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      default: 'New User',
    },
    avatarUrl: {
      type: String,
      default: '',
    },
    isOnline: {
      type: Boolean,
      default: false,
    },
    lastSeen: {
      type: Date,
      default: Date.now,
    },
    phoneNumber: {
      type: String,
      sparse: true,
      index: true,
      trim: true,
    },
    phoneVerified: {
      type: Boolean,
      default: false,
    },
    firebaseUid: {
      type: String,
      sparse: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const User = mongoose.model<IUser>('User', UserSchema);
