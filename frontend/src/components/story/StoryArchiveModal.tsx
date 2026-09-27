import React, { useState, useEffect } from 'react';
import {
  X,
  Archive,
  Eye,
  Trash2,
  Loader2,
  Calendar,
  Image as ImageIcon,
  Type,
} from 'lucide-react';
import { IStorySlide } from '../../types';
import { fetchStoryArchiveApi, deleteStoryApi } from '../../api/storyApi';
import { modalStack } from '../../utils/modalStack';

interface StoryArchiveModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const StoryArchiveModal: React.FC<StoryArchiveModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [stories, setStories] = useState<IStorySlide[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    return modalStack.register('story_archive_modal', onClose);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) return;

    const loadArchive = async () => {
      setLoading(true);
      try {
        const res = await fetchStoryArchiveApi();
        if (res.success && res.stories) {
          setStories(res.stories);
        }
      } catch (err) {
        console.warn('Failed to load story archive:', err);
      } finally {
        setLoading(false);
      }
    };

    loadArchive();
  }, [isOpen]);

  const handleDelete = async (storyId: string) => {
    if (confirm('Permanently remove this story from your archive?')) {
      setDeletingId(storyId);
      try {
        await deleteStoryApi(storyId);
        setStories((prev) => prev.filter((s) => s._id !== storyId));
      } catch (err) {
        console.warn('Failed to delete story:', err);
      } finally {
        setDeletingId(null);
      }
    }
  };

  const formatDate = (isoString?: string) => {
    if (!isoString) return '';
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4 safe-top safe-bottom select-none animate-fadeIn">
      <div className="w-full max-w-lg max-h-[85vh] bg-slate-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl flex flex-col animate-slide-up">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <Archive className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Story Archive</h2>
              <p className="text-[11px] text-slate-400">Your past 24h stories (Only you can see this)</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-emerald-400 gap-2">
              <Loader2 className="w-8 h-8 animate-spin" />
              <span className="text-xs text-white/50">Loading memories...</span>
            </div>
          ) : stories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-white/50 space-y-2">
              <Archive className="w-12 h-12 stroke-[1.5] text-slate-600" />
              <p className="text-sm font-semibold text-white/70">No Archived Stories</p>
              <p className="text-xs text-slate-400 max-w-xs">
                When your active 24h stories expire, they will safely appear in this private archive.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {stories.map((story) => (
                <div
                  key={story._id}
                  className="relative aspect-[9/16] rounded-2xl overflow-hidden border border-white/10 group shadow-md flex flex-col justify-between p-3"
                >
                  {/* Background Canvas */}
                  {story.type === 'image' && story.mediaUrl ? (
                    <img
                      src={story.mediaUrl}
                      alt="Archived story"
                      className="absolute inset-0 w-full h-full object-cover transition-transform group-hover:scale-105"
                    />
                  ) : (
                    <div
                      className={`absolute inset-0 ${
                        story.background || 'bg-gradient-to-br from-emerald-700 to-slate-900'
                      }`}
                    />
                  )}

                  {/* Top overlay: Date & Type icon */}
                  <div className="relative z-10 flex items-center justify-between text-[10px] text-white/80 font-medium drop-shadow">
                    <span className="px-1.5 py-0.5 rounded-full bg-black/50 backdrop-blur-sm">
                      {formatDate(story.createdAt)}
                    </span>
                    <span className="p-1 rounded-full bg-black/50 backdrop-blur-sm">
                      {story.type === 'image' ? (
                        <ImageIcon className="w-3 h-3 text-white" />
                      ) : (
                        <Type className="w-3 h-3 text-white" />
                      )}
                    </span>
                  </div>

                  {/* Center Text Snippet if text story */}
                  {story.type === 'text' && story.text && (
                    <div className="relative z-10 my-auto text-center px-2">
                      <p className="text-xs font-semibold text-white drop-shadow line-clamp-4">
                        {story.text}
                      </p>
                    </div>
                  )}

                  {/* Bottom overlay: Viewers count & Delete button */}
                  <div className="relative z-10 flex items-center justify-between pt-2">
                    <div className="flex items-center gap-1 text-[10px] text-white font-semibold px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm">
                      <Eye className="w-3 h-3 text-emerald-400" />
                      <span>{story.viewsCount || 0}</span>
                    </div>

                    <button
                      type="button"
                      disabled={deletingId === story._id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(story._id);
                      }}
                      className="p-1.5 rounded-full bg-black/60 hover:bg-red-500/80 text-white/70 hover:text-white backdrop-blur-sm transition-all active:scale-90"
                      title="Delete from archive"
                    >
                      {deletingId === story._id ? (
                        <Loader2 className="w-3 h-3 animate-spin text-red-400" />
                      ) : (
                        <Trash2 className="w-3 h-3" />
                      )}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
