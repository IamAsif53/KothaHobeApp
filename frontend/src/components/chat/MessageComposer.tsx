import React, { useState, useRef, useEffect } from 'react';
import { Send, Smile, Paperclip, Image as ImageIcon, Camera, FileText, Mic, X, Trash2, StopCircle } from 'lucide-react';
import { EmojiPicker } from './EmojiPicker';
import { IReplyTo, IAttachment } from '../../types';

interface MessageComposerProps {
  onSend: (text: string, type?: 'text' | 'image' | 'audio' | 'document', attachment?: IAttachment, replyTo?: IReplyTo) => void;
  onTyping: () => void;
  replyingTo?: IReplyTo | null;
  onCancelReply?: () => void;
  onUploadFile: (file: File | Blob, fileName: string, type: 'image' | 'audio' | 'document') => Promise<IAttachment | null>;
  disabled?: boolean;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({
  onSend,
  onTyping,
  replyingTo,
  onCancelReply,
  onUploadFile,
  disabled = false,
}) => {
  const [text, setText] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);

  // Pending attachment preview state
  const [pendingFile, setPendingFile] = useState<{ file: File; type: 'image' | 'document'; previewUrl?: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Audio Recording State
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recordTimerRef = useRef<NodeJS.Timeout | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const docInputRef = useRef<HTMLInputElement>(null);
  const lastTypingCallRef = useRef<number>(0);

  // Auto-resize textarea based on text lines
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  }, [text]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setText(val);

    const now = Date.now();
    if (val.trim().length > 0 && now - lastTypingCallRef.current > 1800) {
      lastTypingCallRef.current = now;
      onTyping();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // 1. Send Text / Caption Message
  const handleSend = async () => {
    if (disabled || isUploading) return;

    if (pendingFile) {
      setIsUploading(true);
      try {
        const attachment = await onUploadFile(pendingFile.file, pendingFile.file.name, pendingFile.type);
        if (attachment) {
          onSend(text.trim(), pendingFile.type, attachment, replyingTo || undefined);
          setPendingFile(null);
          setText('');
          if (onCancelReply) onCancelReply();
        }
      } finally {
        setIsUploading(false);
      }
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) return;

    onSend(trimmed, 'text', undefined, replyingTo || undefined);
    setText('');
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

  // 3. Audio Recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      const recorder = new MediaRecorder(stream);
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());
        const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' });

        if (audioChunksRef.current.length > 0 && recordingSeconds >= 1) {
          setIsUploading(true);
          try {
            const fileName = `voice_${Date.now()}.webm`;
            const attachment = await onUploadFile(audioBlob, fileName, 'audio');
            if (attachment) {
              attachment.duration = recordingSeconds;
              onSend('', 'audio', attachment, replyingTo || undefined);
              if (onCancelReply) onCancelReply();
            }
          } finally {
            setIsUploading(false);
          }
        }
      };

      recorder.start(200);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);

      recordTimerRef.current = setInterval(() => {
        setRecordingSeconds((sec) => sec + 1);
      }, 1000);
    } catch (err) {
      console.error('[VoiceRecorder] Failed to start:', err);
      alert('Microphone permission is required to record voice messages.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
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
    }
  };

  const formatRecordingTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  return (
    <div className="flex flex-col border-t border-white/10 bg-chat-panel z-20 pb-[calc(0.5rem+env(safe-area-inset-bottom))] transition-all">
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

      {/* Replying Banner */}
      {replyingTo && (
        <div className="flex items-center justify-between px-4 py-2 bg-black/40 border-b border-white/5 animate-fade-in">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-1 h-8 rounded-full bg-brand-400" />
            <div className="min-w-0">
              <span className="text-xs font-semibold text-brand-400 truncate block">
                Replying to {replyingTo.senderName}
              </span>
              <span className="text-xs text-white/60 truncate block">
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
            className="p-1 rounded-full text-chat-textMuted hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Pending Attachment Preview Drawer */}
      {pendingFile && (
        <div className="p-3 bg-[#111b21] border-b border-white/10 flex items-center justify-between animate-fade-in gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {pendingFile.previewUrl ? (
              <img
                src={pendingFile.previewUrl}
                alt="Selected"
                className="w-12 h-12 rounded-xl object-cover border border-white/10"
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center">
                <FileText className="w-6 h-6" />
              </div>
            )}
            <div className="min-w-0">
              <span className="text-xs font-semibold text-white truncate block">
                {pendingFile.file.name}
              </span>
              <span className="text-[11px] text-chat-textMuted">
                {(pendingFile.file.size / (1024 * 1024)).toFixed(2)} MB • Add optional caption below
              </span>
            </div>
          </div>
          <button
            onClick={() => setPendingFile(null)}
            className="p-1.5 rounded-full bg-white/5 hover:bg-white/10 text-chat-textMuted hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Attach Popup Menu */}
      {showAttachMenu && (
        <div className="px-4 py-3 bg-[#111b21] border-b border-white/10 flex items-center justify-around animate-fade-in">
          <button
            onClick={() => photoInputRef.current?.click()}
            className="flex flex-col items-center gap-1.5 text-xs text-chat-textMuted hover:text-white"
          >
            <div className="w-12 h-12 rounded-2xl bg-purple-500/20 text-purple-400 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-md">
              <ImageIcon className="w-6 h-6" />
            </div>
            <span>Photos</span>
          </button>

          <button
            onClick={() => cameraInputRef.current?.click()}
            className="flex flex-col items-center gap-1.5 text-xs text-chat-textMuted hover:text-white"
          >
            <div className="w-12 h-12 rounded-2xl bg-pink-500/20 text-pink-400 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-md">
              <Camera className="w-6 h-6" />
            </div>
            <span>Camera</span>
          </button>

          <button
            onClick={() => docInputRef.current?.click()}
            className="flex flex-col items-center gap-1.5 text-xs text-chat-textMuted hover:text-white"
          >
            <div className="w-12 h-12 rounded-2xl bg-sky-500/20 text-sky-400 flex items-center justify-center hover:scale-105 active:scale-95 transition-all shadow-md">
              <FileText className="w-6 h-6" />
            </div>
            <span>Documents</span>
          </button>
        </div>
      )}

      {/* Main Composer Bar */}
      {isRecording ? (
        /* Voice Recording Active Bar */
        <div className="px-4 py-2.5 flex items-center justify-between gap-3 bg-red-950/40 border-t border-red-500/30 animate-fade-in">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-red-500 animate-ping" />
            <span className="text-xs font-mono font-bold text-red-400">
              Recording {formatRecordingTime(recordingSeconds)}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={cancelRecording}
              className="p-2 rounded-full hover:bg-white/10 text-chat-textMuted hover:text-red-400 transition-colors"
              title="Cancel Recording"
            >
              <Trash2 className="w-5 h-5" />
            </button>
            <button
              onClick={stopRecording}
              className="px-4 py-2 rounded-full bg-red-500 hover:bg-red-600 text-white text-xs font-bold flex items-center gap-1.5 shadow-lg active:scale-95 transition-all"
            >
              <StopCircle className="w-4 h-4" />
              <span>Send Voice</span>
            </button>
          </div>
        </div>
      ) : (
        /* Standard Composer Input Row */
        <div className="px-3 py-2 flex items-end gap-2 flex-shrink-0">
          {/* Emoji Toggle */}
          <button
            type="button"
            onClick={() => {
              setShowEmoji(!showEmoji);
              setShowAttachMenu(false);
            }}
            className={`p-2 transition-colors rounded-full focus:outline-none ${
              showEmoji ? 'text-brand-400 bg-white/10' : 'text-chat-textMuted hover:text-brand-400'
            }`}
            title="Emoji"
          >
            <Smile className="w-6 h-6" />
          </button>

          {/* Attachment Paperclip Button */}
          <button
            type="button"
            onClick={() => {
              setShowAttachMenu(!showAttachMenu);
              setShowEmoji(false);
            }}
            className={`p-2 transition-colors rounded-full focus:outline-none ${
              showAttachMenu ? 'text-brand-400 bg-white/10' : 'text-chat-textMuted hover:text-brand-400'
            }`}
            title="Attach Media or File"
          >
            <Paperclip className="w-5 h-5 rotate-45" />
          </button>

          {/* Textarea Input */}
          <div className="flex-1 bg-chat-input rounded-2xl px-4 py-2 flex items-center min-h-[42px] border border-white/5 focus-within:border-brand-500/50 transition-all">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={pendingFile ? 'Add a caption...' : 'Type a message...'}
              disabled={disabled || isUploading}
              rows={1}
              className="w-full bg-transparent text-chat-textPrimary placeholder:text-chat-textMuted resize-none outline-none text-[15px] leading-relaxed max-h-[120px]"
            />
          </div>

          {/* Dynamic Send / Mic Action Button */}
          {text.trim() || pendingFile ? (
            <button
              type="button"
              onClick={handleSend}
              disabled={isUploading || disabled}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-all flex-shrink-0 shadow-md bg-brand-500 hover:bg-brand-600 text-white active:scale-95 ${
                isUploading ? 'opacity-50 cursor-wait' : ''
              }`}
              title="Send"
            >
              {isUploading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <Send className="w-5 h-5 ml-0.5" />
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={startRecording}
              disabled={disabled}
              className="w-11 h-11 rounded-full bg-brand-500/20 text-brand-400 hover:bg-brand-500 hover:text-white flex items-center justify-center transition-all flex-shrink-0 shadow-md active:scale-95"
              title="Record Voice Message"
            >
              <Mic className="w-5 h-5" />
            </button>
          )}
        </div>
      )}

      {/* Emoji Picker Drawer */}
      {showEmoji && (
        <EmojiPicker
          onSelect={(emoji) => setText((prev) => prev + emoji)}
          onClose={() => setShowEmoji(false)}
        />
      )}
    </div>
  );
};
