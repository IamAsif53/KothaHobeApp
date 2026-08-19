/**
 * Client-Side High-Speed Image Compressor for Instant Chat Uploads
 * - Scales high-megapixel images to max dimension of 1920px
 * - Encodes as JPEG with 0.85 quality
 * - Reduces 10MB camera photos to ~300-600KB in ~30ms
 * - Preserves documents and non-image files untouched
 */

export async function compressImageForUpload(file: File): Promise<File | Blob> {
  // If not a standard compressable image or smaller than 400KB, send as-is
  if (
    !file.type.startsWith('image/') ||
    file.type.includes('gif') ||
    file.type.includes('svg') ||
    file.size < 400 * 1024
  ) {
    return file;
  }

  return new Promise((resolve) => {
    try {
      const img = new Image();
      const objectUrl = URL.createObjectURL(file);

      img.onload = () => {
        URL.revokeObjectURL(objectUrl);

        const MAX_DIMENSION = 1920;
        let width = img.width;
        let height = img.height;

        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          } else {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(file);
          return;
        }

        // High quality smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            if (blob && blob.size < file.size) {
              // Create a File object preserving the original name
              const compressedFile = new File([blob], file.name.replace(/\.[^/.]+$/, '.jpg'), {
                type: 'image/jpeg',
                lastModified: Date.now(),
              });
              resolve(compressedFile);
            } else {
              resolve(file);
            }
          },
          'image/jpeg',
          0.85
        );
      };

      img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(file);
      };

      img.src = objectUrl;
    } catch {
      resolve(file);
    }
  });
}
