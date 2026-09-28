import React, { useState } from 'react';
import { X, Shield, MessageSquare, UserPlus, Edit3, Pin, BarChart2, Check, Loader2 } from 'lucide-react';
import { IGroupPermissions } from '../../types';
import { updateGroupPermissionsApi } from '../../api/groupApi';

interface GroupPermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  initialPermissions?: IGroupPermissions;
  onPermissionsUpdated: (permissions: IGroupPermissions) => void;
}

export const GroupPermissionsModal: React.FC<GroupPermissionsModalProps> = ({
  isOpen,
  onClose,
  groupId,
  initialPermissions,
  onPermissionsUpdated,
}) => {
  const [permissions, setPermissions] = useState<IGroupPermissions>({
    sendMessages: initialPermissions?.sendMessages ?? 'all',
    addMembers: initialPermissions?.addMembers ?? 'all',
    editGroupInfo: initialPermissions?.editGroupInfo ?? 'admins',
    pinMessages: initialPermissions?.pinMessages ?? 'admins',
    createPolls: initialPermissions?.createPolls ?? 'all',
    createEvents: initialPermissions?.createEvents ?? 'all',
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const togglePermission = (key: keyof IGroupPermissions) => {
    setPermissions((prev) => ({
      ...prev,
      [key]: prev[key] === 'all' ? 'admins' : 'all',
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await updateGroupPermissionsApi(groupId, permissions);
      if (res.success && res.permissions) {
        onPermissionsUpdated(res.permissions);
        onClose();
      } else {
        setError(res.message || 'Failed to save permissions');
      }
    } catch (err: any) {
      setError(err?.message || 'Error updating permissions');
    } finally {
      setSaving(false);
    }
  };

  const permissionItems = [
    {
      key: 'sendMessages' as keyof IGroupPermissions,
      icon: MessageSquare,
      title: 'Send Messages',
      desc: 'Choose who can post messages and media to the group.',
    },
    {
      key: 'addMembers' as keyof IGroupPermissions,
      icon: UserPlus,
      title: 'Add Other Members',
      desc: 'Allow regular members to add new people to the group.',
    },
    {
      key: 'editGroupInfo' as keyof IGroupPermissions,
      icon: Edit3,
      title: 'Edit Group Info',
      desc: 'Allow members to change the group name, avatar, and description.',
    },
    {
      key: 'pinMessages' as keyof IGroupPermissions,
      icon: Pin,
      title: 'Pin Messages',
      desc: 'Allow members to pin and unpin chat messages.',
    },
    {
      key: 'createPolls' as keyof IGroupPermissions,
      icon: BarChart2,
      title: 'Create Group Polls',
      desc: 'Allow members to initiate community polls and voting.',
    },
    {
      key: 'createEvents' as keyof IGroupPermissions,
      icon: BarChart2,
      title: 'Create Group Events',
      desc: 'Allow members to schedule group meetups and calendar events.',
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md bg-chat-panel border border-chat-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-chat-border">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-brand-500/10 text-brand-500 rounded-lg">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-chat-textPrimary">Group Permissions</h3>
              <p className="text-xs text-chat-textMuted">Control what regular members can do</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-chat-textMuted hover:text-chat-textPrimary hover:bg-chat-card transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Permission Toggles */}
        <div className="p-5 space-y-3.5 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-500 text-xs font-medium">
              {error}
            </div>
          )}

          {permissionItems.map((item) => {
            const Icon = item.icon;
            const isAll = permissions[item.key] === 'all';

            return (
              <div
                key={item.key}
                onClick={() => togglePermission(item.key)}
                className="flex items-center justify-between p-3.5 bg-chat-card border border-chat-border rounded-xl cursor-pointer hover:border-brand-500/30 transition-all select-none"
              >
                <div className="flex items-start gap-3 min-w-0 pr-3">
                  <div className="p-2 rounded-lg bg-chat-panel text-brand-500 mt-0.5 shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-sm font-semibold text-chat-textPrimary">{item.title}</h4>
                    <p className="text-xs text-chat-textMuted mt-0.5 leading-snug">{item.desc}</p>
                    <span className="inline-block mt-1.5 text-[11px] font-bold text-brand-500">
                      {isAll ? 'All Members' : 'Admins Only'}
                    </span>
                  </div>
                </div>

                {/* Toggle switch */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    togglePermission(item.key);
                  }}
                  className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                    isAll ? 'bg-brand-500' : 'bg-chat-border'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      isAll ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-chat-border flex items-center justify-end gap-2 bg-chat-panel">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-chat-textMuted hover:text-chat-textPrimary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-brand-500 hover:bg-brand-600 active:scale-95 text-white text-sm font-semibold rounded-xl transition-all shadow-md disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            <span>{saving ? 'Saving...' : 'Save Permissions'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
