package com.kothahobe.chat;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import com.capacitorjs.plugins.pushnotifications.PushNotificationsPlugin;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

public class KothaFirebaseMessagingService extends FirebaseMessagingService {
    private static final String TAG = "KothaFCMService";
    public static final String CALL_CHANNEL_ID = "incoming_calls_ringtone_v4";
    public static final String CHAT_CHANNEL_ID = "chat_messages";

    // Deduplication tracking: callId -> timestamp
    private static final ConcurrentHashMap<String, Long> activeCallNotifications = new ConcurrentHashMap<>();

    public static void removeActiveCall(String callId) {
        if (callId != null) {
            activeCallNotifications.remove(callId);
        }
    }

    public static void createNotificationChannels(Context context) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (notificationManager == null) return;

            // 1. Chat Messages Channel
            NotificationChannel chatChannel = new NotificationChannel(
                CHAT_CHANNEL_ID,
                "Chat Messages",
                NotificationManager.IMPORTANCE_HIGH
            );
            chatChannel.setDescription("Incoming chat and media messages");
            chatChannel.enableVibration(true);
            chatChannel.setVibrationPattern(new long[]{0, 250, 250, 250});
            chatChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
            chatChannel.enableLights(true);

            Uri defaultNotifSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            if (defaultNotifSound != null) {
                AudioAttributes chatAudioAttr = new AudioAttributes.Builder()
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_COMMUNICATION_INSTANT)
                    .build();
                chatChannel.setSound(defaultNotifSound, chatAudioAttr);
            }
            notificationManager.createNotificationChannel(chatChannel);

            // 2. Incoming Calls Channel (High Priority / Full-Screen / Ringtone)
            NotificationChannel callChannel = new NotificationChannel(
                CALL_CHANNEL_ID,
                "Incoming Calls",
                NotificationManager.IMPORTANCE_HIGH
            );
            callChannel.setDescription("Full-screen notifications, sound and vibration for incoming voice and video calls");
            callChannel.enableVibration(true);
            long[] vibrationPattern = new long[]{0, 1000, 500, 1000, 500, 1000, 500, 1000};
            callChannel.setVibrationPattern(vibrationPattern);
            callChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

            Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            if (ringtoneUri == null) {
                ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            }

            AudioAttributes callAudioAttr = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setFlags(AudioAttributes.FLAG_AUDIBILITY_ENFORCED)
                .build();
            callChannel.setSound(ringtoneUri, callAudioAttr);
            callChannel.setBypassDnd(true);
            callChannel.enableLights(true);

            notificationManager.createNotificationChannel(callChannel);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannels(this);
    }

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        Log.d(TAG, "New FCM Token received in KothaFirebaseMessagingService");
        PushNotificationsPlugin.onNewToken(token);
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        createNotificationChannels(this);

        Map<String, String> data = remoteMessage.getData();
        Log.d(TAG, "FCM payload received: size=" + data.size() + ", data=" + data);

        String type = data.get("type");
        String callId = data.get("callId");

        // 1. Handle Incoming Call Push
        if ("incoming_call".equals(type) && callId != null && !callId.isEmpty()) {
            Log.d(TAG, "[NATIVE FCM] Intercepted incoming_call push for callId: " + callId);
            handleIncomingCallPush(data, callId);
            return;
        }

        // 2. Handle Call Cancellation / Timeout Push
        if (("call_cancelled".equals(type) || "call_ended".equals(type) || "call_timeout".equals(type)) && callId != null) {
            Log.d(TAG, "[NATIVE FCM] Intercepted call cancellation push for callId: " + callId);
            handleCallCancelledPush(callId);
            return;
        }

        // 3. Handle Regular Text / Media Chat Messages (Build & Post Native Notification)
        Log.d(TAG, "[NATIVE FCM] Building and posting native chat message notification");
        handleChatMessagePush(remoteMessage, data);

        // Also pass to Capacitor plugin for foreground web listeners if active
        try {
            PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
        } catch (Exception e) {
            Log.w(TAG, "Capacitor push forwarding note: " + e.getMessage());
        }
    }

    private void handleIncomingCallPush(Map<String, String> data, String callId) {
        triggerCallNotification(this, data, callId);
    }

    public static void triggerCallNotification(Context context, Map<String, String> data, String callId) {
        createNotificationChannels(context);

        long now = System.currentTimeMillis();
        Long previousTimestamp = activeCallNotifications.get(callId);

        // Deduplicate: If notification was already shown for this callId within last 45 seconds, ignore
        if (previousTimestamp != null && (now - previousTimestamp) < 45000) {
            Log.d(TAG, "Ignoring duplicate incoming call notification for callId: " + callId);
            return;
        }
        activeCallNotifications.put(callId, now);

        String callerId = data.get("callerId");
        String callerName = data.get("callerName");
        if (callerName == null || callerName.trim().isEmpty()) {
            callerName = "Kotha Hobe User";
        }
        String callerAvatar = data.get("callerAvatar");
        String conversationId = data.get("conversationId");
        String callType = data.get("callType");
        if (callType == null) callType = "voice";

        Log.d(TAG, "Showing native incoming call notification for callId: " + callId + " from: " + callerName);

        // Wake screen safely with WakeLock
        PowerManager powerManager = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            try {
                PowerManager.WakeLock wakeLock = powerManager.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK |
                    PowerManager.ACQUIRE_CAUSES_WAKEUP |
                    PowerManager.ON_AFTER_RELEASE,
                    "kothahobe:incoming_call_wake"
                );
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire(8000);
            } catch (Exception e) {
                Log.w(TAG, "WakeLock acquisition notice: " + e.getMessage());
            }
        }

        NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager == null) return;

        Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        if (ringtoneUri == null) {
            ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        }
        long[] vibrationPattern = new long[]{0, 1000, 500, 1000, 500, 1000, 500, 1000};

        // Full-screen / Tap Intent: Launches MainActivity
        Intent fullScreenIntent = new Intent(context, MainActivity.class);
        fullScreenIntent.setAction(Intent.ACTION_MAIN);
        fullScreenIntent.addCategory(Intent.CATEGORY_LAUNCHER);
        fullScreenIntent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK |
            Intent.FLAG_ACTIVITY_CLEAR_TOP |
            Intent.FLAG_ACTIVITY_SINGLE_TOP |
            Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
        );
        fullScreenIntent.putExtra("action", "incoming_call");
        fullScreenIntent.putExtra("callId", callId);
        fullScreenIntent.putExtra("callerId", callerId);
        fullScreenIntent.putExtra("callerName", callerName);
        fullScreenIntent.putExtra("callerAvatar", callerAvatar);
        fullScreenIntent.putExtra("conversationId", conversationId);
        fullScreenIntent.putExtra("callType", callType);

        int reqCode = Math.abs(callId.hashCode());
        PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(
            context,
            reqCode,
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        // Accept Action Intent: Launches MainActivity with action "accept_call"
        Intent acceptIntent = new Intent(context, MainActivity.class);
        acceptIntent.setAction(Intent.ACTION_MAIN);
        acceptIntent.addCategory(Intent.CATEGORY_LAUNCHER);
        acceptIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        acceptIntent.putExtra("action", "accept_call");
        acceptIntent.putExtra("callId", callId);
        acceptIntent.putExtra("callerId", callerId);
        acceptIntent.putExtra("callerName", callerName);
        acceptIntent.putExtra("callerAvatar", callerAvatar);
        acceptIntent.putExtra("conversationId", conversationId);
        acceptIntent.putExtra("callType", callType);

        PendingIntent acceptPendingIntent = PendingIntent.getActivity(
            context,
            reqCode + 1,
            acceptIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        // Decline Action Intent: Triggers BroadcastReceiver to decline without opening app UI
        Intent declineIntent = new Intent(context, CallActionReceiver.class);
        declineIntent.putExtra("action", "decline_call");
        declineIntent.putExtra("callId", callId);
        declineIntent.putExtra("conversationId", conversationId);

        PendingIntent declinePendingIntent = PendingIntent.getBroadcast(
            context,
            reqCode + 2,
            declineIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        String callTypeLabel = "video".equalsIgnoreCase(callType) ? "Video" : "Voice";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CALL_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Incoming " + callTypeLabel + " Call")
            .setContentText(callerName + " is calling you...")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .setContentIntent(fullScreenPendingIntent)
            .setAutoCancel(true)
            .setOngoing(true)
            .setTimeoutAfter(45000)
            .setSound(ringtoneUri)
            .setVibrate(vibrationPattern)
            .addAction(R.drawable.ic_call_decline, "Decline", declinePendingIntent)
            .addAction(R.drawable.ic_call_accept, "Accept", acceptPendingIntent);

        Notification notification = builder.build();
        notification.flags |= Notification.FLAG_INSISTENT;
        notificationManager.notify(reqCode, notification);
    }

    private void handleCallCancelledPush(String callId) {
        Log.d(TAG, "Cancelling incoming call notification for callId: " + callId);
        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null) {
            notificationManager.cancel(Math.abs(callId.hashCode()));
        }
        removeActiveCall(callId);
    }

    private void handleChatMessagePush(RemoteMessage remoteMessage, Map<String, String> data) {
        String title = null;
        String body = null;

        if (remoteMessage.getNotification() != null) {
            title = remoteMessage.getNotification().getTitle();
            body = remoteMessage.getNotification().getBody();
        }

        if (title == null || title.trim().isEmpty()) {
            title = data.get("senderName");
        }
        if (title == null || title.trim().isEmpty()) {
            title = "Kotha Hobe";
        }

        if (body == null || body.trim().isEmpty()) {
            body = data.get("messageText");
        }
        if (body == null || body.trim().isEmpty()) {
            body = data.get("text");
        }
        if (body == null || body.trim().isEmpty()) {
            body = "Sent you a message";
        }

        String conversationId = data.get("conversationId");
        String senderId = data.get("senderId");
        String messageId = data.get("messageId");

        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager == null) return;

        createNotificationChannels(this);

        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction(Intent.ACTION_MAIN);
        intent.addCategory(Intent.CATEGORY_LAUNCHER);
        intent.addFlags(
            Intent.FLAG_ACTIVITY_NEW_TASK |
            Intent.FLAG_ACTIVITY_CLEAR_TOP |
            Intent.FLAG_ACTIVITY_SINGLE_TOP
        );
        intent.putExtra("action", "open_chat");
        if (conversationId != null) intent.putExtra("conversationId", conversationId);
        if (senderId != null) intent.putExtra("senderId", senderId);
        if (messageId != null) intent.putExtra("messageId", messageId);

        int notifId = conversationId != null ? Math.abs(conversationId.hashCode()) : (int) System.currentTimeMillis();

        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            notifId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        Uri defaultSoundUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHAT_CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setSound(defaultSoundUri)
            .setVibrate(new long[]{0, 250, 250, 250})
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(pendingIntent);

        if (conversationId != null && !conversationId.isEmpty()) {
            builder.setGroup(conversationId);
        }

        notificationManager.notify(notifId, builder.build());
    }
}
