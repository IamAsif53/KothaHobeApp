import React from 'react';

interface AvatarProps {
  src?: string;
  name: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  isOnline?: boolean;
  className?: string;
}

export const Avatar: React.FC<AvatarProps> = ({
  src,
  name,
  size = 'md',
  isOnline,
  className = '',
}) => {
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-11 h-11 text-sm',
    lg: 'w-14 h-14 text-base',
    xl: 'w-24 h-24 text-2xl',
  };

  const badgeSizes = {
    sm: 'w-2.5 h-2.5 right-0 bottom-0',
    md: 'w-3.5 h-3.5 right-0 bottom-0 border-2',
    lg: 'w-4 h-4 right-0.5 bottom-0.5 border-2',
    xl: 'w-6 h-6 right-1 bottom-1 border-3',
  };

  const getInitials = (str: string) => {
    if (!str) return '?';
    const parts = str.trim().split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return str.slice(0, 2).toUpperCase();
  };

  return (
    <div className={`relative inline-block flex-shrink-0 ${className}`}>
      {src ? (
        <img
          src={src}
          alt={name}
          className={`${sizeClasses[size]} rounded-full object-cover bg-chat-input border border-white/10`}
          onError={(e) => {
            // Hide broken image on error
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
      ) : (
        <div
          className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-brand-600 to-brand-800 text-white font-bold flex items-center justify-center border border-white/10 shadow-sm`}
        >
          {getInitials(name)}
        </div>
      )}

      {isOnline !== undefined && (
        <span
          className={`absolute rounded-full ${badgeSizes[size]} ${
            isOnline ? 'bg-brand-400 border-chat-bg' : 'bg-gray-500 border-chat-bg'
          }`}
          title={isOnline ? 'Online' : 'Offline'}
        />
      )}
    </div>
  );
};
