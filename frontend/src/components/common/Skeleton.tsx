import React from 'react';

export const ConversationSkeleton: React.FC = () => {
  return (
    <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5 animate-pulse">
      <div className="w-12 h-12 rounded-full bg-white/10 flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex justify-between items-center">
          <div className="h-4 bg-white/10 rounded w-1/3" />
          <div className="h-3 bg-white/10 rounded w-12" />
        </div>
        <div className="h-3 bg-white/10 rounded w-2/3" />
      </div>
    </div>
  );
};

export const MessageSkeleton: React.FC<{ isMe?: boolean }> = ({ isMe }) => {
  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} my-1.5 px-4 animate-pulse`}>
      <div
        className={`h-10 rounded-2xl ${
          isMe ? 'w-48 bg-brand-900/40 rounded-tr-none' : 'w-56 bg-white/10 rounded-tl-none'
        }`}
      />
    </div>
  );
};
