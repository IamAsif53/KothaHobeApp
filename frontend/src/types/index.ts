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

export type MessageType = 'text' | 'image' | 'video' | 'audio' | 'document';
export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

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
  receiverId: string;
  text: string;
  type: MessageType;
  status: MessageStatus;
  clientMessageId: string;
  attachment?: IAttachment;
  replyTo?: IReplyTo;
  reactions?: IReaction[];
  isDeletedForEveryone?: boolean;
  deletedFor?: string[];
  serverSequence?: number;
  createdAt: string;
  deliveredAt?: string;
  readAt?: string;
}

export interface IConversation {
  _id: string;
  recipient: IUser;
  lastMessage?: {
    text: string;
    senderId: string;
    createdAt: string;
    status: MessageStatus;
  };
  lastMessageAt: string;
  unreadCount?: number;
}
