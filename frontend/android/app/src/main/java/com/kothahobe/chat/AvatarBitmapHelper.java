package com.kothahobe.chat;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Rect;
import android.graphics.Typeface;
import android.util.Log;
import android.util.LruCache;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class AvatarBitmapHelper {
    private static final String TAG = "AvatarBitmapHelper";

    // 4MB Memory Cache for Avatars and Initials
    private static final int CACHE_SIZE = 4 * 1024 * 1024;
    private static final LruCache<String, Bitmap> memoryCache = new LruCache<String, Bitmap>(CACHE_SIZE) {
        @Override
        protected int sizeOf(String key, Bitmap bitmap) {
            return bitmap.getByteCount();
        }
    };

    private static final ExecutorService executor = Executors.newFixedThreadPool(2);

    // Curated Material/Tailwind palette matching Kotha Hobe theme
    private static final int[] AVATAR_COLORS = new int[]{
        Color.parseColor("#059669"), // Emerald 600
        Color.parseColor("#0284C7"), // Sky 600
        Color.parseColor("#4F46E5"), // Indigo 600
        Color.parseColor("#7C3AED"), // Violet 600
        Color.parseColor("#E11D48"), // Rose 600
        Color.parseColor("#D97706"), // Amber 600
        Color.parseColor("#0891B2"), // Cyan 600
        Color.parseColor("#2563EB"), // Blue 600
        Color.parseColor("#DB2777"), // Pink 600
        Color.parseColor("#475569")  // Slate 600
    };

    /**
     * Instantly retrieve avatar bitmap from cache, or return a generated initials avatar.
     * Never delays notification delivery for network operations.
     */
    public static Bitmap getAvatarOrInitials(Context context, String avatarUrl, String name, int sizePx) {
        if (sizePx <= 0) sizePx = 128;
        String safeName = (name != null && !name.trim().isEmpty()) ? name.trim() : "User";

        // 1. Check if remote avatar is already cached
        if (avatarUrl != null && !avatarUrl.trim().isEmpty() && !avatarUrl.startsWith("data:")) {
            String cleanUrl = avatarUrl.trim();
            Bitmap cached = memoryCache.get(cleanUrl);
            if (cached != null && !cached.isRecycled()) {
                return cached;
            }

            // Asynchronously fetch and cache for subsequent messages
            prefetchAvatar(cleanUrl, sizePx);
        }

        // 2. Check initials cache
        String initialsKey = "initials:" + safeName + ":" + sizePx;
        Bitmap cachedInitials = memoryCache.get(initialsKey);
        if (cachedInitials != null && !cachedInitials.isRecycled()) {
            return cachedInitials;
        }

        // 3. Generate initials avatar on-the-fly
        Bitmap initialsBitmap = createInitialsAvatar(safeName, sizePx);
        if (initialsBitmap != null) {
            memoryCache.put(initialsKey, initialsBitmap);
        }
        return initialsBitmap;
    }

    /**
     * Creates a crisp circular bitmap with the user's initials and deterministic background color.
     */
    public static Bitmap createInitialsAvatar(String name, int sizePx) {
        try {
            Bitmap output = Bitmap.createBitmap(sizePx, sizePx, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(output);

            int colorIndex = Math.abs(name.hashCode()) % AVATAR_COLORS.length;
            int bgColor = AVATAR_COLORS[colorIndex];

            Paint bgPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            bgPaint.setColor(bgColor);
            bgPaint.setStyle(Paint.Style.FILL);

            float radius = sizePx / 2f;
            canvas.drawCircle(radius, radius, radius, bgPaint);

            String initials = extractInitials(name);
            Paint textPaint = new Paint(Paint.ANTI_ALIAS_FLAG);
            textPaint.setColor(Color.WHITE);
            textPaint.setTypeface(Typeface.create(Typeface.SANS_SERIF, Typeface.BOLD));
            textPaint.setTextSize(sizePx * (initials.length() > 1 ? 0.38f : 0.46f));
            textPaint.setTextAlign(Paint.Align.CENTER);

            Rect textBounds = new Rect();
            textPaint.getTextBounds(initials, 0, initials.length(), textBounds);
            float yPos = radius + (textBounds.height() / 2f) - textBounds.bottom;

            canvas.drawText(initials, radius, yPos, textPaint);
            return output;
        } catch (Exception e) {
            Log.w(TAG, "Failed to create initials avatar: " + e.getMessage());
            return null;
        }
    }

    /**
     * Extracts 1-2 clean uppercase characters from name.
     */
    private static String extractInitials(String name) {
        if (name == null || name.trim().isEmpty()) return "U";
        String trimmed = name.trim();
        String[] parts = trimmed.split("\\s+");

        if (parts.length >= 2 && !parts[0].isEmpty() && !parts[1].isEmpty()) {
            String first = getFirstGrapheme(parts[0]);
            String second = getFirstGrapheme(parts[1]);
            return (first + second).toUpperCase();
        }

        if (trimmed.length() >= 2) {
            return trimmed.substring(0, Math.min(2, trimmed.length())).toUpperCase();
        }
        return trimmed.toUpperCase();
    }

    private static String getFirstGrapheme(String word) {
        if (word.isEmpty()) return "";
        int codePoint = word.codePointAt(0);
        return new String(Character.toChars(codePoint));
    }

    /**
     * Converts a rectangular Bitmap into a circular Bitmap.
     */
    public static Bitmap getCircularBitmap(Bitmap bitmap) {
        if (bitmap == null) return null;
        try {
            int width = bitmap.getWidth();
            int height = bitmap.getHeight();
            int minSize = Math.min(width, height);

            Bitmap output = Bitmap.createBitmap(minSize, minSize, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(output);

            Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
            paint.setColor(Color.BLACK);

            float radius = minSize / 2f;
            canvas.drawCircle(radius, radius, radius, paint);

            paint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_IN));
            int left = (width - minSize) / 2;
            int top = (height - minSize) / 2;
            Rect srcRect = new Rect(left, top, left + minSize, top + minSize);
            Rect dstRect = new Rect(0, 0, minSize, minSize);

            canvas.drawBitmap(bitmap, srcRect, dstRect, paint);
            return output;
        } catch (Exception e) {
            Log.w(TAG, "getCircularBitmap error: " + e.getMessage());
            return bitmap;
        }
    }

    /**
     * Background asynchronous fetch and LRU cache for avatar images.
     */
    private static void prefetchAvatar(String avatarUrl, int sizePx) {
        executor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                URL url = new URL(avatarUrl);
                connection = (HttpURLConnection) url.openConnection();
                connection.setConnectTimeout(4000);
                connection.setReadTimeout(4000);
                connection.setDoInput(true);
                connection.connect();

                if (connection.getResponseCode() == HttpURLConnection.HTTP_OK) {
                    InputStream input = connection.getInputStream();
                    Bitmap rawBitmap = BitmapFactory.decodeStream(input);
                    if (rawBitmap != null) {
                        Bitmap circular = getCircularBitmap(rawBitmap);
                        if (circular != null) {
                            memoryCache.put(avatarUrl, circular);
                            Log.d(TAG, "Prefetched and cached avatar for: " + avatarUrl);
                        }
                    }
                }
            } catch (Exception e) {
                Log.d(TAG, "Prefetch avatar notice: " + e.getMessage());
            } finally {
                if (connection != null) {
                    connection.disconnect();
                }
            }
        });
    }
}
