import { apiFetch } from './client';
import { IStoryFeedItem, IStorySlide, IStoryViewer } from '../types';

export interface CreateStoryPayload {
  type: 'text' | 'image';
  text?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  background?: string;
  fontFamily?: string;
  fontSize?: number;
  textColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  duration?: number;
  privacy?: 'everyone' | 'connections' | 'close_friends';
}

export interface StoryFeedResponse {
  success: boolean;
  feed: IStoryFeedItem[];
  message?: string;
}

export interface StoryCreationResponse {
  success: boolean;
  story: IStorySlide;
  message?: string;
}

export interface StoryViewersResponse {
  success: boolean;
  viewsCount: number;
  viewers: IStoryViewer[];
}

export interface StoryArchiveResponse {
  success: boolean;
  stories: IStorySlide[];
}

export interface StoryReplyResponse {
  success: boolean;
  message?: string;
  chatMessage: any;
  conversationId: string;
}

// 1. Fetch Stories Feed
export async function fetchStoryFeedApi(): Promise<StoryFeedResponse> {
  return apiFetch<StoryFeedResponse>('/stories/feed');
}

// 2. Create a new Story
export async function createStoryApi(payload: CreateStoryPayload): Promise<StoryCreationResponse> {
  return apiFetch<StoryCreationResponse>('/stories', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// 3. Mark Story as Viewed
export async function viewStoryApi(storyId: string): Promise<{ success: boolean }> {
  return apiFetch<{ success: boolean }>(`/stories/${storyId}/view`, {
    method: 'POST',
  });
}

// 4. React to Story
export async function reactStoryApi(storyId: string, emoji: string): Promise<{ success: boolean; reaction: string }> {
  return apiFetch<{ success: boolean; reaction: string }>(`/stories/${storyId}/reaction`, {
    method: 'POST',
    body: JSON.stringify({ emoji }),
  });
}

// 5. Reply to Story (Creates a real chat message)
export async function replyStoryApi(storyId: string, text: string, reaction?: string): Promise<StoryReplyResponse> {
  return apiFetch<StoryReplyResponse>(`/stories/${storyId}/reply`, {
    method: 'POST',
    body: JSON.stringify({ text, reaction }),
  });
}

// 6. Fetch Story Viewers List (Author only)
export async function fetchStoryViewersApi(storyId: string): Promise<StoryViewersResponse> {
  return apiFetch<StoryViewersResponse>(`/stories/${storyId}/viewers`);
}

// 7. Delete Story Slide (Author only)
export async function deleteStoryApi(storyId: string): Promise<{ success: boolean; storyId: string }> {
  return apiFetch<{ success: boolean; storyId: string }>(`/stories/${storyId}`, {
    method: 'DELETE',
  });
}

// 8. Fetch Story Archive (Author only)
export async function fetchStoryArchiveApi(): Promise<StoryArchiveResponse> {
  return apiFetch<StoryArchiveResponse>('/stories/archive');
}
