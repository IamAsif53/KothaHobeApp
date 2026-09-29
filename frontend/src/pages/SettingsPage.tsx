import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme, AppTheme, AppFontSize, AppFontWeight } from '../context/ThemeContext';
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
  Palette,
  HardDrive,
  Check,
  X,
  Volume2,
  Vibrate,
  Eye,
  Trash2,
  Send,
  ShieldAlert,
} from 'lucide-react';
import { registerPushTokenApi } from '../api/userApi';
import {
  checkLatestRelease,
  getCurrentAppVersion,
  ReleaseManifest,
} from '../services/appUpdateService';
import { CURRENT_VERSION } from '../config/version';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Capacitor } from '@capacitor/core';
import { modalStack } from '../utils/modalStack';

export const SettingsPage: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, fontSize, fontWeight, setTheme, setFontSize, setFontWeight, themeConfig } = useTheme();
  const navigate = useNavigate();

  // App version & Update states
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [appVersion, setAppVersion] = useState<{ versionName: string; versionCode: number }>(CURRENT_VERSION);
  const [availableUpdate, setAvailableUpdate] = useState<ReleaseManifest | null>(null);
  const [upToDateNotice, setUpToDateNotice] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Active Modals: 'notifications' | 'privacy' | 'chatTheme' | 'storage' | 'about' | 'logoutConfirm' | null
  const [activeModal, setActiveModal] = useState<string | null>(null);

  // Register active modal with modalStack for Android hardware & gesture back button support
  useEffect(() => {
    if (activeModal) {
      const unregister = modalStack.register(`settings_${activeModal}`, () => {
        setActiveModal(null);
      });
      return () => {
        unregister();
      };
    }
  }, [activeModal]);

  // Notification Preferences
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('kotha_hobe_sound_enabled') !== 'false');
  const [vibrateEnabled, setVibrateEnabled] = useState(() => localStorage.getItem('kotha_hobe_vibrate_enabled') !== 'false');
  const [previewEnabled, setPreviewEnabled] = useState(() => localStorage.getItem('kotha_hobe_preview_enabled') !== 'false');

  // Privacy Preferences
  const [readReceipts, setReadReceipts] = useState(() => localStorage.getItem('kotha_hobe_read_receipts') !== 'false');
  const [onlinePresence, setOnlinePresence] = useState(() => localStorage.getItem('kotha_hobe_online_presence') !== 'false');

  // Storage Stats
  const [cacheSizeKb, setCacheSizeKb] = useState<number>(0);

  const calculateCacheSize = () => {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('kotha_hobe_msgs_') || key === 'kotha_hobe_cached_conversations' || key === 'kotha_hobe_outbox')) {
        const val = localStorage.getItem(key) || '';
        total += (key.length + val.length) * 2;
      }
    }
    setCacheSizeKb(Math.max(1, Math.round(total / 1024)));
  };

  useEffect(() => {
    calculateCacheSize();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleToggleSound = async () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem('kotha_hobe_sound_enabled', String(next));
    showToast(next ? 'Sound alerts enabled' : 'Sound alerts muted');

    if (next && Capacitor.isNativePlatform()) {
      const perm = await LocalNotifications.checkPermissions();
      if (perm.display !== 'granted') {
        await LocalNotifications.requestPermissions();
      }
    }
  };

  const handleToggleVibrate = () => {
    const next = !vibrateEnabled;
    setVibrateEnabled(next);
    localStorage.setItem('kotha_hobe_vibrate_enabled', String(next));
    showToast(next ? 'Vibration enabled' : 'Vibration disabled');
  };

  const handleTogglePreview = () => {
    const next = !previewEnabled;
    setPreviewEnabled(next);
    localStorage.setItem('kotha_hobe_preview_enabled', String(next));
    showToast(next ? 'Message preview shown' : 'Message preview hidden');
  };

  const handleToggleReadReceipts = () => {
    const next = !readReceipts;
    setReadReceipts(next);
    localStorage.setItem('kotha_hobe_read_receipts', String(next));
    showToast(next ? 'Read receipts turned ON' : 'Read receipts turned OFF');
  };

  const handleToggleOnlinePresence = () => {
    const next = !onlinePresence;
    setOnlinePresence(next);
    localStorage.setItem('kotha_hobe_online_presence', String(next));
    showToast(next ? 'Online status visible to contacts' : 'Online status hidden');
  };

  const handleSelectTheme = (selectedTheme: AppTheme) => {
    setTheme(selectedTheme);
    showToast(`Theme changed to ${selectedTheme.toUpperCase()}`);
  };

  const handleSelectFontSize = (size: AppFontSize) => {
    setFontSize(size);
    showToast(`Font size set to ${size.toUpperCase()}`);
  };

  const handleSelectFontWeight = (weight: AppFontWeight) => {
    setFontWeight(weight);
    showToast(`Chat font weight set to ${weight.toUpperCase()}`);
  };

  const handleClearCache = () => {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('kotha_hobe_msgs_') || key === 'kotha_hobe_cached_conversations')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k));
    calculateCacheSize();
    showToast('Cached message storage freed!');
  };

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
      showToast('Error connecting to update server');
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <div
      style={{ backgroundColor: themeConfig.bg }}
      className="h-full w-full flex flex-col max-w-md mx-auto overflow-hidden relative transition-colors duration-200"
    >
      {/* Header with Safe Area Status Bar Padding */}
      <header
        style={{ backgroundColor: themeConfig.panel }}
        className="px-4 pt-10 pb-3 border-b border-chat-border flex items-center justify-between flex-shrink-0 transition-colors duration-200"
      >
        <h1 className="text-xl font-bold text-chat-textPrimary tracking-tight">Settings</h1>
      </header>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-brand-500 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-xl animate-fade-in flex items-center gap-2 border border-white/20">
          <Check className="w-3.5 h-3.5" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* User Card */}
        <div
          onClick={() => navigate('/profile-setup')}
          style={{ backgroundColor: themeConfig.card }}
          className="border border-chat-border rounded-2xl p-4 flex items-center gap-4 pressable-card cursor-pointer shadow-sm hover:bg-chat-surfaceSecondary/40 transition-all"
        >
          <Avatar
            src={user?.avatarUrl}
            name={user?.displayName || user?.username || 'User'}
            isOnline={user?.isOnline}
            size="lg"
          />

          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-chat-textPrimary truncate">{user?.displayName}</h2>
            {user?.username && (
              <p className="text-xs font-mono text-brand-500 font-semibold truncate">
                @{user.username}
              </p>
            )}
            <p className="text-xs font-mono text-chat-textMuted truncate">
              {user?.email || ''}
            </p>
          </div>

          <ChevronRight className="w-5 h-5 text-chat-textMuted flex-shrink-0" />
        </div>

        {/* Core Settings Menu */}
        <div
          style={{ backgroundColor: themeConfig.card }}
          className="border border-chat-border rounded-2xl divide-y divide-chat-divider overflow-hidden shadow-sm transition-colors duration-200"
        >
          {/* Edit Profile */}
          <div
            onClick={() => navigate('/profile-setup')}
            className="flex items-center gap-3.5 px-4 py-3.5 pressable-card cursor-pointer hover:bg-chat-surfaceSecondary/50 transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-chat-textPrimary">Edit Profile</div>
              <div className="text-xs text-chat-textSecondary">Photo, @username & display name</div>
            </div>
            <ChevronRight className="w-4 h-4 text-chat-textMuted" />
          </div>

          {/* Notifications */}
          <div
            onClick={() => setActiveModal('notifications')}
            className="flex items-center gap-3.5 px-4 py-3.5 pressable-card cursor-pointer hover:bg-chat-surfaceSecondary/50 transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-sky-500/15 flex items-center justify-center text-sky-600 dark:text-sky-400 flex-shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-chat-textPrimary">Notifications & Device Alerts</div>
              <div className="text-xs text-chat-textSecondary">
                {soundEnabled ? 'Device alerts ON' : 'Muted'} • {vibrateEnabled ? 'Vibrate ON' : 'Vibrate OFF'}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-chat-textMuted" />
          </div>

          {/* Privacy & Security */}
          <div
            onClick={() => setActiveModal('privacy')}
            className="flex items-center gap-3.5 px-4 py-3.5 pressable-card cursor-pointer hover:bg-chat-surfaceSecondary/50 transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-chat-textPrimary">Privacy & Security</div>
              <div className="text-xs text-chat-textSecondary">Read receipts, online presence & encryption</div>
            </div>
            <ChevronRight className="w-4 h-4 text-chat-textMuted" />
          </div>

          {/* Blocked Accounts */}
          <div
            onClick={() => navigate('/settings/blocked')}
            className="flex items-center gap-3.5 px-4 py-3.5 pressable-card cursor-pointer hover:bg-chat-surfaceSecondary/50 transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-rose-500/15 flex items-center justify-center text-rose-600 dark:text-rose-400 flex-shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-chat-textPrimary">Blocked Accounts</div>
              <div className="text-xs text-chat-textSecondary">Manage and unblock restricted contacts</div>
            </div>
            <ChevronRight className="w-4 h-4 text-chat-textMuted" />
          </div>

          {/* Chat Wallpaper & Theme */}
          <div
            onClick={() => setActiveModal('chatTheme')}
            className="flex items-center gap-3.5 px-4 py-3.5 pressable-card cursor-pointer hover:bg-chat-surfaceSecondary/50 transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-purple-500/15 flex items-center justify-center text-purple-600 dark:text-purple-400 flex-shrink-0">
              <Palette className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-chat-textPrimary">Themes & Font Appearance</div>
              <div className="text-xs text-chat-textSecondary capitalize">
                Active Theme: <span className="text-brand-500 font-semibold">{theme}</span> • Font: {fontSize}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-chat-textMuted" />
          </div>

          {/* Storage & Data */}
          <div
            onClick={() => {
              calculateCacheSize();
              setActiveModal('storage');
            }}
            className="flex items-center gap-3.5 px-4 py-3.5 pressable-card cursor-pointer hover:bg-chat-surfaceSecondary/50 transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center text-amber-600 dark:text-amber-400 flex-shrink-0">
              <HardDrive className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-chat-textPrimary">Storage & Cache Data</div>
              <div className="text-xs text-chat-textSecondary">{cacheSizeKb} KB cached locally</div>
            </div>
            <ChevronRight className="w-4 h-4 text-chat-textMuted" />
          </div>

          {/* Dynamic App Version & Update Status */}
          {availableUpdate ? (
            <div
              onClick={handleCheckUpdate}
              className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-chat-surfaceSecondary/60 active:scale-[0.99] cursor-pointer transition-all bg-brand-soft border-l-4 border-brand-500"
            >
              <div className="w-9 h-9 rounded-xl bg-brand-500/20 flex items-center justify-center text-brand-500 flex-shrink-0">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-chat-textPrimary flex items-center gap-2">
                  <span>Update Available: v{availableUpdate.versionName}</span>
                  <span className="text-[10px] bg-brand-500 text-white px-2 py-0.5 rounded-full uppercase font-bold">
                    New
                  </span>
                </div>
                <div className="text-xs text-brand-600 dark:text-brand-300 font-medium">
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
              className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-chat-surfaceSecondary/50 cursor-pointer transition-colors"
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400 flex-shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-chat-textPrimary flex items-center gap-2">
                  <span>App Up to Date</span>
                  <span className="text-[10px] bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 px-2 py-0.5 rounded-full font-bold font-mono">
                    v{appVersion.versionName}
                  </span>
                </div>
                <div className="text-xs text-chat-textSecondary truncate">
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
                className="p-2 text-chat-textMuted hover:text-chat-textPrimary rounded-lg hover:bg-chat-surfaceSecondary active:scale-95 transition-all"
                title="Check for updates"
              >
                <RefreshCw className={`w-4 h-4 ${checkingUpdate ? 'animate-spin text-brand-500' : ''}`} />
              </button>
            </div>
          )}

          {/* About Kotha Hobe */}
          <div
            onClick={() => setActiveModal('about')}
            className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-chat-surfaceSecondary/50 cursor-pointer transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center text-indigo-600 dark:text-indigo-400 flex-shrink-0">
              <Info className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-chat-textPrimary">About Kotha Hobe</div>
              <div className="text-xs text-chat-textSecondary font-mono">
                v{appVersion.versionName} (Build {appVersion.versionCode}) • Real-Time Engine
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-chat-textMuted" />
          </div>
        </div>

        {/* Logout Action Button */}
        <button
          onClick={() => setActiveModal('logoutConfirm')}
          className="w-full bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-500 font-semibold py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-sm active:scale-[0.99]"
        >
          <LogOut className="w-5 h-5" />
          <span>Log Out</span>
        </button>

        <div className="flex items-center justify-center gap-1.5 text-xs text-chat-textMuted pt-1 pb-4">
          <ShieldCheck className="w-4 h-4 text-brand-500" />
          <span>Kotha Hobe Encrypted Messaging</span>
        </div>
      </div>

      {/* ================= MODALS ================= */}

      {/* 1. Notifications Modal */}
      {activeModal === 'notifications' && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div
            style={{ backgroundColor: themeConfig.panel }}
            className="border border-chat-border w-full max-w-sm rounded-3xl p-5 shadow-2xl animate-scale-up space-y-4"
          >
            <div className="flex items-center justify-between border-b border-chat-divider pb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-sky-500" />
                <h3 className="text-base font-bold text-chat-textPrimary">Notifications & Alerts</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-full text-chat-textMuted hover:text-chat-textPrimary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-2xl bg-chat-surfaceSecondary border border-chat-border">
                <div className="flex items-center gap-3">
                  <Volume2 className="w-4 h-4 text-chat-textMuted" />
                  <div>
                    <div className="text-sm font-medium text-chat-textPrimary">Device Sound Alerts</div>
                    <div className="text-[11px] text-chat-textSecondary">Play tone on incoming message</div>
                  </div>
                </div>
                <button
                  onClick={handleToggleSound}
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    soundEnabled ? 'bg-brand-500' : 'bg-chat-surfaceTertiary'
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      soundEnabled ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-chat-surfaceSecondary border border-chat-border">
                <div className="flex items-center gap-3">
                  <Vibrate className="w-4 h-4 text-chat-textMuted" />
                  <div>
                    <div className="text-sm font-medium text-chat-textPrimary">Device Vibration</div>
                    <div className="text-[11px] text-chat-textSecondary">Vibrate on message received</div>
                  </div>
                </div>
                <button
                  onClick={handleToggleVibrate}
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    vibrateEnabled ? 'bg-brand-500' : 'bg-chat-surfaceTertiary'
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      vibrateEnabled ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-chat-surfaceSecondary border border-chat-border">
                <div className="flex items-center gap-3">
                  <Eye className="w-4 h-4 text-chat-textMuted" />
                  <div>
                    <div className="text-sm font-medium text-chat-textPrimary">Message Preview</div>
                    <div className="text-[11px] text-chat-textSecondary">Show sender and message text in banner</div>
                  </div>
                </div>
                <button
                  onClick={handleTogglePreview}
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    previewEnabled ? 'bg-brand-500' : 'bg-chat-surfaceTertiary'
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      previewEnabled ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>
            </div>

            <button
              onClick={() => setActiveModal(null)}
              className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-2.5 rounded-xl transition-all"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* 2. Privacy & Security Modal */}
      {activeModal === 'privacy' && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div
            style={{ backgroundColor: themeConfig.panel }}
            className="border border-chat-border w-full max-w-sm rounded-3xl p-5 shadow-2xl animate-scale-up space-y-4"
          >
            <div className="flex items-center justify-between border-b border-chat-divider pb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-emerald-500" />
                <h3 className="text-base font-bold text-chat-textPrimary">Privacy & Security</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-full text-chat-textMuted hover:text-chat-textPrimary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-2xl bg-chat-surfaceSecondary border border-chat-border">
                <div>
                  <div className="text-sm font-medium text-chat-textPrimary">Read Receipts</div>
                  <div className="text-[11px] text-chat-textSecondary">Show blue double checkmarks</div>
                </div>
                <button
                  onClick={handleToggleReadReceipts}
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    readReceipts ? 'bg-brand-500' : 'bg-chat-surfaceTertiary'
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      readReceipts ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 rounded-2xl bg-chat-surfaceSecondary border border-chat-border">
                <div>
                  <div className="text-sm font-medium text-chat-textPrimary">Online Presence</div>
                  <div className="text-[11px] text-chat-textSecondary">Show online dot & last seen</div>
                </div>
                <button
                  onClick={handleToggleOnlinePresence}
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    onlinePresence ? 'bg-brand-500' : 'bg-chat-surfaceTertiary'
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      onlinePresence ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              <div className="p-3 bg-brand-soft border border-brand-500/20 rounded-2xl">
                <div className="flex items-center gap-2 text-brand-500 font-semibold text-xs mb-1">
                  <ShieldCheck className="w-4 h-4" />
                  <span>256-Bit Socket Encryption Active</span>
                </div>
                <p className="text-[11px] text-chat-textSecondary leading-relaxed">
                  Your chat stream is protected with direct WebSocket transport layer security.
                </p>
              </div>
            </div>

            <button
              onClick={() => setActiveModal(null)}
              className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-2.5 rounded-xl transition-all"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* 3. Chat Theme & Wallpaper Modal */}
      {activeModal === 'chatTheme' && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div
            style={{ backgroundColor: themeConfig.panel }}
            className="border border-chat-border w-full max-w-sm rounded-3xl p-5 shadow-2xl animate-scale-up space-y-4"
          >
            <div className="flex items-center justify-between border-b border-chat-divider pb-3">
              <div className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-purple-500" />
                <h3 className="text-base font-bold text-chat-textPrimary">Themes & Typography</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-full text-chat-textMuted hover:text-chat-textPrimary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-chat-textMuted mb-2">
                Live App Theme (Transforms App Instantly)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { id: 'light' as AppTheme, name: 'Light (Soft Neutral)', color: '#F6F8F7', accent: '#14b174' },
                  { id: 'dark' as AppTheme, name: 'Default Dark', color: '#0b141a', accent: '#00a884' },
                  { id: 'midnight' as AppTheme, name: 'Midnight Slate', color: '#0f172a', accent: '#38bdf8' },
                  { id: 'emerald' as AppTheme, name: 'Deep Emerald', color: '#06281e', accent: '#10b981' },
                  { id: 'navy' as AppTheme, name: 'Royal Navy', color: '#0a192f', accent: '#60a5fa' },
                  { id: 'charcoal' as AppTheme, name: 'Pure Charcoal', color: '#18181b', accent: '#818cf8' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleSelectTheme(t.id)}
                    className={`flex items-center gap-2.5 p-2.5 rounded-2xl border transition-all text-left ${
                      theme === t.id
                        ? 'border-brand-500 bg-brand-soft scale-[1.02] shadow-sm'
                        : 'border-chat-border bg-chat-surfaceSecondary hover:bg-chat-surfaceTertiary'
                    }`}
                  >
                    <span
                      className="w-5 h-5 rounded-full border border-chat-border flex-shrink-0 flex items-center justify-center text-[10px] text-white shadow-inner"
                      style={{ backgroundColor: t.color }}
                    >
                      {theme === t.id && (
                        <Check className="w-3 h-3 text-brand-500 stroke-[3]" />
                      )}
                    </span>
                    <span className="text-xs font-semibold text-chat-textPrimary truncate">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-chat-textMuted mb-2">
                Text & Message Font Size
              </label>
              <div className="flex gap-2">
                {[
                  { id: 'compact' as AppFontSize, label: 'Compact' },
                  { id: 'normal' as AppFontSize, label: 'Standard' },
                  { id: 'large' as AppFontSize, label: 'Large' },
                ].map((s) => (
                  <button
                    key={s.id}
                    onClick={() => handleSelectFontSize(s.id)}
                    className={`flex-1 py-2.5 rounded-xl text-xs font-semibold capitalize border transition-all ${
                      fontSize === s.id
                        ? 'bg-brand-500 border-brand-500 text-white shadow-sm'
                        : 'bg-chat-surfaceSecondary border-chat-border text-chat-textSecondary hover:text-chat-textPrimary'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-chat-textMuted mb-2">
                Chat Message Font Weight
              </label>
              <div className="flex gap-2">
                {[
                  { id: 'regular' as AppFontWeight, label: 'Regular', weightClass: 'font-normal' },
                  { id: 'medium' as AppFontWeight, label: 'Medium', weightClass: 'font-medium' },
                  { id: 'semibold' as AppFontWeight, label: 'Semi Bold', weightClass: 'font-semibold' },
                  { id: 'bold' as AppFontWeight, label: 'Bold', weightClass: 'font-bold' },
                ].map((w) => (
                  <button
                    key={w.id}
                    onClick={() => handleSelectFontWeight(w.id)}
                    className={`flex-1 py-2.5 rounded-xl text-xs ${w.weightClass} border transition-all ${
                      fontWeight === w.id
                        ? 'bg-brand-500 border-brand-500 text-white shadow-sm'
                        : 'bg-chat-surfaceSecondary border-chat-border text-chat-textSecondary hover:text-chat-textPrimary'
                    }`}
                  >
                    {w.label}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setActiveModal(null)}
              className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-2.5 rounded-xl transition-all shadow-md"
            >
              Apply Changes
            </button>
          </div>
        </div>
      )}

      {/* 4. Storage & Data Modal */}
      {activeModal === 'storage' && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div
            style={{ backgroundColor: themeConfig.panel }}
            className="border border-chat-border w-full max-w-sm rounded-3xl p-5 shadow-2xl animate-scale-up space-y-4"
          >
            <div className="flex items-center justify-between border-b border-chat-divider pb-3">
              <div className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-amber-500" />
                <h3 className="text-base font-bold text-chat-textPrimary">Storage & Cache</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-full text-chat-textMuted hover:text-chat-textPrimary"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 rounded-2xl bg-chat-surfaceSecondary border border-chat-border flex items-center justify-between">
              <div>
                <div className="text-xs text-chat-textSecondary">Local Offline Cache</div>
                <div className="text-lg font-bold text-chat-textPrimary">{cacheSizeKb} KB</div>
              </div>
              <button
                onClick={handleClearCache}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 text-xs font-semibold transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Cache</span>
              </button>
            </div>

            <p className="text-[11px] text-chat-textSecondary leading-relaxed">
              Clearing cache removes stored messages from offline memory. Your messages remain safely stored on your account server.
            </p>

            <button
              onClick={() => setActiveModal(null)}
              className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-2.5 rounded-xl transition-all"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* 5. About Modal */}
      {activeModal === 'about' && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div
            style={{ backgroundColor: themeConfig.panel }}
            className="border border-chat-border w-full max-w-sm rounded-3xl p-5 shadow-2xl animate-scale-up space-y-4 text-center"
          >
            <div className="w-14 h-14 rounded-2xl bg-brand-soft border border-brand-500/20 flex items-center justify-center mx-auto text-brand-500">
              <ShieldCheck className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-chat-textPrimary">Kotha Hobe</h3>
              <p className="text-xs font-mono text-brand-500 mt-0.5 font-semibold">
                v{appVersion.versionName} • Build {appVersion.versionCode}
              </p>
            </div>

            <p className="text-xs text-chat-textSecondary leading-relaxed px-2">
              Fast, real-time encrypted messaging application powered by WebSockets and high-performance MongoDB clusters.
            </p>

            <button
              onClick={() => setActiveModal(null)}
              className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-2.5 rounded-xl transition-all"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* 6. Logout Confirmation Modal */}
      {activeModal === 'logoutConfirm' && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div
            style={{ backgroundColor: themeConfig.panel }}
            className="border border-chat-border w-full max-w-xs rounded-3xl p-5 shadow-2xl animate-scale-up space-y-4 text-center"
          >
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto text-red-500">
              <LogOut className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-chat-textPrimary">Log Out?</h3>
              <p className="text-xs text-chat-textSecondary mt-1">
                You can easily log back in anytime with your email OTP.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setActiveModal(null)}
                className="flex-1 bg-chat-surfaceSecondary hover:bg-chat-surfaceTertiary text-chat-textSecondary hover:text-chat-textPrimary font-semibold py-2.5 rounded-xl transition-colors text-xs border border-chat-border"
              >
                Cancel
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 bg-red-500 hover:bg-red-600 text-white font-semibold py-2.5 rounded-xl transition-colors text-xs shadow-md shadow-red-500/20"
              >
                Log Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
