import { apiFetch } from './client';
import { INotificationSettings } from '../types';

export interface NotificationSettingsResponse {
  success: boolean;
  notificationSettings: INotificationSettings;
  message?: string;
}

export async function getNotificationSettingsApi(): Promise<NotificationSettingsResponse> {
  return apiFetch<NotificationSettingsResponse>('/users/notifications');
}

export async function updateNotificationSettingsApi(
  settings: Partial<INotificationSettings>
): Promise<NotificationSettingsResponse> {
  return apiFetch<NotificationSettingsResponse>('/users/notifications', {
    method: 'PUT',
    body: JSON.stringify(settings),
  });
}
