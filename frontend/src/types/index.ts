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

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'document' | 'call' | 'system';
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

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
  reactions?: IReaction[];
  readBy?: string[];
  mentions?: string[];
  isDeletedForEveryone?: boolean;
  deletedFor?: string[];
  serverSequence?: number;
  createdAt: string;
  deliveredAt?: string;
  readAt?: string;
}

export interface IGroupMember {
  user: IUser;
  role: 'admin' | 'member';
  status: 'pending' | 'accepted' | 'declined';
  joinedAt?: string;
  invitedBy?: IUser | string;
}

export interface IGroupMeta {
  name: string;
  avatarUrl?: string;
  creator: IUser | string;
  admins: (IUser | string)[];
  members: IGroupMember[];
  nicknames?: Record<string, string>;
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
