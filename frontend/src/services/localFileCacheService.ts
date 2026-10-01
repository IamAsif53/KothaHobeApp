import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileOpener } from '@capawesome-team/capacitor-file-opener';
import { getMediaUrl } from '../api/messageApi';
import { NativeMedia, blobToBase64, getMimeAndExtension } from './nativeMediaService';

export type FileDownloadStatus = 'NOT_DOWNLOADED' | 'DOWNLOADING' | 'DOWNLOADED' | 'FAILED';

export interface CachedFileInfo {
  key: string;
  fileName: string;
  mimeType: string;
  localUri?: string;
  filePath?: string;
  size?: number;
  downloadedAt: number;
}

export interface DownloadProgressEvent {
  key: string;
  status: FileDownloadStatus;
  progress: number;
  error?: string;
  info?: CachedFileInfo;
}

type ProgressListener = (event: DownloadProgressEvent) => void;

const CACHE_STORAGE_KEY = 'kotha_hobe_downloaded_files_registry';

class LocalFileCacheService {
  private static instance: LocalFileCacheService;
  private activeDownloads = new Map<
    string,
    {
      controller: AbortController;
      promise: Promise<{ success: boolean; uri?: string; filePath?: string; error?: string }>;
      progress: number;
    }
  >();
  private listeners = new Set<ProgressListener>();
  private cacheRegistry = new Map<string, CachedFileInfo>();
  private initialized = false;

  private constructor() {
    this.loadRegistry();
  }

  public static getInstance(): LocalFileCacheService {
    if (!LocalFileCacheService.instance) {
      LocalFileCacheService.instance = new LocalFileCacheService();
    }
    return LocalFileCacheService.instance;
  }

  private loadRegistry(): void {
    try {
      const raw = localStorage.getItem(CACHE_STORAGE_KEY);
      if (raw) {
        const parsed: Record<string, CachedFileInfo> = JSON.parse(raw);
        Object.entries(parsed).forEach(([k, v]) => {
          this.cacheRegistry.set(k, v);
        });
      }
    } catch (err) {
      console.warn('[LocalFileCache] Load registry error:', err);
    }
    this.initialized = true;
  }

  private saveRegistry(): void {
    try {
      const obj: Record<string, CachedFileInfo> = {};
      this.cacheRegistry.forEach((v, k) => {
        obj[k] = v;
      });
      localStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(obj));
    } catch (err) {
      console.warn('[LocalFileCache] Save registry error:', err);
    }
  }

  public getCacheKey(urlOrMsgId: string, fileName?: string): string {
    if (!urlOrMsgId) return fileName || 'unknown_file';
    // Normalize relative or absolute URL to filename/key
    const clean = urlOrMsgId.split('?')[0].split('#')[0];
    const parts = clean.split('/');
    const lastPart = parts[parts.length - 1] || 'file';
    return `${lastPart}_${fileName || ''}`.replace(/[^a-zA-Z0-9._-]/g, '_');
  }

  public subscribe(listener: ProgressListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(event: DownloadProgressEvent): void {
    this.listeners.forEach((fn) => {
      try {
        fn(event);
      } catch (err) {
        console.warn('[LocalFileCache] Listener error:', err);
      }
    });
  }

  /**
   * Fast synchronous status lookup
   */
  public getDownloadStatus(
    urlOrMsgId: string,
    fileName?: string
  ): { status: FileDownloadStatus; progress: number; info?: CachedFileInfo } {
    const key = this.getCacheKey(urlOrMsgId, fileName);

    const active = this.activeDownloads.get(key);
    if (active) {
      return { status: 'DOWNLOADING', progress: active.progress };
    }

    const cached = this.cacheRegistry.get(key);
    if (cached) {
      return { status: 'DOWNLOADED', progress: 100, info: cached };
    }

    return { status: 'NOT_DOWNLOADED', progress: 0 };
  }

  /**
   * Asynchronous check verifying physical existence on disk on native Android
   */
  public async verifyLocalFileExists(
    urlOrMsgId: string,
    fileName: string
  ): Promise<{ exists: boolean; status: FileDownloadStatus; info?: CachedFileInfo }> {
    const key = this.getCacheKey(urlOrMsgId, fileName);
    const cached = this.cacheRegistry.get(key);

    if (!cached) {
      return { exists: false, status: 'NOT_DOWNLOADED' };
    }

    if (Capacitor.isNativePlatform() && cached.localUri) {
      try {
        // Test stat check on file
        await Filesystem.stat({
          path: cached.localUri,
        });
        return { exists: true, status: 'DOWNLOADED', info: cached };
      } catch {
        // File may have been removed externally; also check directory cache
        try {
          await Filesystem.stat({
            path: `downloads/${fileName}`,
            directory: Directory.Cache,
          });
          return { exists: true, status: 'DOWNLOADED', info: cached };
        } catch {
          // File was deleted from device disk; update cache
          this.cacheRegistry.delete(key);
          this.saveRegistry();
          this.notify({ key, status: 'NOT_DOWNLOADED', progress: 0 });
          return { exists: false, status: 'NOT_DOWNLOADED' };
        }
      }
    }

    return { exists: true, status: 'DOWNLOADED', info: cached };
  }

  /**
   * Cancel an in-flight download
   */
  public cancelDownload(urlOrMsgId: string, fileName?: string): void {
    const key = this.getCacheKey(urlOrMsgId, fileName);
    const active = this.activeDownloads.get(key);
    if (active) {
      active.controller.abort();
      this.activeDownloads.delete(key);
      this.notify({ key, status: 'NOT_DOWNLOADED', progress: 0 });
    }
  }

  /**
   * Core download runner with real byte-level progress tracking
   */
  public async downloadFile(options: {
    fileUrl: string;
    fileName: string;
    mimeType?: string;
    totalBytes?: number;
    messageId?: string;
  }): Promise<{ success: boolean; uri?: string; filePath?: string; error?: string }> {
    const { fileUrl, fileName, mimeType = 'application/pdf', totalBytes = 0, messageId } = options;
    const key = this.getCacheKey(messageId || fileUrl, fileName);

    // 1. Idempotency check: Return existing promise if already downloading
    const existing = this.activeDownloads.get(key);
    if (existing) {
      return existing.promise;
    }

    const abortController = new AbortController();

    const downloadPromise = (async () => {
      try {
        this.notify({ key, status: 'DOWNLOADING', progress: 0 });

        const fullUrl = getMediaUrl(fileUrl);
        const response = await fetch(fullUrl, {
          signal: abortController.signal,
        });

        if (!response.ok) {
          throw new Error(`Server returned HTTP ${response.status}`);
        }

        const contentLengthHeader = response.headers.get('content-length');
        const calculatedTotal = contentLengthHeader
          ? parseInt(contentLengthHeader, 10)
          : totalBytes || 0;

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Streaming response body not supported');
        }

        let receivedBytes = 0;
        const chunks: Uint8Array[] = [];

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          if (value) {
            chunks.push(value);
            receivedBytes += value.length;

            let pct = 0;
            if (calculatedTotal > 0) {
              pct = Math.min(99, Math.round((receivedBytes / calculatedTotal) * 100));
            } else {
              // Smooth logarithmic estimation if total size is unknown
              pct = Math.min(95, Math.round(50 * Math.log10(1 + receivedBytes / 102400)));
            }

            const activeItem = this.activeDownloads.get(key);
            if (activeItem) {
              activeItem.progress = pct;
            }

            this.notify({ key, status: 'DOWNLOADING', progress: pct });
          }
        }

        // Combine chunks into Blob
        const { mime } = getMimeAndExtension(fileName, mimeType);
        const finalBlob = new Blob(chunks as any, { type: mime });

        let localUri: string | undefined = undefined;
        let finalFilePath: string | undefined = undefined;

        if (Capacitor.isNativePlatform()) {
          const base64Data = await blobToBase64(finalBlob);

          // Save to user-accessible Downloads/Kotha Hobe folder
          try {
            const nativeRes = await NativeMedia.downloadDocument({
              base64Data,
              fileName,
              mimeType: mime,
            });
            if (nativeRes.filePath) finalFilePath = nativeRes.filePath;
          } catch (e) {
            console.warn('[LocalFileCache] NativeMedia download note:', e);
          }

          // Cache physical file locally in Cache directory for instant FileOpener access
          try {
            const cacheResult = await Filesystem.writeFile({
              path: `downloads/${fileName}`,
              data: base64Data,
              directory: Directory.Cache,
              recursive: true,
            });
            localUri = cacheResult.uri;
          } catch (writeErr) {
            console.warn('[LocalFileCache] Filesystem cache write error:', writeErr);
          }
        } else {
          // Web browser direct download
          const blobUrl = window.URL.createObjectURL(finalBlob);
          localUri = blobUrl;
          const a = document.createElement('a');
          a.href = blobUrl;
          a.download = fileName;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }

        const info: CachedFileInfo = {
          key,
          fileName,
          mimeType: mime,
          localUri,
          filePath: finalFilePath,
          size: receivedBytes,
          downloadedAt: Date.now(),
        };

        this.cacheRegistry.set(key, info);
        this.saveRegistry();

        this.activeDownloads.delete(key);
        this.notify({ key, status: 'DOWNLOADED', progress: 100, info });

        return { success: true, uri: localUri, filePath: finalFilePath };
      } catch (err: any) {
        this.activeDownloads.delete(key);

        if (err?.name === 'AbortError') {
          this.notify({ key, status: 'NOT_DOWNLOADED', progress: 0 });
          return { success: false, error: 'Download cancelled' };
        }

        console.error('[LocalFileCache] Download error:', err);
        this.notify({
          key,
          status: 'FAILED',
          progress: 0,
          error: err?.message || 'Download failed',
        });
        return { success: false, error: err?.message || 'Download failed' };
      }
    })();

    this.activeDownloads.set(key, {
      controller: abortController,
      promise: downloadPromise,
      progress: 0,
    });

    return downloadPromise;
  }

  /**
   * Direct open for downloaded document using native FileOpener or web viewer
   */
  public async openFile(options: {
    fileUrl: string;
    fileName: string;
    mimeType?: string;
    messageId?: string;
  }): Promise<{ success: boolean; error?: string }> {
    const { fileUrl, fileName, mimeType = 'application/pdf', messageId } = options;
    const key = this.getCacheKey(messageId || fileUrl, fileName);
    const cached = this.cacheRegistry.get(key);
    const { mime } = getMimeAndExtension(fileName, mimeType);

    if (Capacitor.isNativePlatform()) {
      let targetPath = cached?.localUri || cached?.filePath;

      // If not yet written to cache, ensure it's written or downloaded
      if (!targetPath) {
        const downloadRes = await this.downloadFile({
          fileUrl,
          fileName,
          mimeType,
          messageId,
        });
        if (!downloadRes.success || !downloadRes.uri) {
          return { success: false, error: downloadRes.error || 'File not available' };
        }
        targetPath = downloadRes.uri;
      }

      try {
        await FileOpener.openFile({
          path: targetPath,
          mimeType: mime,
        });
        return { success: true };
      } catch (err: any) {
        console.error('[LocalFileCache] FileOpener failed:', err);
        return {
          success: false,
          error: err?.message || 'No compatible app found to open this file',
        };
      }
    }

    // Web Browser fallback
    const fullUrl = getMediaUrl(fileUrl);
    window.open(fullUrl, '_blank', 'noopener,noreferrer');
    return { success: true };
  }
}

export const fileCacheService = LocalFileCacheService.getInstance();
