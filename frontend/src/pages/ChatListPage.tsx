import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  fetchConversations,
  deleteConversationApi,
  archiveConversationApi,
  unarchiveConversationApi,
  getOrCreateConversationApi,
} from '../api/conversationApi';
import { leaveGroupApi, deleteGroupApi } from '../api/groupApi';
import { blockUserApi } from '../api/userApi';
import {
  searchUnifiedApi,
  ISearchPerson,
  ISearchGroup,
  ISearchMessage,
  ISearchArchived,
  UnifiedSearchResponse,
} from '../api/searchApi';
import { IConversation, MessageStatus } from '../types';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { Avatar } from '../components/common/Avatar';
import { ConversationSkeleton } from '../components/common/Skeleton';
import { formatChatListDate, formatMessageTime } from '../utils/dateUtils';
import { formatConversationPreview } from '../utils/messagePreviewFormatter';
import { useTheme } from '../context/ThemeContext';
import { CreateGroupModal } from '../components/chat/CreateGroupModal';
import { GroupInviteCard } from '../components/chat/GroupInviteCard';
import { HighlightMatch } from '../components/common/HighlightMatch';
import { modalStack } from '../utils/modalStack';
import {
  Search,
  UserPlus,
  Users,
  MessageSquare,
  Check,
  CheckCheck,
  MoreVertical,
  Trash2,
  Ban,
  X,
  Info,
  LogOut,
  Archive,
  ArchiveRestore,
  History,
  Clock,
  Sparkles,
  ArrowLeft,
  ChevronRight,
  FileText,
  Image as ImageIcon,
  Mic,
  Video as VideoIcon,
  Globe,
  Radio,
  CornerDownRight,
  AtSign,
} from 'lucide-react';

type SearchCategory = 'all' | 'people' | 'groups' | 'messages' | 'archived';

export const ChatListPage: React.FC = () => {
  const { themeConfig } = useTheme();
  const { user: currentUser } = useAuth();
  const { socket } = useSocket();
  const navigate = useNavigate();

  // ⚡ Instant Render: Initialize immediately from cached conversations, sanitizing any stale unread counts
  const [conversations, setConversations] = useState<IConversation[]>(() => {
    try {
      const cached = localStorage.getItem('kotha_hobe_cached_conversations');
      if (cached) {
        const parsed = JSON.parse(cached);
        const userStr = localStorage.getItem('kotha_hobe_user');
        const storedUser = userStr ? JSON.parse(userStr) : null;
        const currentUserId = storedUser?._id?.toString();
        if (Array.isArray(parsed)) {
          return parsed.map((c: IConversation) => {
            const senderId = c.lastMessage?.senderId?.toString() || (c.lastMessage?.senderId as any)?._id?.toString();
            if (currentUserId && senderId && senderId === currentUserId) {
              return { ...c, unreadCount: 0 };
            }
            return c;
          });
        }
      }
      return [];
    } catch {
      return [];
    }
  });

  const [loading, setLoading] = useState<boolean>(() => {
    return !localStorage.getItem('kotha_hobe_cached_conversations');
  });

  // Action Menu State (Block / Delete Chat / Leave Group)
  const [selectedConvForAction, setSelectedConvForAction] = useState<IConversation | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [showCreateGroupModal, setShowCreateGroupModal] = useState(false);

  // =========================================================================
  // SMART UNIFIED SEARCH STATE
  // =========================================================================
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [searchCategory, setSearchCategory] = useState<SearchCategory>('all');
  const [isSearchingBackend, setIsSearchingBackend] = useState(false);
  const [backendResults, setBackendResults] = useState<UnifiedSearchResponse['results']>({
    people: [],
    groups: [],
    messages: [],
    archived: [],
  });

  // Recent searches saved in local storage (max 8)
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('kotha_hobe_recent_searches');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const searchInputRef = useRef<HTMLInputElement>(null);

  const showActionToast = (msg: string) => {
    setActionToast(msg);
    setTimeout(() => setActionToast(null), 3000);
  };

  const addRecentSearch = useCallback((term: string) => {
    const clean = term.trim();
    if (!clean) return;
    setRecentSearches((prev) => {
      const updated = [clean, ...prev.filter((t) => t.toLowerCase() !== clean.toLowerCase())].slice(0, 8);
      localStorage.setItem('kotha_hobe_recent_searches', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const removeRecentSearch = useCallback((term: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setRecentSearches((prev) => {
      const updated = prev.filter((t) => t !== term);
      localStorage.setItem('kotha_hobe_recent_searches', JSON.stringify(updated));
      return updated;
    });
  }, []);

  const clearRecentSearches = useCallback(() => {
    setRecentSearches([]);
    localStorage.removeItem('kotha_hobe_recent_searches');
  }, []);

  // Hardware Back Button integration for active search mode
  useEffect(() => {
    if (!isSearchActive && !searchQuery) return;
    const unregister = modalStack.register('chat_list_search', () => {
      setSearchQuery('');
      setIsSearchActive(false);
    });
    return () => unregister();
  }, [isSearchActive, searchQuery]);

  // Debounced Backend Search with Request Cancellation
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setBackendResults({
        people: [],
        groups: [],
        messages: [],
        archived: [],
      });
      setIsSearchingBackend(false);
      return;
    }

    setIsSearchingBackend(true);
    const controller = new AbortController();

    const timer = setTimeout(async () => {
      try {
        const res = await searchUnifiedApi(q, searchCategory, 30, controller.signal);
        if (res.success && res.results) {
          setBackendResults(res.results);
        }
      } catch (err: any) {
        if (err?.name !== 'AbortError') {
          console.warn('[Search] Backend search notice:', err?.message || err);
        }
      } finally {
        setIsSearchingBackend(false);
      }
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery, searchCategory]);

  const getLocallyReadTimestamps = (): Record<string, number> => {
    try {
      const stored = sessionStorage.getItem('kotha_hobe_read_timestamps');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  };

  const setLocallyReadTimestamp = (conversationId: string) => {
    try {
      const map = getLocallyReadTimestamps();
      map[conversationId] = Date.now();
      sessionStorage.setItem('kotha_hobe_read_timestamps', JSON.stringify(map));
    } catch {}
  };

  const loadConversations = async (silent = false) => {
    if (!silent && !localStorage.getItem('kotha_hobe_cached_conversations')) {
      setLoading(true);
    }
    try {
      const res = await fetchConversations();
      if (res.success && res.conversations) {
        const localReadMap = getLocallyReadTimestamps();
        const currentUserId = currentUser?._id?.toString();

        // Protect against stale server unread state overwriting newer local read state
        const sanitized: IConversation[] = res.conversations.map((c: IConversation) => {
          const senderId = c.lastMessage?.senderId?.toString() || (c.lastMessage?.senderId as any)?._id?.toString();
          if (currentUserId && senderId && senderId === currentUserId) {
            return {
              ...c,
              unreadCount: 0,
            };
          }

          const localReadTimestamp = localReadMap[c._id];
          if (localReadTimestamp) {
            const msgTime = c.lastMessageAt ? new Date(c.lastMessageAt).getTime() : 0;
            if (localReadTimestamp >= msgTime) {
              return {
                ...c,
                unreadCount: 0,
                lastMessage: c.lastMessage
                  ? { ...c.lastMessage, status: 'read' as MessageStatus }
                  : undefined,
              };
            }
          }
          return c;
        });

        setConversations(sanitized);
        localStorage.setItem('kotha_hobe_cached_conversations', JSON.stringify(sanitized));
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

  // Listen for local conversation_read window events
  useEffect(() => {
    const handleLocalRead = (e: Event) => {
      const customEvent = e as CustomEvent<{ conversationId: string; readAt?: string }>;
      const { conversationId } = customEvent.detail || {};
      if (!conversationId) return;

      setLocallyReadTimestamp(conversationId);

      setConversations((prev) => {
        const next = prev.map((c) => {
          if (c._id === conversationId) {
            return {
              ...c,
              unreadCount: 0,
              lastMessage: c.lastMessage
                ? { ...c.lastMessage, status: 'read' as MessageStatus }
                : undefined,
            };
          }
          return c;
        });
        localStorage.setItem('kotha_hobe_cached_conversations', JSON.stringify(next));
        return next;
      });
    };

    window.addEventListener('kothahobe:conversation_read', handleLocalRead);
    return () => {
      window.removeEventListener('kothahobe:conversation_read', handleLocalRead);
    };
  }, []);

  // Socket event listeners for real-time synchronization
  useEffect(() => {
    if (!socket) return;

    const handleNewMessageData = (data: any) => {
      const msg = data?.message || data;
      if (!msg || !msg.conversationId) return;
      const convId = msg.conversationId;
      const currentUserId = currentUser?._id?.toString();
      const isMine =
        msg.senderId === currentUserId ||
        msg.senderId?._id === currentUserId ||
        (typeof msg.senderId === 'object' && msg.senderId?._id?.toString() === currentUserId);

      setConversations((prev) => {
        const existingIdx = prev.findIndex((c) => c._id === convId);
        if (existingIdx !== -1) {
          const conv = prev[existingIdx];
          const unreadIncrement = isMine ? 0 : 1;
          const previewText = formatConversationPreview(msg, conv.isGroup);

          const updated: IConversation = {
            ...conv,
            lastMessage: {
              text: previewText,
              senderId: msg.senderId,
              createdAt: msg.createdAt,
              status: isMine ? (msg.status || 'sent') : 'delivered',
            },
            lastMessageAt: msg.createdAt,
            unreadCount: isMine ? 0 : (conv.unreadCount || 0) + unreadIncrement,
          };
          const rest = prev.filter((_, idx) => idx !== existingIdx);
          const next = [updated, ...rest];
          localStorage.setItem('kotha_hobe_cached_conversations', JSON.stringify(next));
          return next;
        } else {
          loadConversations(true);
          return prev;
        }
      });
    };

    const handleMessageRead = ({ conversationId }: { conversationId: string }) => {
      if (!conversationId) return;
      setLocallyReadTimestamp(conversationId);
      setConversations((prev) => {
        const next = prev.map((c) => {
          if (c._id === conversationId) {
            return {
              ...c,
              unreadCount: 0,
              lastMessage: c.lastMessage ? { ...c.lastMessage, status: 'read' as MessageStatus } : undefined,
            };
          }
          return c;
        });
        localStorage.setItem('kotha_hobe_cached_conversations', JSON.stringify(next));
        return next;
      });
    };

    const handleMessageDelivered = ({ conversationId }: { conversationId: string }) => {
      if (!conversationId) return;
      setConversations((prev) => {
        const next = prev.map((c) => {
          if (c._id === conversationId && c.lastMessage && c.lastMessage.status !== 'read') {
            return {
              ...c,
              lastMessage: { ...c.lastMessage, status: 'delivered' as MessageStatus },
            };
          }
          return c;
        });
        localStorage.setItem('kotha_hobe_cached_conversations', JSON.stringify(next));
        return next;
      });
    };

    const handleMessageEdited = (data: { messageId: string; conversationId: string; text: string }) => {
      if (!data?.conversationId) return;
      setConversations((prev) => {
        const next = prev.map((c) => {
          if (c._id === data.conversationId && c.lastMessage) {
            return {
              ...c,
              lastMessage: { ...c.lastMessage, text: data.text },
            };
          }
          return c;
        });
        localStorage.setItem('kotha_hobe_cached_conversations', JSON.stringify(next));
        return next;
      });
    };

    const handleGroupDeleted = ({ groupId, conversationId }: { groupId?: string; conversationId?: string }) => {
      const targetId = groupId || conversationId;
      if (!targetId) return;
      setConversations((prev) => {
        const next = prev.filter((c) => c._id !== targetId);
        localStorage.setItem('kotha_hobe_cached_conversations', JSON.stringify(next));
        return next;
      });
    };

    const handleWindowNewMessage = (e: Event) => {
      const customEvent = e as CustomEvent<any>;
      const payload = customEvent.detail;
      if (payload) {
        handleNewMessageData(payload);
      }
    };

    const handleWindowSync = () => {
      loadConversations(true);
    };

    window.addEventListener('kothahobe:message_new', handleWindowNewMessage);
    window.addEventListener('kothahobe:message_sent', handleWindowNewMessage);
    window.addEventListener('kothahobe:message_sync', handleWindowSync);

    socket.on('message:new', handleNewMessageData);
    socket.on('message:sent', handleNewMessageData);
    socket.on('message:read', handleMessageRead);
    socket.on('message:delivered', handleMessageDelivered);
    socket.on('message:edited', handleMessageEdited);
    socket.on('conversation:update', () => loadConversations(true));
    socket.on('group:deleted', handleGroupDeleted);
    socket.on('conversation:deleted', handleGroupDeleted);

    return () => {
      window.removeEventListener('kothahobe:message_new', handleWindowNewMessage);
      window.removeEventListener('kothahobe:message_sent', handleWindowNewMessage);
      window.removeEventListener('kothahobe:message_sync', handleWindowSync);
      socket.off('message:new', handleNewMessageData);
      socket.off('message:sent', handleNewMessageData);
      socket.off('message:read', handleMessageRead);
      socket.off('message:delivered', handleMessageDelivered);
      socket.off('message:edited', handleMessageEdited);
      socket.off('conversation:update');
      socket.off('group:deleted', handleGroupDeleted);
      socket.off('conversation:deleted', handleGroupDeleted);
    };
  }, [socket, currentUser]);

  // =========================================================================
  // HYBRID INSTANT LOCAL + MERGED SEARCH RESULTS
  // =========================================================================
  const { combinedPeople, combinedGroups, combinedMessages, combinedArchived, totalResultsCount } =
    useMemo(() => {
      const cleanQ = searchQuery.trim().toLowerCase();
      if (!cleanQ) {
        return {
          combinedPeople: [],
          combinedGroups: [],
          combinedMessages: [],
          combinedArchived: [],
          totalResultsCount: 0,
        };
      }

      // 1. Instant Local Matches (0ms)
      const localPeopleMap = new Map<string, ISearchPerson>();
      const localGroupMap = new Map<string, ISearchGroup>();
      const localArchivedMap = new Map<string, ISearchArchived>();

      for (const conv of conversations) {
        if (conv.isArchived) {
          const title = conv.isGroup
            ? conv.groupMeta?.name || 'Group'
            : conv.recipient?.displayName || conv.recipient?.username || 'User';
          const lastText = conv.lastMessage?.text || '';
          if (title.toLowerCase().includes(cleanQ) || lastText.toLowerCase().includes(cleanQ)) {
            localArchivedMap.set(conv._id, {
              _id: conv._id,
              title,
              avatarUrl: conv.isGroup ? conv.groupMeta?.avatarUrl : conv.recipient?.avatarUrl,
              isGroup: Boolean(conv.isGroup),
              lastMessageText: lastText,
              lastMessageAt: conv.lastMessageAt,
            });
          }
          continue;
        }

        if (conv.isGroup) {
          const gName = conv.groupMeta?.name || 'Group Chat';
          const gDesc = conv.groupMeta?.description?.text || '';
          if (gName.toLowerCase().includes(cleanQ) || gDesc.toLowerCase().includes(cleanQ)) {
            localGroupMap.set(conv._id, {
              _id: conv._id,
              name: gName,
              avatarUrl: conv.groupMeta?.avatarUrl,
              description: gDesc,
              memberCount: conv.groupMeta?.members?.length || 1,
              isArchived: false,
              role: 'member',
              lastMessageAt: conv.lastMessageAt,
            });
          }
        } else {
          const name = conv.recipient?.displayName || '';
          const uname = conv.recipient?.username || '';
          if (name.toLowerCase().includes(cleanQ) || uname.toLowerCase().includes(cleanQ)) {
            const pId = conv.recipient?._id || conv._id;
            localPeopleMap.set(pId, {
              _id: pId,
              username: uname,
              displayName: name || uname || 'User',
              avatarUrl: conv.recipient?.avatarUrl,
              isOnline: Boolean(conv.recipient?.isOnline),
              lastSeen: conv.recipient?.lastSeen ? new Date(conv.recipient.lastSeen) : null,
              conversationId: conv._id,
              inContacts: true,
            });
          }
        }
      }

      // Merge backend results with local results (deduplicate)
      for (const bp of backendResults.people) {
        if (!localPeopleMap.has(bp._id)) {
          localPeopleMap.set(bp._id, bp);
        }
      }

      for (const bg of backendResults.groups) {
        if (!localGroupMap.has(bg._id)) {
          localGroupMap.set(bg._id, bg);
        }
      }

      for (const ba of backendResults.archived) {
        if (!localArchivedMap.has(ba._id)) {
          localArchivedMap.set(ba._id, ba);
        }
      }

      const pList = Array.from(localPeopleMap.values());
      const gList = Array.from(localGroupMap.values());
      const mList = backendResults.messages;
      const aList = Array.from(localArchivedMap.values());

      const total = pList.length + gList.length + mList.length + aList.length;

      return {
        combinedPeople: pList,
        combinedGroups: gList,
        combinedMessages: mList,
        combinedArchived: aList,
        totalResultsCount: total,
      };
    }, [searchQuery, conversations, backendResults]);

  // Regular Chat List calculation when not in unified search mode
  const archivedCount = conversations.filter((c) => c.isArchived).length;
  const pendingInvites = conversations.filter(
    (c) => c.isGroup && c.myMembershipStatus === 'pending'
  );
  const activeConversations = conversations.filter(
    (c) => (!c.isGroup || c.myMembershipStatus !== 'pending') && !c.isArchived
  );

  const renderStatusCheck = (status?: string) => {
    if (!status) return null;
    if (status === 'sending') return <span className="text-[10px] text-chat-textMuted mr-1">🕒</span>;
    if (status === 'sent') return <Check className="w-3.5 h-3.5 text-chat-textMuted inline mr-1" />;
    if (status === 'delivered') return <CheckCheck className="w-3.5 h-3.5 text-chat-textMuted inline mr-1" />;
    if (status === 'read') return <CheckCheck className="w-3.5 h-3.5 text-sky-400 inline mr-1" />;
    return null;
  };

  // Archive / Unarchive Handler
  const handleArchiveChat = async (conv: IConversation) => {
    try {
      const res = await archiveConversationApi(conv._id);
      if (res.success) {
        const updated = conversations.map((c) => (c._id === conv._id ? { ...c, isArchived: true } : c));
        setConversations(updated);
        localStorage.setItem('kotha_hobe_cached_conversations', JSON.stringify(updated));
        setSelectedConvForAction(null);
        showActionToast('Chat archived');
      } else {
        showActionToast(res.message || 'Failed to archive chat');
      }
    } catch {
      showActionToast('Network error archiving chat');
    }
  };

  const handleUnarchiveChat = async (conv: IConversation) => {
    try {
      const res = await unarchiveConversationApi(conv._id);
      if (res.success) {
        const updated = conversations.map((c) => (c._id === conv._id ? { ...c, isArchived: false } : c));
        setConversations(updated);
        localStorage.setItem('kotha_hobe_cached_conversations', JSON.stringify(updated));
        setSelectedConvForAction(null);
        showActionToast('Chat unarchived');
      } else {
        showActionToast(res.message || 'Failed to unarchive chat');
      }
    } catch {
      showActionToast('Network error unarchiving chat');
    }
  };

  // Handle Delete Chat
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

  // Handle Block User
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

  // Handle Leave Group
  const handleLeaveGroup = async (conv: IConversation) => {
    const groupName = conv.groupMeta?.name || 'this group';
    if (confirm(`Leave group "${groupName}"? You will no longer receive messages.`)) {
      try {
        await leaveGroupApi(conv._id);
        const updated = conversations.filter((c) => c._id !== conv._id);
        setConversations(updated);
        localStorage.setItem('kotha_hobe_cached_conversations', JSON.stringify(updated));
        localStorage.removeItem(`kotha_hobe_msgs_${conv._id}`);
        localStorage.removeItem(`kotha_hobe_group_cache_${conv._id}`);
        setSelectedConvForAction(null);
        showActionToast(`You left "${groupName}"`);
      } catch (err: any) {
        showActionToast(err?.message || 'Failed to leave group');
      }
    }
  };

  // Handle Delete Group (Admin Only)
  const handleDeleteGroup = async (conv: IConversation) => {
    const groupName = conv.groupMeta?.name || 'this group';
    if (confirm(`Permanently remove group "${groupName}"? This will delete all messages and remove the group for all participants.`)) {
      try {
        await deleteGroupApi(conv._id);
        const updated = conversations.filter((c) => c._id !== conv._id);
        setConversations(updated);
        localStorage.setItem('kotha_hobe_cached_conversations', JSON.stringify(updated));
        localStorage.removeItem(`kotha_hobe_msgs_${conv._id}`);
        localStorage.removeItem(`kotha_hobe_group_cache_${conv._id}`);
        setSelectedConvForAction(null);
        showActionToast(`Group "${groupName}" removed`);
      } catch (err: any) {
        showActionToast(err?.message || 'Failed to remove group');
      }
    }
  };

  // =========================================================================
  // SEARCH RESULT CLICK HANDLERS
  // =========================================================================
  const handleSelectPerson = async (person: ISearchPerson) => {
    addRecentSearch(searchQuery || person.displayName || person.username);
    if (person.conversationId) {
      navigate(`/chat/${person.conversationId}`);
      return;
    }

    try {
      const res = await getOrCreateConversationApi(person._id);
      if (res.success && res.conversation) {
        navigate(`/chat/${res.conversation._id}`);
      } else {
        showActionToast('Could not start conversation');
      }
    } catch {
      showActionToast('Failed to start conversation');
    }
  };

  const handleSelectGroup = (group: ISearchGroup) => {
    addRecentSearch(searchQuery || group.name);
    navigate(`/chat/${group._id}`);
  };

  const handleSelectMessage = (msg: ISearchMessage) => {
    addRecentSearch(searchQuery || msg.conversationTitle);
    navigate(`/chat/${msg.conversationId}?highlightMessageId=${msg._id}`, {
      state: { highlightMessageId: msg._id },
    });
  };

  const handleSelectArchived = (arch: ISearchArchived) => {
    addRecentSearch(searchQuery || arch.title);
    navigate(`/chat/${arch._id}`);
  };

  const isSearchActiveMode = isSearchActive || searchQuery.trim().length > 0;

  return (
    <div
      style={{ backgroundColor: themeConfig.bg }}
      className="h-full w-full flex flex-col max-w-md mx-auto relative overflow-hidden transition-colors duration-200"
    >
      {/* Toast Notification */}
      {actionToast && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-chat-panel/90 backdrop-blur-md border border-chat-border text-chat-textPrimary text-xs px-4 py-2 rounded-full shadow-2xl animate-fade-in pointer-events-none">
          {actionToast}
        </div>
      )}

      {/* Top Header */}
      <header
        style={{ backgroundColor: themeConfig.panel }}
        className="px-4 pt-10 pb-3 border-b border-chat-border flex items-center justify-between flex-shrink-0 transition-colors duration-200"
      >
        {/* Left: Chats Title or Back button in search mode */}
        <div className="flex items-center gap-2">
          {isSearchActiveMode ? (
            <button
              onClick={() => {
                setSearchQuery('');
                setIsSearchActive(false);
              }}
              className="p-1 -ml-1 rounded-full hover:bg-chat-surfaceSecondary text-chat-textPrimary transition-colors flex items-center gap-1.5"
              title="Close Search"
            >
              <ArrowLeft className="w-5 h-5 text-chat-textPrimary" />
              <span className="text-sm font-bold text-chat-textPrimary">Search</span>
            </button>
          ) : (
            <h1 className="text-xl font-bold text-chat-textPrimary tracking-tight">Chats</h1>
          )}
        </div>

        {/* Center: Brand Name (Bengali) */}
        {!isSearchActiveMode && (
          <div className="flex items-center justify-center">
            <span className="text-2xl font-bold text-chat-textPrimary tracking-wide font-sans select-none drop-shadow-sm flex items-center gap-1.5">
              💬 কথা হবে
            </span>
          </div>
        )}

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {isSearchActiveMode ? (
            searchQuery ? (
              <button
                onClick={() => {
                  setSearchQuery('');
                  searchInputRef.current?.focus();
                }}
                className="text-xs text-brand-500 font-semibold px-2 py-1 rounded-lg hover:bg-brand-500/10 transition-colors"
              >
                Clear
              </button>
            ) : null
          ) : (
            <button
              onClick={() => setShowCreateGroupModal(true)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-soft hover:opacity-90 active:scale-95 border border-brand-500/30 text-brand-500 text-xs font-semibold transition-all"
              title="Create New Group"
            >
              <Users className="w-3.5 h-3.5" />
              <span>+ Group</span>
            </button>
          )}
        </div>
      </header>

      {/* Smart Search Bar */}
      <div className="p-3 bg-chat-panel/60 border-b border-chat-divider flex-shrink-0 transition-colors duration-200">
        <div className="relative flex items-center">
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onFocus={() => setIsSearchActive(true)}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchQuery.trim()) {
                addRecentSearch(searchQuery);
              }
            }}
            placeholder="Search people, groups, messages, or @username..."
            className="w-full bg-chat-input border border-chat-border text-chat-textPrimary placeholder:text-chat-textTertiary rounded-2xl py-2.5 pl-10 pr-9 text-sm focus:outline-none focus:border-brand-500 focus:bg-chat-card transition-all"
          />
          <Search className="w-4 h-4 text-chat-textMuted absolute left-3.5 top-3.5 pointer-events-none" />

          {searchQuery ? (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                searchInputRef.current?.focus();
              }}
              className="absolute right-2.5 p-1 rounded-full hover:bg-chat-surfaceSecondary text-chat-textMuted hover:text-chat-textPrimary transition-colors"
              title="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          ) : isSearchingBackend ? (
            <div className="absolute right-3.5 w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          ) : null}
        </div>

        {/* Category Filter Chips Bar (Shown when search is active) */}
        {isSearchActiveMode && (
          <div className="flex items-center gap-1.5 mt-2.5 overflow-x-auto no-scrollbar py-0.5 animate-fade-in">
            {(
              [
                { key: 'all', label: 'All', count: totalResultsCount },
                { key: 'people', label: 'People', count: combinedPeople.length },
                { key: 'groups', label: 'Groups', count: combinedGroups.length },
                { key: 'messages', label: 'Messages', count: combinedMessages.length },
                { key: 'archived', label: 'Archived', count: combinedArchived.length },
              ] as const
            ).map((tab) => {
              const isSelected = searchCategory === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setSearchCategory(tab.key)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5 active:scale-95 ${
                    isSelected
                      ? 'bg-brand-500 text-white shadow-xs'
                      : 'bg-chat-surfaceSecondary text-chat-textSecondary hover:bg-chat-surfaceTertiary hover:text-chat-textPrimary border border-chat-border/60'
                  }`}
                >
                  <span>{tab.label}</span>
                  {searchQuery.trim() && (
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold ${
                        isSelected
                          ? 'bg-white/20 text-white'
                          : 'bg-chat-card text-chat-textMuted'
                      }`}
                    >
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Viewport Container */}
      <div className="flex-1 overflow-y-auto divide-y divide-chat-divider">
        {/* ================================================================= */}
        {/* 1. SEARCH ACTIVE VIEW (RECENT SEARCHES OR SEARCH RESULTS) */}
        {/* ================================================================= */}
        {isSearchActiveMode ? (
          searchQuery.trim() === '' ? (
            /* Recent Searches & Suggested Exploration */
            <div className="p-4 space-y-4 animate-fade-in">
              {recentSearches.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between mb-2 px-1">
                    <span className="text-xs font-bold uppercase tracking-wider text-chat-textMuted flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      Recent Searches
                    </span>
                    <button
                      onClick={clearRecentSearches}
                      className="text-xs text-brand-500 hover:text-brand-600 font-semibold transition-colors"
                    >
                      Clear All
                    </button>
                  </div>
                  <div className="space-y-1">
                    {recentSearches.map((term, i) => (
                      <div
                        key={i}
                        onClick={() => {
                          setSearchQuery(term);
                          addRecentSearch(term);
                        }}
                        className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-chat-surfaceSecondary cursor-pointer transition-colors group select-none"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <History className="w-4 h-4 text-chat-textMuted flex-shrink-0 group-hover:text-brand-500 transition-colors" />
                          <span className="text-sm font-medium text-chat-textPrimary truncate">
                            {term}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => removeRecentSearch(term, e)}
                          className="p-1 rounded-full hover:bg-chat-surfaceTertiary text-chat-textMuted hover:text-chat-textPrimary transition-colors"
                          title="Remove from history"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {/* Quick Discovery Cards */}
              <div className="p-4 rounded-3xl bg-chat-surfaceSecondary/40 border border-chat-border/70 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-chat-textPrimary">
                  <Sparkles className="w-4 h-4 text-brand-500" />
                  <span>Smart Search Power</span>
                </div>
                <p className="text-xs text-chat-textSecondary leading-relaxed">
                  Search people by exact <code className="text-brand-500 font-mono">@username</code>, find joined groups, look up messages by keywords, or jump to archived chats.
                </p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  <span className="text-[11px] font-medium bg-chat-card px-2.5 py-1 rounded-xl border border-chat-border/60 text-chat-textSecondary">
                    👤 People & IDs
                  </span>
                  <span className="text-[11px] font-medium bg-chat-card px-2.5 py-1 rounded-xl border border-chat-border/60 text-chat-textSecondary">
                    👥 Group Names
                  </span>
                  <span className="text-[11px] font-medium bg-chat-card px-2.5 py-1 rounded-xl border border-chat-border/60 text-chat-textSecondary">
                    💬 In-Chat Text
                  </span>
                  <span className="text-[11px] font-medium bg-chat-card px-2.5 py-1 rounded-xl border border-chat-border/60 text-chat-textSecondary">
                    📦 Archived History
                  </span>
                </div>
              </div>
            </div>
          ) : totalResultsCount === 0 && !isSearchingBackend ? (
            /* No Results Found State */
            <div className="flex flex-col items-center justify-center p-8 text-center animate-fade-in">
              <div className="w-16 h-16 rounded-3xl bg-chat-surfaceSecondary flex items-center justify-center mb-3 text-chat-textMuted shadow-inner">
                <Search className="w-8 h-8 opacity-60" />
              </div>
              <h3 className="text-base font-bold text-chat-textPrimary mb-1">
                No matches found
              </h3>
              <p className="text-xs text-chat-textSecondary max-w-xs leading-relaxed mb-4">
                We couldn't find any results for "{searchQuery}"
                {searchCategory !== 'all' ? ` in ${searchCategory}` : ''}.
              </p>
              {searchCategory !== 'all' && (
                <button
                  onClick={() => setSearchCategory('all')}
                  className="px-4 py-2 bg-brand-500 hover:bg-brand-600 text-white rounded-xl text-xs font-semibold shadow-md shadow-brand-500/20 active:scale-95 transition-all"
                >
                  Search in All Categories
                </button>
              )}
            </div>
          ) : (
            /* Unified Categorized Results View */
            <div className="divide-y divide-chat-divider animate-fade-in">
              {/* Syncing indicator header */}
              {isSearchingBackend && (
                <div className="px-4 py-1.5 bg-brand-500/10 text-brand-500 text-[11px] font-semibold flex items-center justify-center gap-1.5 animate-pulse">
                  <div className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-ping" />
                  <span>Searching server database...</span>
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* PEOPLE RESULTS */}
              {/* ------------------------------------------------------------- */}
              {(searchCategory === 'all' || searchCategory === 'people') && combinedPeople.length > 0 && (
                <div className="p-3 space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-chat-textMuted px-2 py-1 flex items-center justify-between">
                    <span>People ({combinedPeople.length})</span>
                    {searchCategory === 'all' && combinedPeople.length > 4 && (
                      <button
                        onClick={() => setSearchCategory('people')}
                        className="text-brand-500 hover:underline font-semibold"
                      >
                        View all
                      </button>
                    )}
                  </p>
                  {combinedPeople.map((person) => (
                    <div
                      key={person._id}
                      onClick={() => handleSelectPerson(person)}
                      className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-chat-surfaceSecondary cursor-pointer transition-colors select-none group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar
                          src={person.avatarUrl}
                          name={person.displayName || person.username}
                          size="md"
                          isOnline={person.isOnline}
                        />
                        <div className="min-w-0">
                          <h4 className="text-sm font-semibold text-chat-textPrimary truncate">
                            <HighlightMatch text={person.displayName || person.username} query={searchQuery} />
                          </h4>
                          <p className="text-xs text-chat-textMuted truncate flex items-center gap-1">
                            <AtSign className="w-3 h-3 text-chat-textTertiary inline" />
                            <HighlightMatch text={person.username} query={searchQuery} />
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-[11px] font-semibold text-brand-500 bg-brand-soft px-2 py-1 rounded-xl border border-brand-500/20">
                          {person.inContacts ? 'Chat' : 'Start'}
                        </span>
                        <ChevronRight className="w-4 h-4 text-chat-textMuted group-hover:translate-x-0.5 transition-transform" />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* GROUPS RESULTS */}
              {/* ------------------------------------------------------------- */}
              {(searchCategory === 'all' || searchCategory === 'groups') && combinedGroups.length > 0 && (
                <div className="p-3 space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-chat-textMuted px-2 py-1 flex items-center justify-between">
                    <span>Groups ({combinedGroups.length})</span>
                    {searchCategory === 'all' && combinedGroups.length > 4 && (
                      <button
                        onClick={() => setSearchCategory('groups')}
                        className="text-brand-500 hover:underline font-semibold"
                      >
                        View all
                      </button>
                    )}
                  </p>
                  {combinedGroups.map((group) => (
                    <div
                      key={group._id}
                      onClick={() => handleSelectGroup(group)}
                      className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-chat-surfaceSecondary cursor-pointer transition-colors select-none group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative flex-shrink-0">
                          <Avatar src={group.avatarUrl} name={group.name} size="md" />
                          <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-brand-500 border-2 border-chat-bg flex items-center justify-center text-white">
                            <Users className="w-2.5 h-2.5" />
                          </div>
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-sm font-semibold text-chat-textPrimary truncate">
                              <HighlightMatch text={group.name} query={searchQuery} />
                            </h4>
                            <span className="text-[10px] text-brand-500 font-bold px-1.5 py-0.2 rounded bg-brand-soft border border-brand-500/20 shrink-0">
                              {group.memberCount} members
                            </span>
                          </div>
                          {group.description && (
                            <p className="text-xs text-chat-textMuted truncate mt-0.5">
                              <HighlightMatch text={group.description} query={searchQuery} />
                            </p>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-chat-textMuted group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
                    </div>
                  ))}
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* MESSAGES RESULTS */}
              {/* ------------------------------------------------------------- */}
              {(searchCategory === 'all' || searchCategory === 'messages') && combinedMessages.length > 0 && (
                <div className="p-3 space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-chat-textMuted px-2 py-1 flex items-center justify-between">
                    <span>Messages ({combinedMessages.length})</span>
                    {searchCategory === 'all' && combinedMessages.length > 6 && (
                      <button
                        onClick={() => setSearchCategory('messages')}
                        className="text-brand-500 hover:underline font-semibold"
                      >
                        View all
                      </button>
                    )}
                  </p>
                  {combinedMessages.map((msg) => (
                    <div
                      key={msg._id}
                      onClick={() => handleSelectMessage(msg)}
                      className="p-3 rounded-2xl hover:bg-chat-surfaceSecondary cursor-pointer transition-colors select-none space-y-1 group"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <Avatar src={msg.senderAvatar || msg.conversationAvatar} name={msg.conversationTitle} size="sm" />
                          <span className="text-xs font-bold text-chat-textPrimary truncate">
                            {msg.conversationTitle}
                          </span>
                          {msg.isGroup && (
                            <span className="text-[9.5px] text-brand-500 bg-brand-soft px-1.5 py-0.2 rounded font-medium">
                              Group
                            </span>
                          )}
                        </div>
                        <span className="text-[10.5px] text-chat-textMuted font-medium flex-shrink-0 ml-2">
                          {formatChatListDate(msg.createdAt)}
                        </span>
                      </div>

                      <div className="flex items-start gap-1.5 pl-6">
                        <CornerDownRight className="w-3.5 h-3.5 text-chat-textMuted shrink-0 mt-0.5" />
                        <p className="text-xs text-chat-textSecondary leading-relaxed line-clamp-2">
                          <span className="font-semibold text-chat-textPrimary mr-1">
                            {msg.senderName}:
                          </span>
                          <HighlightMatch text={msg.text} query={searchQuery} />
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* ------------------------------------------------------------- */}
              {/* ARCHIVED RESULTS */}
              {/* ------------------------------------------------------------- */}
              {(searchCategory === 'all' || searchCategory === 'archived') && combinedArchived.length > 0 && (
                <div className="p-3 space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-chat-textMuted px-2 py-1">
                    Archived Chats ({combinedArchived.length})
                  </p>
                  {combinedArchived.map((arch) => (
                    <div
                      key={arch._id}
                      onClick={() => handleSelectArchived(arch)}
                      className="flex items-center justify-between p-2.5 rounded-2xl hover:bg-chat-surfaceSecondary cursor-pointer transition-colors select-none group"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar src={arch.avatarUrl} name={arch.title} size="md" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h4 className="text-sm font-semibold text-chat-textPrimary truncate">
                              <HighlightMatch text={arch.title} query={searchQuery} />
                            </h4>
                            <span className="text-[9.5px] text-amber-600 dark:text-amber-400 font-bold px-1.5 py-0.2 rounded bg-amber-500/15 border border-amber-500/25 shrink-0">
                              Archived
                            </span>
                          </div>
                          {arch.lastMessageText && (
                            <p className="text-xs text-chat-textMuted truncate mt-0.5">
                              <HighlightMatch text={arch.lastMessageText} query={searchQuery} />
                            </p>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-chat-textMuted group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        ) : (
          /* ================================================================= */
          /* 2. REGULAR ACTIVE CHATS & CONVERSATIONS LIST */
          /* ================================================================= */
          <>
            {/* Archived Chats Header Banner */}
            {archivedCount > 0 && (
              <button
                type="button"
                onClick={() => navigate('/chats/archived')}
                className="w-full flex items-center justify-between px-4 py-3 bg-chat-surfaceSecondary/50 hover:bg-chat-surfaceSecondary border-b border-chat-divider transition-colors text-left select-none group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-2xl bg-brand-500/15 text-brand-500 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Archive className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-chat-textPrimary block">Archived Chats</span>
                    <span className="text-[10.5px] text-chat-textMuted block">Tap to view hidden conversations</span>
                  </div>
                </div>
                <span className="text-[11px] font-bold text-brand-500 bg-brand-500/10 px-2 py-0.5 rounded-full">
                  {archivedCount}
                </span>
              </button>
            )}

            {/* Pending Group Invites Section */}
            {pendingInvites.length > 0 && (
              <div className="p-3 bg-emerald-500/10 border-b border-emerald-500/20 space-y-2">
                <p className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider px-1">
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
                <div className="w-16 h-16 rounded-full bg-chat-surfaceSecondary flex items-center justify-center mb-4 text-chat-textMuted">
                  <MessageSquare className="w-8 h-8" />
                </div>
                <h3 className="text-base font-semibold text-chat-textPrimary mb-1">
                  No conversations yet
                </h3>
                <p className="text-xs text-chat-textMuted mb-6 max-w-xs leading-relaxed">
                  Find someone or create a group to start chatting.
                </p>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowCreateGroupModal(true)}
                    className="bg-brand-500 hover:bg-brand-600 active:scale-95 text-white text-sm font-semibold px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-md shadow-brand-500/20"
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
                    className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-chat-surfaceSecondary/50 active:bg-chat-surfaceSecondary pressable-card cursor-pointer select-none relative group hardware-accelerated transition-colors duration-150"
                  >
                    {/* Click to open chat */}
                    <div
                      onClick={() => navigate(`/chat/${conv._id}`)}
                      className="flex items-center gap-3.5 flex-1 min-w-0"
                    >
                      {isGroup ? (
                        <div className="relative flex-shrink-0">
                          <Avatar src={avatarUrl} name={title} size="md" />
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-brand-500 border-2 border-chat-bg flex items-center justify-center text-white">
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
                            <h2 className="text-sm font-semibold text-chat-textPrimary truncate">{title}</h2>
                            {isGroup && (
                              <span className="text-[10px] text-brand-500 font-medium px-1.5 py-0.2 rounded bg-brand-soft border border-brand-500/20 shrink-0">
                                {conv.groupMeta?.members?.length || 1}
                              </span>
                            )}
                            {conv.isArchived && (
                              <span className="text-[9.5px] text-amber-600 dark:text-amber-400 font-bold px-1.5 py-0.2 rounded bg-amber-500/15 border border-amber-500/25 shrink-0">
                                Archived
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
                          <p className="text-xs text-chat-textSecondary truncate pr-2">
                            {renderStatusCheck(conv.lastMessage?.status)}
                            {formatConversationPreview(conv.lastMessage, isGroup)}
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
                      className="p-2 rounded-full text-chat-textMuted hover:text-chat-textPrimary hover:bg-chat-surfaceSecondary pressable-icon flex-shrink-0"
                      title="Chat Options"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>
                  </div>
                );
              })
            )}
          </>
        )}
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
            className="w-full max-w-sm rounded-3xl border border-chat-border overflow-hidden shadow-2xl p-5 space-y-4 animate-slide-up"
          >
            {/* Header info */}
            <div className="flex items-center justify-between border-b border-chat-divider pb-3">
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
                  <h3 className="text-sm font-bold text-chat-textPrimary">
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
                className="p-1.5 rounded-full hover:bg-chat-surfaceSecondary text-chat-textMuted hover:text-chat-textPrimary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Actions List */}
            <div className="space-y-1">
              {/* 1. View Info */}
              <button
                onClick={() => {
                  const id = selectedConvForAction._id;
                  const isGroup = selectedConvForAction.isGroup;
                  setSelectedConvForAction(null);
                  navigate(isGroup ? `/group/${id}` : `/chat-info/${id}`);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-chat-surfaceSecondary text-chat-textPrimary text-sm font-medium transition-colors"
              >
                <Info className="w-4 h-4 text-sky-500" />
                <span>{selectedConvForAction.isGroup ? 'Group Information' : 'User Information'}</span>
              </button>

              {/* 2. Archive / Unarchive */}
              {selectedConvForAction.isArchived ? (
                <button
                  onClick={() => handleUnarchiveChat(selectedConvForAction)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-chat-surfaceSecondary text-chat-textPrimary text-sm font-medium transition-colors"
                >
                  <ArchiveRestore className="w-4 h-4 text-brand-500" />
                  <span>Unarchive Conversation</span>
                </button>
              ) : (
                <button
                  onClick={() => handleArchiveChat(selectedConvForAction)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-chat-surfaceSecondary text-chat-textPrimary text-sm font-medium transition-colors"
                >
                  <Archive className="w-4 h-4 text-amber-500" />
                  <span>Archive Conversation</span>
                </button>
              )}

              {/* 3. Delete Chat History */}
              <button
                onClick={() => handleDeleteChat(selectedConvForAction)}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-500/10 text-red-500 text-sm font-medium transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete Chat History</span>
              </button>

              {/* 4. Block User (1-on-1 Chats only) */}
              {!selectedConvForAction.isGroup && (
                <button
                  onClick={() => handleBlockUser(selectedConvForAction)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-500/10 text-red-500 text-sm font-medium transition-colors"
                >
                  <Ban className="w-4 h-4" />
                  <span>Block User</span>
                </button>
              )}

              {/* 5. Leave Group (Group Chats Only - Non-Creators) */}
              {selectedConvForAction.isGroup && selectedConvForAction.groupMeta?.creator?.toString() !== currentUser?._id && (
                <button
                  onClick={() => handleLeaveGroup(selectedConvForAction)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-500/10 text-red-500 text-sm font-medium transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Leave Group</span>
                </button>
              )}

              {/* 6. Delete Group (Group Chats Only - Creator / Admin Only) */}
              {selectedConvForAction.isGroup && selectedConvForAction.groupMeta?.creator?.toString() === currentUser?._id && (
                <button
                  onClick={() => handleDeleteGroup(selectedConvForAction)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-red-500/10 text-red-500 text-sm font-medium transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Group Permanently</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
