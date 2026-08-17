import React, { useState } from 'react';
import { X, Download, Share2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { IMessage } from '../../types';
import { getMediaUrl } from '../../api/messageApi';
import { formatMessageTime } from '../../utils/dateUtils';

interface MediaViewerModalProps {
  message: IMessage;
  onClose: () => void;
}

export const MediaViewerModal: React.FC<MediaViewerModalProps> = ({ message, onClose }) => {
  const [scale, setScale] = useState(1);
  const [downloading, setDownloading] = useState(false);

  const fullUrl = getMediaUrl(message.attachment?.url || '');

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.3, 3));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.3, 0.5));
  const handleResetZoom = () => setScale(1);

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const res = await fetch(fullUrl);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = message.attachment?.fileName || `image_${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('[MediaViewer] Download failed:', err);
    } finally {
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: message.attachment?.fileName || 'Image',
          url: fullUrl,
        });
      } catch {}
    } else {
      handleDownload();
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col justify-between select-none animate-fade-in">
      {/* Top Controls Bar */}
      <header className="px-4 pt-10 pb-3 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div>
            <h4 className="text-sm font-semibold text-white truncate max-w-[200px]">
              {message.attachment?.fileName || 'Photo'}
            </h4>
            <span className="text-[11px] text-white/60">
              {formatMessageTime(message.createdAt)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleZoomIn}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={handleZoomOut}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleResetZoom}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Reset Zoom"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            onClick={handleShare}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
            title="Share"
          >
            <Share2 className="w-4 h-4" />
          </button>
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="p-2 rounded-full bg-brand-500 hover:bg-brand-600 text-white transition-colors disabled:opacity-50 flex items-center gap-1 text-xs font-semibold px-3"
            title="Download"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">{downloading ? 'Saving...' : 'Save'}</span>
          </button>
        </div>
      </header>

      {/* Image Display Area */}
      <div className="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <img
          src={fullUrl}
          alt={message.attachment?.fileName || 'Media'}
          style={{ transform: `scale(${scale})` }}
          className="max-h-[85vh] max-w-[95vw] object-contain transition-transform duration-150 rounded-lg shadow-2xl"
        />
      </div>

      {/* Bottom Caption (if any) */}
      {message.text && message.text.trim() && (
        <div className="px-6 py-4 bg-gradient-to-t from-black/90 to-transparent text-center text-sm text-white/90">
          <p className="max-w-xl mx-auto">{message.text}</p>
        </div>
      )}
    </div>
  );
};
