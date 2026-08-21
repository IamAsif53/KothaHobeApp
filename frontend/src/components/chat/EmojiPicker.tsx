import React, { useState } from 'react';
import { Search, Clock, Smile, Heart, ThumbsUp, Sparkles, Coffee, Flag } from 'lucide-react';

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
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
      '⚽', '🏀', '🏈', '⚾', '🎾', '🏐', '🏉', '🎱', '🎮', '🎧',
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

export const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelect, onClose }) => {
  const [activeCategory, setActiveCategory] = useState<string>('smileys');
  const [search, setSearch] = useState<string>('');

  const [recents, setRecents] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('kotha_hobe_recent_emojis');
      return saved ? JSON.parse(saved) : ['👍', '❤️', '😂', '🔥', '😍', '👏', '🎉', '🙏'];
    } catch {
      return ['👍', '❤️', '😂', '🔥', '😍', '👏', '🎉', '🙏'];
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

  const filteredCategories = EMOJI_CATEGORIES.map((cat) => {
    if (!search) return cat;
    return {
      ...cat,
      emojis: cat.emojis.filter(() => true), // Emojis displayed
    };
  });

  return (
    <div className="w-full bg-[#182229] border-t border-white/10 flex flex-col h-64 select-none z-30 animate-fade-in shadow-2xl">
      {/* Search and Category Tabs */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 bg-[#111b21] gap-2">
        <div className="flex-1 flex items-center gap-2 bg-[#202c33] rounded-lg px-2.5 py-1 text-xs">
          <Search className="w-3.5 h-3.5 text-chat-textMuted" />
          <input
            type="text"
            placeholder="Search emojis..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-transparent text-white outline-none w-full placeholder:text-chat-textMuted text-xs"
          />
        </div>

        <div className="flex items-center gap-1">
          {EMOJI_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`p-1.5 rounded-lg transition-colors ${
                  activeCategory === cat.id ? 'bg-white/10 text-brand-400' : 'text-chat-textMuted hover:text-white'
                }`}
                title={cat.name}
              >
                <Icon className="w-4 h-4" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Emoji Scroll Grid */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4 hardware-accelerated overscroll-contain">
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
                  onClick={() => handleSelectEmoji(emoji)}
                  className="pressable-icon p-1 rounded-lg hover:bg-white/5 cursor-pointer"
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
                    onClick={() => handleSelectEmoji(emoji)}
                    className="pressable-icon p-1 rounded-lg hover:bg-white/5 cursor-pointer"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};
