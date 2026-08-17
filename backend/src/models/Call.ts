import mongoose, { Schema, Document, Types } from 'mongoose';

export type CallType = 'voice' | 'video';
export type CallStatus =
  | 'calling'
  | 'ringing'
  | 'accepted'
  | 'connected'
  | 'ended'
  | 'declined'
  | 'cancelled'
  | 'missed'
  | 'busy'
  | 'failed';

export interface ICall extends Document {
  callId: string;
  callerId: Types.ObjectId;
  receiverId: Types.ObjectId;
  conversationId: Types.ObjectId;
  callType: CallType;
  status: CallStatus;
  startedAt: Date;
  answeredAt?: Date;
  connectedAt?: Date;
  endedAt?: Date;
  duration: number; // in seconds
  createdAt: Date;
  updatedAt: Date;
}

const CallSchema = new Schema(
  {
    callId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    callerId: {
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
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    callType: {
      type: String,
      enum: ['voice', 'video'],
      default: 'voice',
    },
    status: {
      type: String,
      enum: [
        'calling',
        'ringing',
        'accepted',
        'connected',
        'ended',
        'declined',
        'cancelled',
        'missed',
        'busy',
        'failed',
      ],
      default: 'calling',
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    answeredAt: {
      type: Date,
    },
    connectedAt: {
      type: Date,
    },
    endedAt: {
      type: Date,
    },
    duration: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

export const Call = mongoose.model<ICall>('Call', CallSchema);
