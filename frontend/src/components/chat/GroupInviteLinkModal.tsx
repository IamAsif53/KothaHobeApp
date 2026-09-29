import React, { useState } from 'react';
import { X, Copy, Check, Share2, RefreshCw, QrCode, Sparkles } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { resetGroupInviteLinkApi } from '../../api/groupApi';
import { ShareGroupLinkModal } from './ShareGroupLinkModal';

interface GroupInviteLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
  inviteCode?: string;
  isAdmin: boolean;
  onInviteCodeChanged: (newCode: string) => void;
}

export const GroupInviteLinkModal: React.FC<GroupInviteLinkModalProps> = ({
  isOpen,
  onClose,
  groupId,
  groupName,
  inviteCode,
  isAdmin,
  onInviteCodeChanged,
}) => {
  const { themeConfig } = useTheme();
  const isDark = !themeConfig.isLight;
  const [copied, setCopied] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const canonicalBase = 'https://kotha-hobe-api.onrender.com/join';
  const inviteUrl = inviteCode ? `${canonicalBase}/${inviteCode}` : '';
  
  // High-resolution scan-ready QR code (dark pixels on crisp white background)
  const qrCodeUrl = inviteUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(inviteUrl)}&size=320x320&bgcolor=ffffff&color=0284c7&margin=12`
    : '';

  const handleCopy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      setError('Failed to copy to clipboard');
    }
  };

  const handleResetLink = async () => {
    if (!isAdmin) return;
    const confirmReset = window.confirm(
      'Are you sure you want to reset the invite link? The old link and QR code will immediately stop working.'
    );
    if (!confirmReset) return;

    setIsResetting(true);
    setError(null);
    try {
      const res = await resetGroupInviteLinkApi(groupId);
      if (res.success && res.inviteCode) {
        onInviteCodeChanged(res.inviteCode);
      } else {
        setError(res.message || 'Failed to reset invite link');
      }
    } catch (err: any) {
      setError(err?.message || 'Error resetting invite link');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
        <div className="w-full max-w-md bg-chat-panel border border-chat-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-chat-border">
            <div className="flex items-center gap-2">
              <div className="p-2 bg-brand-500/10 text-brand-500 rounded-lg">
                <Share2 className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-bold text-chat-textPrimary">Invite to Group</h3>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-chat-textMuted hover:text-chat-textPrimary hover:bg-chat-card transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="p-5 space-y-5 max-h-[80vh] overflow-y-auto">
            {error && (
              <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-500 text-xs font-medium">
                {error}
              </div>
            )}

            {/* Link Section */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-chat-textMuted uppercase tracking-wider">
                Canonical Invite Link
              </label>
              <div className="flex items-center gap-2 p-3 bg-chat-card border border-chat-border rounded-xl">
                <span className="flex-1 text-sm font-mono text-chat-textPrimary truncate select-all">
                  {inviteUrl || 'Generating link...'}
                </span>
                <button
                  onClick={handleCopy}
                  disabled={!inviteUrl}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 active:scale-95 text-white text-xs font-semibold rounded-lg transition-all shadow-sm shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
              <p className="text-xs text-chat-textMuted">
                Anyone with this link or QR code can enter or request to join <b>{groupName}</b>.
              </p>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setIsShareModalOpen(true)}
                disabled={!inviteUrl}
                className="flex items-center justify-center gap-2 py-2.5 px-4 bg-brand-500 hover:bg-brand-600 active:scale-95 text-white text-sm font-semibold rounded-xl transition-all shadow-md shadow-brand-500/20"
              >
                <Share2 className="w-4 h-4" />
                <span>Share Link</span>
              </button>
              <button
                onClick={() => setShowQR(!showQR)}
                disabled={!inviteUrl}
                className="flex items-center justify-center gap-2 py-2.5 px-4 bg-chat-card hover:bg-chat-border/50 active:scale-95 border border-chat-border text-chat-textPrimary text-sm font-medium rounded-xl transition-all"
              >
                <QrCode className="w-4 h-4 text-brand-500" />
                <span>{showQR ? 'Hide QR' : 'QR Code'}</span>
              </button>
            </div>

            {/* QR Code Display */}
            {showQR && (
              <div className="flex flex-col items-center justify-center p-4 bg-chat-card border border-chat-border rounded-2xl animate-fadeIn">
                <div className="p-3 bg-white rounded-2xl shadow-lg border border-slate-200">
                  <img
                    src={qrCodeUrl}
                    alt="Group Invite QR Code"
                    className="w-52 h-52 object-contain rounded-xl"
                  />
                </div>
                <p className="mt-3 text-xs text-chat-textMuted text-center font-medium">
                  Scan with any camera or QR scanner to preview and join <b>{groupName}</b>
                </p>
              </div>
            )}

            {/* Reset Invite Link (Admin Only) */}
            {isAdmin && (
              <div className="pt-2 border-t border-chat-border">
                <button
                  onClick={handleResetLink}
                  disabled={isResetting}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-red-500 hover:bg-red-500/10 active:scale-95 border border-red-500/30 rounded-xl transition-all"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
                  <span>{isResetting ? 'Resetting Link...' : 'Reset Invite Link'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Share Link Destination Picker Modal */}
      {isShareModalOpen && (
        <ShareGroupLinkModal
          isOpen={isShareModalOpen}
          onClose={() => setIsShareModalOpen(false)}
          groupId={groupId}
          groupName={groupName}
          inviteUrl={inviteUrl}
        />
      )}
    </>
  );
};
