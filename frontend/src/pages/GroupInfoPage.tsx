import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Users,
  Phone,
  Video,
  UserPlus,
  Crown,
  Shield,
  Tag,
  LogOut,
  Trash2,
  Edit2,
  Image as ImageIcon,
  FileText,
  Loader2,
  Check,
  ChevronRight,
  Camera,
} from 'lucide-react';
import {
  fetchGroupDetailsApi,
  updateGroupNameApi,
  updateGroupAvatarApi,
  inviteGroupMembersApi,
  leaveGroupApi,
  removeGroupMemberApi,
  toggleGroupAdminApi,
  deleteGroupApi,
} from '../api/groupApi';
import { fetchSharedMediaApi, getMediaUrl } from '../api/messageApi';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useGroupCall } from '../context/GroupCallContext';
import { useTheme } from '../context/ThemeContext';
import { IConversation, IUser } from '../types';
import { Avatar } from '../components/common/Avatar';
import { SetNicknameModal } from '../components/chat/SetNicknameModal';
import { MediaViewerModal } from '../components/chat/MediaViewerModal';
import { DocumentViewerModal } from '../components/chat/DocumentViewerModal';
import { GroupAvatarPickerModal } from '../components/chat/GroupAvatarPickerModal';
import { searchUserApi } from '../api/userApi';

export const GroupInfoPage: React.FC = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { socket } = useSocket();
  const { startGroupCall } = useGroupCall();
  const { themeConfig } = useTheme();

  // ⚡ Instant Cache Hydration: Initialize group immediately from cache (0ms lag)
  const [group, setGroup] = useState<IConversation | null>(() => {
    if (!conversationId) return null;
    try {
      const specific = localStorage.getItem(`kotha_hobe_group_cache_${conversationId}`);
      if (specific) return JSON.parse(specific);
      const convList = localStorage.getItem('kotha_hobe_cached_conversations');
      if (convList) {
        const parsed = JSON.parse(convList);
        const match = parsed.find((c: any) => c._id === conversationId && c.isGroup);
        if (match) return match;
      }
    } catch {}
    return null;
  });

  const [loading, setLoading] = useState<boolean>(() => {
    if (!conversationId) return true;
    try {
      const specific = localStorage.getItem(`kotha_hobe_group_cache_${conversationId}`);
      if (specific) return false;
      const convList = localStorage.getItem('kotha_hobe_cached_conversations');
      if (convList) {
        const parsed = JSON.parse(convList);
        return !parsed.some((c: any) => c._id === conversationId && c.isGroup);
      }
    } catch {}
    return true;
  });

  const [activeTab, setActiveTab] = useState<'members' | 'media'>('members');
  const [sharedMedia, setSharedMedia] = useState<any[]>([]);

  // Modals / Actions
  const [isEditingName, setIsEditingName] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [nicknameModalUser, setNicknameModalUser] = useState<IUser | null>(null);
  const [activeMediaModal, setActiveMediaModal] = useState<any | null>(null);
  const [activeDocModal, setActiveDocModal] = useState<any | null>(null);

  // Invite Modal
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchedUser, setSearchedUser] = useState<IUser | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isInviting, setIsInviting] = useState(false);

  // Load Group Data in Background
  const loadGroupDetails = async (silent = false) => {
    if (!conversationId) return;
    if (!silent && !group) setLoading(true);
    try {
      const res = await fetchGroupDetailsApi(conversationId);
      if (res.success && res.group) {
        setGroup(res.group);
        setNewGroupName(res.group.groupMeta?.name || '');
        // Cache group details
        localStorage.setItem(`kotha_hobe_group_cache_${conversationId}`, JSON.stringify(res.group));
      }
    } catch (err) {
      console.error('Failed to load group details:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadGroupDetails(!!group);
  }, [conversationId]);

  // Socket real-time listeners for group updates & deletion
  useEffect(() => {
    if (!socket || !conversationId) return;

    const handleGroupDeleted = (data: { groupId?: string; conversationId?: string }) => {
      const targetId = data.groupId || data.conversationId;
      if (targetId === conversationId) {
        localStorage.removeItem(`kotha_hobe_group_cache_${conversationId}`);
        navigate('/chats', { replace: true });
      }
    };

    const handleAvatarUpdated = (data: { conversationId: string; avatarUrl: string }) => {
      if (data.conversationId === conversationId) {
        setGroup((prev) => {
          if (!prev || !prev.groupMeta) return prev;
          const updated = {
            ...prev,
            groupMeta: { ...prev.groupMeta, avatarUrl: data.avatarUrl },
          };
          localStorage.setItem(`kotha_hobe_group_cache_${conversationId}`, JSON.stringify(updated));
          return updated;
        });
      }
    };

    const handleNameUpdated = (data: { conversationId: string; name: string }) => {
      if (data.conversationId === conversationId) {
        setGroup((prev) => {
          if (!prev || !prev.groupMeta) return prev;
          const updated = {
            ...prev,
            groupMeta: { ...prev.groupMeta, name: data.name },
          };
          localStorage.setItem(`kotha_hobe_group_cache_${conversationId}`, JSON.stringify(updated));
          return updated;
        });
      }
    };

    const handleMemberRemoved = (data: { conversationId: string; targetUserId: string }) => {
      if (data.conversationId === conversationId) {
        if (data.targetUserId === currentUser?._id) {
          localStorage.removeItem(`kotha_hobe_group_cache_${conversationId}`);
          navigate('/chats', { replace: true });
        } else {
          loadGroupDetails(true);
        }
      }
    };

    socket.on('group:deleted', handleGroupDeleted);
    socket.on('conversation:deleted', handleGroupDeleted);
    socket.on('group:avatar_updated', handleAvatarUpdated);
    socket.on('group:name_updated', handleNameUpdated);
    socket.on('group:member_removed', handleMemberRemoved);

    return () => {
      socket.off('group:deleted', handleGroupDeleted);
      socket.off('conversation:deleted', handleGroupDeleted);
      socket.off('group:avatar_updated', handleAvatarUpdated);
      socket.off('group:name_updated', handleNameUpdated);
      socket.off('group:member_removed', handleMemberRemoved);
    };
  }, [socket, conversationId, currentUser, navigate]);

  // Load Shared Media
  useEffect(() => {
    if (activeTab === 'media' && conversationId) {
      fetchSharedMediaApi(conversationId, 'media')
        .then((res) => {
          if (res.success && res.items) {
            setSharedMedia(res.items);
          }
        })
        .catch(() => {});
    }
  }, [activeTab, conversationId]);

  if (loading && !group) {
    return (
      <div className="flex-1 flex items-center justify-center bg-chat-bg text-brand-500">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!group || !group.groupMeta) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-chat-bg text-chat-textPrimary">
        <p className="text-chat-textMuted mb-4">Group not found or access denied.</p>
        <button
          onClick={() => navigate('/chats')}
          className="px-5 py-2.5 rounded-2xl bg-brand-500 text-white text-sm font-semibold hover:bg-brand-600 transition-colors"
        >
          Back to Chats
        </button>
      </div>
    );
  }

  const meta = group.groupMeta;
  const currentUserId = currentUser?._id || '';
  const isCurrentUserAdmin =
    meta.creator === currentUserId ||
    (typeof meta.creator === 'object' && (meta.creator as any)._id === currentUserId) ||
    meta.admins.some((a) => (typeof a === 'string' ? a === currentUserId : (a as any)._id === currentUserId));

  const membersCount = meta.members.length;

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim() || !conversationId) return;
    try {
      const res = await updateGroupNameApi(conversationId, newGroupName.trim());
      if (res.success) {
        setGroup((prev) => {
          if (!prev || !prev.groupMeta) return prev;
          const updated = { ...prev, groupMeta: { ...prev.groupMeta, name: res.name } };
          localStorage.setItem(`kotha_hobe_group_cache_${conversationId}`, JSON.stringify(updated));
          return updated;
        });
        setIsEditingName(false);
      }
    } catch (err) {
      console.error('Failed to update group name:', err);
    }
  };

  const handleSelectGroupAvatar = async (newAvatarUrl: string) => {
    if (!conversationId) return;
    setIsUpdatingAvatar(true);
    try {
      const res = await updateGroupAvatarApi(conversationId, newAvatarUrl);
      if (res.success) {
        setGroup((prev) => {
          if (!prev || !prev.groupMeta) return prev;
          const updated = {
            ...prev,
            groupMeta: { ...prev.groupMeta, avatarUrl: newAvatarUrl },
          };
          localStorage.setItem(`kotha_hobe_group_cache_${conversationId}`, JSON.stringify(updated));
          return updated;
        });
      }
    } catch (err) {
      console.error('Failed to update group avatar:', err);
    } finally {
      setIsUpdatingAvatar(false);
    }
  };

  const handleLeaveGroup = async () => {
    if (!window.confirm('Are you sure you want to leave this group?')) return;
    if (!conversationId) return;
    try {
      const res = await leaveGroupApi(conversationId);
      if (res.success) {
        localStorage.removeItem(`kotha_hobe_group_cache_${conversationId}`);
        navigate('/chats', { replace: true });
      }
    } catch (err) {
      console.error('Failed to leave group:', err);
    }
  };

  const handleDeleteGroup = async () => {
    if (!window.confirm('Are you sure you want to permanently remove this group? This will delete all messages and remove the group for everyone.')) return;
    if (!conversationId) return;
    setIsDeleting(true);
    try {
      const res = await deleteGroupApi(conversationId);
      if (res.success) {
        localStorage.removeItem(`kotha_hobe_group_cache_${conversationId}`);
        const convList = localStorage.getItem('kotha_hobe_cached_conversations');
        if (convList) {
          const filtered = JSON.parse(convList).filter((c: any) => c._id !== conversationId);
          localStorage.setItem('kotha_hobe_cached_conversations', JSON.stringify(filtered));
        }
        navigate('/chats', { replace: true });
      }
    } catch (err: any) {
      alert(err?.message || 'Failed to remove group');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleRemoveMember = async (targetUserId: string, name: string) => {
    if (!window.confirm(`Remove ${name} from this group?`)) return;
    if (!conversationId) return;
    try {
      const res = await removeGroupMemberApi(conversationId, targetUserId);
      if (res.success) {
        loadGroupDetails();
      }
    } catch (err) {
      console.error('Failed to remove member:', err);
    }
  };

  const handleToggleAdmin = async (targetUserId: string) => {
    if (!conversationId) return;
    try {
      const res = await toggleGroupAdminApi(conversationId, targetUserId);
      if (res.success) {
        loadGroupDetails();
      }
    } catch (err) {
      console.error('Failed to toggle admin:', err);
    }
  };

  const handleSearchUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    try {
      const res = await searchUserApi(searchQuery.trim());
      if (res.success && res.user) {
        setSearchedUser(res.user);
      } else {
        setSearchedUser(null);
      }
    } catch (err) {
      setSearchedUser(null);
    } finally {
      setIsSearching(false);
    }
  };

  const handleInviteUser = async (userToInvite: IUser) => {
    if (!conversationId) return;
    setIsInviting(true);
    try {
      const res = await inviteGroupMembersApi(conversationId, [userToInvite._id]);
      if (res.success) {
        setIsInviteModalOpen(false);
        setSearchQuery('');
        setSearchedUser(null);
        loadGroupDetails();
      }
    } catch (err) {
      console.error('Failed to invite member:', err);
    } finally {
      setIsInviting(false);
    }
  };

  return (
    <div
      style={{ backgroundColor: themeConfig.bg }}
      className="flex-1 flex flex-col h-full text-chat-textPrimary overflow-hidden safe-top safe-bottom select-none transition-colors duration-200"
    >
      {/* Header */}
      <div
        style={{ backgroundColor: themeConfig.panel }}
        className="px-4 py-3 border-b border-chat-border flex items-center justify-between z-10"
      >
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/chat/${conversationId}`)}
            className="p-2 rounded-full text-chat-textMuted hover:text-chat-textPrimary hover:bg-chat-card transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold text-chat-textPrimary">Group Info</h2>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        {/* Hero Section */}
        <div
          style={{ backgroundColor: themeConfig.card }}
          className="p-6 flex flex-col items-center justify-center border-b border-chat-border"
        >
          <div className="relative mb-4">
            <div
              onClick={() => {
                if (isCurrentUserAdmin) setIsAvatarPickerOpen(true);
              }}
              className={`w-24 h-24 rounded-3xl bg-chat-panel border-2 border-brand-500/40 flex items-center justify-center overflow-hidden shadow-2xl relative ${
                isCurrentUserAdmin ? 'cursor-pointer group' : ''
              }`}
            >
              {meta.avatarUrl ? (
                <img src={meta.avatarUrl} alt={meta.name} className="w-full h-full object-cover" />
              ) : (
                <Users className="w-12 h-12 text-brand-400" />
              )}

              {/* Admin Avatar Edit Overlay */}
              {isCurrentUserAdmin && (
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-3xl">
                  <Camera className="w-6 h-6 text-white" />
                </div>
              )}
            </div>

            {/* Quick Edit Badge for Admin */}
            {isCurrentUserAdmin && (
              <button
                type="button"
                onClick={() => setIsAvatarPickerOpen(true)}
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-brand-500 hover:bg-brand-400 text-white flex items-center justify-center shadow-lg transition-transform active:scale-95"
                title="Change Group Icon"
              >
                {isUpdatingAvatar ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Camera className="w-3.5 h-3.5 stroke-[2.5]" />
                )}
              </button>
            )}
          </div>

          {/* Group Name & Edit */}
          {isEditingName ? (
            <form onSubmit={handleUpdateName} className="flex items-center gap-2 w-full max-w-xs mb-1">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                maxLength={60}
                className="flex-1 px-3 py-1.5 rounded-xl bg-chat-input border border-brand-500 text-chat-textPrimary text-sm focus:outline-none"
                autoFocus
              />
              <button
                type="submit"
                className="p-2 rounded-xl bg-brand-500 text-white hover:bg-brand-600"
              >
                <Check className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-chat-textPrimary text-center">{meta.name}</h1>
              {isCurrentUserAdmin && (
                <button
                  onClick={() => setIsEditingName(true)}
                  className="p-1 text-chat-textMuted hover:text-brand-400 transition-colors"
                  title="Edit Group Name"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
              )}
            </div>
          )}

          <p className="text-xs text-chat-textMuted font-medium">
            Group • {membersCount} of 10 members
          </p>

          {/* Group Call Actions */}
          <div className="flex items-center gap-4 mt-5">
            <button
              onClick={() => startGroupCall(conversationId!, meta.name, meta.avatarUrl, 'voice')}
              className="flex flex-col items-center gap-1.5 p-3 px-5 rounded-2xl bg-chat-panel border border-chat-border hover:border-brand-500/50 hover:bg-chat-card transition-all active:scale-95 text-brand-400"
            >
              <Phone className="w-5 h-5" />
              <span className="text-xs font-semibold text-chat-textPrimary">Voice Call</span>
            </button>

            <button
              onClick={() => startGroupCall(conversationId!, meta.name, meta.avatarUrl, 'video')}
              className="flex flex-col items-center gap-1.5 p-3 px-5 rounded-2xl bg-chat-panel border border-chat-border hover:border-brand-500/50 hover:bg-chat-card transition-all active:scale-95 text-brand-400"
            >
              <Video className="w-5 h-5" />
              <span className="text-xs font-semibold text-chat-textPrimary">Video Call</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div
          style={{ backgroundColor: themeConfig.panel }}
          className="flex border-b border-chat-border"
        >
          <button
            onClick={() => setActiveTab('members')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === 'members'
                ? 'border-brand-500 text-brand-500 dark:text-brand-400 bg-brand-500/10'
                : 'border-transparent text-chat-textMuted hover:text-chat-textPrimary'
            }`}
          >
            Members ({membersCount}/10)
          </button>
          <button
            onClick={() => setActiveTab('media')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === 'media'
                ? 'border-brand-500 text-brand-500 dark:text-brand-400 bg-brand-500/10'
                : 'border-transparent text-chat-textMuted hover:text-chat-textPrimary'
            }`}
          >
            Shared Media
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'members' ? (
          <div className="p-4 space-y-2">
            {/* Add Members Button (if < 10) */}
            {membersCount < 10 && (
              <button
                onClick={() => setIsInviteModalOpen(true)}
                className="w-full p-3.5 rounded-2xl bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/30 text-brand-500 dark:text-brand-400 flex items-center justify-center gap-2 font-semibold text-sm transition-all duration-200 active:scale-98 mb-3"
              >
                <UserPlus className="w-4 h-4" />
                <span>Add Members ({10 - membersCount} slots available)</span>
              </button>
            )}

            {/* Members List */}
            {meta.members.map((member) => {
              const u: IUser = member.user as any;
              if (!u) return null;

              const isCreator =
                meta.creator === u._id ||
                (typeof meta.creator === 'object' && (meta.creator as any)._id === u._id);

              const isAdmin =
                isCreator ||
                member.role === 'admin' ||
                meta.admins.some((a) => (typeof a === 'string' ? a === u._id : (a as any)._id === u._id));

              const customNickname = meta.nicknames ? (meta.nicknames as any)[u._id] : undefined;
              const isSelf = u._id === currentUserId;

              return (
                <div
                  key={u._id}
                  style={{ backgroundColor: themeConfig.card }}
                  className="p-3 rounded-2xl border border-chat-border flex items-center justify-between hover:border-chat-border/80 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                      src={u.avatarUrl}
                      name={customNickname || u.displayName || u.username}
                      size="md"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-chat-textPrimary truncate">
                          {u.displayName}
                        </p>
                        {isSelf && (
                          <span className="px-1.5 py-0.5 rounded-md bg-chat-panel text-chat-textMuted text-[10px] font-medium border border-chat-border">
                            You
                          </span>
                        )}
                        {isCreator ? (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 dark:text-amber-400 text-[10px] font-bold">
                            <Crown className="w-3 h-3" />
                            Creator
                          </span>
                        ) : isAdmin ? (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-500/20 text-brand-500 dark:text-brand-400 text-[10px] font-bold">
                            <Shield className="w-3 h-3" />
                            Admin
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2 text-xs text-chat-textMuted mt-0.5">
                        <span>@{u.username}</span>
                        {customNickname && (
                          <>
                            <span>•</span>
                            <span className="text-brand-500 dark:text-brand-400 font-medium">
                              "{customNickname}"
                            </span>
                          </>
                        )}
                        {member.status === 'pending' && (
                          <>
                            <span>•</span>
                            <span className="text-amber-500 dark:text-amber-400 font-medium">(Invited)</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    {/* Set Nickname Button */}
                    <button
                      onClick={() => setNicknameModalUser(u)}
                      className="p-2 rounded-xl text-chat-textMuted hover:text-brand-500 dark:hover:text-brand-400 hover:bg-chat-panel transition-colors"
                      title="Set Nickname"
                    >
                      <Tag className="w-4 h-4" />
                    </button>

                    {/* Admin Actions (Promote / Demote / Remove) */}
                    {isCurrentUserAdmin && !isSelf && !isCreator && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggleAdmin(u._id)}
                          className="p-2 rounded-xl text-chat-textMuted hover:text-amber-500 hover:bg-chat-panel transition-colors"
                          title={isAdmin ? 'Dismiss Admin' : 'Make Admin'}
                        >
                          <Shield className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleRemoveMember(u._id, u.displayName)}
                          className="p-2 rounded-xl text-chat-textMuted hover:text-red-500 hover:bg-chat-panel transition-colors"
                          title="Remove from group"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Bottom Actions: Leave Group & Delete Group */}
            <div className="pt-6 space-y-3">
              {/* Leave Group Button */}
              <button
                onClick={handleLeaveGroup}
                className="w-full p-3.5 rounded-2xl bg-chat-card hover:bg-chat-panel border border-chat-border text-chat-textPrimary flex items-center justify-center gap-2 font-bold text-sm transition-all duration-200 active:scale-98"
              >
                <LogOut className="w-4 h-4 text-chat-textMuted" />
                <span>Leave Group</span>
              </button>

              {/* Delete Group (Admin Only) */}
              {isCurrentUserAdmin && (
                <button
                  onClick={handleDeleteGroup}
                  disabled={isDeleting}
                  className="w-full p-3.5 rounded-2xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-500 dark:text-red-400 flex items-center justify-center gap-2 font-bold text-sm transition-all duration-200 active:scale-98"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Removing Group...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="w-4 h-4" />
                      <span>Delete Group (Admin Only)</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        ) : (
          /* Media Gallery Tab */
          <div className="p-4 space-y-3">
            {/* Link to Full Categorized Shared Media Page */}
            <div
              onClick={() => navigate(`/chat/${conversationId}/shared`)}
              style={{ backgroundColor: themeConfig.card }}
              className="p-3 rounded-2xl border border-chat-border hover:border-brand-500/40 flex items-center justify-between cursor-pointer transition-all active:scale-98"
            >
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-chat-textPrimary">All Media, Docs & Voice</h4>
                  <p className="text-[10px] text-chat-textMuted">View organized categories & files</p>
                </div>
              </div>
              <span className="text-xs text-brand-500 dark:text-brand-400 font-semibold flex items-center gap-1">
                Open <ChevronRight className="w-4 h-4" />
              </span>
            </div>

            {sharedMedia.length === 0 ? (
              <div className="py-16 text-center text-chat-textMuted text-xs">
                No shared photos, videos, or documents yet.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {sharedMedia.map((m: any, idx: number) => {
                  const att = m.attachment;
                  if (!att) return null;
                  const isImg = m.type === 'image';
                  return (
                    <div
                      key={m._id || idx}
                      onClick={() => {
                        if (isImg) {
                          setActiveMediaModal(m);
                        } else {
                          setActiveDocModal(m);
                        }
                      }}
                      className="aspect-square rounded-2xl bg-chat-panel overflow-hidden cursor-pointer relative border border-chat-border hover:border-brand-500/50 transition-all group"
                    >
                      {isImg ? (
                        <img
                          src={getMediaUrl(att.url)}
                          alt="Shared"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-2 text-chat-textMuted">
                          <FileText className="w-6 h-6 mb-1 text-brand-400" />
                          <span className="text-[10px] truncate max-w-full text-center text-chat-textPrimary font-medium">{att.fileName}</span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Set Nickname Modal */}
      {nicknameModalUser && (
        <SetNicknameModal
          isOpen={!!nicknameModalUser}
          onClose={() => setNicknameModalUser(null)}
          groupId={conversationId!}
          targetUser={nicknameModalUser}
          currentNickname={meta.nicknames ? (meta.nicknames as any)[nicknameModalUser._id] : ''}
          onNicknameUpdated={() => {
            loadGroupDetails(true);
          }}
        />
      )}

      {/* Group Avatar Picker Modal */}
      <GroupAvatarPickerModal
        isOpen={isAvatarPickerOpen}
        onClose={() => setIsAvatarPickerOpen(false)}
        currentAvatarUrl={meta.avatarUrl}
        onSelectAvatar={handleSelectGroupAvatar}
        title="Change Group Icon"
      />

      {/* Add / Invite Members Modal */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div
            style={{ backgroundColor: themeConfig.panel }}
            className="border border-chat-border rounded-3xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-4"
          >
            <div className="flex items-center justify-between border-b border-chat-border pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-brand-400" />
                <h3 className="text-base font-bold text-chat-textPrimary">Add Member to Group</h3>
              </div>
              <button
                onClick={() => setIsInviteModalOpen(false)}
                className="p-1 rounded-full text-chat-textMuted hover:text-chat-textPrimary hover:bg-chat-card"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSearchUser} className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search username (e.g. alex)"
                className="flex-1 px-4 py-2.5 rounded-xl bg-chat-input border border-chat-border text-chat-textPrimary placeholder:text-chat-textMuted text-xs focus:outline-none focus:border-brand-500"
              />
              <button
                type="submit"
                disabled={isSearching}
                className="px-4 py-2.5 rounded-xl bg-brand-500 hover:bg-brand-600 text-white font-semibold text-xs transition-colors"
              >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
              </button>
            </form>

            {searchedUser && (
              <div
                style={{ backgroundColor: themeConfig.card }}
                className="p-3 rounded-2xl border border-chat-border flex items-center justify-between"
              >
                <div className="flex items-center gap-3">
                  <Avatar
                    src={searchedUser.avatarUrl}
                    name={searchedUser.displayName || searchedUser.username || 'User'}
                    size="md"
                  />
                  <div>
                    <h4 className="text-sm font-bold text-chat-textPrimary">{searchedUser.displayName}</h4>
                    <p className="text-xs text-chat-textMuted">@{searchedUser.username}</p>
                  </div>
                </div>

                <button
                  onClick={() => handleInviteUser(searchedUser)}
                  disabled={isInviting}
                  className="px-4 py-2 rounded-xl bg-brand-500 hover:bg-brand-600 text-white text-xs font-bold shadow-md shadow-brand-500/30 flex items-center gap-1 transition-all"
                >
                  {isInviting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                  <span>Invite</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Fullscreen Media Viewer */}
      {activeMediaModal && (
        <MediaViewerModal
          message={activeMediaModal}
          onClose={() => setActiveMediaModal(null)}
        />
      )}

      {/* Fullscreen Document Viewer */}
      {activeDocModal && (
        <DocumentViewerModal
          message={activeDocModal}
          onClose={() => setActiveDocModal(null)}
        />
      )}
    </div>
  );
};
