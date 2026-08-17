import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchConversations } from '../api/conversationApi';
import { IConversation } from '../types';
import { useSocket } from '../context/SocketContext';
import { Avatar } from '../components/common/Avatar';
import { ConversationSkeleton } from '../components/common/Skeleton';
import { formatChatListDate } from '../utils/dateUtils';
import { Search, UserPlus, MessageSquare, Check, CheckCheck, WifiOff } from 'lucide-react';

export const ChatListPage: React.FC = () => {
  // ⚡ Instant Render: Initialize immediately from cached conversations
  const [conversations, setConversations] = useState<IConversation[]>(() => {
    try {
      const cached = localStorage.getItem('kotha_hobe_cached_conversations');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState<boolean>(() => {
    return !localStorage.getItem('kotha_hobe_cached_conversations');
  });

  const { socket, isConnected } = useSocket();
  const navigate = useNavigate();

  const loadConversations = async (silent = false) => {
    if (!silent && !localStorage.getItem('kotha_hobe_cached_conversations')) {
      setLoading(true);
    }
    try {
      const res = await fetchConversations();
      if (res.success && res.conversations) {
        setConversations(res.conversations);
        localStorage.setItem('kotha_hobe_cached_conversations', JSON.stringify(res.conversations));
      }
    } catch (error) {
      console.warn('[ChatList] Background sync notice (offline or network pause)');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConversations();
  }, []);

  // Socket real-time listeners for instant conversation list updates
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = () => {
      loadConversations(true);
    };

    const handleUserPresence = () => {
      loadConversations(true);
    };

    socket.on('message:new', handleNewMessage);
    socket.on('message:sent', handleNewMessage);
    socket.on('message:delivered', handleNewMessage);
    socket.on('message:read', handleNewMessage);
    socket.on('user:online', handleUserPresence);
    socket.on('user:offline', handleUserPresence);

    return () => {
      socket.off('message:new', handleNewMessage);
      socket.off('message:sent', handleNewMessage);
      socket.off('message:delivered', handleNewMessage);
      socket.off('message:read', handleNewMessage);
      socket.off('user:online', handleUserPresence);
      socket.off('user:offline', handleUserPresence);
    };
  }, [socket]);

  const filteredConversations = conversations.filter((conv) => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    const nameMatch = conv.recipient?.displayName?.toLowerCase().includes(q);
    const userMatch = conv.recipient?.username?.toLowerCase().includes(q);
    const emailMatch = conv.recipient?.email?.toLowerCase().includes(q);
    const msgMatch = conv.lastMessage?.text?.toLowerCase().includes(q);
    return nameMatch || userMatch || emailMatch || msgMatch;
  });

  const renderStatusCheck = (status?: string) => {
    if (!status) return null;
    if (status === 'read') {
      return <CheckCheck className="w-3.5 h-3.5 text-sky-400 inline mr-1 stroke-[2.5]" />;
    }
    if (status === 'delivered') {
      return <CheckCheck className="w-3.5 h-3.5 text-chat-textMuted inline mr-1" />;
    }
    return <Check className="w-3.5 h-3.5 text-chat-textMuted inline mr-1" />;
  };

  return (
    <div className="h-full w-full bg-chat-bg flex flex-col overflow-hidden">
      {/* Top Bar Header with safe area status bar padding */}
      <header className="px-4 pt-10 pb-3 bg-chat-panel border-b border-white/10 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-brand-400" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">Chats</h1>
        </div>

        <div className="flex items-center gap-2">
          {!isConnected && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium">
              <WifiOff className="w-3.5 h-3.5" />
              <span>Offline</span>
            </div>
          )}

          <button
            onClick={() => navigate('/search')}
            className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-chat-textMuted hover:text-white transition-colors"
            title="Search User by Username"
          >
            <UserPlus className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* Search Input Bar */}
      <div className="p-3 bg-chat-panel/50 border-b border-white/5 flex-shrink-0">
        <div className="relative">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full bg-chat-input border border-white/5 text-white placeholder:text-chat-textMuted/60 rounded-xl py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:border-brand-500/50 transition-colors"
          />
          <Search className="w-4 h-4 text-chat-textMuted absolute left-3.5 top-3" />
        </div>
      </div>

      {/* Conversations List */}
      <div className="flex-1 overflow-y-auto divide-y divide-white/5">
        {loading ? (
          <>
            <ConversationSkeleton />
            <ConversationSkeleton />
            <ConversationSkeleton />
          </>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-chat-card flex items-center justify-center mb-4 text-chat-textMuted">
              <MessageSquare className="w-8 h-8" />
            </div>
            <h3 className="text-base font-semibold text-white mb-1">
              {searchQuery ? 'No matching conversations' : 'No conversations yet'}
            </h3>
            <p className="text-xs text-chat-textMuted mb-6 max-w-xs leading-relaxed">
              {searchQuery
                ? 'Try searching with a different username.'
                : 'Find someone by username to start chatting right away.'}
            </p>
            {!searchQuery && (
              <button
                onClick={() => navigate('/search')}
                className="bg-brand-500 hover:bg-brand-600 active:scale-95 text-white text-sm font-semibold px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all shadow-md shadow-brand-500/20"
              >
                <UserPlus className="w-4 h-4" />
                <span>Find Someone</span>
              </button>
            )}
          </div>
        ) : (
          filteredConversations.map((conv) => (
            <div
              key={conv._id}
              onClick={() => navigate(`/chat/${conv._id}`)}
              className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-white/5 active:bg-white/10 transition-colors cursor-pointer select-none"
            >
              <Avatar
                src={conv.recipient?.avatarUrl}
                name={conv.recipient?.displayName || conv.recipient?.username || 'User'}
                isOnline={conv.recipient?.isOnline}
                size="md"
              />

              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-1">
                  <h2 className="text-sm font-semibold text-white truncate">
                    {conv.recipient?.displayName || conv.recipient?.username || 'User'}
                  </h2>
                  {conv.lastMessageAt && (
                    <span className="text-[11px] text-chat-textMuted flex-shrink-0 ml-2 font-medium">
                      {formatChatListDate(conv.lastMessageAt)}
                    </span>
                  )}
                </div>

                <div className="flex justify-between items-center">
                  <p className="text-xs text-chat-textMuted truncate pr-2">
                    {renderStatusCheck(conv.lastMessage?.status)}
                    {conv.lastMessage?.text || 'Started conversation'}
                  </p>

                  {conv.unreadCount > 0 && (
                    <span className="bg-brand-500 text-white font-bold text-[10px] min-w-[20px] h-[20px] px-1.5 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm animate-pulse-subtle">
                      {conv.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Floating Action Button */}
      <button
        onClick={() => navigate('/search')}
        className="fixed right-5 bottom-20 w-14 h-14 rounded-full bg-brand-500 hover:bg-brand-600 active:scale-95 text-white flex items-center justify-center shadow-xl shadow-brand-500/30 transition-all z-20"
        title="Start New Chat"
      >
        <UserPlus className="w-6 h-6" />
      </button>
    </div>
  );
};
