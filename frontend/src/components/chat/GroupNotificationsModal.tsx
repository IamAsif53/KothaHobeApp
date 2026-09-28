import React, { useState } from 'react';
import { X, Bell, BellOff, AtSign, Check, Loader2 } from 'lucide-react';
import { updateGroupNotificationsApi } from '../../api/groupApi';

interface GroupNotificationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  currentPreference?: 'all' | 'mentions' | 'muted';
  onPreferenceUpdated: (preference: 'all' | 'mentions' | 'muted') => void;
}

export const GroupNotificationsModal: React.FC<GroupNotificationsModalProps> = ({
  isOpen,
  onClose,
  groupId,
  currentPreference = 'all',
  onPreferenceUpdated,
}) => {
  const [selectedPref, setSelectedPref] = useState<'all' | 'mentions' | 'muted'>(currentPreference);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const options: { value: 'all' | 'mentions' | 'muted'; label: string; desc: string; icon: any }[] = [
    {
      value: 'all',
      label: 'All Messages',
      desc: 'Receive alerts for every message sent in this group',
      icon: Bell,
    },
    {
      value: 'mentions',
      label: 'Only @Mentions & Replies',
      desc: 'Only get notified when someone mentions you directly',
      icon: AtSign,
    },
    {
      value: 'muted',
      label: 'Mute Notifications',
      desc: 'No sound or push notifications from this group',
      icon: BellOff,
    },
  ];

  const handleSave = async (pref: 'all' | 'mentions' | 'muted') => {
    setSelectedPref(pref);
    setSaving(true);
    setError(null);
    try {
      const res = await updateGroupNotificationsApi(groupId, pref);
      if (res.success) {
        onPreferenceUpdated(pref);
        onClose();
      } else {
        setError(res.message || 'Failed to update notifications');
      }
    } catch (err: any) {
      setError(err?.message || 'Error updating notifications');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md bg-chat-panel border border-chat-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-chat-border">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-brand-500/10 text-brand-500 rounded-lg">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-chat-textPrimary">Notifications</h3>
              <p className="text-xs text-chat-textMuted">Choose when to get notified</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-chat-textMuted hover:text-chat-textPrimary hover:bg-chat-card transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Options */}
        <div className="p-5 space-y-2.5">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-500 text-xs font-medium mb-2">
              {error}
            </div>
          )}

          {options.map((opt) => {
            const Icon = opt.icon;
            const isSelected = selectedPref === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => handleSave(opt.value)}
                disabled={saving}
                className={`w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all ${
                  isSelected
                    ? 'border-brand-500 bg-brand-500/10 text-chat-textPrimary'
                    : 'border-chat-border bg-chat-card hover:border-brand-500/30 text-chat-textPrimary'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-chat-panel text-brand-500 mt-0.5 shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold">{opt.label}</h4>
                    <p className="text-xs text-chat-textMuted mt-0.5">{opt.desc}</p>
                  </div>
                </div>
                {saving && selectedPref === opt.value ? (
                  <Loader2 className="w-5 h-5 animate-spin text-brand-500 shrink-0" />
                ) : isSelected ? (
                  <div className="w-5 h-5 rounded-full bg-brand-500 text-white flex items-center justify-center shrink-0">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
