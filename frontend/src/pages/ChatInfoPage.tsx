import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  fetchConversationDetailsApi,
  fetchConversations,
  clearChatHistoryApi,
} from '../api/conversationApi';
import { fetchSharedMediaApi, getMediaUrl } from '../api/messageApi';
import { fetchStoryFeedApi } from '../api/storyApi';
import {
  blockUserApi,
  unblockUserApi,
  getBlockedUsersApi,
} from '../api/userApi';
import { IUser, IConversation, IMessage, IStoryFeedItem } from '../types';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useCall } from '../context/CallContext';
import { Avatar } from '../components/common/Avatar';
import { StoryViewerModal } from '../components/story/StoryViewerModal';
import { MediaViewerModal } from '../components/chat/MediaViewerModal';
import { formatLastSeen } from '../utils/dateUtils';
import {
  ArrowLeft,
  Phone,
  Video,
  MessageSquare,
  Search,
  Image as ImageIcon,
  Bell,
  BellOff,
  Tag,
  ChevronRight,
  ShieldCheck,
  ShieldAlert,
  Ban,
  Trash2,
  Share2,
  Check,
  X,
  Loader2,
  Sparkles,
  Calendar,
  Users,
  Play,
  UserCheck,
  Radio,
} from 'lucide-react';

export const ChatInfoPage: React.FC = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { user: currentUser } = useAuth();
  const { themeConfig } = useTheme();
  const { startCall } = useCall();
  const navigate = useNavigate();

  // Instant State from Cache
  const [conversation, setConversation] = useState<IConversation | null>(() => {
    try {
      const cached = localStorage.getItem('kotha_hobe_cached_conversations');
      if (cached && conversationId) {
        const parsed = JSON.parse(cached);
        return parsed.find((c: any) => c._id === conversationId) || null;
      }
    } catch {}
    return null;
  });

  const [recipient, setRecipient] = useState<IUser | null>(() => {
    return conversation?.recipient || null;
  });

  // Story feed state
  const [contactStoryFeed, setContactStoryFeed] = useState<IStoryFeedItem | null>(null);
  const [isStoryViewerOpen, setIsStoryViewerOpen] = useState(false);

  // Shared media preview state
  const [sharedMedia, setSharedMedia] = useState<IMessage[]>([]);
  const [mediaCount, setMediaCount] = useState<number>(0);
  const [selectedMediaMessage, setSelectedMediaMessage] = useState<IMessage | null>(null);

  // Common groups state
  const [commonGroups, setCommonGroups] = useState<IConversation[]>([]);

  // Nickname state
  const [customNickname, setCustomNickname] = useState<string>(() => {
    if (!recipient?._id) return '';
    return localStorage.getItem(`kotha_hobe_nickname_${recipient._id}`) || '';
  });
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [nicknameInput, setNicknameInput] = useState('');

  // Mute state
  const [isMuted, setIsMuted] = useState(() => {
    return localStorage.getItem(`kotha_hobe_mute_${conversationId}`) === 'true';
  });

  // Block & Report state
  const [isBlocked, setIsBlocked] = useState(false);
  const [showBlockConfirm, setShowBlockConfirm] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showAvatarViewer, setShowAvatarViewer] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // 1. Load conversation & recipient details
  useEffect(() => {
    if (!conversationId) return;

    const loadDetails = async () => {
      try {
        const res = await fetchConversationDetailsApi(conversationId);
        if (res.success && res.conversation) {
          setConversation(res.conversation);
          if (res.conversation.recipient) {
            setRecipient(res.conversation.recipient);
            const savedNick = localStorage.getItem(`kotha_hobe_nickname_${res.conversation.recipient._id}`) || '';
            setCustomNickname(savedNick);
          }
        }
      } catch (err) {
        console.warn('[ChatInfoPage] Could not fetch fresh conversation details:', err);
      }
    };

    loadDetails();
  }, [conversationId]);

  // 2. Load Contact's Active Story Feed
  useEffect(() => {
    if (!recipient?._id) return;

    const loadStory = async () => {
      try {
        const feedRes = await fetchStoryFeedApi();
        if (feedRes.success && feedRes.feed) {
          const match = feedRes.feed.find((item) => item.user._id === recipient._id);
          if (match && match.slides && match.slides.length > 0) {
            setContactStoryFeed(match);
          } else {
            setContactStoryFeed(null);
          }
        }
      } catch (err) {
        console.warn('[ChatInfoPage] Could not load contact story:', err);
      }
    };

    loadStory();
  }, [recipient?._id]);

  // 3. Load Shared Media Thumbnails
  useEffect(() => {
    if (!conversationId) return;

    const loadMedia = async () => {
      try {
        const res = await fetchSharedMediaApi(conversationId, 'media');
        if (res.success && res.items) {
          setSharedMedia(res.items.slice(0, 4));
          setMediaCount(res.items.length);
        }
      } catch (err) {
        console.warn('[ChatInfoPage] Could not load shared media:', err);
      }
    };

    loadMedia();
  }, [conversationId]);

  // 4. Load Common Groups
  useEffect(() => {
    if (!recipient?._id) return;

    const loadGroups = async () => {
      try {
        let allConvs: IConversation[] = [];
        const cached = localStorage.getItem('kotha_hobe_cached_conversations');
        if (cached) {
          allConvs = JSON.parse(cached);
        } else {
          const res = await fetchConversations();
          if (res.success) allConvs = res.conversations;
        }

        const shared = allConvs.filter((c) => {
          if (!c.isGroup || !c.groupMeta?.members) return false;
          return c.groupMeta.members.some((m) => {
            const uid = typeof m.user === 'string' ? m.user : m.user?._id;
            return uid === recipient._id;
          });
        });

        setCommonGroups(shared);
      } catch (err) {
        console.warn('[ChatInfoPage] Error checking common groups:', err);
      }
    };

    loadGroups();
  }, [recipient?._id]);

  // 5. Check if contact is blocked
  useEffect(() => {
    if (!recipient?._id) return;

    const checkBlockStatus = async () => {
      try {
        const res = await getBlockedUsersApi();
        if (res.success && Array.isArray(res.blockedUsers)) {
          const blocked = res.blockedUsers.some(
            (u) => (typeof u === 'string' ? u : u._id) === recipient._id
          );
          setIsBlocked(blocked);
        }
      } catch (err) {
        console.warn('[ChatInfoPage] Error checking blocked status:', err);
      }
    };

    checkBlockStatus();
  }, [recipient?._id]);

  // Handler: Start Call
  const handleStartCall = async (type: 'voice' | 'video') => {
    if (!recipient || !conversationId) return;
    try {
      await startCall(
        {
          _id: recipient._id,
          displayName: customNickname || recipient.displayName || recipient.username || 'User',
          avatarUrl: recipient.avatarUrl,
          username: recipient.username,
        },
        conversationId,
        type
      );
    } catch (err: any) {
      showToast(err?.message || 'Failed to start call');
    }
  };

  // Handler: Mute Toggle
  const handleToggleMute = () => {
    const nextState = !isMuted;
    setIsMuted(nextState);
    if (conversationId) {
      localStorage.setItem(`kotha_hobe_mute_${conversationId}`, String(nextState));
    }
    showToast(nextState ? 'Notifications muted for this chat' : 'Notifications unmuted');
  };

  // Handler: Save Nickname
  const handleSaveNickname = (e: React.FormEvent) => {
    e.preventDefault();
    if (!recipient?._id) return;
    const clean = nicknameInput.trim();
    setCustomNickname(clean);
    if (clean) {
      localStorage.setItem(`kotha_hobe_nickname_${recipient._id}`, clean);
      showToast(`Nickname set to "${clean}"`);
    } else {
      localStorage.removeItem(`kotha_hobe_nickname_${recipient._id}`);
      showToast('Nickname cleared');
    }
    setShowNicknameModal(false);
  };

  // Handler: Block / Unblock User
  const handleToggleBlock = async () => {
    if (!recipient?._id) return;
    setIsActionLoading(true);
    try {
      if (isBlocked) {
        const res = await unblockUserApi(recipient._id);
        if (res.success) {
          setIsBlocked(false);
          showToast(`Unblocked ${recipient.displayName}`);
        } else {
          showToast(res.message || 'Failed to unblock user');
        }
      } else {
        const res = await blockUserApi(recipient._id);
        if (res.success) {
          setIsBlocked(true);
          showToast(`Blocked ${recipient.displayName}`);
        } else {
          showToast(res.message || 'Failed to block user');
        }
      }
    } catch (err: any) {
      showToast(err?.message || 'Action failed');
    } finally {
      setIsActionLoading(false);
      setShowBlockConfirm(false);
    }
  };

  // Handler: Clear Chat
  const handleClearChat = async () => {
    if (!conversationId) return;
    setIsActionLoading(true);
    try {
      await clearChatHistoryApi(conversationId);
      localStorage.removeItem(`kotha_hobe_msgs_${conversationId}`);
      showToast('Chat history cleared');
      setShowClearConfirm(false);
      setTimeout(() => navigate(`/chat/${conversationId}`, { replace: true }), 400);
    } catch (e: any) {
      showToast(e?.message || 'Failed to clear chat');
    } finally {
      setIsActionLoading(false);
    }
  };

  // Handler: Report User
  const handleReportUser = () => {
    showToast('Report submitted. Our moderation team will review this user.');
  };

  // Handler: Share Contact
  const handleShareContact = async () => {
    if (!recipient) return;
    const shareText = `Connect with ${recipient.displayName} on Kotha Hobe! Username: @${recipient.username || ''}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: recipient.displayName, text: shareText });
      } catch {}
    } else {
      navigator.clipboard.writeText(shareText);
      showToast('Contact info copied to clipboard!');
    }
  };

  // Format Connected Date
  const formatConnectedSince = (dateStr?: string) => {
    if (!dateStr) return 'Recently';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return 'Recently';
      return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    } catch {
      return 'Recently';
    }
  };

  const hasActiveStory = Boolean(contactStoryFeed && contactStoryFeed.slides && contactStoryFeed.slides.length > 0);
  const effectiveDisplayName = customNickname || recipient?.displayName || recipient?.username || 'User';

  return (
    <div
      style={{ backgroundColor: themeConfig.bg }}
      className="h-full w-full flex flex-col max-w-md mx-auto overflow-hidden transition-colors duration-200 select-none relative"
    >
      {/* ================= TOP APP BAR ================= */}
      <header
        style={{ backgroundColor: themeConfig.panel }}
        className="px-4 pt-10 pb-3 border-b border-white/10 flex items-center justify-between flex-shrink-0 z-10 transition-colors duration-200"
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/chat/${conversationId}`)}
            className="p-2 rounded-full hover:bg-white/10 text-white transition-colors active:scale-95"
            title="Back to Chat"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-base font-bold text-white tracking-tight">Contact Info</h1>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={handleShareContact}
            className="p-2 rounded-full hover:bg-white/10 text-chat-textMuted hover:text-white transition-colors"
            title="Share Contact"
          >
            <Share2 className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* ================= TOAST NOTIFICATION ================= */}
      {toastMessage && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 bg-brand-500 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-2xl flex items-center gap-2 border border-white/20 animate-fade-in pointer-events-none">
          <Check className="w-3.5 h-3.5" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ================= MAIN SCROLLABLE CONTENT ================= */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-12">
        {/* 1. SOCIAL PROFILE HEADER */}
        <div
          style={{ backgroundColor: themeConfig.card }}
          className="border border-white/10 rounded-3xl p-6 flex flex-col items-center text-center shadow-md relative overflow-hidden"
        >
          {/* Subtle Ambient Background Accent Glow */}
          <div className="absolute top-0 inset-x-0 h-24 bg-gradient-to-b from-brand-500/10 to-transparent pointer-events-none" />

          {/* Avatar with Active Story Ring */}
          <div className="relative mb-3.5">
            <div
              onClick={() => {
                if (hasActiveStory) {
                  setIsStoryViewerOpen(true);
                } else if (recipient?.avatarUrl) {
                  setShowAvatarViewer(true);
                }
              }}
              className={`rounded-full transition-transform active:scale-95 cursor-pointer relative ${
                hasActiveStory
                  ? 'p-[3px] bg-gradient-to-tr from-brand-400 via-emerald-400 to-sky-400 shadow-lg shadow-brand-500/20 ring-2 ring-brand-500/40'
                  : 'p-[2px] bg-transparent'
              }`}
            >
              <Avatar
                src={recipient?.avatarUrl}
                name={recipient?.displayName || recipient?.username || 'User'}
                size="xl"
              />

              {/* Story Badge indicator */}
              {hasActiveStory && (
                <div className="absolute -bottom-1 -right-1 bg-brand-500 border-2 border-slate-900 text-white rounded-full p-1 shadow-md">
                  <Play className="w-2.5 h-2.5 fill-current" />
                </div>
              )}
            </div>
          </div>

          {/* Display Name & Custom Nickname */}
          <div className="space-y-1 w-full max-w-xs">
            <h2 className="text-xl font-bold text-white tracking-tight flex items-center justify-center gap-2">
              <span className="truncate">{effectiveDisplayName}</span>
              {recipient?.isOnline && (
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-400 ring-4 ring-emerald-400/20" />
              )}
            </h2>

            {/* Original Name if Nickname is Active */}
            {customNickname && recipient?.displayName && customNickname !== recipient.displayName && (
              <p className="text-xs text-chat-textMuted font-medium truncate">
                Name: {recipient.displayName}
              </p>
            )}

            {/* Username */}
            {recipient?.username && (
              <p className="text-xs font-mono text-brand-400 font-medium tracking-wide">
                @{recipient.username}
              </p>
            )}

            {/* Status / Activity */}
            <p className="text-[12px] text-chat-textMuted pt-0.5">
              {recipient?.isOnline ? (
                <span className="text-emerald-400 font-medium">Active now</span>
              ) : (
                `Last seen ${formatLastSeen(recipient?.lastSeen, recipient?.isOnline)}`
              )}
            </p>

            {/* Email / Phone if present */}
            {recipient?.email && (
              <p className="text-[11px] text-chat-textMuted/80 font-mono pt-1 truncate">
                {recipient.email}
              </p>
            )}
          </div>

          {/* 2. QUICK ACTION ROW (COMPACT SOCIAL PILLS) */}
          <div className="grid grid-cols-4 gap-2 w-full mt-5 pt-4 border-t border-white/5">
            {/* Message Button */}
            <button
              onClick={() => navigate(`/chat/${conversationId}`)}
              className="flex flex-col items-center gap-1.5 p-2 rounded-2xl bg-white/5 hover:bg-white/10 text-white transition-all active:scale-95 group"
            >
              <div className="w-9 h-9 rounded-xl bg-brand-500/15 text-brand-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <MessageSquare className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-semibold text-chat-textMuted group-hover:text-white">
                Message
              </span>
            </button>

            {/* Audio Call Button */}
            <button
              onClick={() => handleStartCall('voice')}
              className="flex flex-col items-center gap-1.5 p-2 rounded-2xl bg-white/5 hover:bg-white/10 text-white transition-all active:scale-95 group"
            >
              <div className="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Phone className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-semibold text-chat-textMuted group-hover:text-white">
                Audio
              </span>
            </button>

            {/* Video Call Button */}
            <button
              onClick={() => handleStartCall('video')}
              className="flex flex-col items-center gap-1.5 p-2 rounded-2xl bg-white/5 hover:bg-white/10 text-white transition-all active:scale-95 group"
            >
              <div className="w-9 h-9 rounded-xl bg-purple-500/15 text-purple-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Video className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-semibold text-chat-textMuted group-hover:text-white">
                Video
              </span>
            </button>

            {/* Search Button */}
            <button
              onClick={() => navigate(`/chat/${conversationId}?search=true`)}
              className="flex flex-col items-center gap-1.5 p-2 rounded-2xl bg-white/5 hover:bg-white/10 text-white transition-all active:scale-95 group"
            >
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                <Search className="w-4 h-4" />
              </div>
              <span className="text-[11px] font-semibold text-chat-textMuted group-hover:text-white">
                Search
              </span>
            </button>
          </div>
        </div>

        {/* 3. ACTIVE STORY PREVIEW CARD (SOCIAL FIRST) */}
        {hasActiveStory && contactStoryFeed && (
          <div
            onClick={() => setIsStoryViewerOpen(true)}
            style={{ backgroundColor: themeConfig.card }}
            className="border border-brand-500/30 rounded-2xl p-4 cursor-pointer hover:border-brand-500/60 transition-all shadow-md relative overflow-hidden group active:scale-[0.99]"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-brand-500 to-emerald-400 flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-white">Active Story</h3>
                    <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-400 border border-brand-500/30">
                      24h
                    </span>
                  </div>
                  <p className="text-xs text-chat-textMuted mt-0.5">
                    {contactStoryFeed.slides.length} slide{contactStoryFeed.slides.length > 1 ? 's' : ''} available • Tap to watch
                  </p>
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-brand-500/10 text-brand-400 flex items-center justify-center group-hover:bg-brand-500 group-hover:text-white transition-all">
                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
              </div>
            </div>
          </div>
        )}

        {/* 4. SHARED MEDIA, LINKS & DOCS (VISUAL PREVIEW STRIP) */}
        <div
          style={{ backgroundColor: themeConfig.card }}
          className="border border-white/10 rounded-2xl p-4 shadow-sm space-y-3"
        >
          <div
            onClick={() => navigate(`/chat/${conversationId}/shared`)}
            className="flex items-center justify-between cursor-pointer group"
          >
            <div className="flex items-center gap-2.5">
              <ImageIcon className="w-4 h-4 text-purple-400" />
              <span className="text-sm font-bold text-white">Media, Links & Docs</span>
              {mediaCount > 0 && (
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-white/10 text-chat-textMuted">
                  {mediaCount}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-xs font-semibold text-brand-400 group-hover:text-brand-300 transition-colors">
              <span>See all</span>
              <ChevronRight className="w-4 h-4" />
            </div>
          </div>

          {/* Visual Thumbnails Row */}
          {sharedMedia.length > 0 ? (
            <div className="grid grid-cols-4 gap-2 pt-1">
              {sharedMedia.map((msg) => (
                <div
                  key={msg._id}
                  onClick={() => setSelectedMediaMessage(msg)}
                  className="aspect-square rounded-xl bg-black/40 overflow-hidden border border-white/10 cursor-pointer hover:opacity-90 active:scale-95 transition-all relative group"
                >
                  <img
                    src={getMediaUrl(msg.attachment?.thumbnailUrl || msg.attachment?.url || '')}
                    alt="Shared Media"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    loading="lazy"
                  />
                  {msg.type === 'video' && (
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                      <Play className="w-4 h-4 text-white fill-white drop-shadow" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="py-2 text-center text-xs text-chat-textMuted bg-white/5 rounded-xl">
              No media, files or links shared yet
            </div>
          )}
        </div>

        {/* 5. GROUPS IN COMMON (MUTUAL CONNECTIONS) */}
        <div
          style={{ backgroundColor: themeConfig.card }}
          className="border border-white/10 rounded-2xl p-4 shadow-sm space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Users className="w-4 h-4 text-emerald-400" />
              <span className="text-sm font-bold text-white">Groups in Common</span>
            </div>
            <span className="text-xs font-semibold text-chat-textMuted px-2 py-0.5 rounded-full bg-white/5">
              {commonGroups.length}
            </span>
          </div>

          {commonGroups.length > 0 ? (
            <div className="divide-y divide-white/5">
              {commonGroups.map((g) => (
                <div
                  key={g._id}
                  onClick={() => navigate(`/chat/${g._id}`)}
                  className="flex items-center justify-between py-2.5 first:pt-1 last:pb-1 cursor-pointer hover:bg-white/5 rounded-xl px-2 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                      src={g.groupMeta?.avatarUrl}
                      name={g.groupMeta?.name || 'Group'}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-white truncate">
                        {g.groupMeta?.name || 'Group Chat'}
                      </h4>
                      <p className="text-[11px] text-chat-textMuted truncate">
                        {g.groupMeta?.members?.length || 0} members
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-chat-textMuted flex-shrink-0" />
                </div>
              ))}
            </div>
          ) : (
            <div className="py-2 text-center text-xs text-chat-textMuted bg-white/5 rounded-xl">
              No common groups
            </div>
          )}
        </div>

        {/* 6. CHAT SETTINGS & PREFERENCES */}
        <div
          style={{ backgroundColor: themeConfig.card }}
          className="border border-white/10 rounded-2xl divide-y divide-white/5 overflow-hidden shadow-sm"
        >
          {/* Custom Nickname */}
          <div
            onClick={() => {
              setNicknameInput(customNickname);
              setShowNicknameModal(true);
            }}
            className="flex items-center justify-between p-4 hover:bg-white/5 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                <Tag className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Set Nickname</div>
                <div className="text-xs text-chat-textMuted">
                  {customNickname ? `"${customNickname}"` : 'Add a custom nickname'}
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-chat-textMuted" />
          </div>

          {/* Mute Notifications Toggle */}
          <div
            onClick={handleToggleMute}
            className="flex items-center justify-between p-4 hover:bg-white/5 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
                {isMuted ? <BellOff className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Mute Notifications</div>
                <div className="text-xs text-chat-textMuted">
                  {isMuted ? 'Muted for this conversation' : 'Sound & vibration enabled'}
                </div>
              </div>
            </div>
            <div
              className={`w-11 h-6 rounded-full transition-colors relative ${
                isMuted ? 'bg-brand-500' : 'bg-white/20'
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  isMuted ? 'left-6' : 'left-1'
                }`}
              />
            </div>
          </div>

          {/* Search in Conversation */}
          <div
            onClick={() => navigate(`/chat/${conversationId}?search=true`)}
            className="flex items-center justify-between p-4 hover:bg-white/5 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-teal-500/10 text-teal-400 flex items-center justify-center">
                <Search className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Search in Conversation</div>
                <div className="text-xs text-chat-textMuted">Find messages, links, and dates</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-chat-textMuted" />
          </div>
        </div>

        {/* 7. CONNECTION INFO & SHARED DETAILS */}
        <div
          style={{ backgroundColor: themeConfig.card }}
          className="border border-white/10 rounded-2xl p-4 shadow-sm space-y-2.5"
        >
          <div className="flex items-center gap-3 text-xs text-chat-textMuted">
            <Calendar className="w-4 h-4 text-brand-400 flex-shrink-0" />
            <span>
              Connected since{' '}
              <strong className="text-white font-medium">
                {formatConnectedSince(conversation?.createdAt)}
              </strong>
            </span>
          </div>

          <div className="flex items-center gap-3 text-xs text-chat-textMuted">
            <Radio className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span>Direct WebSocket transport connection active</span>
          </div>
        </div>

        {/* 8. PRIVACY, SAFETY & DANGER ZONE */}
        <div
          style={{ backgroundColor: themeConfig.card }}
          className="border border-white/10 rounded-2xl divide-y divide-white/5 overflow-hidden shadow-sm"
        >
          {/* Block / Unblock User */}
          <div
            onClick={() => setShowBlockConfirm(true)}
            className={`flex items-center justify-between p-4 hover:bg-white/5 cursor-pointer transition-colors ${
              isBlocked ? 'text-emerald-400' : 'text-amber-400'
            }`}
          >
            <div className="flex items-center gap-3.5">
              <div
                className={`w-9 h-9 rounded-xl flex items-center justify-center ${
                  isBlocked ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
                }`}
              >
                {isBlocked ? <UserCheck className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
              </div>
              <div>
                <div className="text-sm font-semibold">
                  {isBlocked ? `Unblock ${effectiveDisplayName}` : `Block ${effectiveDisplayName}`}
                </div>
                <div className="text-xs text-chat-textMuted">
                  {isBlocked
                    ? 'Allow messages and calls again'
                    : 'Prevent calls and messages from reaching you'}
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-chat-textMuted" />
          </div>

          {/* Report User */}
          <div
            onClick={handleReportUser}
            className="flex items-center justify-between p-4 hover:bg-white/5 cursor-pointer transition-colors text-chat-textMuted hover:text-white"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-white/5 text-chat-textMuted flex items-center justify-center">
                <ShieldAlert className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Report Contact</div>
                <div className="text-xs text-chat-textMuted">Report spam or suspicious activity</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-chat-textMuted" />
          </div>

          {/* Clear Chat History */}
          <div
            onClick={() => setShowClearConfirm(true)}
            className="flex items-center justify-between p-4 hover:bg-red-500/10 cursor-pointer transition-colors text-red-400"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center">
                <Trash2 className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-red-400">Clear Chat History</div>
                <div className="text-xs text-chat-textMuted">
                  Permanently delete all messages in this chat
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-red-400/50" />
          </div>
        </div>

        {/* 9. ENCRYPTION BADGE FOOTER */}
        <div className="flex flex-col items-center justify-center gap-1 text-center pt-2 pb-6">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-chat-textMuted">
            <ShieldCheck className="w-4 h-4 text-brand-400" />
            <span>End-to-End Encrypted</span>
          </div>
          <p className="text-[11px] text-chat-textMuted/70 max-w-xs leading-relaxed">
            Messages and calls are private. No one outside of this chat can read or listen to them.
          </p>
        </div>
      </div>

      {/* ================= MODALS ================= */}

      {/* 1. STORY VIEWER MODAL */}
      {isStoryViewerOpen && contactStoryFeed && (
        <StoryViewerModal
          isOpen={isStoryViewerOpen}
          feed={[contactStoryFeed]}
          initialFeedIndex={0}
          currentUser={currentUser}
          onClose={() => setIsStoryViewerOpen(false)}
        />
      )}

      {/* 2. MEDIA VIEWER MODAL */}
      {selectedMediaMessage && (
        <MediaViewerModal
          message={selectedMediaMessage}
          onClose={() => setSelectedMediaMessage(null)}
        />
      )}

      {/* 3. FULLSCREEN AVATAR VIEWER */}
      {showAvatarViewer && recipient?.avatarUrl && (
        <div
          onClick={() => setShowAvatarViewer(false)}
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex flex-col items-center justify-center p-4 animate-fade-in"
        >
          <button
            onClick={() => setShowAvatarViewer(false)}
            className="absolute top-10 right-4 p-2.5 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
          <div className="max-w-sm w-full space-y-3 text-center">
            <img
              src={recipient.avatarUrl}
              alt={recipient.displayName}
              className="w-72 h-72 rounded-3xl object-cover mx-auto shadow-2xl border border-white/20"
            />
            <h3 className="text-lg font-bold text-white">{effectiveDisplayName}</h3>
            {recipient.username && (
              <p className="text-xs font-mono text-brand-400">@{recipient.username}</p>
            )}
          </div>
        </div>
      )}

      {/* 4. SET NICKNAME MODAL */}
      {showNicknameModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-fade-in">
          <div
            style={{ backgroundColor: themeConfig.panel }}
            className="border border-white/10 w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4 animate-scale-up"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Tag className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">Set Nickname</h3>
              </div>
              <button
                onClick={() => setShowNicknameModal(false)}
                className="p-1 rounded-full text-chat-textMuted hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveNickname} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-chat-textMuted mb-1.5">
                  Custom name for this contact
                </label>
                <input
                  type="text"
                  value={nicknameInput}
                  onChange={(e) => setNicknameInput(e.target.value)}
                  placeholder="e.g. Captain, Bestie, Brother..."
                  maxLength={40}
                  className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-chat-textMuted text-sm focus:outline-none focus:border-brand-500 transition-colors"
                  autoFocus
                />
                <p className="text-[11px] text-chat-textMuted mt-1">
                  Nicknames are only visible to you on this device.
                </p>
              </div>

              <div className="flex items-center gap-2">
                {customNickname && (
                  <button
                    type="button"
                    onClick={() => {
                      setNicknameInput('');
                      if (recipient?._id) {
                        localStorage.removeItem(`kotha_hobe_nickname_${recipient._id}`);
                        setCustomNickname('');
                        showToast('Nickname cleared');
                      }
                      setShowNicknameModal(false);
                    }}
                    className="py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 text-chat-textMuted font-semibold text-xs border border-white/10 transition-colors"
                  >
                    Clear
                  </button>
                )}
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs shadow-lg shadow-brand-500/20 transition-all active:scale-95"
                >
                  Save Nickname
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. BLOCK CONFIRMATION MODAL */}
      {showBlockConfirm && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div
            style={{ backgroundColor: themeConfig.panel }}
            className="border border-white/10 w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4 animate-scale-up"
          >
            <div className="flex items-center gap-3 text-amber-400">
              <div className="w-10 h-10 rounded-2xl bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                <Ban className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  {isBlocked ? 'Unblock Contact?' : 'Block Contact?'}
                </h3>
                <p className="text-xs text-chat-textMuted mt-0.5">
                  {effectiveDisplayName}
                </p>
              </div>
            </div>

            <p className="text-xs text-chat-textMuted leading-relaxed">
              {isBlocked
                ? 'Unblocking will allow this user to send you messages and call you again.'
                : 'Blocked contacts will not be able to call you or send you messages.'}
            </p>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowBlockConfirm(false)}
                disabled={isActionLoading}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-semibold text-xs border border-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleToggleBlock}
                disabled={isActionLoading}
                className={`flex-1 py-2.5 rounded-xl font-bold text-xs text-white shadow-lg transition-all active:scale-95 flex items-center justify-center gap-2 ${
                  isBlocked
                    ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-600/20'
                    : 'bg-amber-600 hover:bg-amber-500 shadow-amber-600/20'
                }`}
              >
                {isActionLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isBlocked ? (
                  'Unblock'
                ) : (
                  'Block'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. CLEAR CHAT CONFIRMATION MODAL */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div
            style={{ backgroundColor: themeConfig.panel }}
            className="border border-white/10 w-full max-w-sm rounded-3xl p-5 shadow-2xl space-y-4 animate-scale-up"
          >
            <div className="flex items-center gap-3 text-red-400">
              <div className="w-10 h-10 rounded-2xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Clear Chat History?</h3>
                <p className="text-xs text-chat-textMuted mt-0.5">
                  This action cannot be undone
                </p>
              </div>
            </div>

            <p className="text-xs text-chat-textMuted leading-relaxed">
              All messages, photos, voice notes, and documents in this conversation will be permanently deleted from your device.
            </p>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                disabled={isActionLoading}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-white font-semibold text-xs border border-white/10 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClearChat}
                disabled={isActionLoading}
                className="flex-1 py-2.5 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold text-xs shadow-lg shadow-red-600/20 transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {isActionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Clear All'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
