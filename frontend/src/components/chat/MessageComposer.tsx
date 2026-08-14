import React, { useState, useRef, useEffect } from 'react';
import { Send, Smile } from 'lucide-react';

interface MessageComposerProps {
  onSend: (text: string) => void;
  onTyping: () => void;
  disabled?: boolean;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({
  onSend,
  onTyping,
  disabled = false,
}) => {
  const [text, setText] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on text lines (up to max 5 lines)
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [text]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setText(e.target.value);
    if (e.target.value.trim().length > 0) {
      onTyping();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Enter without shift
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  return (
    <div className="border-t border-white/10 bg-chat-panel px-3 py-2 flex items-end gap-2 flex-shrink-0 z-20 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
      <button
        type="button"
        className="p-2 text-chat-textMuted hover:text-brand-400 transition-colors rounded-full focus:outline-none"
        title="Emoji"
      >
        <Smile className="w-6 h-6" />
      </button>

      <div className="flex-1 bg-chat-input rounded-2xl px-4 py-2 flex items-center min-h-[42px] border border-white/5 focus-within:border-brand-500/50 transition-all">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          disabled={disabled}
          rows={1}
          className="w-full bg-transparent text-chat-textPrimary placeholder:text-chat-textMuted resize-none outline-none text-[15px] leading-relaxed max-h-[120px]"
        />
      </div>

      <button
        type="button"
        onClick={handleSend}
        disabled={!text.trim() || disabled}
        className={`w-11 h-11 rounded-full flex items-center justify-center transition-all flex-shrink-0 shadow-md ${
          text.trim() && !disabled
            ? 'bg-brand-500 hover:bg-brand-600 text-white scale-100'
            : 'bg-white/10 text-white/30 cursor-not-allowed scale-95'
        }`}
      >
        <Send className="w-5 h-5 ml-0.5" />
      </button>
    </div>
  );
};
