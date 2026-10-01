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

export function uploadMediaApi(
  file: File | Blob,
  fileName: string,
  conversationId: string,
  type: string,
  onProgress?: (percent: number) => void
): Promise<{ success: boolean; attachment?: IAttachment; message?: string }> {
  const startTime = Date.now();
  const formData = new FormData();
  formData.append('file', file, fileName);
  formData.append('originalName', fileName);
  formData.append('conversationId', conversationId);
  formData.append('type', type);

  const token = getAuthToken();
  const apiBaseUrl =
    import.meta.env.VITE_API_URL ||
    (window.location.origin.includes('localhost') || window.location.origin.includes('file')
      ? 'https://kotha-hobe-api.onrender.com/api'
      : `${window.location.origin}/api`);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${apiBaseUrl}/messages/upload`, true);

    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }
    xhr.setRequestHeader('Bypass-Tunnel-Reminder', 'true');

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      const elapsed = Date.now() - startTime;
      console.log(`[UploadApi] Upload finished in ${elapsed}ms (status: ${xhr.status})`);
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText);
          resolve(res);
        } catch {
          resolve({ success: false, message: 'Invalid response from server' });
        }
      } else {
        try {
          const errRes = JSON.parse(xhr.responseText);
          resolve({ success: false, message: errRes.message || 'Upload failed' });
        } catch {
          resolve({ success: false, message: `Upload failed (status: ${xhr.status})` });
        }
      }
    };

    xhr.onerror = () => {
      const elapsed = Date.now() - startTime;
      console.error(`[UploadApi] Network error after ${elapsed}ms`);
      reject(new Error('Network error while uploading'));
    };

    xhr.send(formData);
  });
}

export function getMediaUrl(relativeUrl: string): string {
  if (!relativeUrl) return '';
  if (
    relativeUrl.startsWith('blob:') ||
    relativeUrl.startsWith('data:') ||
    relativeUrl.startsWith('http')
  ) {
    return relativeUrl;
  }

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




