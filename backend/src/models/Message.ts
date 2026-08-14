import mongoose, { Schema, Document, Types } from 'mongoose';

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'document';
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read';

export interface IMessage extends Document {
  conversationId: Types.ObjectId;
  senderId: Types.ObjectId;
  receiverId: Types.ObjectId;
  text: string;
  type: MessageType;
  status: MessageStatus;
  clientMessageId: string;
  createdAt: Date;
  deliveredAt?: Date;
  readAt?: Date;
}

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
      required: true,
      trim: true,
      maxlength: 5000,
    },
    type: {
      type: String,
      enum: ['text', 'image', 'video', 'audio', 'document'],
      default: 'text',
    },
    status: {
      type: String,
      enum: ['sending', 'sent', 'delivered', 'read'],
      default: 'sent',
    },
    clientMessageId: {
      type: String,
      required: true,
      unique: true, // Idempotency check for offline retries
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

// Indexes for fast message retrieval & sorting
MessageSchema.index({ conversationId: 1, createdAt: -1 });
MessageSchema.index({ conversationId: 1, status: 1 });

export const Message = mongoose.model<IMessage>('Message', MessageSchema);
