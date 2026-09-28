import React, { useState } from 'react';
import {
  X,
  MessageSquare,
  Crown,
  Shield,
  ShieldCheck,
  UserX,
  Tag,
  ArrowRightLeft,
  Loader2,
  CheckCircle,
} from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { IUser, GroupRole } from '../../types';
import {
  updateMemberRoleApi,
  removeGroupMemberApi,
  transferGroupOwnershipApi,
} from '../../api/groupApi';

interface GroupMemberActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  targetUser: IUser | null;
  targetRole: GroupRole;
  targetNickname?: string | null;
  callerUserId: string;
  isCallerCreator: boolean;
  isCallerAdmin: boolean;
  isCallerModerator: boolean;
  onOpenDirectChat: (user: IUser) => void;
  onOpenNicknameModal: (user: IUser) => void;
  onMemberUpdated: () => void;
}

export const GroupMemberActionSheet: React.FC<GroupMemberActionSheetProps> = ({
  isOpen,
  onClose,
  groupId,
  targetUser,
  targetRole,
  targetNickname,
  callerUserId,
  isCallerCreator,
  isCallerAdmin,
  isCallerModerator,
  onOpenDirectChat,
  onOpenNicknameModal,
  onMemberUpdated,
}) => {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showTransferConfirm, setShowTransferConfirm] = useState(false);

  if (!isOpen || !targetUser) return null;

  const isSelf = targetUser._id === callerUserId;
  const isTargetCreator = targetRole === 'creator';
  const isTargetAdmin = targetRole === 'admin';
  const isTargetModerator = targetRole === 'moderator';

  // Can manage roles if: caller is creator OR (caller is admin and target is not creator/admin)
  const canManageRoles = isCallerCreator || (isCallerAdmin && !isTargetCreator && !isTargetAdmin);

  // Can remove member if: caller is creator OR (caller is admin and target not creator) OR (caller is mod and target is member)
  const canRemove =
    !isSelf &&
    !isTargetCreator &&
    (isCallerCreator ||
      (isCallerAdmin && !isTargetCreator) ||
      (isCallerModerator && !isTargetAdmin && !isTargetModerator));

  const handleRoleChange = async (newRole: 'admin' | 'moderator' | 'member') => {
    setLoadingAction(`role_${newRole}`);
    setError(null);
    try {
      const res = await updateMemberRoleApi(groupId, targetUser._id, newRole);
      if (res.success) {
        onMemberUpdated();
        onClose();
      } else {
        setError(res.message || 'Failed to update role');
      }
    } catch (err: any) {
      setError(err?.message || 'Error updating member role');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRemoveMember = async () => {
    const confirmRemove = window.confirm(
      `Are you sure you want to remove ${targetUser.displayName || targetUser.username} from this group?`
    );
    if (!confirmRemove) return;

    setLoadingAction('remove');
    setError(null);
    try {
      const res = await removeGroupMemberApi(groupId, targetUser._id);
      if (res.success) {
        onMemberUpdated();
        onClose();
      } else {
        setError(res.message || 'Failed to remove member');
      }
    } catch (err: any) {
      setError(err?.message || 'Error removing member');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleTransferOwnership = async () => {
    setLoadingAction('transfer');
    setError(null);
    try {
      const res = await transferGroupOwnershipApi(groupId, targetUser._id);
      if (res.success) {
        setShowTransferConfirm(false);
        onMemberUpdated();
        onClose();
      } else {
        setError(res.message || 'Failed to transfer ownership');
      }
    } catch (err: any) {
      setError(err?.message || 'Error transferring ownership');
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full sm:max-w-md bg-chat-panel border-t sm:border border-chat-border rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header / User Card */}
        <div className="relative p-5 pb-4 border-b border-chat-border">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-chat-textMuted hover:text-chat-textPrimary hover:bg-chat-card transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3.5 pr-8">
            <Avatar
              src={targetUser.avatarUrl || ''}
              name={targetUser.displayName || targetUser.username || 'User'}
              size="lg"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-base font-bold text-chat-textPrimary truncate">
                  {targetUser.displayName || targetUser.username}
                </h3>
                {/* Role Badge */}
                {isTargetCreator && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-500 border border-amber-500/20">
                    <Crown className="w-3 h-3" />
                    Creator
                  </span>
                )}
                {isTargetAdmin && !isTargetCreator && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                    <ShieldCheck className="w-3 h-3" />
                    Admin
                  </span>
                )}
                {isTargetModerator && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/10 text-blue-500 border border-blue-500/20">
                    <Shield className="w-3 h-3" />
                    Moderator
                  </span>
                )}
              </div>
              <p className="text-xs text-chat-textMuted truncate">@{targetUser.username}</p>
              {targetNickname && (
                <p className="text-xs text-brand-500 font-medium mt-0.5 truncate">
                  Nickname: "{targetNickname}"
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Content Actions */}
        <div className="p-4 space-y-2 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-500 text-xs font-medium mb-2">
              {error}
            </div>
          )}

          {/* Direct Message (if not self) */}
          {!isSelf && (
            <button
              onClick={() => {
                onClose();
                onOpenDirectChat(targetUser);
              }}
              className="w-full flex items-center gap-3 p-3 bg-chat-card hover:bg-chat-border/50 active:scale-[0.99] border border-chat-border rounded-xl text-chat-textPrimary text-sm font-medium transition-all"
            >
              <div className="p-2 rounded-lg bg-brand-500/10 text-brand-500">
                <MessageSquare className="w-4 h-4" />
              </div>
              <span>Send Message</span>
            </button>
          )}

          {/* Change Nickname */}
          <button
            onClick={() => {
              onClose();
              onOpenNicknameModal(targetUser);
            }}
            className="w-full flex items-center gap-3 p-3 bg-chat-card hover:bg-chat-border/50 active:scale-[0.99] border border-chat-border rounded-xl text-chat-textPrimary text-sm font-medium transition-all"
          >
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-500">
              <Tag className="w-4 h-4" />
            </div>
            <span>{targetNickname ? 'Change Nickname' : 'Set Nickname'}</span>
          </button>

          {/* Role Management Section */}
          {canManageRoles && !isSelf && !isTargetCreator && (
            <div className="pt-2 border-t border-chat-border space-y-2">
              <p className="text-[11px] font-semibold text-chat-textMuted uppercase tracking-wider px-1">
                Role Management
              </p>

              {/* Admin Toggle */}
              {isCallerCreator && (
                <button
                  onClick={() => handleRoleChange(isTargetAdmin ? 'member' : 'admin')}
                  disabled={!!loadingAction}
                  className="w-full flex items-center justify-between p-3 bg-chat-card hover:bg-chat-border/50 active:scale-[0.99] border border-chat-border rounded-xl text-chat-textPrimary text-sm font-medium transition-all"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <span>{isTargetAdmin ? 'Demote from Admin' : 'Promote to Admin'}</span>
                  </div>
                  {loadingAction === (isTargetAdmin ? 'role_member' : 'role_admin') && (
                    <Loader2 className="w-4 h-4 animate-spin text-chat-textMuted" />
                  )}
                </button>
              )}

              {/* Moderator Toggle */}
              <button
                onClick={() => handleRoleChange(isTargetModerator ? 'member' : 'moderator')}
                disabled={!!loadingAction}
                className="w-full flex items-center justify-between p-3 bg-chat-card hover:bg-chat-border/50 active:scale-[0.99] border border-chat-border rounded-xl text-chat-textPrimary text-sm font-medium transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                    <Shield className="w-4 h-4" />
                  </div>
                  <span>{isTargetModerator ? 'Demote from Moderator' : 'Promote to Moderator'}</span>
                </div>
                {loadingAction === (isTargetModerator ? 'role_member' : 'role_moderator') && (
                  <Loader2 className="w-4 h-4 animate-spin text-chat-textMuted" />
                )}
              </button>

              {/* Transfer Ownership (Creator Only) */}
              {isCallerCreator && (
                <div>
                  {!showTransferConfirm ? (
                    <button
                      onClick={() => setShowTransferConfirm(true)}
                      className="w-full flex items-center gap-3 p-3 bg-amber-500/10 hover:bg-amber-500/20 active:scale-[0.99] border border-amber-500/30 rounded-xl text-amber-500 text-sm font-semibold transition-all"
                    >
                      <ArrowRightLeft className="w-4 h-4" />
                      <span>Transfer Group Ownership</span>
                    </button>
                  ) : (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl space-y-2">
                      <p className="text-xs text-amber-500 font-medium">
                        Are you sure? You will become a regular admin and <b>{targetUser.displayName || targetUser.username}</b> will become the sole owner of this group.
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={handleTransferOwnership}
                          disabled={!!loadingAction}
                          className="flex-1 py-1.5 bg-amber-500 hover:bg-amber-600 text-black text-xs font-bold rounded-lg transition-all"
                        >
                          {loadingAction === 'transfer' ? 'Transferring...' : 'Confirm Transfer'}
                        </button>
                        <button
                          onClick={() => setShowTransferConfirm(false)}
                          className="px-3 py-1.5 bg-chat-card border border-chat-border text-chat-textPrimary text-xs font-medium rounded-lg"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Remove Member */}
          {canRemove && (
            <div className="pt-2 border-t border-chat-border">
              <button
                onClick={handleRemoveMember}
                disabled={!!loadingAction}
                className="w-full flex items-center justify-between p-3 bg-red-500/10 hover:bg-red-500/20 active:scale-[0.99] border border-red-500/30 rounded-xl text-red-500 text-sm font-semibold transition-all"
              >
                <div className="flex items-center gap-3">
                  <UserX className="w-4 h-4" />
                  <span>Remove from Group</span>
                </div>
                {loadingAction === 'remove' && (
                  <Loader2 className="w-4 h-4 animate-spin text-red-500" />
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
