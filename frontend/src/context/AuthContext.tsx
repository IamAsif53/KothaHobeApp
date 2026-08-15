import React, { createContext, useContext, useState, useEffect } from 'react';
import { IUser } from '../types';
import { fetchMe, updateProfileApi } from '../api/userApi';
import { loginWithFirebaseToken } from '../api/authApi';
import { auth, RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult } from '../config/firebase';

interface AuthContextType {
  user: IUser | null;
  token: string | null;
  loading: boolean;
  phoneNumber: string;
  setPhoneNumber: (phone: string) => void;
  sendOtp: (phone: string, recaptchaContainerId: string) => Promise<boolean>;
  verifyOtp: (code: string) => Promise<{ success: boolean; isNewUser?: boolean; error?: string }>;
  updateProfile: (displayName: string, avatarUrl?: string) => Promise<boolean>;
  logout: () => void;
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
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);

  // Auto-login & sync on app open
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
          console.warn('[AuthContext] Background sync notice:', error?.message);
          // If token is explicitly unauthorized (401), log out. Otherwise keep cached session!
          if (error?.message?.includes('401') || error?.message?.includes('unauthorized')) {
            logout();
          }
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const sendOtp = async (phone: string, recaptchaContainerId: string): Promise<boolean> => {
    setPhoneNumber(phone);
    try {
      // Clear previous verifier if any
      if ((window as any).recaptchaVerifier) {
        try {
          (window as any).recaptchaVerifier.clear();
        } catch (e) {}
        (window as any).recaptchaVerifier = null;
      }

      // Setup RecaptchaVerifier for Firebase Phone Auth
      const recaptchaVerifier = new RecaptchaVerifier(auth, recaptchaContainerId, {
        size: 'invisible',
        callback: () => {
          console.log('[Firebase Auth] Recaptcha verified');
        },
        'expired-callback': () => {
          console.warn('[Firebase Auth] Recaptcha expired');
        },
      });
      (window as any).recaptchaVerifier = recaptchaVerifier;

      const confirmation = await signInWithPhoneNumber(auth, phone, recaptchaVerifier);
      setConfirmationResult(confirmation);
      return true;
    } catch (error: any) {
      console.error('[Firebase Auth] signInWithPhoneNumber error:', error);
      let errorMsg = error?.message || 'Failed to send verification SMS';
      if (error?.code === 'auth/invalid-phone-number') {
        errorMsg = 'Invalid phone number format. Please include proper country code.';
      } else if (error?.code === 'auth/quota-exceeded') {
        errorMsg = 'Daily SMS quota exceeded. Please try again later.';
      } else if (error?.code === 'auth/too-many-requests') {
        errorMsg = 'Too many requests. Please wait a few moments and try again.';
      } else if (error?.code === 'auth/captcha-check-failed') {
        errorMsg = 'Security verification failed. Please try again.';
      }
      throw new Error(errorMsg);
    }
  };

  const verifyOtp = async (code: string): Promise<{ success: boolean; isNewUser?: boolean; error?: string }> => {
    try {
      if (!confirmationResult) {
        return { success: false, error: 'Verification session expired. Please request a new code.' };
      }

      const result = await confirmationResult.confirm(code);
      const firebaseIdToken = await result.user.getIdToken();

      // Login or register user in Node.js backend & MongoDB Atlas
      const res = await loginWithFirebaseToken(phoneNumber, firebaseIdToken);

      if (res.success && res.token && res.user) {
        localStorage.setItem('kotha_hobe_token', res.token);
        localStorage.setItem('kotha_hobe_user', JSON.stringify(res.user));
        setToken(res.token);
        setUser(res.user);
        return { success: true, isNewUser: res.isNewUser };
      } else {
        return { success: false, error: res.message || 'Authentication failed' };
      }
    } catch (error: any) {
      console.error('[Firebase Auth] verifyOtp error:', error);
      let errMsg = 'Invalid verification code. Please check your SMS and try again.';
      if (error?.code === 'auth/invalid-verification-code') {
        errMsg = 'Incorrect 6-digit code. Please enter the code from your SMS.';
      } else if (error?.code === 'auth/code-expired') {
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

  const logout = () => {
    localStorage.removeItem('kotha_hobe_token');
    localStorage.removeItem('kotha_hobe_user');
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
