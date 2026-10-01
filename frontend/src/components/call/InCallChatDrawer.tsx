import React, { useState, useEffect, useRef } from 'react';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import { fetchMessagesApi } from '../../api/messageApi';
import { IMessage } from '../../types';
import { X, Send, MessageSquare, ShieldCheck } from 'lucide-react';

interface InCallChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  conversationId: string;
  recipientId?: string;
  title: string;
}

export const InCallChatDrawer: React.FC<InCallChatDrawerProps> = ({
  isOpen,
  onClose,
  conversationId,
  recipientId,
  title,
}) => {
  const { socket, sendMessage } = useSocket();
  const { user } = useAuth();
  const [messages, setMessages] = useState<IMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // 1. Fetch initial message history on drawer open
  useEffect(() => {
    if (!isOpen || !conversationId) return;

    let isMounted = true;
    setIsLoading(true);

    fetchMessagesApi(conversationId, undefined, 40)
      .then((res) => {
        if (isMounted && res.success && res.messages) {
          setMessages(res.messages);
          setTimeout(scrollToBottom, 100);
        }
      })
      .catch((err) => {
        console.warn('[InCallChat] Failed loading messages:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, conversationId]);

  // 2. Listen to real-time incoming messages via socket
  useEffect(() => {
    if (!socket || !isOpen) return;

    const handleNewMessage = (msg: IMessage) => {
      if (msg.conversationId === conversationId) {
        setMessages((prev) => {
          const exists = prev.some((m) => m._id === msg._id || m.clientMessageId === msg.clientMessageId);
          if (exists) return prev;
          return [...prev, msg];
        });
        setTimeout(scrollToBottom, 50);
      }
    };

    socket.on('message:new', handleNewMessage);
    return () => {
      socket.off('message:new', handleNewMessage);
    };
  }, [socket, isOpen, conversationId]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = inputText.trim();
    if (!trimmed || !conversationId) return;

    const clientMsgId = `incall_msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const optimisticMsg: IMessage = {
      _id: clientMsgId,
      clientMessageId: clientMsgId,
      conversationId,
      senderId: user?._id || '',
      text: trimmed,
      type: 'text',
      status: 'sending',
      createdAt: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setInputText('');
    setTimeout(scrollToBottom, 50);

    sendMessage(conversationId, recipientId, trimmed, clientMsgId, 'text');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex justify-end animate-fadeIn">
      {/* Backdrop tap to close */}
      <div className="flex-1" onClick={onClose} />

      {/* Slide-over chat container */}
      <div className="w-full sm:w-[380px] md:w-[420px] h-full bg-[#111B21] border-l border-white/10 shadow-2xl flex flex-col justify-between overflow-hidden animate-slideLeft text-white">
        {/* Header */}
        <div className="px-4 py-3.5 bg-[#202C33] border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-brand-500/20 text-brand-400 flex items-center justify-center">
              <MessageSquare className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white leading-tight truncate max-w-[220px]">
                In-Call Chat: {title}
              </h3>
              <p className="text-[11px] text-chat-textMuted flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-emerald-400" />
                Live in-call messages
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message List */}
        <div className="flex-1 p-4 overflow-y-auto space-y-2.5 bg-[#0B141A]">
          {isLoading && messages.length === 0 ? (
            <div className="flex items-center justify-center h-full text-chat-textMuted text-xs">
              Loading chat...
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-chat-textMuted text-center p-4">
              <MessageSquare className="w-8 h-8 mb-2 opacity-40 text-brand-400" />
              <p className="text-sm font-medium">No messages yet</p>
              <p className="text-xs mt-1 text-chat-textMuted">Send a message to everyone during the call</p>
            </div>
          ) : (
            messages.map((msg) => {
              const rawSender: any = msg.senderId;
              const senderIdStr = typeof rawSender === 'string' ? rawSender : rawSender?._id;
              const isMine = senderIdStr === user?._id;
              const senderName =
                typeof rawSender === 'object' && rawSender?.displayName
                  ? rawSender.displayName
                  : isMine
                  ? 'You'
                  : 'Participant';

              return (
                <div
                  key={msg._id || msg.clientMessageId}
                  className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
                >
                  {!isMine && (
                    <span className="text-[10px] text-brand-400 font-medium px-1 mb-0.5">
                      {senderName}
                    </span>
                  )}
                  <div
                    className={`max-w-[85%] px-3.5 py-2 rounded-2xl text-sm break-words shadow-sm ${
                      isMine
                        ? 'bg-[#005C4B] text-white rounded-br-xs'
                        : 'bg-[#202C33] text-white rounded-bl-xs'
                    }`}
                  >
                    <p className="leading-relaxed text-[13px]">{msg.text}</p>
                    <div className="flex items-center justify-end gap-1 mt-1 text-[10px] text-white/60">
                      <span>
                        {new Date(msg.createdAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Bar */}
        <form
          onSubmit={handleSend}
          className="p-3 bg-[#202C33] border-t border-white/10 flex items-center gap-2"
        >
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a message..."
            className="flex-1 bg-[#111B21] border border-white/10 rounded-xl px-3.5 py-2 text-sm text-white placeholder-chat-textMuted focus:outline-none focus:border-brand-500 transition-colors"
          />
          <button
            type="submit"
            disabled={!inputText.trim()}
            className="p-2.5 rounded-xl bg-[#00A884] hover:bg-[#008f6f] active:scale-95 text-white disabled:opacity-40 disabled:hover:bg-[#00A884] transition-all flex items-center justify-center"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
};
