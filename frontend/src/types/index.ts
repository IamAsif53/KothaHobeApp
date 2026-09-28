export interface IUser {
  _id: string;
  email?: string;
  username?: string;
  usernameNormalized?: string;
  displayName: string;
  avatarUrl?: string;
  isOnline: boolean;
  lastSeen: string;
  phoneNumber?: string;
}

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'call' | 'system' | 'story_reply';
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface IStoryContext {
  storyId: string;
  slideId?: string;
  storyType?: 'text' | 'image';
  thumbnailUrl?: string;
  mediaUrl?: string;
  originalText?: string;
  storyOwnerName?: string;
  storyOwnerId?: string;
  storyCreatedAt?: string;
  reaction?: string;
  isExpired?: boolean;
}

export interface ICallDetails {
  callId: string;
  callType: 'voice' | 'video';
  status: 'completed' | 'missed' | 'declined' | 'cancelled' | 'failed' | 'busy';
  duration: number;
  isGroup?: boolean;
  startedAt?: string;
  endedAt?: string;
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
  messageId: string;
  text: string;
  senderName: string;
  type: MessageType;
  fileName?: string;
}

export interface IReaction {
  userId: string;
  emoji: string;
  createdAt: string;
}

export interface IStorySlide {
  _id: string;
  type: 'text' | 'image';
  mediaUrl?: string;
  thumbnailUrl?: string;
  text?: string;
  background?: string;
  fontFamily?: string;
  fontSize?: number;
  textColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  duration: number;
  createdAt: string;
  expiresAt: string;
  viewsCount: number;
  hasViewed: boolean;
  myReaction?: string | null;
  isMe: boolean;
}

export interface IStoryUser {
  _id: string;
  displayName: string;
  username: string;
  avatarUrl: string;
  isOnline?: boolean;
  lastSeen?: string;
}

export interface IStoryFeedItem {
  user: IStoryUser;
  slides: IStorySlide[];
  totalSlides: number;
  viewedSlides: number;
  hasUnseen: boolean;
  hasPartial: boolean;
  isFullyViewed: boolean;
  isMe: boolean;
  lastUpdated: string;
}

export interface IStoryViewer {
  user: IStoryUser;
  viewedAt: string;
  reaction?: string | null;
}

export interface IMessage {
  _id: string;
  conversationId: string;
  senderId: string;
  receiverId?: string;
  senderNickname?: string;
  text: string;
  type: MessageType;
  status: MessageStatus;
  clientMessageId: string;
  attachment?: IAttachment;
  callDetails?: ICallDetails;
  replyTo?: IReplyTo;
  storyContext?: IStoryContext;
  reactions?: IReaction[];
  readBy?: string[];
  mentions?: string[];
  isDeletedForEveryone?: boolean;
  deletedFor?: string[];
  serverSequence?: number;
  isPinned?: boolean;
  pinnedBy?: IUser | string;
  pinnedAt?: string;
  expiresAt?: string;
  createdAt: string;
  deliveredAt?: string;
  readAt?: string;
}

export type GroupRole = 'creator' | 'admin' | 'moderator' | 'member';

export interface IGroupMember {
  user: IUser;
  role: 'admin' | 'moderator' | 'member';
  status: 'pending' | 'accepted' | 'declined';
  joinedAt?: string;
  invitedBy?: IUser | string;
}

export interface IGroupDescription {
  text: string;
  updatedAt: string;
  updatedBy?: IUser | string;
}

export interface IGroupJoinRequest {
  user: IUser;
  requestedAt: string;
}

export interface IGroupActivityLog {
  action: string;
  actor: IUser;
  details?: string;
  createdAt: string;
}

export interface IGroupEventAttendee {
  user: IUser;
  status: 'going' | 'maybe' | 'not_going';
}

export interface IGroupEvent {
  _id: string;
  title: string;
  description?: string;
  date: string;
  time: string;
  location?: string;
  creator: IUser;
  attendees: IGroupEventAttendee[];
  createdAt: string;
}

export interface IGroupPollOption {
  _id?: string;
  text: string;
  voters: (IUser | string)[];
}

export interface IGroupPoll {
  _id: string;
  question: string;
  options: IGroupPollOption[];
  creator: IUser;
  isClosed: boolean;
  createdAt: string;
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
  description?: IGroupDescription | null;
  rules?: string[];
  creator: IUser | string;
  admins: (IUser | string)[];
  moderators?: (IUser | string)[];
  members: IGroupMember[];
  nicknames?: Record<string, string>;
  inviteCode?: string;
  requiresApproval?: boolean;
  joinRequests?: IGroupJoinRequest[];
  pinnedMessages?: (IMessage | string)[];
  disappearingMode?: number;
  notificationSettings?: Record<string, 'all' | 'mentions' | 'muted'>;
  permissions?: IGroupPermissions;
  events?: IGroupEvent[];
  polls?: IGroupPoll[];
  activityLogs?: IGroupActivityLog[];
}

export interface IConversation {
  _id: string;
  isGroup?: boolean;
  groupMeta?: IGroupMeta;
  participants?: IUser[];
  recipient?: IUser;
  myMembershipStatus?: 'pending' | 'accepted' | 'declined';
  lastMessage?: {
    text: string;
    senderId: string;
    createdAt: string;
    status: MessageStatus;
  };
  lastMessageAt: string;
  unreadCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface IActiveGroupCallState {
  isActive: boolean;
  callId?: string;
  conversationId?: string;
  callType?: 'voice' | 'video';
  participantCount?: number;
  startedAt?: string;
}
