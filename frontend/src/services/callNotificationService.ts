import { registerPlugin, Capacitor, PluginListenerHandle } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';

export interface PendingCallAction {
  hasPending: boolean;
  action?: string;
  callId?: string;
  callerId?: string;
  callerName?: string;
  callerAvatar?: string;
  conversationId?: string;
  callType?: 'voice' | 'video';
}

export interface CallNotificationPluginInterface {
  getPendingCallAction(): Promise<PendingCallAction>;
  dismissCallNotification(options?: { callId?: string }): Promise<void>;
  getFcmToken(): Promise<{ token: string }>;
  showLocalTestCallNotification(options: { callerName: string; callId: string }): Promise<any>;
  addListener(
    eventName: 'callActionReceived' | 'chatNotificationOpened',
    listenerFunc: (data: any) => void
  ): Promise<PluginListenerHandle>;
}

export const NativeCallNotification = registerPlugin<CallNotificationPluginInterface>('CallNotification');

/**
 * Universal helper to immediately dismiss native Android & Local notifications for calls
 */
export async function dismissCallNotification(callId?: string): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      await NativeCallNotification.dismissCallNotification({ callId });
      try {
        await LocalNotifications.removeAllDeliveredNotifications();
      } catch {}
    }
  } catch (err) {
    console.warn('[CallNotificationService] dismiss error:', err);
  }
}
