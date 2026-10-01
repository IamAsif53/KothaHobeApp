import { apiFetch } from './client';

export interface ISearchPerson {
  _id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  isOnline: boolean;
  lastSeen: Date | null;
  conversationId: string | null;
  inContacts?: boolean;
}

export interface ISearchGroup {
  _id: string;
  name: string;
  avatarUrl?: string;
  description?: string;
  memberCount: number;
  isArchived: boolean;
  role?: string;
  lastMessageAt?: string | Date;
}

export interface ISearchMessage {
  _id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  text: string;
  type: string;
  attachment?: any;
  createdAt: string | Date;
  conversationTitle: string;
  conversationAvatar?: string;
  isGroup: boolean;
  isArchived: boolean;
}

export interface ISearchArchived {
  _id: string;
  title: string;
  avatarUrl?: string;
  isGroup: boolean;
  lastMessageText?: string;
  lastMessageAt?: string | Date;
}

export interface UnifiedSearchResponse {
  success: boolean;
  query: string;
  category: string;
  counts: {
    people: number;
    groups: number;
    messages: number;
    archived: number;
    total: number;
  };
  results: {
    people: ISearchPerson[];
    groups: ISearchGroup[];
    messages: ISearchMessage[];
    archived: ISearchArchived[];
  };
}

export async function searchUnifiedApi(
  query: string,
  type: 'all' | 'people' | 'groups' | 'messages' | 'archived' = 'all',
  limit = 20,
  signal?: AbortSignal
): Promise<UnifiedSearchResponse> {
  const params = new URLSearchParams({
    q: query.trim(),
    type,
    limit: String(limit),
  });

  return apiFetch<UnifiedSearchResponse>(`/search?${params.toString()}`, {
    signal,
  });
}
