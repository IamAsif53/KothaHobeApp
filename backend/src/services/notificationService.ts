import admin, { isFirebaseReady } from '../config/firebaseAdmin';
import { User } from '../models/User';

export interface PushNotificationPayload {
  recipientId: string;
  senderName: string;
  messageText: string;
  conversationId: string;
  senderId?: string;
  messageId?: string;
}

export interface PushResult {
  success: boolean;
  attempted: number;
  successCount: number;
  failureCount: number;
  message?: string;
  error?: string;
}

export const sendPushNotification = async (payload: PushNotificationPayload): Promise<PushResult> => {
  try {
    const { recipientId, senderName, messageText, conversationId, senderId, messageId } = payload;
    if (!recipientId) {
      return { success: false, attempted: 0, successCount: 0, failureCount: 0, message: 'Missing recipientId' };
    }

    if (!isFirebaseReady()) {
      console.warn('[FCM] Push skipped: Firebase Admin service account is not yet configured on server.');
      return {
        success: false,
        attempted: 0,
        successCount: 0,
        failureCount: 0,
        message: 'Firebase Admin credentials not configured on server (FIREBASE_SERVICE_ACCOUNT required)',
      };
    }

    // Find recipient's registered FCM device tokens
    const recipient = await User.findById(recipientId).select('fcmTokens displayName');
    if (!recipient || !recipient.fcmTokens || recipient.fcmTokens.length === 0) {
      console.log(`[FCM] User ${recipientId} has no registered FCM tokens.`);
      return { success: true, attempted: 0, successCount: 0, failureCount: 0, message: 'No registered device tokens' };
    }

    const tokens = recipient.fcmTokens.filter((t) => typeof t === 'string' && t.trim().length > 10);
    if (tokens.length === 0) {
      return { success: true, attempted: 0, successCount: 0, failureCount: 0, message: 'No valid device tokens' };
    }

    const messagePayload = {
      notification: {
        title: senderName || 'Kotha Hobe',
        body: messageText || 'Sent you a message',
      },
      data: {
        type: 'chat_message',
        conversationId: String(conversationId || ''),
        senderId: String(senderId || ''),
        messageId: String(messageId || ''),
        senderName: String(senderName || ''),
      },
      android: {
        priority: 'high' as const,
        notification: {
          channelId: 'chat_messages',
          sound: 'default',
          priority: 'max' as const,
          defaultSound: true,
          defaultVibrateTimings: true,
          visibility: 'public' as const,
        },
      },
      tokens,
    };

    console.log(`[FCM] Dispatching push notification to ${tokens.length} device(s) for user ${recipientId}`);
    
    const response = await admin.messaging().sendEachForMulticast(messagePayload);
    console.log(`[FCM] Push result: ${response.successCount} succeeded, ${response.failureCount} failed.`);

    // Automatically remove stale or unregistered tokens
    if (response.failureCount > 0) {
      const tokensToRemove: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const error = resp.error;
          console.warn(`[FCM] Token delivery error for device ${idx}:`, error?.code, error?.message);
          if (
            error?.code === 'messaging/invalid-registration-token' ||
            error?.code === 'messaging/registration-token-not-registered'
          ) {
            tokensToRemove.push(tokens[idx]);
          }
        }
      });

      if (tokensToRemove.length > 0) {
        console.log(`[FCM] Pruning ${tokensToRemove.length} invalid token(s)...`);
        await User.findByIdAndUpdate(recipientId, {
          $pull: { fcmTokens: { $in: tokensToRemove } },
        });
      }
    }

    return {
      success: response.successCount > 0,
      attempted: tokens.length,
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error: any) {
    console.error('[FCM] Push dispatch error:', error?.message || error);
    return {
      success: false,
      attempted: 0,
      successCount: 0,
      failureCount: 0,
      error: error?.message || 'Push dispatch failed',
    };
  }
};

export interface CallPushNotificationPayload {
  recipientId: string;
  callerId: string;
  callerName: string;
  callerAvatar?: string;
  callId: string;
  conversationId: string;
  callType?: 'voice' | 'video';
}

export const sendCallPushNotification = async (payload: CallPushNotificationPayload): Promise<PushResult> => {
  try {
    const { recipientId, callerId, callerName, callerAvatar, callId, conversationId, callType = 'voice' } = payload;
    if (!recipientId || !callId) {
      return { success: false, attempted: 0, successCount: 0, failureCount: 0, message: 'Missing recipientId or callId' };
    }

    if (!isFirebaseReady()) {
      console.warn('[FCM] Call push skipped: Firebase Admin not ready.');
      return { success: false, attempted: 0, successCount: 0, failureCount: 0, message: 'Firebase Admin not configured' };
    }

    console.log(`[CALL PUSH] Initiating call push. callId=${callId}, recipient=${recipientId}, caller=${callerName} (${callerId})`);

    const recipient = await User.findById(recipientId).select('fcmTokens displayName');
    if (!recipient || !recipient.fcmTokens || recipient.fcmTokens.length === 0) {
      console.warn(`[CALL PUSH] Token found=NO for recipient ${recipientId}`);
      return { success: true, attempted: 0, successCount: 0, failureCount: 0, message: 'No registered tokens' };
    }

    const tokens = recipient.fcmTokens.filter((t) => typeof t === 'string' && t.trim().length > 10);
    if (tokens.length === 0) {
      console.warn(`[CALL PUSH] Token found=NO (all empty/invalid) for recipient ${recipientId}`);
      return { success: true, attempted: 0, successCount: 0, failureCount: 0, message: 'No valid tokens' };
    }

    console.log(`[CALL PUSH] Token found=YES (${tokens.length} device token(s)). Dispatching high-priority FCM payload for callId=${callId}`);

    // High-priority Data message: Directly triggers KothaFirebaseMessagingService on all Android states
    const messagePayload = {
      data: {
        type: 'incoming_call',
        callId: String(callId),
        callerId: String(callerId),
        callerName: String(callerName || 'Unknown'),
        callerAvatar: String(callerAvatar || ''),
        conversationId: String(conversationId || ''),
        callType: String(callType),
      },
      android: {
        priority: 'high' as const,
        ttl: 45 * 1000, // 45s TTL for incoming call
      },
      tokens,
    };

    const response = await admin.messaging().sendEachForMulticast(messagePayload);
    console.log(`[CALL PUSH] FCM send result for callId=${callId}: successCount=${response.successCount}, failureCount=${response.failureCount}`);

    // Automatically remove stale or unregistered tokens
    if (response.failureCount > 0) {
      const tokensToRemove: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const error = resp.error;
          console.warn(`[CALL PUSH] FCM delivery failure on token ${idx}:`, error?.code, error?.message);
          if (
            error?.code === 'messaging/invalid-registration-token' ||
            error?.code === 'messaging/registration-token-not-registered'
          ) {
            tokensToRemove.push(tokens[idx]);
          }
        }
      });

      if (tokensToRemove.length > 0) {
        console.log(`[CALL PUSH] Pruning ${tokensToRemove.length} invalid token(s)...`);
        await User.findByIdAndUpdate(recipientId, {
          $pull: { fcmTokens: { $in: tokensToRemove } },
        });
      }
    }

    return {
      success: response.successCount > 0,
      attempted: tokens.length,
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error: any) {
    console.error(`[CALL PUSH] FCM send error for callId=${payload?.callId}:`, error?.message || error);
    return {
      success: false,
      attempted: 0,
      successCount: 0,
      failureCount: 0,
      error: error?.message || 'Call push dispatch failed',
    };
  }
};

export const sendCallCancelledPushNotification = async (payload: { recipientId: string; callId: string }): Promise<PushResult> => {
  try {
    const { recipientId, callId } = payload;
    if (!recipientId || !callId || !isFirebaseReady()) {
      return { success: false, attempted: 0, successCount: 0, failureCount: 0, message: 'Invalid payload or FCM not ready' };
    }

    const recipient = await User.findById(recipientId).select('fcmTokens');
    if (!recipient || !recipient.fcmTokens || recipient.fcmTokens.length === 0) {
      return { success: true, attempted: 0, successCount: 0, failureCount: 0, message: 'No registered tokens' };
    }

    const tokens = recipient.fcmTokens.filter((t) => typeof t === 'string' && t.trim().length > 10);
    if (tokens.length === 0) {
      return { success: true, attempted: 0, successCount: 0, failureCount: 0, message: 'No valid tokens' };
    }

    const messagePayload = {
      data: {
        type: 'call_cancelled',
        callId: String(callId),
      },
      android: {
        priority: 'high' as const,
        ttl: 15 * 1000,
      },
      tokens,
    };

    console.log(`[CALL CANCEL PUSH] Dispatching call cancellation for callId=${callId} to ${tokens.length} token(s)`);
    const response = await admin.messaging().sendEachForMulticast(messagePayload);
    console.log(`[CALL CANCEL PUSH] Result for callId=${callId}: successCount=${response.successCount}, failureCount=${response.failureCount}`);
    return {
      success: response.successCount > 0,
      attempted: tokens.length,
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error: any) {
    console.error('[FCM] Call cancel push error:', error?.message || error);
    return { success: false, attempted: 0, successCount: 0, failureCount: 0 };
  }
};

