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
  MoreVertical,
  Tag,
  LogOut,
  Trash2,
  Edit2,
  Image as ImageIcon,
  FileText,
  Loader2,
  Check,
} from 'lucide-react';
import {
  fetchGroupDetailsApi,
  updateGroupNameApi,
  updateGroupAvatarApi,
  inviteGroupMembersApi,
  leaveGroupApi,
  removeGroupMemberApi,
  toggleGroupAdminApi,
} from '../api/groupApi';
import { fetchSharedMediaApi, getMediaUrl } from '../api/messageApi';
import { useAuth } from '../context/AuthContext';
import { useGroupCall } from '../context/GroupCallContext';
import { IConversation, IGroupMember, IUser } from '../types';
import { Avatar } from '../components/common/Avatar';
import { SetNicknameModal } from '../components/chat/SetNicknameModal';
import { searchUserApi } from '../api/userApi';

export const GroupInfoPage: React.FC = () => {
  const { conversationId } = useParams<{ conversationId: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { startGroupCall } = useGroupCall();

  const [group, setGroup] = useState<IConversation | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'members' | 'media'>('members');
  const [sharedMedia, setSharedMedia] = useState<any[]>([]);

  // Modals / Actions
  const [isEditingName, setIsEditingName] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [nicknameModalUser, setNicknameModalUser] = useState<IUser | null>(null);

  // Invite Modal
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchedUser, setSearchedUser] = useState<IUser | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isInviting, setIsInviting] = useState(false);

  // Load Group Data
  const loadGroupDetails = async () => {
    if (!conversationId) return;
    try {
      setLoading(true);
      const res = await fetchGroupDetailsApi(conversationId);
      if (res.success && res.group) {
        setGroup(res.group);
        setNewGroupName(res.group.groupMeta?.name || '');
      }
    } catch (err) {
      console.error('Failed to load group details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadGroupDetails();
  }, [conversationId]);

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

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-950 text-emerald-400">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  if (!group || !group.groupMeta) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-slate-950 text-white">
        <p className="text-slate-400 mb-4">Group not found or access denied.</p>
        <button
          onClick={() => navigate('/chats')}
          className="px-5 py-2.5 rounded-2xl bg-emerald-600 text-white text-sm font-semibold"
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
        setGroup((prev) => (prev ? { ...prev, groupMeta: { ...prev.groupMeta!, name: res.name } } : prev));
        setIsEditingName(false);
      }
    } catch (err) {
      console.error('Failed to update group name:', err);
    }
  };

  const handleLeaveGroup = async () => {
    if (!window.confirm('Are you sure you want to leave this group?')) return;
    if (!conversationId) return;
    try {
      const res = await leaveGroupApi(conversationId);
      if (res.success) {
        navigate('/chats');
      }
    } catch (err) {
      console.error('Failed to leave group:', err);
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
    <div className="flex-1 flex flex-col h-full bg-slate-950 text-white overflow-hidden safe-top safe-bottom">
      {/* Header */}
      <div className="px-4 py-3 bg-slate-900/90 border-b border-slate-800/80 flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/chat/${conversationId}`)}
            className="p-2 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-base font-bold text-white">Group Info</h2>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto">
        {/* Hero Section */}
        <div className="p-6 flex flex-col items-center justify-center border-b border-slate-800/60 bg-gradient-to-b from-slate-900/60 to-slate-950">
          <div className="relative mb-4">
            <div className="w-24 h-24 rounded-3xl bg-slate-800 border-2 border-emerald-500/40 flex items-center justify-center overflow-hidden shadow-2xl">
              {meta.avatarUrl ? (
                <img src={meta.avatarUrl} alt={meta.name} className="w-full h-full object-cover" />
              ) : (
                <Users className="w-12 h-12 text-emerald-400" />
              )}
            </div>
          </div>

          {/* Group Name & Edit */}
          {isEditingName ? (
            <form onSubmit={handleUpdateName} className="flex items-center gap-2 w-full max-w-xs mb-1">
              <input
                type="text"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                maxLength={60}
                className="flex-1 px-3 py-1.5 rounded-xl bg-slate-800 border border-emerald-500 text-white text-sm focus:outline-none"
                autoFocus
              />
              <button
                type="submit"
                className="p-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-500"
              >
                <Check className="w-4 h-4" />
              </button>
            </form>
          ) : (
            <div className="flex items-center gap-2 mb-1">
              <h1 className="text-xl font-bold text-white text-center">{meta.name}</h1>
              <button
                onClick={() => setIsEditingName(true)}
                className="p-1 text-slate-400 hover:text-emerald-400 transition-colors"
                title="Edit Group Name"
              >
                <Edit2 className="w-4 h-4" />
              </button>
            </div>
          )}

          <p className="text-xs text-slate-400 font-medium">
            Group • {membersCount} of 10 members
          </p>

          {/* Group Call Actions */}
          <div className="flex items-center gap-4 mt-5">
            <button
              onClick={() => startGroupCall(conversationId!, meta.name, meta.avatarUrl, 'voice')}
              className="flex flex-col items-center gap-1.5 p-3 px-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-800/80 transition-all active:scale-95 text-emerald-400"
            >
              <Phone className="w-5 h-5" />
              <span className="text-xs font-semibold text-white">Voice Call</span>
            </button>

            <button
              onClick={() => startGroupCall(conversationId!, meta.name, meta.avatarUrl, 'video')}
              className="flex flex-col items-center gap-1.5 p-3 px-5 rounded-2xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 hover:bg-slate-800/80 transition-all active:scale-95 text-emerald-400"
            >
              <Video className="w-5 h-5" />
              <span className="text-xs font-semibold text-white">Video Call</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-900/40">
          <button
            onClick={() => setActiveTab('members')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === 'members'
                ? 'border-emerald-500 text-emerald-400 bg-slate-800/30'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Members ({membersCount}/10)
          </button>
          <button
            onClick={() => setActiveTab('media')}
            className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
              activeTab === 'media'
                ? 'border-emerald-500 text-emerald-400 bg-slate-800/30'
                : 'border-transparent text-slate-400 hover:text-slate-200'
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
                className="w-full p-3.5 rounded-2xl bg-emerald-600/10 hover:bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 flex items-center justify-center gap-2 font-semibold text-sm transition-all duration-200 active:scale-98 mb-3"
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
                  className="p-3 rounded-2xl bg-slate-900/60 border border-slate-800/80 flex items-center justify-between hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                      src={u.avatarUrl}
                      name={customNickname || u.displayName || u.username}
                      size="md"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-bold text-white truncate">
                          {u.displayName}
                        </p>
                        {isSelf && (
                          <span className="px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-400 text-[10px] font-medium">
                            You
                          </span>
                        )}
                        {isCreator ? (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-[10px] font-bold">
                            <Crown className="w-3 h-3" />
                            Creator
                          </span>
                        ) : isAdmin ? (
                          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold">
                            <Shield className="w-3 h-3" />
                            Admin
                          </span>
                        ) : null}
                      </div>

                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                        <span>@{u.username}</span>
                        {customNickname && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-400 font-medium">
                              "{customNickname}"
                            </span>
                          </>
                        )}
                        {member.status === 'pending' && (
                          <>
                            <span>•</span>
                            <span className="text-amber-400 font-medium">(Invited)</span>
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
                      className="p-2 rounded-xl text-slate-400 hover:text-emerald-400 hover:bg-slate-800 transition-colors"
                      title="Set Nickname"
                    >
                      <Tag className="w-4 h-4" />
                    </button>

                    {/* Admin Actions (Promote / Demote / Remove) */}
                    {isCurrentUserAdmin && !isSelf && !isCreator && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleToggleAdmin(u._id)}
                          className="p-2 rounded-xl text-slate-400 hover:text-amber-400 hover:bg-slate-800 transition-colors"
                          title={isAdmin ? 'Dismiss Admin' : 'Make Admin'}
                        >
                          <Shield className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleRemoveMember(u._id, u.displayName)}
                          className="p-2 rounded-xl text-slate-400 hover:text-red-400 hover:bg-slate-800 transition-colors"
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

            {/* Leave Group Button */}
            <div className="pt-6">
              <button
                onClick={handleLeaveGroup}
                className="w-full p-3.5 rounded-2xl bg-red-600/10 hover:bg-red-600/20 border border-red-500/30 text-red-400 flex items-center justify-center gap-2 font-bold text-sm transition-all duration-200 active:scale-98"
              >
                <LogOut className="w-4 h-4" />
                <span>Leave Group</span>
              </button>
            </div>
          </div>
        ) : (
          /* Media Gallery Tab */
          <div className="p-4">
            {sharedMedia.length === 0 ? (
              <div className="py-16 text-center text-slate-500 text-xs">
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
                      onClick={() => window.open(getMediaUrl(att.url), '_blank')}
                      className="aspect-square rounded-2xl bg-slate-800 overflow-hidden cursor-pointer relative border border-slate-700/60 hover:border-emerald-500/50 transition-all group"
                    >
                      {isImg ? (
                        <img src={getMediaUrl(att.url)} alt="Shared" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center p-2 text-slate-400">
                          <FileText className="w-6 h-6 mb-1" />
                          <span className="text-[10px] truncate max-w-full text-center">{att.fileName}</span>
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
            loadGroupDetails();
          }}
        />
      )}

      {/* Add / Invite Members Modal */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-md p-6 shadow-2xl flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Add Member to Group</h3>
              </div>
              <button
                onClick={() => setIsInviteModalOpen(false)}
                className="p-1 rounded-full text-slate-400 hover:text-white hover:bg-slate-800"
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
                className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={isSearching}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs"
              >
                {isSearching ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
              </button>
            </form>

            {searchedUser && (
              <div className="p-3 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar
                    src={searchedUser.avatarUrl}
                    name={searchedUser.displayName || searchedUser.username || 'User'}
                    size="md"
                  />
                  <div>
                    <h4 className="text-sm font-bold text-white">{searchedUser.displayName}</h4>
                    <p className="text-xs text-slate-400">@{searchedUser.username}</p>
                  </div>
                </div>

                <button
                  onClick={() => handleInviteUser(searchedUser)}
                  disabled={isInviting}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-600/30 flex items-center gap-1"
                >
                  {isInviting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
                  <span>Invite</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
