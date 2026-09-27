import React from 'react';
import { Plus, Sparkles } from 'lucide-react';
import { IStoryFeedItem, IUser } from '../../types';
import { Avatar } from '../common/Avatar';

interface StoryAvatarBarProps {
  feed: IStoryFeedItem[];
  currentUser: IUser | null;
  onOpenComposer: () => void;
  onOpenStory: (feedIndex: number, slideIndex?: number) => void;
}

export const StoryAvatarBar: React.FC<StoryAvatarBarProps> = ({
  feed,
  currentUser,
  onOpenComposer,
  onOpenStory,
}) => {
  const myFeedItem = feed.find((item) => item.isMe);
  const otherFeedItems = feed.filter((item) => !item.isMe);
  const myActiveSlidesCount = myFeedItem?.slides.length || 0;

  return (
    <div className="w-full overflow-x-auto no-scrollbar py-2.5 px-3 border-b border-white/5 bg-chat-panel/40 flex items-center gap-3 select-none flex-shrink-0">
      {/* 1. Current User Story Item */}
      <div className="flex flex-col items-center gap-1.5 flex-shrink-0 cursor-pointer group">
        <div className="relative">
          {myActiveSlidesCount > 0 ? (
            /* Active story with subtle ring */
            <div
              onClick={() => onOpenStory(feed.findIndex((f) => f.isMe), 0)}
              className="p-[2.5px] rounded-full bg-gradient-to-tr from-emerald-400 via-teal-500 to-cyan-500 transition-transform group-hover:scale-105 active:scale-95 shadow-md shadow-emerald-500/20"
            >
              <div className="p-0.5 rounded-full bg-slate-950">
                <Avatar
                  src={currentUser?.avatarUrl}
                  name={currentUser?.displayName || 'You'}
                  size="md"
                />
              </div>
            </div>
          ) : (
            /* No story - default avatar */
            <div
              onClick={onOpenComposer}
              className="p-[2.5px] rounded-full border border-dashed border-slate-600 group-hover:border-emerald-500 transition-all group-hover:scale-105 active:scale-95"
            >
              <div className="p-0.5 rounded-full bg-slate-900">
                <Avatar
                  src={currentUser?.avatarUrl}
                  name={currentUser?.displayName || 'You'}
                  size="md"
                />
              </div>
            </div>
          )}

          {/* Plus Add Button Badge */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onOpenComposer();
            }}
            className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-2 border-slate-950 flex items-center justify-center shadow-lg transition-transform active:scale-90"
            title="Create Story"
          >
            <Plus className="w-3.5 h-3.5 stroke-[3]" />
          </button>
        </div>

        <span className="text-[11px] font-medium text-slate-300 max-w-[62px] truncate text-center">
          {myActiveSlidesCount > 0 ? 'Your Story' : 'Add Story'}
        </span>
      </div>

      {/* Vertical divider */}
      {otherFeedItems.length > 0 && (
        <div className="w-[1px] h-8 bg-white/10 flex-shrink-0 mx-0.5" />
      )}

      {/* 2. Contacts Stories Items */}
      {otherFeedItems.map((item) => {
        const feedIndex = feed.findIndex((f) => f.user._id === item.user._id);
        const firstUnreadIndex = item.slides.findIndex((s) => !s.hasViewed);
        const targetSlideIndex = firstUnreadIndex > -1 ? firstUnreadIndex : 0;

        return (
          <div
            key={item.user._id}
            onClick={() => onOpenStory(feedIndex, targetSlideIndex)}
            className="flex flex-col items-center gap-1.5 flex-shrink-0 cursor-pointer group animate-fadeIn"
          >
            <div
              className={`p-[2.5px] rounded-full transition-transform group-hover:scale-105 active:scale-95 ${
                item.hasUnseen
                  ? 'bg-gradient-to-tr from-emerald-400 via-teal-400 to-cyan-500 shadow-md shadow-emerald-500/20'
                  : item.hasPartial
                  ? 'bg-gradient-to-tr from-emerald-500/70 via-slate-600 to-slate-700'
                  : 'bg-slate-700/60'
              }`}
            >
              <div className="p-0.5 rounded-full bg-slate-950">
                <Avatar
                  src={item.user.avatarUrl}
                  name={item.user.displayName || item.user.username}
                  size="md"
                />
              </div>
            </div>

            <span
              className={`text-[11px] max-w-[64px] truncate text-center font-medium ${
                item.hasUnseen ? 'text-white font-semibold' : 'text-slate-400'
              }`}
            >
              {item.user.displayName?.split(' ')[0] || item.user.username}
            </span>
          </div>
        );
      })}
    </div>
  );
};
