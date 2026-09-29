package com.kothahobe.chat;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;

import java.net.HttpURLConnection;
import java.net.URL;

public class MarkReadReceiver extends BroadcastReceiver {
    private static final String TAG = "MarkReadReceiver";
    public static final String ACTION_MARK_AS_READ = "com.kothahobe.chat.ACTION_MARK_AS_READ";
    private static final String API_BASE_URL = "https://kotha-hobe-api.onrender.com/api";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;

        final String conversationId = intent.getStringExtra("conversationId");
        final int notificationId = intent.getIntExtra("notificationId", 0);

        Log.d(TAG, "Mark as read received for conversationId: " + conversationId + ", notifId: " + notificationId);

        // 1. Immediately dismiss notification from shade
        NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null && notificationId != 0) {
            notificationManager.cancel(notificationId);
        }

        // 2. Clear in-memory conversation message history
        if (conversationId != null && !conversationId.isEmpty()) {
            KothaFirebaseMessagingService.clearConversationHistory(conversationId);
        }

        // 3. Mark read asynchronously on backend
        if (conversationId != null && !conversationId.isEmpty()) {
            new Thread(() -> {
                HttpURLConnection conn = null;
                try {
                    URL url = new URL(API_BASE_URL + "/conversations/" + conversationId + "/read");
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                    conn.setConnectTimeout(5000);
                    conn.setReadTimeout(5000);

                    SharedPreferences authPrefs = context.getSharedPreferences("kothahobe_auth", Context.MODE_PRIVATE);
                    String token = authPrefs.getString("auth_token", null);
                    if (token == null || token.isEmpty()) {
                        SharedPreferences prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
                        token = prefs.getString("token", null);
                    }

                    if (token != null && !token.isEmpty()) {
                        conn.setRequestProperty("Authorization", "Bearer " + token);
                    }

                    int responseCode = conn.getResponseCode();
                    Log.d(TAG, "Mark as read API response code: " + responseCode);
                } catch (Exception e) {
                    Log.w(TAG, "Failed to send mark as read request: " + e.getMessage());
                } finally {
                    if (conn != null) {
                        conn.disconnect();
                    }
                }
            }).start();
        }
    }
}
