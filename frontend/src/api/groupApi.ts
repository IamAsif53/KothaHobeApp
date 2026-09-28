import { apiFetch } from './client';
import { IConversation, IGroupDescription, IGroupEvent, IGroupPermissions, IGroupPoll, IMessage, IGroupActivityLog } from '../types';

export interface CreateGroupPayload {
  name: string;
  avatarUrl?: string;
  description?: string;
  memberIds: string[];
}

export interface GroupResponse {
  success: boolean;
  message?: string;
  conversation?: IConversation;
  group?: IConversation;
}

// 1. Create a new Group
export async function createGroupApi(payload: CreateGroupPayload): Promise<GroupResponse> {
  return apiFetch<GroupResponse>('/groups', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// 2. Fetch Group Details
export async function fetchGroupDetailsApi(groupId: string): Promise<GroupResponse> {
  return apiFetch<GroupResponse>(`/groups/${groupId}`);
}

// 3. Update Group Name
export async function updateGroupNameApi(groupId: string, name: string): Promise<{ success: boolean; message: string; name: string }> {
  return apiFetch<{ success: boolean; message: string; name: string }>(`/groups/${groupId}/name`, {
    method: 'PUT',
    body: JSON.stringify({ name }),
  });
}

// 4. Update Group Avatar
export async function updateGroupAvatarApi(groupId: string, avatarUrl: string): Promise<{ success: boolean; message: string; avatarUrl: string }> {
  return apiFetch<{ success: boolean; message: string; avatarUrl: string }>(`/groups/${groupId}/avatar`, {
    method: 'PUT',
    body: JSON.stringify({ avatarUrl }),
  });
}

// 5. Update Group Description & Rules
export async function updateGroupDescriptionApi(groupId: string, description: string, rules?: string[]): Promise<{ success: boolean; message: string; description?: IGroupDescription; rules?: string[] }> {
  return apiFetch<{ success: boolean; message: string; description?: IGroupDescription; rules?: string[] }>(`/groups/${groupId}/description`, {
    method: 'PUT',
    body: JSON.stringify({ description, rules }),
  });
}

// 6. Get Group Invite Link
export async function fetchGroupInviteLinkApi(groupId: string): Promise<{ success: boolean; inviteCode: string; requiresApproval: boolean }> {
  return apiFetch<{ success: boolean; inviteCode: string; requiresApproval: boolean }>(`/groups/${groupId}/invite`);
}

// 7. Reset Group Invite Link (Admin Only)
export async function resetGroupInviteLinkApi(groupId: string): Promise<{ success: boolean; message: string; inviteCode: string }> {
  return apiFetch<{ success: boolean; message: string; inviteCode: string }>(`/groups/${groupId}/invite/reset`, {
    method: 'POST',
  });
}

// 8. Preview Group by Invite Code
export async function previewGroupByInviteCodeApi(inviteCode: string): Promise<{
  success: boolean;
  group?: {
    _id: string;
    name: string;
    avatarUrl?: string;
    description?: string;
    memberCount: number;
    creator: any;
    requiresApproval: boolean;
    isMember: boolean;
    isPending: boolean;
  };
}> {
  return apiFetch(`/groups/join/${inviteCode}`);
}

// 9. Join Group via Invite Code
export async function joinGroupByInviteCodeApi(inviteCode: string): Promise<{
  success: boolean;
  message: string;
  conversationId?: string;
  joined?: boolean;
  requested?: boolean;
}> {
  return apiFetch(`/groups/join/${inviteCode}`, {
    method: 'POST',
  });
}

// 10. Accept Join Request (Admin Only)
export async function acceptJoinRequestApi(groupId: string, targetUserId: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>(`/groups/${groupId}/join-requests/${targetUserId}/accept`, {
    method: 'POST',
  });
}

// 11. Decline Join Request (Admin Only)
export async function declineJoinRequestApi(groupId: string, targetUserId: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>(`/groups/${groupId}/join-requests/${targetUserId}/decline`, {
    method: 'POST',
  });
}

// 12. Invite New Members
export async function inviteGroupMembersApi(groupId: string, memberIds: string[]): Promise<GroupResponse> {
  return apiFetch<GroupResponse>(`/groups/${groupId}/members`, {
    method: 'POST',
    body: JSON.stringify({ memberIds }),
  });
}

// 13. Accept Group Invite
export async function acceptGroupInviteApi(groupId: string): Promise<{ success: boolean; message: string; conversationId: string }> {
  return apiFetch<{ success: boolean; message: string; conversationId: string }>(`/groups/${groupId}/accept`, {
    method: 'POST',
  });
}

// 14. Decline Group Invite
export async function declineGroupInviteApi(groupId: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>(`/groups/${groupId}/decline`, {
    method: 'POST',
  });
}

// 15. Leave Group
export async function leaveGroupApi(groupId: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>(`/groups/${groupId}/leave`, {
    method: 'POST',
  });
}

// 16. Remove Member (Admin Only)
export async function removeGroupMemberApi(groupId: string, targetUserId: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>(`/groups/${groupId}/members/${targetUserId}`, {
    method: 'DELETE',
  });
}

// 17. Toggle Member Admin Status (Legacy Support)
export async function toggleGroupAdminApi(groupId: string, targetUserId: string): Promise<{ success: boolean; message: string; isAdmin: boolean }> {
  return apiFetch<{ success: boolean; message: string; isAdmin: boolean }>(`/groups/${groupId}/members/${targetUserId}/admin`, {
    method: 'PUT',
  });
}

// 18. Update Member Role (Creator / Admin / Moderator / Member)
export async function updateMemberRoleApi(groupId: string, targetUserId: string, role: 'admin' | 'moderator' | 'member'): Promise<{
  success: boolean;
  message: string;
  role: string;
  targetUserId: string;
}> {
  return apiFetch<{ success: boolean; message: string; role: string; targetUserId: string }>(`/groups/${groupId}/members/${targetUserId}/role`, {
    method: 'PUT',
    body: JSON.stringify({ role }),
  });
}

// 19. Transfer Group Ownership (Creator Only)
export async function transferGroupOwnershipApi(groupId: string, newCreatorId: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>(`/groups/${groupId}/transfer-ownership`, {
    method: 'POST',
    body: JSON.stringify({ newCreatorId }),
  });
}

// 20. Set / Update Custom Group Nickname
export async function setGroupNicknameApi(groupId: string, targetUserId: string, nickname: string): Promise<{ success: boolean; message: string; targetUserId: string; nickname: string | null }> {
  return apiFetch<{ success: boolean; message: string; targetUserId: string; nickname: string | null }>(`/groups/${groupId}/nickname`, {
    method: 'PUT',
    body: JSON.stringify({ targetUserId, nickname }),
  });
}

// 21. Pinned Messages: Get, Pin, Unpin
export async function fetchPinnedMessagesApi(groupId: string): Promise<{ success: boolean; pinnedMessages: IMessage[] }> {
  return apiFetch<{ success: boolean; pinnedMessages: IMessage[] }>(`/groups/${groupId}/pinned`);
}

export async function pinMessageApi(groupId: string, messageId: string): Promise<{ success: boolean; message: string; messageId: string }> {
  return apiFetch<{ success: boolean; message: string; messageId: string }>(`/groups/${groupId}/pinned/${messageId}`, {
    method: 'POST',
  });
}

export async function unpinMessageApi(groupId: string, messageId: string): Promise<{ success: boolean; message: string; messageId: string }> {
  return apiFetch<{ success: boolean; message: string; messageId: string }>(`/groups/${groupId}/pinned/${messageId}`, {
    method: 'DELETE',
  });
}

// 22. Group Settings: Notifications, Disappearing, Permissions, Privacy
export async function updateGroupNotificationsApi(groupId: string, preference: 'all' | 'mentions' | 'muted'): Promise<{ success: boolean; message: string; preference: string }> {
  return apiFetch<{ success: boolean; message: string; preference: string }>(`/groups/${groupId}/notifications`, {
    method: 'PUT',
    body: JSON.stringify({ preference }),
  });
}

export async function updateDisappearingMessagesApi(groupId: string, duration: number): Promise<{ success: boolean; message: string; duration: number }> {
  return apiFetch<{ success: boolean; message: string; duration: number }>(`/groups/${groupId}/disappearing`, {
    method: 'PUT',
    body: JSON.stringify({ duration }),
  });
}

export async function updateGroupPermissionsApi(groupId: string, permissions: IGroupPermissions): Promise<{ success: boolean; message: string; permissions: IGroupPermissions }> {
  return apiFetch<{ success: boolean; message: string; permissions: IGroupPermissions }>(`/groups/${groupId}/permissions`, {
    method: 'PUT',
    body: JSON.stringify({ permissions }),
  });
}

export async function updateGroupPrivacyApi(groupId: string, requiresApproval: boolean): Promise<{ success: boolean; message: string; requiresApproval: boolean }> {
  return apiFetch<{ success: boolean; message: string; requiresApproval: boolean }>(`/groups/${groupId}/privacy`, {
    method: 'PUT',
    body: JSON.stringify({ requiresApproval }),
  });
}

// 23. Social: Events
export async function fetchGroupEventsApi(groupId: string): Promise<{ success: boolean; events: IGroupEvent[] }> {
  return apiFetch<{ success: boolean; events: IGroupEvent[] }>(`/groups/${groupId}/events`);
}

export async function createGroupEventApi(groupId: string, payload: { title: string; description?: string; date: string; time: string; location?: string }): Promise<{ success: boolean; message: string; event: IGroupEvent }> {
  return apiFetch<{ success: boolean; message: string; event: IGroupEvent }>(`/groups/${groupId}/events`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function rsvpGroupEventApi(groupId: string, eventId: string, status: 'going' | 'maybe' | 'not_going'): Promise<{ success: boolean; message: string; status: string }> {
  return apiFetch<{ success: boolean; message: string; status: string }>(`/groups/${groupId}/events/${eventId}/rsvp`, {
    method: 'POST',
    body: JSON.stringify({ status }),
  });
}

export async function deleteGroupEventApi(groupId: string, eventId: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>(`/groups/${groupId}/events/${eventId}`, {
    method: 'DELETE',
  });
}

// 24. Social: Polls
export async function fetchGroupPollsApi(groupId: string): Promise<{ success: boolean; polls: IGroupPoll[] }> {
  return apiFetch<{ success: boolean; polls: IGroupPoll[] }>(`/groups/${groupId}/polls`);
}

export async function createGroupPollApi(groupId: string, payload: { question: string; options: string[] }): Promise<{ success: boolean; message: string; poll: IGroupPoll }> {
  return apiFetch<{ success: boolean; message: string; poll: IGroupPoll }>(`/groups/${groupId}/polls`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function voteGroupPollApi(groupId: string, pollId: string, optionIndex: number): Promise<{ success: boolean; message: string; poll: IGroupPoll }> {
  return apiFetch<{ success: boolean; message: string; poll: IGroupPoll }>(`/groups/${groupId}/polls/${pollId}/vote`, {
    method: 'POST',
    body: JSON.stringify({ optionIndex }),
  });
}

export async function closeGroupPollApi(groupId: string, pollId: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>(`/groups/${groupId}/polls/${pollId}/close`, {
    method: 'POST',
  });
}

// 25. Admin Activity Logs
export async function fetchAdminActivityLogsApi(groupId: string): Promise<{ success: boolean; activityLogs: IGroupActivityLog[] }> {
  return apiFetch<{ success: boolean; activityLogs: IGroupActivityLog[] }>(`/groups/${groupId}/activity`);
}

// 26. Delete Group (Admin Only)
export async function deleteGroupApi(groupId: string): Promise<{ success: boolean; message: string; groupId?: string }> {
  return apiFetch<{ success: boolean; message: string; groupId?: string }>(`/groups/${groupId}`, {
    method: 'DELETE',
  });
}

