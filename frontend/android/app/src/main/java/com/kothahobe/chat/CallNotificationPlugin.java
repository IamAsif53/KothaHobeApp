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
        data.put("callerName", extras.getString("callerName", "User"));
        data.put("callerAvatar", extras.getString("callerAvatar", ""));
        data.put("conversationId", extras.getString("conversationId", ""));
        data.put("callType", extras.getString("callType", "voice"));

        Log.d(TAG, "Handling incoming call intent: " + action + " for callId: " + callId);
        pendingCallAction = data;

        if (instance != null) {
            instance.notifyListeners("callActionReceived", data, true);
        }
    }

    @PluginMethod
    public void getPendingCallAction(PluginCall call) {
        if (pendingCallAction != null) {
            JSObject result = pendingCallAction;
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
}
