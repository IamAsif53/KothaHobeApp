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

export interface ICallParticipantHistory {
  user: Types.ObjectId;
  joinedAt: Date;
  leftAt?: Date;
}

export interface ICall extends Document {
  callId: string;
  isGroup: boolean;
  callerId: Types.ObjectId;
  receiverId?: Types.ObjectId;
  conversationId: Types.ObjectId;
  activeParticipants: Types.ObjectId[];
  participantsHistory: ICallParticipantHistory[];
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
    isGroup: {
      type: Boolean,
      default: false,
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
      required: false,
      index: true,
    },
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true,
    },
    activeParticipants: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    participantsHistory: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        joinedAt: { type: Date, default: Date.now },
        leftAt: { type: Date },
      },
    ],
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
