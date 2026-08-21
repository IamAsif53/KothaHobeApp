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
    public static final String CALL_CHANNEL_ID = "incoming_calls";

    // Deduplication tracking: callId -> timestamp
    private static final ConcurrentHashMap<String, Long> activeCallNotifications = new ConcurrentHashMap<>();

    public static void removeActiveCall(String callId) {
        if (callId != null) {
            activeCallNotifications.remove(callId);
        }
    }

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        PushNotificationsPlugin.onNewToken(token);
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        Log.d(TAG, "FCM payload received. Data size: " + data.size());

        String type = data.get("type");
        String callId = data.get("callId");

        // 1. Handle Incoming Call Push
        if ("incoming_call".equals(type) && callId != null && !callId.isEmpty()) {
            handleIncomingCallPush(data, callId);
            return;
        }

        // 2. Handle Call Cancellation / Timeout Push
        if (("call_cancelled".equals(type) || "call_ended".equals(type) || "call_timeout".equals(type)) && callId != null) {
            handleCallCancelledPush(callId);
            return;
        }

        // 3. Delegate regular text / media chat messages to Capacitor push plugin
        super.onMessageReceived(remoteMessage);
        PushNotificationsPlugin.sendRemoteMessage(remoteMessage);
    }

    private void handleIncomingCallPush(Map<String, String> data, String callId) {
        long now = System.currentTimeMillis();
        Long previousTimestamp = activeCallNotifications.get(callId);

        // Deduplicate: If notification was already shown for this callId within last 45 seconds, ignore
        if (previousTimestamp != null && (now - previousTimestamp) < 45000) {
            Log.d(TAG, "Ignoring duplicate incoming call notification for callId: " + callId);
            return;
        }
        activeCallNotifications.put(callId, now);

        String callerName = data.get("callerName");
        if (callerName == null || callerName.trim().isEmpty()) {
            callerName = "Kotha Hobe User";
        }
        String callerAvatar = data.get("callerAvatar");
        String conversationId = data.get("conversationId");
        String callType = data.get("callType");
        if (callType == null) callType = "voice";

        Log.d(TAG, "Showing native incoming call notification for callId: " + callId + " from: " + callerName);

        // Wake screen safely with short-lived WakeLock (3-second timeout)
        PowerManager powerManager = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (powerManager != null) {
            PowerManager.WakeLock wakeLock = null;
            try {
                wakeLock = powerManager.newWakeLock(
                    PowerManager.FULL_WAKE_LOCK |
                    PowerManager.ACQUIRE_CAUSES_WAKEUP |
                    PowerManager.ON_AFTER_RELEASE,
                    "kothahobe:incoming_call_wake"
                );
                wakeLock.acquire(3000);
            } catch (Exception e) {
                Log.w(TAG, "WakeLock acquisition warning: " + e.getMessage());
            } finally {
                if (wakeLock != null && wakeLock.isHeld()) {
                    try {
                        wakeLock.release();
                    } catch (Exception ignored) {}
                }
            }
        }

        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager == null) return;

        Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
        long[] vibrationPattern = new long[]{0, 1000, 1000, 1000, 1000, 1000};

        // Create high-priority incoming calls notification channel for Android 8.0+ (API 26+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CALL_CHANNEL_ID,
                "Incoming Calls",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Full-screen notifications and ringtone for incoming voice and video calls");
            channel.enableVibration(true);
            channel.setVibrationPattern(vibrationPattern);
            channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);

            AudioAttributes audioAttributes = new AudioAttributes.Builder()
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .build();
            channel.setSound(ringtoneUri, audioAttributes);
            channel.setBypassDnd(true);

            notificationManager.createNotificationChannel(channel);
        }

        // Full-screen / Tap Intent: Launches MainActivity
        Intent fullScreenIntent = new Intent(this, MainActivity.class);
        fullScreenIntent.setAction(Intent.ACTION_MAIN);
        fullScreenIntent.addCategory(Intent.CATEGORY_LAUNCHER);
        fullScreenIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        fullScreenIntent.putExtra("action", "incoming_call");
        fullScreenIntent.putExtra("callId", callId);
        fullScreenIntent.putExtra("callerName", callerName);
        fullScreenIntent.putExtra("callerAvatar", callerAvatar);
        fullScreenIntent.putExtra("conversationId", conversationId);
        fullScreenIntent.putExtra("callType", callType);

        int reqCode = Math.abs(callId.hashCode());
        PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(
            this,
            reqCode,
            fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        // Accept Action Intent: Launches MainActivity with action "accept_call"
        Intent acceptIntent = new Intent(this, MainActivity.class);
        acceptIntent.setAction(Intent.ACTION_MAIN);
        acceptIntent.addCategory(Intent.CATEGORY_LAUNCHER);
        acceptIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        acceptIntent.putExtra("action", "accept_call");
        acceptIntent.putExtra("callId", callId);
        acceptIntent.putExtra("callerName", callerName);
        acceptIntent.putExtra("callerAvatar", callerAvatar);
        acceptIntent.putExtra("conversationId", conversationId);
        acceptIntent.putExtra("callType", callType);

        PendingIntent acceptPendingIntent = PendingIntent.getActivity(
            this,
            reqCode + 1,
            acceptIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        // Decline Action Intent: Triggers BroadcastReceiver to decline without opening app UI
        Intent declineIntent = new Intent(this, CallActionReceiver.class);
        declineIntent.putExtra("action", "decline_call");
        declineIntent.putExtra("callId", callId);
        declineIntent.putExtra("conversationId", conversationId);

        PendingIntent declinePendingIntent = PendingIntent.getBroadcast(
            this,
            reqCode + 2,
            declineIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0)
        );

        String callTypeLabel = "video".equalsIgnoreCase(callType) ? "Video" : "Voice";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CALL_CHANNEL_ID)
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

        notificationManager.notify(reqCode, builder.build());
    }

    private void handleCallCancelledPush(String callId) {
        Log.d(TAG, "Cancelling incoming call notification for callId: " + callId);
        NotificationManager notificationManager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null) {
            notificationManager.cancel(Math.abs(callId.hashCode()));
        }
        removeActiveCall(callId);
    }
}
