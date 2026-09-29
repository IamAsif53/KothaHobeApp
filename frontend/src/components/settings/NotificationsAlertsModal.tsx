import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from '../../context/ThemeContext';
import {
  X,
  Bell,
  Volume2,
  VolumeX,
  Vibrate,
  Eye,
  EyeOff,
  Phone,
  PhoneMissed,
  MessageSquare,
  Users,
  BadgeAlert,
  ChevronRight,
  ChevronLeft,
  Check,
  AlertCircle,
  Smartphone,
  ExternalLink,
  ShieldCheck,
  Radio,
  Play,
  Settings as SettingsIcon,
} from 'lucide-react';
import {
  getNotificationSettingsApi,
  updateNotificationSettingsApi,
} from '../../api/notificationApi';
import { INotificationSettings } from '../../types';
import { soundService } from '../../services/soundService';
import { modalStack } from '../../utils/modalStack';
import { LocalNotifications } from '@capacitor/local-notifications';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';

interface NotificationsAlertsModalProps {
  onClose: () => void;
}

type SubView = 'main' | 'channels' | 'sounds';

export const NotificationsAlertsModal: React.FC<NotificationsAlertsModalProps> = ({ onClose }) => {
  const { themeConfig } = useTheme();

  const [currentView, setCurrentView] = useState<SubView>('main');
  const [loading, setLoading] = useState<boolean>(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');

  // Notification Preferences State
  const [settings, setSettings] = useState<INotificationSettings>({
    messages: true,
    groups: true,
    calls: true,
    missedCalls: true,
    stories: true,
    previewEnabled: true,
    sound: true,
    vibrate: true,
  });

  const [badgeEnabled, setBadgeEnabled] = useState<boolean>(() => {
    return localStorage.getItem('kotha_hobe_badge_enabled') !== 'false';
  });

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    const timer = setTimeout(() => setToastMessage(null), 3000);
    return () => clearTimeout(timer);
  }, []);

  // Hardware Back Button integration
  useEffect(() => {
    const unregister = modalStack.register('notifications_alerts_modal', () => {
      if (currentView !== 'main') {
        setCurrentView('main');
      } else {
        onClose();
      }
    });
    return () => unregister();
  }, [currentView, onClose]);

  // Check Native & Web Notification Permissions
  const checkPermissions = useCallback(async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        const perm = await LocalNotifications.checkPermissions();
        setPermissionStatus(perm.display === 'granted' ? 'granted' : perm.display === 'denied' ? 'denied' : 'prompt');
      } else if (typeof Notification !== 'undefined') {
        setPermissionStatus(
          Notification.permission === 'granted'
            ? 'granted'
            : Notification.permission === 'denied'
            ? 'denied'
            : 'prompt'
        );
      } else {
        setPermissionStatus('granted');
      }
    } catch {
      setPermissionStatus('unknown');
    }
  }, []);

  // Fetch Settings on Mount
  useEffect(() => {
    checkPermissions();

    // 1. Instant local state load
    try {
      const localSound = localStorage.getItem('kotha_hobe_sound_enabled') !== 'false';
      const localVibrate = localStorage.getItem('kotha_hobe_vibrate_enabled') !== 'false';
      const localPreview = localStorage.getItem('kotha_hobe_preview_enabled') !== 'false';
      const localMessages = localStorage.getItem('kotha_hobe_notif_messages') !== 'false';
      const localGroups = localStorage.getItem('kotha_hobe_notif_groups') !== 'false';
      const localCalls = localStorage.getItem('kotha_hobe_notif_calls') !== 'false';
      const localMissedCalls = localStorage.getItem('kotha_hobe_notif_missed_calls') !== 'false';

      setSettings((prev) => ({
        ...prev,
        sound: localSound,
        vibrate: localVibrate,
        previewEnabled: localPreview,
        messages: localMessages,
        groups: localGroups,
        calls: localCalls,
        missedCalls: localMissedCalls,
      }));
    } catch {}

    // 2. Fetch authoritative backend settings
    getNotificationSettingsApi()
      .then((res) => {
        if (res.success && res.notificationSettings) {
          setSettings(res.notificationSettings);
          // Sync to localStorage
          localStorage.setItem('kotha_hobe_sound_enabled', String(res.notificationSettings.sound));
          localStorage.setItem('kotha_hobe_vibrate_enabled', String(res.notificationSettings.vibrate));
          localStorage.setItem('kotha_hobe_preview_enabled', String(res.notificationSettings.previewEnabled));
          localStorage.setItem('kotha_hobe_notif_messages', String(res.notificationSettings.messages));
          localStorage.setItem('kotha_hobe_notif_groups', String(res.notificationSettings.groups));
          localStorage.setItem('kotha_hobe_notif_calls', String(res.notificationSettings.calls));
          localStorage.setItem('kotha_hobe_notif_missed_calls', String(res.notificationSettings.missedCalls));
        }
      })
      .catch((err) => {
        console.warn('[Notifications] Failed to load server settings:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [checkPermissions]);

  // Request Notification Permissions
  const handleRequestPermission = async () => {
    try {
      if (Capacitor.isNativePlatform()) {
        const res = await LocalNotifications.requestPermissions();
        try {
          await PushNotifications.requestPermissions();
        } catch {}
        if (res.display === 'granted') {
          setPermissionStatus('granted');
          showToast('Notification permission granted');
        } else {
          setPermissionStatus('denied');
          showToast('Notification permission denied');
        }
      } else if (typeof Notification !== 'undefined') {
        const res = await Notification.requestPermission();
        if (res === 'granted') {
          setPermissionStatus('granted');
          showToast('Notification permission granted');
        } else {
          setPermissionStatus('denied');
          showToast('Notification permission denied');
        }
      }
    } catch (err) {
      console.warn('[Permission] Request error:', err);
    }
  };

  // Generic Setting Update Handler (Optimistic UI + Server Sync)
  const handleUpdateSetting = async <K extends keyof INotificationSettings>(
    key: K,
    value: INotificationSettings[K],
    label: string
  ) => {
    const previous = settings[key];
    if (previous === value) return;

    // Optimistic Update
    setSettings((prev) => ({ ...prev, [key]: value }));
    setSavingKey(String(key));

    // LocalStorage Mirroring for fast offline fallback
    if (key === 'sound') localStorage.setItem('kotha_hobe_sound_enabled', String(value));
    if (key === 'vibrate') localStorage.setItem('kotha_hobe_vibrate_enabled', String(value));
    if (key === 'previewEnabled') localStorage.setItem('kotha_hobe_preview_enabled', String(value));
    if (key === 'messages') localStorage.setItem('kotha_hobe_notif_messages', String(value));
    if (key === 'groups') localStorage.setItem('kotha_hobe_notif_groups', String(value));
    if (key === 'calls') localStorage.setItem('kotha_hobe_notif_calls', String(value));
    if (key === 'missedCalls') localStorage.setItem('kotha_hobe_notif_missed_calls', String(value));

    try {
      const res = await updateNotificationSettingsApi({ [key]: value });
      if (res.success && res.notificationSettings) {
        setSettings(res.notificationSettings);
        showToast(`${label} updated`);
      } else {
        throw new Error(res.message || 'Server update failed');
      }
    } catch (error) {
      console.error(`[Notifications] Failed to update ${String(key)}:`, error);
      // Rollback on failure
      setSettings((prev) => ({ ...prev, [key]: previous }));
      showToast(`Failed to update ${label}`);
    } finally {
      setSavingKey(null);
    }
  };

  const handleToggleBadge = () => {
    const next = !badgeEnabled;
    setBadgeEnabled(next);
    localStorage.setItem('kotha_hobe_badge_enabled', String(next));
    if (!next) {
      soundService.updateAppBadge(0);
    }
    showToast(next ? 'App badge enabled' : 'App badge disabled');
  };

  const handleTestSound = (e: React.MouseEvent) => {
    e.stopPropagation();
    soundService.playMessageReceivedTone();
    showToast('Playing notification tone');
  };

  const handleTestVibrate = (e: React.MouseEvent) => {
    e.stopPropagation();
    soundService.triggerVibration([100, 50, 100]);
    showToast('Triggered device vibration');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
      {/* Toast feedback */}
      {toastMessage && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-[60] bg-chat-surfaceSecondary/95 text-chat-textPrimary text-xs font-semibold px-4 py-2.5 rounded-full shadow-2xl border border-chat-border/80 flex items-center gap-2 backdrop-blur-md animate-slide-down">
          <div className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Sheet / Container */}
      <div
        style={{ backgroundColor: themeConfig.panel }}
        className="w-full max-w-lg h-[92vh] sm:h-auto sm:max-h-[88vh] rounded-t-3xl sm:rounded-3xl border border-chat-border shadow-2xl flex flex-col overflow-hidden animate-slide-up"
      >
        {/* Sticky Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-chat-divider/80 bg-chat-surfacePrimary/50 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-3">
            {currentView !== 'main' ? (
              <button
                onClick={() => setCurrentView('main')}
                className="p-1.5 -ml-1.5 rounded-full hover:bg-chat-surfaceTertiary text-chat-textPrimary transition-colors"
                aria-label="Back"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            ) : (
              <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-sky-500/20 to-brand-500/20 flex items-center justify-center text-sky-500 border border-sky-500/30 shadow-inner">
                <Bell className="w-5 h-5" />
              </div>
            )}
            <div>
              <h2 className="text-base font-bold text-chat-textPrimary leading-tight">
                {currentView === 'main' && 'Notifications & Alerts'}
                {currentView === 'channels' && 'Android Channels'}
                {currentView === 'sounds' && 'Sound & Tones'}
              </h2>
              <div className="text-[11px] text-chat-textMuted flex items-center gap-1.5 mt-0.5">
                {savingKey ? (
                  <>
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
                    <span>Syncing changes...</span>
                  </>
                ) : (
                  <>
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span>Real-time preferences active</span>
                  </>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full text-chat-textMuted hover:text-chat-textPrimary hover:bg-chat-surfaceTertiary transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-6 custom-scrollbar">
          {/* ================= VIEW 1: MAIN NOTIFICATIONS CENTER ================= */}
          {currentView === 'main' && (
            <>
              {/* OS Permission Banner */}
              {permissionStatus !== 'granted' && (
                <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-amber-500">
                      {permissionStatus === 'denied' ? 'Device Notifications Blocked' : 'Notifications Not Permitted'}
                    </div>
                    <div className="text-[11px] text-chat-textSecondary mt-0.5 leading-relaxed">
                      {permissionStatus === 'denied'
                        ? 'Allow Kotha Hobe in system settings so incoming chats and calls alert you on lock screen.'
                        : 'Grant notification permission to get instant alerts for messages and VoIP calls.'}
                    </div>
                    <button
                      onClick={handleRequestPermission}
                      className="mt-2.5 px-3 py-1.5 rounded-xl bg-amber-500 text-black text-xs font-bold hover:bg-amber-400 transition-colors inline-flex items-center gap-1.5 shadow-sm"
                    >
                      <Bell className="w-3.5 h-3.5" />
                      <span>{permissionStatus === 'denied' ? 'Review Permission' : 'Enable Notifications'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Permission Active Status (Compact Card) */}
              {permissionStatus === 'granted' && (
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <ShieldCheck className="w-4 h-4 text-emerald-500" />
                    <div>
                      <div className="text-xs font-bold text-emerald-500">Device Notifications Active</div>
                      <div className="text-[10px] text-chat-textMuted">System push alerts authorized</div>
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                    GRANTED
                  </span>
                </div>
              )}

              {/* SECTION 1: MESSAGE NOTIFICATIONS */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold tracking-wider text-chat-textMuted uppercase px-1">
                  Message Notifications
                </div>
                <div className="bg-chat-surfaceSecondary border border-chat-border/70 rounded-2xl divide-y divide-chat-border/40 overflow-hidden shadow-sm">
                  {/* Direct Messages */}
                  <div className="flex items-center justify-between p-3.5 hover:bg-chat-surfaceTertiary/40 transition-colors">
                    <div className="flex items-center gap-3 pr-2">
                      <div className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center shrink-0">
                        <MessageSquare className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-chat-textPrimary">Direct Messages</div>
                        <div className="text-[11px] text-chat-textSecondary">Alerts for 1-on-1 private chats</div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleUpdateSetting('messages', !settings.messages, 'Direct messages')}
                      className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                        settings.messages ? 'bg-brand-500' : 'bg-chat-surfaceTertiary'
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                          settings.messages ? 'left-7' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Group Messages */}
                  <div className="flex items-center justify-between p-3.5 hover:bg-chat-surfaceTertiary/40 transition-colors">
                    <div className="flex items-center gap-3 pr-2">
                      <div className="w-8 h-8 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
                        <Users className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-chat-textPrimary">Group Messages</div>
                        <div className="text-[11px] text-chat-textSecondary">Alerts for group conversations</div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleUpdateSetting('groups', !settings.groups, 'Group messages')}
                      className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                        settings.groups ? 'bg-brand-500' : 'bg-chat-surfaceTertiary'
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                          settings.groups ? 'left-7' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Message Preview */}
                  <div className="flex items-center justify-between p-3.5 hover:bg-chat-surfaceTertiary/40 transition-colors">
                    <div className="flex items-center gap-3 pr-2">
                      <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                        {settings.previewEnabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-chat-textPrimary">Message Preview</div>
                        <div className="text-[11px] text-chat-textSecondary">
                          {settings.previewEnabled
                            ? 'Show sender name & text snippet'
                            : 'Masked as "New message" for privacy'}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() =>
                        handleUpdateSetting('previewEnabled', !settings.previewEnabled, 'Message preview')
                      }
                      className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                        settings.previewEnabled ? 'bg-brand-500' : 'bg-chat-surfaceTertiary'
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                          settings.previewEnabled ? 'left-7' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* SECTION 2: CALL NOTIFICATIONS */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold tracking-wider text-chat-textMuted uppercase px-1">
                  Call Notifications
                </div>
                <div className="bg-chat-surfaceSecondary border border-chat-border/70 rounded-2xl divide-y divide-chat-border/40 overflow-hidden shadow-sm">
                  {/* Incoming Calls */}
                  <div className="flex items-center justify-between p-3.5 hover:bg-chat-surfaceTertiary/40 transition-colors">
                    <div className="flex items-center gap-3 pr-2">
                      <div className="w-8 h-8 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
                        <Phone className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-chat-textPrimary">Incoming Calls</div>
                        <div className="text-[11px] text-chat-textSecondary">Full-screen incoming VoIP call ringtone</div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleUpdateSetting('calls', !settings.calls, 'Incoming calls')}
                      className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                        settings.calls ? 'bg-brand-500' : 'bg-chat-surfaceTertiary'
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                          settings.calls ? 'left-7' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Missed Calls */}
                  <div className="flex items-center justify-between p-3.5 hover:bg-chat-surfaceTertiary/40 transition-colors">
                    <div className="flex items-center gap-3 pr-2">
                      <div className="w-8 h-8 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center shrink-0">
                        <PhoneMissed className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-chat-textPrimary">Missed Call Alerts</div>
                        <div className="text-[11px] text-chat-textSecondary">Notify when a call was unanswered</div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleUpdateSetting('missedCalls', !settings.missedCalls, 'Missed call alerts')}
                      className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                        settings.missedCalls ? 'bg-brand-500' : 'bg-chat-surfaceTertiary'
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                          settings.missedCalls ? 'left-7' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* SECTION 3: IN-APP ALERTS & FEEDBACK */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold tracking-wider text-chat-textMuted uppercase px-1">
                  In-App Audio & Haptics
                </div>
                <div className="bg-chat-surfaceSecondary border border-chat-border/70 rounded-2xl divide-y divide-chat-border/40 overflow-hidden shadow-sm">
                  {/* Sound Alerts */}
                  <div className="flex items-center justify-between p-3.5 hover:bg-chat-surfaceTertiary/40 transition-colors">
                    <div className="flex items-center gap-3 pr-2">
                      <div className="w-8 h-8 rounded-xl bg-violet-500/10 text-violet-500 flex items-center justify-center shrink-0">
                        {settings.sound ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold text-chat-textPrimary">Sound Effects</div>
                          {settings.sound && (
                            <button
                              onClick={handleTestSound}
                              className="px-2 py-0.5 rounded-full bg-violet-500/10 text-violet-400 text-[10px] font-bold hover:bg-violet-500/20 transition-colors flex items-center gap-1"
                            >
                              <Play className="w-2.5 h-2.5 fill-current" />
                              <span>Test</span>
                            </button>
                          )}
                        </div>
                        <div className="text-[11px] text-chat-textSecondary">Play tone on incoming messages</div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleUpdateSetting('sound', !settings.sound, 'Sound alerts')}
                      className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                        settings.sound ? 'bg-brand-500' : 'bg-chat-surfaceTertiary'
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                          settings.sound ? 'left-7' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Device Vibration */}
                  <div className="flex items-center justify-between p-3.5 hover:bg-chat-surfaceTertiary/40 transition-colors">
                    <div className="flex items-center gap-3 pr-2">
                      <div className="w-8 h-8 rounded-xl bg-fuchsia-500/10 text-fuchsia-500 flex items-center justify-center shrink-0">
                        <Vibrate className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="text-sm font-semibold text-chat-textPrimary">Device Vibration</div>
                          {settings.vibrate && (
                            <button
                              onClick={handleTestVibrate}
                              className="px-2 py-0.5 rounded-full bg-fuchsia-500/10 text-fuchsia-400 text-[10px] font-bold hover:bg-fuchsia-500/20 transition-colors flex items-center gap-1"
                            >
                              <Radio className="w-2.5 h-2.5" />
                              <span>Test</span>
                            </button>
                          )}
                        </div>
                        <div className="text-[11px] text-chat-textSecondary">Vibrate device on message arrival</div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleUpdateSetting('vibrate', !settings.vibrate, 'Device vibration')}
                      className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                        settings.vibrate ? 'bg-brand-500' : 'bg-chat-surfaceTertiary'
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                          settings.vibrate ? 'left-7' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* App Icon Badges */}
                  <div className="flex items-center justify-between p-3.5 hover:bg-chat-surfaceTertiary/40 transition-colors">
                    <div className="flex items-center gap-3 pr-2">
                      <div className="w-8 h-8 rounded-xl bg-teal-500/10 text-teal-500 flex items-center justify-center shrink-0">
                        <BadgeAlert className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-chat-textPrimary">App Icon Badges</div>
                        <div className="text-[11px] text-chat-textSecondary">Display unread badge count on home screen</div>
                      </div>
                    </div>
                    <button
                      onClick={handleToggleBadge}
                      className={`w-12 h-6 rounded-full transition-colors relative shrink-0 ${
                        badgeEnabled ? 'bg-brand-500' : 'bg-chat-surfaceTertiary'
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                          badgeEnabled ? 'left-7' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* SECTION 4: SYSTEM & CHANNELS LINK */}
              <div className="space-y-2">
                <div className="text-[11px] font-bold tracking-wider text-chat-textMuted uppercase px-1">
                  System Settings & Channels
                </div>
                <div className="bg-chat-surfaceSecondary border border-chat-border/70 rounded-2xl divide-y divide-chat-border/40 overflow-hidden shadow-sm">
                  <button
                    onClick={() => setCurrentView('channels')}
                    className="w-full flex items-center justify-between p-3.5 hover:bg-chat-surfaceTertiary/40 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
                        <Smartphone className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-chat-textPrimary">Android Channels & Priority</div>
                        <div className="text-[11px] text-chat-textSecondary">
                          High-importance channels for calls & messaging
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-chat-textMuted" />
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ================= VIEW 2: ANDROID CHANNELS & SYSTEM GUIDE ================= */}
          {currentView === 'channels' && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 rounded-2xl bg-chat-surfaceSecondary border border-chat-border/60 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-2xl bg-sky-500/10 text-sky-500 flex items-center justify-center border border-sky-500/20">
                    <Smartphone className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-sm font-bold text-chat-textPrimary">Dedicated Notification Channels</div>
                    <div className="text-[11px] text-chat-textSecondary">Managed via native Android NotificationManager</div>
                  </div>
                </div>
                <div className="text-xs text-chat-textSecondary leading-relaxed space-y-2">
                  <p>
                    Kotha Hobe configures two high-priority system channels on Android 8.0+ to ensure you never miss calls or messages even in battery-saver mode:
                  </p>
                  <ul className="list-disc list-inside space-y-1 text-chat-textMuted pl-1">
                    <li>
                      <strong className="text-chat-textPrimary">Incoming Calls:</strong> Full-screen high-priority ringtone channel with custom vibration and Do Not Disturb bypass.
                    </li>
                    <li>
                      <strong className="text-chat-textPrimary">Chat Messages:</strong> High-importance messaging style channel with inline quick replies and sender avatars.
                    </li>
                  </ul>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-brand-500/10 border border-brand-500/20 space-y-2">
                <div className="text-xs font-bold text-brand-400">Lock Screen Privacy</div>
                <div className="text-[11px] text-chat-textSecondary leading-relaxed">
                  When you toggle off <strong>Message Preview</strong>, Kotha Hobe masks notification content at the cloud push level so no sensitive message text is visible on your device lock screen.
                </div>
              </div>

              <button
                onClick={() => setCurrentView('main')}
                className="w-full py-3 rounded-2xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm transition-colors shadow-md"
              >
                Back to Notifications
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
