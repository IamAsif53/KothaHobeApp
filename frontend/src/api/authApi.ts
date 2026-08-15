import { apiFetch } from './client';
import { IUser } from '../types';

export interface FirebaseLoginResponse {
  success: boolean;
  token?: string;
  isNewUser?: boolean;
  user?: IUser;
  message?: string;
}

export async function loginWithFirebaseToken(
  phoneNumber: string,
  firebaseIdToken?: string,
  displayName?: string
): Promise<FirebaseLoginResponse> {
  return apiFetch<FirebaseLoginResponse>('/auth/firebase-login', {
    method: 'POST',
    body: JSON.stringify({ phoneNumber, firebaseIdToken, displayName }),
  });
}
