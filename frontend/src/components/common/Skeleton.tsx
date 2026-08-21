import React from 'react';

export const ShimmerBox: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`relative overflow-hidden bg-white/[0.07] ${className}`}>
    <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
  </div>
);

export const ConversationSkeleton: React.FC = () => {
  return (
    <div className="flex items-center gap-3.5 px-4 py-3.5 border-b border-white/5">
      <ShimmerBox className="w-12 h-12 rounded-full flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex justify-between items-center">
          <ShimmerBox className="h-4 rounded-md w-1/3" />
          <ShimmerBox className="h-3 rounded-md w-12" />
        </div>
        <ShimmerBox className="h-3 rounded-md w-2/3" />
      </div>
    </div>
  );
};

export const MessageSkeleton: React.FC<{ isMe?: boolean }> = ({ isMe }) => {
  return (
    <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} my-1.5 px-4`}>
      <div
        className={`h-11 rounded-2xl overflow-hidden relative ${
          isMe
            ? 'w-48 bg-brand-900/40 rounded-tr-none'
            : 'w-56 bg-[#202c33] rounded-tl-none border border-white/5'
        }`}
      >
        <div className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" />
      </div>
    </div>
  );
};

export const UserSearchSkeleton: React.FC = () => {
  return (
    <div className="flex items-center gap-3.5 px-4 py-3 border-b border-white/5">
      <ShimmerBox className="w-11 h-11 rounded-full flex-shrink-0" />
      <div className="flex-1 min-w-0 space-y-2">
        <ShimmerBox className="h-4 rounded-md w-2/5" />
        <ShimmerBox className="h-3 rounded-md w-1/4" />
      </div>
    </div>
  );
};
