import React, { useState, useRef } from 'react';
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
} from 'lucide-react';

interface MessageBubbleProps {
  message: IMessage;
  isMe: boolean;
  onRetry?: (message: IMessage) => void;
  onOpenMedia?: (message: IMessage) => void;
  onOpenDocument?: (message: IMessage) => void;
  onDownloadDocument?: (message: IMessage) => void;
  onReply?: (message: IMessage) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onDelete?: (messageId: string, deleteForEveryone: boolean) => void;
  onJumpToMessage?: (messageId: string) => void;
}

const QUICK_REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '👏'];

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isMe,
  onRetry,
  onOpenMedia,
  onOpenDocument,
  onDownloadDocument,
  onReply,
  onReact,
  onDelete,
  onJumpToMessage,
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const touchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const renderStatusIcon = () => {
    if (!isMe) return null;

    switch (message.status) {
      case 'sending':
        return <Clock className="w-3.5 h-3.5 text-white/50 animate-spin" />;
      case 'sent':
        return <Check className="w-3.5 h-3.5 text-white/60" />;
      case 'delivered':
        return <CheckCheck className="w-3.5 h-3.5 text-white/60" />;
      case 'read':
        return <CheckCheck className="w-3.5 h-3.5 text-sky-400 stroke-[2.5]" />;
      case 'failed':
        return <AlertCircle className="w-3.5 h-3.5 text-red-400" />;
      default:
        return <Check className="w-3.5 h-3.5 text-white/60" />;
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
      setShowMenu(true);
    }, 550);
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

  const handleCopyText = () => {
    if (message.text) {
      navigator.clipboard.writeText(message.text);
    }
    setShowMenu(false);
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

  return (
    <div
      className={`relative flex flex-col ${isMe ? 'items-end' : 'items-start'} my-1 px-3 group select-none`}
      onContextMenu={(e) => {
        e.preventDefault();
        setShowMenu(true);
      }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      {/* Context Action Menu Modal */}
      {showMenu && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowMenu(false)}
        >
          <div
            className="bg-[#202c33] border border-white/10 rounded-2xl p-4 w-full max-w-xs shadow-2xl space-y-3 animate-scale-up"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Quick Reactions Bar */}
            <div className="flex items-center justify-between bg-[#111b21] p-2 rounded-xl text-2xl">
              {QUICK_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => {
                    onReact && onReact(message._id, emoji);
                    setShowMenu(false);
                  }}
                  className="hover:scale-125 active:scale-95 transition-transform p-1 cursor-pointer"
                >
                  {emoji}
                </button>
              ))}
            </div>

            {/* Menu Items */}
            <div className="space-y-1 divide-y divide-white/5 text-sm">
              <button
                onClick={() => {
                  onReply && onReply(message);
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 text-white rounded-lg transition-colors"
              >
                <CornerUpLeft className="w-4 h-4 text-brand-400" />
                <span>Reply</span>
              </button>

              {message.text && (
                <button
                  onClick={handleCopyText}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 text-white rounded-lg transition-colors"
                >
                  <Copy className="w-4 h-4 text-chat-textMuted" />
                  <span>Copy Text</span>
                </button>
              )}

              {message.attachment && (
                <button
                  onClick={() => {
                    if (message.type === 'image') onOpenMedia && onOpenMedia(message);
                    else if (message.type === 'document') onOpenDocument && onOpenDocument(message);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 text-white rounded-lg transition-colors"
                >
                  <ExternalLink className="w-4 h-4 text-sky-400" />
                  <span>Open Attachment</span>
                </button>
              )}

              {message.type === 'document' && (
                <button
                  onClick={() => {
                    onDownloadDocument && onDownloadDocument(message);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 text-white rounded-lg transition-colors"
                >
                  <Download className="w-4 h-4 text-emerald-400" />
                  <span>Download to Device</span>
                </button>
              )}

              <button
                onClick={() => {
                  onDelete && onDelete(message._id, false);
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-white/5 text-chat-textMuted hover:text-red-400 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4 text-chat-textMuted" />
                <span>Delete for me</span>
              </button>

              {isMe && (
                <button
                  onClick={() => {
                    onDelete && onDelete(message._id, true);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-red-500/10 text-red-400 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                  <span>Delete for everyone</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Main Bubble Container */}
      <div
        className={`relative max-w-[85%] sm:max-w-[70%] rounded-2xl shadow-md transition-all select-text overflow-hidden ${
          isMe
            ? 'bg-chat-bubbleOut text-white rounded-tr-none'
            : 'bg-chat-bubbleIn text-chat-textPrimary rounded-tl-none border border-white/5'
        } ${message.type === 'image' ? 'p-1 pb-6' : 'px-3.5 py-2'}`}
      >
        {/* Reply Quote Banner */}
        {message.replyTo && (
          <div
            onClick={() => onJumpToMessage && onJumpToMessage(String(message.replyTo?.messageId))}
            className="mb-2 p-2 rounded-xl bg-black/20 border-l-4 border-brand-400 text-xs cursor-pointer select-none hover:bg-black/30 transition-colors"
          >
            <div className="font-semibold text-brand-400 truncate">
              {message.replyTo.senderName || 'Replied Message'}
            </div>
            <div className="text-white/70 truncate text-[11px]">
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
            className="cursor-pointer overflow-hidden rounded-xl bg-black/20 relative group/img"
          >
            <img
              src={getMediaUrl(message.attachment.url)}
              alt={message.attachment.fileName || 'Photo'}
              loading="lazy"
              className="w-full max-h-72 object-cover rounded-xl transition-transform group-hover/img:scale-[1.02]"
            />
            {message.text && (
              <p className="px-2 py-1.5 text-sm whitespace-pre-wrap">{message.text}</p>
            )}
          </div>
        )}

        {/* 2. Document Message Card with Separate Native Open & Download */}
        {message.type === 'document' && message.attachment && (
          <div
            onClick={() => onOpenDocument && onOpenDocument(message)}
            className="flex flex-col gap-2 p-2.5 rounded-xl bg-black/20 hover:bg-black/30 cursor-pointer border border-white/5 transition-colors min-w-[220px]"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center flex-shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white truncate">
                  {message.attachment.fileName}
                </div>
                <div className="text-[11px] text-white/60">
                  {formatFileSize(message.attachment.size)} • Tap to open
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1 border-t border-white/5">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onDownloadDocument && onDownloadDocument(message);
                }}
                className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 font-semibold py-1 px-2 rounded-lg hover:bg-white/5 transition-colors"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>
              <span className="text-[10px] text-white/40">Native View</span>
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
            {message.text}
          </p>
        )}

        {/* Bottom Time & Status Checkmarks */}
        <div className="absolute right-2.5 bottom-1 flex items-center gap-1 select-none">
          <span className="text-[10px] text-white/60 font-medium tracking-tight">
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
              className="px-1.5 py-0.5 rounded-full bg-[#202c33] border border-white/10 text-xs shadow-md flex items-center gap-1 hover:scale-110 active:scale-95 transition-transform"
            >
              <span>{emoji}</span>
              {count > 1 && <span className="text-[10px] text-white/70 font-bold">{count}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Failed Retry CTA */}
      {isMe && message.status === 'failed' && (
        <button
          onClick={() => onRetry && onRetry(message)}
          className="mt-1 flex items-center gap-1 text-xs text-red-400 hover:text-red-300 transition-colors"
        >
          <AlertCircle className="w-3 h-3" />
          <span>Failed. Tap to retry</span>
        </button>
      )}
    </div>
  );
};
