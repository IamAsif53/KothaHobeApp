package com.kothahobe.chat;

import android.Manifest;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.media.AudioManager;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.Settings;
import android.util.Base64;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import androidx.core.content.FileProvider;

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
        )
    }
)
public class NativeMediaPlugin extends Plugin {

    // =========================================================================
    // 1. Microphone Permission & Settings
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
            // If shouldShow is false and status is denied, it might be first time or permanently denied
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

    @PluginMethod
    public void setCallAudioMode(PluginCall call) {
        try {
            AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (audioManager != null) {
                audioManager.setMode(AudioManager.MODE_IN_COMMUNICATION);
                audioManager.setMicrophoneMute(false);
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to set call audio mode", e);
        }
    }

    @PluginMethod
    public void resetAudioMode(PluginCall call) {
        try {
            AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (audioManager != null) {
                audioManager.setSpeakerphoneOn(false);
                audioManager.setMode(AudioManager.MODE_NORMAL);
            }
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
            AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            if (audioManager != null) {
                audioManager.setSpeakerphoneOn(enabled);
            }
            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("isSpeakerphoneOn", enabled);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to toggle speakerphone", e);
        }
    }

    @PluginMethod
    public void isSpeakerphoneOn(PluginCall call) {
        try {
            AudioManager audioManager = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
            boolean isOn = audioManager != null && audioManager.isSpeakerphoneOn();
            JSObject ret = new JSObject();
            ret.put("isSpeakerphoneOn", isOn);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to check speakerphone status", e);
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
}
