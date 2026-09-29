import mongoose, { Schema, Document, Types } from 'mongoose';

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'call' | 'system' | 'story_reply' | 'custom_emoji';
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

export interface IStoryContext {
  storyId: Types.ObjectId | string;
  slideId?: string;
  storyType?: 'text' | 'image';
  thumbnailUrl?: string;
  mediaUrl?: string;
  originalText?: string;
  storyOwnerName?: string;
  storyOwnerId?: Types.ObjectId | string;
  storyCreatedAt?: Date;
  reaction?: string;
  isExpired?: boolean;
}

export interface ICallDetails {
  callId: string;
  callType: 'voice' | 'video';
  status: 'completed' | 'missed' | 'declined' | 'cancelled' | 'failed' | 'busy';
  duration: number; // in seconds
  startedAt?: Date;
  endedAt?: Date;
}

export interface IAttachment {
  url: string;
  fileName: string;
  mimeType: string;
  size: number;
  duration?: number;
  width?: number;
  height?: number;
  thumbnailUrl?: string;
}

export interface IReplyTo {
  messageId: Types.ObjectId | string;
  text: string;
  senderName: string;
  type: MessageType;
  fileName?: string;
}

export interface IReaction {
  userId: Types.ObjectId | string;
  emoji: string;
  createdAt: Date;
}

export interface IReadReceipt {
  user: Types.ObjectId;
  readAt: Date;
}

export interface IForwardedFrom {
  messageId?: Types.ObjectId | string;
  senderName?: string;
  originalType?: string;
}

export interface ILinkPreview {
  url: string;
  title?: string;
  description?: string;
  image?: string;
  domain?: string;
}

export interface IMessage extends Document {
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  receiverId?: Types.ObjectId;
  senderNickname?: string;
  text: string;
  type: MessageType;
  customEmojiId?: string;
  status: MessageStatus;
  clientMessageId: string;
  attachment?: IAttachment;
  callDetails?: ICallDetails;
  replyTo?: IReplyTo;
  storyContext?: IStoryContext;
  forwardedFrom?: IForwardedFrom;
  linkPreview?: ILinkPreview;
  reactions: IReaction[];
  readBy: IReadReceipt[];
  mentions: Types.ObjectId[];
  deletedFor: Types.ObjectId[];
  isDeletedForEveryone: boolean;
  serverSequence: number;
  isPinned?: boolean;
  pinnedBy?: Types.ObjectId;
  pinnedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  deliveredAt?: Date;
  readAt?: Date;
  editedAt?: Date;
}

const ReactionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    emoji: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const AttachmentSchema = new Schema(
  {
    url: { type: String, required: true },
    fileName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    duration: { type: Number },
    width: { type: Number },
    height: { type: Number },
    thumbnailUrl: { type: String },
  },
  { _id: false }
);

const CallDetailsSchema = new Schema(
  {
    callId: { type: String, required: true },
    callType: { type: String, enum: ['voice', 'video'], default: 'voice' },
    status: {
      type: String,
      enum: ['completed', 'missed', 'declined', 'cancelled', 'failed', 'busy'],
      default: 'completed',
    },
    duration: { type: Number, default: 0 },
    startedAt: { type: Date },
    endedAt: { type: Date },
  },
  { _id: false }
);

const ReadReceiptSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    readAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ReplyToSchema = new Schema(
  {
    messageId: { type: Schema.Types.ObjectId, ref: 'Message', required: true },
    text: { type: String, default: '' },
    senderName: { type: String, default: '' },
    type: { type: String, enum: ['text', 'image', 'video', 'audio', 'document', 'call', 'system', 'story_reply', 'custom_emoji'], default: 'text' },
    fileName: { type: String },
  },
  { _id: false }
);

const StoryContextSchema = new Schema(
  {
    storyId: { type: Schema.Types.ObjectId, ref: 'Story', required: true },
    slideId: { type: String },
    storyType: { type: String, enum: ['text', 'image'], default: 'text' },
    thumbnailUrl: { type: String },
    mediaUrl: { type: String },
    originalText: { type: String },
    storyOwnerName: { type: String },
    storyOwnerId: { type: Schema.Types.ObjectId, ref: 'User' },
    storyCreatedAt: { type: Date },
    reaction: { type: String },
    isExpired: { type: Boolean, default: false },
  },
  { _id: false }
);

const ForwardedFromSchema = new Schema(
  {
    messageId: { type: Schema.Types.ObjectId, ref: 'Message' },
    senderName: { type: String, default: '' },
    originalType: { type: String, default: 'text' },
  },
  { _id: false }
);

const LinkPreviewSchema = new Schema(
  {
    url: { type: String, required: true },
    title: { type: String, default: '' },
    description: { type: String, default: '' },
    image: { type: String, default: '' },
    domain: { type: String, default: '' },
  },
  { _id: false }
);

const MessageSchema: Schema = new Schema(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    receiverId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: false,
      index: true,
    },
    senderNickname: {
      type: String,
      trim: true,
      maxlength: 60,
    },
    text: {
      type: String,
      trim: true,
      default: '',
      maxlength: 5000,
    },
    type: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'document', 'call', 'system', 'story_reply', 'custom_emoji'],
      default: 'text',
      index: true,
    },
    customEmojiId: {
      type: String,
      trim: true,
      sparse: true,
      index: true,
    },
    status: {
      type: String,
      enum: ['sending', 'sent', 'delivered', 'read'],
      default: 'sent',
    },
    clientMessageId: {
      type: String,
      required: true,
      unique: true, // Idempotency check
      index: true,
    },
    attachment: {
      type: AttachmentSchema,
      default: null,
    },
    callDetails: {
      type: CallDetailsSchema,
      default: null,
    },
    replyTo: {
      type: ReplyToSchema,
      default: null,
    },
    storyContext: {
      type: StoryContextSchema,
      default: null,
    },
    forwardedFrom: {
      type: ForwardedFromSchema,
      default: null,
    },
    linkPreview: {
      type: LinkPreviewSchema,
      default: null,
    },
    reactions: {
      type: [ReactionSchema],
      default: [],
    },
    readBy: {
      type: [ReadReceiptSchema],
      default: [],
    },
    mentions: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    deletedFor: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    isDeletedForEveryone: {
      type: Boolean,
      default: false,
    },
    serverSequence: {
      type: Number,
      default: 0,
      index: true,
    },
    isPinned: {
      type: Boolean,
      default: false,
      index: true,
    },
    pinnedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    pinnedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
      index: { expireAfterSeconds: 0 },
    },
    deliveredAt: {
      type: Date,
    },
    readAt: {
      type: Date,
    },
    editedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// High performance compound indexes
MessageSchema.index({ conversationId: 1, createdAt: -1 });
MessageSchema.index({ conversationId: 1, type: 1, createdAt: -1 });
MessageSchema.index({ conversationId: 1, isPinned: 1 });
MessageSchema.index({ conversationId: 1, serverSequence: 1 });

export const Message = mongoose.model<IMessage>('Message', MessageSchema);
