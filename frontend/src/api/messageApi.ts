import { apiFetch, getAuthToken } from './client';
import { IMessage, IAttachment } from '../types';

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

export async function uploadMediaApi(
  file: File | Blob,
  fileName: string,
  conversationId: string,
  type: string
): Promise<{ success: boolean; attachment?: IAttachment; message?: string }> {
  const formData = new FormData();
  formData.append('file', file, fileName);
  formData.append('conversationId', conversationId);
  formData.append('type', type);

  const token = getAuthToken();
  const apiBaseUrl =
    import.meta.env.VITE_API_URL ||
    (window.location.origin.includes('localhost') || window.location.origin.includes('file')
      ? 'https://kotha-hobe-api.onrender.com/api'
      : `${window.location.origin}/api`);

  const response = await fetch(`${apiBaseUrl}/messages/upload`, {
    method: 'POST',
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      'Bypass-Tunnel-Reminder': 'true',
    },
    body: formData,
  });

  return response.json();
}

export function getMediaUrl(relativeUrl: string): string {
  if (!relativeUrl) return '';
  if (relativeUrl.startsWith('http')) return relativeUrl;

  const token = getAuthToken();
  const baseUrl =
    import.meta.env.VITE_API_URL ||
    (window.location.origin.includes('localhost') || window.location.origin.includes('file')
      ? 'https://kotha-hobe-api.onrender.com'
      : window.location.origin);

  const cleanBase = baseUrl.endsWith('/api') ? baseUrl.slice(0, -4) : baseUrl;
  const separator = relativeUrl.includes('?') ? '&' : '?';
  return `${cleanBase}${relativeUrl}${token ? `${separator}token=${encodeURIComponent(token)}` : ''}`;
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
