import React, { useState, useEffect } from 'react';
import { X, Shield, Clock, Loader2, Activity } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { IGroupActivityLog } from '../../types';
import { fetchAdminActivityLogsApi } from '../../api/groupApi';

interface GroupAdminActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
}

export const GroupAdminActivityModal: React.FC<GroupAdminActivityModalProps> = ({
  isOpen,
  onClose,
  groupId,
}) => {
  const [logs, setLogs] = useState<IGroupActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = async () => {
    if (!groupId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchAdminActivityLogsApi(groupId);
      if (res.success && res.activityLogs) {
        setLogs(res.activityLogs);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load activity logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadLogs();
    }
  }, [isOpen, groupId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg bg-chat-panel border border-chat-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-chat-border">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-brand-500/10 text-brand-500 rounded-lg">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-chat-textPrimary">Admin Activity Log</h3>
              <p className="text-xs text-chat-textMuted">Audit history of group administrative actions</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-chat-textMuted hover:text-chat-textPrimary hover:bg-chat-card transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-3 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-500 text-xs font-medium">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-chat-card border border-chat-border flex items-center justify-center text-chat-textMuted mb-3">
                <Shield className="w-7 h-7" />
              </div>
              <p className="text-sm font-semibold text-chat-textPrimary">No Activity Recorded</p>
              <p className="text-xs text-chat-textMuted mt-1 max-w-xs">
                Administrative changes such as role updates, invite link resets, and settings edits will be tracked here.
              </p>
            </div>
          ) : (
            logs.map((log, idx) => {
              const actor = log.actor;
              const actorName = actor?.displayName || actor?.username || 'Admin';
              const formattedTime = log.createdAt
                ? new Date(log.createdAt).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Recent';

              return (
                <div
                  key={idx}
                  className="flex items-start gap-3 p-3.5 bg-chat-card border border-chat-border rounded-xl transition-colors hover:border-brand-500/30"
                >
                  <Avatar
                    src={actor?.avatarUrl || ''}
                    name={actorName}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-chat-textPrimary leading-relaxed">
                      <span className="font-bold">{actorName}</span>{' '}
                      <span className="text-chat-textMuted">{log.action}</span>
                    </p>
                    {log.details && (
                      <p className="text-[11px] text-chat-textMuted mt-0.5">{log.details}</p>
                    )}
                    <div className="flex items-center gap-1 mt-1 text-[10px] text-chat-textMuted">
                      <Clock className="w-3 h-3 text-chat-textMuted" />
                      <span>{formattedTime}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

