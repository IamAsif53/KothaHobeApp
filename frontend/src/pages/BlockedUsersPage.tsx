import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getBlockedUsersApi, unblockUserApi } from '../api/userApi';
import { IUser } from '../types';
import { useTheme } from '../context/ThemeContext';
import { Avatar } from '../components/common/Avatar';
import { ArrowLeft, ShieldAlert, UserCheck, Search } from 'lucide-react';

export const BlockedUsersPage: React.FC = () => {
  const { themeConfig } = useTheme();
  const navigate = useNavigate();

  const [blockedUsers, setBlockedUsers] = useState<IUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const loadBlockedUsers = async () => {
    try {
      setLoading(true);
      const res = await getBlockedUsersApi();
      if (res.success && res.blockedUsers) {
        setBlockedUsers(res.blockedUsers);
      }
    } catch (err: any) {
      console.warn('[BlockedUsers] Load error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBlockedUsers();
  }, []);

  const handleUnblock = async (user: IUser) => {
    try {
      setUnblockingId(user._id);
      await unblockUserApi(user._id);
      setBlockedUsers((prev) => prev.filter((u) => u._id !== user._id));
      showToast(`${user.displayName || user.username || 'User'} has been unblocked`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to unblock user');
    } finally {
      setUnblockingId(null);
    }
  };

  return (
    <div
      style={{ backgroundColor: themeConfig.bg }}
      className="h-full w-full flex flex-col max-w-md mx-auto relative overflow-hidden transition-colors duration-200 select-none"
    >
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 bg-black/80 backdrop-blur-md border border-white/20 text-white text-xs px-4 py-2 rounded-full shadow-2xl animate-fade-in pointer-events-none">
          {toast}
        </div>
      )}

      {/* Top Header */}
      <header
        style={{ backgroundColor: themeConfig.panel }}
        className="px-4 pt-10 pb-3 border-b border-white/10 flex items-center justify-between flex-shrink-0"
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/settings')}
            className="p-1.5 rounded-full hover:bg-white/10 text-white transition-colors"
            title="Back to Settings"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold text-white tracking-tight">Blocked Accounts</h1>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        <p className="text-xs text-chat-textMuted leading-relaxed px-1">
          Blocked accounts cannot send you messages, initiate voice calls, or find your profile in search.
        </p>

        {loading ? (
          <div className="space-y-3 pt-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                style={{ backgroundColor: themeConfig.card }}
                className="h-16 rounded-2xl animate-pulse border border-white/5"
              />
            ))}
          </div>
        ) : blockedUsers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center p-6 space-y-3">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <UserCheck className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-semibold text-white">No Blocked Accounts</h3>
            <p className="text-xs text-chat-textMuted max-w-xs">
              You have not blocked any accounts. Blocked users will appear here where you can manage or unblock them.
            </p>
          </div>
        ) : (
          <div className="space-y-2 pt-2">
            {blockedUsers.map((u) => (
              <div
                key={u._id}
                style={{ backgroundColor: themeConfig.card }}
                className="flex items-center justify-between p-3.5 rounded-2xl border border-white/10 shadow-sm"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar
                    src={u.avatarUrl}
                    name={u.displayName || u.username || 'User'}
                    size="md"
                  />
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-white truncate">
                      {u.displayName || 'User'}
                    </h4>
                    {u.username && (
                      <p className="text-xs text-chat-textMuted truncate">@{u.username}</p>
                    )}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleUnblock(u)}
                  disabled={unblockingId === u._id}
                  className="px-3.5 py-1.5 rounded-xl bg-white/10 hover:bg-brand-500 text-white text-xs font-semibold active:scale-95 transition-all flex-shrink-0 disabled:opacity-50"
                >
                  {unblockingId === u._id ? 'Unblocking...' : 'Unblock'}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
