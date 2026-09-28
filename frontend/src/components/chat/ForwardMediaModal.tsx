import React, { useState, useEffect } from 'react';
import { X, Search, Send, Check, Share2, MessageSquare, ExternalLink, Loader2 } from 'lucide-react';
import { IConversation, IAttachment, IMessage } from '../../types';
import { fetchConversations } from '../../api/conversationApi';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { Avatar } from '../common/Avatar';
import { getMediaUrl } from '../../api/messageApi';
import { modalStack } from '../../utils/modalStack';

interface ForwardMediaModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaUrl: string;
  fileName?: string;
  type?: 'image' | 'document' | 'video' | 'audio';
  attachment?: IAttachment;
  initialCaption?: string;
}

export const ForwardMediaModal: React.FC<ForwardMediaModalProps> = ({
  isOpen,
  onClose,
  mediaUrl,
  fileName = 'Attachment',
  type = 'image',
  attachment,
  initialCaption = '',
}) => {
  const { user } = useAuth();
  const { sendMessage } = useSocket();
  const { themeConfig } = useTheme();

  useEffect(() => {
    if (!isOpen) return;
    return modalStack.register('forward_modal', onClose);
  }, [isOpen, onClose]);
  const [conversations, setConversations] = useState<IConversation[]>(() => {
    try {
      const cached = localStorage.getItem('kotha_hobe_cached_conversations');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [caption, setCaption] = useState(initialCaption);
  const [sendingConvId, setSendingConvId] = useState<string | null>(null);
  const [sentConvIds, setSentConvIds] = useState<string[]>([]);
  const [statusToast, setStatusToast] = useState<string | null>(null);

  const fullUrl = getMediaUrl(mediaUrl);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    fetchConversations()
      .then((res) => {
        if (res.success && res.conversations) {
          setConversations(res.conversations);
          localStorage.setItem('kotha_hobe_cached_conversations', JSON.stringify(res.conversations));
        }
      })
      .catch((err) => console.warn('[Forward] Fetch convs notice:', err))
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const filteredConversations = conversations.filter((c) => {
    const q = searchQuery.toLowerCase().trim();
    if (c.isGroup) {
      const gName = (c.groupMeta?.name || 'Group').toLowerCase();
      return !q || gName.includes(q);
    }
    if (!c.recipient) return false;
    const name = (c.recipient.displayName || '').toLowerCase();
    const uname = (c.recipient.username || '').toLowerCase();
    return !q || name.includes(q) || uname.includes(q);
  });

  const handleSendToChat = async (conv: IConversation) => {
    if ((!conv.isGroup && !conv.recipient?._id) || sendingConvId) return;
    const targetConvId = conv._id;
    const receiverId = conv.isGroup ? undefined : conv.recipient?._id;
    const chatTitle = conv.isGroup
      ? conv.groupMeta?.name || 'Group'
      : conv.recipient?.displayName || conv.recipient?.username || 'User';

    setSendingConvId(targetConvId);

    const clientMsgId = `forward_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    const finalAttachment: IAttachment = attachment || {
      url: mediaUrl,
      fileName,
      mimeType: type === 'image' ? 'image/jpeg' : 'application/octet-stream',
      size: 0,
    };

    let mySenderNickname = user?.displayName || user?.username || '';
    if (conv.isGroup && conv.groupMeta?.nicknames && user?._id) {
      const nicks = conv.groupMeta.nicknames;
      const customNick =
        typeof (nicks as any).get === 'function'
          ? (nicks as any).get(user._id)
          : (nicks as any)[user._id];
      if (customNick) mySenderNickname = customNick;
    }

    const optimisticMsg: IMessage = {
      _id: `temp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      conversationId: targetConvId,
      senderId: user?._id || '',
      receiverId,
      senderNickname: conv.isGroup ? mySenderNickname : undefined,
      text: caption.trim(),
      type,
      status: 'sent',
      createdAt: new Date().toISOString(),
      clientMessageId: clientMsgId,
      attachment: finalAttachment,
    };

    // 1. Instant Cache Update for 0ms delay when user opens this chat
    try {
      const cacheKey = `kotha_hobe_msgs_${targetConvId}`;
      const existing = localStorage.getItem(cacheKey);
      const list: IMessage[] = existing ? JSON.parse(existing) : [];
      if (!list.some((m) => m.clientMessageId === clientMsgId)) {
        list.push(optimisticMsg);
        localStorage.setItem(cacheKey, JSON.stringify(list));
      }

      // Update conversations list preview
      const convsCache = localStorage.getItem('kotha_hobe_cached_conversations');
      if (convsCache) {
        const convs: IConversation[] = JSON.parse(convsCache);
        const idx = convs.findIndex((c) => c._id === targetConvId);
        if (idx > -1) {
          convs[idx] = {
            ...convs[idx],
            lastMessage: {
              text: type === 'image' ? '📷 Photo' : type === 'document' ? `📄 ${fileName}` : caption.trim(),
              senderId: user?._id || '',
              createdAt: optimisticMsg.createdAt,
              status: 'sent',
            },
            lastMessageAt: optimisticMsg.createdAt,
          };
          convs.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());
          localStorage.setItem('kotha_hobe_cached_conversations', JSON.stringify(convs));
        }
      }
    } catch (e) {
      console.warn('[Forward] Local cache update notice:', e);
    }

    // 2. Dispatch event for live components
    window.dispatchEvent(new CustomEvent('kothahobe:message_saved', { detail: optimisticMsg }));

    try {
      sendMessage(
        targetConvId,
        receiverId,
        caption.trim(),
        clientMsgId,
        type,
        finalAttachment
      );

      setSentConvIds((prev) => [...prev, targetConvId]);
      setStatusToast(`Sent to ${chatTitle}`);

      setTimeout(() => {
        onClose();
      }, 700);
    } catch (err) {
      setStatusToast('Failed to send');
      setTimeout(() => setStatusToast(null), 2500);
    } finally {
      setSendingConvId(null);
    }
  };

  const handleNativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: fileName,
          text: caption.trim() || undefined,
          url: fullUrl,
        });
        onClose();
      } catch {}
    } else {
      setStatusToast('Native share not supported on this browser');
      setTimeout(() => setStatusToast(null), 2500);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in select-none">
      {/* Status Toast */}
      {statusToast && (
        <div className="fixed top-12 left-1/2 -translate-x-1/2 z-50 bg-chat-panel border border-chat-border text-chat-textPrimary text-xs px-4 py-2 rounded-full shadow-2xl flex items-center gap-1.5 animate-fade-in pointer-events-none">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span>{statusToast}</span>
        </div>
      )}

      {/* Modal Card */}
      <div
        style={{ backgroundColor: themeConfig.panel }}
        className="w-full max-w-md rounded-t-3xl sm:rounded-2xl border border-chat-border shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-slide-up"
      >
        {/* Header */}
        <div className="p-4 border-b border-chat-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-brand-500/10 text-brand-500 dark:text-brand-400">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-chat-textPrimary leading-tight">Forward & Share</h3>
              <p className="text-xs text-chat-textMuted">Select a chat to send directly</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-chat-card text-chat-textMuted hover:text-chat-textPrimary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Media Preview Thumbnail & Caption */}
        <div
          style={{ backgroundColor: themeConfig.card }}
          className="p-3 border-b border-chat-border flex items-center gap-3"
        >
          <div className="w-12 h-12 rounded-xl bg-chat-panel overflow-hidden flex-shrink-0 border border-chat-border flex items-center justify-center">
            {type === 'image' ? (
              <img src={fullUrl} alt={fileName} className="w-full h-full object-cover" />
            ) : (
              <MessageSquare className="w-6 h-6 text-brand-400" />
            )}
          </div>
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Add an optional caption..."
            className="flex-1 bg-transparent text-chat-textPrimary placeholder:text-chat-textMuted text-xs outline-none"
          />
        </div>

        {/* Search Bar */}
        <div className="p-3 border-b border-chat-border">
          <div className="relative">
            <Search className="w-4 h-4 text-chat-textMuted absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search chats or users..."
              className="w-full bg-chat-input border border-chat-border text-chat-textPrimary placeholder:text-chat-textMuted rounded-xl py-2 pl-9 pr-3 text-xs outline-none focus:border-brand-500"
            />
          </div>
        </div>

        {/* External Native Share Option */}
        <div className="px-3 pt-2">
          <button
            type="button"
            onClick={handleNativeShare}
            className="w-full flex items-center gap-3 p-2.5 rounded-xl bg-chat-card hover:bg-chat-card/80 border border-chat-border text-chat-textPrimary transition-colors text-left"
          >
            <div className="w-9 h-9 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0">
              <ExternalLink className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-chat-textPrimary">Share to other apps...</p>
              <p className="text-[10px] text-chat-textMuted">WhatsApp, Telegram, Facebook, etc.</p>
            </div>
          </button>
        </div>

        {/* Chat List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-1 divide-y divide-chat-border">
          {loading && conversations.length === 0 ? (
            <div className="py-8 flex flex-col items-center justify-center text-chat-textMuted text-xs gap-2">
              <Loader2 className="w-5 h-5 animate-spin text-brand-400" />
              <span>Loading chats...</span>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="py-8 text-center text-chat-textMuted text-xs">
              No conversations found
            </div>
          ) : (
            filteredConversations.map((conv) => {
              const chatTitle = conv.isGroup
                ? conv.groupMeta?.name || 'Group Chat'
                : conv.recipient?.displayName || conv.recipient?.username || 'User';
              const avatarSrc = conv.isGroup ? conv.groupMeta?.avatarUrl : conv.recipient?.avatarUrl;
              const isSent = sentConvIds.includes(conv._id);
              const isSending = sendingConvId === conv._id;

              return (
                <div
                  key={conv._id}
                  onClick={() => !isSent && !isSending && handleSendToChat(conv)}
                  className={`flex items-center justify-between p-2 rounded-xl transition-all cursor-pointer ${
                    isSent
                      ? 'bg-brand-500/15'
                      : 'hover:bg-chat-card active:bg-chat-card/80'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Avatar
                      src={avatarSrc}
                      name={chatTitle}
                      size="sm"
                      isOnline={!conv.isGroup && conv.recipient?.isOnline}
                    />
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-semibold text-chat-textPrimary truncate">
                        {chatTitle}
                      </h4>
                      {conv.isGroup ? (
                        <p className="text-[10px] text-brand-500 dark:text-brand-400 truncate">Group</p>
                      ) : conv.recipient?.username ? (
                        <p className="text-[10px] text-chat-textMuted truncate">@{conv.recipient.username}</p>
                      ) : null}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={isSent || isSending}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all ${
                      isSent
                        ? 'bg-brand-500 text-white'
                        : isSending
                        ? 'bg-brand-500/50 text-white'
                        : 'bg-brand-500 hover:bg-brand-600 text-white active:scale-95 shadow-md'
                    }`}
                  >
                    {isSent ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        <span>Sent</span>
                      </>
                    ) : isSending ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>Sending</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-3 h-3" />
                        <span>Send</span>
                      </>
                    )}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
