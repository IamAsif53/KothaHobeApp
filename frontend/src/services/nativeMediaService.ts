import { registerPlugin } from '@capacitor/core';
import { Capacitor } from '@capacitor/core';
import { getMediaUrl } from '../api/messageApi';

export interface NativeMediaPluginInterface {
  checkAudioPermission(): Promise<{ state: 'granted' | 'denied' | 'prompt'; shouldShowRationale?: boolean }>;
  requestAudioPermission(): Promise<{ state: 'granted' | 'denied'; shouldShowRationale?: boolean }>;
  openAppSettings(): Promise<{ success: boolean }>;
  saveImageToGallery(options: { base64Data: string; fileName: string }): Promise<{ success: boolean; uri?: string; filePath?: string }>;
  downloadDocument(options: { base64Data: string; fileName: string; mimeType: string }): Promise<{ success: boolean; fileName: string; uri?: string; filePath?: string }>;
  openDocumentWithDefaultApp(options: { base64Data: string; fileName: string; mimeType: string }): Promise<{ success: boolean; error?: string }>;
}

export const NativeMedia = registerPlugin<NativeMediaPluginInterface>('NativeMedia');

// Helper to convert Blob to base64 string
async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.split(',')[1] || '';
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// 1. Microphone Permissions
export async function ensureAudioPermission(): Promise<{ granted: boolean; permanentlyDenied?: boolean }> {
  if (!Capacitor.isNativePlatform()) {
    return { granted: true };
  }

  try {
    const check = await NativeMedia.checkAudioPermission();
    if (check.state === 'granted') {
      return { granted: true };
    }

    const req = await NativeMedia.requestAudioPermission();
    if (req.state === 'granted') {
      return { granted: true };
    }

    const isPermanentlyDenied = req.shouldShowRationale === false;
    return { granted: false, permanentlyDenied: isPermanentlyDenied };
  } catch (err) {
    console.warn('[NativeMedia] Audio permission check error:', err);
    return { granted: false };
  }
}

export async function openSystemAppSettings(): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    try {
      await NativeMedia.openAppSettings();
    } catch (err) {
      console.warn('[NativeMedia] Open settings error:', err);
    }
  }
}

// 2. Save Image to Device Gallery / Photos
export async function saveImageToDevice(
  mediaUrl: string,
  fileName: string
): Promise<{ success: boolean; message: string }> {
  try {
    const fullUrl = getMediaUrl(mediaUrl);
    const res = await fetch(fullUrl);
    if (!res.ok) throw new Error('Failed to download image file');

    const blob = await res.blob();

    if (Capacitor.isNativePlatform()) {
      const base64Data = await blobToBase64(blob);
      const nativeRes = await NativeMedia.saveImageToGallery({ base64Data, fileName });
      if (nativeRes.success) {
        return { success: true, message: 'Image saved to Photos / Gallery' };
      }
      return { success: false, message: 'Could not save image to device' };
    } else {
      // Browser fallback
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
      return { success: true, message: 'Image downloaded' };
    }
  } catch (err: any) {
    console.error('[NativeMedia] Save image error:', err);
    return { success: false, message: err?.message || 'Unable to save image' };
  }
}

// 3. Download Document to Device Downloads Folder
export async function downloadDocumentToDevice(
  mediaUrl: string,
  fileName: string,
  mimeType = 'application/pdf',
  onProgress?: (percent: number) => void
): Promise<{ success: boolean; message: string; filePath?: string }> {
  try {
    const fullUrl = getMediaUrl(mediaUrl);
    if (onProgress) onProgress(20);

    const res = await fetch(fullUrl);
    if (!res.ok) throw new Error('Failed to fetch document file');

    if (onProgress) onProgress(60);
    const blob = await res.blob();
    if (onProgress) onProgress(85);

    if (Capacitor.isNativePlatform()) {
      const base64Data = await blobToBase64(blob);
      const nativeRes = await NativeMedia.downloadDocument({ base64Data, fileName, mimeType });
      if (onProgress) onProgress(100);

      if (nativeRes.success) {
        return { success: true, message: `Saved to Downloads/Kotha Hobe/${fileName}`, filePath: nativeRes.filePath };
      }
      return { success: false, message: 'Could not save document to Downloads' };
    } else {
      // Browser fallback
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
      if (onProgress) onProgress(100);
      return { success: true, message: 'Document downloaded' };
    }
  } catch (err: any) {
    console.error('[NativeMedia] Document download error:', err);
    return { success: false, message: err?.message || 'Download failed' };
  }
}

// 4. Open Document in Native Viewer App
export async function openDocumentInNativeApp(
  mediaUrl: string,
  fileName: string,
  mimeType = 'application/pdf'
): Promise<{ success: boolean; error?: string }> {
  try {
    const fullUrl = getMediaUrl(mediaUrl);
    const res = await fetch(fullUrl);
    if (!res.ok) throw new Error('Failed to fetch document file');

    const blob = await res.blob();

    if (Capacitor.isNativePlatform()) {
      const base64Data = await blobToBase64(blob);
      return await NativeMedia.openDocumentWithDefaultApp({ base64Data, fileName, mimeType });
    } else {
      // Browser fallback: open in new tab
      const blobUrl = window.URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
      return { success: true };
    }
  } catch (err: any) {
    console.error('[NativeMedia] Open document error:', err);
    return { success: false, error: err?.message || 'Failed to open document' };
  }
}
