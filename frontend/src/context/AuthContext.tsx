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

  const sendOtp = async (phone: string, recaptchaContainerId = 'recaptcha-container'): Promise<boolean> => {
    setPhoneNumber(phone);
    localStorage.setItem('kotha_hobe_pending_phone', phone);
    console.log('[FirebaseAuth] === SEND OTP START ===');
    console.log('[FirebaseAuth] Normalized E.164 phone number:', phone);

    if (Capacitor.isNativePlatform()) {
      // 📱 NATIVE ANDROID: Uses native PhoneAuthProvider with strict event listener synchronization
      return new Promise(async (resolve, reject) => {
        let isSettled = false;
        let timeoutTimer: any = null;

        // Clean up listeners and timeout
        const cleanup = async () => {
          if (timeoutTimer) clearTimeout(timeoutTimer);
          try {
            await FirebaseAuthentication.removeAllListeners();
          } catch (e) {}
        };

        try {
          await FirebaseAuthentication.removeAllListeners();

          // 1. Success Event: SMS code dispatched by Google Firebase
          await FirebaseAuthentication.addListener('phoneCodeSent', async (event) => {
            console.log('[FirebaseAuth] [SUCCESS] phoneCodeSent event received');
            console.log('[FirebaseAuth] Verification ID received:', event.verificationId ? 'YES (Valid ID)' : 'MISSING');
            
            if (isSettled) return;
            isSettled = true;
            await cleanup();

            nativeVerificationIdRef.current = event.verificationId;
            localStorage.setItem('kotha_hobe_native_vid', event.verificationId);
            resolve(true);
          });

          // 2. Instant Verification Event (on supported devices with instant auto-retrieval)
          await FirebaseAuthentication.addListener('phoneVerificationCompleted', async (event) => {
            console.log('[FirebaseAuth] [INSTANT] phoneVerificationCompleted event received:', event);
            if (isSettled) return;
            isSettled = true;
            await cleanup();

            try {
              const tokenResult = await FirebaseAuthentication.getIdToken({ forceRefresh: true });
              if (tokenResult?.token) {
                const res = await loginWithFirebaseToken(phone, tokenResult.token);
                if (res.success && res.token && res.user) {
                  localStorage.setItem('kotha_hobe_token', res.token);
                  localStorage.setItem('kotha_hobe_user', JSON.stringify(res.user));
                  setToken(res.token);
                  setUser(res.user);
                }
              }
            } catch (instantErr) {
              console.warn('[FirebaseAuth] Instant login handle notice:', instantErr);
            }
            resolve(true);
          });

          // 3. Failure Event: Capture exact Firebase exception from native layer
          await FirebaseAuthentication.addListener('phoneVerificationFailed', async (event) => {
            console.error('[FirebaseAuth] [FAILED] phoneVerificationFailed event received:', event);
            console.error('[FirebaseAuth] Exact Firebase error message:', event?.message);

            if (isSettled) return;
            isSettled = true;
            await cleanup();

            const rawMsg = event?.message || 'Verification failed';
            let friendlyMsg = rawMsg;

            if (rawMsg.includes('quota') || rawMsg.includes('TOO_MANY_REQUESTS') || rawMsg.includes('39') || rawMsg.includes('17010')) {
              friendlyMsg = 'Firebase SMS limit reached for today. Please wait or use test credentials.';
            } else if (rawMsg.includes('invalid-phone-number') || rawMsg.includes('INVALID_PHONE_NUMBER') || rawMsg.includes('17042')) {
              friendlyMsg = 'Invalid phone number format. Please ensure your Bangladeshi number is 11 digits.';
            } else if (rawMsg.includes('Play Integrity') || rawMsg.includes('SafetyNet') || rawMsg.includes('app-not-authorized') || rawMsg.includes('17028')) {
              friendlyMsg = 'Device security check failed (Play Integrity / SHA mismatch). Please verify Play Services.';
            } else if (rawMsg.includes('blocked') || rawMsg.includes('BILLING_NOT_ENABLED')) {
              friendlyMsg = 'SMS dispatch is restricted in this region or project billing is required.';
            }

            reject(new Error(friendlyMsg));
          });

          // 4. Timeout fallback (30 seconds)
          timeoutTimer = setTimeout(async () => {
            if (!isSettled) {
              isSettled = true;
              await cleanup();
              console.error('[FirebaseAuth] Verification request timed out after 30 seconds');
              reject(new Error('Verification request timed out. Please check your internet connection and try again.'));
            }
          }, 30000);

          console.log('[FirebaseAuth] Invoking native signInWithPhoneNumber...');
          await FirebaseAuthentication.signInWithPhoneNumber({ phoneNumber: phone });
        } catch (callErr: any) {
          console.error('[FirebaseAuth] Native signInWithPhoneNumber method call error:', callErr);
          if (!isSettled) {
            isSettled = true;
            await cleanup();
            reject(new Error(callErr?.message || 'Failed to start phone verification'));
          }
        }
      });
    } else {
      // 🌐 WEB / DEV FALLBACK: Uses Firebase Web SDK
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
        console.log('[Web FirebaseAuth] Web confirmation result received');
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
        } else if (error?.code === 'auth/quota-exceeded') {
          errorMsg = 'SMS quota exceeded for today.';
        }
        throw new Error(errorMsg);
      }
    }
  };

  const verifyOtp = async (code: string): Promise<{ success: boolean; isNewUser?: boolean; error?: string }> => {
    const activePhone = phoneNumber || localStorage.getItem('kotha_hobe_pending_phone') || '';
    let firebaseIdToken = '';

    console.log('[FirebaseAuth] === VERIFY OTP START ===');

    try {
      if (Capacitor.isNativePlatform()) {
        const verificationId = nativeVerificationIdRef.current || localStorage.getItem('kotha_hobe_native_vid') || '';
        
        if (!verificationId) {
          console.error('[FirebaseAuth] Missing verificationId for confirmation');
          return { success: false, error: 'Verification session expired. Please request a new code.' };
        }

        console.log('[FirebaseAuth] Confirming verification code with native plugin...');
        await FirebaseAuthentication.confirmVerificationCode({
          verificationId,
          verificationCode: code.trim(),
        });

        console.log('[FirebaseAuth] Code confirmed. Fetching fresh Firebase ID Token...');
        const tokenResult = await FirebaseAuthentication.getIdToken({ forceRefresh: true });
        firebaseIdToken = tokenResult.token;
        console.log('[FirebaseAuth] Firebase ID Token obtained successfully');
      } else {
        if (!confirmationResult) {
          return { success: false, error: 'Verification session expired. Please request a new code.' };
        }

        const result = await confirmationResult.confirm(code.trim());
        firebaseIdToken = await result.user.getIdToken();
      }

      if (!firebaseIdToken) {
        return { success: false, error: 'Could not obtain security token from Firebase.' };
      }

      console.log('[FirebaseAuth] Authenticating session with backend server...');
      const res = await loginWithFirebaseToken(activePhone, firebaseIdToken);

      if (res.success && res.token && res.user) {
        console.log('[FirebaseAuth] Backend login successful. Session established.');
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
