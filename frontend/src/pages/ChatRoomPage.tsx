import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchMessagesApi } from '../api/messageApi';
import { fetchConversations } from '../api/conversationApi';
import { IMessage, IUser } from '../types';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../context/ThemeContext';
import { Avatar } from '../components/common/Avatar';
import { MessageBubble } from '../components/chat/MessageBubble';
import { MessageComposer } from '../components/chat/MessageComposer';
import { MessageSkeleton } from '../components/common/Skeleton';
import { formatLastSeen, formatChatListDate } from '../utils/dateUtils';
import { ArrowLeft, WifiOff } from 'lucide-react';

export const ChatRoomPage: React.FC = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { user } = useAuth();
  const { socket, isConnected, sendMessage, markAsRead, startTyping, stopTyping, setActiveConversationId } = useSocket();
  const { themeConfig } = useTheme();
  const navigate = useNavigate();

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

  // ⚡ Instant Render: Load cached messages immediately for 0ms chat opening
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

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced LocalStorage save (prevents main thread stutter during rapid sending)
  const persistMessages = useCallback((msgs: IMessage[]) => {
    if (!conversationId) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(`kotha_hobe_msgs_${conversationId}`, JSON.stringify(msgs));
      } catch {}
    }, 400);
  }, [conversationId]);

  // Instant hardware scroll (replaces heavy animation loop with fluid 60fps positioning)
  const scrollToBottom = useCallback((instant = false) => {
    if (scrollContainerRef.current) {
      if (instant) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      } else {
        scrollContainerRef.current.scrollTo({
          top: scrollContainerRef.current.scrollHeight,
          behavior: 'smooth',
        });
      }
    }
  }, []);

  // Set Active Conversation ID
  useEffect(() => {
    if (conversationId) {
      setActiveConversationId(conversationId);
    }
    return () => {
      setActiveConversationId(null);
    };
  }, [conversationId, setActiveConversationId]);

  // Load conversation details & initial messages
  useEffect(() => {
    if (!conversationId) return;

    const initChat = async () => {
      if (!localStorage.getItem(`kotha_hobe_msgs_${conversationId}`)) {
        setLoading(true);
      }
      try {
        const convsRes = await fetchConversations();
        if (convsRes.success && convsRes.conversations) {
          const currentConv = convsRes.conversations.find((c) => c._id === conversationId);
          if (currentConv) {
            setRecipient(currentConv.recipient);
          }
        }

        const msgRes = await fetchMessagesApi(conversationId, undefined, 30);
        if (msgRes.success && msgRes.messages) {
          setMessages((prev) => {
            const pendingOptimistic = prev.filter(
              (m) =>
                m._id.startsWith('temp_') &&
                !msgRes.messages.some((serverM) => serverM.clientMessageId === m.clientMessageId)
            );
            const merged = [...msgRes.messages, ...pendingOptimistic];
            persistMessages(merged);
            return merged;
          });
          setHasMore(msgRes.hasMore);
          setOldestCursor(msgRes.oldestCursor);
        }
      } catch (error) {
        console.warn('[ChatRoom] Background sync notice');
      } finally {
        setLoading(false);
        setTimeout(() => scrollToBottom(true), 60);
      }
    };

    initChat();
  }, [conversationId, persistMessages, scrollToBottom]);

  // Join socket conversation room & mark messages as read
  useEffect(() => {
    if (!socket || !conversationId) return;

    socket.emit('conversation:join', conversationId);
    markAsRead(conversationId);

    return () => {
      socket.emit('conversation:leave', conversationId);
    };
  }, [socket, conversationId]);

  // Real-time Socket event listeners
  useEffect(() => {
    if (!socket || !conversationId) return;

    // New incoming message from recipient
    const handleNewMessage = (newMsg: IMessage) => {
      if (newMsg.conversationId === conversationId) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === newMsg._id || m.clientMessageId === newMsg.clientMessageId)) {
            return prev;
          }
          const updated = [...prev, newMsg];
          persistMessages(updated);
          return updated;
        });

        markAsRead(conversationId);
        scrollToBottom(true);
      }
    };

    // Message sent acknowledgement from server (fluid merge)
    const handleMessageSent = (sentMsg: IMessage) => {
      if (sentMsg.conversationId === conversationId) {
        setMessages((prev) => {
          const updated = prev.map((m) =>
            m.clientMessageId === sentMsg.clientMessageId || m._id === sentMsg._id
              ? { ...m, ...sentMsg, text: sentMsg.text || m.text, status: sentMsg.status || 'sent' }
              : m
          );
          persistMessages(updated);
          return updated;
        });
      }
    };

    // Delivery receipt update
    const handleMessageDelivered = ({ messageId, deliveredAt }: { messageId: string; deliveredAt: string }) => {
      setMessages((prev) =>
        prev.map((m) => (m._id === messageId ? { ...m, status: 'delivered', deliveredAt } : m))
      );
    };

    // Read receipt update
    const handleMessageRead = ({ messageId, readAt }: { messageId: string; readAt: string }) => {
      setMessages((prev) => prev.map((m) => (m._id === messageId ? { ...m, status: 'read', readAt } : m)));
    };

    // Recipient typing indicator
    const handleTypingStart = ({ userId }: { userId: string }) => {
      if (recipient && userId === recipient._id) {
        setIsTyping(true);
      }
    };

    const handleTypingStop = ({ userId }: { userId: string }) => {
      if (recipient && userId === recipient._id) {
        setIsTyping(false);
      }
    };

    // User online status update
    const handleUserOnline = ({ userId }: { userId: string }) => {
      if (recipient && userId === recipient._id) {
        setRecipient((prev) => (prev ? { ...prev, isOnline: true } : null));
      }
    };

    // User offline status update
    const handleUserOffline = ({ userId, lastSeen }: { userId: string; lastSeen: string }) => {
      if (recipient && userId === recipient._id) {
        setRecipient((prev) => (prev ? { ...prev, isOnline: false, lastSeen } : null));
      }
    };

    socket.on('message:new', handleNewMessage);
    socket.on('message:sent', handleMessageSent);
    socket.on('message:delivered', handleMessageDelivered);
    socket.on('message:read', handleMessageRead);
    socket.on('typing:start', handleTypingStart);
    socket.on('typing:stop', handleTypingStop);
    socket.on('user:online', handleUserOnline);
    socket.on('user:offline', handleUserOffline);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('message:sent', handleMessageSent);
      socket.off('message:delivered', handleMessageDelivered);
      socket.off('message:read', handleMessageRead);
      socket.off('typing:start', handleTypingStart);
      socket.off('typing:stop', handleTypingStop);
      socket.off('user:online', handleUserOnline);
      socket.off('user:offline', handleUserOffline);
    };
  }, [socket, conversationId, recipient, persistMessages, scrollToBottom]);

  // Load older messages (pagination)
  const handleLoadMore = async () => {
    if (!conversationId || !hasMore || loadingMore || !oldestCursor) return;

    setLoadingMore(true);
    try {
      const msgRes = await fetchMessagesApi(conversationId, oldestCursor, 30);
      if (msgRes.success && msgRes.messages) {
        setMessages((prev) => [...(msgRes.messages || []), ...prev]);
        setHasMore(msgRes.hasMore);
        setOldestCursor(msgRes.oldestCursor);
      }
    } catch (error) {
      console.error('[ChatRoom] Failed to load older messages:', error);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSendMessage = (text: string) => {
    if (!conversationId || !recipient || !text.trim()) return;

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const optimisticMessage: IMessage = {
      _id: tempId,
      conversationId,
      senderId: user?._id || '',
      receiverId: recipient._id,
      text: text.trim(),
      type: 'text',
      status: 'sending',
      clientMessageId: tempId,
      createdAt: new Date().toISOString(),
    };

    // ⚡ Instant Optimistic Message Render in 60fps without lag
    setMessages((prev) => {
      const updated = [...prev, optimisticMessage];
      persistMessages(updated);
      return updated;
    });

    scrollToBottom(true);

    // Send via socket or offline outbox
    sendMessage(conversationId, recipient._id, text.trim(), tempId);
  };

  const handleTyping = () => {
    if (!conversationId || !recipient) return;

    startTyping(conversationId, recipient._id);

    if (typingTimerRef.current) {
      clearTimeout(typingTimerRef.current);
    }

    typingTimerRef.current = setTimeout(() => {
      stopTyping(conversationId, recipient._id);
    }, 2500);
  };

  return (
    <div
      style={{ backgroundColor: themeConfig.bg }}
      className="h-full w-full flex flex-col overflow-hidden transition-colors duration-200"
    >
      {/* Top Header with Status Bar Safe Area Padding */}
      <header
        style={{ backgroundColor: themeConfig.panel }}
        className="px-3 pt-10 pb-3 border-b border-white/10 flex items-center justify-between flex-shrink-0 z-10 transition-colors duration-200"
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/chats')}
            className="p-1.5 -ml-1 rounded-full hover:bg-white/5 text-chat-textMuted hover:text-white transition-colors flex-shrink-0"
            title="Back to Chats"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <Avatar
            src={recipient?.avatarUrl}
            name={recipient?.displayName || recipient?.username || 'User'}
            isOnline={recipient?.isOnline}
            size="sm"
          />

          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold text-white truncate">
              {recipient?.displayName || recipient?.username || 'Chat'}
            </h2>
            <p className="text-[11px] text-chat-textMuted truncate">
              {isTyping ? (
                <span className="text-brand-400 font-medium animate-pulse">typing...</span>
              ) : recipient?.isOnline ? (
                <span className="text-emerald-400 font-medium">online</span>
              ) : recipient?.lastSeen ? (
                <span>last seen {formatLastSeen(recipient.lastSeen)}</span>
              ) : (
                <span>offline</span>
              )}
            </p>
          </div>
        </div>

        {!isConnected && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-medium flex-shrink-0">
            <WifiOff className="w-3 h-3" />
            <span>Connecting</span>
          </div>
        )}
      </header>

      {/* Messages Scroll Area */}
      <div
        ref={scrollContainerRef}
        style={{ backgroundColor: themeConfig.bg }}
        className="flex-1 overflow-y-auto p-4 space-y-3 flex flex-col select-text transition-colors duration-200"
      >
        {/* Load More Button */}
        {hasMore && (
          <div className="text-center py-2">
            <button
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="text-xs text-brand-400 hover:text-brand-300 font-medium px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50"
            >
              {loadingMore ? 'Loading older messages...' : 'Load previous messages'}
            </button>
          </div>
        )}

        {loading ? (
          <div className="space-y-4 py-2">
            <MessageSkeleton isMe={false} />
            <MessageSkeleton isMe={true} />
            <MessageSkeleton isMe={false} />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-chat-textMuted">
            <p className="text-xs max-w-xs">
              No messages yet. Say hello to start the conversation!
            </p>
          </div>
        ) : (
          messages.map((msg, index) => {
            const isMine = msg.senderId === user?._id;
            const prevMsg = messages[index - 1];

            // Date separator check
            const showDateHeader =
              !prevMsg ||
              new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();

            return (
              <React.Fragment key={msg._id || msg.clientMessageId}>
                {showDateHeader && (
                  <div className="flex justify-center my-3">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-chat-textMuted/80 bg-chat-card/80 px-3 py-1 rounded-full border border-white/5">
                      {formatChatListDate(msg.createdAt)}
                    </span>
                  </div>
                )}

                <MessageBubble
                  message={msg}
                  isMe={isMine}
                />
              </React.Fragment>
            );
          })
        )}
      </div>

      {/* Message Composer */}
      <MessageComposer
        onSend={handleSendMessage}
        onTyping={handleTyping}
        disabled={!recipient}
      />
    </div>
  );
};
