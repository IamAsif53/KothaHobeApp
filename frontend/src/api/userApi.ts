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
