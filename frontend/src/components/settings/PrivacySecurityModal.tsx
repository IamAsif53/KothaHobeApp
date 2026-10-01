import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';
import {
  X,
  Lock,
  Eye,
  Shield,
  ShieldCheck,
  ShieldAlert,
  ChevronRight,
  ChevronLeft,
  Smartphone,
  Laptop,
  Globe,
  Radio,
  Clock,
  Users,
  MessageSquare,
  Sparkles,
  LogOut,
  Check,
  AlertTriangle,
  RefreshCw,
  KeyRound,
  Server,
} from 'lucide-react';
import {
  getPrivacySettingsApi,
  updatePrivacySettingsApi,
  getUserSessionsApi,
  revokeSessionApi,
  revokeOtherSessionsApi,
  getConnectionSecurityApi,
  getBlockedUsersApi,
} from '../../api/privacyApi';
import { IPrivacySettings, IUserSession, IConnectionSecurity } from '../../types';
import { modalStack } from '../../utils/modalStack';

interface PrivacySecurityModalProps {
  onClose: () => void;
}

type SubView =
  | 'main'
  | 'lastSeen'
  | 'storyPrivacy'
  | 'messageRequests'
  | 'groupInvites'
  | 'sessions'
  | 'securityDetails';

export const PrivacySecurityModal: React.FC<PrivacySecurityModalProps> = ({ onClose }) => {
  const { themeConfig } = useTheme();
  const navigate = useNavigate();

  // Navigation Subview Stack
  const [currentView, setCurrentView] = useState<SubView>('main');

  // Loading & Sync States
  const [loading, setLoading] = useState<boolean>(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Settings & Sessions State
  const [privacy, setPrivacy] = useState<IPrivacySettings>({
    readReceipts: true,
    onlinePresence: true,
    lastSeen: 'everyone',
    typingIndicators: true,
    storyVisibility: 'connections',
    messageRequests: 'everyone',
    groupInvites: 'everyone',
  });

  const [sessions, setSessions] = useState<IUserSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>('');
  const [securityStatus, setSecurityStatus] = useState<IConnectionSecurity | null>(null);
  const [blockedCount, setBlockedCount] = useState<number>(0);
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null);
  const [confirmRevokeOthers, setConfirmRevokeOthers] = useState<boolean>(false);
  const [revokingOthers, setRevokingOthers] = useState<boolean>(false);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    const timer = setTimeout(() => setToastMessage(null), 3200);
    return () => clearTimeout(timer);
  }, []);

  // Modal stack integration for hardware back button support
  useEffect(() => {
    const unregister = modalStack.register('privacy_security_modal', () => {
      if (currentView !== 'main') {
        setCurrentView('main');
      } else {
        onClose();
      }
    });
    return () => unregister();
  }, [currentView, onClose]);

  // Load initial settings and sessions
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [privRes, sessRes, secRes, blockRes] = await Promise.allSettled([
        getPrivacySettingsApi(),
        getUserSessionsApi(),
        getConnectionSecurityApi(),
        getBlockedUsersApi(),
      ]);

      if (privRes.status === 'fulfilled' && privRes.value.success) {
        setPrivacy(privRes.value.privacySettings);
      }
      if (sessRes.status === 'fulfilled' && sessRes.value.success) {
        setSessions(sessRes.value.sessions || []);
        if (sessRes.value.currentSessionId) {
          setCurrentSessionId(sessRes.value.currentSessionId);
        }
      }
      if (secRes.status === 'fulfilled' && secRes.value.success) {
        setSecurityStatus(secRes.value.security);
      }
      if (blockRes.status === 'fulfilled' && blockRes.value.success) {
        setBlockedCount(blockRes.value.blockedUsers?.length || 0);
      }
    } catch (err) {
      console.warn('[Privacy] Failed to fetch data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Optimistic Toggle Handler
  const handleToggle = async (key: 'readReceipts' | 'onlinePresence' | 'typingIndicators') => {
    const previous = privacy[key];
    const updated = !previous;

    // Optimistic UI update
    setPrivacy((prev) => ({ ...prev, [key]: updated }));
    setSavingKey(key);

    try {
      const res = await updatePrivacySettingsApi({ [key]: updated });
      if (res.success && res.privacySettings) {
        setPrivacy(res.privacySettings);
        if (key === 'readReceipts') {
          showToast(updated ? 'Read receipts enabled' : 'Read receipts disabled');
        } else if (key === 'onlinePresence') {
          showToast(updated ? 'Online status visible to contacts' : 'Online status hidden');
        } else if (key === 'typingIndicators') {
          showToast(updated ? 'Typing indicators visible' : 'Typing indicators hidden');
        }
      } else {
        throw new Error(res.message || 'Update failed');
      }
    } catch (err: any) {
      // Rollback on failure
      setPrivacy((prev) => ({ ...prev, [key]: previous }));
      showToast(err?.message || 'Failed to update setting. Please try again.');
    } finally {
      setSavingKey(null);
    }
  };

  // Option Setting Handler for enum fields
  const handleSelectOption = async <K extends keyof IPrivacySettings>(
    key: K,
    val: IPrivacySettings[K],
    label: string
  ) => {
    const previous = privacy[key];
    setPrivacy((prev) => ({ ...prev, [key]: val }));
    setSavingKey(String(key));

    try {
      const res = await updatePrivacySettingsApi({ [key]: val });
      if (res.success && res.privacySettings) {
        setPrivacy(res.privacySettings);
        showToast(`Updated to: ${label}`);
        setCurrentView('main');
      } else {
        throw new Error(res.message || 'Update failed');
      }
    } catch (err: any) {
      setPrivacy((prev) => ({ ...prev, [key]: previous }));
      showToast(err?.message || 'Failed to update option');
    } finally {
      setSavingKey(null);
    }
  };

  // Revoke Individual Session
  const handleRevokeSession = async (sessionId: string, deviceName: string) => {
    setRevokingSessionId(sessionId);
    try {
      const res = await revokeSessionApi(sessionId);
      if (res.success) {
        setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
        showToast(`Signed out ${deviceName}`);
      } else {
        showToast(res.message || 'Failed to sign out device');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to sign out device');
    } finally {
      setRevokingSessionId(null);
    }
  };

  // Revoke All Other Sessions
  const handleRevokeAllOthers = async () => {
    setRevokingOthers(true);
    try {
      const res = await revokeOtherSessionsApi();
      if (res.success) {
        setSessions((prev) => prev.filter((s) => s.isCurrent || s.sessionId === currentSessionId));
        setConfirmRevokeOthers(false);
        showToast('All other devices have been signed out');
      } else {
        showToast(res.message || 'Failed to sign out other devices');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to sign out other devices');
    } finally {
      setRevokingOthers(false);
    }
  };

  const formatLastSeenLabel = (val: 'everyone' | 'connections' | 'nobody') => {
    switch (val) {
      case 'everyone':
        return 'Everyone';
      case 'connections':
        return 'My Connections';
      case 'nobody':
        return 'Nobody';
    }
  };

  const formatStoryVisibilityLabel = (val: 'everyone' | 'connections' | 'close_friends') => {
    switch (val) {
      case 'everyone':
        return 'Everyone';
      case 'connections':
        return 'Connections Only';
      case 'close_friends':
        return 'Close Friends';
    }
  };

  const formatMessageRequestsLabel = (val: 'everyone' | 'connections') => {
    return val === 'everyone' ? 'Everyone' : 'Connections Only';
  };

  const formatGroupInvitesLabel = (val: 'everyone' | 'connections') => {
    return val === 'everyone' ? 'Everyone' : 'Connections Only';
  };

  const formatPlatformIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'android':
      case 'ios':
        return <Smartphone className="w-5 h-5 text-emerald-500" />;
      case 'windows':
      case 'macos':
      case 'linux':
        return <Laptop className="w-5 h-5 text-sky-500" />;
      default:
        return <Globe className="w-5 h-5 text-indigo-500" />;
    }
  };

  const otherSessions = sessions.filter((s) => !s.isCurrent && s.sessionId !== currentSessionId);
  const currentSession = sessions.find((s) => s.isCurrent || s.sessionId === currentSessionId);

  return (
    <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in select-none">
      <div
        style={{ backgroundColor: themeConfig.panel }}
        className="w-full max-w-lg sm:rounded-3xl rounded-t-3xl border border-chat-border shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[85vh] overflow-hidden transition-all duration-300"
      >
        {/* Toast Overlay */}
        {toastMessage && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-50 bg-chat-surfaceSecondary/95 backdrop-blur-md border border-chat-border text-chat-textPrimary text-xs font-semibold px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 animate-bounce-short pointer-events-none">
            <Sparkles className="w-3.5 h-3.5 text-brand-500" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Sticky Header with Safe-Area Clearance */}
        <div className="px-5 pt-8 pb-3.5 sm:py-4 border-b border-chat-divider flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            {currentView !== 'main' ? (
              <button
                onClick={() => setCurrentView('main')}
                className="p-1.5 -ml-1.5 rounded-full hover:bg-chat-surfaceSecondary text-chat-textSecondary hover:text-chat-textPrimary transition-colors active:scale-95"
                title="Go back"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            ) : (
              <div className="w-9 h-9 rounded-2xl bg-emerald-500/15 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                <Shield className="w-5 h-5" />
              </div>
            )}
            <div>
              <h2 className="text-base font-bold text-chat-textPrimary tracking-tight">
                {currentView === 'main' && 'Privacy & Security'}
                {currentView === 'lastSeen' && 'Last Seen & Online'}
                {currentView === 'storyPrivacy' && 'Story Privacy'}
                {currentView === 'messageRequests' && 'Message Requests'}
                {currentView === 'groupInvites' && 'Group Invites'}
                {currentView === 'sessions' && 'Active Sessions'}
                {currentView === 'securityDetails' && 'Connection Security'}
              </h2>
              <p className="text-[11px] text-chat-textSecondary">
                {currentView === 'main' && 'Manage visibility, messaging & logged-in devices'}
                {currentView === 'lastSeen' && 'Who can see when you were last active'}
                {currentView === 'storyPrivacy' && 'Control audience for your 24h stories'}
                {currentView === 'messageRequests' && 'Who can initiate new 1-on-1 chats'}
                {currentView === 'groupInvites' && 'Who can add you to group conversations'}
                {currentView === 'sessions' && 'Devices currently logged into your account'}
                {currentView === 'securityDetails' && 'Transport encryption & token validation'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-chat-surfaceSecondary text-chat-textMuted hover:text-chat-textPrimary transition-colors active:scale-95"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body / Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {loading ? (
            /* Skeleton Loading State */
            <div className="space-y-4 py-2">
              <div className="h-4 w-28 bg-chat-surfaceSecondary rounded animate-pulse" />
              <div className="space-y-2.5">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className="h-16 rounded-2xl bg-chat-surfaceSecondary/60 border border-chat-border animate-pulse"
                  />
                ))}
              </div>
              <div className="h-4 w-32 bg-chat-surfaceSecondary rounded animate-pulse pt-2" />
              <div className="space-y-2.5">
                {[1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-16 rounded-2xl bg-chat-surfaceSecondary/60 border border-chat-border animate-pulse"
                  />
                ))}
              </div>
            </div>
          ) : currentView === 'main' ? (
            /* ================= MAIN VIEW ================= */
            <>
              {/* SECTION 1: VISIBILITY & PRESENCE */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 px-1 text-xs font-bold text-chat-textSecondary uppercase tracking-wider">
                  <Eye className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Visibility & Presence</span>
                </div>

                <div className="space-y-2 rounded-2xl bg-chat-surfaceSecondary/40 border border-chat-border p-2">
                  {/* Read Receipts */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl hover:bg-chat-surfaceSecondary/70 transition-colors">
                    <div className="pr-3">
                      <div className="text-sm font-semibold text-chat-textPrimary flex items-center gap-1.5">
                        <span>Read Receipts</span>
                        {savingKey === 'readReceipts' && (
                          <RefreshCw className="w-3 h-3 animate-spin text-brand-500" />
                        )}
                      </div>
                      <div className="text-xs text-chat-textSecondary leading-snug pt-0.5">
                        Send and receive double checkmarks for read messages
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggle('readReceipts')}
                      className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${
                        privacy.readReceipts ? 'bg-brand-500' : 'bg-chat-surfaceTertiary'
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${
                          privacy.readReceipts ? 'left-7' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Online Presence */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl hover:bg-chat-surfaceSecondary/70 transition-colors">
                    <div className="pr-3">
                      <div className="text-sm font-semibold text-chat-textPrimary flex items-center gap-1.5">
                        <span>Online Presence</span>
                        {savingKey === 'onlinePresence' && (
                          <RefreshCw className="w-3 h-3 animate-spin text-brand-500" />
                        )}
                      </div>
                      <div className="text-xs text-chat-textSecondary leading-snug pt-0.5">
                        Show a green active dot when you are currently connected
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggle('onlinePresence')}
                      className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${
                        privacy.onlinePresence ? 'bg-brand-500' : 'bg-chat-surfaceTertiary'
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${
                          privacy.onlinePresence ? 'left-7' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Last Seen Selector */}
                  <div
                    onClick={() => setCurrentView('lastSeen')}
                    className="flex items-center justify-between p-2.5 rounded-xl hover:bg-chat-surfaceSecondary cursor-pointer transition-colors"
                  >
                    <div className="pr-3">
                      <div className="text-sm font-semibold text-chat-textPrimary">Last Seen</div>
                      <div className="text-xs text-chat-textSecondary leading-snug pt-0.5">
                        Who can see your last activity timestamp
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-500 flex-shrink-0">
                      <span>{formatLastSeenLabel(privacy.lastSeen)}</span>
                      <ChevronRight className="w-4 h-4 text-chat-textMuted" />
                    </div>
                  </div>

                  {/* Typing Indicators */}
                  <div className="flex items-center justify-between p-2.5 rounded-xl hover:bg-chat-surfaceSecondary/70 transition-colors">
                    <div className="pr-3">
                      <div className="text-sm font-semibold text-chat-textPrimary flex items-center gap-1.5">
                        <span>Typing Indicators</span>
                        {savingKey === 'typingIndicators' && (
                          <RefreshCw className="w-3 h-3 animate-spin text-brand-500" />
                        )}
                      </div>
                      <div className="text-xs text-chat-textSecondary leading-snug pt-0.5">
                        Broadcast live typing indicators in chat conversations
                      </div>
                    </div>
                    <button
                      onClick={() => handleToggle('typingIndicators')}
                      className={`w-12 h-6 rounded-full transition-colors relative flex-shrink-0 ${
                        privacy.typingIndicators ? 'bg-brand-500' : 'bg-chat-surfaceTertiary'
                      }`}
                    >
                      <span
                        className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${
                          privacy.typingIndicators ? 'left-7' : 'left-1'
                        }`}
                      />
                    </button>
                  </div>

                  {/* Story Visibility */}
                  <div
                    onClick={() => setCurrentView('storyPrivacy')}
                    className="flex items-center justify-between p-2.5 rounded-xl hover:bg-chat-surfaceSecondary cursor-pointer transition-colors"
                  >
                    <div className="pr-3">
                      <div className="text-sm font-semibold text-chat-textPrimary">Story Audience</div>
                      <div className="text-xs text-chat-textSecondary leading-snug pt-0.5">
                        Default privacy audience for your 24h stories
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-500 flex-shrink-0">
                      <span>{formatStoryVisibilityLabel(privacy.storyVisibility)}</span>
                      <ChevronRight className="w-4 h-4 text-chat-textMuted" />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 2: MESSAGING & INTERACTIONS */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 px-1 text-xs font-bold text-chat-textSecondary uppercase tracking-wider">
                  <MessageSquare className="w-3.5 h-3.5 text-sky-500" />
                  <span>Messaging & Interactions</span>
                </div>

                <div className="space-y-2 rounded-2xl bg-chat-surfaceSecondary/40 border border-chat-border p-2">
                  {/* Message Requests */}
                  <div
                    onClick={() => setCurrentView('messageRequests')}
                    className="flex items-center justify-between p-2.5 rounded-xl hover:bg-chat-surfaceSecondary cursor-pointer transition-colors"
                  >
                    <div className="pr-3">
                      <div className="text-sm font-semibold text-chat-textPrimary">Message Requests</div>
                      <div className="text-xs text-chat-textSecondary leading-snug pt-0.5">
                        Control who can initiate direct conversations with you
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-500 flex-shrink-0">
                      <span>{formatMessageRequestsLabel(privacy.messageRequests)}</span>
                      <ChevronRight className="w-4 h-4 text-chat-textMuted" />
                    </div>
                  </div>

                  {/* Group Invites */}
                  <div
                    onClick={() => setCurrentView('groupInvites')}
                    className="flex items-center justify-between p-2.5 rounded-xl hover:bg-chat-surfaceSecondary cursor-pointer transition-colors"
                  >
                    <div className="pr-3">
                      <div className="text-sm font-semibold text-chat-textPrimary">Group Invites</div>
                      <div className="text-xs text-chat-textSecondary leading-snug pt-0.5">
                        Who can add you to group chats without prior approval
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-brand-500 flex-shrink-0">
                      <span>{formatGroupInvitesLabel(privacy.groupInvites)}</span>
                      <ChevronRight className="w-4 h-4 text-chat-textMuted" />
                    </div>
                  </div>

                  {/* Blocked Accounts */}
                  <div
                    onClick={() => {
                      onClose();
                      navigate('/settings/blocked');
                    }}
                    className="flex items-center justify-between p-2.5 rounded-xl hover:bg-chat-surfaceSecondary cursor-pointer transition-colors"
                  >
                    <div className="flex items-center gap-2.5 pr-3">
                      <ShieldAlert className="w-4 h-4 text-rose-500 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-semibold text-chat-textPrimary">Blocked Accounts</div>
                        <div className="text-xs text-chat-textSecondary leading-snug pt-0.5">
                          Manage and unblock restricted contacts
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-chat-textSecondary flex-shrink-0">
                      <span className="px-2 py-0.5 rounded-full bg-chat-surfaceTertiary text-[11px] font-mono">
                        {blockedCount}
                      </span>
                      <ChevronRight className="w-4 h-4 text-chat-textMuted" />
                    </div>
                  </div>
                </div>
              </div>

              {/* SECTION 3: SECURITY & SESSIONS */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 px-1 text-xs font-bold text-chat-textSecondary uppercase tracking-wider">
                  <Lock className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Security & Logged-in Devices</span>
                </div>

                {/* Connection Security Status Banner */}
                <div
                  onClick={() => setCurrentView('securityDetails')}
                  className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/15 cursor-pointer transition-all space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                      <ShieldCheck className="w-4 h-4" />
                      <span>TLS 1.3 Transport Encrypted</span>
                    </div>
                    <div className="flex items-center gap-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                      <span>View Details</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </div>
                  </div>
                  <p className="text-[11px] text-chat-textSecondary leading-relaxed">
                    WebSocket stream (WSS) and REST API (HTTPS) are secured using industry-standard TLS encryption with authenticated JWT Bearer sessions.
                  </p>
                </div>

                {/* Active Sessions List Card */}
                <div
                  onClick={() => setCurrentView('sessions')}
                  className="flex items-center justify-between p-3 rounded-2xl bg-chat-surfaceSecondary/40 border border-chat-border hover:bg-chat-surfaceSecondary cursor-pointer transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-indigo-500/15 flex items-center justify-center text-indigo-600 dark:text-indigo-400 flex-shrink-0">
                      <Smartphone className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-chat-textPrimary flex items-center gap-2">
                        <span>Your Devices</span>
                        <span className="px-2 py-0.2 bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 text-[10px] rounded-full font-bold">
                          {sessions.length} active
                        </span>
                      </div>
                      <div className="text-xs text-chat-textSecondary">
                        {currentSession ? `This device: ${currentSession.deviceName}` : 'Manage active logins'}
                      </div>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-chat-textMuted" />
                </div>
              </div>
            </>
          ) : currentView === 'lastSeen' ? (
            /* ================= SUB-VIEW: LAST SEEN ================= */
            <div className="space-y-4">
              <p className="text-xs text-chat-textSecondary leading-relaxed">
                Choose who can view your Last Seen timestamp and active connection status. If you select Nobody, you won't see other people's Last Seen either.
              </p>

              <div className="space-y-2">
                {(['everyone', 'connections', 'nobody'] as const).map((opt) => {
                  const isSelected = privacy.lastSeen === opt;
                  return (
                    <div
                      key={opt}
                      onClick={() => handleSelectOption('lastSeen', opt, formatLastSeenLabel(opt))}
                      className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
                        isSelected
                          ? 'bg-brand-soft border-brand-500 shadow-sm'
                          : 'bg-chat-surfaceSecondary/50 border-chat-border hover:bg-chat-surfaceSecondary'
                      }`}
                    >
                      <div>
                        <div className="text-sm font-bold text-chat-textPrimary">
                          {formatLastSeenLabel(opt)}
                        </div>
                        <div className="text-xs text-chat-textSecondary pt-0.5">
                          {opt === 'everyone' && 'Anyone on Kotha Hobe can see when you were last online'}
                          {opt === 'connections' && 'Only users in your mutual chats can view your last active time'}
                          {opt === 'nobody' && 'Nobody can see your last seen status (private mode)'}
                        </div>
                      </div>
                      {isSelected && (
                        <div className="w-6 h-6 rounded-full bg-brand-500 text-white flex items-center justify-center flex-shrink-0">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : currentView === 'storyPrivacy' ? (
            /* ================= SUB-VIEW: STORY PRIVACY ================= */
            <div className="space-y-4">
              <p className="text-xs text-chat-textSecondary leading-relaxed">
                Set default visibility for stories you publish. You can still customize visibility per story slide when posting.
              </p>

              <div className="space-y-2">
                {(['connections', 'everyone', 'close_friends'] as const).map((opt) => {
                  const isSelected = privacy.storyVisibility === opt;
                  return (
                    <div
                      key={opt}
                      onClick={() =>
                        handleSelectOption('storyVisibility', opt, formatStoryVisibilityLabel(opt))
                      }
                      className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
                        isSelected
                          ? 'bg-brand-soft border-brand-500 shadow-sm'
                          : 'bg-chat-surfaceSecondary/50 border-chat-border hover:bg-chat-surfaceSecondary'
                      }`}
                    >
                      <div>
                        <div className="text-sm font-bold text-chat-textPrimary">
                          {formatStoryVisibilityLabel(opt)}
                        </div>
                        <div className="text-xs text-chat-textSecondary pt-0.5">
                          {opt === 'connections' && 'Visible to contacts and people you have chatted with'}
                          {opt === 'everyone' && 'Visible to all users on Kotha Hobe discovery'}
                          {opt === 'close_friends' && 'Only visible to your starred close connections'}
                        </div>
                      </div>
                      {isSelected && (
                        <div className="w-6 h-6 rounded-full bg-brand-500 text-white flex items-center justify-center flex-shrink-0">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : currentView === 'messageRequests' ? (
            /* ================= SUB-VIEW: MESSAGE REQUESTS ================= */
            <div className="space-y-4">
              <p className="text-xs text-chat-textSecondary leading-relaxed">
                Filter who can start a direct conversation with you without a prior invitation.
              </p>

              <div className="space-y-2">
                {(['everyone', 'connections'] as const).map((opt) => {
                  const isSelected = privacy.messageRequests === opt;
                  return (
                    <div
                      key={opt}
                      onClick={() =>
                        handleSelectOption('messageRequests', opt, formatMessageRequestsLabel(opt))
                      }
                      className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
                        isSelected
                          ? 'bg-brand-soft border-brand-500 shadow-sm'
                          : 'bg-chat-surfaceSecondary/50 border-chat-border hover:bg-chat-surfaceSecondary'
                      }`}
                    >
                      <div>
                        <div className="text-sm font-bold text-chat-textPrimary">
                          {formatMessageRequestsLabel(opt)}
                        </div>
                        <div className="text-xs text-chat-textSecondary pt-0.5">
                          {opt === 'everyone' && 'Anyone can send you direct messages'}
                          {opt === 'connections' && 'Only mutual contacts can message you directly'}
                        </div>
                      </div>
                      {isSelected && (
                        <div className="w-6 h-6 rounded-full bg-brand-500 text-white flex items-center justify-center flex-shrink-0">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : currentView === 'groupInvites' ? (
            /* ================= SUB-VIEW: GROUP INVITES ================= */
            <div className="space-y-4">
              <p className="text-xs text-chat-textSecondary leading-relaxed">
                Control who has permission to add your account directly to group chats.
              </p>

              <div className="space-y-2">
                {(['everyone', 'connections'] as const).map((opt) => {
                  const isSelected = privacy.groupInvites === opt;
                  return (
                    <div
                      key={opt}
                      onClick={() =>
                        handleSelectOption('groupInvites', opt, formatGroupInvitesLabel(opt))
                      }
                      className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-center justify-between ${
                        isSelected
                          ? 'bg-brand-soft border-brand-500 shadow-sm'
                          : 'bg-chat-surfaceSecondary/50 border-chat-border hover:bg-chat-surfaceSecondary'
                      }`}
                    >
                      <div>
                        <div className="text-sm font-bold text-chat-textPrimary">
                          {formatGroupInvitesLabel(opt)}
                        </div>
                        <div className="text-xs text-chat-textSecondary pt-0.5">
                          {opt === 'everyone' && 'Any group admin can add you directly to groups'}
                          {opt === 'connections' && 'Only your contacts can add you; others must send an invite link'}
                        </div>
                      </div>
                      {isSelected && (
                        <div className="w-6 h-6 rounded-full bg-brand-500 text-white flex items-center justify-center flex-shrink-0">
                          <Check className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : currentView === 'sessions' ? (
            /* ================= SUB-VIEW: SESSIONS ================= */
            <div className="space-y-4">
              <p className="text-xs text-chat-textSecondary leading-relaxed">
                Review all active browser tabs and mobile applications logged into your Kotha Hobe account. If you spot an unrecognized device, sign it out immediately.
              </p>

              {/* Current Device Card */}
              {currentSession && (
                <div className="space-y-2">
                  <div className="text-xs font-bold text-chat-textSecondary uppercase tracking-wider px-1">
                    Current Device
                  </div>
                  <div className="p-3.5 rounded-2xl bg-brand-soft border border-brand-500/30 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-brand-500/20 flex items-center justify-center flex-shrink-0">
                        {formatPlatformIcon(currentSession.platform)}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-chat-textPrimary flex items-center gap-2">
                          <span>{currentSession.deviceName}</span>
                          <span className="px-2 py-0.5 bg-brand-500 text-white text-[10px] rounded-full font-bold">
                            This Device
                          </span>
                        </div>
                        <div className="text-xs text-chat-textSecondary pt-0.5">
                          {currentSession.browser ? `${currentSession.browser} • ` : ''}Active now
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Other Devices Section */}
              <div className="space-y-2.5 pt-2">
                <div className="flex items-center justify-between px-1">
                  <div className="text-xs font-bold text-chat-textSecondary uppercase tracking-wider">
                    Other Active Sessions ({otherSessions.length})
                  </div>
                  {otherSessions.length > 0 && (
                    <button
                      onClick={() => setConfirmRevokeOthers(true)}
                      className="text-xs text-rose-500 font-bold hover:underline"
                    >
                      Sign Out All Others
                    </button>
                  )}
                </div>

                {otherSessions.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-chat-surfaceSecondary/40 border border-chat-border text-center space-y-2">
                    <ShieldCheck className="w-8 h-8 text-emerald-500 mx-auto" />
                    <div className="text-sm font-semibold text-chat-textPrimary">
                      No Other Devices Active
                    </div>
                    <div className="text-xs text-chat-textSecondary">
                      Your account is currently only active on this device.
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {otherSessions.map((sess) => (
                      <div
                        key={sess.sessionId}
                        className="p-3.5 rounded-2xl bg-chat-surfaceSecondary/50 border border-chat-border flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-xl bg-chat-surfaceTertiary flex items-center justify-center flex-shrink-0">
                            {formatPlatformIcon(sess.platform)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-chat-textPrimary truncate">
                              {sess.deviceName}
                            </div>
                            <div className="text-xs text-chat-textSecondary truncate pt-0.5">
                              {sess.browser ? `${sess.browser} • ` : ''}
                              {new Date(sess.lastActiveAt).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </div>
                          </div>
                        </div>

                        <button
                          disabled={revokingSessionId === sess.sessionId}
                          onClick={() => handleRevokeSession(sess.sessionId, sess.deviceName)}
                          className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-rose-500/10 hover:bg-rose-500/20 text-rose-500 border border-rose-500/20 flex items-center gap-1.5 transition-all flex-shrink-0 active:scale-95 disabled:opacity-50"
                        >
                          {revokingSessionId === sess.sessionId ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <LogOut className="w-3.5 h-3.5" />
                          )}
                          <span>Sign Out</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Confirmation Dialog for Revoking Other Sessions */}
              {confirmRevokeOthers && (
                <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
                  <div
                    style={{ backgroundColor: themeConfig.panel }}
                    className="w-full max-w-sm rounded-3xl border border-chat-border p-5 shadow-2xl space-y-4 animate-scale-up"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-rose-500/15 flex items-center justify-center text-rose-500 mx-auto">
                      <AlertTriangle className="w-6 h-6" />
                    </div>
                    <div className="text-center space-y-1">
                      <h3 className="text-base font-bold text-chat-textPrimary">
                        Sign Out Other Devices?
                      </h3>
                      <p className="text-xs text-chat-textSecondary leading-relaxed">
                        This will terminate all active sessions on other phones, laptops, and browser tabs. You will stay signed in on this device.
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 pt-2">
                      <button
                        onClick={() => setConfirmRevokeOthers(false)}
                        className="py-2.5 rounded-xl border border-chat-border text-chat-textPrimary font-semibold text-xs hover:bg-chat-surfaceSecondary transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        disabled={revokingOthers}
                        onClick={handleRevokeAllOthers}
                        className="py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-1.5 shadow-sm"
                      >
                        {revokingOthers && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                        <span>Confirm Sign Out</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ================= SUB-VIEW: SECURITY DETAILS ================= */
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-3">
                <ShieldCheck className="w-8 h-8 text-emerald-500 flex-shrink-0" />
                <div>
                  <div className="text-sm font-bold text-chat-textPrimary">
                    Verified Transport Security
                  </div>
                  <div className="text-xs text-chat-textSecondary">
                    All communication with Kotha Hobe server clusters is encrypted in transit.
                  </div>
                </div>
              </div>

              <div className="space-y-2 rounded-2xl bg-chat-surfaceSecondary/40 border border-chat-border p-3">
                <div className="flex items-center justify-between py-2 border-b border-chat-divider text-xs">
                  <span className="text-chat-textSecondary flex items-center gap-2">
                    <Radio className="w-3.5 h-3.5 text-sky-500" />
                    Protocol
                  </span>
                  <span className="font-mono font-bold text-chat-textPrimary">
                    {securityStatus?.protocol || 'HTTPS / TLS 1.3'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-chat-divider text-xs">
                  <span className="text-chat-textSecondary flex items-center gap-2">
                    <Lock className="w-3.5 h-3.5 text-emerald-500" />
                    Transport Encryption
                  </span>
                  <span className="font-mono font-bold text-chat-textPrimary">
                    {securityStatus?.encryption || 'TLS 1.3 / AES-256-GCM'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-2 border-b border-chat-divider text-xs">
                  <span className="text-chat-textSecondary flex items-center gap-2">
                    <Server className="w-3.5 h-3.5 text-indigo-500" />
                    Real-time Socket
                  </span>
                  <span className="font-mono font-bold text-chat-textPrimary">
                    {securityStatus?.socketTransport || 'WSS (Secure WebSocket)'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-2 text-xs">
                  <span className="text-chat-textSecondary flex items-center gap-2">
                    <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                    Authentication
                  </span>
                  <span className="font-mono font-bold text-chat-textPrimary">
                    {securityStatus?.authMethod || 'JWT Bearer Signature'}
                  </span>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-chat-surfaceSecondary/30 border border-chat-border space-y-1.5">
                <div className="text-xs font-bold text-chat-textPrimary flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-brand-500" />
                  <span>Privacy Protection Principles</span>
                </div>
                <p className="text-[11px] text-chat-textSecondary leading-relaxed">
                  Kotha Hobe does not sell user contact lists or tracking profiles. Session tokens are strictly isolated per device and can be revoked remotely anytime.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer info banner */}
        <div className="px-5 py-3 border-t border-chat-divider bg-chat-surfaceSecondary/30 flex items-center justify-between text-[11px] text-chat-textSecondary flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
            <span>Changes save automatically</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold text-xs shadow-sm transition-all active:scale-95"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
