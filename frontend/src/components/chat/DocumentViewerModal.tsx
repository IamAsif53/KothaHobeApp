import React, { useState } from 'react';
import { X, Download, FileText, ExternalLink, AlertCircle, Share2 } from 'lucide-react';
import { IMessage } from '../../types';
import { getMediaUrl } from '../../api/messageApi';

interface DocumentViewerModalProps {
  message: IMessage;
  onClose: () => void;
}

export const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({ message, onClose }) => {
  const [downloading, setDownloading] = useState(false);
  const [openError, setOpenError] = useState(false);

  const fullUrl = getMediaUrl(message.attachment?.url || '');
  const fileName = message.attachment?.fileName || 'document.pdf';
  const isPdf = fileName.toLowerCase().endsWith('.pdf') || message.attachment?.mimeType === 'application/pdf';

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDownload = async () => {
    try {
      setDownloading(true);
      const res = await fetch(fullUrl);
      const blob = await res.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('[DocViewer] Download failed:', err);
    } finally {
      setDownloading(false);
    }
  };

  const handleOpenExternal = () => {
    window.open(fullUrl, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/90 flex flex-col select-none animate-fade-in">
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
            <h4 className="text-sm font-semibold text-white truncate max-w-[220px]">
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
            className="px-3 py-1.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{downloading ? 'Downloading...' : 'Save'}</span>
          </button>
          <button
            onClick={handleOpenExternal}
            className="p-2 rounded-full hover:bg-white/10 text-chat-textMuted hover:text-white transition-colors"
            title="Open in Browser / External App"
          >
            <ExternalLink className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Viewer Content */}
      <div className="flex-1 w-full h-full bg-[#111b21] flex flex-col items-center justify-center p-2 overflow-hidden">
        {isPdf && !openError ? (
          <iframe
            src={`${fullUrl}#toolbar=0`}
            title={fileName}
            className="w-full h-full rounded-lg border-0 bg-white"
            onError={() => setOpenError(true)}
          />
        ) : (
          <div className="text-center p-6 space-y-4 max-w-sm">
            <div className="w-20 h-20 rounded-3xl bg-brand-500/10 border border-brand-500/20 mx-auto flex items-center justify-center text-brand-400 shadow-xl">
              <FileText className="w-10 h-10" />
            </div>

            <div>
              <h3 className="text-base font-bold text-white mb-1 truncate">{fileName}</h3>
              <p className="text-xs text-chat-textMuted">
                {formatFileSize(message.attachment?.size)} • {message.attachment?.mimeType || 'Document'}
              </p>
            </div>

            <p className="text-xs text-chat-textMuted leading-relaxed">
              Tap download below to save and open this document in your device's default reader app.
            </p>

            <button
              onClick={handleDownload}
              className="w-full bg-brand-500 hover:bg-brand-600 text-white font-semibold py-3 px-4 rounded-xl flex items-center justify-center gap-2 transition-all shadow-lg text-sm"
            >
              <Download className="w-4 h-4" />
              <span>Download Document</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
