import React, { useState } from 'react';
import { X, AlignLeft, ShieldCheck, Loader2 } from 'lucide-react';
import { updateGroupDescriptionApi } from '../../api/groupApi';
import { useTheme } from '../../context/ThemeContext';
import { IGroupDescription } from '../../types';

interface GroupDescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  currentDescription?: IGroupDescription | null;
  currentRules?: string[];
  canEdit: boolean;
  onUpdated: (newDesc: IGroupDescription | null, rules: string[]) => void;
}

export const GroupDescriptionModal: React.FC<GroupDescriptionModalProps> = ({
  isOpen,
  onClose,
  groupId,
  currentDescription,
  currentRules = [],
  canEdit,
  onUpdated,
}) => {
  const { themeConfig } = useTheme();
  const [description, setDescription] = useState(currentDescription?.text || '');
  const [rulesText, setRulesText] = useState((currentRules || []).join('\n'));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setError('');

    const parsedRules = rulesText
      .split('\n')
      .map((r) => r.trim())
      .filter(Boolean);

    try {
      const res = await updateGroupDescriptionApi(groupId, description.trim(), parsedRules);
      if (res.success) {
        onUpdated(res.description || null, res.rules || []);
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to update description');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in select-none">
      <div
        style={{ backgroundColor: themeConfig.panel }}
        className="w-full max-w-md border border-chat-border rounded-3xl p-5 shadow-2xl flex flex-col gap-4 animate-slide-up"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-chat-border pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-brand-500/15 text-brand-500 flex items-center justify-center">
              <AlignLeft className="w-4 h-4" />
            </div>
            <h3 className="text-base font-bold text-chat-textPrimary">Group Description & Rules</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full text-chat-textMuted hover:text-chat-textPrimary hover:bg-chat-card transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-chat-textPrimary mb-1.5 uppercase tracking-wider">
              About this Group
            </label>
            {canEdit ? (
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What is this group about? (e.g. Project discussions, team updates...)"
                rows={3}
                maxLength={1000}
                className="w-full p-3 rounded-2xl bg-chat-input border border-chat-border text-chat-textPrimary placeholder:text-chat-textMuted text-xs focus:outline-none focus:border-brand-500 resize-none transition-colors"
              />
            ) : (
              <div className="p-3 rounded-2xl bg-chat-input/50 border border-chat-border text-chat-textPrimary text-xs leading-relaxed min-h-[60px]">
                {description || 'No description provided.'}
              </div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-chat-textPrimary uppercase tracking-wider">
                Group Rules (One per line)
              </label>
              {canEdit && (
                <span className="text-[10px] text-chat-textMuted font-mono">Optional</span>
              )}
            </div>
            {canEdit ? (
              <textarea
                value={rulesText}
                onChange={(e) => setRulesText(e.target.value)}
                placeholder="1. Keep discussions relevant&#10;2. No spam or promotions&#10;3. Be respectful to all members"
                rows={3}
                className="w-full p-3 rounded-2xl bg-chat-input border border-chat-border text-chat-textPrimary placeholder:text-chat-textMuted text-xs focus:outline-none focus:border-brand-500 resize-none transition-colors font-mono"
              />
            ) : (
              <div className="p-3 rounded-2xl bg-chat-input/50 border border-chat-border text-chat-textPrimary text-xs space-y-1">
                {rulesText ? (
                  rulesText.split('\n').filter(Boolean).map((r, idx) => (
                    <div key={idx} className="flex items-start gap-1.5 text-xs text-chat-textPrimary">
                      <span className="text-brand-500 font-bold">{idx + 1}.</span>
                      <span>{r.replace(/^\d+\.\s*/, '')}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-chat-textMuted text-xs italic">No rules specified.</p>
                )}
              </div>
            )}
          </div>

          {error && (
            <p className="text-xs text-red-500 font-medium">{error}</p>
          )}

          {canEdit && (
            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-chat-card hover:bg-chat-input border border-chat-border text-chat-textMuted font-semibold text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="flex-1 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs shadow-md shadow-brand-500/20 flex items-center justify-center gap-1.5 transition-all active:scale-95 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                <span>Save Changes</span>
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};
