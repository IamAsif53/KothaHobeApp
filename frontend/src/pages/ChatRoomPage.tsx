import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { fetchMessagesApi, fetchMessageContextApi, uploadMediaApi, searchInConversationApi, editMessageApi, deleteMessageRestApi } from '../api/messageApi';
import { fetchConversations, fetchConversationDetailsApi } from '../api/conversationApi';
import { IMessage, IUser, IReplyTo, IAttachment, IConversation } from '../types';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../context/ThemeContext';
import { useCall } from '../context/CallContext';
import { useGroupCall } from '../context/GroupCallContext';
import { Avatar } from '../components/common/Avatar';
import { MessageBubble } from '../components/chat/MessageBubble';
import { MessageComposer } from '../components/chat/MessageComposer';
import { MediaViewerModal } from '../components/chat/MediaViewerModal';
import { ViewOnceViewerModal } from '../components/chat/ViewOnceViewerModal';
import { DocumentViewerModal } from '../components/chat/DocumentViewerModal';
import { ForwardMessageModal } from '../components/chat/ForwardMessageModal';
import { GroupCallBanner } from '../components/call/GroupCallBanner';
import { MessageSkeleton } from '../components/common/Skeleton';
import { formatLastSeen, formatChatListDate } from '../utils/dateUtils';
import { ReactionListModal } from '../components/chat/ReactionListModal';
import { AnimatedCustomEmoji } from '../components/emoji/AnimatedCustomEmoji';
import {
  openDocumentInNativeApp,
  downloadDocumentToDevice,
  saveImageToDevice,
} from '../services/nativeMediaService';
import { fileCacheService } from '../services/localFileCacheService';
import {
  ArrowLeft,
  Search,
  MoreVertical,
  Phone,
  Video,
  X,
  ChevronDown,
  Users,
  CornerUpLeft,
  CornerUpRight,
  Pencil,
  Copy,
  ExternalLink,
  Download,
  Trash2,
  Sparkles,
  RotateCw,
} from 'lucide-react';

const QUICK_REACTIONS = ['❤️', '😂', '🔥', '👍', '😮', '😢', '👏'];
const QUICK_ANIMATED_REACTIONS = ['cat_laugh', 'dog_love', 'love_heart', 'party_popper', 'funny_lol', 'panda_cry'];

const normalizeMsg = (m: IMessage): IMessage => {
  const createdAtStr = m.createdAt
    ? typeof m.createdAt === 'string'
      ? m.createdAt
      : new Date(m.createdAt).toISOString()
    : new Date().toISOString();
  const createdAtMs = new Date(createdAtStr).getTime() || Date.now();
  return {
    ...m,
    createdAt: createdAtStr,
    _createdAtMs: createdAtMs,
  } as any;
};

const sortMsgList = (a: any, b: any) => {
  const timeA = a._createdAtMs || (a.createdAt ? new Date(a.createdAt).getTime() : 0) || 0;
  const timeB = b._createdAtMs || (b.createdAt ? new Date(b.createdAt).getTime() : 0) || 0;
  if (timeA !== timeB) return timeA - timeB;
  const seqA = a.serverSequence || 0;
  const seqB = b.serverSequence || 0;
  if (seqA !== seqB) return seqA - seqB;
  const idA = String(a._id || a.clientMessageId || '');
  const idB = String(b._id || b.clientMessageId || '');
  return idA.localeCompare(idB);
};

export const ChatRoomPage: React.FC = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { user } = useAuth();
  const {
    socket,
    sendMessage,
    removeOutboxItem,
    markAsRead,
    startTyping,
    stopTyping,
    setActiveConversationId,
  } = useSocket();
  const { themeConfig } = useTheme();
  const { startCall } = useCall();
  const { startGroupCall } = useGroupCall();
  const navigate = useNavigate();

  const [conversation, setConversation] = useState<IConversation | null>(() => {
    try {
      const cachedConvs = localStorage.getItem('kotha_hobe_cached_conversations');
      if (cachedConvs && conversationId) {
        const parsed = JSON.parse(cachedConvs);
        const match = parsed.find((c: any) => c._id === conversationId);
        return match || null;
      }
      return null;
    } catch {
      return null;
    }
  });

  const [recipient, setRecipient] = useState<IUser | null>(() => {
    try {
      const cachedConvs = localStorage.getItem('kotha_hobe_cached_conversations');
      if (cachedConvs && conversationId) {
        const parsed = JSON.parse(cachedConvs);
        const match = parsed.find((c: any) => c._id === conversationId);
        return match ? match.recipient : null;
      }
      return null;
    } catch {
      return null;
    }
  });

  const isGroup = !!conversation?.isGroup;
  const groupMeta = conversation?.groupMeta;

  // Load cached messages immediately
  const [messages, setMessages] = useState<IMessage[]>(() => {
    try {
      if (conversationId) {
        const cached = localStorage.getItem(`kotha_hobe_msgs_${conversationId}`);
        return cached ? JSON.parse(cached) : [];
      }
      return [];
    } catch {
      return [];
    }
  });

  const [loading, setLoading] = useState(() => {
    if (!conversationId) return false;
    return !localStorage.getItem(`kotha_hobe_msgs_${conversationId}`);
  });

  const [hasMore, setHasMore] = useState(false);
  const [oldestCursor, setOldestCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  // New Messages while scrolled up badge
  const [unreadNewCount, setUnreadNewCount] = useState(0);
  const isNearBottomRef = useRef(true);
  const isLoadingMoreRef = useRef(false);
  const lastMessageIdRef = useRef<string | null>(null);

  // Scroll offset preservation ref for upward pagination
  const scrollOffsetRef = useRef<{ prevScrollHeight: number; prevScrollTop: number } | null>(null);
  const initialScrollDoneRef = useRef(false);

  // Replying & Modals
  const [replyingTo, setReplyingTo] = useState<IReplyTo | null>(null);
  const [editingMessage, setEditingMessage] = useState<IMessage | null>(null);
  const [forwardingMessage, setForwardingMessage] = useState<IMessage | null>(null);
  const [activeMediaModal, setActiveMediaModal] = useState<IMessage | null>(null);
  const [activeViewOnceModal, setActiveViewOnceModal] = useState<IMessage | null>(null);
  const [activeDocModal, setActiveDocModal] = useState<IMessage | null>(null);
  const [actionMenuMessage, setActionMenuMessage] = useState<IMessage | null>(null);
  const [reactionListMessage, setReactionListMessage] = useState<IMessage | null>(null);
  const [reactionListInitialEmoji, setReactionListInitialEmoji] = useState<string>('all');
  const [showAnimatedReactionTray, setShowAnimatedReactionTray] = useState<boolean>(false);

  // Group-Only Typing Indicator state: Map<userId, { displayName: string, timer: NodeJS.Timeout }>
  const [groupTypingUsers, setGroupTypingUsers] = useState<Map<string, { displayName: string; timer: NodeJS.Timeout }>>(new Map());

  // Toast / Status Message
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // In-Chat Search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Deep-linking / Highlight Message Jump Support
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const targetHighlightId = searchParams.get('highlightMessageId') || (location.state as any)?.highlightMessageId || null;
  const [activeHighlightId, setActiveHighlightId] = useState<string | null>(targetHighlightId);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Immediate LocalStorage save (zero delay)
  const persistMessages = useCallback(
    (msgs: IMessage[]) => {
      if (!conversationId) return;
      try {
        localStorage.setItem(`kotha_hobe_msgs_${conversationId}`, JSON.stringify(msgs));
      } catch {}
    },
    [conversationId]
  );

  // Hardware Instant Scroll to Bottom
  const scrollToBottom = useCallback((instant = false) => {
    const container = scrollContainerRef.current;
    if (container) {
      if (instant) {
        container.scrollTop = container.scrollHeight;
      } else {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth',
        });
      }
      isNearBottomRef.current = true;
      setUnreadNewCount(0);
    }
  }, []);

  // Monitor Scroll Position
  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const distanceToBottom = scrollHeight - scrollTop - clientHeight;
    isNearBottomRef.current = distanceToBottom < 45;

    if (isNearBottomRef.current) {
      setUnreadNewCount(0);
      if (conversationId) {
        markAsRead(conversationId);
      }
    }

    // Trigger loading older messages when user actively scrolls near top (only after initial scroll is done)
    if (initialScrollDoneRef.current && scrollTop < 80 && hasMore && !isLoadingMoreRef.current && !loadingMore && oldestCursor) {
      handleLoadMore();
    }
  };

  // Synchronize Scroll on initial render and upward pagination with zero jitter
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || messages.length === 0) return;

    // 1. Upward pagination scroll compensation (runs synchronously before paint)
    if (scrollOffsetRef.current) {
      const { prevScrollHeight, prevScrollTop } = scrollOffsetRef.current;
      const heightDelta = container.scrollHeight - prevScrollHeight;
      container.scrollTop = prevScrollTop + heightDelta;
      scrollOffsetRef.current = null;
      return;
    }

    // 2. Initial mount or user still near bottom: always pin synchronously to the bottom
    if (!initialScrollDoneRef.current || isNearBottomRef.current) {
      container.scrollTop = container.scrollHeight;
      initialScrollDoneRef.current = true;
      lastMessageIdRef.current = messages[messages.length - 1]?._id || messages[messages.length - 1]?.clientMessageId || null;
      return;
    }

    // 3. New message added at the bottom
    const currentLastId = messages[messages.length - 1]?._id || messages[messages.length - 1]?.clientMessageId || null;
    const isNewBottomMessage = currentLastId !== lastMessageIdRef.current;
    lastMessageIdRef.current = currentLastId;

    if (isNewBottomMessage) {
      const lastMsg = messages[messages.length - 1];
      const isSentByMe = lastMsg && (lastMsg.senderId === user?._id || (lastMsg.senderId as any)?._id === user?._id);
      if (isSentByMe || isNearBottomRef.current) {
        container.scrollTop = container.scrollHeight;
      }
    }
  }, [messages, user?._id]);

  // Set Active Conversation ID
  useEffect(() => {
    if (conversationId) {
      setActiveConversationId(conversationId);
    }
    return () => {
      setActiveConversationId(null);
    };
  }, [conversationId, setActiveConversationId]);

  // Deep-link context fetch if target message is not in initial local cached list
  useEffect(() => {
    if (!conversationId || !targetHighlightId) return;
    const exists = messages.some(
      (m) => m._id === targetHighlightId || m.clientMessageId === targetHighlightId
    );
    if (!exists) {
      fetchMessageContextApi(conversationId, targetHighlightId)
        .then((res) => {
          if (res.success && Array.isArray(res.messages) && res.messages.length > 0) {
            setMessages(res.messages);
            persistMessages(res.messages);
          }
        })
        .catch((err) => console.warn('[ChatRoom] fetchMessageContext error:', err));
    }
  }, [conversationId, targetHighlightId, persistMessages]);

  // Scroll to target highlighted message smoothly
  useEffect(() => {
    if (!activeHighlightId) return;
    const timer = setTimeout(() => {
      const el = document.getElementById(`msg-${activeHighlightId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const fadeTimer = setTimeout(() => {
          setActiveHighlightId(null);
        }, 3000);
        return () => clearTimeout(fadeTimer);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [activeHighlightId, messages]);

  // Load conversation details & initial messages (Local-first background sync)
  useEffect(() => {
    if (!conversationId) return;
    initialScrollDoneRef.current = false;

    // Immediately mark read locally upon opening chat
    markAsRead(conversationId);

    const initChat = async () => {
      if (!localStorage.getItem(`kotha_hobe_msgs_${conversationId}`)) {
        setLoading(true);
      }
      try {
        const [convsRes, msgRes] = await Promise.all([
          fetchConversations().catch(() => ({ success: false, conversations: [] })),
          fetchMessagesApi(conversationId, undefined, 40).catch(() => ({
            success: false,
            messages: [],
            hasMore: false,
            oldestCursor: null,
          })),
        ]);

        if (convsRes.success && convsRes.conversations) {
          const currentConv = convsRes.conversations.find((c: any) => c._id === conversationId);
          if (currentConv) {
            setConversation(currentConv);
            if (!currentConv.isGroup) {
              setRecipient(currentConv.recipient || null);
            }
          } else {
            fetchConversationDetailsApi(conversationId).then((res) => {
              if (res.success && res.conversation) {
                setConversation(res.conversation);
                if (!res.conversation.isGroup) {
                  setRecipient(res.conversation.recipient || null);
                }
              }
            });
          }
        }

        if (msgRes.success && msgRes.messages) {
          const container = scrollContainerRef.current;
          // If already mounted and user is scrolled up reading older messages, preserve scroll anchor
          if (initialScrollDoneRef.current && container && !isNearBottomRef.current) {
            scrollOffsetRef.current = {
              prevScrollHeight: container.scrollHeight,
              prevScrollTop: container.scrollTop,
            };
          }

          setMessages((prev) => {
            const map = new Map<string, IMessage>();
            // 1. Add current local/optimistic messages
            prev.forEach((m) => {
              const norm = normalizeMsg(m);
              const key = norm._id || norm.clientMessageId;
              if (key) map.set(key, norm);
            });
            // 2. Add/overwrite with authoritative server messages
            msgRes.messages.forEach((m) => {
              const norm = normalizeMsg(m);
              if (norm.clientMessageId && map.has(norm.clientMessageId)) {
                map.delete(norm.clientMessageId);
              }
              if (norm._id) {
                map.set(norm._id, norm);
              }
            });
            const merged = Array.from(map.values()).sort(sortMsgList);
            persistMessages(merged);
            return merged;
          });
          setHasMore(msgRes.hasMore);
          setOldestCursor(msgRes.oldestCursor);
        }
      } catch (error) {
        console.warn('[ChatRoom] Background sync notice:', error);
      } finally {
        setLoading(false);
        // Instant static scroll to latest message with zero animation latency
        if (!initialScrollDoneRef.current || isNearBottomRef.current) {
          scrollToBottom(false);
        }
      }
    };

    initChat();
  }, [conversationId, persistMessages, scrollToBottom, markAsRead]);

  // Join socket conversation room & mark messages as read
  useEffect(() => {
    if (!conversationId) return;

    markAsRead(conversationId);

    if (socket) {
      socket.emit('conversation:join', conversationId);
      // Fast socket delta sync request
      socket.emit('message:sync_request', {
        since: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      });
    }

    return () => {
      if (socket) {
        socket.emit('conversation:leave', conversationId);
      }
    };
  }, [socket, conversationId, markAsRead]);

  // Real-time Socket & Window event listeners
  useEffect(() => {
    if (!socket || !conversationId) return;

    // Fast delta synchronization event handler
    const handleMessageSync = (e: Event) => {
      const customEvent = e as CustomEvent<IMessage[]>;
      const syncList = customEvent.detail;
      if (!Array.isArray(syncList) || syncList.length === 0) return;

      const relevant = syncList.filter((m) => m.conversationId === conversationId);
      if (relevant.length === 0) return;

      console.log(`[ChatRoom] ⚡ Applying ${relevant.length} synchronized message(s) directly to chat store`);

      setMessages((prev) => {
        const map = new Map<string, IMessage>();
        prev.forEach((m) => {
          const norm = normalizeMsg(m);
          const k = norm._id || norm.clientMessageId;
          if (k) map.set(k, norm);
        });

        relevant.forEach((m) => {
          const norm = normalizeMsg(m);
          if (norm.clientMessageId && map.has(norm.clientMessageId)) {
            map.delete(norm.clientMessageId);
          }
          if (norm._id) map.set(norm._id, norm);
        });

        const merged = Array.from(map.values()).sort(sortMsgList);
        persistMessages(merged);
        return merged;
      });

      markAsRead(conversationId);
      if (isNearBottomRef.current) {
        requestAnimationFrame(() => scrollToBottom(false));
      }
    };
    window.addEventListener('kothahobe:message_sync', handleMessageSync);

    // Window event for immediate optimistic rendering (e.g. from Forward modal)
    const handleSavedEvent = (e: Event) => {
      const customEvent = e as CustomEvent<IMessage>;
      const msg = customEvent.detail;
      if (msg && msg.conversationId === conversationId) {
        const norm = normalizeMsg(msg);
        setMessages((prev) => {
          if (prev.some((m) => m._id === norm._id || (m.clientMessageId && norm.clientMessageId && m.clientMessageId === norm.clientMessageId))) {
            return prev;
          }
          const updated = [...prev, norm].sort(sortMsgList);
          persistMessages(updated);
          return updated;
        });
        if (isNearBottomRef.current) {
          requestAnimationFrame(() => scrollToBottom(false));
        }
      }
    };
    window.addEventListener('kothahobe:message_saved', handleSavedEvent);

    const handleWindowMessageSent = (e: any) => {
      const sentMsg = e.detail;
      if (sentMsg && sentMsg.conversationId === conversationId) {
        const norm = normalizeMsg(sentMsg);
        setMessages((prev) => {
          const updated = prev.map((m) =>
            m.clientMessageId === norm.clientMessageId || m._id === norm._id
              ? { ...m, ...norm, status: norm.status || 'sent' }
              : m
          );
          persistMessages(updated);
          return updated;
        });
      }
    };
    window.addEventListener('kothahobe:message_sent', handleWindowMessageSent);

    const handleWindowMessageFailed = (e: any) => {
      const detail = e.detail;
      if (detail && detail.conversationId === conversationId) {
        setMessages((prev) => {
          const updated = prev.map((m) =>
            m.clientMessageId === detail.clientMessageId || m._id === detail.clientMessageId
              ? { ...m, status: 'failed' as const }
              : m
          );
          persistMessages(updated);
          return updated;
        });
      }
    };
    window.addEventListener('kothahobe:message_failed', handleWindowMessageFailed);

    // 1. Incoming Message (0ms immediate delivery)
    const handleNewMessage = (newMsg: IMessage) => {
      if (newMsg.conversationId === conversationId) {
        const norm = normalizeMsg(newMsg);
        const recvTime = Date.now();
        const sendTime = norm.createdAt ? new Date(norm.createdAt).getTime() : recvTime;
        const latencyMs = Math.max(0, recvTime - sendTime);
        console.log(`[REALTIME_LATENCY] ⚡ Message received in 0ms delay: ${latencyMs}ms from server creation. ID: ${norm._id || norm.clientMessageId}`);

        setMessages((prev) => {
          const map = new Map<string, IMessage>();
          prev.forEach((m) => {
            const k = m._id || m.clientMessageId;
            if (k) map.set(k, m);
          });
          if (norm.clientMessageId && map.has(norm.clientMessageId)) {
            map.delete(norm.clientMessageId);
          }
          if (norm._id) map.set(norm._id, norm);

          const updated = Array.from(map.values()).sort(sortMsgList);
          persistMessages(updated);
          return updated;
        });

        markAsRead(conversationId);

        if (isNearBottomRef.current) {
          requestAnimationFrame(() => scrollToBottom(false));
        } else {
          setUnreadNewCount((cnt) => cnt + 1);
        }
      }
    };

    // 2. Sent Acknowledgement
    const handleMessageSent = (sentMsg: IMessage) => {
      if (sentMsg.conversationId === conversationId) {
        const norm = normalizeMsg(sentMsg);
        setMessages((prev) => {
          const updated = prev.map((m) =>
            m.clientMessageId === norm.clientMessageId || m._id === norm._id
              ? { ...m, ...norm, status: norm.status || 'sent' }
              : m
          );
          persistMessages(updated);
          return updated;
        });
      }
    };

    // 3. Reaction Updated
    const handleReactionUpdated = ({
      messageId,
      reactions,
    }: {
      messageId: string;
      reactions: any[];
    }) => {
      setMessages((prev) => {
        const updated = prev.map((m) => (m._id === messageId ? { ...m, reactions } : m));
        persistMessages(updated);
        return updated;
      });
    };

    // 4. Message Deleted
    const handleMessageDeleted = ({
      messageId,
      deleteForEveryone,
    }: {
      messageId: string;
      deleteForEveryone: boolean;
    }) => {
      setMessages((prev) => {
        let updated: IMessage[];
        if (deleteForEveryone) {
          updated = prev.map((m) =>
            m._id === messageId
              ? { ...m, text: 'This message was deleted', attachment: undefined, isDeletedForEveryone: true }
              : m
          );
        } else {
          updated = prev.filter((m) => m._id !== messageId);
        }
        persistMessages(updated);
        return updated;
      });
    };

    // 5. Read Receipt (0ms Live Real-time Seen Indicator)
    const handleMessageRead = (data: { conversationId?: string; readBy?: string; readAt?: string; messageId?: string }) => {
      if (!data) return;
      const targetConvId = data.conversationId?.toString();
      if (targetConvId && targetConvId !== conversationId?.toString()) {
        return;
      }

      const targetReadAt = data.readAt || new Date().toISOString();
      const currentUserIdStr = user?._id?.toString();
      const readerIdStr = data.readBy?.toString();

      // Outgoing messages sent by current user ONLY become 'read' (seen ✓✓ sky-blue)
      // when the OTHER party (readerIdStr && readerIdStr !== currentUserIdStr) reads them.
      const isOtherUserReading = Boolean(readerIdStr && currentUserIdStr && readerIdStr !== currentUserIdStr);

      if (!isOtherUserReading) {
        // If current user is reading their own chat, outgoing sent messages MUST NOT change to 'read'!
        return;
      }

      setMessages((prev) => {
        let hasChanges = false;
        const updated = prev.map((m) => {
          if (data.messageId && m._id !== data.messageId) {
            return m;
          }
          const senderIdStr = m.senderId?.toString() || (m.senderId as any)?._id?.toString();
          const isSentByMe = Boolean(currentUserIdStr && senderIdStr && senderIdStr === currentUserIdStr);

          // Only transition outgoing messages sent by me to 'read' (seen) when recipient read them
          if (isSentByMe && m.status !== 'read') {
            hasChanges = true;
            return { ...m, status: 'read' as const, readAt: targetReadAt };
          }
          return m;
        });

        if (hasChanges) {
          persistMessages(updated);
          return updated;
        }
        return prev;
      });
    };

    // 6. Delivered Receipt
    const handleMessageDelivered = ({
      _id,
      clientMessageId,
      conversationId: msgConvId,
      deliveredAt,
    }: {
      _id?: string;
      clientMessageId?: string;
      conversationId?: string;
      deliveredAt?: string;
    }) => {
      if (msgConvId && msgConvId !== conversationId) return;
      setMessages((prev) =>
        prev.map((m) => {
          if ((_id && m._id === _id) || (clientMessageId && m.clientMessageId === clientMessageId)) {
            if (m.status !== 'read') {
              return { ...m, status: 'delivered', deliveredAt };
            }
          }
          return m;
        })
      );
    };

    // 7. Typing Indicators
    const handleTypingStart = ({ userId, conversationId: typingConvId }: { userId: string; conversationId?: string }) => {
      if (typingConvId && typingConvId === conversationId && userId !== user?._id) {
        setIsTyping(true);
      } else if (recipient && userId === recipient._id) {
        setIsTyping(true);
      }
    };

    const handleTypingStop = ({ userId, conversationId: typingConvId }: { userId: string; conversationId?: string }) => {
      if (typingConvId && typingConvId === conversationId) {
        setIsTyping(false);
      } else if (recipient && userId === recipient._id) {
        setIsTyping(false);
      }
    };

    // 8. Presence
    const handleUserOnline = ({ userId }: { userId: string }) => {
      if (recipient && userId === recipient._id) {
        setRecipient((prev) => (prev ? { ...prev, isOnline: true } : null));
      }
    };

    const handleUserOffline = ({ userId, lastSeen }: { userId: string; lastSeen: string }) => {
      if (recipient && userId === recipient._id) {
        setRecipient((prev) => (prev ? { ...prev, isOnline: false, lastSeen } : null));
      }
    };

    // 9. Group Nickname Updated
    const handleNicknameUpdated = ({
      conversationId: updatedConvId,
      userId: targetUserId,
      nickname,
    }: {
      conversationId: string;
      userId: string;
      nickname: string | null;
    }) => {
      if (updatedConvId === conversationId) {
        setConversation((prev: any) => {
          if (!prev || !prev.groupMeta) return prev;
          const updatedNicknames = { ...(prev.groupMeta.nicknames || {}) };
          if (nickname) {
            updatedNicknames[targetUserId] = nickname;
          } else {
            delete updatedNicknames[targetUserId];
          }
          return {
            ...prev,
            groupMeta: {
              ...prev.groupMeta,
              nicknames: updatedNicknames,
            },
          };
        });
      }
    };

    // 10. Message Edited
    const handleMessageEdited = (editedMsg: IMessage) => {
      if (editedMsg.conversationId === conversationId) {
        setMessages((prev) => {
          const updated = prev.map((m) =>
            m._id === editedMsg._id ? { ...m, ...editedMsg } : m
          );
          persistMessages(updated);
          return updated;
        });
      }
    };

    // 11. Group-Only Typing Indicator Aggregate
    const handleGroupTypingUpdate = ({
      conversationId: typingConvId,
      userId: typingUserId,
      displayName,
      isTyping: userIsTyping,
    }: {
      conversationId: string;
      userId: string;
      displayName: string;
      isTyping: boolean;
    }) => {
      if (typingConvId !== conversationId || typingUserId === user?._id) return;

      setGroupTypingUsers((prev) => {
        const nextMap = new Map(prev);
        const existing = nextMap.get(typingUserId);
        if (existing?.timer) clearTimeout(existing.timer);

        if (!userIsTyping) {
          nextMap.delete(typingUserId);
        } else {
          const timer = setTimeout(() => {
            setGroupTypingUsers((current) => {
              const map = new Map(current);
              map.delete(typingUserId);
              return map;
            });
          }, 4000);
          nextMap.set(typingUserId, { displayName: displayName || 'Someone', timer });
        }
        return nextMap;
      });
    };

    // 12. View Once Opened Realtime Synchronization
    const handleViewOnceOpened = ({
      messageId,
      conversationId: msgConvId,
      openedBy,
      openedAt,
    }: {
      messageId: string;
      conversationId: string;
      openedBy: string;
      openedAt: string;
    }) => {
      if (msgConvId && msgConvId !== conversationId) return;
      setMessages((prev) => {
        const updated = prev.map((m) =>
          m._id === messageId
            ? { ...m, viewOnceOpenedAt: openedAt, viewOnceOpenedBy: (openedBy as any) }
            : m
        );
        persistMessages(updated);
        return updated;
      });
    };

    socket.on('message:new', handleNewMessage);
    socket.on('message:sent', handleMessageSent);
    socket.on('message:edited', handleMessageEdited);
    socket.on('message:reaction_updated', handleReactionUpdated);
    socket.on('message:deleted', handleMessageDeleted);
    socket.on('message:read', handleMessageRead);
    socket.on('message:delivered', handleMessageDelivered);
    socket.on('message:view_once_opened', handleViewOnceOpened);
    socket.on('typing:start', handleTypingStart);
    socket.on('typing:stop', handleTypingStop);
    socket.on('group:typing:update', handleGroupTypingUpdate);
    socket.on('user:online', handleUserOnline);
    socket.on('user:offline', handleUserOffline);
    const handleWindowMessageRead = (e: Event) => {
      const customEvent = e as CustomEvent<any>;
      if (customEvent.detail) {
        handleMessageRead(customEvent.detail);
      }
    };

    window.addEventListener('kothahobe:message_read', handleWindowMessageRead);
    window.addEventListener('kothahobe:conversation_read', handleWindowMessageRead);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('message:sent', handleMessageSent);
      socket.off('message:edited', handleMessageEdited);
      socket.off('message:reaction_updated', handleReactionUpdated);
      socket.off('message:deleted', handleMessageDeleted);
      socket.off('message:read', handleMessageRead);
      socket.off('message:delivered', handleMessageDelivered);
      socket.off('message:view_once_opened', handleViewOnceOpened);
      socket.off('typing:start', handleTypingStart);
      socket.off('typing:stop', handleTypingStop);
      socket.off('group:typing:update', handleGroupTypingUpdate);
      socket.off('user:online', handleUserOnline);
      socket.off('user:offline', handleUserOffline);
      socket.off('group:nickname_updated', handleNicknameUpdated);
      window.removeEventListener('kothahobe:message_sync', handleMessageSync);
      window.removeEventListener('kothahobe:message_saved', handleSavedEvent);
      window.removeEventListener('kothahobe:message_sent', handleWindowMessageSent);
      window.removeEventListener('kothahobe:message_failed', handleWindowMessageFailed);
      window.removeEventListener('kothahobe:message_read', handleWindowMessageRead);
      window.removeEventListener('kothahobe:conversation_read', handleWindowMessageRead);
    };
  }, [socket, conversationId, recipient, user, persistMessages, scrollToBottom]);

  // Load older messages with zero-jump scroll anchoring
  const handleLoadMore = async () => {
    if (!conversationId || !hasMore || isLoadingMoreRef.current || !oldestCursor) return;

    isLoadingMoreRef.current = true;
    setLoadingMore(true);

    try {
      const msgRes = await fetchMessagesApi(conversationId, oldestCursor, 30);
      if (msgRes.success && msgRes.messages && msgRes.messages.length > 0) {
        const container = scrollContainerRef.current;
        if (container) {
          scrollOffsetRef.current = {
            prevScrollHeight: container.scrollHeight,
            prevScrollTop: container.scrollTop,
          };
        }
        setMessages((prev) => {
          const existingIds = new Set(prev.map((m) => m._id || m.clientMessageId));
          const newOlder = (msgRes.messages || []).filter(
            (m) => !existingIds.has(m._id) && !existingIds.has(m.clientMessageId)
          );
          return [...newOlder, ...prev];
        });
        setHasMore(msgRes.hasMore);
        setOldestCursor(msgRes.oldestCursor);
      } else {
        setHasMore(false);
      }
    } catch (error) {
      console.error('[ChatRoom] Failed to load older messages:', error);
      scrollOffsetRef.current = null;
    } finally {
      isLoadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };

  // Resolve sender name or custom nickname for group chat messages
  const getSenderName = useCallback(
    (msg: IMessage): string => {
      if (!isGroup) return '';
      const senderId = msg.senderId;
      if (!senderId) return 'Member';

      // 1. Check custom nicknames in groupMeta (highest priority)
      if (conversation?.groupMeta?.nicknames) {
        const nicks = conversation.groupMeta.nicknames;
        const customNick =
          typeof (nicks as any).get === 'function'
            ? (nicks as any).get(senderId)
            : (nicks as any)[senderId];
        if (customNick && typeof customNick === 'string' && customNick.trim()) {
          return customNick.trim();
        }
      }

      // 2. Check group members for current live display name/username
      if (conversation?.groupMeta?.members) {
        const member = conversation.groupMeta.members.find((m: any) => {
          const uId = m.user?._id || m.user;
          return uId?.toString() === senderId.toString();
        });
        if (member?.user?.displayName) return member.user.displayName;
        if (member?.user?.username) return member.user.username;
      }

      // 3. Check conversation participants
      if (conversation?.participants) {
        const p = conversation.participants.find(
          (part: any) => (part._id || part)?.toString() === senderId.toString()
        );
        if (p && typeof p === 'object') {
          if (p.displayName) return p.displayName;
          if (p.username) return p.username;
        }
      }

      // 4. Last-resort fallback to msg.senderNickname if participant left group
      if (msg.senderNickname) return msg.senderNickname;

      return 'Member';
    },
    [isGroup, conversation]
  );

  // Send Message (Instant 0ms UI Rendering + Background Upload)
  const handleSendMessage = (
    text: string,
    type: 'text' | 'image' | 'audio' | 'document' | 'custom_emoji' = 'text',
    attachment?: IAttachment,
    replyTo?: IReplyTo,
    localFile?: File | Blob,
    viewOnce?: boolean
  ) => {
    if (!conversationId) return;
    if (!isGroup && !recipient) return;

    let mySenderNickname = user?.displayName || user?.username || '';
    if (isGroup && conversation?.groupMeta?.nicknames && user?._id) {
      const nicks = conversation.groupMeta.nicknames;
      const customNick =
        typeof (nicks as any).get === 'function'
          ? (nicks as any).get(user._id)
          : (nicks as any)[user._id];
      if (customNick) mySenderNickname = customNick;
    }

    const customEmojiId = type === 'custom_emoji' ? text.trim() : undefined;
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const optimisticMessage: IMessage = {
      _id: tempId,
      conversationId,
      senderId: user?._id || '',
      receiverId: isGroup ? undefined : recipient?._id,
      senderNickname: isGroup ? mySenderNickname : undefined,
      text: text.trim(),
      type,
      customEmojiId,
      attachment,
      replyTo,
      reactions: [],
      status: 'sending',
      clientMessageId: tempId,
      createdAt: new Date().toISOString(),
      viewOnce: !!viewOnce,
      viewOnceOpenedAt: null,
      viewOnceOpenedBy: null,
    };

    // 1. Instant 0ms display in chat
    setMessages((prev) => {
      const updated = [...prev, optimisticMessage];
      persistMessages(updated);
      return updated;
    });

    requestAnimationFrame(() => scrollToBottom(true));
    setReplyingTo(null);

    // 2. If a local media file needs background uploading
    if (localFile && attachment) {
      uploadMediaApi(localFile, attachment.fileName, conversationId, type)
        .then((res) => {
          if (res.success && res.attachment) {
            const serverAttachment: IAttachment = {
              ...res.attachment,
              duration: attachment.duration,
            };

            // Update optimistic message with real server attachment URL
            setMessages((prev) => {
              const updated = prev.map((m) =>
                m.clientMessageId === tempId ? { ...m, attachment: serverAttachment, viewOnce: !!viewOnce } : m
              );
              persistMessages(updated);
              return updated;
            });

            // Dispatch message via centralized sendMessage engine (handles live socket and offline outbox)
            sendMessage(
              conversationId,
              isGroup ? undefined : recipient?._id,
              text.trim(),
              tempId,
              type,
              serverAttachment,
              replyTo,
              customEmojiId,
              viewOnce
            );
          } else {
            // Mark failed on server error
            setMessages((prev) => {
              const updated = prev.map((m) =>
                m.clientMessageId === tempId ? { ...m, status: 'failed' as const } : m
              );
              persistMessages(updated);
              return updated;
            });
            showToast(res.message || 'Upload failed. Tap to retry.');
          }
        })
        .catch((err) => {
          console.error('[Upload] Background error:', err);
          setMessages((prev) => {
            const updated = prev.map((m) =>
              m.clientMessageId === tempId ? { ...m, status: 'failed' as const } : m
            );
            persistMessages(updated);
            return updated;
          });
          showToast('Network error while uploading.');
        });
      return;
    }

    // 3. Regular text/emoji message dispatch via centralized sendMessage engine
    sendMessage(
      conversationId,
      isGroup ? undefined : recipient?._id,
      text.trim(),
      tempId,
      type,
      attachment,
      replyTo,
      customEmojiId,
      viewOnce
    );
  };

  // 1. Native Media Viewer
  const handleOpenMedia = useCallback((msg: IMessage) => {
    if (msg.viewOnce) {
      if (msg.viewOnceOpenedAt) {
        showToast('This media has already been opened');
        return;
      }
      if (msg.senderId === user?._id) {
        showToast('View once media can only be opened by the recipient');
        return;
      }
      setActiveViewOnceModal(msg);
      return;
    }
    setActiveMediaModal(msg);
  }, [user?._id]);

  // 2. Native Document Open (Default Reader App)
  const handleOpenDocument = useCallback(async (msg: IMessage) => {
    if (!msg.attachment?.url) return;
    const fileName = msg.attachment.fileName || 'document.pdf';
    const mimeType = msg.attachment.mimeType || 'application/pdf';

    const res = await fileCacheService.openFile({
      fileUrl: msg.attachment.url,
      fileName,
      mimeType,
      messageId: msg._id,
    });
    if (!res.success) {
      if (res.error === 'NO_APP') {
        setActiveDocModal(msg);
      }
    }
  }, []);

  // 3. Native Document Download with Live Progress
  const handleDownloadDocument = useCallback(async (msg: IMessage) => {
    if (!msg.attachment?.url) return;
    const fileName = msg.attachment.fileName || 'document.pdf';
    const mimeType = msg.attachment.mimeType || 'application/pdf';

    await fileCacheService.downloadFile({
      fileUrl: msg.attachment.url,
      fileName,
      mimeType,
      totalBytes: msg.attachment.size,
      messageId: msg._id,
    });
  }, []);

  // React to Message
  const handleReact = useCallback((messageId: string, emoji: string) => {
    if (!socket || !conversationId) return;
    socket.emit('message:react', { messageId, conversationId, emoji });
  }, [socket, conversationId]);

  // Delete Message (Instant local optimistic delete + Outbox purge + Socket/REST sync)
  const handleDelete = useCallback((messageId: string, deleteForEveryone: boolean = false) => {
    if (!conversationId) return;

    // 1. Purge from outbox if it's pending / stuck / failed
    const targetMsg = messages.find((m) => m._id === messageId || m.clientMessageId === messageId);
    const clientMessageId = targetMsg?.clientMessageId || (messageId.startsWith('temp_') ? messageId : undefined);
    if (clientMessageId) {
      removeOutboxItem(clientMessageId);
    }

    // 2. Immediately update local state & localStorage cache
    setMessages((prev) => {
      let updated: IMessage[];
      if (deleteForEveryone && !messageId.startsWith('temp_')) {
        updated = prev.map((m) =>
          m._id === messageId
            ? { ...m, text: 'This message was deleted', attachment: undefined, isDeletedForEveryone: true }
            : m
        );
      } else {
        updated = prev.filter((m) => m._id !== messageId && m.clientMessageId !== messageId);
      }
      persistMessages(updated);
      return updated;
    });

    // 3. If it's a real server message (persisted in DB), sync with server
    if (!messageId.startsWith('temp_')) {
      if (socket && socket.connected) {
        socket.emit('message:delete', { messageId, conversationId, deleteForEveryone });
      }
      // Proactively call REST delete for guaranteed persistence
      deleteMessageRestApi(messageId, conversationId, deleteForEveryone).catch((err) => {
        console.warn('[Chat] Delete REST note:', err?.message || err);
      });
    }

    showToast(deleteForEveryone ? 'Message deleted for everyone' : 'Message deleted');
  }, [conversationId, messages, removeOutboxItem, persistMessages, socket]);

  // Reply to Message
  const handleReply = useCallback((msg: IMessage) => {
    const isMine = msg.senderId === user?._id;
    const senderName = isMine
      ? 'You'
      : (isGroup ? getSenderName(msg) : (recipient?.displayName || recipient?.username || 'User'));

    setReplyingTo({
      messageId: msg._id,
      text: msg.text,
      senderName,
      type: msg.type,
      fileName: msg.attachment?.fileName,
    });
  }, [user, recipient, isGroup, getSenderName]);

  const handleTyping = useCallback(() => {
    if (!conversationId) return;
    if (isGroup) {
      socket?.emit('group:typing:start', { conversationId });
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        socket?.emit('group:typing:stop', { conversationId });
      }, 2500);
    } else {
      startTyping(conversationId, recipient?._id);
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        stopTyping(conversationId, recipient?._id);
      }, 2500);
    }
  }, [conversationId, isGroup, recipient, socket, startTyping, stopTyping]);

  const handleSaveEdit = useCallback(async (messageId: string, newText: string) => {
    try {
      // Optimistic update
      setMessages((prev) => {
        const updated = prev.map((m) =>
          m._id === messageId ? { ...m, text: newText, editedAt: new Date().toISOString() } : m
        );
        persistMessages(updated);
        return updated;
      });
      setEditingMessage(null);

      const res = await editMessageApi(messageId, newText);
      if (res.success && res.message) {
        setMessages((prev) => {
          const updated = prev.map((m) =>
            m._id === messageId ? { ...m, ...res.message } : m
          );
          persistMessages(updated);
          return updated;
        });
      }
    } catch (err: any) {
      showToast(err.response?.data?.message || 'Failed to edit message');
    }
  }, [persistMessages]);

  const handleRetryMessage = useCallback((msg: IMessage) => {
    if (!conversationId) return;
    if (!isGroup && !recipient) return;

    setMessages((prev) => {
      const updated = prev.map((m) =>
        (m._id === msg._id || m.clientMessageId === msg.clientMessageId)
          ? { ...m, status: 'sending' as const }
          : m
      );
      persistMessages(updated);
      return updated;
    });

    sendMessage(
      conversationId,
      isGroup ? undefined : recipient?._id,
      msg.text || '',
      msg.clientMessageId || msg._id,
      msg.type,
      msg.attachment,
      msg.replyTo,
      msg.customEmojiId
    );
  }, [conversationId, isGroup, recipient, sendMessage, persistMessages]);

  const filteredMessages = showSearch && searchQuery.trim()
    ? messages.filter(
        (m) =>
          m.text?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.attachment?.fileName?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

  const headerTitle = isGroup
    ? groupMeta?.name || 'Group Chat'
    : recipient?.displayName || recipient?.username || 'Chat';

  const headerAvatarUrl = isGroup ? groupMeta?.avatarUrl : recipient?.avatarUrl;

  const groupTypingNames = Array.from(groupTypingUsers.values()).map((u) => u.displayName);
  const groupTypingText =
    groupTypingNames.length === 1
      ? `${groupTypingNames[0]} is typing...`
      : groupTypingNames.length === 2
      ? `${groupTypingNames[0]} and ${groupTypingNames[1]} are typing...`
      : groupTypingNames.length > 2
      ? `${groupTypingNames[0]} and ${groupTypingNames.length - 1} others are typing...`
      : null;

  return (
    <div
      style={{ backgroundColor: themeConfig.bg }}
      className="h-full w-full flex flex-col overflow-hidden transition-colors duration-200"
    >
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-chat-card border border-chat-border text-chat-textPrimary text-xs font-semibold shadow-2xl animate-fade-in">
          {toastMessage}
        </div>
      )}

      {/* Full-Screen Media Viewer Modal */}
      {activeMediaModal && (
        <MediaViewerModal
          message={activeMediaModal}
          onClose={() => setActiveMediaModal(null)}
        />
      )}

      {/* View Once Media Viewer Modal (Protected single-view) */}
      {activeViewOnceModal && (
        <ViewOnceViewerModal
          message={activeViewOnceModal}
          onClose={() => setActiveViewOnceModal(null)}
          onOpened={(messageId, openedAt) => {
            setMessages((prev) => {
              const updated = prev.map((m) =>
                m._id === messageId
                  ? { ...m, viewOnceOpenedAt: openedAt, viewOnceOpenedBy: (user?._id as any) || null }
                  : m
              );
              persistMessages(updated);
              return updated;
            });
          }}
        />
      )}

      {/* Document Viewer Modal (Fallback when no native app installed) */}
      {activeDocModal && (
        <DocumentViewerModal
          message={activeDocModal}
          onClose={() => setActiveDocModal(null)}
        />
      )}

      {/* Top Floating Message Action Menu / Reactions Sheet */}
      {actionMenuMessage && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-start pt-16 px-4 animate-fade-in"
          onClick={() => setActionMenuMessage(null)}
          onTouchStart={(e) => {
            if (e.target === e.currentTarget) {
              setActionMenuMessage(null);
            }
          }}
        >
          <div
            className="bg-chat-card border border-chat-border rounded-2xl p-4 w-full max-w-sm shadow-2xl space-y-3 animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Top Header / Close Bar */}
            <div className="flex items-center justify-between border-b border-chat-divider pb-2.5">
              <span className="text-xs font-semibold text-brand-600 dark:text-brand-400">
                Message Options
              </span>
              <button
                onClick={() => setActionMenuMessage(null)}
                className="p-1 rounded-full text-chat-textMuted hover:text-chat-textPrimary hover:bg-chat-surfaceSecondary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Reactions Bar */}
            <div className="space-y-2 bg-chat-surfaceSecondary p-2.5 rounded-2xl border border-chat-border">
              {/* Unicode Reactions */}
              <div className="flex items-center justify-between text-2xl">
                {QUICK_REACTIONS.map((emoji) => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      handleReact(actionMenuMessage._id, emoji);
                      setActionMenuMessage(null);
                    }}
                    className="hover:scale-125 active:scale-95 transition-transform p-1 cursor-pointer touch-manipulation"
                    title={`React ${emoji}`}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              {/* Animated Custom Emoji Reactions */}
              <div className="pt-2 border-t border-chat-border/60 flex items-center justify-between gap-1">
                {QUICK_ANIMATED_REACTIONS.map((emojiId) => (
                  <button
                    key={emojiId}
                    type="button"
                    onClick={() => {
                      handleReact(actionMenuMessage._id, emojiId);
                      setActionMenuMessage(null);
                    }}
                    className="p-1 rounded-xl bg-chat-panel/80 hover:bg-chat-panel active:scale-95 transition-transform cursor-pointer border border-chat-border/50 hover:border-brand-500/50 shadow-2xs"
                    title={`React with animated ${emojiId}`}
                  >
                    <AnimatedCustomEmoji
                      emojiId={emojiId}
                      size={28}
                      autoPlay={false}
                      loop={false}
                      interactive={false}
                    />
                  </button>
                ))}
              </div>
            </div>

            {/* Action Items */}
            <div className="space-y-1 divide-y divide-chat-divider text-sm">
              {/* Retry sending if message is stuck sending or failed */}
              {(actionMenuMessage.status === 'failed' ||
                actionMenuMessage.status === 'sending' ||
                actionMenuMessage._id.startsWith('temp_')) && (
                <button
                  type="button"
                  onClick={() => {
                    const msg = actionMenuMessage;
                    setActionMenuMessage(null);
                    handleRetryMessage(msg);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-chat-surfaceSecondary text-brand-600 dark:text-brand-400 font-semibold rounded-lg transition-colors text-left"
                >
                  <RotateCw className="w-4 h-4 text-brand-500" />
                  <span>Retry Sending</span>
                </button>
              )}

              {actionMenuMessage.reactions && actionMenuMessage.reactions.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    const msg = actionMenuMessage;
                    setActionMenuMessage(null);
                    setReactionListMessage(msg);
                    setReactionListInitialEmoji('all');
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-chat-surfaceSecondary text-brand-600 dark:text-brand-400 font-semibold rounded-lg transition-colors text-left"
                >
                  <Sparkles className="w-4 h-4 text-brand-500" />
                  <span>View All Reactions ({actionMenuMessage.reactions.length})</span>
                </button>
              )}
              
              {/* Reply */}
              {actionMenuMessage.status !== 'failed' && (
                <button
                  onClick={() => {
                    handleReply(actionMenuMessage);
                    setActionMenuMessage(null);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-chat-surfaceSecondary text-chat-textPrimary rounded-lg transition-colors text-left"
                >
                  <CornerUpLeft className="w-4 h-4 text-brand-500" />
                  <span>Reply</span>
                </button>
              )}

              {/* Forward Message */}
              {actionMenuMessage.type !== 'system' &&
                !actionMenuMessage.viewOnce &&
                !actionMenuMessage.isDeletedForEveryone &&
                actionMenuMessage.status !== 'failed' &&
                !actionMenuMessage._id.startsWith('temp_') && (
                  <button
                    onClick={() => {
                      const msg = actionMenuMessage;
                      setActionMenuMessage(null);
                      setForwardingMessage(msg);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-chat-surfaceSecondary text-chat-textPrimary rounded-lg transition-colors text-left"
                  >
                    <CornerUpRight className="w-4 h-4 text-emerald-500" />
                    <span>Forward</span>
                  </button>
              )}

              {/* View Once Media Open Action (Recipient only, Unopened only) */}
              {actionMenuMessage.viewOnce &&
                !actionMenuMessage.viewOnceOpenedAt &&
                actionMenuMessage.senderId !== user?._id && (
                  <button
                    onClick={() => {
                      const msg = actionMenuMessage;
                      setActionMenuMessage(null);
                      handleOpenMedia(msg);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-chat-surfaceSecondary text-brand-600 dark:text-brand-400 font-semibold rounded-lg transition-colors text-left"
                  >
                    <ExternalLink className="w-4 h-4 text-brand-500" />
                    <span>Open View Once</span>
                  </button>
              )}

              {/* Edit Message (Sender only, Text message, within 15 minutes) */}
              {actionMenuMessage.senderId === user?._id &&
                actionMenuMessage.type === 'text' &&
                !actionMenuMessage.viewOnce &&
                !actionMenuMessage.isDeletedForEveryone &&
                !actionMenuMessage._id.startsWith('temp_') &&
                Date.now() - new Date(actionMenuMessage.createdAt).getTime() <= 15 * 60 * 1000 && (
                  <button
                    onClick={() => {
                      const msg = actionMenuMessage;
                      setActionMenuMessage(null);
                      setEditingMessage(msg);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-chat-surfaceSecondary text-brand-600 dark:text-brand-400 font-semibold rounded-lg transition-colors text-left"
                  >
                    <Pencil className="w-4 h-4 text-brand-500" />
                    <span>Edit Message</span>
                  </button>
              )}

              {actionMenuMessage.text && !actionMenuMessage.viewOnce && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(actionMenuMessage.text || '');
                    showToast('Text copied to clipboard');
                    setActionMenuMessage(null);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-chat-surfaceSecondary text-chat-textPrimary rounded-lg transition-colors text-left"
                >
                  <Copy className="w-4 h-4 text-chat-textMuted" />
                  <span>Copy Text</span>
                </button>
              )}

              {actionMenuMessage.attachment && !actionMenuMessage.viewOnce && (
                <button
                  onClick={() => {
                    if (actionMenuMessage.type === 'image') handleOpenMedia(actionMenuMessage);
                    else if (actionMenuMessage.type === 'document') handleOpenDocument(actionMenuMessage);
                    setActionMenuMessage(null);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-chat-surfaceSecondary text-chat-textPrimary rounded-lg transition-colors text-left"
                >
                  <ExternalLink className="w-4 h-4 text-sky-500" />
                  <span>Open Attachment</span>
                </button>
              )}

              {actionMenuMessage.type === 'document' && (
                <button
                  onClick={() => {
                    handleDownloadDocument(actionMenuMessage);
                    setActionMenuMessage(null);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-chat-surfaceSecondary text-chat-textPrimary rounded-lg transition-colors text-left"
                >
                  <Download className="w-4 h-4 text-emerald-500" />
                  <span>Download to Device</span>
                </button>
              )}

              {/* Delete Options */}
              {actionMenuMessage._id.startsWith('temp_') || actionMenuMessage.status === 'failed' || actionMenuMessage.status === 'sending' ? (
                <button
                  onClick={() => {
                    handleDelete(actionMenuMessage._id, false);
                    setActionMenuMessage(null);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-red-500/10 text-red-500 rounded-lg transition-colors text-left font-medium"
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                  <span>Delete Message</span>
                </button>
              ) : (
                <>
                  <button
                    onClick={() => {
                      handleDelete(actionMenuMessage._id, false);
                      setActionMenuMessage(null);
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-chat-surfaceSecondary text-chat-textMuted hover:text-red-500 rounded-lg transition-colors text-left"
                  >
                    <Trash2 className="w-4 h-4 text-chat-textMuted" />
                    <span>Delete for me</span>
                  </button>

                  {actionMenuMessage.senderId === user?._id && (
                    <button
                      onClick={() => {
                        handleDelete(actionMenuMessage._id, true);
                        setActionMenuMessage(null);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-red-500/10 text-red-500 rounded-lg transition-colors text-left"
                    >
                      <Trash2 className="w-4 h-4 text-red-500" />
                      <span>Delete for everyone</span>
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Top Header */}
      <header
        style={{ backgroundColor: themeConfig.panel }}
        className="px-2.5 pt-10 pb-2.5 border-b border-chat-border flex items-center justify-between flex-shrink-0 z-10 transition-colors duration-200 gap-1.5"
      >
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <button
            onClick={() => navigate('/chats')}
            className="p-1.5 -ml-1 rounded-full hover:bg-chat-surfaceSecondary text-chat-textMuted hover:text-chat-textPrimary transition-colors flex-shrink-0"
            title="Back to Chats"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div
            onClick={() =>
              navigate(isGroup ? `/group/${conversationId}/info` : `/chat/${conversationId}/info`)
            }
            className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer hover:opacity-90 transition-opacity overflow-hidden"
          >
            <div className="relative flex-shrink-0">
              <Avatar
                src={headerAvatarUrl}
                name={headerTitle}
                isOnline={isGroup ? undefined : recipient?.isOnline}
                size="sm"
              />
              {isGroup && (
                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-600 border border-chat-panel flex items-center justify-center text-white">
                  <Users className="w-2.5 h-2.5" />
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1 overflow-hidden">
              <h2 className="text-sm font-semibold text-chat-textPrimary truncate leading-tight">
                {headerTitle}
              </h2>
              <p className="text-[11px] text-chat-textSecondary truncate mt-0.5 leading-none">
                {isGroup ? (
                  groupTypingText ? (
                    <span className="text-brand-500 font-medium animate-pulse">{groupTypingText}</span>
                  ) : (
                    <span className="text-chat-textSecondary font-medium">
                      {groupMeta?.members?.length || 1} members
                    </span>
                  )
                ) : isTyping ? (
                  <span className="text-brand-500 font-medium animate-pulse">typing...</span>
                ) : recipient?.isOnline ? (
                  <span className="text-emerald-500 font-medium">online</span>
                ) : recipient?.lastSeen ? (
                  <span>{formatLastSeen(recipient.lastSeen)}</span>
                ) : (
                  <span>offline</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {/* Video Call Button */}
          <button
            type="button"
            onClick={() => {
              if (isGroup && conversationId) {
                startGroupCall(
                  conversationId,
                  headerTitle,
                  headerAvatarUrl,
                  'video'
                );
              } else if (recipient && conversationId) {
                startCall(
                  {
                    _id: recipient._id,
                    displayName: recipient.displayName || recipient.username || 'User',
                    avatarUrl: recipient.avatarUrl,
                    username: recipient.username,
                  },
                  conversationId,
                  'video'
                );
              }
            }}
            className="p-1.5 rounded-full text-brand-500 hover:text-brand-600 hover:bg-chat-surfaceSecondary active:scale-95 transition-all"
            title={isGroup ? 'Start Group Video Call' : 'Start Video Call'}
          >
            <Video className="w-4 h-4" />
          </button>

          {/* Voice Call Button */}
          <button
            type="button"
            onClick={() => {
              if (isGroup && conversationId) {
                startGroupCall(
                  conversationId,
                  headerTitle,
                  headerAvatarUrl,
                  'voice'
                );
              } else if (recipient && conversationId) {
                startCall(
                  {
                    _id: recipient._id,
                    displayName: recipient.displayName || recipient.username || 'User',
                    avatarUrl: recipient.avatarUrl,
                    username: recipient.username,
                  },
                  conversationId,
                  'voice'
                );
              }
            }}
            className="p-1.5 rounded-full text-emerald-500 hover:text-emerald-600 hover:bg-chat-surfaceSecondary active:scale-95 transition-all"
            title={isGroup ? 'Start Group Voice Call' : 'Start Voice Call'}
          >
            <Phone className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowSearch(!showSearch)}
            className={`p-1.5 rounded-full transition-colors ${
              showSearch ? 'bg-chat-surfaceSecondary text-brand-500' : 'text-chat-textMuted hover:text-chat-textPrimary'
            }`}
            title="Search in Chat"
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            onClick={() =>
              navigate(isGroup ? `/group/${conversationId}/info` : `/chat/${conversationId}/info`)
            }
            className="p-1.5 rounded-full text-chat-textMuted hover:text-chat-textPrimary transition-colors"
            title={isGroup ? 'Group Info' : 'Chat Info'}
          >
            <MoreVertical className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* In-Chat Live Group Call Banner */}
      {isGroup && conversationId && (
        <GroupCallBanner
          conversationId={conversationId}
          groupName={headerTitle}
          groupAvatar={headerAvatarUrl}
        />
      )}

      {/* In-Chat Search Bar */}
      {showSearch && (
        <div className="px-4 py-2 bg-chat-panel border-b border-chat-border flex items-center gap-2 animate-fade-in">
          <Search className="w-4 h-4 text-chat-textMuted" />
          <input
            type="text"
            placeholder="Search in this conversation..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-chat-textPrimary text-xs outline-none placeholder:text-chat-textTertiary"
            autoFocus
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-chat-textMuted hover:text-chat-textPrimary">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Floating Loading Older Messages Pill (Zero Layout Shift) */}
      {loadingMore && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 z-20 pointer-events-none animate-fade-in">
          <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-chat-card/95 backdrop-blur-md border border-chat-border shadow-md text-chat-textSecondary text-[11px] font-medium">
            <div className="w-3.5 h-3.5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
            <span>Loading earlier messages...</span>
          </div>
        </div>
      )}

      {/* Messages Scroll Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={{ backgroundColor: themeConfig.bg, overflowAnchor: 'none' }}
        className="flex-1 overflow-y-auto p-4 space-y-3 flex flex-col select-text transition-colors duration-200 relative hardware-accelerated overscroll-contain"
      >

        {loading ? (
          <div className="space-y-4 py-2">
            <MessageSkeleton isMe={false} />
            <MessageSkeleton isMe={true} />
            <MessageSkeleton isMe={false} />
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-chat-textMuted">
            <p className="text-xs max-w-xs">
              {showSearch
                ? 'No messages matching search.'
                : isGroup
                ? 'No messages yet in this group. Say hello to everyone!'
                : 'No messages yet. Say hello to start the conversation!'}
            </p>
          </div>
        ) : (
          filteredMessages.map((msg, index) => {
            const isMine = msg.senderId === user?._id;
            const prevMsg = filteredMessages[index - 1];
            const nextMsg = filteredMessages[index + 1];

            const showDateHeader =
              !prevMsg ||
              new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();

            const nextDateHeader =
              nextMsg &&
              new Date(nextMsg.createdAt).toDateString() !== new Date(msg.createdAt).toDateString();

            const isSameSenderAsPrev =
              prevMsg &&
              prevMsg.senderId === msg.senderId &&
              prevMsg.type !== 'system' &&
              msg.type !== 'system' &&
              Math.abs(new Date(msg.createdAt).getTime() - new Date(prevMsg.createdAt).getTime()) < 60000 &&
              !showDateHeader;

            const isSameSenderAsNext =
              nextMsg &&
              nextMsg.senderId === msg.senderId &&
              nextMsg.type !== 'system' &&
              msg.type !== 'system' &&
              Math.abs(new Date(nextMsg.createdAt).getTime() - new Date(msg.createdAt).getTime()) < 60000 &&
              !nextDateHeader;

            let positionInGroup: 'single' | 'first' | 'middle' | 'last' = 'single';
            if (isSameSenderAsPrev && isSameSenderAsNext) {
              positionInGroup = 'middle';
            } else if (!isSameSenderAsPrev && isSameSenderAsNext) {
              positionInGroup = 'first';
            } else if (isSameSenderAsPrev && !isSameSenderAsNext) {
              positionInGroup = 'last';
            }

            return (
              <React.Fragment key={msg.clientMessageId || msg._id}>
                {showDateHeader && (
                  <div className="flex justify-center my-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-chat-textSecondary bg-chat-card/90 px-3 py-1 rounded-full border border-chat-border shadow-xs">
                      {formatChatListDate(msg.createdAt)}
                    </span>
                  </div>
                )}

                <MessageBubble
                  message={msg}
                  isMe={isMine}
                  isGroup={isGroup}
                  positionInGroup={positionInGroup}
                  isHighlighted={Boolean(activeHighlightId && (msg._id === activeHighlightId || msg.clientMessageId === activeHighlightId))}
                  senderDisplayName={getSenderName(msg)}
                  currentUserId={user?._id}
                  onOpenMedia={handleOpenMedia}
                  onOpenDocument={handleOpenDocument}
                  onDownloadDocument={handleDownloadDocument}
                  onReply={handleReply}
                  onReact={handleReact}
                  onOpenReactions={(targetMsg, emoji) => {
                    setReactionListMessage(targetMsg);
                    setReactionListInitialEmoji(emoji || 'all');
                  }}
                  onDelete={handleDelete}
                  onRetry={handleRetryMessage}
                  onActionMenu={setActionMenuMessage}
                />
              </React.Fragment>
            );
          })
        )}

        {/* Dynamic In-Chat Typing Bubble (1-on-1 Chats) */}
        {!isGroup && isTyping && (
          <div className="flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-chat-bubbleIn border border-chat-bubbleInBorder w-fit mb-1 animate-fade-in shadow-2xs">
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '0ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '150ms' }} />
            <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        )}

        {/* Dynamic In-Chat Typing Bubble (Group Chats) */}
        {isGroup && groupTypingUsers.size > 0 && (
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-chat-bubbleIn border border-chat-bubbleInBorder w-fit mb-1 animate-fade-in shadow-2xs">
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
            <span className="text-xs text-chat-textSecondary font-medium">
              {groupTypingText}
            </span>
          </div>
        )}

        <div ref={bottomAnchorRef} className="h-0 w-0" />
      </div>

      {/* Floating "↓ X New Messages" Pill */}
      {unreadNewCount > 0 && (
        <button
          onClick={() => scrollToBottom(false)}
          className="fixed bottom-20 right-6 z-30 px-3 py-1.5 rounded-full bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-2xl animate-bounce-short active:scale-95 transition-all"
        >
          <ChevronDown className="w-4 h-4" />
          <span>{unreadNewCount} new {unreadNewCount === 1 ? 'message' : 'messages'}</span>
        </button>
      )}

      {/* Message Composer */}
      <MessageComposer
        onSend={handleSendMessage}
        onTyping={handleTyping}
        replyingTo={replyingTo}
        onCancelReply={() => setReplyingTo(null)}
        editingMessage={editingMessage}
        onSaveEdit={handleSaveEdit}
        onCancelEdit={() => setEditingMessage(null)}
        disabled={!isGroup && !recipient}
      />

      {/* Reaction User List Modal / Bottom Sheet */}
      {reactionListMessage && (
        <ReactionListModal
          message={reactionListMessage}
          currentUserId={user?._id}
          participants={conversation?.participants}
          groupMeta={conversation?.groupMeta}
          initialEmoji={reactionListInitialEmoji}
          onRemoveReaction={handleReact}
          onClose={() => setReactionListMessage(null)}
        />
      )}

      {/* Forward Message Modal */}
      {forwardingMessage && (
        <ForwardMessageModal
          message={forwardingMessage}
          onClose={() => setForwardingMessage(null)}
          onForwardSuccess={() => {
            showToast('Message forwarded successfully');
          }}
        />
      )}
    </div>
  );
};
