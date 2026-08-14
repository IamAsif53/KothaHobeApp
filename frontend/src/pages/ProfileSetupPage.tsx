import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Avatar } from '../components/common/Avatar';
import { formatPhoneDisplay } from '../utils/phoneFormatter';
import { Camera, CheckCircle2, User as UserIcon } from 'lucide-react';

export const ProfileSetupPage: React.FC = () => {
  const { user, updateProfile } = useAuth();
  const [displayName, setDisplayName] = useState(user?.displayName && !user.displayName.startsWith('User ') ? user.displayName : '');
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const navigate = useNavigate();

  // Avatar presets for quick selection
  const avatarPresets = [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!displayName.trim()) {
      setError('Please enter your display name.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    const success = await updateProfile(displayName.trim(), avatarUrl);
    setIsSubmitting(false);

    if (success) {
      navigate('/chats', { replace: true });
    } else {
      setError('Failed to update profile. Please try again.');
    }
  };

  return (
    <div className="h-full w-full bg-chat-bg flex flex-col justify-between p-6 max-w-md mx-auto">
      <div className="pt-6">
        <h1 className="text-2xl font-bold text-white text-center mb-2">Create Profile</h1>
        <p className="text-chat-textMuted text-sm text-center mb-8">
          Choose a name and profile photo so friends can identify you.
        </p>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Avatar selector */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative group">
              <Avatar
                src={avatarUrl}
                name={displayName || 'User'}
                size="xl"
              />
              <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-brand-500 text-white flex items-center justify-center border-2 border-chat-bg shadow-md">
                <Camera className="w-4 h-4" />
              </div>
            </div>

            <div className="flex gap-2 mt-2">
              {avatarPresets.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setAvatarUrl(preset)}
                  className={`w-10 h-10 rounded-full overflow-hidden border-2 transition-all ${
                    avatarUrl === preset ? 'border-brand-400 scale-110' : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                >
                  <img src={preset} alt="avatar option" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-chat-textMuted mb-2">
              Your Name
            </label>
            <div className="relative">
              <input
                type="text"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  setError('');
                }}
                placeholder="John Doe"
                autoFocus
                className="w-full bg-chat-card border border-white/10 text-white placeholder:text-chat-textMuted/50 rounded-xl px-4 py-3.5 pl-11 text-base font-medium focus:outline-none focus:border-brand-500 transition-colors"
              />
              <UserIcon className="w-5 h-5 text-chat-textMuted absolute left-3.5 top-3.5" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-chat-textMuted mb-2">
              Verified Identity
            </label>
            <div className="bg-chat-card/50 border border-white/5 rounded-xl px-4 py-3 flex items-center justify-between">
              <span className="text-white font-mono font-medium">
                {formatPhoneDisplay(user?.phoneNumber || '')}
              </span>
              <span className="flex items-center gap-1 text-xs text-brand-400 font-medium">
                <CheckCircle2 className="w-4 h-4" />
                <span>Verified</span>
              </span>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting || !displayName.trim()}
            className="w-full bg-brand-500 hover:bg-brand-600 active:scale-[0.99] text-white font-semibold py-3.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-brand-500/20"
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <span>Save & Continue</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
