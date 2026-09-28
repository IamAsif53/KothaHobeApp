import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ILastMessage {
  text: string;
  senderId: Types.ObjectId;
  createdAt: Date;
  status: 'sending' | 'sent' | 'delivered' | 'read';
}

export interface IGroupMember {
  user: Types.ObjectId;
  role: 'admin' | 'moderator' | 'member';
  status: 'pending' | 'accepted' | 'declined';
  joinedAt?: Date;
  invitedBy?: Types.ObjectId;
}

export interface IGroupDescription {
  text: string;
  updatedAt: Date;
  updatedBy?: Types.ObjectId;
}

export interface IGroupJoinRequest {
  user: Types.ObjectId;
  requestedAt: Date;
}

export interface IGroupActivityLog {
  action: string;
  actor: Types.ObjectId;
  details?: string;
  createdAt: Date;
}

export interface IGroupEventAttendee {
  user: Types.ObjectId;
  status: 'going' | 'maybe' | 'not_going';
}

export interface IGroupEvent {
  _id: Types.ObjectId;
  title: string;
  description?: string;
  date: string;
  time: string;
  location?: string;
  creator: Types.ObjectId;
  attendees: IGroupEventAttendee[];
  createdAt: Date;
}

export interface IGroupPollOption {
  _id?: Types.ObjectId;
  text: string;
  voters: Types.ObjectId[];
}

export interface IGroupPoll {
  _id: Types.ObjectId;
  question: string;
  options: IGroupPollOption[];
  creator: Types.ObjectId;
  isClosed: boolean;
  createdAt: Date;
}

export interface IGroupPermissions {
  sendMessages: 'all' | 'admins';
  addMembers: 'all' | 'admins';
  editGroupInfo: 'all' | 'admins';
  pinMessages: 'all' | 'admins';
  createPolls: 'all' | 'admins';
  createEvents: 'all' | 'admins';
}

export interface IGroupMeta {
  name: string;
  avatarUrl?: string;
  description?: IGroupDescription;
  rules?: string[];
  creator: Types.ObjectId;
  admins: Types.ObjectId[];
  moderators?: Types.ObjectId[];
  members: IGroupMember[];
  nicknames?: Record<string, string>;
  inviteCode?: string;
  requiresApproval?: boolean;
  joinRequests?: IGroupJoinRequest[];
  pinnedMessages?: Types.ObjectId[];
  disappearingMode?: number; // 0 (off), 86400 (24h), 604800 (7d), 2592000 (30d)
  notificationSettings?: Record<string, 'all' | 'mentions' | 'muted'>;
  permissions?: IGroupPermissions;
  events?: IGroupEvent[];
  polls?: IGroupPoll[];
  activityLogs?: IGroupActivityLog[];
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
    role: { type: String, enum: ['admin', 'moderator', 'member'], default: 'member' },
    status: { type: String, enum: ['pending', 'accepted', 'declined'], default: 'pending' },
    joinedAt: { type: Date },
    invitedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const GroupDescriptionSchema = new Schema(
  {
    text: { type: String, default: '', maxlength: 1000 },
    updatedAt: { type: Date, default: Date.now },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: false }
);

const GroupJoinRequestSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requestedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const GroupActivityLogSchema = new Schema(
  {
    action: { type: String, required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    details: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const GroupEventSchema = new Schema(
  {
    title: { type: String, required: true, maxlength: 100 },
    description: { type: String, default: '', maxlength: 500 },
    date: { type: String, required: true },
    time: { type: String, required: true },
    location: { type: String, default: '', maxlength: 150 },
    creator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    attendees: [
      {
        user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        status: { type: String, enum: ['going', 'maybe', 'not_going'], default: 'going' },
      },
    ],
    createdAt: { type: Date, default: Date.now },
  }
);

const GroupPollSchema = new Schema(
  {
    question: { type: String, required: true, maxlength: 300 },
    options: [
      {
        text: { type: String, required: true, maxlength: 100 },
        voters: [{ type: Schema.Types.ObjectId, ref: 'User' }],
      },
    ],
    creator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isClosed: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now },
  }
);

const GroupPermissionsSchema = new Schema(
  {
    sendMessages: { type: String, enum: ['all', 'admins'], default: 'all' },
    addMembers: { type: String, enum: ['all', 'admins'], default: 'all' },
    editGroupInfo: { type: String, enum: ['all', 'admins'], default: 'all' },
    pinMessages: { type: String, enum: ['all', 'admins'], default: 'all' },
    createPolls: { type: String, enum: ['all', 'admins'], default: 'all' },
    createEvents: { type: String, enum: ['all', 'admins'], default: 'all' },
  },
  { _id: false }
);

const GroupMetaSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    avatarUrl: { type: String, default: '' },
    description: { type: GroupDescriptionSchema, default: null },
    rules: { type: [String], default: [] },
    creator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    admins: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    moderators: [{ type: Schema.Types.ObjectId, ref: 'User', default: [] }],
    members: [GroupMemberSchema],
    nicknames: { type: Map, of: String, default: {} },
    inviteCode: { type: String, sparse: true, index: true },
    requiresApproval: { type: Boolean, default: false },
    joinRequests: [GroupJoinRequestSchema],
    pinnedMessages: [{ type: Schema.Types.ObjectId, ref: 'Message', default: [] }],
    disappearingMode: { type: Number, default: 0 },
    notificationSettings: { type: Map, of: String, default: {} },
    permissions: {
      type: GroupPermissionsSchema,
      default: () => ({
        sendMessages: 'all',
        addMembers: 'all',
        editGroupInfo: 'all',
        pinMessages: 'all',
        createPolls: 'all',
        createEvents: 'all',
      }),
    },
    events: [GroupEventSchema],
    polls: [GroupPollSchema],
    activityLogs: [GroupActivityLogSchema],
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

