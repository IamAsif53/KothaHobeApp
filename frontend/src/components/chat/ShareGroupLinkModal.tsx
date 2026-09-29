import React, { useState, useEffect, useMemo } from 'react';
import { X, Search, Send, Check, Loader2, Users, MessageSquare, Share2, Sparkles } from 'lucide-react';
import { fetchConversations } from '../../api/conversationApi';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { IConversation, IUser } from '../../types';
import { Avatar } from '../common/Avatar';

interface ShareGroupLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
  inviteUrl: string;
}

export const ShareGroupLinkModal: React.FC<ShareGroupLinkModalProps> = ({
  isOpen,
  onClose,
  groupId,
  groupName,
  inviteUrl,
}) => {
  const { user: currentUser } = useAuth();
  const { sendMessage } = useSocket();
  const { themeConfig } = useTheme();

  const [conversations, setConversations] = useState<IConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sendingConvIds, setSendingConvIds] = useState<Set<string>>(new Set());
  const [sentConvIds, setSentConvIds] = useState<Set<string>>(new Set());
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetchConversations()
      .then((res) => {
        if (res.success && res.conversations) {
          // Filter out the current group from destination list
          const list = res.conversations.filter((c) => c._id !== groupId);
          setConversations(list);
        }
      })
      .catch((err) => {
        console.error('[ShareGroupLinkModal] Error fetching conversations:', err);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, groupId]);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  const handleSendToChat = async (conv: IConversation) => {
    if (sendingConvIds.has(conv._id) || sentConvIds.has(conv._id)) return;

    setSendingConvIds((prev) => new Set(prev).add(conv._id));

    try {
      const clientMessageId = `share_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const messageText = `Hey! Join our group "${groupName}" on Kotha Hobe:\n${inviteUrl}`;

      let receiverId: string | undefined;
      const participants = conv.participants || [];
      if (!conv.isGroup) {
        const otherParticipant = participants.find(
          (p: any) => (p._id || p)?.toString() !== currentUser?._id
        );
        receiverId = (otherParticipant as any)?._id?.toString() || (otherParticipant as any)?.toString();
      }

      sendMessage(conv._id, receiverId, messageText, clientMessageId, 'text');

      setSentConvIds((prev) => new Set(prev).add(conv._id));
      const targetName = conv.isGroup
        ? conv.groupMeta?.name || 'Group Chat'
        : (participants.find((p: any) => (p._id || p)?.toString() !== currentUser?._id) as any)?.displayName ||
          'Contact';
      showToast(`Invite sent to ${targetName}!`);
    } catch (err: any) {
      console.error('[ShareGroupLinkModal] Send error:', err);
    } finally {
      setSendingConvIds((prev) => {
        const updated = new Set(prev);
        updated.delete(conv._id);
        return updated;
      });
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join "${groupName}" on Kotha Hobe`,
          text: `You've been invited to join "${groupName}" on Kotha Hobe!\n\n`,
          url: inviteUrl,
        });
      } catch (err) {
        // Share cancelled
      }
    } else {
      await navigator.clipboard.writeText(inviteUrl);
      showToast('Invite link copied to clipboard!');
    }
  };

  const filteredConversations = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return conversations;

    return conversations.filter((c) => {
      if (c.isGroup) {
        return c.groupMeta?.name?.toLowerCase().includes(q);
      }
      const otherUser = (c.participants || []).find(
        (p: any) => (p._id || p)?.toString() !== currentUser?._id
      ) as IUser | undefined;
      if (!otherUser) return false;
      return (
        otherUser.displayName?.toLowerCase().includes(q) ||
        otherUser.username?.toLowerCase().includes(q)
      );
    });
  }, [conversations, searchQuery, currentUser?._id]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md bg-chat-panel border border-chat-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-chat-border">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-brand-500/10 text-brand-500 rounded-lg">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-chat-textPrimary">Send Group Link</h3>
              <p className="text-xs text-chat-textMuted">Select a chat or contact to send invite</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-chat-textMuted hover:text-chat-textPrimary hover:bg-chat-card transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Toast feedback */}
        {toastMessage && (
          <div className="mx-4 mt-3 p-2.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-500 text-xs font-semibold flex items-center gap-2 animate-fadeIn">
            <Check className="w-4 h-4" />
            <span>{toastMessage}</span>
          </div>
        )}

        {/* Search & Actions Bar */}
        <div className="p-4 space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-chat-textMuted" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chats or contacts..."
              className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-chat-card border border-chat-border text-xs text-chat-textPrimary focus:outline-none focus:border-brand-500 transition-colors placeholder:text-chat-textMuted"
            />
          </div>

          <button
            onClick={handleNativeShare}
            className="w-full p-2.5 rounded-xl bg-chat-card hover:bg-chat-border/50 border border-chat-border text-chat-textPrimary flex items-center justify-center gap-2 text-xs font-semibold transition-all active:scale-98"
          >
            <Share2 className="w-4 h-4 text-brand-500" />
            <span>Share via Other Apps (WhatsApp, SMS, etc.)</span>
          </button>
        </div>

        {/* Conversation List */}
        <div className="p-4 pt-0 space-y-2 overflow-y-auto flex-1">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-brand-500">
              <Loader2 className="w-7 h-7 animate-spin mb-2" />
              <p className="text-xs text-chat-textMuted">Loading chats...</p>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="py-10 text-center text-chat-textMuted">
              <MessageSquare className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs">No conversations found</p>
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const isSending = sendingConvIds.has(conv._id);
              const isSent = sentConvIds.has(conv._id);

              let displayName = 'Chat';
              let avatarUrl = '';
              let subtitle = '';

              if (conv.isGroup) {
                displayName = conv.groupMeta?.name || 'Group Chat';
                avatarUrl = conv.groupMeta?.avatarUrl || '';
                subtitle = `${conv.participants?.length || 0} members`;
              } else {
                const other = (conv.participants || []).find(
                  (p: any) => (p._id || p)?.toString() !== currentUser?._id
                ) as IUser | undefined;
                if (other) {
                  displayName = other.displayName || other.username || 'User';
                  avatarUrl = other.avatarUrl || '';
                  subtitle = `@${other.username || 'user'}`;
                }
              }

              return (
                <div
                  key={conv._id}
                  onClick={() => handleSendToChat(conv)}
                  className="flex items-center justify-between p-3 rounded-xl bg-chat-card border border-chat-border hover:border-brand-500/30 cursor-pointer transition-all active:scale-[0.99] select-none"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar src={avatarUrl} name={displayName} size="md" />
                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-chat-textPrimary truncate">
                        {displayName}
                      </h4>
                      <p className="text-xs text-chat-textMuted truncate">{subtitle}</p>
                    </div>
                  </div>

                  <button
                    disabled={isSending || isSent}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSendToChat(conv);
                    }}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 ${
                      isSent
                        ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/30'
                        : isSending
                        ? 'bg-brand-500/50 text-white cursor-wait'
                        : 'bg-brand-500 hover:bg-brand-600 active:scale-95 text-white shadow-sm'
                    }`}
                  >
                    {isSending ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isSent ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Sent</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3.5 h-3.5" />
                        <span>Send</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-chat-border bg-chat-panel flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-chat-card hover:bg-chat-border/50 text-chat-textPrimary transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
