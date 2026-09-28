import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, X } from 'lucide-react';
import { ICustomEmoji } from '../../types/customEmoji';
import { AnimatedCustomEmoji } from '../emoji/AnimatedCustomEmoji';

interface EmojiSuggestionBarProps {
  suggestions: ICustomEmoji[];
  onSelect: (emoji: ICustomEmoji) => void;
  onDismiss: () => void;
}

export const EmojiSuggestionBar: React.FC<EmojiSuggestionBarProps> = ({
  suggestions,
  onSelect,
  onDismiss,
}) => {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 8, scale: 0.98 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="px-3 py-1.5 bg-chat-card/95 border-b border-chat-border backdrop-blur-md flex items-center justify-between gap-2 z-20 select-none shadow-xs"
      >
        {/* Left Badge: ✨ Suggested */}
        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-500 flex-shrink-0">
          <Sparkles className="w-3.5 h-3.5 animate-pulse" />
          <span className="text-[11px] uppercase tracking-wider hidden sm:inline">Suggested</span>
        </div>

        {/* Suggestion Chips */}
        <div className="flex-1 flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5 px-1">
          {suggestions.map((emoji) => (
            <motion.button
              key={`sugg_${emoji.id}`}
              type="button"
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.92 }}
              onClick={() => onSelect(emoji)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-chat-panel hover:bg-chat-surfaceSecondary active:bg-brand-500/15 border border-chat-border hover:border-brand-500/50 shadow-2xs transition-all cursor-pointer touch-manipulation group flex-shrink-0"
              title={`${emoji.name}: Tap to insert/send`}
            >
              <div className="pointer-events-none">
                <AnimatedCustomEmoji
                  emojiId={emoji.id}
                  size={26}
                  autoPlay={false}
                  loop={false}
                  interactive={false}
                />
              </div>
              <div className="pointer-events-none text-left leading-none">
                <span className="text-[11px] font-bold text-chat-textPrimary group-hover:text-brand-500 capitalize block">
                  {emoji.emotion}
                </span>
                <span className="text-[9px] text-chat-textMuted capitalize block">
                  {emoji.character}
                </span>
              </div>
            </motion.button>
          ))}
        </div>

        {/* Dismiss Button */}
        <button
          type="button"
          onClick={onDismiss}
          className="p-1 rounded-full text-chat-textMuted hover:text-chat-textPrimary hover:bg-chat-surfaceSecondary transition-colors cursor-pointer flex-shrink-0"
          title="Dismiss suggestions"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </motion.div>
    </AnimatePresence>
  );
};

export default EmojiSuggestionBar;
