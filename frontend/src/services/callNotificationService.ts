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
  setAuthCredentials(options: { token: string; userId?: string }): Promise<void>;
  clearAuthCredentials(): Promise<void>;
  setActiveConversation(options: { conversationId: string }): Promise<void>;
  clearActiveConversation(): Promise<void>;
  addListener(
    eventName: 'callActionReceived' | 'chatNotificationOpened' | 'messageSentFromNotification',
    listenerFunc: (data: any) => void
  ): Promise<PluginListenerHandle>;
}

export const NativeCallNotification = registerPlugin<CallNotificationPluginInterface>('CallNotification');

/**
 * Mirror JWT credentials to native Android SharedPreferences for background notification direct reply
 */
export async function setNativeAuthCredentials(token: string, userId?: string): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      await NativeCallNotification.setAuthCredentials({ token, userId });
    }
  } catch (err) {
    console.warn('[CallNotificationService] setNativeAuthCredentials error:', err);
  }
}

/**
 * Clear native Android SharedPreferences auth credentials on logout
 */
export async function clearNativeAuthCredentials(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      await NativeCallNotification.clearAuthCredentials();
    }
  } catch (err) {
    console.warn('[CallNotificationService] clearNativeAuthCredentials error:', err);
  }
}

/**
 * Inform native Android layer of currently active chat room to suppress push notifications when looking at this chat
 */
export async function setNativeActiveConversation(conversationId: string): Promise<void> {
  try {
    if (Capacitor.isNativePlatform() && conversationId) {
      await NativeCallNotification.setActiveConversation({ conversationId });
    }
  } catch (err) {
    console.warn('[CallNotificationService] setNativeActiveConversation error:', err);
  }
}

/**
 * Clear active chat room in native Android layer so notifications resume normally
 */
export async function clearNativeActiveConversation(): Promise<void> {
  try {
    if (Capacitor.isNativePlatform()) {
      await NativeCallNotification.clearActiveConversation();
    }
  } catch (err) {
    console.warn('[CallNotificationService] clearNativeActiveConversation error:', err);
  }
}

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
