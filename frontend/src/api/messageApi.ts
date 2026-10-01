import { apiFetch } from './client';
import { IMessage, IAttachment } from '../types';
import { uploadMedia, getMediaUrl } from './mediaService';

export { getMediaUrl };

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

export function uploadMediaApi(
  file: File | Blob,
  fileName: string,
  conversationId: string,
  type: string,
  onProgress?: (percent: number) => void
): Promise<{ success: boolean; attachment?: IAttachment; message?: string }> {
  return uploadMedia(file, {
    fileName,
    conversationId,
    type,
    onProgress,
  });
}

export async function fetchSharedMediaApi(
  conversationId: string,
  category: 'media' | 'documents' | 'audio',
  limit = 50,
  before?: string
): Promise<{ success: boolean; items: IMessage[]; hasMore: boolean }> {
  let url = `/conversations/${conversationId}/media?category=${category}&limit=${limit}`;
  if (before) {
    url += `&before=${encodeURIComponent(before)}`;
  }
  return apiFetch(url);
}

export async function searchInConversationApi(
  conversationId: string,
  query: string
): Promise<{ success: boolean; results: IMessage[] }> {
  return apiFetch(`/conversations/${conversationId}/search?q=${encodeURIComponent(query)}`);
}

export async function markConversationReadApi(
  conversationId: string
): Promise<{ success: boolean; conversationId?: string; readAt?: string }> {
  return apiFetch(`/messages/mark-read`, {
    method: 'POST',
    body: JSON.stringify({ conversationId }),
  });
}

export async function editMessageApi(
  messageId: string,
  text: string
): Promise<{ success: boolean; message?: IMessage; messageText?: string }> {
  return apiFetch(`/messages/${messageId}/edit`, {
    method: 'PUT',
    body: JSON.stringify({ text }),
  });
}

export async function forwardMessageApi(
  messageId: string,
  destinationConversationIds: string[]
): Promise<{ success: boolean; forwardedMessages?: IMessage[]; message?: string }> {
  return apiFetch(`/messages/forward`, {
    method: 'POST',
    body: JSON.stringify({ messageId, destinationConversationIds }),
  });
}

export async function fetchLinkPreviewApi(
  url: string
): Promise<{ success: boolean; preview?: any; message?: string }> {
  return apiFetch(`/messages/link-preview`, {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
}

export async function sendMessageRestApi(payload: {
  conversationId: string;
  receiverId?: string;
  text?: string;
  clientMessageId: string;
  type?: string;
  attachment?: any;
  replyTo?: any;
  customEmojiId?: string;
}): Promise<{ success: boolean; message?: IMessage; isDuplicate?: boolean }> {
  return apiFetch(`/messages/send`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function deleteMessageRestApi(
  messageId: string,
  conversationId?: string,
  deleteForEveryone: boolean = false
): Promise<{ success: boolean; message?: string }> {
  let url = `/messages/${messageId}?deleteForEveryone=${deleteForEveryone}`;
  if (conversationId) {
    url += `&conversationId=${encodeURIComponent(conversationId)}`;
  }
  return apiFetch(url, {
    method: 'DELETE',
  });
}

export interface MessageContextResponse {
  success: boolean;
  messages: IMessage[];
  targetMessageId: string;
}

export async function fetchMessageContextApi(
  conversationId: string,
  messageId: string
): Promise<MessageContextResponse> {
  return apiFetch<MessageContextResponse>(`/messages/${conversationId}/context/${messageId}`);
}




