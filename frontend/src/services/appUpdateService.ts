import { registerPlugin } from '@capacitor/core';
import { CURRENT_VERSION, UPDATE_MANIFEST_URL } from '../config/version';

export interface ReleaseManifest {
  versionCode: number;
  versionName: string;
  downloadUrl: string;
  sha256?: string;
  releaseNotes: string[];
  mandatory?: boolean;
}

export interface AppUpdatePluginInterface {
  getAppVersion(): Promise<{ versionName: string; versionCode: number }>;
  checkInstallPermission(): Promise<{ canInstall: boolean }>;
  openInstallPermissionSettings(): Promise<void>;
  downloadAndInstallApk(options: {
    downloadUrl: string;
    sha256?: string;
    fileName?: string;
  }): Promise<{ success: boolean }>;
  addListener(
    eventName: 'downloadProgress',
    listenerFunc: (data: { progress: number }) => void
  ): Promise<any>;
}

const NativeAppUpdate = registerPlugin<AppUpdatePluginInterface>('AppUpdate');

export async function getCurrentAppVersion(): Promise<{ versionName: string; versionCode: number }> {
  try {
    const res = await NativeAppUpdate.getAppVersion();
    if (res && res.versionCode) {
      return res;
    }
  } catch (err) {
    // Fallback to web build version config
  }
  return CURRENT_VERSION;
}

export async function checkLatestRelease(): Promise<ReleaseManifest | null> {
  try {
    // Fetch release manifest (with timestamp query to prevent browser caching)
    const url = `${UPDATE_MANIFEST_URL}?t=${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const manifest: ReleaseManifest = await res.json();
    return manifest;
  } catch (err) {
    console.warn('[AppUpdate] Failed to fetch release manifest:', err);
    return null;
  }
}

export async function checkInstallPermission(): Promise<boolean> {
  try {
    const res = await NativeAppUpdate.checkInstallPermission();
    return res.canInstall;
  } catch (err) {
    return true; // Web fallback
  }
}

export async function openInstallPermissionSettings(): Promise<void> {
  try {
    await NativeAppUpdate.openInstallPermissionSettings();
  } catch (err) {
    console.warn('[AppUpdate] Unable to open settings:', err);
  }
}

export async function downloadAndInstallApk(
  manifest: ReleaseManifest,
  onProgress?: (progress: number) => void
): Promise<void> {
  if (onProgress) {
    await NativeAppUpdate.addListener('downloadProgress', (data) => {
      onProgress(data.progress);
    });
  }

  await NativeAppUpdate.downloadAndInstallApk({
    downloadUrl: manifest.downloadUrl,
    sha256: manifest.sha256,
    fileName: `kotha-hobe-v${manifest.versionName}.apk`,
  });
}
