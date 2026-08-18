import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ILastMessage {
  text: string;
  senderId: Types.ObjectId;
  createdAt: Date;
  status: 'sending' | 'sent' | 'delivered' | 'read';
}

export interface IConversation extends Document {
  participants: Types.ObjectId[];
  participantsKey: string;
  lastMessage?: ILastMessage;
  lastMessageAt: Date;
  deletedFor: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const ConversationSchema: Schema = new Schema(
  {
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    participantsKey: {
      type: String,
      required: true,
      unique: true, // Guarantees uniqueness for UserA <-> UserB
      index: true,
    },
    lastMessage: {
      text: { type: String, default: '' },
      senderId: { type: Schema.Types.ObjectId, ref: 'User' },
      createdAt: { type: Date, default: Date.now },
      status: { type: String, enum: ['sending', 'sent', 'delivered', 'read'], default: 'sent' },
    },
    lastMessageAt: {
      type: Date,
      default: Date.now,
    },
    deletedFor: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        default: [],
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes
ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ lastMessageAt: -1 });

export function generateParticipantsKey(userAId: string, userBId: string): string {
  const sorted = [userAId.toString(), userBId.toString()].sort();
  return `${sorted[0]}_${sorted[1]}`;
}

export const Conversation = mongoose.model<IConversation>('Conversation', ConversationSchema);
