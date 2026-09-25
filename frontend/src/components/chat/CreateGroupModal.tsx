import React, { useState, useEffect } from 'react';
import { X, Search, Users, Check, Loader2, Camera } from 'lucide-react';
import { createGroupApi } from '../../api/groupApi';
import { searchUserApi } from '../../api/userApi';
import { fetchConversations } from '../../api/conversationApi';
import { useAuth } from '../../context/AuthContext';
import { IUser } from '../../types';
import { Avatar } from '../common/Avatar';
import { useNavigate } from 'react-router-dom';

interface CreateGroupModalProps {
  isOpen: boolean;
  onClose: () => void;
  onGroupCreated?: (conversation: any) => void;
}

export const CreateGroupModal: React.FC<CreateGroupModalProps> = ({
  isOpen,
  onClose,
  onGroupCreated,
}) => {
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const [name, setName] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<IUser[]>([]);
  const [recentContacts, setRecentContacts] = useState<IUser[]>([]);
  const [selectedUsers, setSelectedUsers] = useState<IUser[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Load recent contacts from existing conversations on open
  useEffect(() => {
    if (isOpen) {
      setName('');
      setAvatarUrl('');
      setSearchQuery('');
      setSelectedUsers([]);
      setErrorMessage('');

      fetchConversations()
        .then((res) => {
          if (res.success && res.conversations) {
            const usersMap = new Map<string, IUser>();
            res.conversations.forEach((c) => {
              if (c.recipient && c.recipient._id && c.recipient._id !== currentUser?._id) {
                usersMap.set(c.recipient._id, c.recipient);
              }
              if (c.participants) {
                c.participants.forEach((p) => {
                  if (p._id && p._id !== currentUser?._id) usersMap.set(p._id, p);
                });
              }
            });
            setRecentContacts(Array.from(usersMap.values()));
          }
        })
        .catch(() => {});
    }
  }, [isOpen, currentUser]);

  // Search user handler with debounce
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await searchUserApi(searchQuery.trim());
        if (res.success && res.user && res.user._id !== currentUser?._id) {
          setSearchResults([res.user]);
        } else {
          setSearchResults([]);
        }
      } catch (err) {
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [searchQuery, currentUser]);

  if (!isOpen) return null;

  const toggleUserSelection = (userToToggle: IUser) => {
    if (userToToggle._id === currentUser?._id) return;
    setErrorMessage('');
    const exists = selectedUsers.some((u) => u._id === userToToggle._id);
    if (exists) {
      setSelectedUsers(selectedUsers.filter((u) => u._id !== userToToggle._id));
    } else {
      if (selectedUsers.length >= 9) {
        setErrorMessage('A group can have at most 10 members (including you).');
        return;
      }
      setSelectedUsers([...selectedUsers, userToToggle]);
    }
  };

  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMessage('Please enter a group name.');
      return;
    }

    if (selectedUsers.length < 2) {
      setErrorMessage('Please select at least 2 other members to create a group.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage('');

    try {
      const res = await createGroupApi({
        name: name.trim(),
        avatarUrl: avatarUrl.trim() || undefined,
        memberIds: selectedUsers.map((u) => u._id),
      });

      if (res.success && res.conversation) {
        if (onGroupCreated) onGroupCreated(res.conversation);
        onClose();
        navigate(`/chat/${res.conversation._id}`);
      } else {
        setErrorMessage(res.message || 'Failed to create group');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to create group');
    } finally {
      setIsSubmitting(false);
    }
  };

  // List of users to display (search results or recent contacts)
  const displayList = searchQuery.trim() ? searchResults : recentContacts;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-md max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
              <Users className="w-5 h-5" />
            </div>
            <h3 className="text-lg font-bold text-white">Create New Group</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleCreateGroup} className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-medium">
              {errorMessage}
            </div>
          )}

          {/* Group Name & Avatar */}
          <div className="flex items-center gap-3">
            <div className="relative group">
              <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 overflow-hidden">
                {avatarUrl ? (
                  <img src={avatarUrl} alt="Group Icon" className="w-full h-full object-cover" />
                ) : (
                  <Camera className="w-6 h-6 text-slate-500" />
                )}
              </div>
            </div>
            <div className="flex-1">
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Group Name (e.g. Squad Goals)"
                maxLength={60}
                required
                className="w-full px-4 py-3 rounded-2xl bg-slate-800/80 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
          </div>

          {/* Optional Avatar URL input */}
          <div>
            <input
              type="url"
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="Group Icon URL (optional)"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800/50 border border-slate-700/60 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Selected Member Chips */}
          <div>
            <div className="flex items-center justify-between text-xs text-slate-400 mb-2">
              <span className="font-semibold text-slate-300">Invite Members</span>
              <span className="text-emerald-400 font-medium">
                {selectedUsers.length + 1} / 10 members (You + {selectedUsers.length} invited)
              </span>
            </div>

            {selectedUsers.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2 rounded-2xl bg-slate-800/40 border border-slate-700/40 mb-2 max-h-24 overflow-y-auto">
                {selectedUsers.map((u) => (
                  <span
                    key={u._id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 text-xs font-medium"
                  >
                    <span>{u.displayName || u.username}</span>
                    <button
                      type="button"
                      onClick={() => toggleUserSelection(u)}
                      className="hover:text-white"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search user by username or name..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white placeholder-slate-500 text-xs focus:outline-none focus:border-emerald-500"
            />
            {isSearching && (
              <Loader2 className="w-4 h-4 text-emerald-400 animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
            )}
          </div>

          {/* User List */}
          <div className="flex-1 min-h-[140px] max-h-[220px] overflow-y-auto space-y-1 pr-1">
            {displayList.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-500">
                {searchQuery ? 'No user found' : 'Search for friends to add'}
              </div>
            ) : (
              displayList.map((contact) => {
                const isSelected = selectedUsers.some((u) => u._id === contact._id);
                return (
                  <div
                    key={contact._id}
                    onClick={() => toggleUserSelection(contact)}
                    className={`flex items-center justify-between p-2.5 rounded-2xl cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-emerald-950/40 border border-emerald-500/30'
                        : 'hover:bg-slate-800/60 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar
                        src={contact.avatarUrl}
                        name={contact.displayName || contact.username || 'User'}
                        size="sm"
                      />
                      <div>
                        <p className="text-sm font-semibold text-white leading-tight">
                          {contact.displayName}
                        </p>
                        <p className="text-xs text-slate-400">@{contact.username}</p>
                      </div>
                    </div>

                    <div
                      className={`w-6 h-6 rounded-full border flex items-center justify-center transition-colors ${
                        isSelected
                          ? 'bg-emerald-600 border-emerald-500 text-white'
                          : 'border-slate-600 bg-slate-800'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Create Button */}
          <button
            type="submit"
            disabled={isSubmitting || !name.trim() || selectedUsers.length < 2}
            className="w-full mt-2 py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 flex items-center justify-center gap-2 transition-all duration-200 active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Creating Group...</span>
              </>
            ) : selectedUsers.length < 2 ? (
              <span>Select at least 2 members ({selectedUsers.length}/2)</span>
            ) : (
              <span>Create Group ({selectedUsers.length + 1} members)</span>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
