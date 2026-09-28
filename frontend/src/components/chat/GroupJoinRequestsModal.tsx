import React, { useState } from 'react';
import { X, Check, UserX, Clock, UserCheck } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { acceptJoinRequestApi, declineJoinRequestApi } from '../../api/groupApi';
import { IGroupJoinRequest } from '../../types';

interface GroupJoinRequestsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  joinRequests: IGroupJoinRequest[];
  onRequestHandled: (targetUserId: string, accepted: boolean) => void;
}

export const GroupJoinRequestsModal: React.FC<GroupJoinRequestsModalProps> = ({
  isOpen,
  onClose,
  groupId,
  joinRequests,
  onRequestHandled,
}) => {
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleAccept = async (userId: string) => {
    setProcessingId(userId);
    setError(null);
    try {
      const res = await acceptJoinRequestApi(groupId, userId);
      if (res.success) {
        onRequestHandled(userId, true);
      } else {
        setError(res.message || 'Failed to accept request');
      }
    } catch (err: any) {
      setError(err?.message || 'Error accepting request');
    } finally {
      setProcessingId(null);
    }
  };

  const handleDecline = async (userId: string) => {
    setProcessingId(userId);
    setError(null);
    try {
      const res = await declineJoinRequestApi(groupId, userId);
      if (res.success) {
        onRequestHandled(userId, false);
      } else {
        setError(res.message || 'Failed to decline request');
      }
    } catch (err: any) {
      setError(err?.message || 'Error declining request');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md bg-chat-panel border border-chat-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-chat-border">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-chat-textPrimary">Join Requests</h3>
            {joinRequests.length > 0 && (
              <span className="px-2 py-0.5 text-xs font-semibold bg-brand-500/20 text-brand-500 rounded-full">
                {joinRequests.length}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-chat-textMuted hover:text-chat-textPrimary hover:bg-chat-card transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-500 text-xs font-medium">
              {error}
            </div>
          )}

          {joinRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-chat-card border border-chat-border flex items-center justify-center text-chat-textMuted mb-3">
                <UserCheck className="w-7 h-7" />
              </div>
              <p className="text-sm font-semibold text-chat-textPrimary">No Pending Requests</p>
              <p className="text-xs text-chat-textMuted mt-1 max-w-xs">
                When people use the invite link to request access, they will show up here for your approval.
              </p>
            </div>
          ) : (
            joinRequests.map((req) => {
              const u = req.user;
              const isProcessing = processingId === u._id;
              const formattedTime = req.requestedAt
                ? new Date(req.requestedAt).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Just now';

              return (
                <div
                  key={u._id}
                  className="flex items-center justify-between p-3.5 bg-chat-card border border-chat-border rounded-xl gap-3 transition-colors hover:border-brand-500/30"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                      src={u.avatarUrl || ''}
                      name={u.displayName || u.username || 'User'}
                      size="md"
                    />
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-chat-textPrimary truncate">
                        {u.displayName || u.username}
                      </h4>
                      <p className="text-xs text-chat-textMuted truncate">@{u.username}</p>
                      <div className="flex items-center gap-1 mt-0.5 text-[11px] text-chat-textMuted">
                        <Clock className="w-3 h-3 text-chat-textMuted" />
                        <span>{formattedTime}</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleAccept(u._id)}
                      disabled={isProcessing}
                      className="flex items-center justify-center p-2 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white rounded-lg transition-all shadow-sm disabled:opacity-50"
                      title="Accept request"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDecline(u._id)}
                      disabled={isProcessing}
                      className="flex items-center justify-center p-2 bg-red-500/10 hover:bg-red-500/20 active:scale-95 text-red-500 border border-red-500/30 rounded-lg transition-all disabled:opacity-50"
                      title="Decline request"
                    >
                      <UserX className="w-4 h-4" />
                    </button>
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
