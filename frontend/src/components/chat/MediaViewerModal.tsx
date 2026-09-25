import React, { useState } from 'react';
import { X, Download, Share2, ZoomIn, ZoomOut, RotateCcw, Check, Loader2 } from 'lucide-react';
import { IMessage } from '../../types';
import { getMediaUrl } from '../../api/messageApi';
import { formatMessageTime } from '../../utils/dateUtils';
import { saveImageToDevice } from '../../services/nativeMediaService';
import { ForwardMediaModal } from './ForwardMediaModal';

interface MediaViewerModalProps {
  message: IMessage;
  onClose: () => void;
}

export const MediaViewerModal: React.FC<MediaViewerModalProps> = ({ message, onClose }) => {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [showForwardModal, setShowForwardModal] = useState(false);

  const fullUrl = getMediaUrl(message.attachment?.url || '');
  const fileName = message.attachment?.fileName || `image_${Date.now()}.jpg`;

  const handleZoomIn = () => setScale((s) => Math.min(s + 0.3, 3));
  const handleZoomOut = () => setScale((s) => Math.max(s - 0.3, 0.5));
  const handleResetZoom = () => {
    setScale(1);
    setRotation(0);
  };
  const handleRotate = () => setRotation((r) => (r + 90) % 360);

  const handleSave = async () => {
    if (!message.attachment?.url || downloading) return;
    setDownloading(true);
    setSaveStatus('Saving to Photos/Gallery...');

    try {
      const res = await saveImageToDevice(message.attachment.url, fileName);
      setSaveStatus(res.message);
      setTimeout(() => setSaveStatus(null), 3500);
    } catch (err: any) {
      setSaveStatus(err?.message || 'Failed to save image');
      setTimeout(() => setSaveStatus(null), 3500);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/95 flex flex-col justify-between select-none animate-modal-enter">
        {/* Toast Notification */}
        {saveStatus && (
          <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-[#202c33] border border-white/20 text-white text-xs font-semibold shadow-2xl flex items-center gap-1.5 animate-fade-in pointer-events-none">
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span>{saveStatus}</span>
          </div>
        )}

        {/* Top Controls Bar */}
        <header className="px-3 pt-10 pb-3 flex items-center justify-between bg-gradient-to-b from-black/90 via-black/60 to-transparent z-10">
          <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
            <button
              onClick={onClose}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white flex-shrink-0 transition-all"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-semibold text-white truncate drop-shadow-md">
                {fileName}
              </h4>
              <span className="text-[11px] text-white/70">
                {formatMessageTime(message.createdAt)}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              onClick={handleZoomIn}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white transition-all"
              title="Zoom In"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={handleZoomOut}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white transition-all"
              title="Zoom Out"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={handleRotate}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white transition-all"
              title="Rotate 90°"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setShowForwardModal(true)}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white transition-all"
              title="Share to Chat"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleSave}
              disabled={downloading}
              className="p-2 rounded-full bg-brand-500 hover:bg-brand-600 active:scale-95 text-white disabled:opacity-50 transition-all flex items-center gap-1.5 text-xs font-semibold px-3 shadow-lg flex-shrink-0"
              title="Save to Device"
            >
              {downloading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span className="hidden sm:inline">{downloading ? 'Saving...' : 'Save'}</span>
            </button>
          </div>
        </header>

        {/* Image Display Area */}
        <div
          onDoubleClick={handleResetZoom}
          className="flex-1 flex items-center justify-center p-4 overflow-hidden"
        >
          <img
            src={fullUrl}
            alt={fileName}
            style={{
              transform: `scale(${scale}) rotate(${rotation}deg)`,
              transition: 'transform 150ms ease-out',
            }}
            className="max-h-[82vh] max-w-[95vw] object-contain rounded-lg shadow-2xl"
          />
        </div>

        {/* Bottom Caption (if any) */}
        {message.text && message.text.trim() && (
          <div className="px-6 py-4 bg-gradient-to-t from-black/90 to-transparent text-center text-sm text-white/90 z-10">
            <p className="max-w-xl mx-auto">{message.text}</p>
          </div>
        )}
      </div>

      {/* Share to Chat Modal */}
      {showForwardModal && (
        <ForwardMediaModal
          isOpen={showForwardModal}
          onClose={() => setShowForwardModal(false)}
          mediaUrl={message.attachment?.url || ''}
          fileName={fileName}
          type="image"
          attachment={message.attachment}
          initialCaption={message.text || ''}
        />
      )}
    </>
  );
};
