import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Avatar } from '../components/common/Avatar';
import { formatPhoneDisplay } from '../utils/phoneFormatter';
import { LogOut, User, Bell, Lock, Smartphone, Info, ChevronRight, ShieldCheck } from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="h-full w-full bg-chat-bg flex flex-col max-w-md mx-auto overflow-hidden">
      {/* Header */}
      <header className="px-4 py-3 bg-chat-panel border-b border-white/10 flex items-center justify-between flex-shrink-0">
        <h1 className="text-xl font-bold text-white tracking-tight">Settings</h1>
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* User Card */}
        <div
          onClick={() => navigate('/profile-setup')}
          className="bg-chat-card border border-white/10 rounded-2xl p-4 flex items-center gap-4 hover:bg-white/5 cursor-pointer transition-colors"
        >
          <Avatar
            src={user?.avatarUrl}
            name={user?.displayName || 'User'}
            isOnline={user?.isOnline}
            size="lg"
          />

          <div className="flex-1 min-w-0">
            <h2 className="text-base font-bold text-white truncate">{user?.displayName}</h2>
            <p className="text-xs font-mono text-chat-textMuted truncate">
              {formatPhoneDisplay(user?.phoneNumber || '')}
            </p>
          </div>

          <ChevronRight className="w-5 h-5 text-chat-textMuted flex-shrink-0" />
        </div>

        {/* Settings Sections */}
        <div className="bg-chat-card border border-white/10 rounded-2xl divide-y divide-white/5 overflow-hidden">
          <div
            onClick={() => navigate('/profile-setup')}
            className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-white/5 cursor-pointer transition-colors"
          >
            <User className="w-5 h-5 text-brand-400" />
            <div className="flex-1 text-sm font-semibold text-white">Edit Profile</div>
            <ChevronRight className="w-4 h-4 text-chat-textMuted" />
          </div>

          <div className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-white/5 cursor-pointer transition-colors">
            <Bell className="w-5 h-5 text-sky-400" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-white">Notifications</div>
              <div className="text-xs text-chat-textMuted">In-app sound & push alerts</div>
            </div>
            <ChevronRight className="w-4 h-4 text-chat-textMuted" />
          </div>

          <div className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-white/5 cursor-pointer transition-colors">
            <Lock className="w-5 h-5 text-emerald-400" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-white">Privacy</div>
              <div className="text-xs text-chat-textMuted">Online status & presence</div>
            </div>
            <ChevronRight className="w-4 h-4 text-chat-textMuted" />
          </div>

          <div className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-white/5 cursor-pointer transition-colors bg-brand-500/10 border-l-4 border-brand-400">
            <Smartphone className="w-5 h-5 text-brand-400" />
            <div className="flex-1">
              <div className="text-sm font-bold text-white flex items-center gap-2">
                <span>Release v1.0.1</span>
                <span className="text-[10px] bg-brand-500 text-white px-2 py-0.5 rounded-full uppercase font-bold">New</span>
              </div>
              <div className="text-xs text-chat-textMuted">In-App APK Auto-Updater Active</div>
            </div>
            <span className="text-[10px] font-mono bg-brand-500/20 text-brand-400 px-2 py-0.5 rounded-md font-semibold">
              Ready
            </span>
          </div>

          <div className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-white/5 cursor-pointer transition-colors">
            <Info className="w-5 h-5 text-indigo-400" />
            <div className="flex-1">
              <div className="text-sm font-semibold text-white">About Kotha Hobe</div>
              <div className="text-xs text-chat-textMuted">v1.0.0 • Mobile First Real-Time</div>
            </div>
          </div>
        </div>

        {/* Logout Action */}
        <button
          onClick={handleLogout}
          className="w-full bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-red-400 font-semibold py-3.5 px-4 rounded-2xl flex items-center justify-center gap-2 transition-all shadow-sm"
        >
          <LogOut className="w-5 h-5" />
          <span>Log Out</span>
        </button>

        <div className="flex items-center justify-center gap-1.5 text-xs text-chat-textMuted pt-2">
          <ShieldCheck className="w-4 h-4 text-brand-400" />
          <span>Kotha Hobe Messaging Engine</span>
        </div>
      </div>
    </div>
  );
};
