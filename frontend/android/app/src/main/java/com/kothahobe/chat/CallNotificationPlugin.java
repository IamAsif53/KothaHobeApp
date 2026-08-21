package com.kothahobe.chat;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "CallNotification")
public class CallNotificationPlugin extends Plugin {
    private static final String TAG = "CallNotificationPlugin";
    private static JSObject pendingCallAction = null;
    private static CallNotificationPlugin instance = null;

    @Override
    public void load() {
        super.load();
        instance = this;
        Log.d(TAG, "CallNotificationPlugin loaded");
    }

    public static void handleIncomingIntent(Intent intent) {
        if (intent == null) return;

        Bundle extras = intent.getExtras();
        if (extras == null) return;

        String action = extras.getString("action");
        String callId = extras.getString("callId");

        if (callId == null || callId.isEmpty()) return;
        if (!"incoming_call".equals(action) && !"accept_call".equals(action)) return;

        JSObject data = new JSObject();
        data.put("action", action);
        data.put("callId", callId);
        data.put("callerId", extras.getString("callerId", ""));
        data.put("callerName", extras.getString("callerName", "User"));
        data.put("callerAvatar", extras.getString("callerAvatar", ""));
        data.put("conversationId", extras.getString("conversationId", ""));
        data.put("callType", extras.getString("callType", "voice"));

        Log.d(TAG, "Handling incoming call intent: " + action + " for callId: " + callId);
        pendingCallAction = data;

        // Auto-dismiss native notification from Android notification shade immediately
        if (instance != null && instance.getContext() != null) {
            try {
                NotificationManager nm = (NotificationManager) instance.getContext().getSystemService(Context.NOTIFICATION_SERVICE);
                if (nm != null) {
                    nm.cancel(Math.abs(callId.hashCode()));
                }
                KothaFirebaseMessagingService.removeActiveCall(callId);
            } catch (Exception e) {
                Log.w(TAG, "Error cancelling notification on intent: " + e.getMessage());
            }
        }

        if (instance != null) {
            instance.notifyListeners("callActionReceived", data, true);
        }
    }

    @PluginMethod
    public void getPendingCallAction(PluginCall call) {
        if (pendingCallAction != null) {
            JSObject result = pendingCallAction;
            result.put("hasPending", true);
            pendingCallAction = null;
            call.resolve(result);
        } else {
            JSObject empty = new JSObject();
            empty.put("hasPending", false);
            call.resolve(empty);
        }
    }

    @PluginMethod
    public void dismissCallNotification(PluginCall call) {
        String callId = call.getString("callId");
        if (callId != null && !callId.isEmpty()) {
            NotificationManager nm = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                nm.cancel(Math.abs(callId.hashCode()));
            }
            KothaFirebaseMessagingService.removeActiveCall(callId);
        }
        call.resolve();
    }

    @PluginMethod
    public void getFcmToken(PluginCall call) {
        com.google.firebase.messaging.FirebaseMessaging.getInstance().getToken()
            .addOnCompleteListener(task -> {
                if (task.isSuccessful() && task.getResult() != null) {
                    String token = task.getResult();
                    Log.d(TAG, "Direct FCM Token retrieved: length=" + token.length());
                    JSObject ret = new JSObject();
                    ret.put("token", token);
                    call.resolve(ret);
                } else {
                    String err = task.getException() != null ? task.getException().getMessage() : "Unknown error";
                    Log.w(TAG, "Direct FCM Token error: " + err);
                    call.reject(err);
                }
            });
    }

    @PluginMethod
    public void showLocalTestCallNotification(PluginCall call) {
        String callerName = call.getString("callerName", "Kotha Hobe Test Caller");
        String callId = call.getString("callId", "local_test_" + System.currentTimeMillis());

        java.util.Map<String, String> data = new java.util.HashMap<>();
        data.put("type", "incoming_call");
        data.put("callId", callId);
        data.put("callerName", callerName);
        data.put("callType", "voice");
        data.put("conversationId", "local_diag_test");

        try {
            KothaFirebaseMessagingService.triggerCallNotification(getContext(), data, callId);
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("callId", callId);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Local test notification error: " + e.getMessage());
        }
    }
}
