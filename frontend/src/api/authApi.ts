import { apiFetch } from './client';
import { IUser } from '../types';

export interface AuthResponse {
  success: boolean;
  token?: string;
  isNewUser?: boolean;
  hasProfile?: boolean;
  user?: IUser;
  message?: string;
}

export async function sendEmailOtpApi(email: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>('/auth/send-email-otp', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function verifyEmailOtpApi(email: string, code: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/auth/verify-email-otp', {
    method: 'POST',
    body: JSON.stringify({ email, code, otp: code }),
  });
}
