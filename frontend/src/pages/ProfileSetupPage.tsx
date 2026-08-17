import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Avatar } from '../components/common/Avatar';
import { Camera, CheckCircle2, User as UserIcon, AtSign, Image as ImageIcon, Upload } from 'lucide-react';

export const ProfileSetupPage: React.FC = () => {
  const { user, updateProfile } = useAuth();
  const [username, setUsername] = useState(user?.username || '');
  const [displayName, setDisplayName] = useState(
    user?.displayName && !user.displayName.startsWith('User ') ? user.displayName : ''
  );
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  // Avatar presets for quick selection
  const avatarPresets = [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
  ];

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/[^a-zA-Z0-9_]/g, '');
    setUsername(val);
    setError('');
  };

  // Device gallery / camera image upload with canvas compression (<50KB)
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxSize = 256;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
          setAvatarUrl(compressedDataUrl);
          setError('');
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = username.trim();
    const cleanName = displayName.trim();

    if (!cleanUser || cleanUser.length < 3) {
      setError('Username must be at least 3 characters long.');
      return;
    }

    if (!cleanName) {
      setError('Please enter your display name.');
      return;
    }

    setIsSubmitting(true);
    setError('');

    const res = await updateProfile(cleanUser, cleanName, avatarUrl);
    setIsSubmitting(false);

    if (res.success) {
      navigate('/chats', { replace: true });
    } else {
      setError(res.error || 'Failed to update profile. Please try again.');
    }
  };

  return (
    <div className="h-full w-full bg-chat-bg flex flex-col justify-between p-6 pt-10 max-w-md mx-auto overflow-y-auto">
      <div className="pt-2">
        <h1 className="text-2xl font-bold text-white text-center mb-1">Set Up Profile</h1>
        <p className="text-chat-textMuted text-xs text-center mb-6">
          Upload your photo and choose a unique username.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Hidden File Input for Device Image Selection */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/*"
            className="hidden"
          />

          {/* Avatar selector with Device Photo Upload */}
          <div className="flex flex-col items-center gap-2">
            <div
              onClick={() => fileInputRef.current?.click()}
              className="relative cursor-pointer group"
              title="Tap to choose photo from gallery or camera"
            >
              <Avatar
                src={avatarUrl}
                name={displayName || username || 'User'}
                size="xl"
              />
              <div className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-brand-500 hover:bg-brand-400 active:scale-95 text-white flex items-center justify-center border-2 border-chat-bg shadow-md transition-all">
                <Camera className="w-4 h-4" />
              </div>
            </div>

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 font-semibold mt-1 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-full transition-colors"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Choose from Gallery</span>
            </button>

            {/* Quick avatar presets */}
            <div className="flex gap-2 mt-1">
              {avatarPresets.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setAvatarUrl(preset)}
                  className={`w-9 h-9 rounded-full overflow-hidden border-2 transition-all ${
                    avatarUrl === preset ? 'border-brand-400 scale-110' : 'border-transparent opacity-70 hover:opacity-100'
                  }`}
                >
                  <img src={preset} alt="avatar" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          </div>

          {/* Username Input */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-chat-textMuted mb-1.5">
              Unique Username
            </label>
            <div className="relative">
              <input
                type="text"
                value={username}
                onChange={handleUsernameChange}
                placeholder="asif_53"
                autoFocus
                maxLength={30}
                className="w-full bg-chat-card border border-white/10 text-white placeholder:text-chat-textMuted/50 rounded-xl px-4 py-3 pl-10 text-sm font-medium focus:outline-none focus:border-brand-500 transition-colors"
              />
              <AtSign className="w-4 h-4 text-chat-textMuted absolute left-3.5 top-3.5" />
            </div>
            <span className="text-[11px] text-chat-textMuted/70 mt-1 block">
              Friends can search and find you with @{username || 'username'}
            </span>
          </div>

          {/* Display Name Input */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-chat-textMuted mb-1.5">
              Display Name
            </label>
            <div className="relative">
              <input
                type="text"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  setError('');
                }}
                placeholder="Jiaul Asif"
                maxLength={50}
                className="w-full bg-chat-card border border-white/10 text-white placeholder:text-chat-textMuted/50 rounded-xl px-4 py-3 pl-10 text-sm font-medium focus:outline-none focus:border-brand-500 transition-colors"
              />
              <UserIcon className="w-4 h-4 text-chat-textMuted absolute left-3.5 top-3.5" />
            </div>
          </div>

          {/* Verified Email Display */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-chat-textMuted mb-1.5">
              Verified Email
            </label>
            <div className="bg-chat-card/50 border border-white/5 rounded-xl px-4 py-2.5 flex items-center justify-between">
              <span className="text-white text-xs font-mono truncate mr-2">
                {user?.email || ''}
              </span>
              <span className="flex items-center gap-1 text-[11px] text-brand-400 font-medium flex-shrink-0">
                <CheckCircle2 className="w-3.5 h-3.5" />
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
            disabled={isSubmitting || !username.trim() || !displayName.trim()}
            className="w-full bg-brand-500 hover:bg-brand-600 active:scale-[0.99] text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-brand-500/20 mt-2"
          >
            {isSubmitting ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <span>Save Profile</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
