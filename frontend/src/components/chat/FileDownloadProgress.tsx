import React, { useEffect, useState, useCallback } from 'react';
import { Download, Check, RefreshCw, X, FileText, ExternalLink } from 'lucide-react';
import {
  fileCacheService,
  FileDownloadStatus,
  DownloadProgressEvent,
} from '../../services/localFileCacheService';

interface FileDownloadProgressProps {
  fileUrl: string;
  fileName: string;
  mimeType?: string;
  fileSize?: number;
  messageId?: string;
  isMe?: boolean;
  onOpen?: () => void;
  className?: string;
}

export const FileDownloadProgress: React.FC<FileDownloadProgressProps> = ({
  fileUrl,
  fileName,
  mimeType = 'application/pdf',
  fileSize = 0,
  messageId,
  isMe = false,
  onOpen,
  className = '',
}) => {
  const cacheKey = fileCacheService.getCacheKey(messageId || fileUrl, fileName);

  const [status, setStatus] = useState<FileDownloadStatus>(() => {
    return fileCacheService.getDownloadStatus(messageId || fileUrl, fileName).status;
  });

  const [progress, setProgress] = useState<number>(() => {
    return fileCacheService.getDownloadStatus(messageId || fileUrl, fileName).progress;
  });

  // Verify disk presence on native mount
  useEffect(() => {
    let isMounted = true;
    fileCacheService
      .verifyLocalFileExists(messageId || fileUrl, fileName)
      .then((res) => {
        if (isMounted) {
          setStatus(res.status);
          if (res.status === 'DOWNLOADED') {
            setProgress(100);
          }
        }
      })
      .catch(() => {});

    const unsubscribe = fileCacheService.subscribe((event: DownloadProgressEvent) => {
      if (event.key === cacheKey && isMounted) {
        setStatus(event.status);
        setProgress(event.progress);
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [cacheKey, messageId, fileUrl, fileName]);

  const handleActionClick = useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();

      if (status === 'DOWNLOADING') {
        // Cancel download
        fileCacheService.cancelDownload(messageId || fileUrl, fileName);
        return;
      }

      if (status === 'DOWNLOADED') {
        // Open file directly
        if (onOpen) {
          onOpen();
        } else {
          fileCacheService.openFile({
            fileUrl,
            fileName,
            mimeType,
            messageId,
          });
        }
        return;
      }

      // Start download
      await fileCacheService.downloadFile({
        fileUrl,
        fileName,
        mimeType,
        totalBytes: fileSize,
        messageId,
      });
    },
    [status, fileUrl, fileName, mimeType, fileSize, messageId, onOpen]
  );

  // SVG parameters for 36x36 circular ring
  const radius = 13;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (Math.min(100, Math.max(0, progress)) / 100) * circumference;

  return (
    <div
      onClick={handleActionClick}
      className={`relative flex items-center justify-center w-9 h-9 rounded-full cursor-pointer transition-transform active:scale-95 flex-shrink-0 select-none ${className}`}
      title={
        status === 'DOWNLOADING'
          ? `Downloading ${progress}% (tap to cancel)`
          : status === 'DOWNLOADED'
          ? 'File downloaded (tap to open)'
          : status === 'FAILED'
          ? 'Download failed (tap to retry)'
          : 'Download file'
      }
    >
      {/* 1. NOT DOWNLOADED STATE */}
      {status === 'NOT_DOWNLOADED' && (
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors shadow-xs ${
            isMe
              ? 'bg-black/15 text-chat-textPrimary hover:bg-black/25 dark:bg-white/15 dark:hover:bg-white/25'
              : 'bg-brand-500/15 text-brand-600 dark:text-brand-400 hover:bg-brand-500/25'
          }`}
        >
          <Download className="w-4 h-4 stroke-[2.4]" />
        </div>
      )}

      {/* 2. DOWNLOADING STATE (Live SVG Circular Progress) */}
      {status === 'DOWNLOADING' && (
        <div className="relative w-9 h-9 flex items-center justify-center group">
          <svg className="w-9 h-9 -rotate-90 transform" viewBox="0 0 36 36">
            {/* Background Track */}
            <circle
              cx="18"
              cy="18"
              r={radius}
              className="stroke-gray-300/40 dark:stroke-white/20"
              strokeWidth="2.8"
              fill="none"
            />
            {/* Animated Progress Ring */}
            <circle
              cx="18"
              cy="18"
              r={radius}
              className="stroke-brand-500 transition-[stroke-dashoffset] duration-150 ease-out"
              strokeWidth="2.8"
              strokeDasharray={circumference}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              fill="none"
            />
          </svg>

          {/* Center Indicator (Percentage or Cancel on hover) */}
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-[9px] font-bold font-mono text-brand-600 dark:text-brand-400 group-hover:hidden">
              {progress > 0 ? `${progress}%` : '...'}
            </span>
            <X className="w-3.5 h-3.5 text-rose-500 hidden group-hover:block stroke-[2.5]" />
          </div>
        </div>
      )}

      {/* 3. DOWNLOADED STATE */}
      {status === 'DOWNLOADED' && (
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center transition-colors shadow-xs ${
            isMe
              ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/30'
              : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25'
          }`}
        >
          <Check className="w-4 h-4 stroke-[2.8]" />
        </div>
      )}

      {/* 4. FAILED STATE */}
      {status === 'FAILED' && (
        <div className="w-9 h-9 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 hover:bg-rose-500/25 flex items-center justify-center shadow-xs">
          <RefreshCw className="w-4 h-4 stroke-[2.4]" />
        </div>
      )}
    </div>
  );
};
