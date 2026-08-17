import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { CallProvider } from './context/CallContext';
import { CallScreen } from './components/call/CallScreen';
import { IncomingCallModal } from './components/call/IncomingCallModal';
import { BottomNav } from './components/common/BottomNav';
import { UpdateModal } from './components/common/UpdateModal';
import {
  checkLatestRelease,
  getCurrentAppVersion,
  ReleaseManifest,
} from './services/appUpdateService';
import { CURRENT_VERSION } from './config/version';
import { App as CapApp } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications, ActionPerformed } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

import { SplashPage } from './pages/SplashPage';
import { LoginPage } from './pages/LoginPage';
import { OtpPage } from './pages/OtpPage';
import { ProfileSetupPage } from './pages/ProfileSetupPage';
import { ChatListPage } from './pages/ChatListPage';
import { SearchUserPage } from './pages/SearchUserPage';
import { ChatRoomPage } from './pages/ChatRoomPage';
import { ChatInfoPage } from './pages/ChatInfoPage';
import { SharedMediaPage } from './pages/SharedMediaPage';
import { SettingsPage } from './pages/SettingsPage';

// Protected Route wrapper requiring user authentication
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="h-full w-full bg-chat-bg flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export const AppContent: React.FC = () => {
  const [updateManifest, setUpdateManifest] = useState<ReleaseManifest | null>(null);
  const [currentVersion, setCurrentVersion] = useState<{ versionName: string; versionCode: number }>(CURRENT_VERSION);
  const { themeConfig } = useTheme();

  const navigate = useNavigate();
  const location = useLocation();
  const lastBackPressRef = useRef<number>(0);

  // Native Device Push & Local Notification Click Navigation
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let localHandle: any = null;
    let pushHandle: any = null;

    const setupNotifAction = async () => {
      localHandle = await LocalNotifications.addListener(
        'localNotificationActionPerformed',
        (notificationAction) => {
          const extra = notificationAction.notification.extra;
          if (extra && extra.conversationId) {
            navigate(`/chat/${extra.conversationId}`, { replace: false });
          }
        }
      );

      pushHandle = await PushNotifications.addListener(
        'pushNotificationActionPerformed',
        (notificationAction: ActionPerformed) => {
          const data = notificationAction.notification.data;
          if (data && data.conversationId) {
            navigate(`/chat/${data.conversationId}`, { replace: false });
          }
        }
      );
    };

    setupNotifAction();

    return () => {
      if (localHandle) localHandle.remove();
      if (pushHandle) pushHandle.remove();
    };
  }, [navigate]);

  // Android Hardware & Gesture Back Button listener
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listenerHandle: any = null;

    const setupBackButton = async () => {
      listenerHandle = await CapApp.addListener('backButton', () => {
        const path = window.location.pathname;

        // Sub-screens navigate back to previous screen
        if (
          path.startsWith('/chat/') ||
          path === '/search' ||
          path === '/settings' ||
          path === '/profile-setup' ||
          path === '/otp'
        ) {
          if (path.startsWith('/chat/') && path.endsWith('/shared')) {
            const convId = path.split('/')[2];
            navigate(`/chat/${convId}`, { replace: true });
          } else if (path.startsWith('/chat/') && path.endsWith('/info')) {
            const convId = path.split('/')[2];
            navigate(`/chat/${convId}`, { replace: true });
          } else if (path.startsWith('/chat/')) {
            navigate('/chats', { replace: true });
          } else if (path === '/otp') {
            navigate('/login', { replace: true });
          } else {
            navigate(-1);
          }
        } else if (path === '/chats' || path === '/login' || path === '/') {
          // On main root screen, double-tap or exit app
          const now = Date.now();
          if (now - lastBackPressRef.current < 2000) {
            CapApp.exitApp();
          } else {
            lastBackPressRef.current = now;
            CapApp.exitApp();
          }
        } else {
          CapApp.exitApp();
        }
      });
    };

    setupBackButton();

    return () => {
      if (listenerHandle) {
        listenerHandle.remove();
      }
    };
  }, [navigate]);

  useEffect(() => {
    const checkForUpdates = async () => {
      const version = await getCurrentAppVersion();
      setCurrentVersion(version);

      const latest = await checkLatestRelease();
      if (latest && latest.versionCode > version.versionCode) {
        setUpdateManifest(latest);
      }
    };

    checkForUpdates();

    const handleManualUpdateTrigger = async (e: Event) => {
      const customEvent = e as CustomEvent<ReleaseManifest | undefined>;
      if (customEvent.detail) {
        setUpdateManifest(customEvent.detail);
        return;
      }
      const version = await getCurrentAppVersion();
      setCurrentVersion(version);
      const latest = await checkLatestRelease();
      if (latest) {
        setUpdateManifest(latest);
      }
    };

    window.addEventListener('TRIGGER_CHECK_UPDATE', handleManualUpdateTrigger);
    return () => {
      window.removeEventListener('TRIGGER_CHECK_UPDATE', handleManualUpdateTrigger);
    };
  }, []);

  return (
    <div
      style={{ backgroundColor: themeConfig.bg }}
      className="h-dvh w-full flex flex-col max-w-md mx-auto relative shadow-2xl overflow-hidden border-x border-white/5 transition-colors duration-200"
    >
      <div className="flex-1 overflow-hidden flex flex-col">
        <Routes>
          <Route path="/" element={<SplashPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/otp" element={<OtpPage />} />
          <Route
            path="/profile-setup"
            element={
              <ProtectedRoute>
                <ProfileSetupPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chats"
            element={
              <ProtectedRoute>
                <ChatListPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/search"
            element={
              <ProtectedRoute>
                <SearchUserPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat/:conversationId"
            element={
              <ProtectedRoute>
                <ChatRoomPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat/:conversationId/info"
            element={
              <ProtectedRoute>
                <ChatInfoPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/chat/:conversationId/shared"
            element={
              <ProtectedRoute>
                <SharedMediaPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <SettingsPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      <BottomNav />

      {/* Global WebRTC Voice Calling UI Modals */}
      <CallScreen />
      <IncomingCallModal />

      {/* In-App Update Modal */}
      {updateManifest && (
        <UpdateModal
          manifest={updateManifest}
          currentVersionName={currentVersion.versionName}
          onClose={() => setUpdateManifest(null)}
        />
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <Router>
      <ThemeProvider>
        <AuthProvider>
          <SocketProvider>
            <CallProvider>
              <AppContent />
            </CallProvider>
          </SocketProvider>
        </AuthProvider>
      </ThemeProvider>
    </Router>
  );
};

export default App;
