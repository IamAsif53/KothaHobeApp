import mongoose, { Schema, Document, Types } from 'mongoose';

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'call';
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

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

export interface IMessage extends Document {
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  receiverId: Types.ObjectId;
  text: string;
  type: MessageType;
  status: MessageStatus;
  clientMessageId: string;
  attachment?: IAttachment;
  callDetails?: ICallDetails;
  replyTo?: IReplyTo;
  reactions: IReaction[];
  deletedFor: Types.ObjectId[];
  isDeletedForEveryone: boolean;
  serverSequence: number;
  createdAt: Date;
  deliveredAt?: Date;
  readAt?: Date;
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

const ReplyToSchema = new Schema(
  {
    messageId: { type: Schema.Types.ObjectId, ref: 'Message', required: true },
    text: { type: String, default: '' },
    senderName: { type: String, default: '' },
    type: { type: String, enum: ['text', 'image', 'video', 'audio', 'document', 'call'], default: 'text' },
    fileName: { type: String },
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
      required: true,
      index: true,
    },
    text: {
      type: String,
      trim: true,
      default: '',
      maxlength: 5000,
    },
    type: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'document', 'call'],
      default: 'text',
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
    reactions: {
      type: [ReactionSchema],
      default: [],
    },
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
    deliveredAt: {
      type: Date,
    },
    readAt: {
      type: Date,
    },
  },
  {
    timestamps: true,
  }
);

// High performance compound indexes
MessageSchema.index({ conversationId: 1, createdAt: -1 });
MessageSchema.index({ conversationId: 1, type: 1, createdAt: -1 });
MessageSchema.index({ conversationId: 1, serverSequence: 1 });

export const Message = mongoose.model<IMessage>('Message', MessageSchema);
