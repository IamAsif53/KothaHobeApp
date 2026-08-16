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

export type MessageStatus = 'sending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface IMessage {
  _id: string;
  conversationId: string;
  senderId: string;
  receiverId: string;
  text: string;
  type: 'text' | 'image' | 'video' | 'audio';
  status: MessageStatus;
  clientMessageId: string;
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
  unreadCount: number;
}
