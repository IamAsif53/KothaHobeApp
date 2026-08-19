import { apiFetch } from './client';

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
