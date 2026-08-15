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
  'https://52d6d908bbf4b3.lhr.life/update/latest.json';
