import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Eye,
  Trash2,
  Send,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import {
  IStoryFeedItem,
  IStorySlide,
  IStoryViewer,
  IUser,
} from '../../types';
import {
  viewStoryApi,
  reactStoryApi,
  replyStoryApi,
  fetchStoryViewersApi,
  deleteStoryApi,
} from '../../api/storyApi';
import { Avatar } from '../common/Avatar';
import { modalStack } from '../../utils/modalStack';

interface StoryViewerModalProps {
  isOpen: boolean;
  feed: IStoryFeedItem[];
  initialFeedIndex: number;
  initialSlideIndex?: number;
  currentUser: IUser | null;
  onClose: () => void;
  onStoryDeleted?: (storyId: string) => void;
  onOpenArchive?: () => void;
}

const STORY_DURATION = 3000; // Configurable constant: exactly 3000ms (3.0s) per slide
const HOLD_THRESHOLD_MS = 200; // Short tap vs long press threshold
const QUICK_REACTION_EMOJIS = ['❤️', '🔥', '😂', '😍', '😮', '😢', '👏', '🎉'];

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

export const StoryViewerModal: React.FC<StoryViewerModalProps> = ({
  isOpen,
  feed,
  initialFeedIndex,
  initialSlideIndex = 0,
  currentUser,
  onClose,
  onStoryDeleted,
}) => {
  const [feedIndex, setFeedIndex] = useState(initialFeedIndex);
  const [slideIndex, setSlideIndex] = useState(initialSlideIndex);
  const [progress, setProgress] = useState(0); // 0 to 100%
  const [isPaused, setIsPaused] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [showViewersSheet, setShowViewersSheet] = useState(false);
  const [viewers, setViewers] = useState<IStoryViewer[]>([]);
  const [loadingViewers, setLoadingViewers] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [floatingReaction, setFloatingReaction] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Single Playback Controller Refs (Source of Truth)
  const isPausedRef = useRef(false);
  const startedAtRef = useRef<number>(0);
  const pausedElapsedRef = useRef<number>(0);
  const animFrameRef = useRef<number | null>(null);

  // Pointer & Gesture State Machine Refs
  const pointerDownTimeRef = useRef<number>(0);
  const pointerDownPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const holdTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isHoldingRef = useRef(false);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 2500);
  };

  useEffect(() => {
    if (!isOpen) return;
    return modalStack.register('story_viewer_modal', onClose);
  }, [isOpen, onClose]);

  // Sync state on modal open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      const safeFeedIdx = Math.max(0, Math.min(initialFeedIndex, feed.length - 1));
      setFeedIndex(safeFeedIdx);
      const safeSlideIdx = Math.max(0, initialSlideIndex);
      setSlideIndex(safeSlideIdx);
      setProgress(0);
      isPausedRef.current = false;
      setIsPaused(false);
      pausedElapsedRef.current = 0;
      startedAtRef.current = performance.now();
      setShowViewersSheet(false);
      setIsReplying(false);
      setReplyText('');
    }
    return () => {
      document.body.style.overflow = '';
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (holdTimerRef.current) {
        clearTimeout(holdTimerRef.current);
        holdTimerRef.current = null;
      }
    };
  }, [isOpen, initialFeedIndex, initialSlideIndex, feed.length]);

  const currentFeedItem = feed[feedIndex];
  const slides = currentFeedItem?.slides || [];
  const currentSlide: IStorySlide | undefined = slides[slideIndex];
  const isAuthor = currentFeedItem?.isMe || false;

  // View tracking: Record view once slide is displayed
  useEffect(() => {
    if (!isOpen || !currentSlide) return;
    if (!isAuthor && !currentSlide.hasViewed) {
      currentSlide.hasViewed = true;
      viewStoryApi(currentSlide._id).catch(() => {});
    }
  }, [isOpen, currentSlide, isAuthor]);

  // Pause playback
  const pausePlayback = useCallback(() => {
    if (isPausedRef.current) return;
    isPausedRef.current = true;
    setIsPaused(true);
    pausedElapsedRef.current = performance.now() - startedAtRef.current;
  }, []);

  // Resume playback
  const resumePlayback = useCallback(() => {
    if (!isPausedRef.current) return;
    if (showViewersSheet || isReplying) return;
    isPausedRef.current = false;
    setIsPaused(false);
    startedAtRef.current = performance.now() - pausedElapsedRef.current;
  }, [showViewersSheet, isReplying]);

  // Navigate to Next Slide / Next User / Exit
  const advanceToNext = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (slideIndex < slides.length - 1) {
      // Next slide within current user
      setSlideIndex((prev) => prev + 1);
      setProgress(0);
      pausedElapsedRef.current = 0;
      startedAtRef.current = performance.now();
    } else if (feedIndex < feed.length - 1) {
      // Next user in feed
      setFeedIndex((prev) => prev + 1);
      setSlideIndex(0);
      setProgress(0);
      pausedElapsedRef.current = 0;
      startedAtRef.current = performance.now();
    } else {
      // All stories completed - close cleanly
      onClose();
    }
  }, [slideIndex, slides.length, feedIndex, feed.length, onClose]);

  // Navigate to Previous Slide / Previous User
  const goToPrevious = useCallback(() => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    if (slideIndex > 0) {
      // Previous slide within current user
      setSlideIndex((prev) => prev - 1);
      setProgress(0);
      pausedElapsedRef.current = 0;
      startedAtRef.current = performance.now();
    } else if (feedIndex > 0) {
      // Previous user's last slide
      const prevFeedItem = feed[feedIndex - 1];
      const prevLastSlideIdx = Math.max(0, (prevFeedItem?.slides.length || 1) - 1);
      setFeedIndex((prev) => prev - 1);
      setSlideIndex(prevLastSlideIdx);
      setProgress(0);
      pausedElapsedRef.current = 0;
      startedAtRef.current = performance.now();
    } else {
      // Already on first slide of first user: restart slide
      setProgress(0);
      pausedElapsedRef.current = 0;
      startedAtRef.current = performance.now();
    }
  }, [slideIndex, feedIndex, feed]);

  // Single Animation Frame Loop (Source of Truth)
  useEffect(() => {
    if (!isOpen || !currentSlide) return;

    // Reset slide timer
    startedAtRef.current = performance.now();
    pausedElapsedRef.current = 0;
    setProgress(0);

    const tick = () => {
      if (!isPausedRef.current && !showViewersSheet && !isReplying) {
        const elapsed = performance.now() - startedAtRef.current;
        const currentProgress = Math.min(100, (elapsed / STORY_DURATION) * 100);
        setProgress(currentProgress);

        if (currentProgress >= 100) {
          advanceToNext();
          return;
        }
      }

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [isOpen, feedIndex, slideIndex, showViewersSheet, isReplying, advanceToNext]);

  // Canvas Unified Pointer State Machine (Tap vs Hold vs Swipe)
  const handlePointerDown = (e: React.PointerEvent) => {
    pointerDownTimeRef.current = performance.now();
    pointerDownPosRef.current = { x: e.clientX, y: e.clientY };
    isHoldingRef.current = false;

    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
    }

    // Set hold timer for 200ms
    holdTimerRef.current = setTimeout(() => {
      if (pointerDownTimeRef.current > 0) {
        isHoldingRef.current = true;
        pausePlayback();
      }
    }, HOLD_THRESHOLD_MS);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }

    const pressDuration = performance.now() - pointerDownTimeRef.current;
    const deltaX = e.clientX - pointerDownPosRef.current.x;
    const deltaY = e.clientY - pointerDownPosRef.current.y;
    pointerDownTimeRef.current = 0;

    // If user was in HOLD state: simply resume and do NOT navigate!
    if (isHoldingRef.current) {
      isHoldingRef.current = false;
      resumePlayback();
      return;
    }

    // Swipe down gesture to dismiss (>60px)
    if (deltaY > 60 && Math.abs(deltaY) > Math.abs(deltaX) * 1.5) {
      onClose();
      return;
    }

    // Swipe horizontal to switch users
    if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
      if (deltaX < 0) {
        if (feedIndex < feed.length - 1) {
          setFeedIndex((prev) => prev + 1);
          setSlideIndex(0);
        } else {
          onClose();
        }
      } else {
        if (feedIndex > 0) {
          setFeedIndex((prev) => prev - 1);
          setSlideIndex(0);
        }
      }
      return;
    }

    // Tap Interaction (<200ms with small movement): Navigate Left/Right
    if (pressDuration < HOLD_THRESHOLD_MS && Math.abs(deltaX) < 20 && Math.abs(deltaY) < 20) {
      const rect = e.currentTarget.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const width = rect.width;

      if (clickX < width * 0.35) {
        goToPrevious();
      } else {
        advanceToNext();
      }
    }
  };

  const handlePointerCancel = () => {
    if (holdTimerRef.current) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
    pointerDownTimeRef.current = 0;
    if (isHoldingRef.current) {
      isHoldingRef.current = false;
      resumePlayback();
    }
  };

  // Viewers Sheet Fetcher
  const handleOpenViewers = async () => {
    if (!currentSlide || !isAuthor) return;
    pausePlayback();
    setShowViewersSheet(true);
    setLoadingViewers(true);
    try {
      const res = await fetchStoryViewersApi(currentSlide._id);
      if (res.success) {
        setViewers(res.viewers || []);
      }
    } catch {
      showToast('Failed to load viewers');
    } finally {
      setLoadingViewers(false);
    }
  };

  // Delete Story Slide
  const handleDeleteSlide = async () => {
    if (!currentSlide || !isAuthor) return;
    pausePlayback();
    if (confirm('Delete this story slide?')) {
      setIsDeleting(true);
      try {
        await deleteStoryApi(currentSlide._id);
        showToast('Story slide deleted');
        if (onStoryDeleted) onStoryDeleted(currentSlide._id);

        if (slides.length <= 1) {
          if (feed.length <= 1) {
            onClose();
          } else {
            advanceToNext();
          }
        } else {
          setSlideIndex((prev) => Math.max(0, prev - 1));
          setProgress(0);
          resumePlayback();
        }
      } catch (err: any) {
        showToast(err?.message || 'Failed to delete story');
        resumePlayback();
      } finally {
        setIsDeleting(false);
      }
    } else {
      resumePlayback();
    }
  };

  // Quick Reaction
  const handleQuickReaction = async (emoji: string) => {
    if (!currentSlide || isAuthor) return;
    setFloatingReaction(emoji);
    setTimeout(() => setFloatingReaction(null), 1200);

    try {
      await reactStoryApi(currentSlide._id, emoji);
      currentSlide.myReaction = emoji;
      showToast(`Reacted with ${emoji}`);
    } catch {
      showToast('Failed to send reaction');
    }
  };

  // Send Reply
  const handleSendReply = async () => {
    if (!currentSlide || !replyText.trim() || isAuthor) return;
    setIsSendingReply(true);
    try {
      const res = await replyStoryApi(currentSlide._id, replyText.trim());
      if (res.success) {
        setReplyText('');
        setIsReplying(false);
        resumePlayback();
        showToast('Reply sent as message!');
      } else {
        showToast(res.message || 'Failed to send reply');
      }
    } catch (err: any) {
      showToast(err?.message || 'Failed to send reply');
    } finally {
      setIsSendingReply(false);
    }
  };

  if (!isOpen || !currentFeedItem || !currentSlide) return null;

  const content = (
    <div
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[999] w-screen h-screen flex flex-col bg-black text-white select-none animate-fadeIn overflow-hidden"
    >
      {/* Floating Reaction Animation */}
      {floatingReaction && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-50 animate-floatUp">
          <span className="text-7xl drop-shadow-2xl">{floatingReaction}</span>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-black/80 backdrop-blur-md border border-white/20 text-white text-xs px-4 py-2 rounded-full shadow-2xl animate-fadeIn font-semibold">
          {toastMessage}
        </div>
      )}

      {/* Segmented Top Progress Bars with Safe Status Bar Margin */}
      <div className="absolute top-0 left-0 right-0 z-40 px-3 pt-10 sm:pt-4 pb-2 flex gap-1.5 bg-gradient-to-b from-black/90 via-black/50 to-transparent flex-shrink-0">
        {slides.map((slide, idx) => {
          let barWidth = '0%';
          if (idx < slideIndex) {
            barWidth = '100%';
          } else if (idx === slideIndex) {
            barWidth = `${progress}%`;
          }

          return (
            <div
              key={slide._id || idx}
              className="flex-1 h-1 rounded-full bg-white/25 overflow-hidden backdrop-blur-sm"
            >
              <div
                className="h-full bg-white rounded-full transition-all duration-75 ease-linear"
                style={{ width: barWidth }}
              />
            </div>
          );
        })}
      </div>

      {/* Top Header: Author Info & Controls (Safely below status bar) */}
      <div className="absolute top-14 sm:top-7 left-0 right-0 z-40 px-4 py-2 flex items-center justify-between">
        {/* Left: User Avatar + Display Name + Time */}
        <div className="flex items-center gap-2.5 min-w-0">
          <Avatar
            src={currentFeedItem.user.avatarUrl}
            name={currentFeedItem.user.displayName || currentFeedItem.user.username}
            size="sm"
          />
          <div className="min-w-0 flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold text-white truncate drop-shadow-md">
                {currentFeedItem.user.displayName || currentFeedItem.user.username}
              </span>
              {isAuthor && (
                <span className="text-[10px] bg-emerald-500/30 text-emerald-300 font-semibold px-1.5 py-0.2 rounded-full border border-emerald-500/40">
                  You
                </span>
              )}
            </div>
            <span className="text-[10px] text-white/70 drop-shadow-md">
              {formatRelativeTime(currentSlide.createdAt)}
            </span>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* If Author: View Count Pill */}
          {isAuthor && (
            <button
              type="button"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                handleOpenViewers();
              }}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 hover:bg-black/70 border border-white/15 backdrop-blur-md text-xs font-semibold text-white/90 active:scale-95 transition-all"
              title="Viewers"
            >
              <Eye className="w-3.5 h-3.5 text-emerald-400" />
              <span>{currentSlide.viewsCount || 0}</span>
            </button>
          )}

          {/* If Author: Delete Button */}
          {isAuthor && (
            <button
              type="button"
              disabled={isDeleting}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                handleDeleteSlide();
              }}
              className="p-1.5 rounded-full bg-black/50 hover:bg-red-500/30 border border-white/15 hover:border-red-500/40 text-white/80 hover:text-red-400 backdrop-blur-md active:scale-95 transition-all"
              title="Delete Slide"
            >
              {isDeleting ? (
                <Loader2 className="w-4 h-4 animate-spin text-red-400" />
              ) : (
                <Trash2 className="w-4 h-4" />
              )}
            </button>
          )}

          {/* Close Button */}
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="p-1.5 rounded-full bg-black/50 hover:bg-white/20 border border-white/15 text-white backdrop-blur-md active:scale-95 transition-all"
            title="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Middle Interactive Canvas Area (Handles Left 35% / Right 65% Tap and Touch-Hold to Pause) */}
      <div
        className="flex-1 w-full h-full relative flex items-center justify-center overflow-hidden cursor-pointer touch-none"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerCancel}
      >
        {currentSlide.type === 'text' ? (
          /* TEXT STORY SLIDE */
          <div
            className={`w-full h-full ${
              currentSlide.background || 'bg-gradient-to-br from-emerald-600 to-slate-900'
            } flex flex-col items-center justify-center p-8 text-center`}
          >
            <p
              className={`text-white text-2xl sm:text-3xl leading-snug drop-shadow-lg max-w-md break-words whitespace-pre-wrap ${
                currentSlide.fontFamily === 'serif'
                  ? 'font-serif'
                  : currentSlide.fontFamily === 'mono'
                  ? 'font-mono'
                  : currentSlide.fontFamily === 'italic'
                  ? 'italic font-serif'
                  : currentSlide.fontFamily === 'bold'
                  ? 'font-black tracking-wider uppercase'
                  : 'font-sans'
              }`}
              style={{ textAlign: currentSlide.textAlign || 'center' }}
            >
              {currentSlide.text}
            </p>
          </div>
        ) : (
          /* IMAGE STORY SLIDE */
          <div className="w-full h-full bg-black flex flex-col items-center justify-center relative">
            <img
              src={currentSlide.mediaUrl}
              alt="Story"
              className="w-full h-full object-contain"
            />

            {/* Caption Overlay */}
            {currentSlide.text && (
              <div className="absolute bottom-20 left-4 right-4 z-20 flex justify-center pointer-events-none">
                <div className="px-4 py-2.5 rounded-2xl bg-black/70 backdrop-blur-md border border-white/10 text-white text-sm text-center max-w-md shadow-2xl font-medium">
                  {currentSlide.text}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Desktop Navigation Chevrons */}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            goToPrevious();
          }}
          className="hidden sm:flex absolute left-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/70 border border-white/10 backdrop-blur-md items-center justify-center text-white/80 hover:text-white transition-all active:scale-90"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            advanceToNext();
          }}
          className="hidden sm:flex absolute right-4 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 hover:bg-black/70 border border-white/10 backdrop-blur-md items-center justify-center text-white/80 hover:text-white transition-all active:scale-90"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Bottom Footer: Quick Reactions + Reply Bar (Non-author) */}
      {!isAuthor && (
        <div
          className="p-3 pb-8 sm:pb-4 bg-gradient-to-t from-black via-black/90 to-transparent z-40 flex flex-col gap-2 flex-shrink-0"
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          {/* Quick Reaction Row */}
          <div className="flex items-center justify-center gap-2 overflow-x-auto no-scrollbar py-1">
            {QUICK_REACTION_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => handleQuickReaction(emoji)}
                className={`w-9 h-9 rounded-full backdrop-blur-md border border-white/10 text-lg flex items-center justify-center transition-transform active:scale-90 ${
                  currentSlide.myReaction === emoji
                    ? 'bg-emerald-500/30 border-emerald-400 scale-110'
                    : 'bg-white/10 hover:bg-white/20'
                }`}
              >
                {emoji}
              </button>
            ))}
          </div>

          {/* Reply Input */}
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={replyText}
              onFocus={() => {
                setIsReplying(true);
                pausePlayback();
              }}
              onBlur={() => {
                if (!replyText.trim()) {
                  setIsReplying(false);
                  resumePlayback();
                }
              }}
              onChange={(e) => setReplyText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleSendReply();
              }}
              placeholder={`Reply to ${currentFeedItem.user.displayName || currentFeedItem.user.username}...`}
              className="flex-1 bg-white/10 hover:bg-white/15 focus:bg-white/20 border border-white/15 rounded-full py-2.5 px-4 text-xs text-white placeholder-white/50 focus:outline-none focus:border-emerald-400 backdrop-blur-md transition-all"
            />

            {replyText.trim() && (
              <button
                type="button"
                disabled={isSendingReply}
                onClick={handleSendReply}
                className="w-9 h-9 rounded-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-slate-950 flex items-center justify-center shadow-lg active:scale-95 transition-transform"
              >
                {isSendingReply ? (
                  <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Author Bottom Action Sheet (Viewers) */}
      {showViewersSheet && (
        <div
          onClick={() => {
            setShowViewersSheet(false);
            resumePlayback();
          }}
          className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm flex items-end justify-center animate-fadeIn"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md max-h-[70vh] bg-slate-900 border-t border-white/15 rounded-t-3xl p-5 pb-8 flex flex-col gap-4 animate-slide-up shadow-2xl"
          >
            {/* Sheet Handle & Header */}
            <div className="flex flex-col items-center gap-3 border-b border-white/10 pb-3">
              <div className="w-12 h-1.5 rounded-full bg-white/20" />
              <div className="w-full flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">
                    Viewers ({viewers.length})
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowViewersSheet(false);
                    resumePlayback();
                  }}
                  className="p-1 rounded-full hover:bg-white/10 text-white/60 hover:text-white"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Viewers List */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {loadingViewers ? (
                <div className="flex items-center justify-center py-8 text-emerald-400">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : viewers.length === 0 ? (
                <div className="text-center py-8 text-xs text-white/50">
                  No views yet. When friends view your story, they will appear here.
                </div>
              ) : (
                viewers.map((v) => (
                  <div
                    key={v.user._id}
                    className="flex items-center justify-between p-2 rounded-2xl bg-white/5 hover:bg-white/10 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        src={v.user.avatarUrl}
                        name={v.user.displayName || v.user.username}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">
                          {v.user.displayName || v.user.username}
                        </p>
                        <p className="text-[10px] text-white/50">
                          {formatRelativeTime(v.viewedAt)}
                        </p>
                      </div>
                    </div>

                    {v.reaction && (
                      <span className="text-xl px-2 py-0.5 rounded-full bg-white/10 shadow-sm">
                        {v.reaction}
                      </span>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return createPortal(content, document.body);
};
