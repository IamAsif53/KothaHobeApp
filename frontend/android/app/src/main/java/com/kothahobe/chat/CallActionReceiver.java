package com.kothahobe.chat;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.util.Log;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class CallActionReceiver extends BroadcastReceiver {
    private static final String TAG = "CallActionReceiver";
    private static final String API_BASE_URL = "https://kotha-hobe-api.onrender.com/api";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;

        String action = intent.getStringExtra("action");
        final String callId = intent.getStringExtra("callId");

        Log.d(TAG, "Received call action: " + action + " for callId: " + callId);

        if (callId == null || callId.isEmpty()) return;

        // 1. Cancel Native Notification immediately & remove from active calls
        NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null) {
            notificationManager.cancel(callId.hashCode());
        }
        KothaFirebaseMessagingService.removeActiveCall(callId);

        // 2. If action is decline_call, notify backend REST API asynchronously
        if ("decline_call".equals(action)) {
            new Thread(() -> {
                HttpURLConnection conn = null;
                try {
                    URL url = new URL(API_BASE_URL + "/calls/decline");
                    conn = (HttpURLConnection) url.openConnection();
                    conn.setRequestMethod("POST");
                    conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                    conn.setConnectTimeout(5000);
                    conn.setReadTimeout(5000);
                    conn.setDoOutput(true);

                    // Retrieve auth token if stored in SharedPreferences
                    SharedPreferences prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
                    String token = prefs.getString("token", null);
                    if (token == null) {
                        SharedPreferences authPrefs = context.getSharedPreferences("kothahobe_auth", Context.MODE_PRIVATE);
                        token = authPrefs.getString("auth_token", null);
                    }
                    if (token != null && !token.isEmpty()) {
                        conn.setRequestProperty("Authorization", "Bearer " + token);
                    }

                    String jsonPayload = "{\"callId\":\"" + callId + "\"}";
                    byte[] input = jsonPayload.getBytes(StandardCharsets.UTF_8);

                    try (OutputStream os = conn.getOutputStream()) {
                        os.write(input, 0, input.length);
                        os.flush();
                    }

                    int responseCode = conn.getResponseCode();
                    Log.d(TAG, "Decline API response code: " + responseCode);
                } catch (Exception e) {
                    Log.e(TAG, "Failed to send decline API request: " + e.getMessage());
                } finally {
                    if (conn != null) {
                        conn.disconnect();
                    }
                }
            }).start();
        }
    }
}
