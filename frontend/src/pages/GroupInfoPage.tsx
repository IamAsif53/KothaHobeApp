import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Users,
  Phone,
  Video,
  UserPlus,
  Crown,
  Shield,
  ShieldCheck,
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
  Link,
  Pin,
  Calendar,
  BarChart2,
  Activity,
  Bell,
  Clock,
  Search,
  BookOpen,
  UserCheck,
  Share2,
  X,
  ShieldAlert,
} from 'lucide-react';
import {
  fetchGroupDetailsApi,
  updateGroupNameApi,
  updateGroupAvatarApi,
  inviteGroupMembersApi,
  leaveGroupApi,
  deleteGroupApi,
  acceptJoinRequestApi,
  declineJoinRequestApi,
  updateGroupPrivacyApi,
} from '../api/groupApi';
import { fetchSharedMediaApi, getMediaUrl } from '../api/messageApi';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useGroupCall } from '../context/GroupCallContext';
import { useTheme } from '../context/ThemeContext';
import { IConversation, IUser, GroupRole, IGroupPermissions, IGroupDescription } from '../types';
import { Avatar } from '../components/common/Avatar';
import { SetNicknameModal } from '../components/chat/SetNicknameModal';
import { MediaViewerModal } from '../components/chat/MediaViewerModal';
import { DocumentViewerModal } from '../components/chat/DocumentViewerModal';
import { GroupAvatarPickerModal } from '../components/chat/GroupAvatarPickerModal';
import { GroupDescriptionModal } from '../components/chat/GroupDescriptionModal';
import { GroupInviteLinkModal } from '../components/chat/GroupInviteLinkModal';
import { GroupJoinRequestsModal } from '../components/chat/GroupJoinRequestsModal';
import { GroupMemberActionSheet } from '../components/chat/GroupMemberActionSheet';
import { GroupPinnedMessagesModal } from '../components/chat/GroupPinnedMessagesModal';
import { GroupPermissionsModal } from '../components/chat/GroupPermissionsModal';
import { GroupEventsModal } from '../components/chat/GroupEventsModal';
import { GroupPollsModal } from '../components/chat/GroupPollsModal';
import { GroupAdminActivityModal } from '../components/chat/GroupAdminActivityModal';
import { GroupDisappearingModal } from '../components/chat/GroupDisappearingModal';
import { GroupNotificationsModal } from '../components/chat/GroupNotificationsModal';
import { searchUserApi } from '../api/userApi';

export const GroupInfoPage: React.FC = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { socket } = useSocket();
  const { startGroupCall } = useGroupCall();
  const { themeConfig } = useTheme();

  // Instant Cache Hydration: Initialize group immediately from cache
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

  const [activeTab, setActiveTab] = useState<'members' | 'media' | 'settings'>('members');
  const [sharedMedia, setSharedMedia] = useState<any[]>([]);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');

  // Modals state
  const [isEditingName, setIsEditingName] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [isAvatarPickerOpen, setIsAvatarPickerOpen] = useState(false);
  const [isUpdatingAvatar, setIsUpdatingAvatar] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Feature Modals
  const [isDescriptionModalOpen, setIsDescriptionModalOpen] = useState(false);
  const [isInviteLinkModalOpen, setIsInviteLinkModalOpen] = useState(false);
  const [isJoinRequestsModalOpen, setIsJoinRequestsModalOpen] = useState(false);
  const [isPinnedModalOpen, setIsPinnedModalOpen] = useState(false);
  const [isPermissionsModalOpen, setIsPermissionsModalOpen] = useState(false);
  const [isEventsModalOpen, setIsEventsModalOpen] = useState(false);
  const [isPollsModalOpen, setIsPollsModalOpen] = useState(false);
  const [isAdminActivityModalOpen, setIsAdminActivityModalOpen] = useState(false);
  const [isDisappearingModalOpen, setIsDisappearingModalOpen] = useState(false);
  const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false);

  // Member Action Sheet & Nickname Modal
  const [selectedMember, setSelectedMember] = useState<{
    user: IUser;
    role: GroupRole;
    nickname?: string | null;
  } | null>(null);
  const [nicknameModalUser, setNicknameModalUser] = useState<IUser | null>(null);

  // Media Viewers
  const [activeMediaModal, setActiveMediaModal] = useState<any | null>(null);
  const [activeDocModal, setActiveDocModal] = useState<any | null>(null);

  // Add Member Search
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

  // Socket real-time listeners for group events
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

    const handleGroupUpdated = () => {
      loadGroupDetails(true);
    };

    const handleNicknameUpdated = (data: { conversationId: string; userId: string; nickname: string | null }) => {
      if (data.conversationId === conversationId) {
        setGroup((prev: any) => {
          if (!prev || !prev.groupMeta) return prev;
          const updatedNicknames = { ...(prev.groupMeta.nicknames || {}) };
          if (data.nickname) {
            updatedNicknames[data.userId] = data.nickname;
          } else {
            delete updatedNicknames[data.userId];
          }
          const updated = {
            ...prev,
            groupMeta: {
              ...prev.groupMeta,
              nicknames: updatedNicknames,
            },
          };
          localStorage.setItem(`kotha_hobe_group_cache_${conversationId}`, JSON.stringify(updated));
          return updated;
        });
      }
    };

    const handleJoinRequested = (data: any) => {
      if (data.conversationId === conversationId) {
        loadGroupDetails(true);
      }
    };

    const handleJoinRequestResolved = (data: any) => {
      if (data.conversationId === conversationId) {
        loadGroupDetails(true);
      }
    };

    const handlePrivacyUpdated = (data: { conversationId: string; requiresApproval: boolean }) => {
      if (data.conversationId === conversationId) {
        setGroup((prev) => {
          if (!prev || !prev.groupMeta) return prev;
          const updated = {
            ...prev,
            groupMeta: { ...prev.groupMeta, requiresApproval: data.requiresApproval },
          };
          localStorage.setItem(`kotha_hobe_group_cache_${conversationId}`, JSON.stringify(updated));
          return updated;
        });
      }
    };

    const handlePermissionsUpdated = (data: { conversationId: string; permissions: any; requiresApproval?: boolean }) => {
      if (data.conversationId === conversationId) {
        setGroup((prev) => {
          if (!prev || !prev.groupMeta) return prev;
          const updated = {
            ...prev,
            groupMeta: {
              ...prev.groupMeta,
              permissions: data.permissions || prev.groupMeta.permissions,
              requiresApproval: typeof data.requiresApproval === 'boolean' ? data.requiresApproval : prev.groupMeta.requiresApproval,
            },
          };
          localStorage.setItem(`kotha_hobe_group_cache_${conversationId}`, JSON.stringify(updated));
          return updated;
        });
      }
    };

    socket.on('group:deleted', handleGroupDeleted);
    socket.on('conversation:deleted', handleGroupDeleted);
    socket.on('group:avatar_updated', handleAvatarUpdated);
    socket.on('group:name_updated', handleNameUpdated);
    socket.on('group:member_removed', handleMemberRemoved);
    socket.on('group:updated', handleGroupUpdated);
    socket.on('group:nickname_updated', handleNicknameUpdated);
    socket.on('group:join_requested', handleJoinRequested);
    socket.on('group:join_request_resolved', handleJoinRequestResolved);
    socket.on('group:privacy_updated', handlePrivacyUpdated);
    socket.on('group:permissions_updated', handlePermissionsUpdated);

    return () => {
      socket.off('group:deleted', handleGroupDeleted);
      socket.off('conversation:deleted', handleGroupDeleted);
      socket.off('group:avatar_updated', handleAvatarUpdated);
      socket.off('group:name_updated', handleNameUpdated);
      socket.off('group:member_removed', handleMemberRemoved);
      socket.off('group:updated', handleGroupUpdated);
      socket.off('group:nickname_updated', handleNicknameUpdated);
      socket.off('group:join_requested', handleJoinRequested);
      socket.off('group:join_request_resolved', handleJoinRequestResolved);
      socket.off('group:privacy_updated', handlePrivacyUpdated);
      socket.off('group:permissions_updated', handlePermissionsUpdated);
    };
  }, [socket, conversationId, currentUser, navigate]);

  // Load Shared Media when tab opens
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
  const isCreator =
    meta.creator === currentUserId ||
    (typeof meta.creator === 'object' && (meta.creator as any)._id === currentUserId);

  const isAdmin =
    isCreator ||
    meta.admins?.some((a) => (typeof a === 'string' ? a === currentUserId : (a as any)._id === currentUserId));

  const isModerator =
    isAdmin ||
    meta.moderators?.some((m) => (typeof m === 'string' ? m === currentUserId : (m as any)._id === currentUserId));

  const permissions: IGroupPermissions = meta.permissions || {
    sendMessages: 'all',
    addMembers: 'all',
    editGroupInfo: 'admins',
    pinMessages: 'admins',
    createPolls: 'all',
    createEvents: 'all',
  };

  const canEditInfo = isCreator || isAdmin || permissions.editGroupInfo === 'all';
  const canAddMembers = isCreator || isAdmin || permissions.addMembers === 'all';
  const canPinMessages = isCreator || isAdmin || permissions.pinMessages === 'all';
  const canCreatePollOrEvent = isCreator || isAdmin || permissions.createPolls === 'all';

  const membersCount = meta.members?.length || 0;
  const pendingRequestsCount = (meta.joinRequests || []).length;
  const pinnedCount = (meta.pinnedMessages || []).length;
  const eventsCount = (meta.events || []).length;
  const pollsCount = (meta.polls || []).filter((p) => !p.isClosed).length;

  // Filtered members list
  const filteredMembers = (meta.members || []).filter((m) => {
    const u = typeof m.user === 'object' ? m.user : null;
    if (!u) return false;
    const name = u.displayName || u.username || '';
    const customNick = meta.nicknames ? (meta.nicknames as any)[u._id] || '' : '';
    const q = memberSearchQuery.toLowerCase().trim();
    return (
      name.toLowerCase().includes(q) ||
      (u.username || '').toLowerCase().includes(q) ||
      customNick.toLowerCase().includes(q)
    );
  });

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
    if (!conversationId) return;
    const confirmLeave = window.confirm(
      isCreator
        ? 'You are the Creator of this group. Leaving will transfer ownership to another admin or member. Continue?'
        : 'Are you sure you want to leave this group?'
    );
    if (!confirmLeave) return;

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
    if (!conversationId || !isAdmin) return;
    const confirmDelete = window.confirm(
      'Are you sure you want to permanently delete this group? All chat history, shared media, polls, and events will be deleted forever.'
    );
    if (!confirmDelete) return;

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
      alert(err?.message || 'Failed to delete group');
    } finally {
      setIsDeleting(false);
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
        loadGroupDetails(true);
      }
    } catch (err) {
      console.error('Failed to invite member:', err);
    } finally {
      setIsInviting(false);
    }
  };

  const handleAcceptJoinRequest = async (userId: string) => {
    if (!conversationId) return;
    try {
      // Optimistic update
      setGroup((prev) => {
        if (!prev || !prev.groupMeta) return prev;
        const targetReq = prev.groupMeta.joinRequests?.find(
          (r) => (typeof r.user === 'object' ? (r.user as any)._id : r.user)?.toString() === userId
        );
        const updatedRequests = (prev.groupMeta.joinRequests || []).filter(
          (r) => (typeof r.user === 'object' ? (r.user as any)._id : r.user)?.toString() !== userId
        );
        let updatedMembers = [...(prev.groupMeta.members || [])];
        if (targetReq && targetReq.user) {
          const userObj = typeof targetReq.user === 'object' ? targetReq.user : { _id: userId };
          if (!updatedMembers.some((m) => ((m.user as any)?._id || m.user)?.toString() === userId)) {
            updatedMembers.push({
              user: userObj as any,
              role: 'member',
              status: 'accepted',
              joinedAt: new Date().toISOString(),
            });
          }
        }
        const updated = {
          ...prev,
          groupMeta: {
            ...prev.groupMeta,
            joinRequests: updatedRequests,
            members: updatedMembers,
          },
        };
        localStorage.setItem(`kotha_hobe_group_cache_${conversationId}`, JSON.stringify(updated));
        return updated;
      });

      await acceptJoinRequestApi(conversationId, userId);
      loadGroupDetails(true);
    } catch (err: any) {
      console.error('[GroupInfo] Error accepting request:', err);
      loadGroupDetails(true);
    }
  };

  const handleDeclineJoinRequest = async (userId: string) => {
    if (!conversationId) return;
    try {
      // Optimistic update
      setGroup((prev) => {
        if (!prev || !prev.groupMeta) return prev;
        const updatedRequests = (prev.groupMeta.joinRequests || []).filter(
          (r) => (typeof r.user === 'object' ? (r.user as any)._id : r.user)?.toString() !== userId
        );
        const updated = {
          ...prev,
          groupMeta: {
            ...prev.groupMeta,
            joinRequests: updatedRequests,
          },
        };
        localStorage.setItem(`kotha_hobe_group_cache_${conversationId}`, JSON.stringify(updated));
        return updated;
      });

      await declineJoinRequestApi(conversationId, userId);
    } catch (err: any) {
      console.error('[GroupInfo] Error declining request:', err);
      loadGroupDetails(true);
    }
  };

  const handleToggleApproval = async () => {
    if (!conversationId || !isAdmin) return;
    const nextVal = !meta.requiresApproval;
    try {
      setGroup((prev) => {
        if (!prev || !prev.groupMeta) return prev;
        const updated = {
          ...prev,
          groupMeta: { ...prev.groupMeta, requiresApproval: nextVal },
        };
        localStorage.setItem(`kotha_hobe_group_cache_${conversationId}`, JSON.stringify(updated));
        return updated;
      });
      await updateGroupPrivacyApi(conversationId, nextVal);
    } catch (err) {
      console.error('[GroupInfo] Error toggling privacy:', err);
      loadGroupDetails(true);
    }
  };

  const disappearingLabel = useMemo(() => {
    const sec = meta.disappearingMode || 0;
    if (sec === 86400) return '24 Hours';
    if (sec === 604800) return '7 Days';
    if (sec === 2592000) return '30 Days';
    return 'Off';
  }, [meta.disappearingMode]);

  const notifLabel = useMemo(() => {
    const pref = meta.notificationSettings?.[currentUserId] || 'all';
    if (pref === 'mentions') return 'Mentions Only';
    if (pref === 'muted') return 'Muted';
    return 'All Messages';
  }, [meta.notificationSettings, currentUserId]);

  return (
    <div
      style={{ backgroundColor: themeConfig.bg }}
      className="flex-1 flex flex-col h-full text-chat-textPrimary overflow-hidden safe-top safe-bottom select-none transition-colors duration-200"
    >
      {/* Top Header */}
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

        {isAdmin && (
          <button
            onClick={() => setIsAdminActivityModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-chat-card hover:bg-chat-border/50 text-xs font-semibold text-chat-textMuted hover:text-chat-textPrimary border border-chat-border transition-colors"
            title="View Admin Activity Logs"
          >
            <Activity className="w-4 h-4 text-brand-500" />
            <span className="hidden sm:inline">Activity</span>
          </button>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        {/* HERO SECTION */}
        <div
          style={{ backgroundColor: themeConfig.card }}
          className="p-6 flex flex-col items-center justify-center border-b border-chat-border relative"
        >
          {/* Avatar with Edit Camera Badge */}
          <div className="relative mb-4">
            <div
              onClick={() => {
                if (canEditInfo) setIsAvatarPickerOpen(true);
              }}
              className={`w-24 h-24 rounded-3xl bg-chat-panel border-2 border-brand-500/40 flex items-center justify-center overflow-hidden shadow-2xl relative ${
                canEditInfo ? 'cursor-pointer group' : ''
              }`}
            >
              {meta.avatarUrl ? (
                <img src={meta.avatarUrl} alt={meta.name} className="w-full h-full object-cover" />
              ) : (
                <Users className="w-12 h-12 text-brand-400" />
              )}

              {canEditInfo && (
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-3xl">
                  <Camera className="w-6 h-6 text-white" />
                </div>
              )}
            </div>

            {canEditInfo && (
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

          {/* Group Name & Inline Edit */}
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
                className="p-2 rounded-xl bg-brand-500 text-white hover:bg-brand-600 shadow-sm"
              >
                <Check className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-chat-textPrimary text-center">{meta.name}</h1>
              {canEditInfo && (
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
            Social Group • {membersCount} {membersCount === 1 ? 'member' : 'members'}
          </p>

          {/* Description & Rules Snippet Card */}
          <div
            onClick={() => setIsDescriptionModalOpen(true)}
            className="w-full max-w-md mt-4 p-3 rounded-2xl bg-chat-panel border border-chat-border hover:border-brand-500/40 cursor-pointer transition-all flex items-start gap-3 select-none"
          >
            <div className="p-2 rounded-xl bg-brand-500/10 text-brand-500 shrink-0 mt-0.5">
              <BookOpen className="w-4 h-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-chat-textPrimary">About & Rules</h4>
                <span className="text-[11px] text-brand-500 font-semibold flex items-center">
                  {canEditInfo ? 'Edit' : 'View'} <ChevronRight className="w-3 h-3 ml-0.5" />
                </span>
              </div>
              <p className="text-xs text-chat-textMuted mt-0.5 line-clamp-2 leading-relaxed">
                {meta.description?.text || 'No description provided yet. Tap to view or add group rules and topic.'}
              </p>
            </div>
          </div>

          {/* Call & Primary Action Row */}
          <div className="flex items-center gap-3 mt-5">
            <button
              onClick={() => startGroupCall(conversationId!, meta.name, meta.avatarUrl, 'voice')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-chat-panel border border-chat-border hover:border-brand-500/50 hover:bg-chat-card transition-all active:scale-95 text-brand-500 font-semibold text-xs shadow-sm"
            >
              <Phone className="w-4 h-4" />
              <span>Voice</span>
            </button>

            <button
              onClick={() => startGroupCall(conversationId!, meta.name, meta.avatarUrl, 'video')}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-chat-panel border border-chat-border hover:border-brand-500/50 hover:bg-chat-card transition-all active:scale-95 text-brand-500 font-semibold text-xs shadow-sm"
            >
              <Video className="w-4 h-4" />
              <span>Video</span>
            </button>

            <button
              onClick={() => setIsInviteLinkModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-brand-500 hover:bg-brand-600 text-white font-semibold text-xs transition-all active:scale-95 shadow-md shadow-brand-500/20"
            >
              <Share2 className="w-4 h-4" />
              <span>Invite</span>
            </button>
          </div>
        </div>

        {/* QUICK HUB ACTION CARDS GRID */}
        <div className="p-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {/* Pinned Messages Card */}
          <div
            onClick={() => setIsPinnedModalOpen(true)}
            style={{ backgroundColor: themeConfig.card }}
            className="p-3.5 rounded-2xl border border-chat-border hover:border-brand-500/40 cursor-pointer transition-all active:scale-98 flex flex-col justify-between"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-500">
                <Pin className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-chat-textPrimary">{pinnedCount}</span>
            </div>
            <div>
              <h4 className="text-xs font-bold text-chat-textPrimary">Pinned</h4>
              <p className="text-[11px] text-chat-textMuted">Important messages</p>
            </div>
          </div>

          {/* Group Polls Card */}
          <div
            onClick={() => setIsPollsModalOpen(true)}
            style={{ backgroundColor: themeConfig.card }}
            className="p-3.5 rounded-2xl border border-chat-border hover:border-brand-500/40 cursor-pointer transition-all active:scale-98 flex flex-col justify-between"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500">
                <BarChart2 className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-chat-textPrimary">{pollsCount}</span>
            </div>
            <div>
              <h4 className="text-xs font-bold text-chat-textPrimary">Polls</h4>
              <p className="text-[11px] text-chat-textMuted">Live voting</p>
            </div>
          </div>

          {/* Group Events Card */}
          <div
            onClick={() => setIsEventsModalOpen(true)}
            style={{ backgroundColor: themeConfig.card }}
            className="p-3.5 rounded-2xl border border-chat-border hover:border-brand-500/40 cursor-pointer transition-all active:scale-98 flex flex-col justify-between"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                <Calendar className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-chat-textPrimary">{eventsCount}</span>
            </div>
            <div>
              <h4 className="text-xs font-bold text-chat-textPrimary">Events</h4>
              <p className="text-[11px] text-chat-textMuted">Meetups & syncs</p>
            </div>
          </div>

          {/* Invite Link Card */}
          <div
            onClick={() => setIsInviteLinkModalOpen(true)}
            style={{ backgroundColor: themeConfig.card }}
            className="p-3.5 rounded-2xl border border-chat-border hover:border-brand-500/40 cursor-pointer transition-all active:scale-98 flex flex-col justify-between"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                <Link className="w-4 h-4" />
              </div>
              <ChevronRight className="w-4 h-4 text-chat-textMuted" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-chat-textPrimary">Invite Link</h4>
              <p className="text-[11px] text-chat-textMuted">QR & link share</p>
            </div>
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <div
          style={{ backgroundColor: themeConfig.panel }}
          className="flex border-y border-chat-border"
        >
          <button
            onClick={() => setActiveTab('members')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === 'members'
                ? 'border-brand-500 text-brand-500 dark:text-brand-400 bg-brand-500/10'
                : 'border-transparent text-chat-textMuted hover:text-chat-textPrimary'
            }`}
          >
            Members ({membersCount})
          </button>
          <button
            onClick={() => setActiveTab('media')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === 'media'
                ? 'border-brand-500 text-brand-500 dark:text-brand-400 bg-brand-500/10'
                : 'border-transparent text-chat-textMuted hover:text-chat-textPrimary'
            }`}
          >
            Media & Docs
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === 'settings'
                ? 'border-brand-500 text-brand-500 dark:text-brand-400 bg-brand-500/10'
                : 'border-transparent text-chat-textMuted hover:text-chat-textPrimary'
            }`}
          >
            Settings
          </button>
        </div>

        {/* TAB 1: MEMBERS */}
        {activeTab === 'members' && (
          <div className="p-4 space-y-4">
            {/* Dedicated Inline Approval Requests Section for Admins */}
            {isAdmin && meta.joinRequests && meta.joinRequests.length > 0 && (
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3 shadow-md animate-fadeIn">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-amber-500" />
                    <h4 className="text-xs font-bold text-amber-500 uppercase tracking-wider">
                      Pending Approval Requests ({meta.joinRequests.length})
                    </h4>
                  </div>
                  <span className="text-[10px] text-amber-500 font-semibold px-2 py-0.5 rounded-full bg-amber-500/20">
                    Admin Review
                  </span>
                </div>

                <div className="space-y-2">
                  {meta.joinRequests.map((req) => {
                    const u: IUser | undefined = typeof req.user === 'object' ? req.user : undefined;
                    if (!u) return null;
                    const formattedTime = req.requestedAt
                      ? new Date(req.requestedAt).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : 'Recently';

                    return (
                      <div
                        key={u._id}
                        className="flex items-center justify-between p-3 rounded-xl bg-chat-card border border-chat-border gap-3 hover:border-amber-500/40 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar
                            src={u.avatarUrl || ''}
                            name={u.displayName || u.username || 'User'}
                            size="md"
                          />
                          <div className="min-w-0">
                            <h5 className="text-sm font-bold text-chat-textPrimary truncate">
                              {u.displayName || u.username}
                            </h5>
                            <p className="text-xs text-chat-textMuted truncate">@{u.username}</p>
                            <div className="flex items-center gap-1 mt-0.5 text-[10px] text-chat-textMuted">
                              <Clock className="w-3 h-3 text-chat-textMuted" />
                              <span>{formattedTime}</span>
                            </div>
                          </div>
                        </div>

                        {/* Accept / Reject actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => handleAcceptJoinRequest(u._id)}
                            className="flex items-center gap-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white text-xs font-bold rounded-lg shadow-sm transition-all"
                            title="Accept request"
                          >
                            <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                            <span>Accept</span>
                          </button>
                          <button
                            onClick={() => handleDeclineJoinRequest(u._id)}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 active:scale-95 text-red-500 border border-red-500/30 text-xs font-bold rounded-lg transition-all"
                            title="Decline request"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Member Search Bar */}
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-chat-textMuted" />
              <input
                type="text"
                value={memberSearchQuery}
                onChange={(e) => setMemberSearchQuery(e.target.value)}
                placeholder="Search group members..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-chat-panel border border-chat-border text-xs text-chat-textPrimary focus:outline-none focus:border-brand-500 transition-colors placeholder:text-chat-textMuted"
              />
            </div>

            {/* Add Member Button (if allowed) */}
            {canAddMembers && (
              <button
                onClick={() => setIsInviteModalOpen(true)}
                className="w-full p-3 rounded-xl bg-brand-500/10 hover:bg-brand-500/20 border border-brand-500/30 text-brand-500 dark:text-brand-400 flex items-center justify-center gap-2 font-semibold text-xs transition-all active:scale-98"
              >
                <UserPlus className="w-4 h-4" />
                <span>Add Members</span>
              </button>
            )}

            {/* Members List */}
            <div className="space-y-2">
              {filteredMembers.map((member) => {
                const u: IUser = member.user as any;
                if (!u) return null;

                const isUserCreator =
                  meta.creator === u._id ||
                  (typeof meta.creator === 'object' && (meta.creator as any)._id === u._id);

                const isUserAdmin =
                  isUserCreator ||
                  member.role === 'admin' ||
                  meta.admins?.some((a) => (typeof a === 'string' ? a === u._id : (a as any)._id === u._id));

                const isUserModerator =
                  member.role === 'moderator' ||
                  meta.moderators?.some((m) => (typeof m === 'string' ? m === u._id : (m as any)._id === u._id));

                const currentRole: GroupRole = isUserCreator
                  ? 'creator'
                  : isUserAdmin
                  ? 'admin'
                  : isUserModerator
                  ? 'moderator'
                  : 'member';

                const customNickname = meta.nicknames ? (meta.nicknames as any)[u._id] : undefined;
                const isSelf = u._id === currentUserId;

                return (
                  <div
                    key={u._id}
                    onClick={() =>
                      setSelectedMember({
                        user: u,
                        role: currentRole,
                        nickname: customNickname,
                      })
                    }
                    style={{ backgroundColor: themeConfig.card }}
                    className="p-3 rounded-2xl border border-chat-border flex items-center justify-between hover:border-brand-500/30 cursor-pointer transition-all active:scale-[0.99]"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        src={u.avatarUrl || ''}
                        name={customNickname || u.displayName || u.username || 'User'}
                        size="md"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-chat-textPrimary truncate">
                            {customNickname || u.displayName || u.username}
                          </p>
                          {isSelf && (
                            <span className="px-1.5 py-0.5 rounded-md bg-chat-panel text-chat-textMuted text-[10px] font-medium border border-chat-border">
                              You
                            </span>
                          )}
                          {/* Role Badges */}
                          {isUserCreator ? (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 dark:text-amber-400 text-[10px] font-bold">
                              <Crown className="w-3 h-3" />
                              Creator
                            </span>
                          ) : isUserAdmin ? (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-500 dark:text-emerald-400 text-[10px] font-bold">
                              <ShieldCheck className="w-3 h-3" />
                              Admin
                            </span>
                          ) : isUserModerator ? (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-500 dark:text-blue-400 text-[10px] font-bold">
                              <Shield className="w-3 h-3" />
                              Mod
                            </span>
                          ) : null}
                        </div>

                        <div className="flex items-center gap-2 text-xs text-chat-textMuted mt-0.5">
                          {customNickname ? (
                            <span className="truncate">~{u.displayName || u.username} • @{u.username}</span>
                          ) : (
                            <span>@{u.username}</span>
                          )}
                          {member.status === 'pending' && (
                            <>
                              <span>•</span>
                              <span className="text-amber-500 font-medium">(Invited)</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <ChevronRight className="w-4 h-4 text-chat-textMuted shrink-0 ml-2" />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: MEDIA & DOCS */}
        {activeTab === 'media' && (
          <div className="p-4 space-y-3">
            <div
              onClick={() => navigate(`/chat/${conversationId}/shared`)}
              style={{ backgroundColor: themeConfig.card }}
              className="p-3.5 rounded-2xl border border-chat-border hover:border-brand-500/40 flex items-center justify-between cursor-pointer transition-all active:scale-98"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center">
                  <ImageIcon className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-chat-textPrimary">All Media, Docs & Voice</h4>
                  <p className="text-[11px] text-chat-textMuted">Browse complete categorized gallery</p>
                </div>
              </div>
              <span className="text-xs text-brand-500 font-semibold flex items-center gap-1">
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
                          <span className="text-[10px] truncate max-w-full text-center text-chat-textPrimary font-medium">
                            {att.fileName}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SETTINGS & PERMISSIONS */}
        {activeTab === 'settings' && (
          <div className="p-4 space-y-4">
            {/* Preferences Group */}
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-chat-textMuted uppercase tracking-wider px-1">
                Chat Settings
              </p>

              {/* Notifications */}
              <div
                onClick={() => setIsNotificationsModalOpen(true)}
                style={{ backgroundColor: themeConfig.card }}
                className="p-3.5 rounded-2xl border border-chat-border hover:border-brand-500/30 flex items-center justify-between cursor-pointer transition-all active:scale-[0.99]"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-brand-500/10 text-brand-500">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-chat-textPrimary">Notifications</h4>
                    <p className="text-[11px] text-chat-textMuted">Current: {notifLabel}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-chat-textMuted" />
              </div>

              {/* Disappearing Messages */}
              <div
                onClick={() => setIsDisappearingModalOpen(true)}
                style={{ backgroundColor: themeConfig.card }}
                className="p-3.5 rounded-2xl border border-chat-border hover:border-brand-500/30 flex items-center justify-between cursor-pointer transition-all active:scale-[0.99]"
              >
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-purple-500/10 text-purple-500">
                    <Clock className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-chat-textPrimary">Disappearing Messages</h4>
                    <p className="text-[11px] text-chat-textMuted">Timer: {disappearingLabel}</p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-chat-textMuted" />
              </div>
            </div>

            {/* Admin Controls Section */}
            {isAdmin && (
              <div className="space-y-2 pt-2">
                <p className="text-[11px] font-semibold text-chat-textMuted uppercase tracking-wider px-1">
                  Admin Administration
                </p>

                {/* Require Admin Approval Setting */}
                <div
                  onClick={handleToggleApproval}
                  style={{ backgroundColor: themeConfig.card }}
                  className="p-3.5 rounded-2xl border border-chat-border hover:border-brand-500/30 flex items-center justify-between cursor-pointer transition-all active:scale-[0.99] select-none"
                >
                  <div className="flex items-center gap-3 min-w-0 pr-3">
                    <div className={`p-2 rounded-xl mt-0.5 shrink-0 ${meta.requiresApproval ? 'bg-amber-500/20 text-amber-500' : 'bg-chat-panel text-chat-textMuted'}`}>
                      <ShieldAlert className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-xs font-bold text-chat-textPrimary">Require Admin Approval</h4>
                      <p className="text-[11px] text-chat-textMuted">
                        {meta.requiresApproval
                          ? 'New members must be approved by an admin'
                          : 'Anyone with invite link joins immediately'}
                      </p>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleApproval();
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      meta.requiresApproval ? 'bg-amber-500' : 'bg-chat-border'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        meta.requiresApproval ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Group Permissions */}
                <div
                  onClick={() => setIsPermissionsModalOpen(true)}
                  style={{ backgroundColor: themeConfig.card }}
                  className="p-3.5 rounded-2xl border border-chat-border hover:border-brand-500/30 flex items-center justify-between cursor-pointer transition-all active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-500">
                      <Shield className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-chat-textPrimary">Group Permissions</h4>
                      <p className="text-[11px] text-chat-textMuted">Posting, invite & editing rules</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-chat-textMuted" />
                </div>

                {/* Admin Activity Log */}
                <div
                  onClick={() => setIsAdminActivityModalOpen(true)}
                  style={{ backgroundColor: themeConfig.card }}
                  className="p-3.5 rounded-2xl border border-chat-border hover:border-brand-500/30 flex items-center justify-between cursor-pointer transition-all active:scale-[0.99]"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-blue-500/10 text-blue-500">
                      <Activity className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-chat-textPrimary">Admin Activity Log</h4>
                      <p className="text-[11px] text-chat-textMuted">Audit trail of group changes</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-chat-textMuted" />
                </div>
              </div>
            )}

            {/* Danger Zone */}
            <div className="space-y-2 pt-4 border-t border-chat-border">
              <p className="text-[11px] font-semibold text-red-500 uppercase tracking-wider px-1">
                Danger Zone
              </p>

              {/* Leave Group Button */}
              <button
                onClick={handleLeaveGroup}
                className="w-full p-3.5 rounded-2xl bg-chat-card hover:bg-chat-panel border border-chat-border text-chat-textPrimary flex items-center justify-center gap-2 font-bold text-xs transition-all active:scale-98"
              >
                <LogOut className="w-4 h-4 text-chat-textMuted" />
                <span>Leave Group</span>
              </button>

              {/* Delete Group (Admin Only) */}
              {isAdmin && (
                <button
                  onClick={handleDeleteGroup}
                  disabled={isDeleting}
                  className="w-full p-3.5 rounded-2xl bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-500 dark:text-red-400 flex items-center justify-center gap-2 font-bold text-xs transition-all active:scale-98"
                >
                  {isDeleting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Deleting Group...</span>
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
        )}
      </div>

      {/* MODAL 1: Description & Rules Modal */}
      <GroupDescriptionModal
        isOpen={isDescriptionModalOpen}
        onClose={() => setIsDescriptionModalOpen(false)}
        groupId={conversationId!}
        currentDescription={meta.description}
        currentRules={meta.rules || []}
        canEdit={canEditInfo}
        onUpdated={(desc: IGroupDescription | null, rules: string[]) => {
          setGroup((prev) => {
            if (!prev || !prev.groupMeta) return prev;
            const updated = {
              ...prev,
              groupMeta: {
                ...prev.groupMeta,
                description: desc || prev.groupMeta.description,
                rules: rules || prev.groupMeta.rules,
              },
            };
            localStorage.setItem(`kotha_hobe_group_cache_${conversationId}`, JSON.stringify(updated));
            return updated;
          });
        }}
      />

      {/* MODAL 2: Invite Link Modal */}
      <GroupInviteLinkModal
        isOpen={isInviteLinkModalOpen}
        onClose={() => setIsInviteLinkModalOpen(false)}
        groupId={conversationId!}
        groupName={meta.name}
        inviteCode={meta.inviteCode}
        isAdmin={isAdmin}
        onInviteCodeChanged={(newCode) => {
          setGroup((prev) => {
            if (!prev || !prev.groupMeta) return prev;
            const updated = {
              ...prev,
              groupMeta: { ...prev.groupMeta, inviteCode: newCode },
            };
            localStorage.setItem(`kotha_hobe_group_cache_${conversationId}`, JSON.stringify(updated));
            return updated;
          });
        }}
      />

      {/* MODAL 3: Join Requests Modal */}
      <GroupJoinRequestsModal
        isOpen={isJoinRequestsModalOpen}
        onClose={() => setIsJoinRequestsModalOpen(false)}
        groupId={conversationId!}
        joinRequests={meta.joinRequests || []}
        onRequestHandled={(userId, accepted) => {
          setGroup((prev) => {
            if (!prev || !prev.groupMeta) return prev;
            const updatedRequests = (prev.groupMeta.joinRequests || []).filter(
              (r) => r.user._id !== userId
            );
            const updated = {
              ...prev,
              groupMeta: { ...prev.groupMeta, joinRequests: updatedRequests },
            };
            localStorage.setItem(`kotha_hobe_group_cache_${conversationId}`, JSON.stringify(updated));
            return updated;
          });
          if (accepted) {
            loadGroupDetails(true);
          }
        }}
      />

      {/* MODAL 4: Member Action Sheet */}
      {selectedMember && (
        <GroupMemberActionSheet
          isOpen={!!selectedMember}
          onClose={() => setSelectedMember(null)}
          groupId={conversationId!}
          targetUser={selectedMember.user}
          targetRole={selectedMember.role}
          targetNickname={selectedMember.nickname}
          callerUserId={currentUserId}
          isCallerCreator={isCreator}
          isCallerAdmin={!!isAdmin}
          isCallerModerator={!!isModerator}
          onOpenDirectChat={(u) => {
            navigate(`/chat/direct/${u._id}`);
          }}
          onOpenNicknameModal={(u) => {
            setNicknameModalUser(u);
          }}
          onMemberUpdated={() => {
            loadGroupDetails(true);
          }}
        />
      )}

      {/* MODAL 5: Pinned Messages Modal */}
      <GroupPinnedMessagesModal
        isOpen={isPinnedModalOpen}
        onClose={() => setIsPinnedModalOpen(false)}
        groupId={conversationId!}
        canManagePins={canPinMessages}
        onJumpToMessage={(messageId) => {
          navigate(`/chat/${conversationId}?highlight=${messageId}`);
        }}
      />

      {/* MODAL 6: Group Permissions Modal */}
      <GroupPermissionsModal
        isOpen={isPermissionsModalOpen}
        onClose={() => setIsPermissionsModalOpen(false)}
        groupId={conversationId!}
        initialPermissions={meta.permissions}
        requiresApproval={meta.requiresApproval}
        onPermissionsUpdated={(newPermissions) => {
          setGroup((prev) => {
            if (!prev || !prev.groupMeta) return prev;
            const updated = {
              ...prev,
              groupMeta: { ...prev.groupMeta, permissions: newPermissions },
            };
            localStorage.setItem(`kotha_hobe_group_cache_${conversationId}`, JSON.stringify(updated));
            return updated;
          });
        }}
        onPrivacyChanged={(reqApproval) => {
          setGroup((prev) => {
            if (!prev || !prev.groupMeta) return prev;
            const updated = {
              ...prev,
              groupMeta: { ...prev.groupMeta, requiresApproval: reqApproval },
            };
            localStorage.setItem(`kotha_hobe_group_cache_${conversationId}`, JSON.stringify(updated));
            return updated;
          });
        }}
      />

      {/* MODAL 7: Group Events Modal */}
      <GroupEventsModal
        isOpen={isEventsModalOpen}
        onClose={() => setIsEventsModalOpen(false)}
        groupId={conversationId!}
        currentUserId={currentUserId}
        canCreateEvent={canCreatePollOrEvent}
        canDeleteEvent={isAdmin}
      />

      {/* MODAL 8: Group Polls Modal */}
      <GroupPollsModal
        isOpen={isPollsModalOpen}
        onClose={() => setIsPollsModalOpen(false)}
        groupId={conversationId!}
        currentUserId={currentUserId}
        canCreatePoll={canCreatePollOrEvent}
        canManagePolls={isAdmin}
      />

      {/* MODAL 9: Admin Activity Modal */}
      <GroupAdminActivityModal
        isOpen={isAdminActivityModalOpen}
        onClose={() => setIsAdminActivityModalOpen(false)}
        groupId={conversationId!}
      />

      {/* MODAL 10: Disappearing Messages Modal */}
      <GroupDisappearingModal
        isOpen={isDisappearingModalOpen}
        onClose={() => setIsDisappearingModalOpen(false)}
        groupId={conversationId!}
        currentDuration={meta.disappearingMode}
        onDurationUpdated={(duration) => {
          setGroup((prev) => {
            if (!prev || !prev.groupMeta) return prev;
            const updated = {
              ...prev,
              groupMeta: { ...prev.groupMeta, disappearingMode: duration },
            };
            localStorage.setItem(`kotha_hobe_group_cache_${conversationId}`, JSON.stringify(updated));
            return updated;
          });
        }}
      />

      {/* MODAL 11: Group Notifications Modal */}
      <GroupNotificationsModal
        isOpen={isNotificationsModalOpen}
        onClose={() => setIsNotificationsModalOpen(false)}
        groupId={conversationId!}
        currentPreference={meta.notificationSettings?.[currentUserId] || 'all'}
        onPreferenceUpdated={(pref) => {
          setGroup((prev) => {
            if (!prev || !prev.groupMeta) return prev;
            const updatedSettings = {
              ...(prev.groupMeta.notificationSettings || {}),
              [currentUserId]: pref,
            };
            const updated = {
              ...prev,
              groupMeta: { ...prev.groupMeta, notificationSettings: updatedSettings },
            };
            localStorage.setItem(`kotha_hobe_group_cache_${conversationId}`, JSON.stringify(updated));
            return updated;
          });
        }}
      />

      {/* MODAL 12: Set Nickname Modal */}
      {nicknameModalUser && (
        <SetNicknameModal
          isOpen={!!nicknameModalUser}
          onClose={() => setNicknameModalUser(null)}
          groupId={conversationId!}
          targetUser={nicknameModalUser}
          currentNickname={meta.nicknames ? (meta.nicknames as any)[nicknameModalUser._id] : ''}
          onNicknameUpdated={(targetUserId, newNick) => {
            setGroup((prev: any) => {
              if (!prev || !prev.groupMeta) return prev;
              const updatedNicknames = { ...(prev.groupMeta.nicknames || {}) };
              if (newNick) {
                updatedNicknames[targetUserId] = newNick;
              } else {
                delete updatedNicknames[targetUserId];
              }
              const updated = {
                ...prev,
                groupMeta: {
                  ...prev.groupMeta,
                  nicknames: updatedNicknames,
                },
              };
              localStorage.setItem(`kotha_hobe_group_cache_${conversationId}`, JSON.stringify(updated));
              return updated;
            });
            loadGroupDetails(true);
          }}
        />
      )}

      {/* MODAL 13: Group Avatar Picker Modal */}
      <GroupAvatarPickerModal
        isOpen={isAvatarPickerOpen}
        onClose={() => setIsAvatarPickerOpen(false)}
        currentAvatarUrl={meta.avatarUrl}
        onSelectAvatar={handleSelectGroupAvatar}
        title="Change Group Icon"
      />

      {/* MODAL 14: Add / Search Members Modal */}
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
                    src={searchedUser.avatarUrl || ''}
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

      {/* MODAL 15: Fullscreen Media Viewer */}
      {activeMediaModal && (
        <MediaViewerModal
          message={activeMediaModal}
          onClose={() => setActiveMediaModal(null)}
        />
      )}

      {/* MODAL 16: Fullscreen Document Viewer */}
      {activeDocModal && (
        <DocumentViewerModal
          message={activeDocModal}
          onClose={() => setActiveDocModal(null)}
        />
      )}
    </div>
  );
};

