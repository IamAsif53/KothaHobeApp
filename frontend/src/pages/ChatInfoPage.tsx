import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchConversations, clearChatHistoryApi } from '../api/conversationApi';
import { IUser } from '../types';
import { useTheme } from '../context/ThemeContext';
import { Avatar } from '../components/common/Avatar';
import {
  ArrowLeft,
  Image as ImageIcon,
  FileText,
  Mic,
  Search,
  Bell,
  BellOff,
  Trash2,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';

export const ChatInfoPage: React.FC = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { themeConfig } = useTheme();
  const navigate = useNavigate();

  const [recipient, setRecipient] = useState<IUser | null>(() => {
    try {
      const cached = localStorage.getItem('kotha_hobe_cached_conversations');
      if (cached && conversationId) {
        const parsed = JSON.parse(cached);
        const match = parsed.find((c: any) => c._id === conversationId);
        return match ? match.recipient : null;
      }
      return null;
    } catch {
      return null;
    }
  });

  const [isMuted, setIsMuted] = useState(() => {
    return localStorage.getItem(`kotha_hobe_mute_${conversationId}`) === 'true';
  });

  const handleToggleMute = () => {
    const nextState = !isMuted;
    setIsMuted(nextState);
    if (conversationId) {
      localStorage.setItem(`kotha_hobe_mute_${conversationId}`, String(nextState));
    }
  };

  const handleClearChat = async () => {
    if (confirm('Clear entire chat history? All messages will be permanently removed.')) {
      if (conversationId) {
        try {
          await clearChatHistoryApi(conversationId);
        } catch (e) {
          console.warn('[ClearChat] Backend clear failed:', e);
        }
        localStorage.removeItem(`kotha_hobe_msgs_${conversationId}`);
        navigate(`/chat/${conversationId}`, { replace: true });
      }
    }
  };

  return (
    <div
      style={{ backgroundColor: themeConfig.bg }}
      className="h-full w-full flex flex-col max-w-md mx-auto overflow-hidden transition-colors duration-200 select-none"
    >
      {/* Top Header */}
      <header
        style={{ backgroundColor: themeConfig.panel }}
        className="px-4 pt-10 pb-3 border-b border-white/10 flex items-center justify-between flex-shrink-0"
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/chat/${conversationId}`)}
            className="p-1.5 rounded-full hover:bg-white/10 text-white transition-colors"
            title="Back to Chat"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-white tracking-tight">Contact Info</h1>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Recipient Profile Card */}
        <div
          style={{ backgroundColor: themeConfig.card }}
          className="border border-white/10 rounded-2xl p-6 flex flex-col items-center text-center space-y-3 shadow-md"
        >
          <Avatar
            src={recipient?.avatarUrl}
            name={recipient?.displayName || recipient?.username || 'User'}
            isOnline={recipient?.isOnline}
            size="xl"
          />

          <div>
            <h2 className="text-lg font-bold text-white">{recipient?.displayName || 'User'}</h2>
            {recipient?.username && (
              <p className="text-xs font-mono text-brand-400 mt-0.5">@{recipient.username}</p>
            )}
            <p className="text-[11px] text-chat-textMuted mt-1">
              {recipient?.isOnline ? 'Active now' : 'End-to-end encrypted'}
            </p>
          </div>
        </div>

        {/* Media, Documents & Voice Gallery Link */}
        <div
          style={{ backgroundColor: themeConfig.card }}
          className="border border-white/10 rounded-2xl divide-y divide-white/5 overflow-hidden shadow-sm"
        >
          <div
            onClick={() => navigate(`/chat/${conversationId}/shared`)}
            className="flex items-center justify-between p-4 hover:bg-white/5 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                <ImageIcon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Media, Links & Documents</div>
                <div className="text-xs text-chat-textMuted">Photos, files, and voice recordings</div>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-chat-textMuted" />
          </div>
        </div>

        {/* Settings & Privacy Actions */}
        <div
          style={{ backgroundColor: themeConfig.card }}
          className="border border-white/10 rounded-2xl divide-y divide-white/5 overflow-hidden shadow-sm"
        >
          {/* Mute Toggle */}
          <div
            onClick={handleToggleMute}
            className="flex items-center justify-between p-4 hover:bg-white/5 cursor-pointer transition-colors"
          >
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center">
                {isMuted ? <BellOff className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
              </div>
              <div>
                <div className="text-sm font-semibold text-white">Mute Notifications</div>
                <div className="text-xs text-chat-textMuted">
                  {isMuted ? 'Muted for this chat' : 'Alerts enabled'}
                </div>
              </div>
            </div>
            <div
              className={`w-11 h-6 rounded-full transition-colors relative ${
                isMuted ? 'bg-brand-500' : 'bg-white/20'
              }`}
            >
              <span
                className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${
                  isMuted ? 'left-6' : 'left-1'
                }`}
              />
            </div>
          </div>

          {/* Clear Chat History */}
          <div
            onClick={handleClearChat}
            className="flex items-center gap-3.5 p-4 hover:bg-red-500/10 cursor-pointer transition-colors text-red-400"
          >
            <div className="w-9 h-9 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-semibold text-red-400">Clear Chat History</div>
              <div className="text-xs text-chat-textMuted">Delete all messages in this conversation</div>
            </div>
          </div>
        </div>

        {/* Security badge */}
        <div className="flex items-center justify-center gap-1.5 text-xs text-chat-textMuted pt-4">
          <ShieldCheck className="w-4 h-4 text-brand-400" />
          <span>Messages & calls are encrypted end-to-end</span>
        </div>
      </div>
    </div>
  );
};
