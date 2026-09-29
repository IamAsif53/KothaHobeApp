import React, { useState, useEffect } from 'react';
import { IConversation, IMessage } from '../../types';
import { fetchConversations } from '../../api/conversationApi';
import { forwardMessageApi } from '../../api/messageApi';
import { Avatar } from '../common/Avatar';
import {
  Search,
  X,
  Send,
  Users,
  Check,
  Forward,
  Loader2,
} from 'lucide-react';

interface ForwardMessageModalProps {
  message: IMessage;
  isOpen?: boolean;
  onClose: () => void;
  onForwarded?: (count: number) => void;
  onForwardSuccess?: () => void;
}

export const ForwardMessageModal: React.FC<ForwardMessageModalProps> = ({
  message,
  isOpen = true,
  onClose,
  onForwarded,
  onForwardSuccess,
}) => {
  const [conversations, setConversations] = useState<IConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedConvIds, setSelectedConvIds] = useState<string[]>([]);
  const [isForwarding, setIsForwarding] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSelectedConvIds([]);
      setSearchQuery('');
      setErrorMsg(null);
      return;
    }

    const loadConvs = async () => {
      setLoading(true);
      try {
        const res = await fetchConversations();
        if (res.success && res.conversations) {
          // Filter out conversations where user is declined in group
          const valid = res.conversations.filter((c) => !c.isGroup || c.myMembershipStatus !== 'declined');
          setConversations(valid);
        }
      } catch {
        setErrorMsg('Failed to load conversations');
      } finally {
        setLoading(false);
      }
    };

    loadConvs();
  }, [isOpen]);

  if (!isOpen) return null;

  const toggleSelect = (convId: string) => {
    setSelectedConvIds((prev) =>
      prev.includes(convId) ? prev.filter((id) => id !== convId) : [...prev, convId]
    );
  };

  const handleForward = async () => {
    if (selectedConvIds.length === 0 || isForwarding) return;

    setIsForwarding(true);
    setErrorMsg(null);

    try {
      const res = await forwardMessageApi(message._id, selectedConvIds);
      if (res.success) {
        onForwarded && onForwarded(selectedConvIds.length);
        onForwardSuccess && onForwardSuccess();
        onClose();
      } else {
        setErrorMsg(res.message || 'Failed to forward message');
      }
    } catch {
      setErrorMsg('Network error forwarding message');
    } finally {
      setIsForwarding(false);
    }
  };

  const filteredConversations = conversations.filter((c) => {
    const title = c.isGroup
      ? c.groupMeta?.name || 'Group Chat'
      : c.recipient?.displayName || c.recipient?.username || 'User';
    return title.toLowerCase().includes(searchQuery.toLowerCase());
  });

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-chat-card border border-chat-border w-full max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] h-[550px] animate-slide-up"
      >
        {/* Header */}
        <div className="p-4 border-b border-chat-border flex items-center justify-between bg-chat-panel/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-full bg-brand-500/15 text-brand-500">
              <Forward className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-chat-textPrimary">Forward Message</h2>
              <p className="text-[11px] text-chat-textSecondary">
                {selectedConvIds.length > 0
                  ? `${selectedConvIds.length} ${selectedConvIds.length === 1 ? 'chat' : 'chats'} selected`
                  : 'Select destination chats'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-chat-surfaceSecondary text-chat-textMuted hover:text-chat-textPrimary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message Snippet Preview */}
        <div className="px-4 py-2 bg-chat-surfaceSecondary/60 border-b border-chat-border/60 text-xs flex items-center gap-2">
          <span className="text-chat-textMuted font-semibold text-[11px] shrink-0">Content:</span>
          <span className="text-chat-textPrimary truncate italic">
            {message.type === 'image'
              ? '📷 Photo'
              : message.type === 'audio'
              ? '🎤 Voice message'
              : message.type === 'document'
              ? `📄 ${message.attachment?.fileName || 'Document'}`
              : message.type === 'custom_emoji'
              ? '✨ Animated Emoji'
              : message.text || 'Message'}
          </span>
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-chat-border/60 bg-chat-panel/40">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search people and groups..."
              className="w-full bg-chat-input border border-chat-border text-chat-textPrimary placeholder:text-chat-textTertiary rounded-xl py-2 pl-9 pr-4 text-xs focus:outline-none focus:border-brand-500 transition-all"
            />
            <Search className="w-4 h-4 text-chat-textMuted absolute left-3 top-2.5" />
          </div>
        </div>

        {/* Error Alert */}
        {errorMsg && (
          <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-red-500 text-xs text-center font-medium">
            {errorMsg}
          </div>
        )}

        {/* Conversation List */}
        <div className="flex-1 overflow-y-auto divide-y divide-chat-divider p-1">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 text-chat-textMuted gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
              <span className="text-xs">Loading chats...</span>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-chat-textMuted text-xs p-4 text-center">
              {searchQuery ? 'No matching conversations found.' : 'No available conversations.'}
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSelected = selectedConvIds.includes(conv._id);
              const title = conv.isGroup
                ? conv.groupMeta?.name || 'Group Chat'
                : conv.recipient?.displayName || conv.recipient?.username || 'User';
              const avatarUrl = conv.isGroup ? conv.groupMeta?.avatarUrl : conv.recipient?.avatarUrl;

              return (
                <div
                  key={conv._id}
                  onClick={() => toggleSelect(conv._id)}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-2xl mx-1 my-0.5 cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-brand-500/15 border border-brand-500/30'
                      : 'hover:bg-chat-surfaceSecondary active:scale-[0.99]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="relative shrink-0">
                      <Avatar src={avatarUrl} name={title} size="sm" isOnline={conv.isGroup ? undefined : conv.recipient?.isOnline} />
                      {conv.isGroup && (
                        <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-brand-500 border border-chat-bg flex items-center justify-center text-white">
                          <Users className="w-2.5 h-2.5" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-semibold text-chat-textPrimary truncate">{title}</div>
                      <div className="text-[10px] text-chat-textMuted truncate">
                        {conv.isGroup
                          ? `${conv.groupMeta?.members?.length || 1} members`
                          : conv.recipient?.username
                          ? `@${conv.recipient.username}`
                          : 'Direct Message'}
                      </div>
                    </div>
                  </div>

                  <div
                    className={`w-5 h-5 rounded-full border flex items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-brand-500 border-brand-500 text-white'
                        : 'border-chat-border bg-chat-panel'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-3 border-t border-chat-border bg-chat-panel flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl bg-chat-surfaceSecondary hover:bg-chat-surfaceTertiary text-chat-textSecondary text-xs font-semibold transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={selectedConvIds.length === 0 || isForwarding}
            onClick={handleForward}
            className="flex-1 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 disabled:opacity-50 disabled:pointer-events-none text-white text-xs font-bold flex items-center justify-center gap-2 shadow-md active:scale-95 transition-all"
          >
            {isForwarding ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Forwarding...</span>
              </>
            ) : (
              <>
                <Send className="w-3.5 h-3.5" />
                <span>Forward {selectedConvIds.length > 0 ? `(${selectedConvIds.length})` : ''}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
