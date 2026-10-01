import { apiFetch } from './client';

export interface CallHistoryParticipant {
  _id: string;
  displayName: string;
  avatar?: string;
  username?: string;
}

export interface CallHistoryConversation {
  _id: string;
  name?: string;
  isGroup?: boolean;
  avatar?: string;
  groupMeta?: {
    membersCount?: number;
    description?: string;
  };
}

export interface CallHistoryItem {
  _id: string;
  callId: string;
  isGroup: boolean;
  callType: 'voice' | 'video';
  status:
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
  direction: 'incoming' | 'outgoing';
  caller: CallHistoryParticipant | null;
  receiver: CallHistoryParticipant | null;
  conversation: CallHistoryConversation | null;
  participantsHistory: Array<{
    user: CallHistoryParticipant | null;
    joinedAt: string;
    leftAt?: string;
  }>;
  startedAt: string;
  answeredAt?: string;
  connectedAt?: string;
  endedAt?: string;
  duration: number; // in seconds
}

export interface CallHistoryResponse {
  success: boolean;
  calls: CallHistoryItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
  message?: string;
}

export async function fetchCallHistoryApi(params?: {
  page?: number;
  limit?: number;
  filter?: 'all' | 'missed';
}): Promise<CallHistoryResponse> {
  const query = new URLSearchParams();
  if (params?.page) query.set('page', params.page.toString());
  if (params?.limit) query.set('limit', params.limit.toString());
  if (params?.filter) query.set('filter', params.filter);

  const queryString = query.toString();
  return apiFetch<CallHistoryResponse>(`/calls/history${queryString ? `?${queryString}` : ''}`);
}

export interface ActiveCallResponse {
  success: boolean;
  call?: {
    callId: string;
    conversationId: string;
    isIncoming: boolean;
    status: string;
    callType: 'voice' | 'video';
    caller: {
      _id: string;
      displayName: string;
      avatar?: string;
      username?: string;
    };
    receiver: {
      _id: string;
      displayName: string;
      avatar?: string;
      username?: string;
    };
  } | null;
  message?: string;
}

export async function fetchActiveCallApi(): Promise<ActiveCallResponse> {
  return apiFetch<ActiveCallResponse>('/calls/active');
}

