import React, { useState } from 'react';
import { X, Copy, Check, Share2, RefreshCw, ShieldAlert, ShieldCheck, QrCode } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';
import { resetGroupInviteLinkApi, updateGroupPrivacyApi } from '../../api/groupApi';

interface GroupInviteLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
  inviteCode?: string;
  requiresApproval?: boolean;
  isAdmin: boolean;
  onInviteCodeChanged: (newCode: string) => void;
  onPrivacyChanged: (requiresApproval: boolean) => void;
}

export const GroupInviteLinkModal: React.FC<GroupInviteLinkModalProps> = ({
  isOpen,
  onClose,
  groupId,
  groupName,
  inviteCode,
  requiresApproval = false,
  isAdmin,
  onInviteCodeChanged,
  onPrivacyChanged,
}) => {
  const { themeConfig } = useTheme();
  const isDark = !themeConfig.isLight;
  const [copied, setCopied] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isUpdatingPrivacy, setIsUpdatingPrivacy] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const origin = window.location.origin;
  const inviteUrl = inviteCode ? `${origin}/join/${inviteCode}` : '';
  const qrCodeUrl = inviteUrl
    ? `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(inviteUrl)}&size=240x240&bgcolor=${isDark ? '1e293b' : 'ffffff'}&color=${isDark ? '38bdf8' : '0284c7'}&margin=8`
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

  const handleShare = async () => {
    if (!inviteUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Join "${groupName}" on Kotha Hobe`,
          text: `You've been invited to join the group "${groupName}" on Kotha Hobe!`,
          url: inviteUrl,
        });
      } catch (err) {
        // Share cancelled or failed
      }
    } else {
      handleCopy();
    }
  };

  const handleResetLink = async () => {
    if (!isAdmin) return;
    const confirmReset = window.confirm(
      'Are you sure you want to reset the invite link? The old link will immediately stop working.'
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

  const handleToggleApproval = async () => {
    if (!isAdmin) return;
    const nextVal = !requiresApproval;
    setIsUpdatingPrivacy(true);
    setError(null);
    try {
      const res = await updateGroupPrivacyApi(groupId, nextVal);
      if (res.success) {
        onPrivacyChanged(nextVal);
      } else {
        setError(res.message || 'Failed to update privacy settings');
      }
    } catch (err: any) {
      setError(err?.message || 'Error updating privacy settings');
    } finally {
      setIsUpdatingPrivacy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md bg-chat-panel border border-chat-border rounded-2xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-chat-border">
          <h3 className="text-lg font-bold text-chat-textPrimary">Invite to Group</h3>
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
              Shareable Invite Link
            </label>
            <div className="flex items-center gap-2 p-3 bg-chat-card border border-chat-border rounded-xl">
              <span className="flex-1 text-sm font-mono text-chat-textPrimary truncate select-all">
                {inviteUrl || 'Generating link...'}
              </span>
              <button
                onClick={handleCopy}
                disabled={!inviteUrl}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 active:scale-95 text-white text-xs font-semibold rounded-lg transition-all shadow-sm"
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
              Anyone with this link can join or request to join this group.
            </p>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleShare}
              disabled={!inviteUrl}
              className="flex items-center justify-center gap-2 py-2.5 px-4 bg-chat-card hover:bg-chat-border/50 active:scale-95 border border-chat-border text-chat-textPrimary text-sm font-medium rounded-xl transition-all"
            >
              <Share2 className="w-4 h-4 text-brand-500" />
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
              <div className="p-3 bg-white rounded-xl shadow-md">
                <img
                  src={qrCodeUrl}
                  alt="Group Invite QR Code"
                  className="w-48 h-48 object-contain rounded-lg"
                />
              </div>
              <p className="mt-3 text-xs text-chat-textMuted text-center">
                Scan with any camera or QR scanner to join <b>{groupName}</b>
              </p>
            </div>
          )}

          {/* Admin Privacy Settings */}
          {isAdmin && (
            <div className="pt-2 border-t border-chat-border space-y-4">
              <div className="flex items-center justify-between gap-4 p-3.5 bg-chat-card/60 border border-chat-border rounded-xl">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-brand-500/10 text-brand-500 mt-0.5">
                    {requiresApproval ? (
                      <ShieldAlert className="w-5 h-5" />
                    ) : (
                      <ShieldCheck className="w-5 h-5" />
                    )}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-chat-textPrimary">
                      Admin Approval Required
                    </h4>
                    <p className="text-xs text-chat-textMuted mt-0.5">
                      {requiresApproval
                        ? 'New members must be approved by an admin before joining'
                        : 'Anyone with the invite link joins immediately'}
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleToggleApproval}
                  disabled={isUpdatingPrivacy}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    requiresApproval ? 'bg-brand-500' : 'bg-chat-border'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      requiresApproval ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Reset Invite Link */}
              <button
                onClick={handleResetLink}
                disabled={isResetting}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 text-xs font-semibold text-red-500 hover:bg-red-500/10 active:scale-95 border border-red-500/30 rounded-xl transition-all"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
                <span>{isResetting ? 'Resetting...' : 'Reset Invite Link'}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
