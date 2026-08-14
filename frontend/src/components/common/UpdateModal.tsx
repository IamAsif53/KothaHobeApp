import React, { useState } from 'react';
import {
  ReleaseManifest,
  checkInstallPermission,
  openInstallPermissionSettings,
  downloadAndInstallApk,
} from '../../services/appUpdateService';
import { Sparkles, Download, AlertTriangle, ShieldCheck, CheckCircle, ExternalLink } from 'lucide-react';

interface UpdateModalProps {
  manifest: ReleaseManifest;
  currentVersionName: string;
  onClose: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  manifest,
  currentVersionName,
  onClose,
}) => {
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [needsPermission, setNeedsPermission] = useState(false);
  const [error, setError] = useState('');

  const handleStartUpdate = async () => {
    setError('');
    const canInstall = await checkInstallPermission();

    if (!canInstall) {
      setNeedsPermission(true);
      return;
    }

    setDownloading(true);
    setProgress(0);

    try {
      await downloadAndInstallApk(manifest, (p) => {
        setProgress(p);
      });
    } catch (err: any) {
      setDownloading(false);
      if (err?.message === 'INSTALL_PERMISSION_REQUIRED') {
        setNeedsPermission(true);
      } else {
        setError(err?.message || 'Download failed. Please check network connection and retry.');
      }
    }
  };

  const handleGrantPermission = async () => {
    await openInstallPermissionSettings();
    setNeedsPermission(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none animate-fade-in">
      <div className="bg-chat-panel border border-white/10 rounded-3xl w-full max-w-sm p-6 shadow-2xl space-y-5 flex flex-col">
        {/* Header Icon */}
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-brand-500/20 border border-brand-500/30 flex items-center justify-center text-brand-400">
            <Sparkles className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-white leading-tight">New Update Available</h2>
              {manifest.mandatory && (
                <span className="text-[10px] bg-amber-500/20 text-amber-400 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Required
                </span>
              )}
            </div>
            <p className="text-xs text-chat-textMuted font-mono">
              v{currentVersionName} → <span className="text-brand-400 font-bold">v{manifest.versionName}</span>
            </p>
          </div>
        </div>

        {/* What's New List */}
        {manifest.releaseNotes && manifest.releaseNotes.length > 0 && (
          <div className="bg-chat-card/60 border border-white/5 rounded-2xl p-4 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-chat-textMuted">
              What's New
            </h3>
            <ul className="space-y-1.5 text-xs text-chat-textPrimary">
              {manifest.releaseNotes.map((note, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-brand-400 flex-shrink-0 mt-0.5" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Permission Banner */}
        {needsPermission && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 space-y-3">
            <div className="flex items-start gap-2.5 text-amber-400">
              <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed">
                <strong className="block text-white mb-0.5">Permission Required</strong>
                Android requires permission to install app updates from this source.
              </div>
            </div>

            <button
              onClick={handleGrantPermission}
              className="w-full bg-amber-500 hover:bg-amber-600 text-black font-bold text-xs py-2.5 px-3 rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-sm"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Allow Installation in Settings</span>
            </button>
          </div>
        )}

        {/* Download Progress Bar */}
        {downloading && (
          <div className="space-y-2 py-1">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-white">Downloading update...</span>
              <span className="text-brand-400 font-mono">{progress}%</span>
            </div>
            <div className="w-full h-3 bg-chat-input rounded-full overflow-hidden p-0.5 border border-white/5">
              <div
                className="h-full bg-gradient-to-r from-brand-600 to-brand-400 rounded-full transition-all duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Error Feedback */}
        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-1">
          {!manifest.mandatory && !downloading && (
            <button
              onClick={onClose}
              className="flex-1 bg-white/5 hover:bg-white/10 active:scale-[0.98] text-chat-textMuted font-semibold py-3 px-4 rounded-xl text-sm transition-all"
            >
              Later
            </button>
          )}

          <button
            onClick={handleStartUpdate}
            disabled={downloading}
            className="flex-1 bg-brand-500 hover:bg-brand-600 active:scale-[0.98] text-white font-semibold py-3 px-4 rounded-xl text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-50 shadow-lg shadow-brand-500/20"
          >
            {downloading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Download className="w-4 h-4" />
                <span>Update Now</span>
              </>
            )}
          </button>
        </div>

        <div className="flex items-center justify-center gap-1.5 text-[11px] text-chat-textMuted pt-1">
          <ShieldCheck className="w-3.5 h-3.5 text-brand-400" />
          <span>SHA-256 Verified Official Release</span>
        </div>
      </div>
    </div>
  );
};
