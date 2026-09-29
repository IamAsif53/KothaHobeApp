import React, { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { ThemeProvider, useTheme } from './context/ThemeContext';
import { CallProvider } from './context/CallContext';
import { GroupCallProvider } from './context/GroupCallContext';
import { CallScreen } from './components/call/CallScreen';
import { IncomingCallModal } from './components/call/IncomingCallModal';
import { GroupCallScreen } from './components/call/GroupCallScreen';
import { IncomingGroupCallModal } from './components/call/IncomingGroupCallModal';
import { BottomNav } from './components/common/BottomNav';
import { UpdateModal } from './components/common/UpdateModal';
import {
  checkLatestRelease,
  getCurrentAppVersion,
  ReleaseManifest,
} from './services/appUpdateService';
import { App as CapApp } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications, ActionPerformed } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { CURRENT_VERSION } from './config/version';
import { modalStack } from './utils/modalStack';
import { NativeCallNotification } from './services/callNotificationService';
import { InAppNotificationBanner } from './components/notification/InAppNotificationBanner';

import { SplashPage } from './pages/SplashPage';
import { LoginPage } from './pages/LoginPage';
import { OtpPage } from './pages/OtpPage';
import { ProfileSetupPage } from './pages/ProfileSetupPage';
import { ChatListPage } from './pages/ChatListPage';
import { StoriesPage } from './pages/StoriesPage';
import { SearchUserPage } from './pages/SearchUserPage';
import { ChatRoomPage } from './pages/ChatRoomPage';
import { ChatInfoPage } from './pages/ChatInfoPage';
import { GroupInfoPage } from './pages/GroupInfoPage';
import { SharedMediaPage } from './pages/SharedMediaPage';
import { SettingsPage } from './pages/SettingsPage';
import { BlockedUsersPage } from './pages/BlockedUsersPage';
import { JoinGroupPage } from './pages/JoinGroupPage';

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
          if (extra) {
            if (extra.type === 'incoming_call' || extra.callId) {
              window.dispatchEvent(new CustomEvent('kothahobe:incoming_call', { detail: extra }));
            }
            if (extra.conversationId) {
              navigate(`/chat/${extra.conversationId}`, { replace: false });
            }
          }
        }
      );

      pushHandle = await PushNotifications.addListener(
        'pushNotificationActionPerformed',
        (notificationAction: ActionPerformed) => {
          const data = notificationAction.notification.data;
          if (data) {
            if (data.type === 'incoming_call' || data.callId) {
              window.dispatchEvent(new CustomEvent('kothahobe:incoming_call', { detail: data }));
            }
            if (data.conversationId) {
              navigate(`/chat/${data.conversationId}`, { replace: false });
            }
          }
        }
      );

      // Listen to native CallNotification plugin events (from Native Android Heads-Up / Full-Screen Intent)
      if (Capacitor.isNativePlatform()) {
        try {
          NativeCallNotification.addListener('callActionReceived', (data: any) => {
            console.log('[App] CallNotification plugin event received:', data);
            if (data && data.callId) {
              if (data.action === 'accept_call') {
                window.dispatchEvent(new CustomEvent('kothahobe:accept_call', { detail: data }));
              } else {
                window.dispatchEvent(new CustomEvent('kothahobe:incoming_call', { detail: data }));
              }
            }
          });

          const preloadNotificationMessage = (payload: any) => {
            if (!payload || !payload.conversationId) return;
            const convId = payload.conversationId;
            const msgId = payload.messageId || `notif_${Date.now()}`;
            const text = payload.messageText || payload.text;
            if (!text) return;

            try {
              const cacheKey = `kotha_hobe_msgs_${convId}`;
              const cached = localStorage.getItem(cacheKey);
              const msgs: any[] = cached ? JSON.parse(cached) : [];
              if (!msgs.some((m) => m._id === msgId || (m.clientMessageId && m.clientMessageId === payload.clientMessageId))) {
                msgs.push({
                  _id: msgId,
                  conversationId: convId,
                  senderId: payload.senderId || '',
                  senderNickname: payload.senderName,
                  text,
                  type: payload.messageType || 'text',
                  status: 'sent',
                  createdAt: payload.createdAt || new Date().toISOString(),
                });
                msgs.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
                localStorage.setItem(cacheKey, JSON.stringify(msgs));
              }
            } catch {}
          };

          NativeCallNotification.addListener('chatNotificationOpened', (data: any) => {
            console.log('[App] Chat notification opened:', data);
            if (data && data.conversationId) {
              preloadNotificationMessage(data);
              navigate(`/chat/${data.conversationId}`, { replace: false });
            }
          });

          // Check if app was launched via pending call / chat intent
          NativeCallNotification.getPendingCallAction().then((pending: any) => {
            if (pending && pending.hasPending) {
              console.log('[App] Pending action found on launch:', pending);
              if (pending.callId) {
                if (pending.action === 'accept_call') {
                  window.dispatchEvent(new CustomEvent('kothahobe:accept_call', { detail: pending }));
                } else {
                  window.dispatchEvent(new CustomEvent('kothahobe:incoming_call', { detail: pending }));
                }
              } else if (pending.conversationId) {
                preloadNotificationMessage(pending);
                navigate(`/chat/${pending.conversationId}`, { replace: false });
              }
            }
          });
        } catch (err) {
          console.warn('[App] CallNotification plugin init note:', err);
        }
      }
    };

    let appUrlHandle: any = null;
    if (Capacitor.isNativePlatform()) {
      CapApp.addListener('appUrlOpen', (data: { url: string }) => {
        console.log('[App] App opened via Deep Link URL:', data.url);
        try {
          const urlStr = data.url;
          // Match kothahobe://join/:code or https://kotha-hobe-api.onrender.com/join/:code
          const match = urlStr.match(/(?:join\/|join=)([a-zA-Z0-9_-]+)/);
          if (match && match[1]) {
            const inviteCode = match[1];
            navigate(`/join/${inviteCode}`, { replace: false });
          }
        } catch (e) {
          console.error('[App] Error parsing appUrlOpen event:', e);
        }
      }).then((handle) => {
        appUrlHandle = handle;
      });
    }

    setupNotifAction();

    return () => {
      if (localHandle) localHandle.remove();
      if (pushHandle) pushHandle.remove();
      if (appUrlHandle) appUrlHandle.remove();
    };
  }, [navigate]);

  // Android Hardware & Gesture Back Button listener
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let listenerHandle: any = null;

    const setupBackButton = async () => {
      listenerHandle = await CapApp.addListener('backButton', () => {
        // 1. If any modal is currently open, dismiss it first
        if (modalStack.hasOpenModal()) {
          modalStack.popTop();
          return;
        }

        const path = window.location.pathname;

        // Sub-screens navigate back to previous parent screen
        if (path.startsWith('/chat/') && path.endsWith('/shared')) {
          const convId = path.split('/')[2];
          navigate(`/chat/${convId}`, { replace: true });
        } else if (path.startsWith('/chat/') && path.endsWith('/info')) {
          const convId = path.split('/')[2];
          navigate(`/chat/${convId}`, { replace: true });
        } else if (path.startsWith('/group/') && path.endsWith('/info')) {
          const convId = path.split('/')[2];
          navigate(`/chat/${convId}`, { replace: true });
        } else if (path.startsWith('/chat/')) {
          navigate('/chats', { replace: true });
        } else if (path === '/search') {
          navigate('/chats', { replace: true });
        } else if (path === '/stories') {
          navigate('/chats', { replace: true });
        } else if (path === '/settings/blocked' || path === '/blocked') {
          navigate('/settings', { replace: true });
        } else if (path === '/profile-setup') {
          navigate('/settings', { replace: true });
        } else if (path === '/settings') {
          navigate('/chats', { replace: true });
        } else if (path === '/otp') {
          navigate('/login', { replace: true });
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
          navigate('/chats', { replace: true });
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
      <div key={location.pathname} className="flex-1 overflow-hidden flex flex-col animate-page-enter hardware-accelerated">
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
            path="/stories"
            element={
              <ProtectedRoute>
                <StoriesPage />
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
            path="/group/:conversationId/info"
            element={
              <ProtectedRoute>
                <GroupInfoPage />
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
          <Route
            path="/settings/blocked"
            element={
              <ProtectedRoute>
                <BlockedUsersPage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/join/:inviteCode"
            element={
              <ProtectedRoute>
                <JoinGroupPage />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      <BottomNav />

      {/* Global 1-on-1 WebRTC Voice & Video Calling UI Modals */}
      <CallScreen />
      <IncomingCallModal />

      {/* Global Multi-Party WebRTC Group Voice & Video Calling UI Modals */}
      <GroupCallScreen />
      <IncomingGroupCallModal />

      {/* Global In-App Interactive Notification Banner with Quick Reply */}
      <InAppNotificationBanner />

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
              <GroupCallProvider>
                <AppContent />
              </GroupCallProvider>
            </CallProvider>
          </SocketProvider>
        </AuthProvider>
      </ThemeProvider>
    </Router>
  );
};

export default App;
