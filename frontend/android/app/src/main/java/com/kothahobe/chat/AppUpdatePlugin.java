package com.kothahobe.chat;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.security.MessageDigest;

@CapacitorPlugin(name = "AppUpdate")
public class AppUpdatePlugin extends Plugin {

    @PluginMethod
    public void getAppVersion(PluginCall call) {
        try {
            Context context = getContext();
            PackageInfo pInfo = context.getPackageManager().getPackageInfo(context.getPackageName(), 0);
            long versionCode = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P 
                ? pInfo.getLongVersionCode() 
                : pInfo.versionCode;

            JSObject ret = new JSObject();
            ret.put("versionName", pInfo.versionName);
            ret.put("versionCode", versionCode);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to retrieve package version info", e);
        }
    }

    @PluginMethod
    public void checkInstallPermission(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            boolean canInstall = getContext().getPackageManager().canRequestPackageInstalls();
            ret.put("canInstall", canInstall);
        } else {
            ret.put("canInstall", true);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstallPermissionSettings(PluginCall call) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES);
                intent.setData(Uri.parse("package:" + getContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to open install settings", e);
        }
    }

    @PluginMethod
    public void downloadAndInstallApk(PluginCall call) {
        String downloadUrl = call.getString("downloadUrl");
        String expectedSha256 = call.getString("sha256", "");
        String fileName = call.getString("fileName", "update.apk");

        if (downloadUrl == null || downloadUrl.isEmpty()) {
            call.reject("downloadUrl is required");
            return;
        }

        // Run download and verification on background thread
        new Thread(() -> {
            try {
                Context context = getContext();
                File cacheDir = context.getExternalCacheDir();
                if (cacheDir == null) {
                    cacheDir = context.getCacheDir();
                }

                File apkFile = new File(cacheDir, fileName);
                if (apkFile.exists()) {
                    apkFile.delete();
                }

                URL url = new URL(downloadUrl);
                HttpURLConnection conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(30000);
                conn.connect();

                int responseCode = conn.getResponseCode();
                if (responseCode != HttpURLConnection.HTTP_OK) {
                    call.reject("Server returned HTTP " + responseCode);
                    return;
                }

                int fileLength = conn.getContentLength();
                InputStream input = conn.getInputStream();
                FileOutputStream output = new FileOutputStream(apkFile);
                MessageDigest digest = MessageDigest.getInstance("SHA-256");

                byte[] data = new byte[8192];
                long total = 0;
                int count;
                int lastProgress = 0;

                while ((count = input.read(data)) != -1) {
                    total += count;
                    output.write(data, 0, count);
                    digest.update(data, 0, count);

                    if (fileLength > 0) {
                        int progress = (int) (total * 100 / fileLength);
                        if (progress > lastProgress + 2 || progress == 100) {
                            lastProgress = progress;
                            JSObject progressObj = new JSObject();
                            progressObj.put("progress", progress);
                            notifyListeners("downloadProgress", progressObj);
                        }
                    }
                }

                output.flush();
                output.close();
                input.close();

                // Verify SHA-256 if provided
                if (expectedSha256 != null && !expectedSha256.trim().isEmpty()) {
                    byte[] hashBytes = digest.digest();
                    StringBuilder sb = new StringBuilder();
                    for (byte b : hashBytes) {
                        sb.append(String.format("%02x", b));
                    }
                    String calculatedSha256 = sb.toString();

                    if (!calculatedSha256.equalsIgnoreCase(expectedSha256.trim())) {
                        apkFile.delete();
                        call.reject("APK SHA-256 verification failed. Expected: " + expectedSha256 + ", got: " + calculatedSha256);
                        return;
                    }
                }

                // Check permission before launching installer
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    if (!context.getPackageManager().canRequestPackageInstalls()) {
                        call.reject("INSTALL_PERMISSION_REQUIRED");
                        return;
                    }
                }

                // Launch Android Package Installer via FileProvider content:// URI
                Uri contentUri = FileProvider.getUriForFile(
                    context,
                    context.getPackageName() + ".fileprovider",
                    apkFile
                );

                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(contentUri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

                context.startActivity(intent);

                JSObject res = new JSObject();
                res.put("success", true);
                call.resolve(res);
            } catch (Exception e) {
                call.reject("APK Download/Install error: " + e.getMessage(), e);
            }
        }).start();
    }
}
