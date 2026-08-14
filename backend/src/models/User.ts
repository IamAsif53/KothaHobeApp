import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
  phoneNumber: string;
  phoneVerified: boolean;
  displayName: string;
  avatarUrl?: string;
  isOnline: boolean;
  lastSeen: Date;
  createdAt: Date;
  updatedAt: Date;
}

const UserSchema: Schema = new Schema(
  {
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    phoneVerified: {
      type: Boolean,
      default: true,
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
  },
  {
    timestamps: true,
  }
);

// Optimize queries by phoneNumber (indexed via schema definition)

export const User = mongoose.model<IUser>('User', UserSchema);
