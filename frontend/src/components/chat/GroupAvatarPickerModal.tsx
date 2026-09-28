import React, { useRef, useState } from 'react';
import { X, Image as ImageIcon, Sparkles, Trash2, Check, Loader2 } from 'lucide-react';
import { GROUP_AVATAR_PRESETS, compressImageFile } from '../../utils/groupAvatarPresets';
import { useTheme } from '../../context/ThemeContext';

interface GroupAvatarPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAvatarUrl?: string;
  onSelectAvatar: (avatarUrl: string) => void;
  title?: string;
}

export const GroupAvatarPickerModal: React.FC<GroupAvatarPickerModalProps> = ({
  isOpen,
  onClose,
  currentAvatarUrl,
  onSelectAvatar,
  title = 'Choose Group Icon',
}) => {
  const { themeConfig } = useTheme();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file');
      return;
    }

    try {
      setIsProcessing(true);
      setErrorMessage('');
      const compressedDataUrl = await compressImageFile(file, 256, 0.85);
      onSelectAvatar(compressedDataUrl);
      onClose();
    } catch (err: any) {
      console.error('Failed to compress avatar image:', err);
      setErrorMessage('Failed to process image. Please try another.');
    } finally {
      setIsProcessing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fadeIn">
      <div
        style={{ backgroundColor: themeConfig.panel }}
        className="border border-chat-border rounded-3xl w-full max-w-md max-h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-scaleUp"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-chat-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-brand-500/20 flex items-center justify-center text-brand-500 dark:text-brand-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-chat-textPrimary">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-chat-textMuted hover:text-chat-textPrimary hover:bg-chat-card transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 dark:text-red-400 text-xs font-medium">
              {errorMessage}
            </div>
          )}

          {/* Gallery / Camera Upload Action */}
          <div>
            <input
              type="file"
              ref={fileInputRef}
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              type="button"
              disabled={isProcessing}
              onClick={() => fileInputRef.current?.click()}
              className="w-full p-4 rounded-2xl bg-brand-500/10 hover:bg-brand-500/15 border border-brand-500/30 text-chat-textPrimary flex items-center justify-between transition-all active:scale-[0.98] group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-500/20 text-brand-500 dark:text-brand-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                  {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <ImageIcon className="w-5 h-5" />}
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold text-chat-textPrimary">Choose from Gallery / Camera</div>
                  <div className="text-xs text-chat-textMuted">Upload any custom photo from device</div>
                </div>
              </div>
              <span className="text-xs font-bold text-brand-500 dark:text-brand-400 bg-brand-500/10 px-3 py-1.5 rounded-xl border border-brand-500/20">
                Browse
              </span>
            </button>
          </div>

          {/* Preset Colorful Avatars Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-chat-textMuted">
                Or Select Preset Colorful Avatar
              </span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
              {GROUP_AVATAR_PRESETS.map((preset) => {
                const isSelected = currentAvatarUrl === preset.url;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => {
                      onSelectAvatar(preset.url);
                      onClose();
                    }}
                    className={`relative flex flex-col items-center gap-1.5 p-2 rounded-2xl transition-all active:scale-95 group ${
                      isSelected
                        ? 'bg-brand-500/15 border-2 border-brand-500 shadow-lg shadow-brand-500/20'
                        : 'bg-chat-card border border-chat-border hover:border-brand-400/60 hover:bg-chat-card/80'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-xl overflow-hidden shadow-md group-hover:scale-105 transition-transform flex items-center justify-center">
                      <img src={preset.url} alt={preset.name} className="w-full h-full object-cover" />
                    </div>
                    <span className="text-[11px] font-medium text-chat-textPrimary truncate w-full text-center">
                      {preset.name}
                    </span>
                    {isSelected && (
                      <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-brand-500 text-white flex items-center justify-center">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Remove / Reset to Default Initials */}
          {currentAvatarUrl && (
            <div className="pt-2 border-t border-chat-border">
              <button
                type="button"
                onClick={() => {
                  onSelectAvatar('');
                  onClose();
                }}
                className="w-full py-3 rounded-2xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-500 dark:text-red-400 text-xs font-bold flex items-center justify-center gap-2 transition-all active:scale-98"
              >
                <Trash2 className="w-4 h-4" />
                <span>Remove Avatar (Use Default Initials)</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
