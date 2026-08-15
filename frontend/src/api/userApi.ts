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

export async function updateProfileApi(displayName: string, avatarUrl?: string): Promise<UserResponse> {
  return apiFetch<UserResponse>('/users/profile', {
    method: 'PUT',
    body: JSON.stringify({ displayName, avatarUrl }),
  });
}

export async function searchUserByPhoneApi(phone: string): Promise<UserResponse> {
  return apiFetch<UserResponse>(`/users/search?phone=${encodeURIComponent(phone)}`);
}
