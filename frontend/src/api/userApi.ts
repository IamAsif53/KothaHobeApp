import { apiFetch } from './client';
import { IUser } from '../types';

export interface UserResponse {
  success: boolean;
  user?: IUser | null;
  message?: string;
}

export async function fetchMe(): Promise<UserResponse> {
  return apiFetch<UserResponse>('/users/me');
}

export async function updateProfileApi(
  username: string,
  displayName: string,
  avatarUrl?: string
): Promise<UserResponse> {
  return apiFetch<UserResponse>('/users/profile', {
    method: 'PUT',
    body: JSON.stringify({ username, displayName, avatarUrl }),
  });
}

export async function searchUserByUsernameApi(username: string): Promise<UserResponse> {
  return apiFetch<UserResponse>(`/users/search?username=${encodeURIComponent(username)}`);
}

export async function searchUserApi(query: string): Promise<UserResponse> {
  return apiFetch<UserResponse>(`/users/search?query=${encodeURIComponent(query)}`);
}

export async function registerPushTokenApi(token: string): Promise<{ success: boolean; message?: string }> {
  return apiFetch<{ success: boolean; message?: string }>('/users/push-token', {
    method: 'POST',
    body: JSON.stringify({ token }),
  });
}

export async function sendTestPushApi(): Promise<{ success: boolean; result?: any; message?: string; error?: string }> {
  return apiFetch<{ success: boolean; result?: any; message?: string; error?: string }>('/dev/push-test', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function sendTestCallPushApi(): Promise<{ success: boolean; callId?: string; result?: any; message?: string; error?: string }> {
  return apiFetch<{ success: boolean; callId?: string; result?: any; message?: string; error?: string }>('/dev/call-push-test', {
    method: 'POST',
    body: JSON.stringify({}),
  });
}

export async function getPushStatusApi(): Promise<{
  success: boolean;
  firebaseReady: boolean;
  userTokenCount: number;
  tokensMasked?: string[];
  instructions?: string;
}> {
  return apiFetch<{
    success: boolean;
    firebaseReady: boolean;
    userTokenCount: number;
    tokensMasked?: string[];
    instructions?: string;
  }>('/dev/push-status');
}

export async function blockUserApi(targetUserId: string): Promise<{ success: boolean; message?: string }> {
  return apiFetch<{ success: boolean; message?: string }>('/users/block', {
    method: 'POST',
    body: JSON.stringify({ targetUserId }),
  });
}

export async function unblockUserApi(targetUserId: string): Promise<{ success: boolean; message?: string }> {
  return apiFetch<{ success: boolean; message?: string }>('/users/unblock', {
    method: 'POST',
    body: JSON.stringify({ targetUserId }),
  });
}

export async function getBlockedUsersApi(): Promise<{ success: boolean; blockedUsers: IUser[] }> {
  return apiFetch<{ success: boolean; blockedUsers: IUser[] }>('/users/blocked');
}


