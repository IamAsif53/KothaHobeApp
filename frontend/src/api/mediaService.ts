import { apiFetch, getAuthToken } from './client';
import { IAttachment } from '../types';

export interface UploadMediaOptions {
  fileName: string;
  conversationId: string;
  type: string;
  onProgress?: (percent: number) => void;
}

export interface UploadMediaResult {
  success: boolean;
  attachment?: IAttachment;
  message?: string;
}

interface UploadSessionResponse {
  success: boolean;
  directUploadSupported?: boolean;
  fallbackEndpoint?: string;
  session?: {
    sessionId: string;
    uploadUrl: string;
    mediaKey: string;
    storageProvider: string;
    expiresAt: string;
    headers?: Record<string, string>;
  };
  message?: string;
}

interface UploadCompleteResponse {
  success: boolean;
  attachment?: IAttachment;
  message?: string;
}

function getApiBaseUrl(): string {
  return (
    import.meta.env.VITE_API_URL ||
    (window.location.origin.includes('localhost') || window.location.origin.includes('file')
      ? 'https://kotha-hobe-api.onrender.com/api'
      : `${window.location.origin}/api`)
  );
}

/**
 * Resolves a media relative URL into a full authenticated streaming URL
 */
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

/**
 * Standard multipart upload fallback (POST /api/messages/upload)
 */
export function uploadMediaMultipart(
  file: File | Blob,
  options: UploadMediaOptions
): Promise<UploadMediaResult> {
  const { fileName, conversationId, type, onProgress } = options;
  const startTime = Date.now();

  const formData = new FormData();
  formData.append('file', file, fileName);
  formData.append('originalName', fileName);
  formData.append('conversationId', conversationId);
  formData.append('type', type);

  const token = getAuthToken();
  const apiBaseUrl = getApiBaseUrl();

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
      console.log(`[MediaService] Multipart upload finished in ${elapsed}ms (status: ${xhr.status})`);
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
      console.error(`[MediaService] Multipart network error after ${elapsed}ms`);
      reject(new Error('Network error while uploading'));
    };

    xhr.send(formData);
  });
}

/**
 * Direct PUT upload to cloud presigned URL (Cloudflare R2 / S3)
 */
function uploadDirectToPresignedUrl(
  file: File | Blob,
  uploadUrl: string,
  mimeType: string,
  headers?: Record<string, string>,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', mimeType);

    if (headers) {
      Object.entries(headers).forEach(([key, val]) => {
        if (key.toLowerCase() !== 'content-type') {
          xhr.setRequestHeader(key, val);
        }
      });
    }

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 90); // Reserve 90-100% for backend confirmation
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Direct cloud upload failed with status ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Direct cloud upload network error'));
    };

    xhr.send(file);
  });
}

/**
 * High-performance smart upload with automatic cloud session acceleration and fallback
 */
export async function uploadMedia(
  file: File | Blob,
  options: UploadMediaOptions
): Promise<UploadMediaResult> {
  const mimeType = file.type || 'application/octet-stream';
  const size = file.size;

  try {
    // 1. Check if direct cloud upload session is available
    const sessionRes = await apiFetch<UploadSessionResponse>('/media/upload-session', {
      method: 'POST',
      body: JSON.stringify({
        conversationId: options.conversationId,
        originalName: options.fileName,
        mimeType,
        size,
        type: options.type,
      }),
    }).catch(() => null);

    if (sessionRes?.success && sessionRes.directUploadSupported && sessionRes.session) {
      const { session } = sessionRes;
      console.log(`[MediaService] Initiating direct cloud upload session (${session.storageProvider})`);

      // 2. Upload file directly to S3 / Cloudflare R2
      await uploadDirectToPresignedUrl(
        file,
        session.uploadUrl,
        mimeType,
        session.headers,
        options.onProgress
      );

      // 3. Confirm completion with backend
      if (options.onProgress) options.onProgress(95);

      const completeRes = await apiFetch<UploadCompleteResponse>('/media/upload-complete', {
        method: 'POST',
        body: JSON.stringify({ sessionId: session.sessionId }),
      });

      if (options.onProgress) options.onProgress(100);

      if (completeRes.success && completeRes.attachment) {
        return {
          success: true,
          attachment: completeRes.attachment,
        };
      }
    }
  } catch (directErr) {
    console.warn('[MediaService] Direct cloud upload session failed, falling back to multipart:', directErr);
  }

  // 4. Fallback: Standard multipart upload stream
  return uploadMediaMultipart(file, options);
}
