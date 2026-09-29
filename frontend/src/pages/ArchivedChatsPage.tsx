import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchConversations, unarchiveConversationApi } from '../api/conversationApi';
import { IConversation } from '../types';
import { useTheme } from '../context/ThemeContext';
import { Avatar } from '../components/common/Avatar';
import { ConversationSkeleton } from '../components/common/Skeleton';
import { formatChatListDate } from '../utils/dateUtils';
import {
  ArrowLeft,
  Search,
  ArchiveRestore,
  Users,
  Archive,
  MoreVertical,
  X,
  MessageSquare,
} from 'lucide-react';

export const ArchivedChatsPage: React.FC = () => {
  const { themeConfig } = useTheme();
  const navigate = useNavigate();

  const [conversations, setConversations] = useState<IConversation[]>(() => {
    try {
      const cached = localStorage.getItem('kotha_hobe_cached_conversations');
      if (cached) {
        const list: IConversation[] = JSON.parse(cached);
        return list.filter((c) => c.isArchived);
      }
      return [];
    } catch {
      return [];
    }
  });

  const [loading, setLoading] = useState(() => conversations.length === 0);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConvForAction, setSelectedConvForAction] = useState<IConversation | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const loadArchived = async (silent = false) => {
    if (!silent && conversations.length === 0) setLoading(true);
    try {
      const res = await fetchConversations();
      if (res.success && res.conversations) {
        const archivedList = res.conversations.filter((c) => c.isArchived);
        setConversations(archivedList);
        localStorage.setItem('kotha_hobe_cached_conversations', JSON.stringify(res.conversations));
      }
    } catch (err) {
      console.warn('[ArchivedChats] Failed to load:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadArchived();
  }, []);

  const handleUnarchive = async (conv: IConversation) => {
    try {
      const res = await unarchiveConversationApi(conv._id);
      if (res.success) {
        setConversations((prev) => prev.filter((c) => c._id !== conv._id));
        // Update local storage cached conversations
        try {
          const cached = localStorage.getItem('kotha_hobe_cached_conversations');
          if (cached) {
            const list: IConversation[] = JSON.parse(cached);
            const idx = list.findIndex((c) => c._id === conv._id);
            if (idx > -1) {
              list[idx] = { ...list[idx], isArchived: false };
              localStorage.setItem('kotha_hobe_cached_conversations', JSON.stringify(list));
            }
          }
        } catch {}

        setSelectedConvForAction(null);
        showToast('Chat unarchived');
      } else {
        showToast(res.message || 'Failed to unarchive chat');
      }
    } catch {
      showToast('Network error unarchiving chat');
    }
  };

  const filtered = conversations.filter((c) => {
    const title = c.isGroup
      ? c.groupMeta?.name || 'Group Chat'
      : c.recipient?.displayName || c.recipient?.username || 'User';
    return title.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div
      style={{ backgroundColor: themeConfig.bg }}
      className="h-full w-full flex flex-col max-w-md mx-auto relative overflow-hidden transition-colors duration-200"
    >
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-chat-panel/90 backdrop-blur-md border border-chat-border text-chat-textPrimary text-xs px-4 py-2 rounded-full shadow-2xl animate-fade-in pointer-events-none">
          {toastMessage}
        </div>
      )}

      {/* Header */}
      <header
        style={{ backgroundColor: themeConfig.panel }}
        className="px-3 pt-10 pb-3 border-b border-chat-border flex items-center justify-between flex-shrink-0 gap-2"
      >
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate('/chats')}
            className="p-1.5 rounded-full hover:bg-chat-surfaceSecondary text-chat-textMuted hover:text-chat-textPrimary transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <Archive className="w-5 h-5 text-brand-500" />
            <h1 className="text-base font-bold text-chat-textPrimary">Archived Chats</h1>
          </div>
        </div>
      </header>

      {/* Search Bar */}
      <div className="p-3 bg-chat-panel/60 border-b border-chat-divider flex-shrink-0">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search archived chats..."
            className="w-full bg-chat-input border border-chat-border text-chat-textPrimary placeholder:text-chat-textTertiary rounded-xl py-2 pl-9 pr-4 text-xs focus:outline-none focus:border-brand-500 transition-all"
          />
          <Search className="w-4 h-4 text-chat-textMuted absolute left-3 top-2.5" />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto divide-y divide-chat-divider">
        {loading ? (
          <>
            <ConversationSkeleton />
            <ConversationSkeleton />
          </>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center text-chat-textMuted">
            <div className="w-14 h-14 rounded-full bg-chat-surfaceSecondary flex items-center justify-center mb-3">
              <Archive className="w-7 h-7 text-chat-textMuted" />
            </div>
            <h3 className="text-sm font-semibold text-chat-textPrimary mb-1">
              {searchQuery ? 'No matching archived chats' : 'No archived chats'}
            </h3>
            <p className="text-xs text-chat-textSecondary max-w-xs">
              {searchQuery
                ? 'Try searching with a different name.'
                : 'Chats you archive will appear here and won’t show on your main chat list.'}
            </p>
          </div>
        ) : (
          filtered.map((conv) => {
            const isGroup = conv.isGroup;
            const title = isGroup
              ? conv.groupMeta?.name || 'Group Chat'
              : conv.recipient?.displayName || conv.recipient?.username || 'User';
            const avatarUrl = isGroup ? conv.groupMeta?.avatarUrl : conv.recipient?.avatarUrl;

            return (
              <div
                key={conv._id}
                className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-chat-surfaceSecondary/50 active:bg-chat-surfaceSecondary cursor-pointer select-none relative group transition-colors"
              >
                <div
                  onClick={() => navigate(`/chat/${conv._id}`)}
                  className="flex items-center gap-3.5 flex-1 min-w-0"
                >
                  <div className="relative shrink-0">
                    <Avatar src={avatarUrl} name={title} size="md" isOnline={isGroup ? undefined : conv.recipient?.isOnline} />
                    {isGroup && (
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-brand-500 border-2 border-chat-bg flex items-center justify-center text-white">
                        <Users className="w-3 h-3" />
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <h2 className="text-sm font-semibold text-chat-textPrimary truncate">{title}</h2>
                      {conv.lastMessageAt && (
                        <span className="text-[11px] text-chat-textMuted ml-2 font-medium">
                          {formatChatListDate(conv.lastMessageAt)}
                        </span>
                      )}
                    </div>
                    <div className="flex justify-between items-center">
                      <p className="text-xs text-chat-textSecondary truncate pr-2">
                        {conv.lastMessage?.text || 'Archived conversation'}
                      </p>
                      {(conv.unreadCount ?? 0) > 0 && (
                        <span className="bg-brand-500 text-white font-bold text-[10px] min-w-[20px] h-[20px] px-1.5 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedConvForAction(conv);
                  }}
                  className="p-2 rounded-full text-chat-textMuted hover:text-chat-textPrimary hover:bg-chat-surfaceSecondary"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Action Sheet Modal */}
      {selectedConvForAction && (
        <div
          onClick={() => setSelectedConvForAction(null)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-chat-card w-full max-w-sm rounded-3xl border border-chat-border p-5 space-y-4 animate-slide-up"
          >
            <div className="flex items-center justify-between border-b border-chat-divider pb-3">
              <h3 className="text-sm font-bold text-chat-textPrimary">Archived Chat</h3>
              <button
                onClick={() => setSelectedConvForAction(null)}
                className="p-1 rounded-full text-chat-textMuted hover:text-chat-textPrimary"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleUnarchive(selectedConvForAction)}
                className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl bg-chat-surfaceSecondary hover:bg-chat-surfaceTertiary text-chat-textPrimary text-sm font-semibold transition-all text-left"
              >
                <div className="w-8 h-8 rounded-xl bg-brand-500/15 text-brand-500 flex items-center justify-center">
                  <ArchiveRestore className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-chat-textPrimary">Unarchive Chat</div>
                  <div className="text-[11px] text-chat-textMuted font-normal">
                    Move back to main chat list
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
