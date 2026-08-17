import admin from '../config/firebaseAdmin';
import { User } from '../models/User';

interface PushNotificationPayload {
  recipientId: string;
  senderName: string;
  messageText: string;
  conversationId: string;
}

export const sendPushNotification = async (payload: PushNotificationPayload): Promise<void> => {
  try {
    const { recipientId, senderName, messageText, conversationId } = payload;
    if (!recipientId) return;

    // Find recipient's registered FCM device tokens
    const recipient = await User.findById(recipientId).select('fcmTokens displayName');
    if (!recipient || !recipient.fcmTokens || recipient.fcmTokens.length === 0) {
      return;
    }

    const tokens = recipient.fcmTokens.filter((t) => typeof t === 'string' && t.length > 10);
    if (tokens.length === 0) return;

    const messagePayload = {
      notification: {
        title: senderName || 'Kotha Hobe',
        body: messageText || 'Sent you a message',
      },
      data: {
        conversationId: String(conversationId),
        senderName: String(senderName || ''),
        type: 'chat_message',
      },
      android: {
        priority: 'high' as const,
        notification: {
          channelId: 'kotha_hobe_messages',
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
    
    // Send to devices using Firebase Admin SDK
    const response = await admin.messaging().sendEachForMulticast(messagePayload);
    console.log(`[FCM] Push result: ${response.successCount} succeeded, ${response.failureCount} failed.`);

    // Clean up stale or unregistered tokens
    if (response.failureCount > 0) {
      const tokensToRemove: string[] = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const error = resp.error;
          if (
            error?.code === 'messaging/invalid-registration-token' ||
            error?.code === 'messaging/registration-token-not-registered'
          ) {
            tokensToRemove.push(tokens[idx]);
          }
        }
      });

      if (tokensToRemove.length > 0) {
        await User.findByIdAndUpdate(recipientId, {
          $pull: { fcmTokens: { $in: tokensToRemove } },
        });
      }
    }
  } catch (error: any) {
    console.warn('[FCM] Push dispatch notice:', error?.message || error);
  }
};
