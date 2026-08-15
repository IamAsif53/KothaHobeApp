import { apiFetch } from './client';
import { IUser } from '../types';

export interface AuthResponse {
  success: boolean;
  token?: string;
  isNewUser?: boolean;
  user?: IUser;
  message?: string;
}

export type FirebaseLoginResponse = AuthResponse;

export async function loginWithFirebaseToken(
  phoneNumber: string,
  firebaseIdToken?: string,
  displayName?: string
): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/auth/firebase-login', {
    method: 'POST',
    body: JSON.stringify({ phoneNumber, firebaseIdToken, displayName }),
  });
}

export async function sendEmailOtpApi(email: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>('/auth/send-email-otp', {
    method: 'POST',
    body: JSON.stringify({ email }),
  });
}

export async function verifyEmailOtpApi(email: string, otp: string): Promise<AuthResponse> {
  return apiFetch<AuthResponse>('/auth/verify-email-otp', {
    method: 'POST',
    body: JSON.stringify({ email, otp }),
  });
}
