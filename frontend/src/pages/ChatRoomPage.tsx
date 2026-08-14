import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchMessagesApi } from '../api/messageApi';
import { fetchConversations } from '../api/conversationApi';
import { IMessage, IUser } from '../types';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { Avatar } from '../components/common/Avatar';
import { MessageBubble } from '../components/chat/MessageBubble';
import { MessageComposer } from '../components/chat/MessageComposer';
import { MessageSkeleton } from '../components/common/Skeleton';
import { formatLastSeen, formatChatListDate } from '../utils/dateUtils';
import { ArrowLeft, WifiOff } from 'lucide-react';

export const ChatRoomPage: React.FC = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { user } = useAuth();
  const { socket, isConnected, sendMessage, markAsRead, startTyping, stopTyping } = useSocket();
  const navigate = useNavigate();

  const [recipient, setRecipient] = useState<IUser | null>(null);
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const [oldestCursor, setOldestCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Load conversation details & initial messages
  useEffect(() => {
    if (!conversationId) return;

    const initChat = async () => {
      setLoading(true);
      try {
        // Fetch conversation to get recipient info
        const convsRes = await fetchConversations();
        if (convsRes.success) {
          const currentConv = convsRes.conversations.find((c) => c._id === conversationId);
          if (currentConv) {
            setRecipient(currentConv.recipient);
          }
        }

        // Fetch message history
        const msgRes = await fetchMessagesApi(conversationId, undefined, 30);
        if (msgRes.success) {
          setMessages(msgRes.messages || []);
          setHasMore(msgRes.hasMore);
          setOldestCursor(msgRes.oldestCursor);
        }
      } catch (error) {
        console.error('[ChatRoom] Failed to load chat history:', error);
      } finally {
        setLoading(false);
        // Scroll to bottom on initial load
        setTimeout(() => scrollToBottom(), 100);
      }
    };

    initChat();
  }, [conversationId]);

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
          // Prevent duplicates
          if (prev.some((m) => m._id === newMsg._id || m.clientMessageId === newMsg.clientMessageId)) {
            return prev;
          }
          return [...prev, newMsg];
        });

        // Mark as read immediately since chat room is open
        markAsRead(conversationId);
        scrollToBottom();
      }
    };

    // Server confirmation of sent message
    const handleMessageSent = (data: {
      _id: string;
      clientMessageId: string;
      conversationId: string;
      status: string;
      createdAt: string;
    }) => {
      if (data.conversationId === conversationId) {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.clientMessageId === data.clientMessageId) {
              return {
                ...msg,
                _id: data._id,
                status: data.status as any,
                createdAt: data.createdAt,
              };
            }
            return msg;
          })
        );
      }
    };

    // Delivery confirmation
    const handleMessageDelivered = (data: {
      _id: string;
      clientMessageId: string;
      conversationId: string;
    }) => {
      if (data.conversationId === conversationId) {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.clientMessageId === data.clientMessageId || msg._id === data._id) {
              return { ...msg, status: 'delivered' };
            }
            return msg;
          })
        );
      }
    };

    // Read receipt confirmation (blue ticks)
    const handleMessageRead = (data: { conversationId: string; readAt: string }) => {
      if (data.conversationId === conversationId) {
        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.senderId === user?._id) {
              return { ...msg, status: 'read', readAt: data.readAt };
            }
            return msg;
          })
        );
      }
    };

    // Presence updates
    const handleUserOnline = (data: { userId: string }) => {
      if (recipient && data.userId === recipient._id) {
        setRecipient((prev) => (prev ? { ...prev, isOnline: true } : null));
      }
    };

    const handleUserOffline = (data: { userId: string; lastSeen: string }) => {
      if (recipient && data.userId === recipient._id) {
        setRecipient((prev) =>
          prev ? { ...prev, isOnline: false, lastSeen: data.lastSeen } : null
        );
      }
    };

    // Typing state
    const handleTypingStart = (data: { conversationId: string; userId: string }) => {
      if (data.conversationId === conversationId && data.userId === recipient?._id) {
        setIsTyping(true);
      }
    };

    const handleTypingStop = (data: { conversationId: string; userId: string }) => {
      if (data.conversationId === conversationId && data.userId === recipient?._id) {
        setIsTyping(false);
      }
    };

    socket.on('message:new', handleNewMessage);
    socket.on('message:sent', handleMessageSent);
    socket.on('message:delivered', handleMessageDelivered);
    socket.on('message:read', handleMessageRead);
    socket.on('user:online', handleUserOnline);
    socket.on('user:offline', handleUserOffline);
    socket.on('typing:start', handleTypingStart);
    socket.on('typing:stop', handleTypingStop);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('message:sent', handleMessageSent);
      socket.off('message:delivered', handleMessageDelivered);
      socket.off('message:read', handleMessageRead);
      socket.off('user:online', handleUserOnline);
      socket.off('user:offline', handleUserOffline);
      socket.off('typing:start', handleTypingStart);
      socket.off('typing:stop', handleTypingStop);
    };
  }, [socket, conversationId, recipient, user]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Pagination: Load older messages on scroll top
  const handleScroll = async () => {
    if (!scrollContainerRef.current || loadingMore || !hasMore || !oldestCursor || !conversationId) {
      return;
    }

    if (scrollContainerRef.current.scrollTop === 0) {
      setLoadingMore(true);
      const prevScrollHeight = scrollContainerRef.current.scrollHeight;

      try {
        const res = await fetchMessagesApi(conversationId, oldestCursor, 30);
        if (res.success && res.messages.length > 0) {
          setMessages((prev) => [...res.messages, ...prev]);
          setHasMore(res.hasMore);
          setOldestCursor(res.oldestCursor);

          // Preserve scroll position
          setTimeout(() => {
            if (scrollContainerRef.current) {
              scrollContainerRef.current.scrollTop =
                scrollContainerRef.current.scrollHeight - prevScrollHeight;
            }
          }, 50);
        }
      } catch (err) {
        console.warn('[ChatRoom] Failed to load older messages');
      } finally {
        setLoadingMore(false);
      }
    }
  };

  // Optimistic Message Send Handler
  const handleSendMessage = (text: string) => {
    if (!conversationId || !recipient || !user) return;

    // Generate unique client UUID
    const clientMessageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // 1. Optimistic local insertion
    const optimisticMessage: IMessage = {
      _id: clientMessageId,
      conversationId,
      senderId: user._id,
      receiverId: recipient._id,
      text,
      type: 'text',
      status: isConnected ? 'sending' : 'failed',
      clientMessageId,
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMessage]);
    setTimeout(() => scrollToBottom(), 50);

    // 2. Emit over socket if connected
    if (isConnected) {
      sendMessage(conversationId, recipient._id, text, clientMessageId);
    }
  };

  const handleRetry = (msg: IMessage) => {
    if (!recipient || !conversationId) return;
    setMessages((prev) =>
      prev.map((m) => (m.clientMessageId === msg.clientMessageId ? { ...m, status: 'sending' } : m))
    );
    sendMessage(conversationId, recipient._id, msg.text, msg.clientMessageId);
  };

  const handleTyping = () => {
    if (conversationId && recipient) {
      startTyping(conversationId, recipient._id);
    }
  };

  // Group messages by date header
  const renderMessageGroups = () => {
    const groups: { dateLabel: string; msgs: IMessage[] }[] = [];

    messages.forEach((msg) => {
      const dateLabel = formatChatListDate(msg.createdAt);
      const lastGroup = groups[groups.length - 1];

      if (lastGroup && lastGroup.dateLabel === dateLabel) {
        lastGroup.msgs.push(msg);
      } else {
        groups.push({ dateLabel, msgs: [msg] });
      }
    });

    return groups.map((group, groupIdx) => (
      <React.Fragment key={groupIdx}>
        {/* Date separator pill */}
        <div className="flex justify-center my-3 select-none">
          <span className="bg-chat-card/80 border border-white/5 text-chat-textMuted font-medium text-[11px] px-3 py-1 rounded-full shadow-sm">
            {group.dateLabel}
          </span>
        </div>

        {group.msgs.map((msg) => (
          <MessageBubble
            key={msg.clientMessageId || msg._id}
            message={msg}
            isMe={msg.senderId === user?._id}
            onRetry={handleRetry}
          />
        ))}
      </React.Fragment>
    ));
  };

  return (
    <div className="h-dvh w-full bg-chat-bg flex flex-col overflow-hidden max-w-md mx-auto relative">
      {/* Sticky Header */}
      <header className="px-3 py-2.5 bg-chat-panel border-b border-white/10 flex items-center justify-between flex-shrink-0 z-30 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => navigate('/chats')}
            className="p-1.5 rounded-full hover:bg-white/5 text-chat-textMuted hover:text-white transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {recipient && (
            <div className="flex items-center gap-2.5 min-w-0">
              <Avatar
                src={recipient.avatarUrl}
                name={recipient.displayName}
                isOnline={recipient.isOnline}
                size="md"
              />

              <div className="min-w-0">
                <h2 className="text-sm font-bold text-white truncate leading-tight">
                  {recipient.displayName}
                </h2>
                <p className="text-[11px] text-chat-textMuted truncate">
                  {isTyping ? (
                    <span className="text-brand-400 font-semibold animate-pulse">typing...</span>
                  ) : (
                    formatLastSeen(recipient.lastSeen, recipient.isOnline)
                  )}
                </p>
              </div>
            </div>
          )}
        </div>

        {!isConnected && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] font-medium flex-shrink-0">
            <WifiOff className="w-3 h-3" />
            <span>Offline</span>
          </div>
        )}
      </header>

      {/* Messages Scroll Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-1 py-2 bg-chat-bg space-y-1"
        style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,0.03) 1px, transparent 0)', backgroundSize: '24px 24px' }}
      >
        {loadingMore && (
          <div className="text-center py-2 text-xs text-chat-textMuted">
            <div className="w-4 h-4 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mx-auto" />
          </div>
        )}

        {loading ? (
          <>
            <MessageSkeleton isMe={false} />
            <MessageSkeleton isMe={true} />
            <MessageSkeleton isMe={false} />
            <MessageSkeleton isMe={true} />
          </>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-6 select-none">
            <div className="w-12 h-12 rounded-full bg-chat-card flex items-center justify-center text-brand-400 mb-3 border border-white/5">
              🔒
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">Start the conversation</h3>
            <p className="text-xs text-chat-textMuted max-w-xs">
              Messages are sent in real time with instant delivery and status receipts.
            </p>
          </div>
        ) : (
          renderMessageGroups()
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Multiline Message Composer */}
      <MessageComposer
        onSend={handleSendMessage}
        onTyping={handleTyping}
      />
    </div>
  );
};
