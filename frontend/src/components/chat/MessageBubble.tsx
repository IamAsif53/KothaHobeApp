import React from 'react';
import { IMessage } from '../../types';
import { formatMessageTime } from '../../utils/dateUtils';
import { Clock, Check, CheckCheck, AlertCircle } from 'lucide-react';

interface MessageBubbleProps {
  message: IMessage;
  isMe: boolean;
  onRetry?: (message: IMessage) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, isMe, onRetry }) => {
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

  return (
    <div className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} my-1 px-3 group`}>
      <div
        className={`relative max-w-[82%] sm:max-w-[70%] px-3.5 py-2 rounded-2xl shadow-sm break-words text-[14.5px] leading-relaxed transition-all ${
          isMe
            ? 'bg-chat-bubbleOut text-white rounded-tr-none'
            : 'bg-chat-bubbleIn text-chat-textPrimary rounded-tl-none border border-white/5'
        }`}
      >
        <p className="whitespace-pre-wrap pr-10">{message.text}</p>

        <div className="absolute right-2.5 bottom-1 flex items-center gap-1 select-none">
          <span className="text-[10px] text-white/60 font-medium tracking-tight">
            {formatMessageTime(message.createdAt)}
          </span>
          {renderStatusIcon()}
        </div>
      </div>

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
