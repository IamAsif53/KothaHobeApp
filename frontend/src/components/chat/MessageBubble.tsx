import React, { useRef } from 'react';
import { IMessage } from '../../types';
import { formatMessageTime } from '../../utils/dateUtils';
import { getMediaUrl } from '../../api/messageApi';
import { VoiceMessagePlayer } from './VoiceMessagePlayer';
import {
  Clock,
  Check,
  CheckCheck,
  AlertCircle,
  FileText,
  Download,
  CornerUpLeft,
  Trash2,
  Copy,
  ExternalLink,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  PhoneOff,
  Sparkles,
} from 'lucide-react';
import { AnimatedCustomEmoji } from '../emoji/AnimatedCustomEmoji';
import { EmojiBurstEffect } from '../emoji/EmojiBurstEffect';
import { getCustomEmojiById, isCustomEmojiId } from '../../data/customEmojiCatalog';

interface MessageBubbleProps {
  message: IMessage;
  isMe: boolean;
  isGroup?: boolean;
  senderDisplayName?: string;
  currentUserId?: string;
  onRetry?: (message: IMessage) => void;
  onOpenMedia?: (message: IMessage) => void;
  onOpenDocument?: (message: IMessage) => void;
  onDownloadDocument?: (message: IMessage) => void;
  onReply?: (message: IMessage) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onOpenReactions?: (message: IMessage, emoji?: string) => void;
  onDelete?: (messageId: string, deleteForEveryone: boolean) => void;
  onJumpToMessage?: (messageId: string) => void;
  onActionMenu?: (message: IMessage) => void;
}

const SENDER_COLORS = [
  'text-emerald-400',
  'text-sky-400',
  'text-amber-400',
  'text-purple-400',
  'text-rose-400',
  'text-indigo-400',
  'text-teal-400',
  'text-pink-400',
  'text-cyan-400',
  'text-orange-400',
];

export const getSenderColor = (senderId?: string): string => {
  if (!senderId) return 'text-emerald-400';
  let hash = 0;
  for (let i = 0; i < senderId.length; i++) {
    hash = senderId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % SENDER_COLORS.length;
  return SENDER_COLORS[index];
};

const MessageBubbleComponent: React.FC<MessageBubbleProps> = ({
  message,
  isMe,
  isGroup = false,
  senderDisplayName,
  currentUserId,
  onRetry,
  onOpenMedia,
  onOpenDocument,
  onDownloadDocument,
  onReply,
  onReact,
  onOpenReactions,
  onDelete,
  onJumpToMessage,
  onActionMenu,
}) => {
  const touchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  if (message.type === 'system') {
    return (
      <div className="flex justify-center my-2 px-4 animate-fade-in select-none">
        <div className="bg-chat-surfaceSecondary/90 border border-chat-border text-brand-600 dark:text-emerald-300 text-xs px-3.5 py-1.5 rounded-full text-center max-w-[90%] shadow-xs font-medium">
          {message.text}
        </div>
      </div>
    );
  }

  const renderStatusIcon = () => {
    if (!isMe) return null;

    switch (message.status) {
      case 'sending':
        return <Clock className="w-3.5 h-3.5 text-chat-bubbleOutText/50 animate-spin" />;
      case 'sent':
        return <Check className="w-3.5 h-3.5 text-chat-bubbleOutText/70" />;
      case 'delivered':
        return <CheckCheck className="w-3.5 h-3.5 text-chat-bubbleOutText/70" />;
      case 'read':
        return <CheckCheck className="w-3.5 h-3.5 text-sky-500 stroke-[2.5]" />;
      case 'failed':
        return <AlertCircle className="w-3.5 h-3.5 text-red-500" />;
      default:
        return <Check className="w-3.5 h-3.5 text-chat-bubbleOutText/70" />;
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches && e.touches.length > 0) {
      touchStartPosRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
      };
    }
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
    }
    touchTimerRef.current = setTimeout(() => {
      onActionMenu && onActionMenu(message);
    }, 450);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches && e.touches.length > 0) {
      const dx = Math.abs(e.touches[0].clientX - touchStartPosRef.current.x);
      const dy = Math.abs(e.touches[0].clientY - touchStartPosRef.current.y);
      if (dx > 6 || dy > 6) {
        if (touchTimerRef.current) {
          clearTimeout(touchTimerRef.current);
          touchTimerRef.current = null;
        }
      }
    }
  };

  const handleTouchEnd = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  };

  const handleTouchCancel = () => {
    if (touchTimerRef.current) {
      clearTimeout(touchTimerRef.current);
      touchTimerRef.current = null;
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Group and sort multiple reactions
  interface ReactionAggregate {
    emoji: string;
    count: number;
    isMine: boolean;
  }

  const reactionsList: ReactionAggregate[] = Object.entries(
    (message.reactions || []).reduce<Record<string, { count: number; isMine: boolean }>>((acc, curr) => {
      if (!acc[curr.emoji]) {
        acc[curr.emoji] = { count: 0, isMine: false };
      }
      acc[curr.emoji].count += 1;
      if (currentUserId && curr.userId === currentUserId) {
        acc[curr.emoji].isMine = true;
      }
      return acc;
    }, {})
  )
    .map(([emoji, data]) => ({ emoji, count: data.count, isMine: data.isMine }))
    .sort((a, b) => b.count - a.count);

  const MAX_VISIBLE_REACTIONS = 5;
  const visibleReactions = reactionsList.slice(0, MAX_VISIBLE_REACTIONS);
  const hiddenReactionsCount = Math.max(0, reactionsList.length - MAX_VISIBLE_REACTIONS);

  const isCustomEmojiMessage =
    message.type === 'custom_emoji' ||
    (message.type === 'text' && /^:[a-z0-9_]+:$/.test(message.text.trim()) && Boolean(getCustomEmojiById(message.text.trim().slice(1, -1))));

  const customEmojiId =
    message.customEmojiId ||
    (message.type === 'custom_emoji'
      ? message.text?.trim()
      : message.text?.trim().replace(/^:|:$/g, ''));

  const customEmojiData = customEmojiId ? getCustomEmojiById(customEmojiId) : null;
  const burstConfig = customEmojiData?.burst;

  // Render Reaction Badges Row
  const renderReactionBadges = () => {
    if (reactionsList.length === 0) return null;

    return (
      <div
        className={`flex items-center flex-wrap gap-1 mt-1 z-10 select-none ${
          isMe ? 'self-end mr-1' : 'self-start ml-1'
        }`}
      >
        {visibleReactions.map(({ emoji, count, isMine }) => {
          const isCustom = isCustomEmojiId(emoji);

          return (
            <button
              key={emoji}
              type="button"
              onClick={() => onReact && onReact(message._id, emoji)}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onOpenReactions && onOpenReactions(message, emoji);
              }}
              className={`px-2 py-0.5 rounded-full border text-xs shadow-xs flex items-center gap-1.5 transition-all cursor-pointer select-none active:scale-95 ${
                isMine
                  ? 'bg-brand-500/15 border-brand-500/50 text-brand-600 dark:text-brand-400 font-bold'
                  : 'bg-chat-card/95 border-chat-border text-chat-textPrimary hover:bg-chat-surfaceSecondary'
              }`}
              title={isMine ? 'You reacted. Tap to remove' : 'Tap to react or hold for details'}
            >
              {isCustom ? (
                <div className="pointer-events-none">
                  <AnimatedCustomEmoji
                    emojiId={emoji}
                    size={18}
                    autoPlay={false}
                    loop={false}
                    interactive={false}
                  />
                </div>
              ) : (
                <span className="text-xs leading-none">{emoji}</span>
              )}
              <span className="text-[10px] font-mono font-bold leading-none">{count}</span>
            </button>
          );
        })}

        {hiddenReactionsCount > 0 && (
          <button
            type="button"
            onClick={() => onOpenReactions && onOpenReactions(message, 'all')}
            className="px-2 py-0.5 rounded-full bg-chat-card/95 border border-chat-border text-chat-textMuted hover:text-chat-textPrimary text-[11px] font-bold shadow-xs flex items-center transition-all active:scale-95 cursor-pointer"
            title="View all reactions"
          >
            +{hiddenReactionsCount}
          </button>
        )}
      </div>
    );
  };

  // Standalone Custom Emoji Message (Large, transparent background, no bulky bubble + Emoji Burst)
  if (isCustomEmojiMessage && customEmojiId) {
    return (
      <div
        className={`relative flex flex-col ${isMe ? 'items-end' : 'items-start'} my-2 px-3 group select-none animate-message-enter`}
        onContextMenu={(e) => {
          e.preventDefault();
          onActionMenu && onActionMenu(message);
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        {/* Sender Name / Nickname in Group Chat */}
        {isGroup && !isMe && (
          <p className={`text-[11px] font-bold ${getSenderColor(message.senderId)} mb-1 ml-1 leading-none select-none tracking-wide`}>
            {senderDisplayName || message.senderNickname || 'Member'}
          </p>
        )}

        {/* Reply Quote Banner */}
        {message.replyTo && (
          <div
            onClick={() => onJumpToMessage && onJumpToMessage(String(message.replyTo?.messageId))}
            className="mb-1.5 p-2 rounded-xl bg-black/5 dark:bg-black/20 border-l-4 border-brand-500 text-xs cursor-pointer select-none hover:bg-black/10 transition-colors max-w-[240px]"
          >
            <div className="font-semibold text-brand-600 dark:text-brand-400 truncate">
              {message.replyTo.senderName || 'Replied Message'}
            </div>
            <div className="text-chat-textSecondary truncate text-[11px]">
              {message.replyTo.type === 'image'
                ? '📷 Photo'
                : message.replyTo.type === 'audio'
                ? '🎤 Voice Message'
                : message.replyTo.fileName
                ? `📄 ${message.replyTo.fileName}`
                : message.replyTo.text}
            </div>
          </div>
        )}

        {/* Large Animated Emoji Display with Optional Burst */}
        <div className="relative p-1 select-none flex flex-col items-center">
          {burstConfig?.enabled && (
            <EmojiBurstEffect
              type={burstConfig.type}
              duration={burstConfig.duration || 750}
            />
          )}

          <AnimatedCustomEmoji
            emojiId={customEmojiId}
            size={136}
            autoPlay={true}
            interactive={true}
          />

          {/* Time and Status Badge */}
          <div className={`mt-1 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/30 backdrop-blur-xs text-white text-[10px] font-medium tracking-tight shadow-xs ${isMe ? 'self-end' : 'self-start'}`}>
            <span>{formatMessageTime(message.createdAt)}</span>
            {renderStatusIcon()}
          </div>
        </div>

        {/* Multiple Reaction Badges */}
        {renderReactionBadges()}

        {/* Failed Retry CTA */}
        {isMe && message.status === 'failed' && (
          <button
            onClick={() => onRetry && onRetry(message)}
            className="mt-1 flex items-center gap-1 text-xs text-red-500 hover:text-red-400 transition-colors pressable"
          >
            <AlertCircle className="w-3 h-3" />
            <span>Failed. Tap to retry</span>
          </button>
        )}
      </div>
    );
  }

  const renderTextWithInlineEmojis = (text: string) => {
    const parts = text.split(/(:[a-z0-9_]+:)/g);
    return parts.map((part, index) => {
      const match = part.match(/^:([a-z0-9_]+):$/);
      if (match) {
        const emojiId = match[1];
        if (getCustomEmojiById(emojiId)) {
          return (
            <span key={index} className="inline-flex items-center align-middle mx-0.5">
              <AnimatedCustomEmoji emojiId={emojiId} size={28} autoPlay={false} interactive={true} />
            </span>
          );
        }
      }
      return <React.Fragment key={index}>{part}</React.Fragment>;
    });
  };

  return (
    <div
      className={`relative flex flex-col ${isMe ? 'items-end' : 'items-start'} my-1 px-3 group select-none animate-message-enter`}
      onContextMenu={(e) => {
        e.preventDefault();
        onActionMenu && onActionMenu(message);
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      {/* Sender Name / Nickname in Group Chat */}
      {isGroup && !isMe && (
        <p className={`text-[11px] font-bold ${getSenderColor(message.senderId)} mb-1 ml-2 leading-none select-none tracking-wide`}>
          {senderDisplayName || message.senderNickname || 'Member'}
        </p>
      )}

      {/* Main Bubble Container */}
      <div
        className={`relative max-w-[82%] sm:max-w-[70%] rounded-2xl p-2.5 pb-5 transition-all shadow-xs select-none ${
          isMe
            ? 'bg-chat-bubbleOutBg text-chat-bubbleOutText rounded-tr-xs ml-auto border border-brand-500/10'
            : 'bg-chat-bubbleInBg text-chat-bubbleInText rounded-tl-xs mr-auto border border-chat-border'
        }`}
      >
        {/* Reply Quote Banner */}
        {message.replyTo && (
          <div
            onClick={() => onJumpToMessage && onJumpToMessage(String(message.replyTo?.messageId))}
            className="mb-1.5 p-2 rounded-xl bg-black/5 dark:bg-black/20 border-l-4 border-brand-500 text-xs cursor-pointer select-none hover:bg-black/10 transition-colors"
          >
            <div className="font-semibold text-brand-600 dark:text-brand-400 truncate">
              {message.replyTo.senderName || 'Replied Message'}
            </div>
            <div className="text-chat-textSecondary truncate text-[11px]">
              {message.replyTo.type === 'image'
                ? '📷 Photo'
                : message.replyTo.type === 'audio'
                ? '🎤 Voice Message'
                : message.replyTo.fileName
                ? `📄 ${message.replyTo.fileName}`
                : message.replyTo.text}
            </div>
          </div>
        )}

        {/* Story Context Quote Banner */}
        {message.storyContext && (
          <div className="mb-2 p-2 rounded-xl bg-black/5 dark:bg-black/20 border-l-4 border-purple-500 text-xs">
            <div className="flex items-center justify-between gap-2 mb-1">
              <span className="font-semibold text-purple-600 dark:text-purple-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                <span>Story Reply</span>
              </span>
              {message.storyContext.storyOwnerName && (
                <span className="text-[10px] text-chat-textSecondary">
                  to {message.storyContext.storyOwnerName}'s story
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {message.storyContext.thumbnailUrl || message.storyContext.mediaUrl ? (
                <img
                  src={getMediaUrl(message.storyContext.thumbnailUrl || message.storyContext.mediaUrl || '')}
                  alt="Story"
                  className="w-10 h-10 rounded-lg object-cover flex-shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center text-xs font-bold text-purple-600 flex-shrink-0">
                  Aa
                </div>
              )}
              <div className="min-w-0 flex-1">
                {message.storyContext.originalText && (
                  <p className="text-[11px] text-chat-textSecondary truncate italic">
                    "{message.storyContext.originalText}"
                  </p>
                )}
                {message.storyContext.reaction && (
                  <div className="text-base mt-0.5">
                    {message.storyContext.reaction}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Image / Video Attachment */}
        {message.type === 'image' && message.attachment && (
          <div className="mb-1 rounded-xl overflow-hidden cursor-pointer" onClick={() => onOpenMedia && onOpenMedia(message)}>
            <img
              src={getMediaUrl(message.attachment.url)}
              alt="Attachment"
              className="max-h-72 w-full object-cover rounded-xl hover:opacity-95 transition-opacity"
              loading="lazy"
            />
          </div>
        )}

        {/* Audio / Voice Message */}
        {message.type === 'audio' && message.attachment && (
          <div className="py-1">
            <VoiceMessagePlayer
              audioUrl={getMediaUrl(message.attachment.url)}
              duration={message.attachment.duration || 0}
              isMe={isMe}
            />
          </div>
        )}

        {/* Document Attachment */}
        {message.type === 'document' && message.attachment && (
          <div
            onClick={() => onOpenDocument ? onOpenDocument(message) : onDownloadDocument && onDownloadDocument(message)}
            className="flex items-center gap-3 p-2.5 rounded-xl bg-black/5 dark:bg-black/20 hover:bg-black/10 dark:hover:bg-black/30 transition-colors cursor-pointer mb-1 border border-chat-border/50"
          >
            <div className="p-2 rounded-lg bg-brand-500/20 text-brand-500 flex-shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold truncate text-chat-textPrimary">
                {message.attachment.fileName || 'Document'}
              </div>
              <div className="text-[10px] text-chat-textSecondary">
                {formatFileSize(message.attachment.size)}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDownloadDocument && onDownloadDocument(message);
              }}
              className="p-1.5 rounded-full hover:bg-chat-surfaceSecondary text-chat-textSecondary hover:text-chat-textPrimary transition-colors flex-shrink-0"
              title="Download file"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Text Message with Inline Custom Emoji support */}
        {message.text && message.type !== 'custom_emoji' && (
          <div className="text-[14.5px] leading-relaxed break-words whitespace-pre-wrap select-text pr-10">
            {renderTextWithInlineEmojis(message.text)}
          </div>
        )}

        {/* Voice/Video Call Event Card */}
        {message.type === 'call' && (
          <div className="flex items-center gap-2.5 py-1 pr-10">
            <div className={`p-2 rounded-full ${
              message.callDetails?.status === 'missed' || message.callDetails?.status === 'declined'
                ? 'bg-red-500/15 text-red-500'
                : 'bg-emerald-500/15 text-emerald-500'
            }`}>
              {message.callDetails?.status === 'missed' ? (
                <PhoneMissed className="w-4 h-4" />
              ) : message.callDetails?.status === 'declined' ? (
                <PhoneOff className="w-4 h-4" />
              ) : isMe ? (
                <PhoneOutgoing className="w-4 h-4" />
              ) : (
                <PhoneIncoming className="w-4 h-4" />
              )}
            </div>
            <div>
              <div className="text-xs font-semibold">
                {message.text || 'Voice Call'}
              </div>
              <div className={`text-[11px] ${isMe ? 'text-chat-bubbleOutText/70' : 'text-chat-bubbleInText/70'}`}>
                {message.callDetails?.status === 'missed'
                  ? 'Missed voice call'
                  : message.callDetails?.status === 'declined'
                  ? 'Call declined'
                  : message.callDetails?.duration
                  ? `${Math.floor(message.callDetails.duration / 60)}:${(message.callDetails.duration % 60).toString().padStart(2, '0')}`
                  : 'Voice call'}
              </div>
            </div>
          </div>
        )}

        {/* Bottom Time & Status Checkmarks */}
        <div className="absolute right-2.5 bottom-1 flex items-center gap-1 select-none">
          <span className={`text-[10px] font-medium tracking-tight ${isMe ? 'text-chat-bubbleOutText/70' : 'text-chat-bubbleInText/70'}`}>
            {formatMessageTime(message.createdAt)}
          </span>
          {renderStatusIcon()}
        </div>
      </div>

      {/* Multiple Reaction Badges */}
      {renderReactionBadges()}

      {/* Failed Retry CTA */}
      {isMe && message.status === 'failed' && (
        <button
          onClick={() => onRetry && onRetry(message)}
          className="mt-1 flex items-center gap-1 text-xs text-red-500 hover:text-red-400 transition-colors pressable"
        >
          <AlertCircle className="w-3 h-3" />
          <span>Failed. Tap to retry</span>
        </button>
      )}
    </div>
  );
};

export const MessageBubble = React.memo(MessageBubbleComponent, (prev, next) => {
  return (
    prev.isMe === next.isMe &&
    prev.isGroup === next.isGroup &&
    prev.senderDisplayName === next.senderDisplayName &&
    prev.currentUserId === next.currentUserId &&
    prev.message._id === next.message._id &&
    prev.message.clientMessageId === next.message.clientMessageId &&
    prev.message.status === next.message.status &&
    prev.message.text === next.message.text &&
    prev.message.senderNickname === next.message.senderNickname &&
    prev.message.type === next.message.type &&
    prev.message.customEmojiId === next.message.customEmojiId &&
    prev.message.storyContext === next.message.storyContext &&
    prev.message.attachment?.url === next.message.attachment?.url &&
    prev.message.attachment?.size === next.message.attachment?.size &&
    prev.message.callDetails?.status === next.message.callDetails?.status &&
    prev.message.callDetails?.duration === next.message.callDetails?.duration &&
    prev.message.reactions === next.message.reactions
  );
});

export default MessageBubble;
