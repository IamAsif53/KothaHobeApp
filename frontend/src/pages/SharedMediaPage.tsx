import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchSharedMediaApi, getMediaUrl } from '../api/messageApi';
import { IMessage } from '../types';
import { useTheme } from '../context/ThemeContext';
import { MediaViewerModal } from '../components/chat/MediaViewerModal';
import { DocumentViewerModal } from '../components/chat/DocumentViewerModal';
import { VoiceMessagePlayer } from '../components/chat/VoiceMessagePlayer';
import {
  ArrowLeft,
  Image as ImageIcon,
  FileText,
  Mic,
  Download,
  ExternalLink,
  MessageSquare,
} from 'lucide-react';

export const SharedMediaPage: React.FC = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { themeConfig } = useTheme();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'media' | 'documents' | 'audio'>('media');
  const [items, setItems] = useState<IMessage[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [activeMediaModal, setActiveMediaModal] = useState<IMessage | null>(null);
  const [activeDocModal, setActiveDocModal] = useState<IMessage | null>(null);

  const loadCategory = async (tab: 'media' | 'documents' | 'audio') => {
    if (!conversationId) return;
    setLoading(true);
    try {
      const res = await fetchSharedMediaApi(conversationId, tab);
      if (res.success && res.items) {
        setItems(res.items);
      } else {
        setItems([]);
      }
    } catch (err) {
      console.warn('[SharedMedia] Load notice:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCategory(activeTab);
  }, [conversationId, activeTab]);

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div
      style={{ backgroundColor: themeConfig.bg }}
      className="h-full w-full flex flex-col max-w-md mx-auto overflow-hidden select-none transition-colors duration-200"
    >
      {/* Media / Doc Full-screen Modals */}
      {activeMediaModal && (
        <MediaViewerModal
          message={activeMediaModal}
          onClose={() => setActiveMediaModal(null)}
        />
      )}

      {activeDocModal && (
        <DocumentViewerModal
          message={activeDocModal}
          onClose={() => setActiveDocModal(null)}
        />
      )}

      {/* Header */}
      <header
        style={{ backgroundColor: themeConfig.panel }}
        className="px-4 pt-10 pb-2 border-b border-white/10 flex flex-col gap-3 flex-shrink-0"
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 rounded-full hover:bg-white/10 text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-white tracking-tight">Shared Content</h1>
        </div>

        {/* Category Tabs */}
        <div className="flex items-center justify-around border-t border-white/5 pt-1">
          <button
            onClick={() => setActiveTab('media')}
            className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'media'
                ? 'text-brand-400 border-brand-400'
                : 'text-chat-textMuted border-transparent hover:text-white'
            }`}
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span>Media</span>
          </button>

          <button
            onClick={() => setActiveTab('documents')}
            className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'documents'
                ? 'text-brand-400 border-brand-400'
                : 'text-chat-textMuted border-transparent hover:text-white'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Docs</span>
          </button>

          <button
            onClick={() => setActiveTab('audio')}
            className={`flex-1 py-2 text-xs font-semibold flex items-center justify-center gap-1.5 border-b-2 transition-all ${
              activeTab === 'audio'
                ? 'text-brand-400 border-brand-400'
                : 'text-chat-textMuted border-transparent hover:text-white'
            }`}
          >
            <Mic className="w-3.5 h-3.5" />
            <span>Voice</span>
          </button>
        </div>
      </header>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex items-center justify-center h-48 text-chat-textMuted text-xs">
            Loading shared {activeTab}...
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center p-6 text-chat-textMuted">
            <p className="text-xs">No {activeTab} shared in this conversation yet.</p>
          </div>
        ) : (
          <>
            {/* 1. Media Grid */}
            {activeTab === 'media' && (
              <div className="grid grid-cols-3 gap-1.5 animate-fade-in">
                {items.map((msg) => (
                  <div
                    key={msg._id}
                    onClick={() => setActiveMediaModal(msg)}
                    className="aspect-square bg-black/30 rounded-lg overflow-hidden relative cursor-pointer group"
                  >
                    <img
                      src={getMediaUrl(msg.attachment?.url || '')}
                      alt={msg.attachment?.fileName || 'Photo'}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* 2. Documents List */}
            {activeTab === 'documents' && (
              <div className="space-y-2 animate-fade-in">
                {items.map((msg) => (
                  <div
                    key={msg._id}
                    style={{ backgroundColor: themeConfig.card }}
                    onClick={() => setActiveDocModal(msg)}
                    className="border border-white/5 rounded-xl p-3 flex items-center justify-between hover:bg-white/5 cursor-pointer transition-colors shadow-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-brand-500/20 text-brand-400 flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm font-semibold text-white truncate block">
                          {msg.attachment?.fileName}
                        </span>
                        <span className="text-[11px] text-chat-textMuted">
                          {formatFileSize(msg.attachment?.size)} • {new Date(msg.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>

                    <Download className="w-4 h-4 text-chat-textMuted flex-shrink-0" />
                  </div>
                ))}
              </div>
            )}

            {/* 3. Audio List */}
            {activeTab === 'audio' && (
              <div className="space-y-3 animate-fade-in">
                {items.map((msg) => (
                  <div
                    key={msg._id}
                    style={{ backgroundColor: themeConfig.card }}
                    className="border border-white/5 rounded-2xl p-3 flex flex-col gap-2 shadow-sm"
                  >
                    <div className="flex items-center justify-between text-xs text-chat-textMuted">
                      <span>Voice Recording</span>
                      <span>{new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>

                    <VoiceMessagePlayer
                      audioUrl={msg.attachment?.url || ''}
                      duration={msg.attachment?.duration}
                      isMe={false}
                    />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
