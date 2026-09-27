import React, { useState, useEffect } from 'react';
import {
  Plus,
  Camera,
  Type,
  Archive,
  Eye,
  Sparkles,
  RefreshCw,
  Clock,
  CircleDot,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../context/ThemeContext';
import { IStoryFeedItem } from '../types';
import { fetchStoryFeedApi } from '../api/storyApi';
import { Avatar } from '../components/common/Avatar';
import { StoryComposerModal } from '../components/story/StoryComposerModal';
import { StoryViewerModal } from '../components/story/StoryViewerModal';
import { StoryArchiveModal } from '../components/story/StoryArchiveModal';

const formatRelativeTime = (isoString?: string): string => {
  if (!isoString) return '';
  const date = new Date(isoString);
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
};

export const StoriesPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const { themeConfig } = useTheme();
  const { socket } = useSocket();

  const [storyFeed, setStoryFeed] = useState<IStoryFeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [viewerState, setViewerState] = useState<{
    isOpen: boolean;
    feedIndex: number;
    slideIndex?: number;
  }>({
    isOpen: false,
    feedIndex: 0,
    slideIndex: 0,
  });

  const loadFeed = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetchStoryFeedApi();
      if (res.success && res.feed) {
        setStoryFeed(res.feed);
      }
    } catch (err) {
      console.warn('Failed to load stories feed:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadFeed();
  }, []);

  // Listen to real-time story events
  useEffect(() => {
    if (!socket) return;

    const handleUpdate = () => {
      loadFeed(true);
    };

    socket.on('story:new', handleUpdate);
    socket.on('story:viewed', handleUpdate);
    socket.on('story:reaction', handleUpdate);
    socket.on('story:deleted', handleUpdate);

    return () => {
      socket.off('story:new', handleUpdate);
      socket.off('story:viewed', handleUpdate);
      socket.off('story:reaction', handleUpdate);
      socket.off('story:deleted', handleUpdate);
    };
  }, [socket]);

  const myFeedItem = storyFeed.find((f) => f.isMe);
  const contactsFeed = storyFeed.filter((f) => !f.isMe);
  const recentUpdates = contactsFeed.filter((f) => f.hasUnseen || f.hasPartial);
  const viewedUpdates = contactsFeed.filter((f) => f.isFullyViewed);

  const openStoryViewer = (feedItem: IStoryFeedItem, slideIdx?: number) => {
    const idx = storyFeed.findIndex((f) => f.user._id === feedItem.user._id);
    if (idx > -1) {
      const targetSlide = slideIdx ?? (feedItem.slides.findIndex((s) => !s.hasViewed) > -1 ? feedItem.slides.findIndex((s) => !s.hasViewed) : 0);
      setViewerState({
        isOpen: true,
        feedIndex: idx,
        slideIndex: targetSlide,
      });
    }
  };

  return (
    <div
      style={{ backgroundColor: themeConfig.bg }}
      className="h-full w-full flex flex-col max-w-md mx-auto relative overflow-hidden transition-colors duration-200 select-none"
    >
      {/* Top Header */}
      <header
        style={{ backgroundColor: themeConfig.panel }}
        className="px-4 pt-10 pb-3 border-b border-white/10 flex items-center justify-between flex-shrink-0"
      >
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold text-white tracking-tight">Stories</h1>
        </div>

        {/* Center: App Bengali Brand */}
        <div className="flex items-center justify-center">
          <span className="text-2xl font-bold text-white tracking-wide font-sans drop-shadow-sm flex items-center gap-1.5">
            💬 কথা হবে
          </span>
        </div>

        {/* Right: Archive & New Story */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowArchive(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 hover:bg-white/10 active:scale-95 border border-white/10 text-white/80 text-xs font-medium transition-all"
            title="Story Archive"
          >
            <Archive className="w-3.5 h-3.5 text-emerald-400" />
            <span>Archive</span>
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto divide-y divide-white/5 pb-24">
        {/* 1. My Status / My Story Card */}
        <div className="p-4 bg-chat-panel/40">
          <div className="flex items-center justify-between">
            <div
              onClick={() => {
                if (myFeedItem && myFeedItem.slides.length > 0) {
                  openStoryViewer(myFeedItem, 0);
                } else {
                  setShowComposer(true);
                }
              }}
              className="flex items-center gap-3.5 flex-1 cursor-pointer group"
            >
              {/* Avatar with Ring */}
              <div className="relative flex-shrink-0">
                {myFeedItem && myFeedItem.slides.length > 0 ? (
                  <div className="p-[2.5px] rounded-full bg-gradient-to-tr from-emerald-400 via-teal-500 to-cyan-500 shadow-md shadow-emerald-500/20 group-hover:scale-105 transition-transform">
                    <div className="p-0.5 rounded-full bg-slate-950">
                      <Avatar
                        src={currentUser?.avatarUrl}
                        name={currentUser?.displayName || 'You'}
                        size="md"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="p-[2.5px] rounded-full border-2 border-dashed border-slate-600 group-hover:border-emerald-500 transition-colors">
                    <div className="p-0.5 rounded-full bg-slate-900">
                      <Avatar
                        src={currentUser?.avatarUrl}
                        name={currentUser?.displayName || 'You'}
                        size="md"
                      />
                    </div>
                  </div>
                )}

                {/* Quick Add Plus Badge */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowComposer(true);
                  }}
                  className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-2 border-slate-950 flex items-center justify-center shadow-lg active:scale-90 transition-transform"
                >
                  <Plus className="w-3.5 h-3.5 stroke-[3]" />
                </button>
              </div>

              {/* Text info */}
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-white group-hover:text-emerald-400 transition-colors">
                  My Story
                </h3>
                <p className="text-xs text-chat-textMuted mt-0.5">
                  {myFeedItem && myFeedItem.slides.length > 0
                    ? `${myFeedItem.slides.length} slide${myFeedItem.slides.length > 1 ? 's' : ''} • ${formatRelativeTime(myFeedItem.lastUpdated)}`
                    : 'Tap to add to your story (24h)'}
                </p>
              </div>
            </div>

            {/* Quick Add Button */}
            <button
              type="button"
              onClick={() => setShowComposer(true)}
              className="p-2.5 rounded-full bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-400 active:scale-95 transition-all"
              title="Add Story"
            >
              <Camera className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 2. Recent Updates Section */}
        {recentUpdates.length > 0 && (
          <div className="p-4 space-y-3">
            <p className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
              Recent updates
            </p>
            <div className="space-y-2">
              {recentUpdates.map((item) => (
                <div
                  key={item.user._id}
                  onClick={() => openStoryViewer(item)}
                  className="flex items-center justify-between p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 active:scale-[0.99] cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-[2.5px] rounded-full bg-gradient-to-tr from-emerald-400 via-teal-400 to-cyan-500 shadow-md shadow-emerald-500/20">
                      <div className="p-0.5 rounded-full bg-slate-950">
                        <Avatar
                          src={item.user.avatarUrl}
                          name={item.user.displayName || item.user.username}
                          size="md"
                        />
                      </div>
                    </div>

                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-white truncate">
                        {item.user.displayName || item.user.username}
                      </h4>
                      <p className="text-xs text-chat-textMuted flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-500" />
                        <span>{formatRelativeTime(item.lastUpdated)}</span>
                        <span>•</span>
                        <span>{item.slides.length} {item.slides.length > 1 ? 'updates' : 'update'}</span>
                      </p>
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-white/40" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 3. Viewed Updates Section */}
        {viewedUpdates.length > 0 && (
          <div className="p-4 space-y-3">
            <p className="text-xs font-bold text-chat-textMuted uppercase tracking-wider">
              Viewed updates
            </p>
            <div className="space-y-2">
              {viewedUpdates.map((item) => (
                <div
                  key={item.user._id}
                  onClick={() => openStoryViewer(item, 0)}
                  className="flex items-center justify-between p-2.5 rounded-2xl bg-white/5 hover:bg-white/10 active:scale-[0.99] cursor-pointer opacity-75 hover:opacity-100 transition-all"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-[2.5px] rounded-full bg-slate-700/60">
                      <div className="p-0.5 rounded-full bg-slate-950">
                        <Avatar
                          src={item.user.avatarUrl}
                          name={item.user.displayName || item.user.username}
                          size="md"
                        />
                      </div>
                    </div>

                    <div className="min-w-0">
                      <h4 className="text-sm font-semibold text-white truncate">
                        {item.user.displayName || item.user.username}
                      </h4>
                      <p className="text-xs text-chat-textMuted">
                        {formatRelativeTime(item.lastUpdated)}
                      </p>
                    </div>
                  </div>

                  <ChevronRight className="w-4 h-4 text-white/30" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. Empty State if no contacts' stories */}
        {contactsFeed.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center p-12 text-center space-y-3">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <CircleDot className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">No Story Updates</h3>
              <p className="text-xs text-chat-textMuted max-w-xs mt-1 leading-relaxed">
                Stories from your contacts will appear here. Share your own thoughts or photos to get the conversation started!
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowComposer(true)}
              className="mt-2 px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-xs font-bold shadow-lg shadow-emerald-600/25 flex items-center gap-2 transition-all"
            >
              <Sparkles className="w-4 h-4" />
              <span>Create a Story</span>
            </button>
          </div>
        )}
      </div>

      {/* Floating Action Button for Quick Story Creation */}
      <div className="absolute bottom-20 right-5 flex flex-col gap-2.5 items-end z-20">
        <button
          type="button"
          onClick={() => setShowComposer(true)}
          className="w-13 h-13 p-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-2xl shadow-emerald-500/40 flex items-center justify-center active:scale-90 transition-transform"
          title="Create Story"
        >
          <Camera className="w-6 h-6 stroke-[2.5]" />
        </button>
      </div>

      {/* Modals */}
      <StoryComposerModal
        isOpen={showComposer}
        onClose={() => setShowComposer(false)}
        onStoryCreated={() => {
          loadFeed(true);
        }}
      />

      <StoryViewerModal
        isOpen={viewerState.isOpen}
        feed={storyFeed}
        initialFeedIndex={viewerState.feedIndex}
        initialSlideIndex={viewerState.slideIndex}
        currentUser={currentUser}
        onClose={() => setViewerState((prev) => ({ ...prev, isOpen: false }))}
        onStoryDeleted={() => {
          loadFeed(true);
        }}
        onOpenArchive={() => {
          setViewerState((prev) => ({ ...prev, isOpen: false }));
          setShowArchive(true);
        }}
      />

      <StoryArchiveModal
        isOpen={showArchive}
        onClose={() => setShowArchive(false)}
      />
    </div>
  );
};
