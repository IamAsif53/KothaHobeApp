import { registerPlugin, Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { FileOpener } from '@capawesome-team/capacitor-file-opener';
import { getMediaUrl } from '../api/messageApi';

export interface NativeMediaPluginInterface {
  checkAudioPermission(): Promise<{ state: 'granted' | 'denied' | 'prompt'; shouldShowRationale?: boolean }>;
  requestAudioPermission(): Promise<{ state: 'granted' | 'denied'; shouldShowRationale?: boolean }>;
  openAppSettings(): Promise<{ success: boolean }>;
  saveImageToGallery(options: { base64Data: string; fileName: string }): Promise<{ success: boolean; uri?: string; filePath?: string }>;
  downloadDocument(options: { base64Data: string; fileName: string; mimeType: string }): Promise<{ success: boolean; fileName: string; uri?: string; filePath?: string }>;
}

export const NativeMedia = registerPlugin<NativeMediaPluginInterface>('NativeMedia');

// Helper to determine clean MIME type and file extension
export const getMimeAndExtension = (fileName = '', fileType = ''): { ext: string; mime: string } => {
  let ext = 'pdf';
  if (fileName.includes('.')) {
    ext = fileName.split('.').pop()?.trim().toLowerCase() || 'pdf';
  }

  let mime = fileType;
  if (!mime || mime === 'application/octet-stream') {
    if (ext === 'pdf') mime = 'application/pdf';
    else if (['jpg', 'jpeg'].includes(ext)) mime = 'image/jpeg';
    else if (ext === 'png') mime = 'image/png';
    else if (ext === 'webp') mime = 'image/webp';
    else if (ext === 'gif') mime = 'image/gif';
    else if (ext === 'doc') mime = 'application/msword';
    else if (ext === 'docx') mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    else if (ext === 'xls') mime = 'application/vnd.ms-excel';
    else if (ext === 'xlsx') mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    else if (ext === 'ppt') mime = 'application/vnd.ms-powerpoint';
    else if (ext === 'pptx') mime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    else if (ext === 'txt') mime = 'text/plain';
    else if (ext === 'csv') mime = 'text/csv';
    else if (ext === 'zip') mime = 'application/zip';
    else mime = `application/${ext}`;
  }
  return { ext, mime };
};

// Helper to convert Blob to base64 string
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      const base64 = result.includes(',') ? result.split(',')[1] : result;
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

    if (onProgress) onProgress(50);
    const blob = await res.blob();
    if (onProgress) onProgress(80);

    const { mime } = getMimeAndExtension(fileName, mimeType);

    if (Capacitor.isNativePlatform()) {
      const base64Data = await blobToBase64(blob);
      const nativeRes = await NativeMedia.downloadDocument({ base64Data, fileName, mimeType: mime });
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

// 4. Open Document with Capawesome FileOpener + Capacitor Filesystem
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
    const { mime } = getMimeAndExtension(fileName, mimeType);

    // 1. Native Mobile Platform (Android / iOS)
    if (Capacitor.isNativePlatform()) {
      const base64Data = await blobToBase64(blob);

      // Write physical file to app cache directory
      const writeResult = await Filesystem.writeFile({
        path: fileName,
        data: base64Data,
        directory: Directory.Cache,
        recursive: true,
      });

      // writeResult.uri gives the native file URI on Android / iOS
      const localPath = writeResult.uri;

      // Invoke Android system app chooser intent via Capawesome FileOpener
      await FileOpener.openFile({
        path: localPath,
        mimeType: mime,
      });

      return { success: true };
    }

    // 2. Web Browser Fallback
    const blobUrl = window.URL.createObjectURL(blob);
    window.open(blobUrl, '_blank');
    return { success: true };
  } catch (err: any) {
    console.error('[FileOpener] Error:', err);
    return {
      success: false,
      error: err?.message || 'No compatible reader app found on device',
    };
  }
}
