import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Send,
  Smile,
  Paperclip,
  Image as ImageIcon,
  Camera,
  FileText,
  Mic,
  X,
  Trash2,
  StopCircle,
  Settings as SettingsIcon,
} from 'lucide-react';
import { EmojiPicker } from './EmojiPicker';
import { EmojiSuggestionBar } from './EmojiSuggestionBar';
import { IReplyTo, IAttachment } from '../../types';
import { ICustomEmoji } from '../../types/customEmoji';
import { getContextualEmojiSuggestions } from '../../data/customEmojiCatalog';
import { ensureAudioPermission, openSystemAppSettings } from '../../services/nativeMediaService';
import { compressImageForUpload } from '../../utils/imageCompressor';

interface MessageComposerProps {
  onSend: (
    text: string,
    type?: 'text' | 'image' | 'audio' | 'document' | 'custom_emoji',
    attachment?: IAttachment,
    replyTo?: IReplyTo,
    localFile?: File | Blob
  ) => void;
  onTyping: () => void;
  replyingTo?: IReplyTo | null;
  onCancelReply?: () => void;
  disabled?: boolean;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({
  onSend,
  onTyping,
  replyingTo,
  onCancelReply,
  disabled = false,
}) => {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  // Contextual Suggestions State
  const [suggestions, setSuggestions] = useState<ICustomEmoji[]>([]);
  const [isSuggestionDismissed, setIsSuggestionDismissed] = useState<boolean>(false);
  const suggestionDebounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Pending attachment preview state
  const [pendingFile, setPendingFile] = useState<{
    file: File;
    type: 'image' | 'document';
    previewUrl?: string;
  } | null>(null);

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [permissionAlert, setPermissionAlert] = useState<{
    message: string;
    isPermanent?: boolean;
  } | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const activeStreamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<NodeJS.Timeout | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const lastTypingCallRef = useRef<number>(0);
  const sendLockRef = useRef<boolean>(false);

  // Auto-resize textarea based on text lines
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [text]);

  // Clean up recording tracks & timers on unmount
  useEffect(() => {
    return () => {
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
      }
      if (suggestionDebounceTimerRef.current) {
        clearTimeout(suggestionDebounceTimerRef.current);
      }
    };
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);

    const now = Date.now();
    if (val.trim().length > 0 && now - lastTypingCallRef.current > 1800) {
      lastTypingCallRef.current = now;
      onTyping();
    }

    // Debounce contextual animated emoji matching (250ms)
    if (suggestionDebounceTimerRef.current) {
      clearTimeout(suggestionDebounceTimerRef.current);
    }
    suggestionDebounceTimerRef.current = setTimeout(() => {
      if (!val || val.trim().length < 2) {
        setSuggestions([]);
        return;
      }
      try {
        const recents = JSON.parse(localStorage.getItem('kotha_hobe_recent_animated_emojis') || '[]');
        const favorites = JSON.parse(localStorage.getItem('kotha_hobe_favorite_animated_emojis') || '[]');
        const results = getContextualEmojiSuggestions(val, recents, favorites, 4);
        setSuggestions(results);
        setIsSuggestionDismissed(false);
      } catch {
        setSuggestions([]);
      }
    }, 250);
  };

  const handleSelectSuggestion = (emoji: ICustomEmoji) => {
    const trimmed = text.trim();
    const isPureTrigger = [
      'haha',
      'hahaha',
      'hahahaha',
      'lol',
      'lmao',
      'rofl',
      'love',
      'love you',
      'i love you',
      'sad',
      'cry',
      'angry',
      'mad',
      'wow',
      'omg',
      'congrats',
      'party',
      'fire',
      'pizza',
      'burger',
      'coffee',
    ].includes(trimmed.toLowerCase());

    if (isPureTrigger) {
      onSend(emoji.id, 'custom_emoji', undefined, replyingTo || undefined);
      setText('');
      if (onCancelReply) onCancelReply();
    } else {
      setText((prev) => (prev ? `${prev} :${emoji.id}: ` : `:${emoji.id}: `));
    }
    setSuggestions([]);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 1. Send Text / Image / Document Message Instantly (with double-tap protection)
  const handleSend = () => {
    if (disabled || sendLockRef.current) return;
    sendLockRef.current = true;
    setTimeout(() => {
      sendLockRef.current = false;
    }, 250);

    if (pendingFile) {
      const originalFile = pendingFile.file;
      const previewUrl = pendingFile.previewUrl || URL.createObjectURL(originalFile);
      const mimeType = originalFile.type || (pendingFile.type === 'image' ? 'image/jpeg' : 'application/pdf');

      if (pendingFile.type === 'image') {
        compressImageForUpload(originalFile).then((compressedFile) => {
          onSend(
            text.trim(),
            'image',
            {
              url: previewUrl,
              fileName: compressedFile instanceof File ? compressedFile.name : originalFile.name,
              mimeType: 'image/jpeg',
              size: compressedFile.size,
            },
            replyingTo || undefined,
            compressedFile
          );
        });
      } else {
        onSend(
          text.trim(),
          pendingFile.type,
          {
            url: previewUrl,
            fileName: originalFile.name,
            mimeType,
            size: originalFile.size,
          },
          replyingTo || undefined,
          originalFile
        );
      }

      setPendingFile(null);
      setText('');
      if (onCancelReply) onCancelReply();
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) return;

    onSend(trimmed, 'text', undefined, replyingTo || undefined);
    setText('');
    setSuggestions([]);
    setIsSuggestionDismissed(false);
    setShowEmoji(false);
    if (onCancelReply) onCancelReply();
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  // 2. File Selection Handler
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, type: 'image' | 'document') => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setShowAttachMenu(false);

    let previewUrl: string | undefined;
    if (type === 'image') {
      previewUrl = URL.createObjectURL(file);
    }

    setPendingFile({ file, type, previewUrl });
    e.target.value = '';
  };

  // 3. Real Audio Recording with Android Permission Check
  const handleMicClick = async () => {
    if (disabled || isRecording) return;

    const perm = await ensureAudioPermission();
    if (!perm.granted) {
      if (perm.permanentlyDenied) {
        setPermissionAlert({
          message:
            'Microphone permission is disabled for Kotha Hobe. Please enable it in Android Settings to record voice messages.',
          isPermanent: true,
        });
      } else {
        setPermissionAlert({
          message: 'Microphone permission is required to record voice messages.',
          isPermanent: false,
        });
      }
      return;
    }

    startRecording();
  };

  const recordingSecondsRef = useRef<number>(0);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      activeStreamRef.current = stream;
      audioChunksRef.current = [];
      recordingSecondsRef.current = 0;

      let mimeType = 'audio/webm;codecs=opus';
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/aac')) {
          mimeType = 'audio/aac';
        } else {
          mimeType = '';
        }
      }

      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        if (activeStreamRef.current) {
          activeStreamRef.current.getTracks().forEach((track) => track.stop());
          activeStreamRef.current = null;
        }

        const finalType = recorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: finalType });
        const finalDuration = Math.max(1, recordingSecondsRef.current);

        if (audioBlob.size > 0) {
          const ext = finalType.includes('mp4') ? 'm4a' : 'webm';
          const fileName = `voice_${Date.now()}.${ext}`;
          const previewUrl = URL.createObjectURL(audioBlob);

          onSend(
            '',
            'audio',
            {
              url: previewUrl,
              fileName,
              mimeType: finalType,
              size: audioBlob.size,
              duration: finalDuration,
            },
            replyingTo || undefined,
            audioBlob
          );

          if (onCancelReply) onCancelReply();
        }
      };

      recorder.start(100);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);

      recordTimerRef.current = setInterval(() => {
        setRecordingSeconds((sec) => {
          const next = sec + 1;
          recordingSecondsRef.current = next;
          return next;
        });
      }, 1000);
    } catch (err: any) {
      console.error('[VoiceRecorder] Start error:', err);
      setPermissionAlert({
        message: 'Could not start audio recording. Please ensure microphone access is granted.',
        isPermanent: false,
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      if (mediaRecorderRef.current.state === 'recording') {
        try {
          mediaRecorderRef.current.requestData();
        } catch {}
      }
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
      }
    }
  };

  const cancelRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      audioChunksRef.current = [];
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
      }
      if (activeStreamRef.current) {
        activeStreamRef.current.getTracks().forEach((track) => track.stop());
        activeStreamRef.current = null;
      }
    }
  };

  const formatRecordingTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const hasSendableContent = Boolean(text.trim() || pendingFile);

  return (
    <div className="flex flex-col border-t border-chat-border/60 bg-chat-panel/95 backdrop-blur-md z-20 pb-[calc(0.5rem+env(safe-area-inset-bottom))] transition-colors shadow-[0_-2px_10px_rgba(0,0,0,0.03)]">
      {/* Hidden File Inputs */}
      <input
        ref={photoInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => handleFileSelect(e, 'image')}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFileSelect(e, 'image')}
      />
      <input
        ref={docInputRef}
        type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
        className="hidden"
        onChange={(e) => handleFileSelect(e, 'document')}
      />

      {/* Permission Alert Dialog */}
      {permissionAlert && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-chat-card border border-chat-border rounded-2xl p-5 w-full max-w-xs shadow-2xl space-y-4 animate-scale-up text-center">
            <div className="w-12 h-12 rounded-full bg-red-500/20 text-red-500 mx-auto flex items-center justify-center">
              <Mic className="w-6 h-6" />
            </div>

            <div>
              <h3 className="text-base font-bold text-chat-textPrimary mb-1.5">Microphone Permission</h3>
              <p className="text-xs text-chat-textSecondary leading-relaxed">{permissionAlert.message}</p>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              {permissionAlert.isPermanent ? (
                <button
                  onClick={() => {
                    openSystemAppSettings();
                    setPermissionAlert(null);
                  }}
                  className="w-full py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md active:scale-95"
                >
                  <SettingsIcon className="w-4 h-4" />
                  <span>Open Android Settings</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    setPermissionAlert(null);
                    handleMicClick();
                  }}
                  className="w-full py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold transition-all shadow-md active:scale-95"
                >
                  Try Again
                </button>
              )}

              <button
                onClick={() => setPermissionAlert(null)}
                className="w-full py-2 rounded-xl bg-chat-surfaceSecondary hover:bg-chat-surfaceTertiary text-chat-textSecondary hover:text-chat-textPrimary text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Replying Banner */}
      <AnimatePresence>
        {replyingTo && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="overflow-hidden bg-chat-surfaceSecondary/90 border-b border-chat-border/60"
          >
            <div className="flex items-center justify-between px-4 py-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-1 h-7 rounded-full bg-brand-500 flex-shrink-0" />
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-brand-600 dark:text-brand-400 truncate block">
                    Replying to {replyingTo.senderName}
                  </span>
                  <span className="text-xs text-chat-textSecondary truncate block opacity-90">
                    {replyingTo.type === 'image'
                      ? '📷 Photo'
                      : replyingTo.type === 'audio'
                      ? '🎤 Voice message'
                      : replyingTo.fileName
                      ? `📄 ${replyingTo.fileName}`
                      : replyingTo.text}
                  </span>
                </div>
              </div>
              <button
                onClick={onCancelReply}
                className="p-1 rounded-full text-chat-textMuted hover:text-chat-textPrimary hover:bg-chat-surfaceTertiary transition-colors"
                title="Cancel Reply"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Pending Attachment Preview Drawer */}
      <AnimatePresence>
        {pendingFile && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="overflow-hidden bg-chat-card border-b border-chat-border/60"
          >
            <div className="p-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                {pendingFile.previewUrl ? (
                  <img
                    src={pendingFile.previewUrl}
                    alt="Selected"
                    className="w-12 h-12 rounded-xl object-cover border border-chat-border shadow-xs"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-xl bg-brand-500/15 text-brand-500 flex items-center justify-center border border-brand-500/20">
                    <FileText className="w-6 h-6" />
                  </div>
                )}
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-chat-textPrimary truncate block">
                    {pendingFile.file.name}
                  </span>
                  <span className="text-[11px] text-chat-textSecondary">
                    {(pendingFile.file.size / (1024 * 1024)).toFixed(2)} MB • Add optional caption below
                  </span>
                </div>
              </div>
              <button
                onClick={() => setPendingFile(null)}
                className="p-1.5 rounded-full bg-chat-surfaceSecondary hover:bg-chat-surfaceTertiary text-chat-textSecondary hover:text-chat-textPrimary transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Compact Circular Attachment Tray */}
      <AnimatePresence>
        {showAttachMenu && (
          <motion.div
            initial={{ opacity: 0, y: 8, height: 0 }}
            animate={{ opacity: 1, y: 0, height: 'auto' }}
            exit={{ opacity: 0, y: 8, height: 0 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="overflow-hidden px-6 py-3.5 bg-chat-card/95 backdrop-blur-md border-b border-chat-border/50 flex items-center justify-around"
          >
            <button
              onClick={() => photoInputRef.current?.click()}
              className="flex flex-col items-center gap-1.5 text-xs text-chat-textSecondary hover:text-chat-textPrimary group"
            >
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-purple-500/20 to-purple-500/10 text-purple-500 border border-purple-500/25 flex items-center justify-center group-hover:scale-105 group-active:scale-95 transition-all shadow-xs">
                <ImageIcon className="w-5 h-5" />
              </div>
              <span className="font-medium">Photos</span>
            </button>

            <button
              onClick={() => cameraInputRef.current?.click()}
              className="flex flex-col items-center gap-1.5 text-xs text-chat-textSecondary hover:text-chat-textPrimary group"
            >
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-pink-500/20 to-pink-500/10 text-pink-500 border border-pink-500/25 flex items-center justify-center group-hover:scale-105 group-active:scale-95 transition-all shadow-xs">
                <Camera className="w-5 h-5" />
              </div>
              <span className="font-medium">Camera</span>
            </button>

            <button
              onClick={() => docInputRef.current?.click()}
              className="flex flex-col items-center gap-1.5 text-xs text-chat-textSecondary hover:text-chat-textPrimary group"
            >
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-sky-500/20 to-sky-500/10 text-sky-500 border border-sky-500/25 flex items-center justify-center group-hover:scale-105 group-active:scale-95 transition-all shadow-xs">
                <FileText className="w-5 h-5" />
              </div>
              <span className="font-medium">Documents</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Contextual Animated Emoji Suggestions Bar */}
      {!isRecording && (
        <EmojiSuggestionBar
          suggestions={isSuggestionDismissed ? [] : suggestions}
          onSelect={handleSelectSuggestion}
          onDismiss={() => setIsSuggestionDismissed(true)}
        />
      )}

      {/* Main Composer Bar */}
      {isRecording ? (
        /* Voice Recording Active Bar */
        <div className="px-4 py-2 flex items-center justify-between gap-3 bg-red-500/10 border-t border-red-500/25 animate-fade-in">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping" />
            <span className="text-xs font-mono font-bold text-red-500">
              Recording {formatRecordingTime(recordingSeconds)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={cancelRecording}
              className="p-2 rounded-full hover:bg-black/10 dark:hover:bg-white/10 text-chat-textSecondary hover:text-red-500 transition-colors"
              title="Cancel Recording"
            >
              <Trash2 className="w-4.5 h-4.5" />
            </button>
            <button
              onClick={stopRecording}
              className="px-3.5 py-1.5 rounded-full bg-red-500 hover:bg-red-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-sm active:scale-95 transition-all"
            >
              <StopCircle className="w-4 h-4" />
              <span>Send</span>
            </button>
          </div>
        </div>
      ) : (
        /* Standard Floating Composer Input Row */
        <div className="px-2.5 py-1.5 flex items-end gap-1.5 flex-shrink-0">
          {/* Emoji Toggle */}
          <button
            type="button"
            onClick={() => {
              setShowEmoji(!showEmoji);
              setShowAttachMenu(false);
            }}
            className={`p-2 rounded-full focus:outline-none transition-colors ${
              showEmoji
                ? 'text-brand-500 bg-brand-500/10'
                : 'text-chat-textSecondary hover:text-brand-500 active:scale-95'
            }`}
            title="Emoji"
          >
            <Smile className="w-5 h-5" />
          </button>

          {/* Attachment Paperclip Button */}
          <button
            type="button"
            onClick={() => {
              setShowAttachMenu(!showAttachMenu);
              setShowEmoji(false);
            }}
            className={`p-2 rounded-full focus:outline-none transition-colors ${
              showAttachMenu
                ? 'text-brand-500 bg-brand-500/10'
                : 'text-chat-textSecondary hover:text-brand-500 active:scale-95'
            }`}
            title="Attach Media or File"
          >
            <Paperclip className="w-5 h-5 rotate-45" />
          </button>

          {/* Soft Rounded Input Capsule */}
          <div className="flex-1 bg-chat-input rounded-[22px] px-3.5 py-1.5 flex items-center min-h-[40px] border border-chat-border/60 focus-within:border-brand-500/70 focus-within:ring-2 focus-within:ring-brand-500/10 transition-all">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={pendingFile ? 'Add a caption...' : 'Type a message...'}
              disabled={disabled}
              rows={1}
              className="w-full bg-transparent text-chat-textPrimary placeholder:text-chat-textTertiary resize-none outline-none text-[15px] leading-[1.4] max-h-[120px] py-1"
            />
          </div>

          {/* Morphing Mic <-> Send Action Button */}
          <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center">
            <AnimatePresence mode="wait" initial={false}>
              {hasSendableContent ? (
                <motion.button
                  key="send-action"
                  initial={{ scale: 0.6, opacity: 0, rotate: -20 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  exit={{ scale: 0.6, opacity: 0, rotate: 20 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  type="button"
                  onClick={handleSend}
                  disabled={disabled}
                  className="w-10 h-10 rounded-full flex items-center justify-center shadow-md bg-brand-500 hover:bg-brand-600 active:scale-95 text-white transition-transform cursor-pointer"
                  title="Send"
                >
                  <Send className="w-4.5 h-4.5 ml-0.5" />
                </motion.button>
              ) : (
                <motion.button
                  key="mic-action"
                  initial={{ scale: 0.6, opacity: 0, rotate: 20 }}
                  animate={{ scale: 1, opacity: 1, rotate: 0 }}
                  exit={{ scale: 0.6, opacity: 0, rotate: -20 }}
                  transition={{ duration: 0.15, ease: 'easeOut' }}
                  type="button"
                  onClick={handleMicClick}
                  disabled={disabled}
                  className="w-10 h-10 rounded-full bg-brand-500/15 text-brand-500 hover:bg-brand-500 hover:text-white active:scale-95 flex items-center justify-center transition-all cursor-pointer shadow-2xs"
                  title="Record Voice Message"
                >
                  <Mic className="w-4.5 h-4.5" />
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>
      )}

      {/* Emoji Picker Drawer */}
      {showEmoji && (
        <EmojiPicker
          onSelect={(emoji) => setText((prev) => prev + emoji)}
          onSelectCustomEmoji={(emojiId) => {
            onSend(emojiId, 'custom_emoji', undefined, replyingTo || undefined);
            setShowEmoji(false);
            if (onCancelReply) onCancelReply();
          }}
          onClose={() => setShowEmoji(false)}
        />
      )}
    </div>
  );
};
