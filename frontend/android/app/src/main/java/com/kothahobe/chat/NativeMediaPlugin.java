package com.kothahobe.chat;

import android.Manifest;
import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothHeadset;
import android.bluetooth.BluetoothProfile;
import android.content.BroadcastReceiver;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.media.AudioDeviceInfo;
import android.media.AudioManager;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.os.PowerManager;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import android.util.Log;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.List;

@CapacitorPlugin(
    name = "NativeMedia",
    permissions = {
        @Permission(
            alias = "audio",
            strings = { Manifest.permission.RECORD_AUDIO, Manifest.permission.MODIFY_AUDIO_SETTINGS }
        ),
        @Permission(
            alias = "camera",
            strings = { Manifest.permission.CAMERA }
        )
    }
)
public class NativeMediaPlugin extends Plugin {
    private static final String TAG = "NativeMediaPlugin";
    private PowerManager.WakeLock proximityWakeLock = null;
    private BroadcastReceiver audioRouteReceiver = null;
    private String currentAudioRoute = "earpiece";

    @Override
    public void load() {
        super.load();
        registerAudioRouteReceiver();
    }

    @Override
    protected void handleOnDestroy() {
        releaseProximityWakeLock();
        unregisterAudioRouteReceiver();
        super.handleOnDestroy();
    }

    private void registerAudioRouteReceiver() {
        if (audioRouteReceiver != null) return;
        try {
            audioRouteReceiver = new BroadcastReceiver() {
                @Override
                public void onReceive(Context context, Intent intent) {
                    if (intent == null) return;
                    String action = intent.getAction();
                    Log.d(TAG, "Audio route broadcast received: " + action);

                    // When headphones/bluetooth are disconnected (NOISY event)
                    if (AudioManager.ACTION_AUDIO_BECOMING_NOISY.equals(action)) {
                        Log.d(TAG, "Audio becoming noisy - falling back gracefully");
                        currentAudioRoute = "earpiece";
                    } else if (BluetoothHeadset.ACTION_CONNECTION_STATE_CHANGED.equals(action)) {
                        int state = intent.getIntExtra(BluetoothProfile.EXTRA_STATE, BluetoothProfile.STATE_DISCONNECTED);
                        if (state == BluetoothProfile.STATE_CONNECTED) {
                            Log.d(TAG, "Bluetooth headset connected - auto-selecting bluetooth route");
                            currentAudioRoute = "bluetooth";
                        } else if (state == BluetoothProfile.STATE_DISCONNECTED && "bluetooth".equals(currentAudioRoute)) {
                            Log.d(TAG, "Bluetooth headset disconnected - falling back to earpiece");
                            currentAudioRoute = "earpiece";
                        }
                    }
                    notifyAudioRoutesChanged();
                }
            };

            IntentFilter filter = new IntentFilter();
            filter.addAction(AudioManager.ACTION_AUDIO_BECOMING_NOISY);
            filter.addAction(AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED);
            filter.addAction(BluetoothHeadset.ACTION_CONNECTION_STATE_CHANGED);
            filter.addAction(Intent.ACTION_HEADSET_PLUG);

            getContext().registerReceiver(audioRouteReceiver, filter);
        } catch (Exception e) {
            Log.w(TAG, "Failed to register audio route receiver: " + e.getMessage());
        }
    }

    private void unregisterAudioRouteReceiver() {
        if (audioRouteReceiver != null) {
            try {
                getContext().unregisterReceiver(audioRouteReceiver);
            } catch (Exception ignored) {}
            audioRouteReceiver = null;
        }
    }

    private void notifyAudioRoutesChanged() {
        try {
            JSObject data = getAudioRoutesObject();
            notifyListeners("audioRouteChanged", data, true);
        } catch (Exception e) {
            Log.w(TAG, "Failed to notify audio routes: " + e.getMessage());
        }
    }

    private boolean isBluetoothConnected() {
        try {
            Context ctx = getContext();
            AudioManager am = (AudioManager) ctx.getSystemService(Context.AUDIO_SERVICE);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && am != null) {
                List<AudioDeviceInfo> devices = am.getAvailableCommunicationDevices();
                for (AudioDeviceInfo dev : devices) {
                    int type = dev.getType();
                    if (type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
                        type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
                        type == AudioDeviceInfo.TYPE_BLE_HEADSET ||
                        type == AudioDeviceInfo.TYPE_BLE_SPEAKER) {
                        return true;
                    }
                }
            } else {
                BluetoothAdapter adapter = BluetoothAdapter.getDefaultAdapter();
                if (adapter != null && adapter.isEnabled()) {
                    int state = adapter.getProfileConnectionState(BluetoothProfile.HEADSET);
                    return state == BluetoothProfile.STATE_CONNECTED;
                }
            }
        } catch (Exception ignored) {}
        return false;
    }

    private JSObject getAudioRoutesObject() {
        JSObject ret = new JSObject();
        JSArray available = new JSArray();
        available.put("earpiece");
        available.put("speaker");

        boolean btConnected = isBluetoothConnected();
        if (btConnected) {
            available.put("bluetooth");
        } else if ("bluetooth".equals(currentAudioRoute)) {
            currentAudioRoute = "earpiece";
        }

        ret.put("available", available);
        ret.put("activeRoute", currentAudioRoute);
        ret.put("isBluetoothAvailable", btConnected);
        ret.put("isSpeakerphoneOn", "speaker".equals(currentAudioRoute));
        return ret;
    }

    private void releaseProximityWakeLock() {
        try {
            if (proximityWakeLock != null) {
                if (proximityWakeLock.isHeld()) {
                    proximityWakeLock.release();
                }
                proximityWakeLock = null;
                Log.d(TAG, "Proximity wake lock released");
            }
        } catch (Exception e) {
            Log.w(TAG, "Error releasing proximity wake lock: " + e.getMessage());
        }
    }

    // =========================================================================
    // 1. Microphone & Camera Permission & Settings
    // =========================================================================

    @PluginMethod
    public void checkAudioPermission(PluginCall call) {
        Context context = getContext();
        int status = ContextCompat.checkSelfPermission(context, Manifest.permission.RECORD_AUDIO);
        
        JSObject ret = new JSObject();
        if (status == PackageManager.PERMISSION_GRANTED) {
            ret.put("state", "granted");
        } else {
            boolean shouldShow = ActivityCompat.shouldShowRequestPermissionRationale(
                getActivity(),
                Manifest.permission.RECORD_AUDIO
            );
            ret.put("state", "denied");
            ret.put("shouldShowRationale", shouldShow);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void requestAudioPermission(PluginCall call) {
        if (getPermissionState("audio") == PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("state", "granted");
            call.resolve(ret);
            return;
        }

        requestPermissionForAlias("audio", call, "audioPermissionCallback");
    }

    @PermissionCallback
    private void audioPermissionCallback(PluginCall call) {
        JSObject ret = new JSObject();
        if (getPermissionState("audio") == PermissionState.GRANTED) {
            ret.put("state", "granted");
        } else {
            boolean shouldShow = ActivityCompat.shouldShowRequestPermissionRationale(
                getActivity(),
                Manifest.permission.RECORD_AUDIO
            );
            ret.put("state", "denied");
            ret.put("shouldShowRationale", shouldShow);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void checkCameraPermission(PluginCall call) {
        Context context = getContext();
        int status = ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA);
        
        JSObject ret = new JSObject();
        if (status == PackageManager.PERMISSION_GRANTED) {
            ret.put("state", "granted");
        } else {
            boolean shouldShow = ActivityCompat.shouldShowRequestPermissionRationale(
                getActivity(),
                Manifest.permission.CAMERA
            );
            ret.put("state", "denied");
            ret.put("shouldShowRationale", shouldShow);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void requestCameraPermission(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("state", "granted");
            call.resolve(ret);
            return;
        }

        requestPermissionForAlias("camera", call, "cameraPermissionCallback");
    }

    @PermissionCallback
    private void cameraPermissionCallback(PluginCall call) {
        JSObject ret = new JSObject();
        if (getPermissionState("camera") == PermissionState.GRANTED) {
            ret.put("state", "granted");
        } else {
            boolean shouldShow = ActivityCompat.shouldShowRequestPermissionRationale(
                getActivity(),
                Manifest.permission.CAMERA
            );
            ret.put("state", "denied");
            ret.put("shouldShowRationale", shouldShow);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        try {
            Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            Uri uri = Uri.fromParts("package", getContext().getPackageName(), null);
            intent.setData(uri);
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to open app settings", e);
        }
    }

    private void applyAudioRoute(String route) {
        AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
        if (audioManager == null) return;

        currentAudioRoute = route;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            List<AudioDeviceInfo> devices = audioManager.getAvailableCommunicationDevices();
            AudioDeviceInfo targetDevice = null;

            if ("bluetooth".equals(route)) {
                for (AudioDeviceInfo dev : devices) {
                    int type = dev.getType();
                    if (type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
                        type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
                        type == AudioDeviceInfo.TYPE_BLE_HEADSET ||
                        type == AudioDeviceInfo.TYPE_BLE_SPEAKER) {
                        targetDevice = dev;
                        break;
                    }
                }
            } else if ("speaker".equals(route)) {
                for (AudioDeviceInfo dev : devices) {
                    if (dev.getType() == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER) {
                        targetDevice = dev;
                        break;
                    }
                }
            } else { // "earpiece"
                for (AudioDeviceInfo dev : devices) {
                    if (dev.getType() == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE) {
                        targetDevice = dev;
                        break;
                    }
                }
            }

            if (targetDevice != null) {
                audioManager.setCommunicationDevice(targetDevice);
            }
            audioManager.setSpeakerphoneOn("speaker".equals(route));
        } else {
            if ("bluetooth".equals(route)) {
                audioManager.startBluetoothSco();
                audioManager.setBluetoothScoOn(true);
                audioManager.setSpeakerphoneOn(false);
            } else if ("speaker".equals(route)) {
                audioManager.stopBluetoothSco();
                audioManager.setBluetoothScoOn(false);
                audioManager.setSpeakerphoneOn(true);
            } else { // "earpiece"
                audioManager.stopBluetoothSco();
                audioManager.setBluetoothScoOn(false);
                audioManager.setSpeakerphoneOn(false);
            }
        }

        // Manage proximity sensor: Release automatically when NOT on earpiece
        if (!"earpiece".equals(route)) {
            releaseProximityWakeLock();
        }
    }

    @PluginMethod
    public void setCallAudioMode(PluginCall call) {
        try {
            AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (audioManager != null) {
                audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
                audioManager.setMicrophoneMute(false);

                // Default to bluetooth if connected; otherwise earpiece
                if (isBluetoothConnected()) {
                    applyAudioRoute("bluetooth");
                } else {
                    applyAudioRoute("earpiece");
                }
            }
            JSObject ret = getAudioRoutesObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to set call audio mode", e);
        }
    }

    @PluginMethod
    public void resetAudioMode(PluginCall call) {
        try {
            releaseProximityWakeLock();
            AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (audioManager != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    audioManager.clearCommunicationDevice();
                }
                try {
                    audioManager.stopBluetoothSco();
                    audioManager.setBluetoothScoOn(false);
                } catch (Exception ignored) {}
                audioManager.setSpeakerphoneOn(false);
                audioManager.setMode(AudioManager.MODE_NORMAL);
            }
            currentAudioRoute = "earpiece";
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to reset audio mode", e);
        }
    }

    @PluginMethod
    public void setSpeakerphoneOn(PluginCall call) {
        try {
            boolean enabled = call.getBoolean("enabled", false);
            applyAudioRoute(enabled ? "speaker" : "earpiece");
            JSObject ret = getAudioRoutesObject();
            ret.put("success", true);
            call.resolve(ret);
            notifyAudioRoutesChanged();
        } catch (Exception e) {
            call.reject("Failed to toggle speakerphone", e);
        }
    }

    @PluginMethod
    public void isSpeakerphoneOn(PluginCall call) {
        try {
            JSObject ret = new JSObject();
            ret.put("isSpeakerphoneOn", "speaker".equals(currentAudioRoute));
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to check speakerphone status", e);
        }
    }

    @PluginMethod
    public void setAudioRoute(PluginCall call) {
        String route = call.getString("route", "earpiece");
        try {
            applyAudioRoute(route);
            JSObject ret = getAudioRoutesObject();
            ret.put("success", true);
            call.resolve(ret);
            notifyAudioRoutesChanged();
        } catch (Exception e) {
            call.reject("Failed to set audio route: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void getAvailableAudioRoutes(PluginCall call) {
        try {
            JSObject ret = getAudioRoutesObject();
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to get audio routes", e);
        }
    }

    @PluginMethod
    public void setProximitySensorEnabled(PluginCall call) {
        boolean enabled = call.getBoolean("enabled", false);
        try {
            PowerManager powerManager = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            if (enabled) {
                if (proximityWakeLock == null && powerManager != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                        if (powerManager.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) {
                            proximityWakeLock = powerManager.newWakeLock(
                                PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK,
                                "kothahobe:proximity_screen_off"
                            );
                            proximityWakeLock.setReferenceCounted(false);
                            proximityWakeLock.acquire();
                            Log.d(TAG, "Proximity wake lock acquired successfully");
                        }
                    }
                }
            } else {
                releaseProximityWakeLock();
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("enabled", enabled && proximityWakeLock != null);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to set proximity sensor", e);
        }
    }


    // =========================================================================
    // 2. Save Image to Device Gallery / MediaStore
    // =========================================================================

    @PluginMethod
    public void saveImageToGallery(PluginCall call) {
        String base64Data = call.getString("base64Data");
        String fileName = call.getString("fileName", "image_" + System.currentTimeMillis() + ".jpg");

        if (base64Data == null || base64Data.isEmpty()) {
            call.reject("base64Data is required");
            return;
        }

        getBridge().execute(() -> {
            try {
                byte[] imageBytes = Base64.decode(base64Data, Base64.DEFAULT);
                Context context = getContext();

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentResolver resolver = context.getContentResolver();
                    ContentValues contentValues = new ContentValues();
                    contentValues.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
                    contentValues.put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg");
                    contentValues.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/Kotha Hobe");

                    Uri imageUri = resolver.insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, contentValues);
                    if (imageUri != null) {
                        OutputStream fos = resolver.openOutputStream(imageUri);
                        if (fos != null) {
                            fos.write(imageBytes);
                            fos.flush();
                            fos.close();
                        }

                        JSObject ret = new JSObject();
                        ret.put("success", true);
                        ret.put("uri", imageUri.toString());
                        call.resolve(ret);
                        return;
                    }
                }

                // Fallback for older Android
                File picturesDir = new File(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES),
                    "Kotha Hobe"
                );
                if (!picturesDir.exists()) {
                    picturesDir.mkdirs();
                }

                File imageFile = new File(picturesDir, fileName);
                FileOutputStream fos = new FileOutputStream(imageFile);
                fos.write(imageBytes);
                fos.flush();
                fos.close();

                MediaScannerConnection.scanFile(
                    context,
                    new String[]{ imageFile.getAbsolutePath() },
                    new String[]{ "image/jpeg" },
                    null
                );

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("filePath", imageFile.getAbsolutePath());
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Failed to save image to gallery: " + e.getMessage(), e);
            }
        });
    }

    // =========================================================================
    // 3. Download Document to User-Accessible Downloads Folder
    // =========================================================================

    @PluginMethod
    public void downloadDocument(PluginCall call) {
        String base64Data = call.getString("base64Data");
        String fileName = call.getString("fileName", "document_" + System.currentTimeMillis() + ".pdf");
        String mimeType = call.getString("mimeType", "application/pdf");

        if (base64Data == null || base64Data.isEmpty()) {
            call.reject("base64Data is required");
            return;
        }

        getBridge().execute(() -> {
            try {
                byte[] docBytes = Base64.decode(base64Data, Base64.DEFAULT);
                Context context = getContext();

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentResolver resolver = context.getContentResolver();
                    ContentValues contentValues = new ContentValues();
                    contentValues.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
                    contentValues.put(MediaStore.MediaColumns.MIME_TYPE, mimeType);
                    contentValues.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/Kotha Hobe");

                    Uri docUri = resolver.insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, contentValues);
                    if (docUri != null) {
                        OutputStream fos = resolver.openOutputStream(docUri);
                        if (fos != null) {
                            fos.write(docBytes);
                            fos.flush();
                            fos.close();
                        }

                        JSObject ret = new JSObject();
                        ret.put("success", true);
                        ret.put("fileName", fileName);
                        ret.put("uri", docUri.toString());
                        call.resolve(ret);
                        return;
                    }
                }

                // Fallback for older Android
                File downloadsDir = new File(
                    Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_DOWNLOADS),
                    "Kotha Hobe"
                );
                if (!downloadsDir.exists()) {
                    downloadsDir.mkdirs();
                }

                File docFile = new File(downloadsDir, fileName);
                FileOutputStream fos = new FileOutputStream(docFile);
                fos.write(docBytes);
                fos.flush();
                fos.close();

                MediaScannerConnection.scanFile(
                    context,
                    new String[]{ docFile.getAbsolutePath() },
                    new String[]{ mimeType },
                    null
                );

                JSObject ret = new JSObject();
                ret.put("success", true);
                ret.put("fileName", fileName);
                ret.put("filePath", docFile.getAbsolutePath());
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Failed to download document: " + e.getMessage(), e);
            }
        });
    }

    // =========================================================================
    // 4. Open Document with Native Default App via FileProvider & Intent
    // =========================================================================

    @PluginMethod
    public void openDocumentWithDefaultApp(PluginCall call) {
        String base64Data = call.getString("base64Data");
        String fileName = call.getString("fileName", "doc_" + System.currentTimeMillis() + ".pdf");
        String mimeType = call.getString("mimeType", "application/pdf");

        if (base64Data == null || base64Data.isEmpty()) {
            call.reject("base64Data is required");
            return;
        }

        getBridge().execute(() -> {
            try {
                byte[] fileBytes = Base64.decode(base64Data, Base64.DEFAULT);
                Context context = getContext();

                // Save to cache directory
                File docsDir = new File(context.getCacheDir(), "documents");
                if (!docsDir.exists()) {
                    docsDir.mkdirs();
                }

                File targetFile = new File(docsDir, fileName);
                FileOutputStream fos = new FileOutputStream(targetFile);
                fos.write(fileBytes);
                fos.flush();
                fos.close();

                // Create secure content:// URI via FileProvider
                String authority = context.getPackageName() + ".fileprovider";
                Uri contentUri = FileProvider.getUriForFile(context, authority, targetFile);

                // Build ACTION_VIEW Intent
                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(contentUri, mimeType);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

                // Verify that an application exists to handle this intent
                PackageManager pm = context.getPackageManager();
                List<ResolveInfo> activities = pm.queryIntentActivities(intent, PackageManager.MATCH_DEFAULT_ONLY);

                if (activities.isEmpty()) {
                    JSObject ret = new JSObject();
                    ret.put("success", false);
                    ret.put("error", "NO_APP");
                    call.resolve(ret);
                    return;
                }

                context.startActivity(intent);

                JSObject ret = new JSObject();
                ret.put("success", true);
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Failed to open document: " + e.getMessage(), e);
            }
        });
    }

    // =========================================================================
    // 5. Open External URL via Android Intent (Browser or Native App)
    // =========================================================================

    @PluginMethod
    public void openUrl(PluginCall call) {
        String urlString = call.getString("url");
        if (urlString == null || urlString.trim().isEmpty()) {
            call.reject("url is required");
            return;
        }

        try {
            String cleanUrl = urlString.trim();
            if (!cleanUrl.startsWith("http://") && !cleanUrl.startsWith("https://")) {
                cleanUrl = "https://" + cleanUrl;
            }

            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(cleanUrl));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);

            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to open URL: " + e.getMessage(), e);
        }
    }
}
