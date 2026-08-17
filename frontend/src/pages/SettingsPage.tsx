import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Avatar } from '../components/common/Avatar';
import {
  LogOut,
  User,
  Bell,
  Lock,
  Info,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import {
  checkLatestRelease,
  getCurrentAppVersion,
  ReleaseManifest,
} from '../services/appUpdateService';
import { CURRENT_VERSION } from '../config/version';

export const SettingsPage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [appVersion, setAppVersion] = useState<{ versionName: string; versionCode: number }>(CURRENT_VERSION);
  const [availableUpdate, setAvailableUpdate] = useState<ReleaseManifest | null>(null);
  const [upToDateNotice, setUpToDateNotice] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const loadVersionAndCheck = async () => {
      const ver = await getCurrentAppVersion();
      if (isMounted) setAppVersion(ver);

      const latest = await checkLatestRelease();
      if (isMounted && latest) {
        if (latest.versionCode > ver.versionCode) {
          setAvailableUpdate(latest);
        } else {
          setAvailableUpdate(null);
        }
      }
    };

    loadVersionAndCheck();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpToDateNotice(false);
    try {
      const ver = await getCurrentAppVersion();
      setAppVersion(ver);
      const latest = await checkLatestRelease();

      if (latest && latest.versionCode > ver.versionCode) {
        setAvailableUpdate(latest);
        window.dispatchEvent(new CustomEvent('TRIGGER_CHECK_UPDATE', { detail: latest }));
      } else {
        setAvailableUpdate(null);
        setUpToDateNotice(true);
        setTimeout(() => setUpToDateNotice(false), 4000);
      }
    } catch (err) {
      alert('Error checking update');
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <div className="h-full w-full bg-chat-bg flex flex-col max-w-md mx-auto overflow-hidden">
      {/* Header with Safe Area Status Bar Padding */}
      <header className="px-4 pt-10 pb-3 bg-chat-panel border-b border-white/10 flex items-center justify-between flex-shrink-0">
        <h1 className="text-xl font-bold text-white tracking-tight">Settings</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* User Card */}
        <div
          onClick={() => navigate('/profile-setup')}
          className="bg-chat-card border border-white/10 rounded-2xl p-4 flex items-center gap-4 hover:bg-white/5 cursor-pointer transition-colors"
        >
          <Avatar
            src={user?.avatarUrl}
            name={user?.displayName || user?.username || 'User'}
            isOnline={user?.isOnline}
            size="lg"
          />

          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-white truncate">{user?.displayName}</h2>
            {user?.username && (
              <p className="text-xs font-mono text-brand-400 truncate">
                @{user.username}
              </p>
            )}
            <p className="text-xs font-mono text-chat-textMuted truncate">
              {user?.email || ''}
            </p>
          </div>

          <ChevronRight className="w-5 h-5 text-chat-textMuted flex-shrink-0" />
        </div>

        {/* Settings Sections */}
        <div className="bg-chat-card border border-white/10 rounded-2xl divide-y divide-white/5 overflow-hidden">
          <div
            onClick={() => navigate('/profile-setup')}
            className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-white/5 cursor-pointer transition-colors"
          >
            <User className="w-5 h-5 text-brand-400" />
            <div className="flex-1 text-sm font-semibold text-white">Edit Profile</div>
            <ChevronRight className="w-4 h-4 text-chat-textMuted" />
          </div>

          <div className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-white/5 cursor-pointer transition-colors">
            <Bell className="w-5 h-5 text-sky-400" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-white">Notifications</div>
              <div className="text-xs text-chat-textMuted">In-app sound & alerts</div>
            </div>
            <ChevronRight className="w-4 h-4 text-chat-textMuted" />
          </div>

          <div className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-white/5 cursor-pointer transition-colors">
            <Lock className="w-5 h-5 text-emerald-400" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-white">Privacy</div>
              <div className="text-xs text-chat-textMuted">Online status & presence</div>
            </div>
            <ChevronRight className="w-4 h-4 text-chat-textMuted" />
          </div>

          {/* Dynamic App Version & Update Status */}
          {availableUpdate ? (
            <div
              onClick={handleCheckUpdate}
              className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-white/10 active:scale-[0.99] cursor-pointer transition-all bg-brand-500/10 border-l-4 border-brand-400"
            >
              <Sparkles className="w-5 h-5 text-brand-400 animate-pulse" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Update Available: v{availableUpdate.versionName}</span>
                  <span className="text-[10px] bg-brand-500 text-white px-2 py-0.5 rounded-full uppercase font-bold">
                    New
                  </span>
                </div>
                <div className="text-xs text-brand-300 font-medium">
                  Tap to install build {availableUpdate.versionCode}
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCheckUpdate();
                }}
                className="text-xs font-semibold bg-brand-500 text-white px-3 py-1.5 rounded-lg shadow-sm hover:bg-brand-600 active:scale-95 transition-all"
              >
                Update
              </button>
            </div>
          ) : (
            <div
              onClick={handleCheckUpdate}
              className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-white/5 cursor-pointer transition-colors"
            >
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white flex items-center gap-2">
                  <span>App Up to Date</span>
                  <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold font-mono">
                    v{appVersion.versionName}
                  </span>
                </div>
                <div className="text-xs text-chat-textMuted truncate">
                  {upToDateNotice
                    ? '✓ You are using the latest release'
                    : checkingUpdate
                    ? 'Checking server for updates...'
                    : `Build ${appVersion.versionCode} • Tap to check for updates`}
                </div>
              </div>
              <button
                disabled={checkingUpdate}
                onClick={(e) => {
                  e.stopPropagation();
                  handleCheckUpdate();
                }}
                className="p-2 text-chat-textMuted hover:text-white rounded-lg hover:bg-white/5 active:scale-95 transition-all"
                title="Check for updates"
              >
                <RefreshCw className={`w-4 h-4 ${checkingUpdate ? 'animate-spin text-brand-400' : ''}`} />
              </button>
            </div>
          )}

          {/* About Kotha Hobe */}
          <div className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-white/5 cursor-pointer transition-colors">
            <Info className="w-5 h-5 text-indigo-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white">About Kotha Hobe</div>
              <div className="text-xs text-chat-textMuted font-mono">
                v{appVersion.versionName} (Build {appVersion.versionCode}) • Real-Time Messaging
              </div>
            </div>
          </div>
        </div>

        {/* Logout Action */}
        <button
          onClick={handleLogout}
          className="w-full bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 font-semibold py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-sm"
        >
          <LogOut className="w-5 h-5" />
          <span>Log Out</span>
        </button>

        <div className="flex items-center justify-center gap-1.5 text-xs text-chat-textMuted pt-2">
          <ShieldCheck className="w-4 h-4 text-brand-400" />
          <span>Kotha Hobe Messaging Engine</span>
        </div>
      </div>
    </div>
  );
};
