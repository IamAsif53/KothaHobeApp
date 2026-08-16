import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { MessageSquare } from 'lucide-react';

export const SplashPage: React.FC = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => {
        if (user) {
          if (!user.username || !user.displayName || user.displayName.startsWith('User ')) {
            navigate('/profile-setup', { replace: true });
          } else {
            navigate('/chats', { replace: true });
          }
        } else {
          navigate('/login', { replace: true });
        }
      }, 1000);

      return () => clearTimeout(timer);
    }
  }, [user, loading, navigate]);

  return (
    <div className="h-full w-full bg-chat-bg flex flex-col items-center justify-between p-8 text-center select-none">
      <div className="flex-1 flex flex-col items-center justify-center">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center shadow-2xl shadow-brand-500/20 mb-6 animate-pulse">
          <MessageSquare className="w-12 h-12 text-white stroke-[2]" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Kotha Hobe</h1>
        <p className="text-sm text-chat-textMuted max-w-xs">
          Fast, private real-time messaging with the people who matter.
        </p>
      </div>

      <div className="pb-6 flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-chat-textMuted font-medium uppercase tracking-widest">
          Secured & Encrypted
        </span>
      </div>
    </div>
  );
};
