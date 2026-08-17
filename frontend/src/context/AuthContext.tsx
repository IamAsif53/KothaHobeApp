import React, { createContext, useContext, useState, useEffect } from 'react';
import { IUser } from '../types';
import { fetchMe, updateProfileApi } from '../api/userApi';
import { sendEmailOtpApi, verifyEmailOtpApi } from '../api/authApi';

interface AuthContextType {
  user: IUser | null;
  token: string | null;
  loading: boolean;
  email: string;
  setEmail: (email: string) => void;
  sendOtp: (email: string) => Promise<boolean>;
  verifyOtp: (code: string) => Promise<{ success: boolean; isNewUser?: boolean; hasProfile?: boolean; error?: string }>;
  updateProfile: (username: string, displayName: string, avatarUrl?: string) => Promise<{ success: boolean; error?: string }>;
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
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('kotha_hobe_token'));
  
  // Instant App Launch: If user is already cached, loading is immediately false (0ms delay)
  const [loading, setLoading] = useState<boolean>(() => {
    const cachedToken = localStorage.getItem('kotha_hobe_token');
    const cachedUser = localStorage.getItem('kotha_hobe_user');
    return !(cachedToken && cachedUser);
  });

  const [email, setEmail] = useState<string>(() => localStorage.getItem('kotha_hobe_pending_email') || '');

  // Background session sync (never blocks initial render or offline navigation)
  useEffect(() => {
    const syncAuth = async () => {
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
          // Only clear session if explicitly rejected with 401 Unauthorized
          if (
            error?.message?.includes('401') ||
            error?.message?.includes('unauthorized') ||
            error?.message?.includes('Not authenticated')
          ) {
            logout();
          }
        }
      }
      setLoading(false);
    };

    syncAuth();
  }, []);

  const sendOtp = async (inputEmail: string): Promise<boolean> => {
    const normalized = inputEmail.toLowerCase().trim();
    setEmail(normalized);
    localStorage.setItem('kotha_hobe_pending_email', normalized);

    try {
      const res = await sendEmailOtpApi(normalized);
      if (res.success) {
        return true;
      }
      throw new Error(res.message || 'Failed to send verification code');
    } catch (err: any) {
      console.error('[AuthContext] sendOtp error:', err);
      throw new Error(err?.message || 'Failed to dispatch verification code');
    }
  };

  const verifyOtp = async (code: string): Promise<{ success: boolean; isNewUser?: boolean; hasProfile?: boolean; error?: string }> => {
    const targetEmail = email || localStorage.getItem('kotha_hobe_pending_email') || '';
    if (!targetEmail) {
      return { success: false, error: 'Email session expired. Please request a new code.' };
    }

    try {
      const res = await verifyEmailOtpApi(targetEmail, code.trim());
      if (res.success && res.token && res.user) {
        localStorage.setItem('kotha_hobe_token', res.token);
        localStorage.setItem('kotha_hobe_user', JSON.stringify(res.user));
        localStorage.removeItem('kotha_hobe_pending_email');
        setToken(res.token);
        setUser(res.user);
        return {
          success: true,
          isNewUser: res.isNewUser,
          hasProfile: res.hasProfile ?? Boolean(res.user.username && res.user.displayName),
        };
      }
      return { success: false, error: res.message || 'Invalid verification code' };
    } catch (err: any) {
      console.error('[AuthContext] verifyOtp error:', err);
      return { success: false, error: err?.message || 'Verification failed. Please try again.' };
    }
  };

  const updateProfile = async (
    username: string,
    displayName: string,
    avatarUrl?: string
  ): Promise<{ success: boolean; error?: string }> => {
    try {
      const res = await updateProfileApi(username, displayName, avatarUrl);
      if (res.success && res.user) {
        setUser(res.user);
        localStorage.setItem('kotha_hobe_user', JSON.stringify(res.user));
        return { success: true };
      }
      return { success: false, error: res.message || 'Failed to update profile' };
    } catch (error: any) {
      return { success: false, error: error?.message || 'Failed to update profile' };
    }
  };

  const logout = async () => {
    localStorage.removeItem('kotha_hobe_token');
    localStorage.removeItem('kotha_hobe_user');
    localStorage.removeItem('kotha_hobe_pending_email');
    localStorage.removeItem('kotha_hobe_cached_conversations');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        email,
        setEmail,
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
