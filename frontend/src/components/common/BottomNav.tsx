import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { MessageSquare, Phone, CircleDot, UserPlus, Settings } from 'lucide-react';

export const BottomNav: React.FC = () => {
  const location = useLocation();

  // Only show bottom navigation on primary root tabs
  const isMainTab = ['/chats', '/calls', '/stories', '/search', '/settings'].includes(location.pathname);
  if (!isMainTab) {
    return null;
  }

  const items = [
    { path: '/chats', label: 'Chats', icon: MessageSquare },
    { path: '/calls', label: 'Calls', icon: Phone },
    { path: '/stories', label: 'Stories', icon: CircleDot },
    { path: '/search', label: 'Find User', icon: UserPlus },
    { path: '/settings', label: 'Settings', icon: Settings },
  ];

  return (
    <nav className="border-t border-chat-navBorder bg-chat-navBg/95 backdrop-blur-md px-4 py-1.5 flex justify-around items-center z-30 flex-shrink-0 select-none pb-[calc(0.4rem+env(safe-area-inset-bottom))] transition-colors duration-200">
      {items.map(({ path, label, icon: Icon }) => (
        <NavLink
          key={path}
          to={path}
          className={({ isActive }) =>
            `flex flex-col items-center gap-0.5 transition-all py-1.5 px-3.5 rounded-2xl pressable-icon ${
              isActive
                ? 'text-chat-navActiveText bg-chat-navActiveBg font-semibold scale-[1.02]'
                : 'text-chat-navInactive hover:text-chat-textPrimary'
            }`
          }
        >
          <Icon className="w-5 h-5 stroke-[2.2]" />
          <span className="text-[11px] tracking-tight">{label}</span>
        </NavLink>
      ))}
    </nav>
  );
};
