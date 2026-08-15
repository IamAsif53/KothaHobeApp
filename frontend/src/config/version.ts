import versionData from '../../../version.json';

export interface AppVersion {
  versionName: string;
  versionCode: number;
}

export const CURRENT_VERSION: AppVersion = {
  versionName: versionData.versionName,
  versionCode: versionData.versionCode,
};

// URL pointing to public release manifest
export const UPDATE_MANIFEST_URL =
  import.meta.env.VITE_UPDATE_MANIFEST_URL ||
  'https://kotha-hobe-api.onrender.com/update/latest.json';
