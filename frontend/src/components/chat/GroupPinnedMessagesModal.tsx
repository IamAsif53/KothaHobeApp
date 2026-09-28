import React, { useState, useEffect } from 'react';
import { X, Pin, PinOff, MessageSquare, Loader2, ArrowUpRight, Image as ImageIcon, FileText, Mic } from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { IMessage } from '../../types';
import { fetchPinnedMessagesApi, unpinMessageApi } from '../../api/groupApi';

interface GroupPinnedMessagesModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  canManagePins: boolean;
  onJumpToMessage: (messageId: string) => void;
}

export const GroupPinnedMessagesModal: React.FC<GroupPinnedMessagesModalProps> = ({
  isOpen,
  onClose,
  groupId,
  canManagePins,
  onJumpToMessage,
}) => {
  const [pinnedMessages, setPinnedMessages] = useState<IMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [unpinningId, setUnpinningId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPinned = async () => {
    if (!groupId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchPinnedMessagesApi(groupId);
      if (res.success && res.pinnedMessages) {
        setPinnedMessages(res.pinnedMessages);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load pinned messages');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadPinned();
    }
  }, [isOpen, groupId]);

  if (!isOpen) return null;

  const handleUnpin = async (msgId: string) => {
    setUnpinningId(msgId);
    try {
      const res = await unpinMessageApi(groupId, msgId);
      if (res.success) {
        setPinnedMessages((prev) => prev.filter((m) => m._id !== msgId));
      } else {
        setError(res.message || 'Failed to unpin message');
      }
    } catch (err: any) {
      setError(err?.message || 'Error unpinning message');
    } finally {
      setUnpinningId(null);
    }
  };

  const renderMessageSnippet = (msg: IMessage) => {
    if (msg.type === 'image') {
      return (
        <div className="flex items-center gap-1.5 text-xs text-chat-textMuted">
          <ImageIcon className="w-3.5 h-3.5 text-brand-500" />
          <span>{msg.attachment?.fileName || msg.text || 'Photo'}</span>
        </div>
      );
    }
    if (msg.type === 'document') {
      return (
        <div className="flex items-center gap-1.5 text-xs text-chat-textMuted">
          <FileText className="w-3.5 h-3.5 text-brand-500" />
          <span>{msg.attachment?.fileName || msg.text || 'Document'}</span>
        </div>
      );
    }
    if (msg.type === 'audio') {
      return (
        <div className="flex items-center gap-1.5 text-xs text-chat-textMuted">
          <Mic className="w-3.5 h-3.5 text-brand-500" />
          <span>Voice message</span>
        </div>
      );
    }
    return <p className="text-sm text-chat-textPrimary line-clamp-3 select-text">{msg.text || 'Pinned message'}</p>;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg bg-chat-panel border border-chat-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-chat-border">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-brand-500/10 text-brand-500 rounded-lg">
              <Pin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-chat-textPrimary">Pinned Messages</h3>
              <p className="text-xs text-chat-textMuted">
                {pinnedMessages.length} {pinnedMessages.length === 1 ? 'message' : 'messages'} pinned in this group
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-chat-textMuted hover:text-chat-textPrimary hover:bg-chat-card transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* List Content */}
        <div className="p-4 space-y-3 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-500 text-xs font-medium">
              {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
            </div>
          ) : pinnedMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-chat-card border border-chat-border flex items-center justify-center text-chat-textMuted mb-3">
                <Pin className="w-7 h-7" />
              </div>
              <p className="text-sm font-semibold text-chat-textPrimary">No Pinned Messages</p>
              <p className="text-xs text-chat-textMuted mt-1 max-w-xs">
                Keep important announcements, rules, or links readily accessible by pinning them in the chat.
              </p>
            </div>
          ) : (
            pinnedMessages.map((msg) => {
              const senderName = msg.senderNickname || 'Member';
              const formattedTime = msg.createdAt
                ? new Date(msg.createdAt).toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })
                : 'Pinned';

              return (
                <div
                  key={msg._id}
                  className="p-4 bg-chat-card border border-chat-border rounded-xl space-y-3 transition-colors hover:border-brand-500/30"
                >
                  {/* Sender Row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar
                        src=""
                        name={senderName}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <span className="text-xs font-bold text-chat-textPrimary block truncate">
                          {senderName}
                        </span>
                        <span className="text-[11px] text-chat-textMuted block">{formattedTime}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {canManagePins && (
                        <button
                          onClick={() => handleUnpin(msg._id)}
                          disabled={unpinningId === msg._id}
                          className="p-1.5 text-chat-textMuted hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                          title="Unpin message"
                        >
                          {unpinningId === msg._id ? (
                            <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                          ) : (
                            <PinOff className="w-4 h-4" />
                          )}
                        </button>
                      )}
                      <button
                        onClick={() => {
                          onClose();
                          onJumpToMessage(msg._id);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 bg-brand-500/10 hover:bg-brand-500/20 text-brand-500 text-xs font-semibold rounded-lg transition-colors"
                      >
                        <span>Jump</span>
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Body Snippet */}
                  <div className="pl-9">{renderMessageSnippet(msg)}</div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
