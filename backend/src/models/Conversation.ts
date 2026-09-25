import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ILastMessage {
  text: string;
  senderId: Types.ObjectId;
  createdAt: Date;
  status: 'sending' | 'sent' | 'delivered' | 'read';
}

export interface IGroupMember {
  user: Types.ObjectId;
  role: 'admin' | 'member';
  status: 'pending' | 'accepted' | 'declined';
  joinedAt?: Date;
  invitedBy?: Types.ObjectId;
}

export interface IGroupMeta {
  name: string;
  avatarUrl?: string;
  creator: Types.ObjectId;
  admins: Types.ObjectId[];
  members: IGroupMember[];
  nicknames?: Record<string, string>;
}

export interface IConversation extends Document {
  isGroup: boolean;
  participants: Types.ObjectId[];
  participantsKey?: string;
  groupMeta?: IGroupMeta;
  lastMessage?: ILastMessage;
  lastMessageAt: Date;
  deletedFor: Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const GroupMemberSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['admin', 'member'], default: 'member' },
    status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
    joinedAt: { type: Date },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const GroupMetaSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    avatarUrl: { type: String, default: '' },
    creator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    admins: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    members: [GroupMemberSchema],
    nicknames: { type: Map, of: String, default: {} },
  },
  { _id: false }
);

const ConversationSchema: Schema = new Schema(
  {
    isGroup: {
      type: Boolean,
      default: false,
      index: true,
    },
    participants: [
      {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
      },
    ],
    participantsKey: {
      type: String,
      sparse: true,
      unique: true,
      index: true,
    },
    groupMeta: {
      type: GroupMetaSchema,
      required: false,
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

// Pre-validate hook: automatically assign unique participantsKey for group conversations
ConversationSchema.pre<IConversation>('validate', function (next) {
  if (this.isGroup && (!this.participantsKey || this.participantsKey.trim() === '')) {
    this.participantsKey = `group_${this._id || new Types.ObjectId()}`;
  }
  next();
});

// Indexes
ConversationSchema.index({ participants: 1 });
ConversationSchema.index({ lastMessageAt: -1 });
ConversationSchema.index({ 'groupMeta.members.user': 1 });

export function generateParticipantsKey(userAId: string, userBId: string): string {
  const sorted = [userAId.toString(), userBId.toString()].sort();
  return `${sorted[0]}_${sorted[1]}`;
}

export const Conversation = mongoose.model<IConversation>('Conversation', ConversationSchema);

