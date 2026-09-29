import mongoose, { Schema, Document } from 'mongoose';

export interface IPrivacySettings {
  readReceipts: boolean;
  onlinePresence: boolean;
  lastSeen: 'everyone' | 'connections' | 'nobody';
  typingIndicators: boolean;
  storyVisibility: 'everyone' | 'connections' | 'close_friends';
  messageRequests: 'everyone' | 'connections';
  groupInvites: 'everyone' | 'connections';
}

export interface IUserSession {
  sessionId: string;
  deviceName: string;
  platform: 'android' | 'ios' | 'web' | 'windows' | 'macos' | 'linux';
  browser?: string;
  ipAddress?: string;
  lastActiveAt: Date;
  createdAt: Date;
}

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
  fcmTokens: string[];
  blockedUsers: mongoose.Types.ObjectId[];
  privacySettings: IPrivacySettings;
  sessions: IUserSession[];
  createdAt: Date;
  updatedAt: Date;
}

const UserSessionSchema = new Schema(
  {
    sessionId: { type: String, required: true },
    deviceName: { type: String, default: 'Unknown Device' },
    platform: {
      type: String,
      enum: ['android', 'ios', 'web', 'windows', 'macos', 'linux'],
      default: 'web',
    },
    browser: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
    lastActiveAt: { type: Date, default: Date.now },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const PrivacySettingsSchema = new Schema(
  {
    readReceipts: { type: Boolean, default: true },
    onlinePresence: { type: Boolean, default: true },
    lastSeen: {
      type: String,
      enum: ['everyone', 'connections', 'nobody'],
      default: 'everyone',
    },
    typingIndicators: { type: Boolean, default: true },
    storyVisibility: {
      type: String,
      enum: ['everyone', 'connections', 'close_friends'],
      default: 'connections',
    },
    messageRequests: {
      type: String,
      enum: ['everyone', 'connections'],
      default: 'everyone',
    },
    groupInvites: {
      type: String,
      enum: ['everyone', 'connections'],
      default: 'everyone',
    },
  },
  { _id: false }
);

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
      trim: true,
    },
    phoneVerified: {
      type: Boolean,
      default: false,
    },
    firebaseUid: {
      type: String,
    },
    fcmTokens: {
      type: [String],
      default: [],
    },
    blockedUsers: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: [],
      },
    ],
    privacySettings: {
      type: PrivacySettingsSchema,
      default: () => ({
        readReceipts: true,
        onlinePresence: true,
        lastSeen: 'everyone',
        typingIndicators: true,
        storyVisibility: 'connections',
        messageRequests: 'everyone',
        groupInvites: 'everyone',
      }),
    },
    sessions: {
      type: [UserSessionSchema],
      default: [],
    },
  },
  {
    timestamps: true,
  }
);

export const User = mongoose.model<IUser>('User', UserSchema);
