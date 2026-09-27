import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Image as ImageIcon,
  Type,
  Sparkles,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Palette,
  Loader2,
  Camera,
} from 'lucide-react';
import { createStoryApi } from '../../api/storyApi';
import { compressImageFile } from '../../utils/groupAvatarPresets';
import { modalStack } from '../../utils/modalStack';

interface StoryComposerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStoryCreated?: (story: any) => void;
}

const BACKGROUND_PRESETS = [
  { id: 'emerald', name: 'Emerald', css: 'bg-gradient-to-br from-emerald-600 via-teal-700 to-slate-900' },
  { id: 'midnight', name: 'Midnight', css: 'bg-gradient-to-br from-purple-900 via-indigo-950 to-black' },
  { id: 'sunset', name: 'Sunset', css: 'bg-gradient-to-br from-rose-500 via-amber-600 to-orange-700' },
  { id: 'ocean', name: 'Ocean', css: 'bg-gradient-to-br from-blue-600 via-cyan-700 to-slate-900' },
  { id: 'cyberpunk', name: 'Neon', css: 'bg-gradient-to-br from-fuchsia-600 via-purple-700 to-cyan-700' },
  { id: 'crimson', name: 'Crimson', css: 'bg-gradient-to-br from-red-600 via-rose-800 to-stone-900' },
  { id: 'golden', name: 'Golden', css: 'bg-gradient-to-br from-amber-500 via-yellow-600 to-stone-900' },
  { id: 'obsidian', name: 'Obsidian', css: 'bg-gradient-to-br from-slate-800 via-slate-900 to-black' },
];

const FONT_PRESETS = [
  { id: 'sans', name: 'Modern', style: 'font-sans' },
  { id: 'serif', name: 'Classic', style: 'font-serif' },
  { id: 'mono', name: 'Mono', style: 'font-mono' },
  { id: 'italic', name: 'Script', style: 'italic font-serif' },
  { id: 'bold', name: 'Impact', style: 'font-black tracking-wider uppercase' },
];

const QUICK_EMOJIS = ['✨', '🔥', '❤️', '😍', '🌴', '☕', '🚀', '🎉', '😎', '🎵', '💡', '🌙'];

export const StoryComposerModal: React.FC<StoryComposerModalProps> = ({
  isOpen,
  onClose,
  onStoryCreated,
}) => {
  const [mode, setMode] = useState<'text' | 'image'>('text');
  const [text, setText] = useState('');
  const [caption, setCaption] = useState('');
  const [selectedBgIndex, setSelectedBgIndex] = useState(0);
  const [selectedFontIndex, setSelectedFontIndex] = useState(0);
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('center');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    return modalStack.register('story_composer_modal', onClose);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setText('');
      setCaption('');
      setImagePreview(null);
      setErrorMessage('');
      setMode('text');
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const currentBg = BACKGROUND_PRESETS[selectedBgIndex];
  const currentFont = FONT_PRESETS[selectedFontIndex];

  const handleImageFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('Please select a valid image file');
      return;
    }

    try {
      setIsProcessingImage(true);
      setErrorMessage('');
      const compressedDataUrl = await compressImageFile(file, 1080, 0.85);
      setImagePreview(compressedDataUrl);
      setMode('image');
    } catch (err) {
      setErrorMessage('Failed to process image. Please try another.');
    } finally {
      setIsProcessingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCycleBackground = () => {
    setSelectedBgIndex((prev) => (prev + 1) % BACKGROUND_PRESETS.length);
  };

  const handleCycleFont = () => {
    setSelectedFontIndex((prev) => (prev + 1) % FONT_PRESETS.length);
  };

  const handleCycleAlign = () => {
    setTextAlign((prev) => (prev === 'center' ? 'left' : prev === 'left' ? 'right' : 'center'));
  };

  const handleAddEmoji = (emoji: string) => {
    if (mode === 'text') {
      setText((prev) => prev + emoji);
    } else {
      setCaption((prev) => prev + emoji);
    }
  };

  const handleShareStory = async () => {
    if (mode === 'text' && !text.trim()) {
      setErrorMessage('Please enter some text for your story');
      return;
    }

    if (mode === 'image' && !imagePreview) {
      setErrorMessage('Please pick or take a photo first');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const res = await createStoryApi({
        type: mode,
        text: mode === 'text' ? text.trim() : caption.trim(),
        mediaUrl: mode === 'image' ? imagePreview! : undefined,
        background: currentBg.css,
        fontFamily: currentFont.id,
        textAlign,
        duration: 5,
        privacy: 'connections',
      });

      if (res.success && res.story) {
        if (onStoryCreated) onStoryCreated(res.story);
        onClose();
      } else {
        setErrorMessage(res.message || 'Failed to post story');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to post story');
    } finally {
      setIsSubmitting(false);
    }
  };

  const content = (
    <div
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[999] w-screen h-screen flex flex-col bg-black text-white select-none animate-fadeIn overflow-hidden"
    >
      {/* Hidden File Input for Image Selection */}
      <input
        type="file"
        ref={fileInputRef}
        accept="image/*"
        className="hidden"
        onChange={handleImageFileChange}
      />

      {/* Top Navigation & Toolbar Bar with Safe Status Bar Spacing */}
      <div className="pt-12 sm:pt-10 pb-3 px-4 bg-gradient-to-b from-black/90 via-black/60 to-transparent flex items-center justify-between z-30 flex-shrink-0">
        {/* Left: Close Button */}
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-colors active:scale-90"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Center: Mode Switcher Pills */}
        <div className="flex items-center p-1 rounded-full bg-black/60 backdrop-blur-md border border-white/15 shadow-lg">
          <button
            type="button"
            onClick={() => setMode('text')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all ${
              mode === 'text'
                ? 'bg-white text-black shadow-md'
                : 'text-white/70 hover:text-white'
            }`}
          >
            Text
          </button>
          <button
            type="button"
            onClick={() => {
              if (imagePreview) setMode('image');
              else fileInputRef.current?.click();
            }}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all flex items-center gap-1.5 ${
              mode === 'image'
                ? 'bg-white text-black shadow-md'
                : 'text-white/70 hover:text-white'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Photo</span>
          </button>
        </div>

        {/* Right: Creative Controls (Text Mode) or Change Photo (Image Mode) */}
        <div className="flex items-center gap-2">
          {mode === 'text' ? (
            <>
              {/* Cycle Font */}
              <button
                type="button"
                onClick={handleCycleFont}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all text-xs font-bold border border-white/10 active:scale-90"
                title={`Font: ${currentFont.name}`}
              >
                <Type className="w-4 h-4" />
              </button>

              {/* Cycle Background Gradient */}
              <button
                type="button"
                onClick={handleCycleBackground}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all border border-white/10 active:scale-90"
                title="Change Background"
              >
                <Palette className="w-4 h-4" />
              </button>

              {/* Alignment */}
              <button
                type="button"
                onClick={handleCycleAlign}
                className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all border border-white/10 active:scale-90"
                title="Align text"
              >
                {textAlign === 'center' ? (
                  <AlignCenter className="w-4 h-4" />
                ) : textAlign === 'left' ? (
                  <AlignLeft className="w-4 h-4" />
                ) : (
                  <AlignRight className="w-4 h-4" />
                )}
              </button>
            </>
          ) : (
            /* Image Mode: Change Photo */
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 text-white backdrop-blur-md transition-all text-xs font-semibold border border-white/15 flex items-center gap-1.5 active:scale-90"
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Change</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="flex-1 relative flex flex-col items-center justify-center overflow-hidden">
        {errorMessage && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-red-500/90 text-white text-xs px-4 py-2 rounded-full backdrop-blur-md shadow-xl animate-fade-in font-medium max-w-[90%] text-center">
            {errorMessage}
          </div>
        )}

        {mode === 'text' ? (
          /* TEXT STORY CANVAS */
          <div
            className={`w-full h-full ${currentBg.css} flex flex-col items-center justify-center p-8 transition-colors duration-500 relative`}
          >
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="What's on your mind?..."
              maxLength={2000}
              autoFocus
              className={`w-full max-h-[60vh] bg-transparent border-none outline-none resize-none text-white placeholder-white/40 text-2xl sm:text-3xl leading-snug drop-shadow-md text-${textAlign} ${currentFont.style}`}
              style={{ textAlign }}
            />
          </div>
        ) : (
          /* IMAGE STORY CANVAS */
          <div className="w-full h-full bg-black flex flex-col items-center justify-center relative overflow-hidden">
            {isProcessingImage ? (
              <div className="flex flex-col items-center justify-center gap-2 text-emerald-400">
                <Loader2 className="w-8 h-8 animate-spin" />
                <span className="text-xs text-white/70">Optimizing photo...</span>
              </div>
            ) : imagePreview ? (
              <>
                <img
                  src={imagePreview}
                  alt="Story Preview"
                  className="w-full h-full object-contain"
                />

                {/* Caption Overlay Box */}
                <div className="absolute bottom-4 left-4 right-4 z-20">
                  <input
                    type="text"
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Add a caption..."
                    maxLength={300}
                    className="w-full px-4 py-3 rounded-2xl bg-black/70 backdrop-blur-md border border-white/20 text-white placeholder-white/50 text-sm focus:outline-none focus:border-emerald-400 transition-colors shadow-2xl"
                  />
                </div>
              </>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center gap-3 p-8 rounded-3xl border-2 border-dashed border-white/20 hover:border-emerald-400 text-white/60 hover:text-white cursor-pointer transition-all active:scale-95"
              >
                <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center text-emerald-400">
                  <Camera className="w-8 h-8" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-white">Select Photo from Gallery</p>
                  <p className="text-xs text-white/50 mt-0.5">Or snap with camera</p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Toolbar & Share Action */}
      <div className="p-4 pb-8 sm:pb-5 bg-gradient-to-t from-black via-black/95 to-transparent flex flex-col gap-3 z-30 flex-shrink-0">
        {/* Quick Emoji Bar */}
        <div className="flex items-center justify-center gap-2 overflow-x-auto no-scrollbar py-1">
          {QUICK_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => handleAddEmoji(emoji)}
              className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/25 active:scale-90 text-lg flex items-center justify-center transition-all flex-shrink-0"
            >
              {emoji}
            </button>
          ))}
        </div>

        {/* Share Button */}
        <button
          type="button"
          disabled={isSubmitting || (mode === 'text' ? !text.trim() : !imagePreview)}
          onClick={handleShareStory}
          className="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:pointer-events-none text-slate-950 font-bold text-sm shadow-xl shadow-emerald-500/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin text-slate-950" />
              <span>Sharing to Story...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 text-slate-950 fill-slate-950" />
              <span>Share to Story</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return createPortal(content, document.body);
};
