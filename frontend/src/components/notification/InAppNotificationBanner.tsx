import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { Avatar } from '../common/Avatar';
import { CornerUpLeft, Send, X, Sparkles, MessageCircle } from 'lucide-react';
import { IMessage } from '../../types';

export interface InAppNotificationData {
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatar?: string;
  messageText: string;
  isGroup?: boolean;
  groupName?: string;
  messageType?: string;
  createdAt?: string;
}

const MAX_REPLY_WORDS = 50;

const QUICK_REPLY_CHIPS = [
  '👍 OK',
  '❤️',
  '😂 Haha',
  'Sure!',
  'On my way 🏃',
  'Talk soon 👋',
];

export const InAppNotificationBanner: React.FC = () => {
  const [notification, setNotification] = useState<InAppNotificationData | null>(null);
  const [isReplying, setIsReplying] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSending, setIsSending] = useState(false);

  const { sendMessage, activeConversationId } = useSocket();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const dismissTimerRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Clear auto-dismiss timer
  const clearTimer = () => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  };

  // Start auto-dismiss timer (6 seconds) if not actively composing a reply
  const startTimer = () => {
    clearTimer();
    if (!isReplying) {
      dismissTimerRef.current = setTimeout(() => {
        handleDismiss();
      }, 6500);
    }
  };

  // Listen for in-app notification trigger event
  useEffect(() => {
    const handleIncoming = (e: Event) => {
      const customEvent = e as CustomEvent<InAppNotificationData>;
      const data = customEvent.detail;
      if (!data) return;

      // Do not display in-app banner if user is already inside this conversation room
      if (activeConversationId === data.conversationId) {
        return;
      }

      // If user is already on the exact chat route for this conversation, ignore
      if (location.pathname === `/chat/${data.conversationId}`) {
        return;
      }

      setNotification(data);
      setIsReplying(false);
      setReplyText('');
    };

    window.addEventListener('kothahobe:inapp_notification', handleIncoming);
    return () => {
      window.removeEventListener('kothahobe:inapp_notification', handleIncoming);
      clearTimer();
    };
  }, [activeConversationId, location.pathname]);

  // Manage timer when notification or reply state changes
  useEffect(() => {
    if (notification && !isReplying) {
      startTimer();
    } else {
      clearTimer();
    }
    return () => clearTimer();
  }, [notification, isReplying]);

  // Focus input when reply is toggled open
  useEffect(() => {
    if (isReplying && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isReplying]);

  const handleDismiss = () => {
    clearTimer();
    setNotification(null);
    setIsReplying(false);
    setReplyText('');
  };

  // Cancel reply action: resets typed message, collapses reply drawer, keeps notification banner visible
  const handleCancelReply = () => {
    setReplyText('');
    setIsReplying(false);
    startTimer();
  };

  const getWordCount = (str: string) => {
    return str.trim().split(/\s+/).filter(Boolean).length;
  };

  const wordCount = getWordCount(replyText);
  const isWordLimitExceeded = wordCount > MAX_REPLY_WORDS;

  const handleReplyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    const currentWords = getWordCount(val);
    if (currentWords <= MAX_REPLY_WORDS || val.length < replyText.length) {
      setReplyText(val);
    }
  };

  // Send Direct Reply
  const handleSendReply = (overrideText?: string) => {
    const textToSend = (overrideText || replyText).trim();
    if (!textToSend || !notification || isSending) return;

    const count = getWordCount(textToSend);
    if (count > MAX_REPLY_WORDS) return;

    setIsSending(true);

    const clientMsgId = `reply_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const optimisticMessage: IMessage = {
      _id: clientMsgId,
      conversationId: notification.conversationId,
      senderId: user?._id || '',
      receiverId: notification.isGroup ? undefined : notification.senderId,
      text: textToSend,
      type: 'text',
      status: 'sending',
      clientMessageId: clientMsgId,
      createdAt: new Date().toISOString(),
    };

    // Broadcast saved event so local conversation views update immediately
    window.dispatchEvent(new CustomEvent('kothahobe:message_saved', { detail: optimisticMessage }));

    // Send through centralized socket engine
    sendMessage(
      notification.conversationId,
      notification.isGroup ? undefined : notification.senderId,
      textToSend,
      clientMsgId,
      'text'
    );

    setIsSending(false);
    handleDismiss();
  };

  const handleBannerClick = (e: React.MouseEvent) => {
    // If clicking on interactive buttons or inputs, do not navigate away
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input')) {
      return;
    }

    if (notification?.conversationId) {
      const targetConvId = notification.conversationId;
      handleDismiss();
      navigate(`/chat/${targetConvId}`);
    }
  };

  return (
    <AnimatePresence>
      {notification && (
        <motion.div
          initial={{ y: -80, opacity: 0, scale: 0.95 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -80, opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          className="fixed top-3 inset-x-3 sm:max-w-md sm:mx-auto z-50 select-none cursor-pointer"
          onClick={handleBannerClick}
        >
          <div className="bg-chat-card/95 backdrop-blur-xl border border-chat-border/80 rounded-2xl shadow-2xl overflow-hidden p-3.5 space-y-2.5 transition-all">
            {/* Header: Sender Info & Quick Action Buttons */}
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <Avatar
                  src={notification.senderAvatar}
                  name={notification.senderName}
                  size="sm"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-chat-textPrimary truncate">
                      {notification.senderName}
                    </span>
                    {notification.isGroup && notification.groupName && (
                      <span className="text-[10px] font-medium text-brand-500 truncate bg-brand-500/10 px-1.5 py-0.2 rounded-md">
                        {notification.groupName}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-chat-textSecondary truncate mt-0.5">
                    {notification.messageType === 'image'
                      ? '📷 Photo'
                      : notification.messageType === 'audio'
                      ? '🎤 Voice message'
                      : notification.messageType === 'document'
                      ? '📄 Document'
                      : notification.messageType === 'custom_emoji'
                      ? '✨ Animated Emoji'
                      : notification.messageText}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {!isReplying && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsReplying(true);
                    }}
                    className="px-2.5 py-1 rounded-full bg-brand-500 hover:bg-brand-600 active:scale-95 text-white text-xs font-bold flex items-center gap-1 shadow-sm transition-all"
                  >
                    <CornerUpLeft className="w-3.5 h-3.5" />
                    <span>Reply</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDismiss();
                  }}
                  className="p-1 rounded-full text-chat-textMuted hover:text-chat-textPrimary hover:bg-chat-surfaceSecondary transition-colors"
                  title="Dismiss"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Expandable Inline Reply Section */}
            {isReplying && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.18, ease: 'easeOut' }}
                className="pt-2 border-t border-chat-border/60 space-y-2"
                onClick={(e) => e.stopPropagation()}
              >
                {/* Effortless Quick Response Suggestion Chips */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar text-xs">
                  {QUICK_REPLY_CHIPS.map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => handleSendReply(chip)}
                      className="px-2.5 py-1 rounded-full bg-chat-surfaceSecondary hover:bg-brand-500/15 hover:text-brand-500 active:scale-95 text-chat-textSecondary text-[11px] font-medium transition-all whitespace-nowrap border border-chat-border/50 shadow-2xs"
                    >
                      {chip}
                    </button>
                  ))}
                </div>

                {/* Input row with live word-count constraint */}
                <div className="flex items-center gap-2">
                  <div className="flex-1 relative bg-chat-input rounded-xl px-3 py-1.5 flex items-center border border-chat-border/60 focus-within:border-brand-500/70">
                    <input
                      ref={inputRef}
                      type="text"
                      value={replyText}
                      onChange={handleReplyChange}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          handleSendReply();
                        }
                      }}
                      placeholder={`Reply (max ${MAX_REPLY_WORDS} words)...`}
                      className="w-full bg-transparent text-xs text-chat-textPrimary placeholder:text-chat-textTertiary outline-none pr-14"
                    />

                    {/* Word Count Indicator Badge */}
                    <span
                      className={`absolute right-2 text-[10px] font-mono font-bold ${
                        wordCount >= MAX_REPLY_WORDS
                          ? 'text-red-500'
                          : wordCount >= 40
                          ? 'text-amber-500'
                          : 'text-chat-textTertiary'
                      }`}
                    >
                      {wordCount}/{MAX_REPLY_WORDS}w
                    </span>
                  </div>

                  {/* Cancel Button */}
                  <button
                    type="button"
                    onClick={handleCancelReply}
                    className="px-2.5 py-1.5 rounded-xl bg-chat-surfaceSecondary hover:bg-chat-surfaceTertiary active:scale-95 text-chat-textSecondary text-xs font-semibold transition-all"
                  >
                    Cancel
                  </button>

                  {/* Send Button */}
                  <button
                    type="button"
                    onClick={() => handleSendReply()}
                    disabled={!replyText.trim() || isWordLimitExceeded || isSending}
                    className="p-2 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 text-white transition-all shadow-sm"
                    title="Send Reply"
                  >
                    <Send className="w-3.5 h-3.5" />
                  </button>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
