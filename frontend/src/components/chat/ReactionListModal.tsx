import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Trash2 } from 'lucide-react';
import { IMessage, IReaction, IUser } from '../../types';
import { isCustomEmojiId, getCustomEmojiById } from '../../data/customEmojiCatalog';
import { AnimatedCustomEmoji } from '../emoji/AnimatedCustomEmoji';

interface ReactionListModalProps {
  message: IMessage;
  currentUserId?: string;
  participants?: IUser[];
  groupMeta?: any;
  initialEmoji?: string;
  onRemoveReaction: (messageId: string, emoji: string) => void;
  onClose: () => void;
}

export const ReactionListModal: React.FC<ReactionListModalProps> = ({
  message,
  currentUserId,
  participants = [],
  groupMeta,
  initialEmoji = 'all',
  onRemoveReaction,
  onClose,
}) => {
  const reactions: IReaction[] = message.reactions || [];
  const [activeTab, setActiveTab] = useState<string>(initialEmoji);

  // Group reactions by emoji
  const groupedReactions = reactions.reduce<Record<string, IReaction[]>>((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = [];
    acc[r.emoji].push(r);
    return acc;
  }, {});

  const distinctEmojis = Object.keys(groupedReactions);

  // Filter reactions based on active tab
  const displayedReactions =
    activeTab === 'all'
      ? reactions
      : reactions.filter((r) => r.emoji === activeTab);

  const getUserInfo = (userId: string) => {
    const isMe = userId === currentUserId;
    if (isMe) {
      return {
        name: 'You',
        avatarUrl: undefined,
        isMe: true,
      };
    }

    const participant = participants.find((p) => p._id === userId);
    const nickname = groupMeta?.nicknames?.[userId];

    return {
      name: nickname || participant?.displayName || participant?.username || 'User',
      avatarUrl: participant?.avatarUrl,
      isMe: false,
    };
  };

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-end sm:items-center justify-center sm:p-4 animate-fade-in"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: 50, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 50, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
          className="bg-chat-card border border-chat-border rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[80vh] flex flex-col shadow-2xl overflow-hidden"
        >
          {/* 1. Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-chat-border">
            <h3 className="text-sm font-bold text-chat-textPrimary">Reactions</h3>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-full text-chat-textMuted hover:text-chat-textPrimary hover:bg-chat-surfaceSecondary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 2. Reaction Type Category Tabs */}
          <div className="flex items-center px-4 py-2 border-b border-chat-border bg-chat-panel/60 overflow-x-auto no-scrollbar gap-1.5 flex-shrink-0">
            {/* 'All' Tab */}
            <button
              type="button"
              onClick={() => setActiveTab('all')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-brand-500 text-white font-bold shadow-xs'
                  : 'bg-chat-card border border-chat-border text-chat-textMuted hover:text-chat-textPrimary'
              }`}
            >
              <span>All</span>
              <span className="text-[11px] font-mono font-bold opacity-80">
                {reactions.length}
              </span>
            </button>

            {/* Individual Emoji Tabs */}
            {distinctEmojis.map((emoji) => {
              const count = groupedReactions[emoji].length;
              const isCustom = isCustomEmojiId(emoji);
              const isActive = activeTab === emoji;

              return (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setActiveTab(emoji)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                    isActive
                      ? 'bg-brand-500 text-white font-bold shadow-xs'
                      : 'bg-chat-card border border-chat-border text-chat-textMuted hover:text-chat-textPrimary'
                  }`}
                >
                  {isCustom ? (
                    <AnimatedCustomEmoji
                      emojiId={emoji}
                      size={20}
                      autoPlay={false}
                      loop={false}
                      interactive={false}
                    />
                  ) : (
                    <span className="text-sm">{emoji}</span>
                  )}
                  <span className="text-[11px] font-mono font-bold opacity-80">{count}</span>
                </button>
              );
            })}
          </div>

          {/* 3. User List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1 divide-y divide-chat-border/40">
            {displayedReactions.length === 0 ? (
              <div className="py-8 text-center text-xs text-chat-textMuted">
                No reactions in this category
              </div>
            ) : (
              displayedReactions.map((r, idx) => {
                const user = getUserInfo(r.userId);
                const isCustom = isCustomEmojiId(r.emoji);

                return (
                  <div
                    key={`${r.userId}_${r.emoji}_${idx}`}
                    className="flex items-center justify-between py-2.5 px-2 hover:bg-chat-surfaceSecondary/50 rounded-xl transition-colors"
                  >
                    {/* User Info */}
                    <div className="flex items-center gap-3 min-w-0">
                      {user.avatarUrl ? (
                        <img
                          src={user.avatarUrl}
                          alt={user.name}
                          className="w-9 h-9 rounded-full object-cover border border-chat-border"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-gradient-to-tr from-brand-500 to-amber-500 text-white font-bold text-xs flex items-center justify-center shadow-xs">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-chat-textPrimary truncate flex items-center gap-1.5">
                          <span>{user.name}</span>
                          {user.isMe && (
                            <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-brand-500/20 text-brand-500 font-semibold">
                              You
                            </span>
                          )}
                        </p>
                        <p className="text-[10px] text-chat-textMuted">
                          {user.isMe ? 'Tap emoji or trash to remove' : 'Reacted to message'}
                        </p>
                      </div>
                    </div>

                    {/* Reaction Badge & Action */}
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-xl bg-chat-panel border border-chat-border shadow-2xs flex items-center justify-center">
                        {isCustom ? (
                          <AnimatedCustomEmoji
                            emojiId={r.emoji}
                            size={24}
                            autoPlay={true}
                            loop={false}
                            interactive={false}
                          />
                        ) : (
                          <span className="text-base">{r.emoji}</span>
                        )}
                      </div>

                      {user.isMe && (
                        <button
                          type="button"
                          onClick={() => {
                            onRemoveReaction(message._id, r.emoji);
                            onClose();
                          }}
                          className="p-1.5 rounded-lg text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
                          title="Remove your reaction"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

export default ReactionListModal;
