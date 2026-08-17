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
  Palette,
  HardDrive,
  Check,
  X,
  Volume2,
  Vibrate,
  Eye,
  Trash2,
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

  // App version & Update states
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [appVersion, setAppVersion] = useState<{ versionName: string; versionCode: number }>(CURRENT_VERSION);
  const [availableUpdate, setAvailableUpdate] = useState<ReleaseManifest | null>(null);
  const [upToDateNotice, setUpToDateNotice] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Active Modals: 'notifications' | 'privacy' | 'chatTheme' | 'storage' | 'about' | 'logoutConfirm' | null
  const [activeModal, setActiveModal] = useState<string | null>(null);

  // Notification Preferences
  const [soundEnabled, setSoundEnabled] = useState(() => localStorage.getItem('kotha_hobe_sound_enabled') !== 'false');
  const [vibrateEnabled, setVibrateEnabled] = useState(() => localStorage.getItem('kotha_hobe_vibrate_enabled') !== 'false');
  const [previewEnabled, setPreviewEnabled] = useState(() => localStorage.getItem('kotha_hobe_preview_enabled') !== 'false');

  // Privacy Preferences
  const [readReceipts, setReadReceipts] = useState(() => localStorage.getItem('kotha_hobe_read_receipts') !== 'false');
  const [onlinePresence, setOnlinePresence] = useState(() => localStorage.getItem('kotha_hobe_online_presence') !== 'false');

  // Chat Theme & Wallpaper
  const [chatTheme, setChatTheme] = useState(() => localStorage.getItem('kotha_hobe_chat_theme') || 'dark');
  const [fontSize, setFontSize] = useState(() => localStorage.getItem('kotha_hobe_font_size') || 'normal');

  // Storage Stats
  const [cacheSizeKb, setCacheSizeKb] = useState<number>(0);

  const calculateCacheSize = () => {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('kotha_hobe_msgs_') || key === 'kotha_hobe_cached_conversations')) {
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

  const handleToggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    localStorage.setItem('kotha_hobe_sound_enabled', String(next));
    showToast(next ? 'Sound alerts enabled' : 'Sound alerts muted');
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

  const handleSelectTheme = (theme: string) => {
    setChatTheme(theme);
    localStorage.setItem('kotha_hobe_chat_theme', theme);
    showToast(`Wallpaper theme updated`);
  };

  const handleSelectFontSize = (size: string) => {
    setFontSize(size);
    localStorage.setItem('kotha_hobe_font_size', size);
    showToast(`Chat font size set to ${size}`);
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
    <div className="h-full w-full bg-chat-bg flex flex-col max-w-md mx-auto overflow-hidden relative">
      {/* Header with Safe Area Status Bar Padding */}
      <header className="px-4 pt-10 pb-3 bg-chat-panel border-b border-white/10 flex items-center justify-between flex-shrink-0">
        <h1 className="text-xl font-bold text-white tracking-tight">Settings</h1>
      </header>

      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-brand-500 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-xl animate-fade-in flex items-center gap-2 border border-white/20">
          <Check className="w-3.5 h-3.5" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* User Card */}
        <div
          onClick={() => navigate('/profile-setup')}
          className="bg-chat-card border border-white/10 rounded-2xl p-4 flex items-center gap-4 hover:bg-white/5 cursor-pointer transition-colors shadow-sm"
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

        {/* Core Settings Menu */}
        <div className="bg-chat-card border border-white/10 rounded-2xl divide-y divide-white/5 overflow-hidden shadow-sm">
          {/* Edit Profile */}
          <div
            onClick={() => navigate('/profile-setup')}
            className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-white/5 cursor-pointer transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-brand-500/10 flex items-center justify-center text-brand-400 flex-shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-white">Edit Profile</div>
              <div className="text-xs text-chat-textMuted">Photo, @username & display name</div>
            </div>
            <ChevronRight className="w-4 h-4 text-chat-textMuted" />
          </div>

          {/* Notifications */}
          <div
            onClick={() => setActiveModal('notifications')}
            className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-white/5 cursor-pointer transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-400 flex-shrink-0">
              <Bell className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-white">Notifications & Sounds</div>
              <div className="text-xs text-chat-textMuted">
                {soundEnabled ? 'Sound ON' : 'Muted'} • {vibrateEnabled ? 'Vibrate ON' : 'Vibrate OFF'}
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-chat-textMuted" />
          </div>

          {/* Privacy & Security */}
          <div
            onClick={() => setActiveModal('privacy')}
            className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-white/5 cursor-pointer transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 flex-shrink-0">
              <Lock className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-white">Privacy & Security</div>
              <div className="text-xs text-chat-textMuted">Read receipts, online presence & encryption</div>
            </div>
            <ChevronRight className="w-4 h-4 text-chat-textMuted" />
          </div>

          {/* Chat Wallpaper & Theme */}
          <div
            onClick={() => setActiveModal('chatTheme')}
            className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-white/5 cursor-pointer transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400 flex-shrink-0">
              <Palette className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-white">Chat Wallpaper & Appearance</div>
              <div className="text-xs text-chat-textMuted capitalize">
                Theme: {chatTheme} • Text: {fontSize}
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
            className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-white/5 cursor-pointer transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400 flex-shrink-0">
              <HardDrive className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-white">Storage & Cache Data</div>
              <div className="text-xs text-chat-textMuted">{cacheSizeKb} KB cached locally</div>
            </div>
            <ChevronRight className="w-4 h-4 text-chat-textMuted" />
          </div>

          {/* Dynamic App Version & Update Status */}
          {availableUpdate ? (
            <div
              onClick={handleCheckUpdate}
              className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-white/10 active:scale-[0.99] cursor-pointer transition-all bg-brand-500/10 border-l-4 border-brand-400"
            >
              <div className="w-9 h-9 rounded-xl bg-brand-500/20 flex items-center justify-center text-brand-400 flex-shrink-0">
                <Sparkles className="w-5 h-5 animate-pulse" />
              </div>
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
              <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-400 flex-shrink-0">
                <CheckCircle2 className="w-5 h-5" />
              </div>
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
          <div
            onClick={() => setActiveModal('about')}
            className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-white/5 cursor-pointer transition-colors"
          >
            <div className="w-9 h-9 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 flex-shrink-0">
              <Info className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-white">About Kotha Hobe</div>
              <div className="text-xs text-chat-textMuted font-mono">
                v{appVersion.versionName} (Build {appVersion.versionCode}) • Real-Time Engine
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-chat-textMuted" />
          </div>
        </div>

        {/* Logout Action Button */}
        <button
          onClick={() => setActiveModal('logoutConfirm')}
          className="w-full bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 font-semibold py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-sm"
        >
          <LogOut className="w-5 h-5" />
          <span>Log Out</span>
        </button>

        <div className="flex items-center justify-center gap-1.5 text-xs text-chat-textMuted pt-1 pb-4">
          <ShieldCheck className="w-4 h-4 text-brand-400" />
          <span>Kotha Hobe Encrypted Messaging</span>
        </div>
      </div>

      {/* ================= MODALS ================= */}

      {/* 1. Notifications Modal */}
      {activeModal === 'notifications' && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-chat-panel border border-white/10 w-full max-w-sm rounded-2xl p-5 shadow-2xl animate-scale-up space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-sky-400" />
                <h3 className="text-base font-bold text-white">Notifications</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-full text-chat-textMuted hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-chat-card rounded-xl">
                <div className="flex items-center gap-3">
                  <Volume2 className="w-4 h-4 text-chat-textMuted" />
                  <div>
                    <div className="text-sm font-medium text-white">Sound Alerts</div>
                    <div className="text-[11px] text-chat-textMuted">Play tone for incoming messages</div>
                  </div>
                </div>
                <button
                  onClick={handleToggleSound}
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    soundEnabled ? 'bg-brand-500' : 'bg-white/20'
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      soundEnabled ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 bg-chat-card rounded-xl">
                <div className="flex items-center gap-3">
                  <Vibrate className="w-4 h-4 text-chat-textMuted" />
                  <div>
                    <div className="text-sm font-medium text-white">Vibration</div>
                    <div className="text-[11px] text-chat-textMuted">Vibrate on message received</div>
                  </div>
                </div>
                <button
                  onClick={handleToggleVibrate}
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    vibrateEnabled ? 'bg-brand-500' : 'bg-white/20'
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      vibrateEnabled ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 bg-chat-card rounded-xl">
                <div className="flex items-center gap-3">
                  <Eye className="w-4 h-4 text-chat-textMuted" />
                  <div>
                    <div className="text-sm font-medium text-white">Message Preview</div>
                    <div className="text-[11px] text-chat-textMuted">Show sender and message text</div>
                  </div>
                </div>
                <button
                  onClick={handleTogglePreview}
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    previewEnabled ? 'bg-brand-500' : 'bg-white/20'
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-chat-panel border border-white/10 w-full max-w-sm rounded-2xl p-5 shadow-2xl animate-scale-up space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Privacy & Security</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-full text-chat-textMuted hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-chat-card rounded-xl">
                <div>
                  <div className="text-sm font-medium text-white">Read Receipts</div>
                  <div className="text-[11px] text-chat-textMuted">Show blue double checkmarks</div>
                </div>
                <button
                  onClick={handleToggleReadReceipts}
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    readReceipts ? 'bg-brand-500' : 'bg-white/20'
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      readReceipts ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between p-3 bg-chat-card rounded-xl">
                <div>
                  <div className="text-sm font-medium text-white">Online Presence</div>
                  <div className="text-[11px] text-chat-textMuted">Show online dot & last seen</div>
                </div>
                <button
                  onClick={handleToggleOnlinePresence}
                  className={`w-12 h-6 rounded-full transition-colors relative ${
                    onlinePresence ? 'bg-brand-500' : 'bg-white/20'
                  }`}
                >
                  <span
                    className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                      onlinePresence ? 'left-7' : 'left-1'
                    }`}
                  />
                </button>
              </div>

              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs mb-1">
                  <ShieldCheck className="w-4 h-4" />
                  <span>256-Bit Socket Tunnel Active</span>
                </div>
                <p className="text-[11px] text-chat-textMuted leading-relaxed">
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-chat-panel border border-white/10 w-full max-w-sm rounded-2xl p-5 shadow-2xl animate-scale-up space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Palette className="w-5 h-5 text-purple-400" />
                <h3 className="text-base font-bold text-white">Chat Wallpaper & Style</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-full text-chat-textMuted hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-chat-textMuted mb-2">
                Wallpaper Theme
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { id: 'dark', name: 'Default Dark', color: '#0b141a' },
                  { id: 'midnight', name: 'Midnight Slate', color: '#0f172a' },
                  { id: 'emerald', name: 'Deep Emerald', color: '#06281e' },
                  { id: 'navy', name: 'Royal Navy', color: '#0a192f' },
                  { id: 'charcoal', name: 'Pure Charcoal', color: '#18181b' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => handleSelectTheme(t.id)}
                    className={`flex items-center gap-2.5 p-2.5 rounded-xl border transition-all text-left ${
                      chatTheme === t.id
                        ? 'border-brand-400 bg-brand-500/10'
                        : 'border-white/10 bg-chat-card hover:bg-white/5'
                    }`}
                  >
                    <span
                      className="w-5 h-5 rounded-full border border-white/20 flex-shrink-0"
                      style={{ backgroundColor: t.color }}
                    />
                    <span className="text-xs font-medium text-white truncate">{t.name}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-chat-textMuted mb-2">
                Message Text Size
              </label>
              <div className="flex gap-2">
                {['compact', 'normal', 'large'].map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSelectFontSize(s)}
                    className={`flex-1 py-2 rounded-xl text-xs font-semibold capitalize border transition-all ${
                      fontSize === s
                        ? 'bg-brand-500 border-brand-400 text-white'
                        : 'bg-chat-card border-white/10 text-chat-textMuted hover:text-white'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => setActiveModal(null)}
              className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-2.5 rounded-xl transition-all"
            >
              Apply Theme
            </button>
          </div>
        </div>
      )}

      {/* 4. Storage & Data Modal */}
      {activeModal === 'storage' && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-chat-panel border border-white/10 w-full max-w-sm rounded-2xl p-5 shadow-2xl animate-scale-up space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <HardDrive className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">Storage & Cache</h3>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1 rounded-full text-chat-textMuted hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 bg-chat-card rounded-xl flex items-center justify-between">
              <div>
                <div className="text-xs text-chat-textMuted">Local Offline Cache</div>
                <div className="text-lg font-bold text-white">{cacheSizeKb} KB</div>
              </div>
              <button
                onClick={handleClearCache}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-semibold transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear Cache</span>
              </button>
            </div>

            <p className="text-[11px] text-chat-textMuted leading-relaxed">
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
          <div className="bg-chat-panel border border-white/10 w-full max-w-sm rounded-2xl p-5 shadow-2xl animate-scale-up space-y-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center mx-auto text-brand-400">
              <ShieldCheck className="w-7 h-7" />
            </div>

            <div>
              <h3 className="text-lg font-bold text-white">Kotha Hobe</h3>
              <p className="text-xs font-mono text-brand-400 mt-0.5">
                v{appVersion.versionName} • Build {appVersion.versionCode}
              </p>
            </div>

            <p className="text-xs text-chat-textMuted leading-relaxed px-2">
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
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-chat-panel border border-white/10 w-full max-w-xs rounded-2xl p-5 shadow-2xl animate-scale-up space-y-4 text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mx-auto text-red-400">
              <LogOut className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-white">Log Out?</h3>
              <p className="text-xs text-chat-textMuted mt-1">
                You can easily log back in anytime with your email OTP.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setActiveModal(null)}
                className="flex-1 bg-white/5 hover:bg-white/10 text-chat-textMuted hover:text-white font-semibold py-2.5 rounded-xl transition-colors text-xs"
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
