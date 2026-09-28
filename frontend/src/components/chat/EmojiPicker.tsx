import React, { useState } from 'react';
import { Search, Clock, Smile, Heart, ThumbsUp, Sparkles, Coffee, Flame } from 'lucide-react';
import { ALL_CUSTOM_EMOJIS, searchCustomEmojis, CHARACTER_TABS } from '../../data/customEmojiCatalog';
import { CustomEmojiCharacter } from '../../types/customEmoji';
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
  const [pickerMode, setPickerMode] = useState<'standard' | 'animated'>('standard');
  const [activeCategory, setActiveCategory] = useState<string>('smileys');
  const [activeCharacterFilter, setActiveCharacterFilter] = useState<'all' | CustomEmojiCharacter>('all');
  const [search, setSearch] = useState<string>('');
  const [hoveredEmojiId, setHoveredEmojiId] = useState<string | null>(null);

  // Standard Unicode Recents
  const [recents, setRecents] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('kotha_hobe_recent_emojis');
      return saved ? JSON.parse(saved) : ['👍', '❤️', '😂', '🔥', '😍', '👏', '🎉', '🙏'];
    } catch {
      return ['👍', '❤️', '😂', '🔥', '😍', '👏', '🎉', '🙏'];
    }
  });

  // Animated Custom Emoji Recents
  const [animatedRecents, setAnimatedRecents] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('kotha_hobe_recent_animated_emojis');
      return saved ? JSON.parse(saved) : ['cat_laugh', 'dog_love', 'panda_cry', 'bunny_laugh', 'fox_love'];
    } catch {
      return ['cat_laugh', 'dog_love', 'panda_cry', 'bunny_laugh', 'fox_love'];
    }
  });

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
      const updated = [emojiId, ...filtered].slice(0, 12);
      try {
        localStorage.setItem('kotha_hobe_recent_animated_emojis', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  };

  // Filtered standard emojis
  const filteredCategories = EMOJI_CATEGORIES.map((cat) => {
    if (!search) return cat;
    const q = search.toLowerCase();
    return {
      ...cat,
      emojis: cat.emojis.filter(() => true),
    };
  });

  // Filtered animated custom emojis
  const filteredCustomEmojis = search
    ? searchCustomEmojis(search)
    : activeCharacterFilter === 'all'
    ? ALL_CUSTOM_EMOJIS
    : ALL_CUSTOM_EMOJIS.filter((e) => e.character === activeCharacterFilter);

  return (
    <div className="w-full bg-chat-panel border-t border-chat-border flex flex-col h-72 select-none z-30 animate-fade-in shadow-2xl">
      {/* 1. TOP MAIN MODE SWITCHER TABS ([ 😀 Standard ] [ ✨ Animated ]) */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-chat-border bg-chat-panel/90 backdrop-blur-sm gap-2 flex-shrink-0">
        <div className="flex items-center gap-1 bg-chat-card p-0.5 rounded-xl border border-chat-border">
          <button
            type="button"
            onClick={() => setPickerMode('standard')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              pickerMode === 'standard'
                ? 'bg-brand-500 text-white shadow-xs'
                : 'text-chat-textMuted hover:text-chat-textPrimary'
            }`}
          >
            <span>😀</span>
            <span>Standard</span>
          </button>
          <button
            type="button"
            onClick={() => setPickerMode('animated')}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all ${
              pickerMode === 'animated'
                ? 'bg-gradient-to-r from-amber-500 to-brand-500 text-white shadow-xs'
                : 'text-chat-textMuted hover:text-chat-textPrimary'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 animate-pulse" />
            <span>Animated</span>
          </button>
        </div>

        {/* Search Bar */}
        <div className="flex-1 flex items-center gap-2 bg-chat-input border border-chat-border rounded-xl px-2.5 py-1 text-xs max-w-xs">
          <Search className="w-3.5 h-3.5 text-chat-textMuted flex-shrink-0" />
          <input
            type="text"
            placeholder={pickerMode === 'animated' ? 'Search animated (cat, cry, love...)' : 'Search emojis...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-chat-textPrimary outline-none w-full placeholder:text-chat-textTertiary text-xs"
          />
        </div>
      </div>

      {/* 2. SUB-CATEGORY SELECTOR BAR */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-chat-border bg-chat-card/50 overflow-x-auto no-scrollbar gap-1.5 flex-shrink-0">
        {pickerMode === 'standard' ? (
          // Standard Category Icons
          <div className="flex items-center gap-1 w-full">
            {EMOJI_CATEGORIES.map((cat) => {
              const Icon = cat.icon;
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setActiveCategory(cat.id)}
                  className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                    activeCategory === cat.id
                      ? 'bg-chat-surfaceSecondary text-brand-500'
                      : 'text-chat-textMuted hover:text-chat-textPrimary'
                  }`}
                  title={cat.name}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="text-[11px]">{cat.name}</span>
                </button>
              );
            })}
          </div>
        ) : (
          // Animated Character Filter Chips
          <div className="flex items-center gap-1.5 w-full overflow-x-auto no-scrollbar py-0.5">
            {CHARACTER_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveCharacterFilter(tab.id)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold whitespace-nowrap transition-all touch-manipulation cursor-pointer ${
                  activeCharacterFilter === tab.id
                    ? 'bg-brand-500 text-white shadow-xs scale-105'
                    : 'bg-chat-panel border border-chat-border text-chat-textMuted hover:text-chat-textPrimary'
                }`}
              >
                <span>{tab.icon}</span>
                <span className="text-[11px]">{tab.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 3. SCROLLABLE EMOJI GRID AREA */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 hardware-accelerated overscroll-contain">
        {/* --- ANIMATED CUSTOM EMOJI VIEW --- */}
        {pickerMode === 'animated' && (
          <div className="space-y-4">
            {/* Animated Recents */}
            {!search && animatedRecents.length > 0 && activeCharacterFilter === 'all' && (
              <div>
                <div className="text-[11px] font-semibold text-chat-textMuted uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>Recent Reactions</span>
                </div>
                <div className="grid grid-cols-5 sm:grid-cols-6 gap-2">
                  {animatedRecents.map((emojiId) => (
                    <button
                      key={`recent_anim_${emojiId}`}
                      type="button"
                      onClick={() => handleSelectCustomEmoji(emojiId)}
                      className="p-2 rounded-2xl bg-chat-card hover:bg-chat-surfaceSecondary active:bg-brand-500/10 border border-chat-border hover:border-brand-500/40 flex flex-col items-center justify-center gap-1 transition-all active:scale-95 group cursor-pointer touch-manipulation"
                    >
                      <div className="pointer-events-none">
                        <AnimatedCustomEmoji
                          emojiId={emojiId}
                          size={52}
                          autoPlay={false}
                          loop={false}
                          interactive={false}
                        />
                      </div>
                      <span className="pointer-events-none text-[10px] font-semibold text-chat-textMuted group-hover:text-chat-textPrimary capitalize truncate max-w-full">
                        {emojiId.replace('_', ' ')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Pack Title & Animated Grid */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-[11px] font-bold text-chat-textPrimary uppercase tracking-wider flex items-center gap-1.5">
                  <span className="text-amber-500">✨</span>
                  <span>Cute Friends Pack</span>
                  <span className="text-[10px] font-mono text-chat-textMuted font-normal">
                    ({filteredCustomEmojis.length} emojis)
                  </span>
                </div>
              </div>

              {filteredCustomEmojis.length === 0 ? (
                <div className="text-center py-8 text-xs text-chat-textMuted">
                  No animated emojis matching "{search}"
                </div>
              ) : (
                <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2.5">
                  {filteredCustomEmojis.map((emoji) => (
                    <button
                      key={emoji.id}
                      type="button"
                      onClick={() => handleSelectCustomEmoji(emoji.id)}
                      className="p-2 rounded-2xl bg-chat-card hover:bg-chat-surfaceSecondary active:bg-brand-500/10 border border-chat-border hover:border-brand-500/50 flex flex-col items-center justify-center gap-1.5 transition-all active:scale-95 shadow-xs group cursor-pointer touch-manipulation"
                      title={`${emoji.name}: ${emoji.description}`}
                    >
                      <div className="pointer-events-none">
                        <AnimatedCustomEmoji
                          emojiId={emoji.id}
                          size={54}
                          autoPlay={false}
                          loop={false}
                          interactive={false}
                        />
                      </div>
                      <div className="pointer-events-none text-center w-full">
                        <p className="text-[11px] font-bold text-chat-textPrimary group-hover:text-brand-500 capitalize leading-tight truncate">
                          {emoji.emotion}
                        </p>
                        <p className="text-[9px] text-chat-textMuted capitalize truncate">
                          {emoji.character}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* --- STANDARD UNICODE EMOJI VIEW --- */}
        {pickerMode === 'standard' && (
          <>
            {/* Recents */}
            {!search && recents.length > 0 && (
              <div>
                <div className="text-[11px] font-semibold text-chat-textMuted uppercase tracking-wider mb-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>Recently Used</span>
                </div>
                <div className="grid grid-cols-8 gap-2 text-2xl text-center">
                  {recents.map((emoji, idx) => (
                    <button
                      key={`recent_${idx}`}
                      type="button"
                      onClick={() => handleSelectEmoji(emoji)}
                      className="pressable-icon p-1 rounded-lg hover:bg-chat-surfaceSecondary cursor-pointer touch-manipulation select-none"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Selected Category */}
            {filteredCategories
              .filter((cat) => (search ? true : cat.id === activeCategory))
              .map((cat) => (
                <div key={cat.id}>
                  <div className="text-[11px] font-semibold text-chat-textMuted uppercase tracking-wider mb-2">
                    {cat.name}
                  </div>
                  <div className="grid grid-cols-8 gap-2 text-2xl text-center">
                    {cat.emojis.map((emoji, idx) => (
                      <button
                        key={`${cat.id}_${idx}`}
                        type="button"
                        onClick={() => handleSelectEmoji(emoji)}
                        className="pressable-icon p-1 rounded-lg hover:bg-chat-surfaceSecondary cursor-pointer touch-manipulation select-none"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
          </>
        )}
      </div>
    </div>
  );
};
