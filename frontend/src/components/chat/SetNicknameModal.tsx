import React, { useState } from 'react';
import { X, Tag, Loader2, Check } from 'lucide-react';
import { setGroupNicknameApi } from '../../api/groupApi';
import { IUser } from '../../types';
import { Avatar } from '../common/Avatar';

interface SetNicknameModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  targetUser: IUser;
  currentNickname?: string;
  onNicknameUpdated?: (targetUserId: string, nickname: string | null) => void;
}

export const SetNicknameModal: React.FC<SetNicknameModalProps> = ({
  isOpen,
  onClose,
  groupId,
  targetUser,
  currentNickname = '',
  onNicknameUpdated,
}) => {
  const [nickname, setNickname] = useState(currentNickname);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const cleanNick = nickname.trim();
      const res = await setGroupNicknameApi(groupId, targetUser._id, cleanNick);
      if (res.success) {
        if (onNicknameUpdated) {
          onNicknameUpdated(targetUser._id, cleanNick || null);
        }
        onClose();
      } else {
        setErrorMessage(res.message || 'Failed to update nickname');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to update nickname');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClear = async () => {
    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const res = await setGroupNicknameApi(groupId, targetUser._id, '');
      if (res.success) {
        if (onNicknameUpdated) {
          onNicknameUpdated(targetUser._id, null);
        }
        onClose();
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to clear nickname');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-sm p-6 shadow-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-emerald-400" />
            <h3 className="text-base font-bold text-white">Set Group Nickname</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* User Info Header */}
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-slate-800/60 border border-slate-700/50">
          <Avatar
            src={targetUser.avatarUrl}
            name={targetUser.displayName || targetUser.username || 'User'}
            size="md"
          />
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-white truncate">{targetUser.displayName}</h4>
            <p className="text-xs text-slate-400 truncate">@{targetUser.username}</p>
          </div>
        </div>

        {errorMessage && (
          <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium">
            {errorMessage}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSave} className="flex flex-col gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">
              Custom Nickname in this Group
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="e.g. Captain, Boss, Pro..."
              maxLength={50}
              className="w-full px-4 py-3 rounded-2xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Nicknames are only visible to members of this group.
            </p>
          </div>

          <div className="flex items-center gap-2 mt-2">
            {currentNickname && (
              <button
                type="button"
                onClick={handleClear}
                disabled={isSubmitting}
                className="py-3 px-4 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs border border-slate-700 transition-colors active:scale-95 disabled:opacity-50"
              >
                Clear
              </button>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-3 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>Save Nickname</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
