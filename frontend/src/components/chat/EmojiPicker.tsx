import React, { useState, useEffect, useRef } from 'react';
import {
  Search,
  Clock,
  Smile,
  Heart,
  ThumbsUp,
  Sparkles,
  Coffee,
  Flame,
  Star,
  X,
  Send,
  Info,
  Check,
} from 'lucide-react';
import {
  ALL_CUSTOM_EMOJIS,
  searchCustomEmojis,
  EMOJI_CATEGORIES_CONFIG,
  getEmojisByPackId,
  getCustomEmojiById,
} from '../../data/customEmojiCatalog';
import { ICustomEmoji } from '../../types/customEmoji';
import { AnimatedCustomEmoji } from '../emoji/AnimatedCustomEmoji';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onSelectCustomEmoji?: (emojiId: string) => void;
  onClose: () => void;
}

const EMOJI_CATEGORIES = [
  {
    id: 'smileys',
    name: 'Smileys',
    icon: Smile,
    emojis: [
      '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '🥹', '😊',
      '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙',
      '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎',
      '🥸', '🤩', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁',
      '☹️', '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😮‍💨', '😤',
      '😠', '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨', '😰',
      '😥', '😓', '🤗', '🤔', '🫣', '🤭', '🫢', '🫡', '🤫', '🫠',
      '🤥', '😶', '😐', '😑', '🫥', '😯', '😦', '😧', '😮', '😲',
      '🥱', '😴', '🤤', '😪', '😵', '😵‍💫', '🤐', '🥴', '🤢', '🤮',
    ],
  },
  {
    id: 'gestures',
    name: 'Gestures',
    icon: ThumbsUp,
    emojis: [
      '👍', '👎', '👌', '🤌', '🤏', '✌️', '🤞', '🫰', '🤟', '🤘',
      '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '🫵', '👋', '🤚',
      '🖐️', '✋', '🖖', '🫱', '🫲', '🫳', '🫴', '👏', '🙌', '👐',
      '🤲', '🤝', '🙏', '✍️', '💅', '🤳', '💪', '🦾', '🦿', '🦵',
    ],
  },
  {
    id: 'hearts',
    name: 'Hearts',
    icon: Heart,
    emojis: [
      '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
      '❤️‍🔥', '❤️‍🩹', '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝',
      '💟', '💌', '💐', '🌸', '🌹', '🌺', '🌻', '🌼', '🌷', '✨',
    ],
  },
  {
    id: 'objects',
    name: 'Objects',
    icon: Coffee,
    emojis: [
      '☕', '🍵', '🧃', '🥤', '🧋', '🍺', '🍻', '🥂', '🍷', '🍕',
      '🍔', '🍟', '🌭', '🍿', '🧁', '🍰', '🎂', '🍩', '🍫', '🍬',
      '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🎱', '🎮', '🎧',
    ],
  },
  {
    id: 'symbols',
    name: 'Symbols',
    icon: Sparkles,
    emojis: [
      '🔥', '⭐', '🌟', '💫', '⚡', '💥', '💯', '💢', '💨', '💤',
      '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🥈', '🥉', '🔔', '📣',
      '💡', '💰', '💸', '💳', '💎', '🔑', '🔒', '🔓', '⚠️', '✅',
    ],
  },
];

export const EmojiPicker: React.FC<EmojiPickerProps> = ({
  onSelect,
  onSelectCustomEmoji,
  onClose,
}) => {
  // Mode: 'standard' | 'animated'
  const [pickerMode, setPickerMode] = useState<'standard' | 'animated'>('animated');
  const [activeTab, setActiveTab] = useState<string>('cute_friends');
  const [activeStandardCategory, setActiveStandardCategory] = useState<string>('smileys');
  const [search, setSearch] = useState<string>('');

  // Long Press Preview Modal State
  const [previewEmoji, setPreviewEmoji] = useState<ICustomEmoji | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Gesture tracking refs for touch/mouse
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isLongPressTriggeredRef = useRef<boolean>(false);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  // Standard Unicode Recents
  const [recents, setRecents] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('kotha_hobe_recent_emojis');
      return saved ? JSON.parse(saved) : ['👍', '❤️', '😂', '🔥', '😍', '👏', '🎉', '🙏'];
    } catch {
      return ['👍', '❤️', '😂', '🔥', '😍', '👏', '🎉', '🙏'];
    }
  });

  // Animated Custom Emoji Recents (Max 20)
  const [animatedRecents, setAnimatedRecents] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('kotha_hobe_recent_animated_emojis');
      return saved
        ? JSON.parse(saved)
        : ['cat_laugh', 'dog_love', 'panda_cry', 'bunny_laugh', 'fox_love', 'love_heart', 'party_popper'];
    } catch {
      return ['cat_laugh', 'dog_love', 'panda_cry', 'bunny_laugh', 'fox_love', 'love_heart', 'party_popper'];
    }
  });

  // Animated Custom Emoji Favorites (Max 50)
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('kotha_hobe_favorite_animated_emojis');
      return saved ? JSON.parse(saved) : ['cat_laugh', 'love_heart', 'party_popper', 'dog_love'];
    } catch {
      return ['cat_laugh', 'love_heart', 'party_popper', 'dog_love'];
    }
  });

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 2400);
  };

  const isFavorite = (emojiId: string): boolean => {
    return favorites.includes(emojiId);
  };

  const toggleFavorite = (emojiId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    setFavorites((prev) => {
      let updated: string[];
      if (prev.includes(emojiId)) {
        updated = prev.filter((id) => id !== emojiId);
        showToast('Removed from Favorites');
      } else {
        if (prev.length >= 50) {
          showToast('Favorites limit reached (50 max)');
          return prev;
        }
        updated = [emojiId, ...prev];
        showToast('Added to Favorites ⭐');
      }
      try {
        localStorage.setItem('kotha_hobe_favorite_animated_emojis', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const handleSelectEmoji = (emoji: string) => {
    onSelect(emoji);
    setRecents((prev) => {
      const filtered = prev.filter((e) => e !== emoji);
      const updated = [emoji, ...filtered].slice(0, 16);
      try {
        localStorage.setItem('kotha_hobe_recent_emojis', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  const handleSelectCustomEmoji = (emojiId: string) => {
    if (onSelectCustomEmoji) {
      onSelectCustomEmoji(emojiId);
    } else {
      onSelect(`:${emojiId}: `);
    }

    setAnimatedRecents((prev) => {
      const filtered = prev.filter((id) => id !== emojiId);
      const updated = [emojiId, ...filtered].slice(0, 20);
      try {
        localStorage.setItem('kotha_hobe_recent_animated_emojis', JSON.stringify(updated));
      } catch {}
      return updated;
    });

    if (previewEmoji) {
      setPreviewEmoji(null);
    }
  };

  // --- GESTURE & TOUCH HANDLERS (Short Click vs Long Press) ---
  const handleTouchStart = (emoji: ICustomEmoji, e: React.TouchEvent) => {
    isLongPressTriggeredRef.current = false;
    const touch = e.touches[0];
    touchStartPosRef.current = { x: touch.clientX, y: touch.clientY };

    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      isLongPressTriggeredRef.current = true;
      setPreviewEmoji(emoji);
      // Light haptic feedback if supported
      if (navigator.vibrate) {
        try {
          navigator.vibrate(40);
        } catch {}
      }
    }, 400);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPosRef.current) return;
    const touch = e.touches[0];
    const dx = Math.abs(touch.clientX - touchStartPosRef.current.x);
    const dy = Math.abs(touch.clientY - touchStartPosRef.current.y);
    if (dx > 8 || dy > 8) {
      // User is scrolling -> cancel long press
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    touchStartPosRef.current = null;
  };

  const handleMouseDown = (emoji: ICustomEmoji) => {
    isLongPressTriggeredRef.current = false;
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = setTimeout(() => {
      isLongPressTriggeredRef.current = true;
      setPreviewEmoji(emoji);
    }, 450);
  };

  const handleMouseUp = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
  };

  const handleEmojiClick = (emoji: ICustomEmoji) => {
    if (isLongPressTriggeredRef.current) {
      isLongPressTriggeredRef.current = false;
      return;
    }
    handleSelectCustomEmoji(emoji.id);
  };

  // --- RESOLVE DISPLAYED ANIMATED EMOJIS ---
  let displayedAnimatedEmojis: ICustomEmoji[] = [];

  if (search.trim()) {
    displayedAnimatedEmojis = searchCustomEmojis(search);
  } else if (activeTab === 'recent') {
    displayedAnimatedEmojis = animatedRecents
      .map((id) => getCustomEmojiById(id))
      .filter((e): e is ICustomEmoji => e !== null);
  } else if (activeTab === 'favorites') {
    displayedAnimatedEmojis = favorites
      .map((id) => getCustomEmojiById(id))
      .filter((e): e is ICustomEmoji => e !== null);
  } else {
    displayedAnimatedEmojis = getEmojisByPackId(activeTab);
  }

  // Filtered standard emojis
  const filteredStandardCategories = EMOJI_CATEGORIES.map((cat) => {
    if (!search) return cat;
    return {
      ...cat,
      emojis: cat.emojis.filter(() => true),
    };
  });

  return (
    <div className="w-full bg-chat-panel border-t border-chat-border flex flex-col h-80 select-none z-30 animate-fade-in shadow-2xl relative">
      {/* Mini Toast Notification */}
      {toastMessage && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 bg-chat-card border border-brand-500/50 text-chat-textPrimary text-xs font-semibold px-3 py-1.5 rounded-full shadow-lg flex items-center gap-1.5 animate-fade-in pointer-events-none">
          <Sparkles className="w-3.5 h-3.5 text-brand-500" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* 1. TOP HEADER: MODE SWITCHER & SEARCH BAR */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-chat-border bg-chat-panel/95 backdrop-blur-sm gap-2 flex-shrink-0">
        <div className="flex items-center gap-1 bg-chat-card p-0.5 rounded-xl border border-chat-border flex-shrink-0">
          <button
            type="button"
            onClick={() => setPickerMode('animated')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer touch-manipulation ${
              pickerMode === 'animated'
                ? 'bg-gradient-to-r from-amber-500 to-brand-500 text-white shadow-xs scale-102'
                : 'text-chat-textMuted hover:text-chat-textPrimary'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Animated</span>
          </button>
          <button
            type="button"
            onClick={() => setPickerMode('standard')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer touch-manipulation ${
              pickerMode === 'standard'
                ? 'bg-brand-500 text-white shadow-xs scale-102'
                : 'text-chat-textMuted hover:text-chat-textPrimary'
            }`}
          >
            <span>😀</span>
            <span>Standard</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="flex-1 flex items-center gap-2 bg-chat-input border border-chat-border rounded-xl px-2.5 py-1.5 text-xs max-w-sm">
          <Search className="w-3.5 h-3.5 text-chat-textMuted flex-shrink-0" />
          <input
            type="text"
            placeholder={
              pickerMode === 'animated'
                ? 'Search animated (cat, love, party, pizza...)'
                : 'Search emojis...'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-chat-textPrimary outline-none w-full placeholder:text-chat-textTertiary text-xs"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="text-chat-textMuted hover:text-chat-textPrimary p-0.5 rounded-full cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 2. SUB-CATEGORY NAVIGATION TABS */}
      <div className="flex items-center px-2 py-1.5 border-b border-chat-border bg-chat-card/40 overflow-x-auto no-scrollbar gap-1 flex-shrink-0">
        {pickerMode === 'animated' ? (
          // Animated Packs & Categories Tabs
          EMOJI_CATEGORIES_CONFIG.map((cat) => {
            const isActive = !search && activeTab === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setSearch('');
                  setActiveTab(cat.id);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer touch-manipulation flex-shrink-0 ${
                  isActive
                    ? 'bg-brand-500 text-white shadow-xs font-bold scale-105'
                    : 'bg-chat-panel/60 border border-chat-border/60 text-chat-textMuted hover:text-chat-textPrimary hover:bg-chat-surfaceSecondary'
                }`}
                title={cat.name}
              >
                <span className="text-xs">{cat.icon}</span>
                <span className="text-[11px]">{cat.name}</span>
                {cat.id === 'favorites' && favorites.length > 0 && (
                  <span
                    className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono ${
                      isActive ? 'bg-white/30 text-white' : 'bg-brand-500/20 text-brand-500'
                    }`}
                  >
                    {favorites.length}
                  </span>
                )}
              </button>
            );
          })
        ) : (
          // Standard Category Tabs
          EMOJI_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const isActive = !search && activeStandardCategory === cat.id;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => {
                  setSearch('');
                  setActiveStandardCategory(cat.id);
                }}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer touch-manipulation flex-shrink-0 ${
                  isActive
                    ? 'bg-brand-500 text-white shadow-xs font-bold scale-105'
                    : 'bg-chat-panel/60 border border-chat-border/60 text-chat-textMuted hover:text-chat-textPrimary hover:bg-chat-surfaceSecondary'
                }`}
                title={cat.name}
              >
                <Icon className="w-3.5 h-3.5" />
                <span className="text-[11px]">{cat.name}</span>
              </button>
            );
          })
        )}
      </div>

      {/* 3. SCROLLABLE EMOJI GRID AREA */}
      <div className="flex-1 overflow-y-auto p-3 hardware-accelerated overscroll-contain">
        {/* --- ANIMATED VIEW --- */}
        {pickerMode === 'animated' && (
          <div>
            {/* Header info / count */}
            <div className="flex items-center justify-between mb-2.5 px-1">
              <div className="text-[11px] font-bold text-chat-textPrimary uppercase tracking-wider flex items-center gap-1.5">
                <span className="text-amber-500">
                  {search
                    ? '🔍'
                    : EMOJI_CATEGORIES_CONFIG.find((c) => c.id === activeTab)?.icon || '✨'}
                </span>
                <span>
                  {search
                    ? `Results for "${search}"`
                    : EMOJI_CATEGORIES_CONFIG.find((c) => c.id === activeTab)?.name || 'Custom Emojis'}
                </span>
                <span className="text-[10px] font-mono text-chat-textMuted font-normal">
                  ({displayedAnimatedEmojis.length})
                </span>
              </div>
              <span className="text-[10px] text-chat-textTertiary hidden sm:inline">
                Tap to send · Hold for preview
              </span>
            </div>

            {/* Empty States */}
            {displayedAnimatedEmojis.length === 0 ? (
              <div className="text-center py-10 flex flex-col items-center justify-center gap-2">
                <div className="w-12 h-12 rounded-2xl bg-chat-card border border-chat-border flex items-center justify-center text-2xl">
                  {activeTab === 'favorites' ? '⭐' : activeTab === 'recent' ? '🕒' : '🔍'}
                </div>
                <p className="text-xs font-semibold text-chat-textPrimary">
                  {activeTab === 'favorites'
                    ? 'No favorite animated emojis yet'
                    : activeTab === 'recent'
                    ? 'No recently used animated emojis'
                    : `No emojis matching "${search}"`}
                </p>
                <p className="text-[11px] text-chat-textMuted max-w-xs text-center">
                  {activeTab === 'favorites'
                    ? 'Long-press any emoji and tap the star icon to save your favorites!'
                    : activeTab === 'recent'
                    ? 'Start tapping reactions to see them appear here.'
                    : 'Try searching for keywords like laugh, love, pizza, party, cat, cry, etc.'}
                </p>
              </div>
            ) : (
              /* Emoji Grid */
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-7 gap-2.5">
                {displayedAnimatedEmojis.map((emoji) => {
                  const fav = isFavorite(emoji.id);
                  return (
                    <div
                      key={emoji.id}
                      onClick={() => handleEmojiClick(emoji)}
                      onTouchStart={(e) => handleTouchStart(emoji, e)}
                      onTouchMove={handleTouchMove}
                      onTouchEnd={handleTouchEnd}
                      onMouseDown={() => handleMouseDown(emoji)}
                      onMouseUp={handleMouseUp}
                      onMouseLeave={handleMouseUp}
                      className="group relative p-2 rounded-2xl bg-chat-card hover:bg-chat-surfaceSecondary active:bg-brand-500/10 border border-chat-border hover:border-brand-500/50 flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 shadow-xs cursor-pointer touch-manipulation select-none"
                      title={`${emoji.name}: ${emoji.description} (Hold for preview)`}
                    >
                      {/* Favorite Star Button */}
                      <button
                        type="button"
                        onClick={(e) => toggleFavorite(emoji.id, e)}
                        className={`absolute top-1 right-1 p-1 rounded-full transition-opacity z-10 cursor-pointer ${
                          fav
                            ? 'text-amber-400 opacity-100'
                            : 'text-chat-textMuted opacity-0 group-hover:opacity-100 hover:text-amber-400'
                        }`}
                        title={fav ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Star className={`w-3 h-3 ${fav ? 'fill-amber-400' : ''}`} />
                      </button>

                      {/* Animated SVG Preview */}
                      <div className="pointer-events-none py-1">
                        <AnimatedCustomEmoji
                          emojiId={emoji.id}
                          size={54}
                          autoPlay={false}
                          loop={false}
                          interactive={false}
                        />
                      </div>

                      {/* Labels */}
                      <div className="pointer-events-none text-center w-full px-1">
                        <p className="text-[11px] font-bold text-chat-textPrimary group-hover:text-brand-500 capitalize leading-tight truncate">
                          {emoji.name.split(' ')[1] || emoji.name}
                        </p>
                        <p className="text-[9px] text-chat-textMuted capitalize truncate">
                          {emoji.character}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* --- STANDARD UNICODE VIEW --- */}
        {pickerMode === 'standard' && (
          <div className="space-y-4">
            {/* Recents */}
            {!search && recents.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-chat-textMuted uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>Recently Used</span>
                </div>
                <div className="grid grid-cols-8 sm:grid-cols-10 gap-2 text-2xl text-center">
                  {recents.map((emoji, idx) => (
                    <button
                      key={`recent_${idx}`}
                      type="button"
                      onClick={() => handleSelectEmoji(emoji)}
                      className="pressable-icon p-1.5 rounded-xl hover:bg-chat-surfaceSecondary cursor-pointer touch-manipulation select-none transition-transform active:scale-90"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Standard Category Grids */}
            {filteredStandardCategories
              .filter((cat) => (search ? true : cat.id === activeStandardCategory))
              .map((cat) => (
                <div key={cat.id}>
                  <div className="text-[11px] font-semibold text-chat-textMuted uppercase tracking-wider mb-2">
                    {cat.name}
                  </div>
                  <div className="grid grid-cols-8 sm:grid-cols-10 gap-2 text-2xl text-center">
                    {cat.emojis.map((emoji, idx) => (
                      <button
                        key={`${cat.id}_${idx}`}
                        type="button"
                        onClick={() => handleSelectEmoji(emoji)}
                        className="pressable-icon p-1.5 rounded-xl hover:bg-chat-surfaceSecondary cursor-pointer touch-manipulation select-none transition-transform active:scale-90"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* 4. LONG-PRESS INTERACTIVE PREVIEW MODAL                                   */}
      {/* ========================================================================= */}
      {previewEmoji && (
        <div
          onClick={() => setPreviewEmoji(null)}
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 animate-fade-in"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-chat-card border border-chat-border rounded-3xl p-6 shadow-2xl max-w-sm w-full flex flex-col items-center gap-4 relative animate-scale-up"
          >
            {/* Close Button */}
            <button
              type="button"
              onClick={() => setPreviewEmoji(null)}
              className="absolute top-4 right-4 text-chat-textMuted hover:text-chat-textPrimary p-1.5 rounded-full hover:bg-chat-surfaceSecondary cursor-pointer transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Large Interactive Animated SVG */}
            <div className="py-2 flex flex-col items-center justify-center">
              <AnimatedCustomEmoji
                emojiId={previewEmoji.id}
                size={120}
                autoPlay={true}
                loop={true}
                interactive={true}
              />
              <span className="text-[10px] text-chat-textTertiary mt-2 font-medium">
                Tap character to replay bounce
              </span>
            </div>

            {/* Emoji Details */}
            <div className="text-center w-full space-y-1">
              <div className="flex items-center justify-center gap-2">
                <h3 className="text-base font-bold text-chat-textPrimary">{previewEmoji.name}</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-500 font-semibold uppercase">
                  {previewEmoji.packId.replace('_', ' ')}
                </span>
              </div>
              <p className="text-xs text-chat-textMuted px-2">{previewEmoji.description}</p>
            </div>

            {/* Keyword Tags */}
            <div className="flex flex-wrap items-center justify-center gap-1.5 max-w-xs">
              {previewEmoji.keywords.slice(0, 4).map((kw, i) => (
                <span
                  key={i}
                  className="text-[10px] font-mono px-2 py-0.5 rounded-lg bg-chat-panel border border-chat-border text-chat-textTertiary"
                >
                  #{kw}
                </span>
              ))}
            </div>

            {/* Modal Actions */}
            <div className="w-full flex items-center gap-2 pt-2 border-t border-chat-border">
              {/* Favorite Toggle Button */}
              <button
                type="button"
                onClick={() => toggleFavorite(previewEmoji.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold border transition-all cursor-pointer touch-manipulation ${
                  isFavorite(previewEmoji.id)
                    ? 'bg-amber-500/10 border-amber-500/40 text-amber-500'
                    : 'bg-chat-panel border-chat-border text-chat-textPrimary hover:bg-chat-surfaceSecondary'
                }`}
              >
                <Star
                  className={`w-4 h-4 ${isFavorite(previewEmoji.id) ? 'fill-amber-500 text-amber-500' : ''}`}
                />
                <span>{isFavorite(previewEmoji.id) ? 'Favorited' : 'Favorite'}</span>
              </button>

              {/* Send Button */}
              <button
                type="button"
                onClick={() => handleSelectCustomEmoji(previewEmoji.id)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-bold bg-gradient-to-r from-brand-500 to-amber-500 text-white shadow-md hover:shadow-lg transition-all cursor-pointer touch-manipulation active:scale-98"
              >
                <Send className="w-4 h-4" />
                <span>Send Reaction</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
