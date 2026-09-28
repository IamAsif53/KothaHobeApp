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
import { getCustomEmojiById } from '../../data/customEmojiCatalog';

interface MessageBubbleProps {
  message: IMessage;
  isMe: boolean;
  isGroup?: boolean;
  senderDisplayName?: string;
  onRetry?: (message: IMessage) => void;
  onOpenMedia?: (message: IMessage) => void;
  onOpenDocument?: (message: IMessage) => void;
  onDownloadDocument?: (message: IMessage) => void;
  onReply?: (message: IMessage) => void;
  onReact?: (messageId: string, emoji: string) => void;
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
  onRetry,
  onOpenMedia,
  onOpenDocument,
  onDownloadDocument,
  onReply,
  onReact,
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

  // Group reactions by emoji
  const aggregatedReactions = (message.reactions || []).reduce<Record<string, number>>((acc, curr) => {
    acc[curr.emoji] = (acc[curr.emoji] || 0) + 1;
    return acc;
  }, {});

  const isCustomEmojiMessage =
    message.type === 'custom_emoji' ||
    (message.type === 'text' && /^:[a-z0-9_]+:$/.test(message.text.trim()) && Boolean(getCustomEmojiById(message.text.trim().slice(1, -1))));

  const customEmojiId =
    message.customEmojiId ||
    (message.type === 'custom_emoji'
      ? message.text?.trim()
      : message.text?.trim().replace(/^:|:$/g, ''));

  // Standalone Custom Emoji Message (Large, transparent background, no bulky bubble)
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

        {/* Large Animated Emoji Display */}
        <div className="relative p-1 select-none flex flex-col items-center">
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

        {/* Aggregated Reaction Badges */}
        {Object.keys(aggregatedReactions).length > 0 && (
          <div
            className={`flex items-center gap-1 -mt-1 z-10 select-none ${
              isMe ? 'mr-2' : 'ml-2'
            }`}
          >
            {Object.entries(aggregatedReactions).map(([emoji, count]) => (
              <button
                key={emoji}
                onClick={() => onReact && onReact(message._id, emoji)}
                className="px-1.5 py-0.5 rounded-full bg-chat-card border border-chat-border text-xs shadow-md flex items-center gap-1 hover:scale-110 active:scale-95 transition-transform"
              >
                <span>{emoji}</span>
                {count > 1 && <span className="text-[10px] text-chat-textSecondary font-bold">{count}</span>}
              </button>
            ))}
          </div>
        )}

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
      if (part.startsWith(':') && part.endsWith(':')) {
        const emojiId = part.slice(1, -1);
        const emojiData = getCustomEmojiById(emojiId);
        if (emojiData) {
          return (
            <span key={index} className="inline-flex items-center justify-center align-middle mx-0.5">
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

      {/* Main Bubble Container */}
      <div
        className={`relative max-w-[85%] sm:max-w-[70%] rounded-2xl shadow-xs transition-all select-text overflow-hidden ${
          isMe
            ? 'bg-chat-bubbleOut text-chat-bubbleOutText rounded-tr-none'
            : 'bg-chat-bubbleIn text-chat-bubbleInText rounded-tl-none border border-chat-bubbleInBorder'
        } ${message.type === 'image' ? 'p-1 pb-6' : 'px-3.5 py-2'}`}
      >
        {/* Sender Name / Nickname in Group Chat */}
        {isGroup && !isMe && (
          <p className={`text-[11px] font-bold ${getSenderColor(message.senderId)} mb-1 leading-none select-none tracking-wide`}>
            {senderDisplayName || message.senderNickname || 'Member'}
          </p>
        )}

        {/* Reply Quote Banner */}
        {message.replyTo && (
          <div
            onClick={() => onJumpToMessage && onJumpToMessage(String(message.replyTo?.messageId))}
            className="mb-2 p-2 rounded-xl bg-black/5 dark:bg-black/20 border-l-4 border-brand-500 text-xs cursor-pointer select-none hover:bg-black/10 transition-colors"
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

        {/* 1. Image Message */}
        {message.type === 'image' && message.attachment && (
          <div
            onClick={() => onOpenMedia && onOpenMedia(message)}
            className="cursor-pointer overflow-hidden rounded-xl bg-black/10 dark:bg-black/20 relative group/img"
          >
            <img
              src={getMediaUrl(message.attachment.url)}
              alt={message.attachment.fileName || 'Photo'}
              loading="lazy"
              className="w-full max-h-72 object-cover rounded-xl transition-transform group-hover/img:scale-[1.02]"
            />
            {message.text && (
              <p className="px-2 py-1.5 text-sm whitespace-pre-wrap">{renderTextWithInlineEmojis(message.text)}</p>
            )}
          </div>
        )}

        {/* 2. Document Message Card with Separate Native Open & Download */}
        {message.type === 'document' && message.attachment && (
          <div
            onClick={() => onOpenDocument && onOpenDocument(message)}
            className="flex flex-col gap-2 p-2.5 rounded-xl bg-black/5 dark:bg-black/20 hover:bg-black/10 dark:hover:bg-black/30 cursor-pointer border border-chat-border transition-colors min-w-[220px]"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-500/20 text-brand-500 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-chat-textPrimary truncate">
                  {message.attachment.fileName}
                </div>
                <div className="text-[11px] text-chat-textSecondary">
                  {formatFileSize(message.attachment.size)} • Tap to open
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-chat-divider">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDownloadDocument && onDownloadDocument(message);
                }}
                className="flex items-center gap-1.5 text-xs text-brand-600 dark:text-brand-400 hover:text-brand-500 font-semibold py-1 px-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>
              <span className="text-[10px] text-chat-textTertiary">Native View</span>
            </div>
          </div>
        )}

        {/* 3. Audio / Voice Message */}
        {message.type === 'audio' && message.attachment && (
          <VoiceMessagePlayer
            audioUrl={message.attachment.url}
            duration={message.attachment.duration}
            isMe={isMe}
          />
        )}

        {/* 4. Text Message */}
        {message.type === 'text' && (
          <p className="whitespace-pre-wrap pr-12 text-[14.5px] leading-relaxed">
            {renderTextWithInlineEmojis(message.text)}
          </p>
        )}

        {/* 4.5. Story Reply Message Card */}
        {message.type === 'story_reply' && (
          <div className="flex flex-col gap-2 min-w-[200px] pr-8 select-none">
            <div className="p-2 rounded-xl bg-black/5 dark:bg-black/20 border border-chat-border flex items-center gap-2.5">
              {message.storyContext?.storyType === 'image' && (message.storyContext.thumbnailUrl || message.storyContext.mediaUrl) ? (
                <img
                  src={message.storyContext.thumbnailUrl || message.storyContext.mediaUrl}
                  alt="Story preview"
                  className="w-10 h-10 object-cover rounded-lg flex-shrink-0"
                />
              ) : (
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-emerald-600 to-teal-800 flex items-center justify-center text-[10px] text-white font-bold p-1 text-center line-clamp-2 flex-shrink-0 shadow-sm">
                  Story
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 text-[10px] text-brand-600 dark:text-emerald-400 font-bold uppercase tracking-wider">
                  <Sparkles className="w-3 h-3" />
                  <span>Story Reply</span>
                </div>
                <p className="text-xs text-chat-textSecondary truncate font-medium mt-0.5">
                  {message.storyContext?.originalText || (message.storyContext?.storyType === 'image' ? 'Photo story' : 'Story')}
                </p>
                {message.storyContext?.reaction && (
                  <span className="inline-block mt-0.5 text-base leading-none">
                    {message.storyContext.reaction}
                  </span>
                )}
              </div>
            </div>

            {/* Comment text if present */}
            {message.text && (
              <p className={`whitespace-pre-wrap text-[14.5px] leading-relaxed ${isMe ? 'text-chat-bubbleOutText' : 'text-chat-bubbleInText'}`}>
                {message.text}
              </p>
            )}
          </div>
        )}

        {/* 5. Call Record Event */}
        {message.type === 'call' && (
          <div className="flex items-center gap-3 py-1 pr-12">
            <div
              className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                message.callDetails?.status === 'missed' || message.callDetails?.status === 'declined'
                  ? 'bg-red-500/20 text-red-500'
                  : 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
              }`}
            >
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
              <div className={`text-sm font-semibold ${isMe ? 'text-chat-bubbleOutText' : 'text-chat-bubbleInText'}`}>
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

      {/* Aggregated Reaction Badges */}
      {Object.keys(aggregatedReactions).length > 0 && (
        <div
          className={`flex items-center gap-1 -mt-2.5 z-10 select-none ${
            isMe ? 'mr-2' : 'ml-2'
          }`}
        >
          {Object.entries(aggregatedReactions).map(([emoji, count]) => (
            <button
              key={emoji}
              onClick={() => onReact && onReact(message._id, emoji)}
              className="px-1.5 py-0.5 rounded-full bg-chat-card border border-chat-border text-xs shadow-md flex items-center gap-1 hover:scale-110 active:scale-95 transition-transform"
            >
              <span>{emoji}</span>
              {count > 1 && <span className="text-[10px] text-chat-textSecondary font-bold">{count}</span>}
            </button>
          ))}
        </div>
      )}

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
    prev.message.callDetails?.duration === next.message.callDetails?.duration
  );
});
