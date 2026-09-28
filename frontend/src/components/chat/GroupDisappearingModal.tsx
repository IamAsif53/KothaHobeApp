import React, { useState } from 'react';
import { X, Clock, Check, Loader2 } from 'lucide-react';
import { updateDisappearingMessagesApi } from '../../api/groupApi';

interface GroupDisappearingModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  currentDuration?: number;
  onDurationUpdated: (duration: number) => void;
}

export const GroupDisappearingModal: React.FC<GroupDisappearingModalProps> = ({
  isOpen,
  onClose,
  groupId,
  currentDuration = 0,
  onDurationUpdated,
}) => {
  const [selectedDuration, setSelectedDuration] = useState<number>(currentDuration);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const options = [
    { value: 0, label: 'Off', desc: 'Messages stay in the chat permanently' },
    { value: 86400, label: '24 Hours', desc: 'Messages disappear 24 hours after being sent' },
    { value: 604800, label: '7 Days', desc: 'Messages disappear 7 days after being sent' },
    { value: 2592000, label: '30 Days', desc: 'Messages disappear 30 days after being sent' },
  ];

  const handleSave = async (duration: number) => {
    setSelectedDuration(duration);
    setSaving(true);
    setError(null);
    try {
      const res = await updateDisappearingMessagesApi(groupId, duration);
      if (res.success) {
        onDurationUpdated(duration);
        onClose();
      } else {
        setError(res.message || 'Failed to update timer');
      }
    } catch (err: any) {
      setError(err?.message || 'Error updating disappearing messages');
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
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-chat-textPrimary">Disappearing Messages</h3>
              <p className="text-xs text-chat-textMuted">Automatically remove messages after a set time</p>
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
            const isSelected = selectedDuration === opt.value;
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
                <div>
                  <h4 className="text-sm font-semibold">{opt.label}</h4>
                  <p className="text-xs text-chat-textMuted mt-0.5">{opt.desc}</p>
                </div>
                {saving && selectedDuration === opt.value ? (
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
