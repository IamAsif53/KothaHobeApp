import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AppLogo } from '../components/common/AppLogo';

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
      }, 350);

      return () => clearTimeout(timer);
    }
  }, [user, loading, navigate]);

  return (
    <div className="h-full w-full bg-chat-bg flex flex-col items-center justify-between p-8 pt-20 text-center select-none animate-fade-in">
      <div className="flex-1 flex flex-col items-center justify-center">
        <AppLogo size="xl" showSubtitle={true} />
        <p className="text-xs text-chat-textMuted max-w-xs mt-4">
          Fast, private real-time messaging with the people who matter.
        </p>
      </div>

      <div className="pb-8 flex flex-col items-center gap-3">
        <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-[11px] text-chat-textMuted font-medium uppercase tracking-widest">
          Secured & Encrypted
        </span>
      </div>
    </div>
  );
};
