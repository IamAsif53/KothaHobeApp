package com.kothahobe.chat;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;
import androidx.core.app.RemoteInput;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

public class MessageReplyReceiver extends BroadcastReceiver {
    private static final String TAG = "MessageReplyReceiver";
    public static final String ACTION_REPLY_MESSAGE = "com.kothahobe.chat.ACTION_REPLY_MESSAGE";
    public static final String KEY_TEXT_REPLY = "key_text_reply";
    private static final String API_BASE_URL = "https://kotha-hobe-api.onrender.com/api";
    private static final int MAX_REPLY_WORDS = 50;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;

        String action = intent.getAction();
        final String conversationId = intent.getStringExtra("conversationId");
        final int notificationId = intent.getIntExtra("notificationId", 0);

        Log.d(TAG, "Received reply action: " + action + " for conversationId: " + conversationId);

        Bundle remoteInput = RemoteInput.getResultsFromIntent(intent);
        if (remoteInput == null || conversationId == null || conversationId.isEmpty()) {
            Log.w(TAG, "No remoteInput or conversationId found in intent");
            return;
        }

        CharSequence replyCharSequence = remoteInput.getCharSequence(KEY_TEXT_REPLY);
        if (replyCharSequence == null) {
            Log.w(TAG, "Empty replyCharSequence received");
            return;
        }

        String rawReplyText = replyCharSequence.toString().trim();
        if (rawReplyText.isEmpty()) {
            return;
        }

        // Apply word count constraint
        String[] words = rawReplyText.split("\\s+");
        StringBuilder constrainedTextBuilder = new StringBuilder();
        int count = 0;
        for (String word : words) {
            if (word.isEmpty()) continue;
            if (count >= MAX_REPLY_WORDS) break;
            if (count > 0) constrainedTextBuilder.append(" ");
            constrainedTextBuilder.append(word);
            count++;
        }
        final String replyText = constrainedTextBuilder.toString();

        Log.d(TAG, "Submitting direct reply (" + count + " words): " + replyText);

        // Cancel notification in notification bar immediately upon sending
        NotificationManager notificationManager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (notificationManager != null && notificationId != 0) {
            notificationManager.cancel(notificationId);
        }

        // Send direct reply asynchronously to backend REST API
        new Thread(() -> {
            HttpURLConnection conn = null;
            try {
                URL url = new URL(API_BASE_URL + "/messages/reply-direct");
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                conn.setConnectTimeout(6000);
                conn.setReadTimeout(6000);
                conn.setDoOutput(true);

                // Retrieve auth token from SharedPreferences
                SharedPreferences authPrefs = context.getSharedPreferences("kothahobe_auth", Context.MODE_PRIVATE);
                String token = authPrefs.getString("auth_token", null);
                if (token == null || token.isEmpty()) {
                    SharedPreferences prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
                    token = prefs.getString("token", null);
                }
                if (token != null && !token.isEmpty()) {
                    conn.setRequestProperty("Authorization", "Bearer " + token);
                } else {
                    Log.w(TAG, "No auth token found in SharedPreferences for direct reply");
                }

                String clientMessageId = "notif_reply_" + System.currentTimeMillis();
                String escapedText = replyText.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", "\\n");
                String jsonPayload = "{\"conversationId\":\"" + conversationId + "\",\"text\":\"" + escapedText + "\",\"clientMessageId\":\"" + clientMessageId + "\"}";

                byte[] input = jsonPayload.getBytes(StandardCharsets.UTF_8);
                try (OutputStream os = conn.getOutputStream()) {
                    os.write(input, 0, input.length);
                    os.flush();
                }

                int responseCode = conn.getResponseCode();
                Log.d(TAG, "Direct Reply API response code: " + responseCode);
                if (responseCode >= 200 && responseCode < 300) {
                    Log.d(TAG, "Direct reply sent successfully!");
                } else {
                    try {
                        java.io.InputStream errStream = conn.getErrorStream();
                        if (errStream != null) {
                            java.util.Scanner s = new java.util.Scanner(errStream).useDelimiter("\\A");
                            String errBody = s.hasNext() ? s.next() : "";
                            Log.e(TAG, "Direct reply error body: " + errBody);
                        }
                    } catch (Exception ignored) {}
                }
            } catch (Exception e) {
                Log.e(TAG, "Failed to send direct reply API request: " + e.getMessage());
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        }).start();
    }
}
