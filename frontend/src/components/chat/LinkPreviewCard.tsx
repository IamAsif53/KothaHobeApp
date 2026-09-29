import React, { useState, useEffect } from 'react';
import { ILinkPreview } from '../../types';
import { fetchLinkPreviewApi } from '../../api/messageApi';
import { openExternalUrl } from '../../services/nativeMediaService';
import { Globe, ExternalLink } from 'lucide-react';

interface LinkPreviewCardProps {
  url: string;
  initialPreview?: ILinkPreview;
  isMe?: boolean;
}

const previewLocalCache = new Map<string, ILinkPreview>();

const isInvalidTitle = (t?: string): boolean => {
  if (!t) return true;
  const lower = t.toLowerCase().trim();
  return (
    lower === 'error' ||
    lower === '404' ||
    lower === 'not found' ||
    lower === '404 not found' ||
    lower === 'access denied' ||
    lower === 'forbidden' ||
    lower === 'security check' ||
    lower === 'security check required' ||
    lower === 'log in to facebook' ||
    lower === 'attention required! | cloudflare'
  );
};

const getDisplayTitle = (preview: ILinkPreview, targetUrl: string): string => {
  if (preview.title && !isInvalidTitle(preview.title)) {
    return preview.title;
  }
  try {
    const parsed = new URL(targetUrl);
    const domain = preview.domain || parsed.hostname.replace(/^www\./, '');
    const pathClean = parsed.pathname.replace(/^\/+|\/+$/g, '');
    if (pathClean && pathClean.length < 35 && !pathClean.includes('=')) {
      return `${pathClean} · ${domain}`;
    }
    return domain;
  } catch {
    return preview.domain || targetUrl;
  }
};

export const LinkPreviewCard: React.FC<LinkPreviewCardProps> = ({
  url,
  initialPreview,
  isMe = false,
}) => {
  const [preview, setPreview] = useState<ILinkPreview | null>(() => {
    if (initialPreview && ((initialPreview.title && !isInvalidTitle(initialPreview.title)) || initialPreview.image)) {
      return initialPreview;
    }
    return previewLocalCache.get(url) || null;
  });
  const [loading, setLoading] = useState<boolean>(!preview);

  useEffect(() => {
    if (preview) return;

    let isMounted = true;
    const fetchPreview = async () => {
      try {
        const res = await fetchLinkPreviewApi(url);
        if (isMounted && res.success && res.preview) {
          previewLocalCache.set(url, res.preview);
          setPreview(res.preview);
        }
      } catch {
        // Fallback domain preview
        try {
          const parsed = new URL(url);
          const fallback: ILinkPreview = {
            url,
            domain: parsed.hostname.replace(/^www\./, ''),
          };
          if (isMounted) setPreview(fallback);
        } catch {}
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchPreview();

    return () => {
      isMounted = false;
    };
  }, [url, preview]);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    openExternalUrl(url);
  };

  if (loading) {
    return (
      <div className="mt-2 p-2.5 rounded-xl bg-chat-surfaceSecondary border border-chat-border/60 flex items-center gap-2 animate-pulse">
        <div className="w-8 h-8 rounded-lg bg-chat-surfaceTertiary shrink-0" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-3/4 bg-chat-surfaceTertiary rounded" />
          <div className="h-2 w-1/2 bg-chat-surfaceTertiary rounded" />
        </div>
      </div>
    );
  }

  if (!preview) return null;

  const displayTitle = getDisplayTitle(preview, url);

  return (
    <div
      onClick={handleClick}
      className={`mt-2 rounded-2xl overflow-hidden border transition-all cursor-pointer select-none group shadow-2xs ${
        isMe
          ? 'bg-black/8 dark:bg-black/25 border-black/10 dark:border-white/10 hover:bg-black/12'
          : 'bg-chat-surfaceSecondary hover:bg-chat-surfaceTertiary border-chat-border/70'
      }`}
    >
      {/* Top Banner Image if Available */}
      {preview.image && (
        <div className="relative w-full h-32 bg-chat-surfaceTertiary overflow-hidden">
          <img
            src={preview.image}
            alt={displayTitle || 'Link Preview'}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            loading="lazy"
            onError={(e) => {
              (e.target as HTMLElement).style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Content Area */}
      <div className="p-2.5 space-y-1">
        {/* Domain Badge */}
        <div className="flex items-center justify-between gap-1.5">
          <span className="text-[10.5px] font-bold text-emerald-700 dark:text-brand-400 flex items-center gap-1 truncate">
            <Globe className="w-3 h-3 shrink-0" />
            <span className="truncate">{preview.domain || new URL(url).hostname}</span>
          </span>
          <ExternalLink className="w-3 h-3 text-chat-textMuted shrink-0 opacity-70 group-hover:opacity-100 transition-opacity" />
        </div>

        {/* Title */}
        {displayTitle && (
          <h4 className="text-xs font-bold text-chat-textPrimary line-clamp-2 leading-snug">
            {displayTitle}
          </h4>
        )}

        {/* Description snippet */}
        {preview.description && (
          <p className="text-[11px] text-chat-textSecondary line-clamp-2 leading-normal">
            {preview.description}
          </p>
        )}
      </div>
    </div>
  );
};

