import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { SocketProvider } from './context/SocketContext';
import { BottomNav } from './components/common/BottomNav';
import { UpdateModal } from './components/common/UpdateModal';
import {
  checkLatestRelease,
  getCurrentAppVersion,
  ReleaseManifest,
} from './services/appUpdateService';

import { SplashPage } from './pages/SplashPage';
import { LoginPage } from './pages/LoginPage';
import { OtpPage } from './pages/OtpPage';
import { ProfileSetupPage } from './pages/ProfileSetupPage';
import { ChatListPage } from './pages/ChatListPage';
import { SearchUserPage } from './pages/SearchUserPage';
import { ChatRoomPage } from './pages/ChatRoomPage';
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
  const [currentVersion, setCurrentVersion] = useState<{ versionName: string; versionCode: number }>({
    versionName: '1.0.0',
    versionCode: 1,
  });

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
  }, []);

  return (
    <div className="h-dvh w-full flex flex-col bg-chat-bg max-w-md mx-auto relative shadow-2xl overflow-hidden border-x border-white/5">
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
      <AuthProvider>
        <SocketProvider>
          <AppContent />
        </SocketProvider>
      </AuthProvider>
    </Router>
  );
};

export default App;
