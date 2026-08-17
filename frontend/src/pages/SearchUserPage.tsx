import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchUserByUsernameApi } from '../api/userApi';
import { getOrCreateConversationApi } from '../api/conversationApi';
import { IUser } from '../types';
import { Avatar } from '../components/common/Avatar';
import { Search, ArrowLeft, MessageSquare, UserX, AlertCircle, AtSign } from 'lucide-react';

export const SearchUserPage: React.FC = () => {
  const [searchInput, setSearchInput] = useState('');
  const [searchResult, setSearchResult] = useState<IUser | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [error, setError] = useState('');
  const [isCreatingConv, setIsCreatingConv] = useState(false);

  const navigate = useNavigate();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = searchInput.trim();
    if (!query) return;

    setIsSearching(true);
    setSearchResult(null);
    setNotFound(false);
    setError('');

    try {
      const res = await searchUserByUsernameApi(query);
      if (res.success && res.user) {
        setSearchResult(res.user);
      } else {
        setNotFound(true);
        if (res.message && res.message.includes('own account')) {
          setError(res.message);
        }
      }
    } catch (err: any) {
      if (err?.message?.includes('No user found') || err?.message?.includes('not found')) {
        setNotFound(true);
      } else {
        setError(err?.message || 'Search failed. Please try again.');
      }
    } finally {
      setIsSearching(false);
    }
  };

  const handleStartChat = async () => {
    if (!searchResult) return;
    setIsCreatingConv(true);
    try {
      const res = await getOrCreateConversationApi(searchResult._id);
      if (res.success && res.conversation) {
        navigate(`/chat/${res.conversation._id}`);
      }
    } catch (err: any) {
      setError('Failed to start conversation');
    } finally {
      setIsCreatingConv(false);
    }
  };

  return (
    <div className="h-full w-full bg-chat-bg flex flex-col max-w-md mx-auto overflow-hidden">
      {/* Header with Safe Area Status Bar Padding */}
      <header className="px-4 pt-10 pb-3 bg-chat-panel border-b border-white/10 flex items-center gap-3 flex-shrink-0">
        <button
          onClick={() => navigate('/chats')}
          className="p-1.5 rounded-full hover:bg-white/5 text-chat-textMuted hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-bold text-white">Find a Person</h1>
      </header>

      <div className="p-4 flex-1 overflow-y-auto">
        <p className="text-xs text-chat-textMuted mb-4 leading-relaxed">
          Enter a friend's exact username to find their profile and start a private 1-to-1 conversation.
        </p>

        <form onSubmit={handleSearch} className="space-y-4 mb-6">
          <div className="relative">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setNotFound(false);
                setError('');
              }}
              placeholder="Search by username (e.g. asif_53)"
              autoFocus
              className="w-full bg-chat-card border border-white/10 text-white placeholder:text-chat-textMuted/50 rounded-xl py-3.5 pl-10 pr-10 text-sm font-medium focus:outline-none focus:border-brand-500 transition-colors"
            />
            <AtSign className="w-4 h-4 text-chat-textMuted absolute left-3.5 top-4" />
            <Search className="w-4 h-4 text-chat-textMuted absolute right-3.5 top-4" />
          </div>

          <button
            type="submit"
            disabled={isSearching || !searchInput.trim()}
            className="w-full bg-brand-500 hover:bg-brand-600 active:scale-[0.99] text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-md shadow-brand-500/20"
          >
            {isSearching ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <span>Search User</span>
            )}
          </button>
        </form>

        {error && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium flex items-center gap-2 mb-4">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Result Card */}
        {searchResult && (
          <div className="bg-chat-card border border-white/10 rounded-2xl p-5 flex flex-col items-center text-center shadow-lg animate-fade-in">
            <Avatar
              src={searchResult.avatarUrl}
              name={searchResult.displayName || searchResult.username || 'User'}
              isOnline={searchResult.isOnline}
              size="lg"
              className="mb-3"
            />

            <h3 className="text-base font-bold text-white mb-0.5">{searchResult.displayName}</h3>
            {searchResult.username && (
              <p className="text-xs font-mono text-brand-400 mb-5">
                @{searchResult.username}
              </p>
            )}

            <button
              onClick={handleStartChat}
              disabled={isCreatingConv}
              className="w-full bg-brand-500 hover:bg-brand-600 active:scale-[0.99] text-white font-semibold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-md shadow-brand-500/20"
            >
              {isCreatingConv ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  <MessageSquare className="w-4 h-4" />
                  <span>Message</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Not Found State */}
        {notFound && (
          <div className="bg-chat-card/40 border border-white/5 rounded-2xl p-6 flex flex-col items-center text-center animate-fade-in">
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-chat-textMuted mb-3">
              <UserX className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-white mb-1">No user found</h3>
            <p className="text-xs text-chat-textMuted">
              No registered user was found matching that username. Please make sure the spelling is exact.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
