import { apiFetch } from './client';
import { IConversation } from '../types';

export interface ConversationsListResponse {
  success: boolean;
  conversations: IConversation[];
}

export interface ConversationResponse {
  success: boolean;
  conversation: any;
}

export async function fetchConversations(): Promise<ConversationsListResponse> {
  return apiFetch<ConversationsListResponse>('/conversations');
}

export async function getOrCreateConversationApi(recipientId: string): Promise<ConversationResponse> {
  return apiFetch<ConversationResponse>('/conversations', {
    method: 'POST',
    body: JSON.stringify({ recipientId }),
  });
}
