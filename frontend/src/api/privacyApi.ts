import { apiFetch } from './client';
import { IPrivacySettings, IUserSession, IConnectionSecurity, IBlockedUser } from '../types';

export interface PrivacyResponse {
  success: boolean;
  privacySettings: IPrivacySettings;
  message?: string;
}

export interface SessionsResponse {
  success: boolean;
  sessions: IUserSession[];
  currentSessionId?: string;
  message?: string;
}

export interface SecurityStatusResponse {
  success: boolean;
  security: IConnectionSecurity;
  message?: string;
}

export interface BlockedUsersResponse {
  success: boolean;
  blockedUsers: IBlockedUser[];
  message?: string;
}

export async function getPrivacySettingsApi(): Promise<PrivacyResponse> {
  return apiFetch<PrivacyResponse>('/users/privacy');
}

export async function updatePrivacySettingsApi(
  settings: Partial<IPrivacySettings>
): Promise<PrivacyResponse> {
  return apiFetch<PrivacyResponse>('/users/privacy', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}

export async function getUserSessionsApi(): Promise<SessionsResponse> {
  return apiFetch<SessionsResponse>('/users/sessions');
}

export async function revokeSessionApi(sessionId: string): Promise<{ success: boolean; message?: string }> {
  return apiFetch<{ success: boolean; message?: string }>(`/users/sessions/${sessionId}`, {
    method: 'DELETE',
  });
}

export async function revokeOtherSessionsApi(): Promise<{ success: boolean; message?: string }> {
  return apiFetch<{ success: boolean; message?: string }>('/users/sessions/revoke-others', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function getConnectionSecurityApi(): Promise<SecurityStatusResponse> {
  return apiFetch<SecurityStatusResponse>('/users/security/status');
}

export async function getBlockedUsersApi(): Promise<BlockedUsersResponse> {
  return apiFetch<BlockedUsersResponse>('/users/blocked');
}
