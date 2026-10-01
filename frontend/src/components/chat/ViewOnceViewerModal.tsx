import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Eye, Lock, Loader2, Play, Pause } from 'lucide-react';
import { IMessage } from '../../types';
import { getMediaUrl, openViewOnceMessageApi } from '../../api/messageApi';
import { setNativeSecureWindow } from '../../services/nativeMediaService';
import { modalStack } from '../../utils/modalStack';

interface ViewOnceViewerModalProps {
  message: IMessage;
  onClose: () => void;
  onOpened?: (messageId: string, openedAt: string) => void;
}

export const ViewOnceViewerModal: React.FC<ViewOnceViewerModalProps> = ({
  message,
  onClose,
  onOpened,
}) => {
  const [loading, setLoading] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const openedCalledRef = useRef(false);

  // Close handler with secure window teardown
  const handleClose = useCallback(() => {
    setNativeSecureWindow(false);
    onClose();
  }, [onClose]);

  useEffect(() => {
    // 1. Enable Android FLAG_SECURE window protection
    setNativeSecureWindow(true);

    // 2. Register modal in back navigation stack
    const unregister = modalStack.register('view_once_viewer', handleClose);

    // 3. Atomically mark as opened on server
    if (!openedCalledRef.current && message._id && !message._id.startsWith('temp_')) {
      openedCalledRef.current = true;
      setLoading(true);
      openViewOnceMessageApi(message._id)
        .then((res) => {
          if (res.success) {
            onOpened?.(message._id, res.openedAt || new Date().toISOString());
          }
        })
        .catch((err) => {
          console.warn('[ViewOnce] Error opening view once message:', err);
        })
        .finally(() => {
          setLoading(false);
        });
    }

    return () => {
      // Restore normal window security flag
      setNativeSecureWindow(false);
      unregister();
    };
  }, [message._id, handleClose, onOpened]);

  const mediaUrl = getMediaUrl(message.attachment?.url || '');
  const isVideo =
    message.type === 'video' ||
    message.attachment?.mimeType?.startsWith('video/') ||
    /\.(mp4|mov|webm|mkv|3gp)$/i.test(message.attachment?.fileName || message.attachment?.url || '');

  const togglePlayPause = () => {
    if (videoRef.current) {
      if (videoRef.current.paused) {
        videoRef.current.play();
        setIsPlaying(true);
      } else {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col justify-between select-none animate-fade-in"
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Top Header Bar */}
      <header className="px-3 pt-10 pb-3 flex items-center justify-between bg-gradient-to-b from-black/90 via-black/60 to-transparent z-10">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button
            onClick={handleClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white transition-all"
            title="Close and destroy view once media"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="w-5 h-5 rounded-full bg-brand-500/30 border border-brand-500 text-brand-400 flex items-center justify-center text-[10px] font-bold">
                1
              </span>
              <h4 className="text-sm font-semibold text-white truncate">
                View Once {isVideo ? 'Video' : 'Photo'}
              </h4>
            </div>
            <p className="text-[11px] text-white/60 flex items-center gap-1 mt-0.5">
              <Lock className="w-3 h-3 text-amber-400 inline" />
              <span>Protected • Closes permanently after exiting</span>
            </p>
          </div>
        </div>

        {loading && <Loader2 className="w-4 h-4 text-brand-400 animate-spin mr-2" />}
      </header>

      {/* Main Protected Media Viewport */}
      <div
        className="flex-1 flex items-center justify-center p-2 overflow-hidden relative"
        onClick={isVideo ? togglePlayPause : undefined}
      >
        {isVideo ? (
          <div className="relative max-h-full max-w-full flex items-center justify-center">
            <video
              ref={videoRef}
              src={mediaUrl}
              autoPlay
              playsInline
              controls={false}
              onEnded={() => setIsPlaying(false)}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              className="max-h-[80vh] max-w-[95vw] object-contain rounded-lg shadow-2xl"
            />
            {!isPlaying && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-lg">
                <div className="w-16 h-16 rounded-full bg-black/70 backdrop-blur-sm flex items-center justify-center text-white border border-white/20 shadow-xl">
                  <Play className="w-8 h-8 ml-1 text-white fill-white" />
                </div>
              </div>
            )}
          </div>
        ) : (
          <img
            src={mediaUrl}
            alt="View Once Media"
            draggable={false}
            className="max-h-[82vh] max-w-[95vw] object-contain rounded-lg shadow-2xl pointer-events-none select-none"
            onContextMenu={(e) => e.preventDefault()}
          />
        )}
      </div>

      {/* Bottom Text / Caption Bar */}
      {message.text && message.text.trim() && (
        <div className="px-6 py-4 bg-gradient-to-t from-black/90 to-transparent text-center text-sm text-white/90 z-10">
          <p className="max-w-xl mx-auto">{message.text}</p>
        </div>
      )}
    </div>
  );
};
