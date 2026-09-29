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
  CornerUpRight,
  Phone,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  PhoneOff,
  Video,
  VideoOff,
  Sparkles,
} from 'lucide-react';
import { AnimatedCustomEmoji } from '../emoji/AnimatedCustomEmoji';
import { EmojiBurstEffect } from '../emoji/EmojiBurstEffect';
import { getCustomEmojiById, isCustomEmojiId } from '../../data/customEmojiCatalog';
import { LinkPreviewCard } from './LinkPreviewCard';
import { openExternalUrl } from '../../services/nativeMediaService';

export type MessagePositionInGroup = 'single' | 'first' | 'middle' | 'last';

interface MessageBubbleProps {
  message: IMessage;
  isMe: boolean;
  isGroup?: boolean;
  senderDisplayName?: string;
  currentUserId?: string;
  positionInGroup?: MessagePositionInGroup;
  isSelected?: boolean;
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
  'text-emerald-700 dark:text-emerald-400',
  'text-sky-700 dark:text-sky-400',
  'text-amber-800 dark:text-amber-400',
  'text-purple-700 dark:text-purple-400',
  'text-rose-700 dark:text-rose-400',
  'text-indigo-700 dark:text-indigo-400',
  'text-teal-700 dark:text-teal-400',
  'text-pink-700 dark:text-pink-400',
  'text-cyan-800 dark:text-cyan-400',
  'text-orange-700 dark:text-orange-400',
];

export const getSenderColor = (senderId?: string): string => {
  if (!senderId) return 'text-emerald-700 dark:text-emerald-400';
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
  positionInGroup = 'single',
  isSelected = false,
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
      <div className="flex justify-center my-2.5 px-4 animate-fade-in select-none">
        <div className="bg-chat-surfaceSecondary border border-chat-border text-chat-textSecondary text-xs px-3.5 py-1.5 rounded-full text-center max-w-[85%] shadow-2xs font-medium">
          {message.text}
        </div>
      </div>
    );
  }

  const renderStatusIcon = (isOverlay = false) => {
    if (!isMe) return null;

    if (isOverlay) {
      switch (message.status) {
        case 'sending':
          return <Clock className="w-3 h-3 text-white/70 animate-spin" />;
        case 'sent':
          return <Check className="w-3.5 h-3.5 text-white/90" />;
        case 'delivered':
          return <CheckCheck className="w-3.5 h-3.5 text-white/90" />;
        case 'read':
          return <CheckCheck className="w-3.5 h-3.5 text-sky-400 stroke-[2.5]" />;
        case 'failed':
          return (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRetry && onRetry(message);
              }}
              title="Retry sending message"
              className="hover:scale-110 active:scale-95 transition-transform"
            >
              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
            </button>
          );
        default:
          return <Check className="w-3.5 h-3.5 text-white/90" />;
      }
    }

    switch (message.status) {
      case 'sending':
        return <Clock className="w-3 h-3 text-chat-bubbleOutText/50 animate-spin" />;
      case 'sent':
        return <Check className="w-3.5 h-3.5 text-chat-bubbleOutText/70" />;
      case 'delivered':
        return <CheckCheck className="w-3.5 h-3.5 text-chat-bubbleOutText/70" />;
      case 'read':
        return <CheckCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-sky-400 stroke-[2.5]" />;
      case 'failed':
        return (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRetry && onRetry(message);
            }}
            title="Retry sending message"
            className="hover:scale-110 active:scale-95 transition-transform"
          >
            <AlertCircle className="w-3.5 h-3.5 text-red-500" />
          </button>
        );
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
    }, 400);
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

  const URL_REGEX = /https?:\/\/[^\s<]+[^<.,:;"')\]\s]/i;
  const extractedUrl = message.text ? message.text.match(URL_REGEX)?.[0] : null;
  const previewUrl = message.linkPreview?.url || extractedUrl;

  // Compute refined corner radius based on consecutive position and sender side
  const getCornerRadiusClass = () => {
    if (isMe) {
      switch (positionInGroup) {
        case 'first':
          return 'rounded-[20px] rounded-tr-[5px] rounded-br-[6px]';
        case 'middle':
          return 'rounded-[20px] rounded-tr-[6px] rounded-br-[6px]';
        case 'last':
          return 'rounded-[20px] rounded-tr-[6px] rounded-br-[5px]';
        case 'single':
        default:
          return 'rounded-[20px] rounded-tr-[5px]';
      }
    } else {
      switch (positionInGroup) {
        case 'first':
          return 'rounded-[20px] rounded-tl-[5px] rounded-bl-[6px]';
        case 'middle':
          return 'rounded-[20px] rounded-tl-[6px] rounded-bl-[6px]';
        case 'last':
          return 'rounded-[20px] rounded-tl-[6px] rounded-bl-[5px]';
        case 'single':
        default:
          return 'rounded-[20px] rounded-tl-[5px]';
      }
    }
  };

  // Compute rhythm vertical spacing
  const getVerticalSpacingClass = () => {
    if (positionInGroup === 'first' || positionInGroup === 'single') {
      return 'mt-2 mb-0.5';
    }
    if (positionInGroup === 'middle') {
      return 'my-0.5';
    }
    if (positionInGroup === 'last') {
      return 'mt-0.5 mb-2';
    }
    return 'my-0.5';
  };

  // Render Reaction Badges Row
  const renderReactionBadges = () => {
    if (reactionsList.length === 0) return null;

    return (
      <div
        className={`flex items-center flex-wrap gap-1 mt-1 z-10 select-none ${
          isMe ? 'self-end mr-1.5' : 'self-start ml-1.5'
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
              className={`px-2 py-0.5 rounded-full border text-xs shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer select-none active:scale-95 ${
                isMine
                  ? 'bg-brand-500/15 border-brand-500/40 text-brand-600 dark:text-brand-400 font-bold'
                  : 'bg-chat-card/95 border-chat-border/60 text-chat-textPrimary hover:bg-chat-surfaceSecondary'
              }`}
              title={isMine ? 'You reacted. Tap to remove' : 'Tap to react or hold for details'}
            >
              {isCustom ? (
                <div className="pointer-events-none">
                  <AnimatedCustomEmoji
                    emojiId={emoji}
                    size={17}
                    autoPlay={false}
                    loop={false}
                    interactive={false}
                  />
                </div>
              ) : (
                <span className="text-xs leading-none">{emoji}</span>
              )}
              <span className="text-[10.5px] font-mono font-bold leading-none">{count}</span>
            </button>
          );
        })}

        {hiddenReactionsCount > 0 && (
          <button
            type="button"
            onClick={() => onOpenReactions && onOpenReactions(message, 'all')}
            className="px-2 py-0.5 rounded-full bg-chat-card/95 border border-chat-border/60 text-chat-textMuted hover:text-chat-textPrimary text-[11px] font-bold shadow-2xs flex items-center transition-all active:scale-95 cursor-pointer"
            title="View all reactions"
          >
            +{hiddenReactionsCount}
          </button>
        )}
      </div>
    );
  };

  // Standalone Custom Emoji Message (Large, transparent background, no bulky bubble + Burst)
  if (isCustomEmojiMessage && customEmojiId) {
    return (
      <div
        className={`relative flex flex-col ${isMe ? 'items-end' : 'items-start'} ${getVerticalSpacingClass()} px-3 group select-none ${
          isSelected ? 'scale-[1.02]' : ''
        }`}
        onContextMenu={(e) => {
          e.preventDefault();
          onActionMenu && onActionMenu(message);
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchCancel}
      >
        {/* Sender Name / Nickname in Group Chat (only on first or single message) */}
        {isGroup && !isMe && (positionInGroup === 'first' || positionInGroup === 'single') && (
          <p className={`text-[11px] font-bold ${getSenderColor(message.senderId)} mb-1 ml-1 leading-none select-none tracking-wide`}>
            {senderDisplayName || message.senderNickname || 'Member'}
          </p>
        )}

        {/* Forwarded Header */}
        {message.forwardedFrom && (
          <div className="flex items-center gap-1 text-[11px] font-medium text-chat-textSecondary italic mb-1 px-1 select-none">
            <CornerUpRight className="w-3.5 h-3.5" />
            <span>Forwarded{message.forwardedFrom.senderName ? ` from ${message.forwardedFrom.senderName}` : ''}</span>
          </div>
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
            size={132}
            autoPlay={true}
            interactive={true}
          />

          {/* Time and Status Badge */}
          <div className={`mt-1 flex items-center gap-1 px-2 py-0.5 rounded-full bg-black/35 backdrop-blur-xs text-white text-[10px] font-medium tracking-tight shadow-xs ${isMe ? 'self-end' : 'self-start'}`}>
            <span>{formatMessageTime(message.createdAt)}</span>
            {message.editedAt && <span className="text-[9px] italic opacity-80">Edited</span>}
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
    // 1. Split text into emoji codes and text segments
    const emojiParts = text.split(/(:[a-z0-9_]+:)/g);
    const URL_SPLIT_REGEX = /(https?:\/\/[^\s<]+[^<.,:;"')\]\s]|(?:www\.)[^\s<]+[^<.,:;"')\]\s])/gi;

    return emojiParts.map((part, index) => {
      const match = part.match(/^:([a-z0-9_]+):$/);
      if (match) {
        const emojiId = match[1];
        if (getCustomEmojiById(emojiId)) {
          return (
            <span key={index} className="inline-flex items-center align-middle mx-0.5">
              <AnimatedCustomEmoji emojiId={emojiId} size={26} autoPlay={false} interactive={true} />
            </span>
          );
        }
      }

      // If plain text, check for URLs and linkify them
      const urlParts = part.split(URL_SPLIT_REGEX);
      if (urlParts.length === 1) {
        return <React.Fragment key={index}>{part}</React.Fragment>;
      }

      return (
        <React.Fragment key={index}>
          {urlParts.map((subpart, subIndex) => {
            if (/^(https?:\/\/|www\.)/i.test(subpart)) {
              let targetUrl = subpart;
              if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
                targetUrl = 'https://' + targetUrl;
              }
              return (
                <a
                  key={`url-${index}-${subIndex}`}
                  href={targetUrl}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    openExternalUrl(targetUrl);
                  }}
                  onTouchStart={(e) => e.stopPropagation()}
                  className={`underline break-all transition-opacity font-semibold ${
                    isMe
                      ? 'text-inherit underline decoration-current/60 hover:opacity-85'
                      : 'text-brand-700 dark:text-brand-400 underline decoration-brand-600/50 dark:decoration-brand-400/50 hover:opacity-85'
                  }`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {subpart}
                </a>
              );
            }
            return <React.Fragment key={`txt-${index}-${subIndex}`}>{subpart}</React.Fragment>;
          })}
        </React.Fragment>
      );
    });
  };

  const isPureImage = message.type === 'image' && Boolean(message.attachment) && !message.text && !message.replyTo && !message.storyContext;
  const isImageWithTextOrQuote = message.type === 'image' && Boolean(message.attachment) && (Boolean(message.text) || Boolean(message.replyTo) || Boolean(message.storyContext));

  const getBubblePaddingClass = () => {
    if (isPureImage) {
      return 'p-1';
    }
    if (isImageWithTextOrQuote) {
      return 'p-1.5 pb-2.5';
    }
    return 'px-3.5 pt-2.5 pb-2';
  };

  return (
    <div
      className={`relative flex flex-col ${isMe ? 'items-end' : 'items-start'} ${getVerticalSpacingClass()} px-3 group select-none ${
        isSelected ? 'scale-[1.01]' : ''
      }`}
      onContextMenu={(e) => {
        e.preventDefault();
        onActionMenu && onActionMenu(message);
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      {/* Sender Name in Group Chat (only on first or single message in group) */}
      {isGroup && !isMe && (positionInGroup === 'first' || positionInGroup === 'single') && (
        <p className={`text-[11.5px] font-bold ${getSenderColor(message.senderId)} mb-1 ml-2 leading-none select-none tracking-wide`}>
          {senderDisplayName || message.senderNickname || 'Member'}
        </p>
      )}

      {/* Main Bubble Container (Soft Surfaces & Adaptive Corners) */}
      <div
        className={`relative ${isPureImage ? 'w-fit max-w-[78%] sm:max-w-[70%]' : 'max-w-[80%] sm:max-w-[70%]'} ${getBubblePaddingClass()} transition-all shadow-[0_1px_2px_rgba(0,0,0,0.06)] select-none ${getCornerRadiusClass()} ${
          isMe
            ? 'bg-chat-bubbleOut text-chat-bubbleOutText ml-auto'
            : 'bg-chat-bubbleIn text-chat-bubbleInText mr-auto border border-chat-bubbleInBorder'
        }`}
      >
        {/* Forwarded Header Banner */}
        {message.forwardedFrom && (
          <div className={`flex items-center gap-1 text-[11px] font-medium italic mb-1.5 px-1 select-none ${
            isMe ? 'text-chat-bubbleOutText/80' : 'text-chat-bubbleInText/80'
          }`}>
            <CornerUpRight className="w-3.5 h-3.5" />
            <span>Forwarded{message.forwardedFrom.senderName ? ` from ${message.forwardedFrom.senderName}` : ''}</span>
          </div>
        )}

        {/* Reply Quote Banner */}
        {message.replyTo && (
          <div
            onClick={() => onJumpToMessage && onJumpToMessage(String(message.replyTo?.messageId))}
            className={`mb-2 p-2 rounded-xl text-xs cursor-pointer select-none transition-colors border-l-3 border-brand-500 ${
              isMe ? 'bg-black/8 dark:bg-black/25 text-chat-bubbleOutText' : 'bg-chat-surfaceSecondary dark:bg-white/5 text-chat-bubbleInText'
            }`}
          >
            <div className="font-semibold text-brand-600 dark:text-brand-400 truncate">
              {message.replyTo.senderName || 'Replied Message'}
            </div>
            <div className={`truncate text-[11px] text-chat-textSecondary opacity-90`}>
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
          <div className="mb-2 p-2 rounded-xl bg-purple-500/10 dark:bg-black/20 border-l-3 border-purple-500 text-xs">
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

        {/* Pure Image Attachment (Tight Wrap & Floating Timestamp) */}
        {isPureImage && message.attachment && (
          <div
            className="relative rounded-[16px] overflow-hidden cursor-pointer group select-none"
            onClick={() => onOpenMedia && onOpenMedia(message)}
          >
            <img
              src={getMediaUrl(message.attachment.url)}
              alt="Attachment"
              className="max-h-[380px] max-w-[280px] sm:max-w-[340px] w-auto h-auto object-cover rounded-[14px] hover:opacity-95 transition-opacity block"
              loading="lazy"
            />
            {/* Floating Frosted Time & Read Receipt Badge */}
            <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/55 backdrop-blur-xs text-white text-[10px] font-medium tracking-tight flex items-center gap-1 shadow-sm select-none pointer-events-none">
              <span>{formatMessageTime(message.createdAt)}</span>
              {message.editedAt && <span className="text-[9px] italic opacity-85">Edited</span>}
              {renderStatusIcon(true)}
            </div>
          </div>
        )}

        {/* Image Attachment with Caption or Story/Reply Header */}
        {isImageWithTextOrQuote && message.attachment && (
          <div className="mb-1 rounded-xl overflow-hidden cursor-pointer" onClick={() => onOpenMedia && onOpenMedia(message)}>
            <img
              src={getMediaUrl(message.attachment.url)}
              alt="Attachment"
              className="max-h-72 w-full object-cover rounded-xl hover:opacity-95 transition-opacity block"
              loading="lazy"
            />
          </div>
        )}

        {/* Audio / Voice Message */}
        {message.type === 'audio' && message.attachment && (
          <div className="py-1 min-w-[200px]">
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
            className={`flex items-center gap-3 p-2.5 rounded-xl transition-colors cursor-pointer mb-1 border ${
              isMe
                ? 'bg-black/8 dark:bg-black/20 hover:bg-black/12 border-black/10'
                : 'bg-chat-surfaceSecondary hover:bg-chat-surfaceTertiary border-chat-border/60'
            }`}
          >
            <div className="p-2.5 rounded-xl bg-brand-500/15 text-brand-600 dark:text-brand-400 flex-shrink-0">
              <FileText className="w-5 h-5 stroke-[2.2]" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold truncate text-chat-textPrimary">
                {message.attachment.fileName || 'Document'}
              </div>
              <div className="text-[10.5px] text-chat-textSecondary font-medium">
                {formatFileSize(message.attachment.size)}
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDownloadDocument && onDownloadDocument(message);
              }}
              className="p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-chat-surfaceSecondary text-chat-textSecondary hover:text-chat-textPrimary transition-colors flex-shrink-0"
              title="Download file"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Text Message Content + Inline/Tucked Timestamp */}
        {message.text && message.type !== 'custom_emoji' && message.type !== 'call' && (
          <div
            style={{ fontWeight: 'var(--chat-message-font-weight, 400)' }}
            className={`${isImageWithTextOrQuote ? 'px-1 pt-1' : ''} text-[15.5px] leading-[1.45] tracking-[-0.01em] break-words whitespace-pre-wrap select-text`}
          >
            {renderTextWithInlineEmojis(message.text)}
            
            {/* Inline Timestamp & Status Flow */}
            <span className="inline-flex items-center gap-1 float-right ml-2.5 mt-1 select-none align-baseline">
              <span className={`text-[11px] font-normal tracking-tight ${isMe ? 'text-chat-bubbleOutText/75' : 'text-chat-bubbleInText/70'}`}>
                {formatMessageTime(message.createdAt)}
                {message.editedAt && <span className="text-[10px] italic opacity-80 ml-1">Edited</span>}
              </span>
              {renderStatusIcon()}
            </span>
          </div>
        )}

        {/* Link Preview Card */}
        {message.type === 'text' && (previewUrl || message.linkPreview) && (
          <LinkPreviewCard
            url={previewUrl || message.linkPreview?.url || ''}
            initialPreview={message.linkPreview}
            isMe={isMe}
          />
        )}

        {/* Voice/Video Call Event Card */}
        {message.type === 'call' && (() => {
          const isMissed = message.callDetails?.status === 'missed';
          const isDeclined = message.callDetails?.status === 'declined';
          const isVideo = message.callDetails?.callType === 'video' || (typeof message.text === 'string' && message.text.toLowerCase().includes('video'));
          
          let callTitle = 'Voice call';
          if (isMissed) {
            callTitle = isVideo ? 'Missed video call' : 'Missed voice call';
          } else if (isDeclined) {
            callTitle = isVideo ? 'Declined video call' : 'Call declined';
          } else {
            callTitle = isVideo ? 'Video call' : 'Voice call';
          }

          let callSubtitle = '';
          if (message.callDetails?.duration && message.callDetails.duration > 0) {
            const mins = Math.floor(message.callDetails.duration / 60);
            const secs = message.callDetails.duration % 60;
            callSubtitle = `${mins}:${secs.toString().padStart(2, '0')}`;
          } else if (isMissed) {
            callSubtitle = isMe ? 'No answer' : 'Tap to call back';
          } else if (isDeclined) {
            callSubtitle = 'Declined';
          } else {
            callSubtitle = isVideo ? 'Video call' : 'Voice call';
          }

          return (
            <div className="flex items-center gap-3 py-1 min-w-[210px] select-none">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                isMissed || isDeclined
                  ? 'bg-red-500/15 text-red-500 dark:text-red-400'
                  : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
              }`}>
                {isVideo ? (
                  isMissed || isDeclined ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />
                ) : isMissed ? (
                  <PhoneMissed className="w-5 h-5" />
                ) : isDeclined ? (
                  <PhoneOff className="w-5 h-5" />
                ) : isMe ? (
                  <PhoneOutgoing className="w-5 h-5" />
                ) : (
                  <PhoneIncoming className="w-5 h-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className={`text-sm font-semibold truncate ${
                  isMe ? 'text-chat-bubbleOutText' : 'text-chat-textPrimary'
                }`}>
                  {callTitle}
                </div>
                <div className={`text-xs ${
                  isMe ? 'text-chat-bubbleOutText/75' : 'text-chat-textSecondary'
                }`}>
                  {callSubtitle}
                </div>
              </div>
              <div className="flex items-center gap-1 ml-2 self-end pb-0.5 shrink-0">
                <span className={`text-[11px] font-normal tracking-tight ${
                  isMe ? 'text-chat-bubbleOutText/75' : 'text-chat-bubbleInText/70'
                }`}>
                  {formatMessageTime(message.createdAt)}
                  {message.editedAt && <span className="text-[9.5px] italic opacity-80 ml-1">Edited</span>}
                </span>
                {renderStatusIcon()}
              </div>
            </div>
          );
        })()}

        {/* Media/Doc Bottom Timestamp fallback if no text and not pure image */}
        {!message.text && !isPureImage && message.type !== 'call' && message.type !== 'custom_emoji' && (
          <div className="mt-1 flex items-center justify-end gap-1 select-none">
            <span className={`text-[10.5px] font-normal ${isMe ? 'text-chat-bubbleOutText/75' : 'text-chat-bubbleInText/70'}`}>
              {formatMessageTime(message.createdAt)}
              {message.editedAt && <span className="text-[9.5px] italic opacity-80 ml-1">Edited</span>}
            </span>
            {renderStatusIcon()}
          </div>
        )}
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
    prev.positionInGroup === next.positionInGroup &&
    prev.isSelected === next.isSelected &&
    prev.senderDisplayName === next.senderDisplayName &&
    prev.currentUserId === next.currentUserId &&
    prev.message._id === next.message._id &&
    prev.message.clientMessageId === next.message.clientMessageId &&
    prev.message.status === next.message.status &&
    prev.message.text === next.message.text &&
    prev.message.editedAt === next.message.editedAt &&
    prev.message.forwardedFrom?.senderName === next.message.forwardedFrom?.senderName &&
    prev.message.forwardedFrom?.messageId === next.message.forwardedFrom?.messageId &&
    prev.message.linkPreview?.url === next.message.linkPreview?.url &&
    prev.message.linkPreview?.title === next.message.linkPreview?.title &&
    prev.message.linkPreview?.image === next.message.linkPreview?.image &&
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
