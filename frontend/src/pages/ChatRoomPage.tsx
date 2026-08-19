import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchMessagesApi, uploadMediaApi, searchInConversationApi } from '../api/messageApi';
import { fetchConversations } from '../api/conversationApi';
import { IMessage, IUser, IReplyTo, IAttachment } from '../types';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../context/ThemeContext';
import { useCall } from '../context/CallContext';
import { Avatar } from '../components/common/Avatar';
import { MessageBubble } from '../components/chat/MessageBubble';
import { MessageComposer } from '../components/chat/MessageComposer';
import { MediaViewerModal } from '../components/chat/MediaViewerModal';
import { DocumentViewerModal } from '../components/chat/DocumentViewerModal';
import { MessageSkeleton } from '../components/common/Skeleton';
import { formatLastSeen, formatChatListDate } from '../utils/dateUtils';
import {
  openDocumentInNativeApp,
  downloadDocumentToDevice,
  saveImageToDevice,
} from '../services/nativeMediaService';
import {
  ArrowLeft,
  WifiOff,
  Search,
  MoreVertical,
  Phone,
  X,
  ChevronDown,
} from 'lucide-react';

export const ChatRoomPage: React.FC = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { user } = useAuth();
  const { socket, isConnected, sendMessage, markAsRead, startTyping, stopTyping, setActiveConversationId } = useSocket();
  const { themeConfig } = useTheme();
  const { startCall } = useCall();
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

  // Scroll offset preservation ref for upward pagination
  const scrollOffsetRef = useRef<{ prevScrollHeight: number; prevScrollTop: number } | null>(null);
  const initialScrollDoneRef = useRef(false);

  // Replying & Modals
  const [replyingTo, setReplyingTo] = useState<IReplyTo | null>(null);
  const [activeMediaModal, setActiveMediaModal] = useState<IMessage | null>(null);
  const [activeDocModal, setActiveDocModal] = useState<IMessage | null>(null);

  // Toast / Status Message
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // In-Chat Search
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomAnchorRef = useRef<HTMLDivElement>(null);
  const typingTimerRef = useRef<NodeJS.Timeout | null>(null);
  const saveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Debounced LocalStorage save
  const persistMessages = useCallback(
    (msgs: IMessage[]) => {
      if (!conversationId) return;
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        try {
          localStorage.setItem(`kotha_hobe_msgs_${conversationId}`, JSON.stringify(msgs));
        } catch {}
      }, 400);
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
    isNearBottomRef.current = distanceToBottom < 130;

    if (isNearBottomRef.current) {
      setUnreadNewCount(0);
    }

    // Trigger loading older messages when near top (within 50px)
    if (scrollTop < 50 && hasMore && !loadingMore && oldestCursor) {
      handleLoadMore();
    }
  };

  // Synchronize Scroll on initial render and upward pagination
  useLayoutEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Upward pagination scroll compensation
    if (scrollOffsetRef.current) {
      const { prevScrollHeight, prevScrollTop } = scrollOffsetRef.current;
      const heightDelta = container.scrollHeight - prevScrollHeight;
      container.scrollTop = prevScrollTop + heightDelta;
      scrollOffsetRef.current = null;
      return;
    }

    // Initial mount bottom pin
    if (!initialScrollDoneRef.current && messages.length > 0) {
      container.scrollTop = container.scrollHeight;
      initialScrollDoneRef.current = true;
      return;
    }

    // If already near bottom, stay pinned
    if (isNearBottomRef.current) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

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
    initialScrollDoneRef.current = false;

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
            setRecipient(currentConv.recipient);
          }
        }

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
        console.warn('[ChatRoom] Background sync notice:', error);
      } finally {
        setLoading(false);
        requestAnimationFrame(() => scrollToBottom(true));
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

    // 1. Incoming Message
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
        setMessages((prev) => {
          const updated = prev.map((m) =>
            m.clientMessageId === sentMsg.clientMessageId || m._id === sentMsg._id
              ? { ...m, ...sentMsg, status: sentMsg.status || 'sent' }
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

    // 5. Read Receipt
    const handleMessageRead = ({ messageId, readAt }: { messageId: string; readAt: string }) => {
      setMessages((prev) => prev.map((m) => (m._id === messageId ? { ...m, status: 'read', readAt } : m)));
    };

    // 6. Typing Indicators
    const handleTypingStart = ({ userId }: { userId: string }) => {
      if (recipient && userId === recipient._id) setIsTyping(true);
    };

    const handleTypingStop = ({ userId }: { userId: string }) => {
      if (recipient && userId === recipient._id) setIsTyping(false);
    };

    // 7. Presence
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

    socket.on('message:new', handleNewMessage);
    socket.on('message:sent', handleMessageSent);
    socket.on('message:reaction_updated', handleReactionUpdated);
    socket.on('message:deleted', handleMessageDeleted);
    socket.on('message:read', handleMessageRead);
    socket.on('typing:start', handleTypingStart);
    socket.on('typing:stop', handleTypingStop);
    socket.on('user:online', handleUserOnline);
    socket.on('user:offline', handleUserOffline);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('message:sent', handleMessageSent);
      socket.off('message:reaction_updated', handleReactionUpdated);
      socket.off('message:deleted', handleMessageDeleted);
      socket.off('message:read', handleMessageRead);
      socket.off('typing:start', handleTypingStart);
      socket.off('typing:stop', handleTypingStop);
      socket.off('user:online', handleUserOnline);
      socket.off('user:offline', handleUserOffline);
    };
  }, [socket, conversationId, recipient, persistMessages, scrollToBottom]);

  // Load older messages with zero-jump scroll anchoring
  const handleLoadMore = async () => {
    if (!conversationId || !hasMore || loadingMore || !oldestCursor) return;

    const container = scrollContainerRef.current;
    if (container) {
      scrollOffsetRef.current = {
        prevScrollHeight: container.scrollHeight,
        prevScrollTop: container.scrollTop,
      };
    }

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
      scrollOffsetRef.current = null;
    } finally {
      setLoadingMore(false);
    }
  };

  // Send Message (Instant 0ms UI Rendering + Background Upload)
  const handleSendMessage = (
    text: string,
    type: 'text' | 'image' | 'audio' | 'document' = 'text',
    attachment?: IAttachment,
    replyTo?: IReplyTo,
    localFile?: File | Blob
  ) => {
    if (!conversationId || !recipient) return;

    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const optimisticMessage: IMessage = {
      _id: tempId,
      conversationId,
      senderId: user?._id || '',
      receiverId: recipient._id,
      text: text.trim(),
      type,
      attachment,
      replyTo,
      reactions: [],
      status: 'sending',
      clientMessageId: tempId,
      createdAt: new Date().toISOString(),
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
                m.clientMessageId === tempId ? { ...m, attachment: serverAttachment } : m
              );
              persistMessages(updated);
              return updated;
            });

            // Dispatch message via centralized sendMessage engine (handles live socket and offline outbox)
            sendMessage(
              conversationId,
              recipient._id,
              text.trim(),
              tempId,
              type,
              serverAttachment,
              replyTo
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

    // 3. Regular text message dispatch via centralized sendMessage engine
    sendMessage(
      conversationId,
      recipient._id,
      text.trim(),
      tempId,
      type,
      attachment,
      replyTo
    );
  };

  // 1. Native Document Open (Default Reader App)
  const handleOpenDocument = async (msg: IMessage) => {
    if (!msg.attachment?.url) return;
    const fileName = msg.attachment.fileName || 'document.pdf';
    const mimeType = msg.attachment.mimeType || 'application/pdf';

    showToast(`Opening ${fileName}...`);
    const res = await openDocumentInNativeApp(msg.attachment.url, fileName, mimeType);
    if (!res.success) {
      if (res.error === 'NO_APP') {
        setActiveDocModal(msg);
      } else {
        showToast(res.error || 'Could not open document');
      }
    }
  };

  // 2. Native Document Download
  const handleDownloadDocument = async (msg: IMessage) => {
    if (!msg.attachment?.url) return;
    const fileName = msg.attachment.fileName || 'document.pdf';
    const mimeType = msg.attachment.mimeType || 'application/pdf';

    showToast(`Downloading ${fileName}...`);
    const res = await downloadDocumentToDevice(msg.attachment.url, fileName, mimeType);
    showToast(res.message);
  };

  // React to Message
  const handleReact = (messageId: string, emoji: string) => {
    if (!socket || !conversationId) return;
    socket.emit('message:react', { messageId, conversationId, emoji });
  };

  // Delete Message
  const handleDelete = (messageId: string, deleteForEveryone: boolean) => {
    if (!socket || !conversationId) return;
    socket.emit('message:delete', { messageId, conversationId, deleteForEveryone });
  };

  // Reply to Message
  const handleReply = (msg: IMessage) => {
    const isMine = msg.senderId === user?._id;
    setReplyingTo({
      messageId: msg._id,
      text: msg.text,
      senderName: isMine ? 'You' : recipient?.displayName || recipient?.username || 'User',
      type: msg.type,
      fileName: msg.attachment?.fileName,
    });
  };

  const handleTyping = () => {
    if (!conversationId || !recipient) return;
    startTyping(conversationId, recipient._id);
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current);
    typingTimerRef.current = setTimeout(() => {
      stopTyping(conversationId, recipient._id);
    }, 2500);
  };

  const filteredMessages = showSearch && searchQuery.trim()
    ? messages.filter(
        (m) =>
          m.text?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.attachment?.fileName?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

  return (
    <div
      style={{ backgroundColor: themeConfig.bg }}
      className="h-full w-full flex flex-col overflow-hidden transition-colors duration-200"
    >
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-[#202c33] border border-white/20 text-white text-xs font-semibold shadow-2xl animate-fade-in">
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

      {/* Document Viewer Modal (Fallback when no native app installed) */}
      {activeDocModal && (
        <DocumentViewerModal
          message={activeDocModal}
          onClose={() => setActiveDocModal(null)}
        />
      )}

      {/* Top Header */}
      <header
        style={{ backgroundColor: themeConfig.panel }}
        className="px-3 pt-10 pb-3 border-b border-white/10 flex items-center justify-between flex-shrink-0 z-10 transition-colors duration-200"
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={() => navigate('/chats')}
            className="p-1.5 -ml-1 rounded-full hover:bg-white/5 text-chat-textMuted hover:text-white transition-colors flex-shrink-0"
            title="Back to Chats"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div
            onClick={() => navigate(`/chat/${conversationId}/info`)}
            className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer hover:opacity-90 transition-opacity"
          >
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
                  <span>{formatLastSeen(recipient.lastSeen)}</span>
                ) : (
                  <span>offline</span>
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-1">
          {/* Voice Call Button */}
          <button
            type="button"
            onClick={() => {
              if (recipient && conversationId) {
                startCall(
                  {
                    _id: recipient._id,
                    displayName: recipient.displayName || recipient.username || 'User',
                    avatarUrl: recipient.avatarUrl,
                    username: recipient.username,
                  },
                  conversationId
                );
              }
            }}
            className="p-2 rounded-full text-emerald-400 hover:text-emerald-300 hover:bg-white/5 active:scale-95 transition-all"
            title="Start Voice Call"
          >
            <Phone className="w-4 h-4" />
          </button>

          <button
            onClick={() => setShowSearch(!showSearch)}
            className={`p-2 rounded-full transition-colors ${
              showSearch ? 'bg-white/10 text-brand-400' : 'text-chat-textMuted hover:text-white'
            }`}
            title="Search in Chat"
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            onClick={() => navigate(`/chat/${conversationId}/info`)}
            className="p-2 rounded-full text-chat-textMuted hover:text-white transition-colors"
            title="Chat Info"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {!isConnected && (
            <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-medium flex-shrink-0 ml-1">
              <WifiOff className="w-3 h-3" />
              <span>Offline</span>
            </div>
          )}
        </div>
      </header>

      {/* In-Chat Search Bar */}
      {showSearch && (
        <div className="px-4 py-2 bg-[#111b21] border-b border-white/10 flex items-center gap-2 animate-fade-in">
          <Search className="w-4 h-4 text-chat-textMuted" />
          <input
            type="text"
            placeholder="Search in this conversation..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="flex-1 bg-transparent text-white text-xs outline-none placeholder:text-chat-textMuted"
            autoFocus
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-chat-textMuted hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      )}

      {/* Messages Scroll Area */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={{ backgroundColor: themeConfig.bg }}
        className="flex-1 overflow-y-auto p-4 space-y-3 flex flex-col select-text transition-colors duration-200 relative"
      >
        {/* Loading Older Messages Spinner */}
        {loadingMore && (
          <div className="flex justify-center py-2">
            <div className="w-5 h-5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {loading ? (
          <div className="space-y-4 py-2">
            <MessageSkeleton isMe={false} />
            <MessageSkeleton isMe={true} />
            <MessageSkeleton isMe={false} />
          </div>
        ) : filteredMessages.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-6 text-chat-textMuted">
            <p className="text-xs max-w-xs">
              {showSearch ? 'No messages matching search.' : 'No messages yet. Say hello to start the conversation!'}
            </p>
          </div>
        ) : (
          filteredMessages.map((msg, index) => {
            const isMine = msg.senderId === user?._id;
            const prevMsg = filteredMessages[index - 1];

            const showDateHeader =
              !prevMsg ||
              new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();

            return (
              <React.Fragment key={msg.clientMessageId || msg._id}>
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
                  onOpenMedia={() => setActiveMediaModal(msg)}
                  onOpenDocument={() => handleOpenDocument(msg)}
                  onDownloadDocument={() => handleDownloadDocument(msg)}
                  onReply={handleReply}
                  onReact={handleReact}
                  onDelete={handleDelete}
                />
              </React.Fragment>
            );
          })
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
        disabled={!recipient}
      />
    </div>
  );
};
