import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { IUser } from '../types';
import { fetchMe, updateProfileApi } from '../api/userApi';
import { loginWithFirebaseToken } from '../api/authApi';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { auth, RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from '../config/firebase';

interface AuthContextType {
  user: IUser | null;
  token: string | null;
  loading: boolean;
  phoneNumber: string;
  setPhoneNumber: (phone: string) => void;
  sendOtp: (phone: string, recaptchaContainerId?: string) => Promise<boolean>;
  verifyOtp: (code: string) => Promise<{ success: boolean; isNewUser?: boolean; error?: string }>;
  updateProfile: (displayName: string, avatarUrl?: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<IUser | null>(() => {
    try {
      const cached = localStorage.getItem('kotha_hobe_user');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState<string | null>(localStorage.getItem('kotha_hobe_token'));
  const [loading, setLoading] = useState<boolean>(true);
  const [phoneNumber, setPhoneNumber] = useState<string>(() => localStorage.getItem('kotha_hobe_pending_phone') || '');
  
  // Native verification ID ref (for @capacitor-firebase/authentication)
  const nativeVerificationIdRef = useRef<string>(localStorage.getItem('kotha_hobe_native_vid') || '');
  // Web confirmation result (for Firebase Web SDK fallback)
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  // Auto-login & sync session on app launch
  useEffect(() => {
    const initAuth = async () => {
      const storedToken = localStorage.getItem('kotha_hobe_token');
      if (storedToken) {
        try {
          const res = await fetchMe();
          if (res.success && res.user) {
            setUser(res.user);
            localStorage.setItem('kotha_hobe_user', JSON.stringify(res.user));
            setToken(storedToken);
          }
        } catch (error: any) {
          console.warn('[AuthContext] Session sync check:', error?.message);
          if (error?.message?.includes('401') || error?.message?.includes('unauthorized')) {
            logout();
          }
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  // Setup native listeners for Capacitor Android
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      const setupListeners = async () => {
        try {
          await FirebaseAuthentication.removeAllListeners();

          await FirebaseAuthentication.addListener('phoneCodeSent', (event) => {
            console.log('[Native FirebaseAuth] Phone code sent. VerificationId:', event.verificationId);
            nativeVerificationIdRef.current = event.verificationId;
            localStorage.setItem('kotha_hobe_native_vid', event.verificationId);
          });

          await FirebaseAuthentication.addListener('phoneVerificationFailed', (event) => {
            console.warn('[Native FirebaseAuth] Phone verification failed:', event.message);
          });

          await FirebaseAuthentication.addListener('phoneVerificationCompleted', async (event) => {
            console.log('[Native FirebaseAuth] Instant auto-verification completed:', event);
          });
        } catch (err) {
          console.warn('[Native FirebaseAuth] Listeners setup notice:', err);
        }
      };

      setupListeners();
    }
  }, []);

  const sendOtp = async (phone: string, recaptchaContainerId = 'recaptcha-container'): Promise<boolean> => {
    setPhoneNumber(phone);
    localStorage.setItem('kotha_hobe_pending_phone', phone);

    if (Capacitor.isNativePlatform()) {
      // 📱 NATIVE ANDROID: Uses Play Integrity & Native SMS verification
      try {
        console.log('[Native FirebaseAuth] Requesting native SMS verification for:', phone);
        await FirebaseAuthentication.signInWithPhoneNumber({ phoneNumber: phone });
        return true;
      } catch (error: any) {
        console.error('[Native FirebaseAuth] signInWithPhoneNumber error:', error);
        let errorMsg = error?.message || 'Failed to send verification SMS';
        if (errorMsg.includes('invalid-phone-number')) {
          errorMsg = 'Invalid phone number format. Please check your country code.';
        } else if (errorMsg.includes('quota-exceeded')) {
          errorMsg = 'Daily SMS limit reached. Please try again later.';
        } else if (errorMsg.includes('too-many-requests')) {
          errorMsg = 'Too many attempts. Please wait a moment and try again.';
        }
        throw new Error(errorMsg);
      }
    } else {
      // 🌐 WEB / DEV FALLBACK: Uses Firebase Web SDK with invisible reCAPTCHA
      try {
        let recaptchaVerifier = (window as any).recaptchaVerifier;

        if (!recaptchaVerifier) {
          const container = document.getElementById(recaptchaContainerId);
          if (container) {
            container.innerHTML = '';
          }

          recaptchaVerifier = new RecaptchaVerifier(auth, recaptchaContainerId, {
            size: 'invisible',
            callback: () => {
              console.log('[Web FirebaseAuth] Recaptcha verified');
            },
            'expired-callback': () => {
              console.warn('[Web FirebaseAuth] Recaptcha expired');
            },
          });
          (window as any).recaptchaVerifier = recaptchaVerifier;
        }

        const confirmation = await signInWithPhoneNumber(auth, phone, recaptchaVerifier);
        setConfirmationResult(confirmation);
        return true;
      } catch (error: any) {
        console.error('[Web FirebaseAuth] signInWithPhoneNumber error:', error);
        try {
          if ((window as any).recaptchaVerifier) {
            (window as any).recaptchaVerifier.clear();
            (window as any).recaptchaVerifier = null;
          }
        } catch {}

        let errorMsg = error?.message || 'Failed to send verification code';
        if (error?.code === 'auth/invalid-phone-number') {
          errorMsg = 'Invalid phone number format.';
        } else if (error?.code === 'auth/too-many-requests') {
          errorMsg = 'Too many attempts. Please try again in a few moments.';
        }
        throw new Error(errorMsg);
      }
    }
  };

  const verifyOtp = async (code: string): Promise<{ success: boolean; isNewUser?: boolean; error?: string }> => {
    const activePhone = phoneNumber || localStorage.getItem('kotha_hobe_pending_phone') || '';
    let firebaseIdToken = '';

    try {
      if (Capacitor.isNativePlatform()) {
        // 📱 NATIVE ANDROID: Confirm verification code via native plugin
        const verificationId = nativeVerificationIdRef.current || localStorage.getItem('kotha_hobe_native_vid') || '';
        
        if (!verificationId) {
          return { success: false, error: 'Verification session expired. Please request a new code.' };
        }

        console.log('[Native FirebaseAuth] Confirming verification code...');
        await FirebaseAuthentication.confirmVerificationCode({
          verificationId,
          verificationCode: code.trim(),
        });

        const tokenResult = await FirebaseAuthentication.getIdToken({ forceRefresh: true });
        firebaseIdToken = tokenResult.token;
      } else {
        // 🌐 WEB / DEV FALLBACK: Confirm via Firebase Web SDK
        if (!confirmationResult) {
          return { success: false, error: 'Verification session expired. Please request a new code.' };
        }

        const result = await confirmationResult.confirm(code.trim());
        firebaseIdToken = await result.user.getIdToken();
      }

      if (!firebaseIdToken) {
        return { success: false, error: 'Could not obtain security token from Firebase.' };
      }

      // Securely authenticate with Node.js backend using verified Firebase ID Token
      const res = await loginWithFirebaseToken(activePhone, firebaseIdToken);

      if (res.success && res.token && res.user) {
        localStorage.setItem('kotha_hobe_token', res.token);
        localStorage.setItem('kotha_hobe_user', JSON.stringify(res.user));
        localStorage.removeItem('kotha_hobe_pending_phone');
        localStorage.removeItem('kotha_hobe_native_vid');
        setToken(res.token);
        setUser(res.user);
        return { success: true, isNewUser: res.isNewUser };
      } else {
        return { success: false, error: res.message || 'Authentication failed on server.' };
      }
    } catch (error: any) {
      console.error('[FirebaseAuth] verifyOtp error:', error);
      let errMsg = 'Invalid verification code. Please check your SMS and try again.';
      if (error?.message?.includes('invalid-verification-code') || error?.code === 'auth/invalid-verification-code') {
        errMsg = 'Incorrect 6-digit code. Please enter the code from your SMS.';
      } else if (error?.message?.includes('session-expired') || error?.code === 'auth/code-expired') {
        errMsg = 'Verification code has expired. Please request a new code.';
      }
      return { success: false, error: errMsg };
    }
  };

  const updateProfile = async (displayName: string, avatarUrl?: string): Promise<boolean> => {
    try {
      const res = await updateProfileApi(displayName, avatarUrl);
      if (res.success && res.user) {
        setUser(res.user);
        localStorage.setItem('kotha_hobe_user', JSON.stringify(res.user));
        return true;
      }
      return false;
    } catch (error) {
      return false;
    }
  };

  const logout = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        await FirebaseAuthentication.signOut();
      } else {
        await auth.signOut();
      }
    } catch (e) {}

    localStorage.removeItem('kotha_hobe_token');
    localStorage.removeItem('kotha_hobe_user');
    localStorage.removeItem('kotha_hobe_pending_phone');
    localStorage.removeItem('kotha_hobe_native_vid');
    setToken(null);
    setUser(null);
    setConfirmationResult(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        phoneNumber,
        setPhoneNumber,
        sendOtp,
        verifyOtp,
        updateProfile,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};
