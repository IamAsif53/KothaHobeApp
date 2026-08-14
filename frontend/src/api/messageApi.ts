import { apiFetch } from './client';
import { IMessage } from '../types';

export interface MessagesResponse {
  success: boolean;
  messages: IMessage[];
  hasMore: boolean;
  oldestCursor: string | null;
}

export async function fetchMessagesApi(
  conversationId: string,
  before?: string,
  limit = 30
): Promise<MessagesResponse> {
  let url = `/messages/${conversationId}/messages?limit=${limit}`;
  if (before) {
    url += `&before=${encodeURIComponent(before)}`;
  }
  return apiFetch<MessagesResponse>(url);
}
