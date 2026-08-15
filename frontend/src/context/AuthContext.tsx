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
  const [email, setEmail] = useState<string>(() => localStorage.getItem('kotha_hobe_pending_email') || '');

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
          if (error?.message?.includes('401') || error?.message?.includes('unauthorized')) {
            logout();
          }
        }
      }
      setLoading(false);
    };

    initAuth();
  }, []);

  const sendOtp = async (targetEmail: string): Promise<boolean> => {
    const cleanEmail = targetEmail.toLowerCase().trim();
    setEmail(cleanEmail);
    localStorage.setItem('kotha_hobe_pending_email', cleanEmail);
    try {
      const res = await sendEmailOtpApi(cleanEmail);
      if (res.success) {
        return true;
      }
      throw new Error(res.message || 'Failed to send OTP email');
    } catch (error: any) {
      console.error('[AuthContext] sendOtp error:', error);
      throw new Error(error?.message || 'Failed to send verification code. Please check your email address.');
    }
  };

  const verifyOtp = async (code: string): Promise<{ success: boolean; isNewUser?: boolean; error?: string }> => {
    try {
      const targetEmail = email || localStorage.getItem('kotha_hobe_pending_email') || '';
      if (!targetEmail) {
        return { success: false, error: 'Email address not found. Please go back and enter your email.' };
      }

      const res = await verifyEmailOtpApi(targetEmail, code.trim());

      if (res.success && res.token && res.user) {
        localStorage.setItem('kotha_hobe_token', res.token);
        localStorage.setItem('kotha_hobe_user', JSON.stringify(res.user));
        localStorage.removeItem('kotha_hobe_pending_email');
        setToken(res.token);
        setUser(res.user);
        return { success: true, isNewUser: res.isNewUser };
      } else {
        return { success: false, error: res.message || 'Invalid or expired OTP code' };
      }
    } catch (error: any) {
      console.error('[AuthContext] verifyOtp error:', error);
      return { success: false, error: error?.message || 'Invalid verification code. Please check your inbox.' };
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
    localStorage.removeItem('kotha_hobe_pending_email');
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
