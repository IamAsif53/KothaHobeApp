import { apiFetch } from './client';
import { IConversation } from '../types';

export interface CreateGroupPayload {
  name: string;
  avatarUrl?: string;
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

// 5. Invite New Members
export async function inviteGroupMembersApi(groupId: string, memberIds: string[]): Promise<GroupResponse> {
  return apiFetch<GroupResponse>(`/groups/${groupId}/members`, {
    method: 'POST',
    body: JSON.stringify({ memberIds }),
  });
}

// 6. Accept Group Invite
export async function acceptGroupInviteApi(groupId: string): Promise<{ success: boolean; message: string; conversationId: string }> {
  return apiFetch<{ success: boolean; message: string; conversationId: string }>(`/groups/${groupId}/accept`, {
    method: 'POST',
  });
}

// 7. Decline Group Invite
export async function declineGroupInviteApi(groupId: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>(`/groups/${groupId}/decline`, {
    method: 'POST',
  });
}

// 8. Leave Group
export async function leaveGroupApi(groupId: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>(`/groups/${groupId}/leave`, {
    method: 'POST',
  });
}

// 9. Remove Member (Admin Only)
export async function removeGroupMemberApi(groupId: string, targetUserId: string): Promise<{ success: boolean; message: string }> {
  return apiFetch<{ success: boolean; message: string }>(`/groups/${groupId}/members/${targetUserId}`, {
    method: 'DELETE',
  });
}

// 10. Toggle Member Admin Status (Admin Only)
export async function toggleGroupAdminApi(groupId: string, targetUserId: string): Promise<{ success: boolean; message: string; isAdmin: boolean }> {
  return apiFetch<{ success: boolean; message: string; isAdmin: boolean }>(`/groups/${groupId}/members/${targetUserId}/admin`, {
    method: 'PUT',
  });
}

// 11. Set / Update Custom Group Nickname
export async function setGroupNicknameApi(groupId: string, targetUserId: string, nickname: string): Promise<{ success: boolean; message: string; targetUserId: string; nickname: string | null }> {
  return apiFetch<{ success: boolean; message: string; targetUserId: string; nickname: string | null }>(`/groups/${groupId}/nickname`, {
    method: 'PUT',
    body: JSON.stringify({ targetUserId, nickname }),
  });
}
