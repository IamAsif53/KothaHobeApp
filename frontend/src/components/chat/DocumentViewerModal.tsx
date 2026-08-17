import React, { useState } from 'react';
import { X, Download, FileText, ExternalLink, AlertCircle, Share2, Check } from 'lucide-react';
import { IMessage } from '../../types';
import { getMediaUrl } from '../../api/messageApi';
import { downloadDocumentToDevice, openDocumentInNativeApp } from '../../services/nativeMediaService';

interface DocumentViewerModalProps {
  message: IMessage;
  onClose: () => void;
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({ message, onClose }) => {
  const [downloading, setDownloading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const fullUrl = getMediaUrl(message.attachment?.url || '');
  const fileName = message.attachment?.fileName || 'document.pdf';
  const mimeType = message.attachment?.mimeType || 'application/pdf';

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDownload = async () => {
    if (!message.attachment?.url || downloading) return;
    setDownloading(true);
    setStatusMessage('Downloading to device...');

    try {
      const res = await downloadDocumentToDevice(message.attachment.url, fileName, mimeType);
      setStatusMessage(res.message);
      setTimeout(() => setStatusMessage(null), 3500);
    } catch (err: any) {
      setStatusMessage(err?.message || 'Download failed');
      setTimeout(() => setStatusMessage(null), 3500);
    } finally {
      setDownloading(false);
    }
  };

  const handleOpenNative = async () => {
    if (!message.attachment?.url) return;
    setStatusMessage('Opening in default app...');
    const res = await openDocumentInNativeApp(message.attachment.url, fileName, mimeType);
    if (!res.success) {
      setStatusMessage(res.error === 'NO_APP' ? 'No compatible reader app found on device' : (res.error || 'Failed to open document'));
      setTimeout(() => setStatusMessage(null), 3500);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col select-none animate-fade-in">
      {/* Toast Notification */}
      {statusMessage && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-[#202c33] border border-white/20 text-white text-xs font-semibold shadow-2xl flex items-center gap-1.5 animate-fade-in">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span>{statusMessage}</span>
        </div>
      )}

      {/* Top Header */}
      <header className="px-4 pt-10 pb-3 flex items-center justify-between bg-chat-panel border-b border-white/10 z-10">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/10 text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h4 className="text-sm font-semibold text-white truncate max-w-[200px]">
              {fileName}
            </h4>
            <span className="text-[11px] text-chat-textMuted">
              {formatFileSize(message.attachment?.size)}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownload}
            disabled={downloading}
            className="px-3 py-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-md active:scale-95"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{downloading ? 'Saving...' : 'Save'}</span>
          </button>
          <button
            onClick={handleOpenNative}
            className="p-2 rounded-full hover:bg-white/10 text-chat-textMuted hover:text-white transition-colors"
            title="Open in Native App"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content Card */}
      <div className="flex-1 w-full h-full bg-[#111b21] flex flex-col items-center justify-center p-6 text-center">
        <div className="w-24 h-24 rounded-3xl bg-brand-500/10 border border-brand-500/20 flex items-center justify-center text-brand-400 shadow-xl mb-4">
          <FileText className="w-12 h-12" />
        </div>

        <h3 className="text-base font-bold text-white mb-1 truncate max-w-xs">{fileName}</h3>
        <p className="text-xs text-chat-textMuted mb-6">
          {formatFileSize(message.attachment?.size)} • {mimeType}
        </p>

        <div className="w-full max-w-xs space-y-3">
          <button
            onClick={handleOpenNative}
            className="w-full bg-brand-500 hover:bg-brand-600 active:scale-95 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg text-sm"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Open in Reader App</span>
          </button>

          <button
            onClick={handleDownload}
            disabled={downloading}
            className="w-full bg-white/10 hover:bg-white/15 active:scale-95 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all text-sm border border-white/5"
          >
            <Download className="w-4 h-4" />
            <span>{downloading ? 'Downloading...' : 'Save to Downloads'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
