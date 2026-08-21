import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { MessageSquare, UserPlus, Settings } from 'lucide-react';

export const BottomNav: React.FC = () => {
  const location = useLocation();

  // Hide bottom navigation inside individual conversation screen
  if (location.pathname.startsWith('/chat/')) {
    return null;
  }

  const items = [
    { path: '/chats', label: 'Chats', icon: MessageSquare },
    { path: '/search', label: 'Find User', icon: UserPlus },
    { path: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav className="border-t border-white/10 bg-chat-panel/95 backdrop-blur-md px-6 py-2 flex justify-around items-center z-30 flex-shrink-0 select-none pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
      {items.map(({ path, label, icon: Icon }) => (
        <NavLink
          key={path}
          to={path}
          className={({ isActive }) =>
            `flex flex-col items-center gap-1 transition-all py-1 px-4 rounded-xl pressable-icon ${
              isActive
                ? 'text-brand-400 font-semibold scale-105'
                : 'text-chat-textMuted hover:text-white'
            }`
          }
        >
          <Icon className="w-6 h-6 stroke-[2]" />
          <span className="text-xs">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
};
