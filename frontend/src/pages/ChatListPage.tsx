import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchConversations, deleteConversationApi } from '../api/conversationApi';
import { leaveGroupApi } from '../api/groupApi';
import { blockUserApi } from '../api/userApi';
import { IConversation } from '../types';
import { useSocket } from '../context/SocketContext';
import { Avatar } from '../components/common/Avatar';
import { ConversationSkeleton } from '../components/common/Skeleton';
import { formatChatListDate } from '../utils/dateUtils';
import { useTheme } from '../context/ThemeContext';
import { CreateGroupModal } from '../components/chat/CreateGroupModal';
import { GroupInviteCard } from '../components/chat/GroupInviteCard';
import {
  Search,
  UserPlus,
  Users,
  MessageSquare,
  Check,
  CheckCheck,
  WifiOff,
  MoreVertical,
  Trash2,
  Ban,
  X,
  Info,
  LogOut,
} from 'lucide-react';

export const ChatListPage: React.FC = () => {
  const { themeConfig } = useTheme();
  // ⚡ Instant Render: Initialize immediately from cached conversations
  const [conversations, setConversations] = useState<IConversation[]>(() => {
    try {
      const cached = localStorage.getItem('kotha_hobe_cached_conversations');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState<boolean>(() => {
    return !localStorage.getItem('kotha_hobe_cached_conversations');
  });

  // Action Menu State (Block / Delete Chat / Leave Group)
  const [selectedConvForAction, setSelectedConvForAction] = useState<IConversation | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);

  const showActionToast = (msg: string) => {
    setActionToast(msg);
    setTimeout(() => setActionToast(null), 3000);
  };

  const { socket, isConnected, isReconnecting, reconnectNow } = useSocket();
  const navigate = useNavigate();

  const loadConversations = async (silent = false) => {
    if (!silent && !localStorage.getItem('kotha_hobe_cached_conversations')) {
      setLoading(true);
    }
    try {
      const res = await fetchConversations();
      if (res.success && res.conversations) {
        setConversations(res.conversations);
        localStorage.setItem('kotha_hobe_cached_conversations', JSON.stringify(res.conversations));
      }
    } catch (err) {
      console.warn('[ChatList] Failed to fetch:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, []);

  // Listen for real-time conversation updates
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (data: any) => {
      setConversations((prev) => {
        const index = prev.findIndex((c) => c._id === data.conversationId);
        if (index > -1) {
          const updated = [...prev];
          updated[index] = {
            ...updated[index],
            lastMessage: {
              text: data.text,
              senderId: data.senderId,
              createdAt: data.createdAt,
              status: data.status,
            },
            lastMessageAt: data.createdAt,
            unreadCount: (updated[index].unreadCount || 0) + 1,
          };
          const sorted = updated.sort(
            (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
          );
          localStorage.setItem('kotha_hobe_cached_conversations', JSON.stringify(sorted));
          return sorted;
        } else {
          loadConversations(true);
          return prev;
        }
      });
    };

    const handleMessageRead = (data: { conversationId: string; readBy: string; readAt?: string }) => {
      setConversations((prev) => {
        const index = prev.findIndex((c) => c._id === data.conversationId);
        if (index > -1) {
          const updated = [...prev];
          if (updated[index].lastMessage) {
            updated[index] = {
              ...updated[index],
              lastMessage: {
                ...updated[index].lastMessage!,
                status: 'read',
              },
            };
          }
          localStorage.setItem('kotha_hobe_cached_conversations', JSON.stringify(updated));
          return updated;
        }
        return prev;
      });
    };

    const handleMessageDelivered = (data: { conversationId: string; deliveredAt?: string }) => {
      setConversations((prev) => {
        const index = prev.findIndex((c) => c._id === data.conversationId);
        if (index > -1) {
          const updated = [...prev];
          if (updated[index].lastMessage && updated[index].lastMessage!.status !== 'read') {
            updated[index] = {
              ...updated[index],
              lastMessage: {
                ...updated[index].lastMessage!,
                status: 'delivered',
              },
            };
          }
          localStorage.setItem('kotha_hobe_cached_conversations', JSON.stringify(updated));
          return updated;
        }
        return prev;
      });
    };

    socket.on('message:new', handleNewMessage);
    socket.on('message:read', handleMessageRead);
    socket.on('message:delivered', handleMessageDelivered);
    socket.on('conversation:update', () => loadConversations(true));

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('message:read', handleMessageRead);
      socket.off('message:delivered', handleMessageDelivered);
      socket.off('conversation:update');
    };
  }, [socket]);

  const filteredConversations = conversations.filter((c) => {
    if (c.isGroup) {
      const gName = c.groupMeta?.name || 'Group Chat';
      return gName.toLowerCase().includes(searchQuery.toLowerCase());
    }
    const name = c.recipient?.displayName || c.recipient?.username || '';
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  // Separate pending group invitations from normal conversations
  const pendingInvites = filteredConversations.filter(
    (c) => c.isGroup && c.myMembershipStatus === 'pending'
  );
  const activeConversations = filteredConversations.filter(
    (c) => !c.isGroup || c.myMembershipStatus !== 'pending'
  );

  const renderStatusCheck = (status?: string) => {
    if (!status) return null;
    if (status === 'sending') return <span className="text-[10px] text-chat-textMuted mr-1">🕒</span>;
    if (status === 'sent') return <Check className="w-3.5 h-3.5 text-chat-textMuted inline mr-1" />;
    if (status === 'delivered') return <CheckCheck className="w-3.5 h-3.5 text-chat-textMuted inline mr-1" />;
    if (status === 'read') return <CheckCheck className="w-3.5 h-3.5 text-sky-400 inline mr-1" />;
    return null;
  };

  // 1. Handle Delete Chat
  const handleDeleteChat = async (conv: IConversation) => {
    const name = conv.isGroup
      ? conv.groupMeta?.name || 'this group'
      : conv.recipient?.displayName || conv.recipient?.username || 'this user';

    if (confirm(`Delete chat history with ${name}? All previous messages will be removed.`)) {
      try {
        await deleteConversationApi(conv._id);
        const updated = conversations.filter((c) => c._id !== conv._id);
        setConversations(updated);
        localStorage.setItem('kotha_hobe_cached_conversations', JSON.stringify(updated));
        localStorage.removeItem(`kotha_hobe_msgs_${conv._id}`);
        setSelectedConvForAction(null);
        showActionToast(`Chat history deleted`);
      } catch (err: any) {
        showActionToast(err?.message || 'Failed to delete chat');
      }
    }
  };

  // 2. Handle Block User
  const handleBlockUser = async (conv: IConversation) => {
    if (!conv.recipient?._id) return;
    const name = conv.recipient?.displayName || conv.recipient?.username || 'this user';
    if (confirm(`Block ${name}? They will be removed from your chats and cannot find you in search.`)) {
      try {
        await blockUserApi(conv.recipient._id);
        const updated = conversations.filter((c) => c._id !== conv._id);
        setConversations(updated);
        localStorage.setItem('kotha_hobe_cached_conversations', JSON.stringify(updated));
        localStorage.removeItem(`kotha_hobe_msgs_${conv._id}`);
        setSelectedConvForAction(null);
        showActionToast(`${name} has been blocked`);
      } catch (err: any) {
        showActionToast(err?.message || 'Failed to block user');
      }
    }
  };

  // 3. Handle Leave Group
  const handleLeaveGroup = async (conv: IConversation) => {
    const groupName = conv.groupMeta?.name || 'this group';
    if (confirm(`Leave group "${groupName}"? You will no longer receive messages.`)) {
      try {
        await leaveGroupApi(conv._id);
        const updated = conversations.filter((c) => c._id !== conv._id);
        setConversations(updated);
        localStorage.setItem('kotha_hobe_cached_conversations', JSON.stringify(updated));
        localStorage.removeItem(`kotha_hobe_msgs_${conv._id}`);
        setSelectedConvForAction(null);
        showActionToast(`You left "${groupName}"`);
      } catch (err: any) {
        showActionToast(err?.message || 'Failed to leave group');
      }
    }
  };

  return (
    <div
      style={{ backgroundColor: themeConfig.bg }}
      className="h-full w-full flex flex-col max-w-md mx-auto relative overflow-hidden transition-colors duration-200"
    >
      {/* Toast Notification */}
      {actionToast && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-black/80 backdrop-blur-md border border-white/20 text-white text-xs px-4 py-2 rounded-full shadow-2xl animate-fade-in pointer-events-none">
          {actionToast}
        </div>
      )}

      {/* Top Header */}
      <header
        style={{ backgroundColor: themeConfig.panel }}
        className="px-4 pt-10 pb-3 border-b border-white/10 flex items-center justify-between flex-shrink-0 transition-colors duration-200"
      >
        {/* Left: Chats Title */}
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-white tracking-tight">Chats</h1>
        </div>

        {/* Center: App Bengali Brand Name */}
        <div className="flex items-center justify-center">
          <span className="text-2xl font-bold text-white tracking-wide font-sans select-none drop-shadow-sm flex items-center gap-1.5">
            💬 কথা হবে
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {!isConnected && (
            <button
              type="button"
              onClick={() => {
                showActionToast('Reconnecting to server...');
                reconnectNow();
                loadConversations(true);
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/15 hover:bg-amber-500/25 active:scale-95 border border-amber-500/30 text-amber-400 text-xs font-medium transition-all"
              title="Tap to reconnect immediately"
            >
              <WifiOff className={`w-3.5 h-3.5 ${isReconnecting ? 'animate-pulse' : ''}`} />
              <span>{isReconnecting ? 'Connecting...' : 'Offline'}</span>
            </button>
          )}

          {/* New Group Button */}
          <button
            onClick={() => setShowCreateGroupModal(true)}
            className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 active:scale-95 border border-emerald-500/30 text-emerald-400 text-xs font-semibold transition-all"
            title="Create New Group"
          >
            <Users className="w-3.5 h-3.5" />
            <span>+ Group</span>
          </button>

          <button
            onClick={() => navigate('/search')}
            className="p-2 rounded-full hover:bg-white/10 text-chat-textMuted hover:text-white transition-colors"
            title="Find User"
          >
            <Search className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Search Input Bar */}
      <div className="p-3 bg-chat-panel/50 border-b border-white/5 flex-shrink-0">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search chats or groups..."
            className="w-full bg-chat-input border border-white/5 text-white placeholder:text-chat-textMuted/60 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-brand-500/50 transition-colors"
          />
          <Search className="w-4 h-4 text-chat-textMuted absolute left-3.5 top-3" />
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto divide-y divide-white/5">
        {/* Pending Group Invites Section */}
        {pendingInvites.length > 0 && (
          <div className="p-3 bg-emerald-950/20 border-b border-emerald-500/20 space-y-2">
            <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider px-1">
              Group Invitations ({pendingInvites.length})
            </p>
            {pendingInvites.map((inv) => (
              <GroupInviteCard
                key={inv._id}
                conversation={inv}
                onAccepted={() => {
                  loadConversations(true);
                  showActionToast('Group invitation accepted!');
                }}
                onDeclined={() => {
                  loadConversations(true);
                  showActionToast('Group invitation declined');
                }}
              />
            ))}
          </div>
        )}

        {loading ? (
          <>
            <ConversationSkeleton />
            <ConversationSkeleton />
            <ConversationSkeleton />
          </>
        ) : activeConversations.length === 0 && pendingInvites.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-chat-card flex items-center justify-center mb-4 text-chat-textMuted">
              <MessageSquare className="w-8 h-8" />
            </div>
            <h3 className="text-base font-semibold text-white mb-1">
              {searchQuery ? 'No matching conversations' : 'No conversations yet'}
            </h3>
            <p className="text-xs text-chat-textMuted mb-6 max-w-xs leading-relaxed">
              {searchQuery
                ? 'Try searching with a different name or group.'
                : 'Find someone or create a group to start chatting.'}
            </p>
            {!searchQuery && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setShowCreateGroupModal(true)}
                  className="bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-sm font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-md shadow-emerald-600/20"
                >
                  <Users className="w-4 h-4" />
                  <span>New Group</span>
                </button>
                <button
                  onClick={() => navigate('/search')}
                  className="bg-brand-500 hover:bg-brand-600 active:scale-95 text-white text-sm font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-md shadow-brand-500/20"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Find Someone</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          activeConversations.map((conv) => {
            const isGroup = conv.isGroup;
            const title = isGroup
              ? conv.groupMeta?.name || 'Group Chat'
              : conv.recipient?.displayName || conv.recipient?.username || 'User';
            const avatarUrl = isGroup ? conv.groupMeta?.avatarUrl : conv.recipient?.avatarUrl;

            return (
              <div
                key={conv._id}
                className="flex items-center gap-3.5 px-4 py-3.5 pressable-card cursor-pointer select-none relative group hardware-accelerated"
              >
                {/* Click to open chat */}
                <div
                  onClick={() => navigate(`/chat/${conv._id}`)}
                  className="flex items-center gap-3.5 flex-1 min-w-0"
                >
                  {isGroup ? (
                    <div className="relative flex-shrink-0">
                      <Avatar src={avatarUrl} name={title} size="md" />
                      <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-emerald-600 border-2 border-slate-900 flex items-center justify-center text-white">
                        <Users className="w-3 h-3" />
                      </div>
                    </div>
                  ) : (
                    <Avatar
                      src={avatarUrl}
                      name={title}
                      isOnline={conv.recipient?.isOnline}
                      size="md"
                    />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <h2 className="text-sm font-semibold text-white truncate">{title}</h2>
                        {isGroup && (
                          <span className="text-[10px] text-emerald-400/80 font-medium px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/20 shrink-0">
                            {conv.groupMeta?.members?.length || 1}
                          </span>
                        )}
                      </div>
                      {conv.lastMessageAt && (
                        <span className="text-[11px] text-chat-textMuted flex-shrink-0 ml-2 font-medium">
                          {formatChatListDate(conv.lastMessageAt)}
                        </span>
                      )}
                    </div>

                    <div className="flex justify-between items-center">
                      <p className="text-xs text-chat-textMuted truncate pr-2">
                        {renderStatusCheck(conv.lastMessage?.status)}
                        {conv.lastMessage?.text || (isGroup ? 'Group created' : 'Started conversation')}
                      </p>

                      {(conv.unreadCount ?? 0) > 0 && (
                        <span className="bg-brand-500 text-white font-bold text-[10px] min-w-[20px] h-[20px] px-1.5 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm animate-pulse-subtle">
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 3-Dots Options Action Button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedConvForAction(conv);
                  }}
                  className="p-2 rounded-full text-chat-textMuted hover:text-white hover:bg-white/10 pressable-icon flex-shrink-0"
                  title="Chat Options"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Floating Action Button */}
      <div className="fixed right-5 bottom-20 flex flex-col items-center gap-3 z-20">
        <button
          onClick={() => setShowCreateGroupModal(true)}
          className="w-12 h-12 rounded-full bg-emerald-600 hover:bg-emerald-500 pressable text-white flex items-center justify-center shadow-lg shadow-emerald-600/30 transition-all active:scale-95"
          title="Create Group"
        >
          <Users className="w-5 h-5" />
        </button>
        <button
          onClick={() => navigate('/search')}
          className="w-14 h-14 rounded-full bg-brand-500 hover:bg-brand-600 pressable text-white flex items-center justify-center shadow-xl shadow-brand-500/30 transition-all active:scale-95"
          title="Start New Chat"
        >
          <UserPlus className="w-6 h-6" />
        </button>
      </div>

      {/* Create Group Modal */}
      <CreateGroupModal
        isOpen={showCreateGroupModal}
        onClose={() => setShowCreateGroupModal(false)}
        onGroupCreated={() => {
          loadConversations(true);
        }}
      />

      {/* Action Bottom Sheet Modal */}
      {selectedConvForAction && (
        <div
          onClick={() => setSelectedConvForAction(null)}
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ backgroundColor: themeConfig.card }}
            className="w-full max-w-sm rounded-3xl border border-white/10 overflow-hidden shadow-2xl p-5 space-y-4 animate-slide-up"
          >
            {/* Header info */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-3">
                <Avatar
                  src={
                    selectedConvForAction.isGroup
                      ? selectedConvForAction.groupMeta?.avatarUrl
                      : selectedConvForAction.recipient?.avatarUrl
                  }
                  name={
                    selectedConvForAction.isGroup
                      ? selectedConvForAction.groupMeta?.name || 'Group'
                      : selectedConvForAction.recipient?.displayName || 'User'
                  }
                  size="sm"
                />
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {selectedConvForAction.isGroup
                      ? selectedConvForAction.groupMeta?.name || 'Group Chat'
                      : selectedConvForAction.recipient?.displayName || 'User'}
                  </h3>
                  <p className="text-xs text-chat-textMuted">
                    {selectedConvForAction.isGroup
                      ? `${selectedConvForAction.groupMeta?.members?.length || 1} members`
                      : selectedConvForAction.recipient?.username
                      ? `@${selectedConvForAction.recipient.username}`
                      : ''}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedConvForAction(null)}
                className="p-1.5 rounded-full hover:bg-white/10 text-chat-textMuted hover:text-white transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Action Buttons */}
            <div className="space-y-2 pt-1">
              {/* Group Info (if group) */}
              {selectedConvForAction.isGroup && (
                <button
                  type="button"
                  onClick={() => {
                    navigate(`/group/${selectedConvForAction._id}/info`);
                    setSelectedConvForAction(null);
                  }}
                  className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl bg-white/5 hover:bg-white/10 active:scale-[0.98] text-white text-sm font-semibold transition-all text-left"
                >
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                    <Info className="w-4 h-4" />
                  </div>
                  <div>
                    <div>Group Details & Members</div>
                    <div className="text-[11px] text-chat-textMuted font-normal">
                      Manage nicknames, media, and members
                    </div>
                  </div>
                </button>
              )}

              {/* Delete Chat History */}
              <button
                type="button"
                onClick={() => handleDeleteChat(selectedConvForAction)}
                className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl bg-white/5 hover:bg-white/10 active:scale-[0.98] text-white text-sm font-semibold transition-all text-left"
              >
                <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center text-chat-textMuted">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <div>Clear Messages</div>
                  <div className="text-[11px] text-chat-textMuted font-normal">
                    Remove messages from your device
                  </div>
                </div>
              </button>

              {/* Leave Group (if group) OR Block User (if 1-on-1) */}
              {selectedConvForAction.isGroup ? (
                <button
                  type="button"
                  onClick={() => handleLeaveGroup(selectedConvForAction)}
                  className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl bg-red-500/10 hover:bg-red-500/15 active:scale-[0.98] text-red-500 text-sm font-bold transition-all text-left border border-red-500/20"
                >
                  <div className="w-8 h-8 rounded-xl bg-red-500/20 flex items-center justify-center text-red-400">
                    <LogOut className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-red-500 font-bold">Leave Group</div>
                    <div className="text-[11px] text-red-400/80 font-normal">
                      Exit this group conversation
                    </div>
                  </div>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleBlockUser(selectedConvForAction)}
                  className="w-full flex items-center gap-3.5 px-4 py-3 rounded-2xl bg-red-500/10 hover:bg-red-500/15 active:scale-[0.98] text-red-500 text-sm font-bold transition-all text-left border border-red-500/20"
                >
                  <div className="w-8 h-8 rounded-xl bg-red-500/20 flex items-center justify-center text-red-400">
                    <Ban className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-red-500 font-bold">Block User</div>
                    <div className="text-[11px] text-red-400/80 font-normal">
                      Hide from chats and search completely
                    </div>
                  </div>
                </button>
              )}
            </div>

            {/* Cancel Button */}
            <button
              type="button"
              onClick={() => setSelectedConvForAction(null)}
              className="w-full py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-chat-textMuted hover:text-white transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

