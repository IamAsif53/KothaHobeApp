import mongoose, { Schema, Document, Types } from 'mongoose';

export type StoryType = 'text' | 'image';
export type StoryPrivacy = 'everyone' | 'connections' | 'close_friends';

export interface IStoryViewer {
  user: Types.ObjectId;
  viewedAt: Date;
  reaction?: string;
}

export interface IStory extends Document {
  user: Types.ObjectId;
  type: StoryType;
  mediaUrl?: string;
  thumbnailUrl?: string;
  text?: string;
  background?: string;
  fontFamily?: string;
  fontSize?: number;
  textColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  duration: number; // in seconds (e.g. 5-7)
  viewers: IStoryViewer[];
  privacy: StoryPrivacy;
  isArchived: boolean;
  createdAt: Date;
  expiresAt: Date;
}

const StoryViewerSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    viewedAt: { type: Date, default: Date.now },
    reaction: { type: String, trim: true },
  },
  { _id: false }
);

const StorySchema: Schema = new Schema(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['text', 'image'],
      default: 'text',
      required: true,
    },
    mediaUrl: {
      type: String,
      default: '',
    },
    thumbnailUrl: {
      type: String,
      default: '',
    },
    text: {
      type: String,
      trim: true,
      default: '',
      maxlength: 2000,
    },
    background: {
      type: String,
      default: 'from-emerald-600 to-teal-800', // Default modern gradient
    },
    fontFamily: {
      type: String,
      default: 'sans',
    },
    fontSize: {
      type: Number,
      default: 24,
    },
    textColor: {
      type: String,
      default: '#ffffff',
    },
    textAlign: {
      type: String,
      enum: ['left', 'center', 'right'],
      default: 'center',
    },
    duration: {
      type: Number,
      default: 6, // 6 seconds per slide
    },
    viewers: {
      type: [StoryViewerSchema],
      default: [],
    },
    privacy: {
      type: String,
      enum: ['everyone', 'connections', 'close_friends'],
      default: 'connections',
    },
    isArchived: {
      type: Boolean,
      default: false,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// High performance compound indexes
StorySchema.index({ user: 1, expiresAt: -1 });
StorySchema.index({ expiresAt: 1, createdAt: -1 });
StorySchema.index({ 'viewers.user': 1 });

export const Story = mongoose.model<IStory>('Story', StorySchema);
