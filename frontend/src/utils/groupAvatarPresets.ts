export interface AvatarPreset {
  id: string;
  name: string;
  url: string;
  bgGradient: string;
  emoji: string;
}

// Generate high quality SVG Data URLs with vibrant gradients & crisp emojis
function createSvgAvatarDataUri(bgColor1: string, bgColor2: string, emoji: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256" viewBox="0 0 256 256">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${bgColor1}" />
        <stop offset="100%" stop-color="${bgColor2}" />
      </linearGradient>
    </defs>
    <rect width="256" height="256" rx="64" fill="url(#grad)" />
    <text x="50%" y="54%" font-size="110" text-anchor="middle" dominant-baseline="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif">${emoji}</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const GROUP_AVATAR_PRESETS: AvatarPreset[] = [
  {
    id: 'gaming',
    name: 'Gaming',
    emoji: '🎮',
    bgGradient: 'from-violet-600 to-indigo-800',
    url: createSvgAvatarDataUri('#7c3aed', '#3730a3', '🎮'),
  },
  {
    id: 'party',
    name: 'Party',
    emoji: '🎉',
    bgGradient: 'from-pink-500 to-rose-600',
    url: createSvgAvatarDataUri('#ec4899', '#e11d48', '🎉'),
  },
  {
    id: 'chill',
    name: 'Chill / Friends',
    emoji: '☕',
    bgGradient: 'from-amber-600 to-orange-700',
    url: createSvgAvatarDataUri('#d97706', '#c2410c', '☕'),
  },
  {
    id: 'code',
    name: 'Tech & Code',
    emoji: '💻',
    bgGradient: 'from-cyan-500 to-blue-600',
    url: createSvgAvatarDataUri('#06b6d4', '#2563eb', '💻'),
  },
  {
    id: 'music',
    name: 'Music & Beats',
    emoji: '🎧',
    bgGradient: 'from-emerald-500 to-teal-700',
    url: createSvgAvatarDataUri('#10b981', '#0f766e', '🎧'),
  },
  {
    id: 'fire',
    name: 'Squad Goals',
    emoji: '🔥',
    bgGradient: 'from-red-500 to-amber-600',
    url: createSvgAvatarDataUri('#ef4444', '#d97706', '🔥'),
  },
  {
    id: 'sports',
    name: 'Sports',
    emoji: '⚽',
    bgGradient: 'from-blue-600 to-sky-400',
    url: createSvgAvatarDataUri('#2563eb', '#38bdf8', '⚽'),
  },
  {
    id: 'study',
    name: 'Study Group',
    emoji: '📚',
    bgGradient: 'from-indigo-500 to-purple-600',
    url: createSvgAvatarDataUri('#6366f1', '#9333ea', '📚'),
  },
  {
    id: 'travel',
    name: 'Travel & Trips',
    emoji: '✈️',
    bgGradient: 'from-teal-400 to-emerald-600',
    url: createSvgAvatarDataUri('#2dd4bf', '#059669', '✈️'),
  },
  {
    id: 'art',
    name: 'Creative / Art',
    emoji: '🎨',
    bgGradient: 'from-fuchsia-500 to-pink-600',
    url: createSvgAvatarDataUri('#d946ef', '#db2777', '🎨'),
  },
  {
    id: 'star',
    name: 'VIP & Stars',
    emoji: '⭐',
    bgGradient: 'from-yellow-400 to-amber-600',
    url: createSvgAvatarDataUri('#facc15', '#d97706', '⭐'),
  },
  {
    id: 'rocket',
    name: 'Project Launch',
    emoji: '🚀',
    bgGradient: 'from-purple-600 to-rose-600',
    url: createSvgAvatarDataUri('#9333ea', '#e11d48', '🚀'),
  },
];

/**
 * Compress an image file selected from gallery/camera to a lightweight base64 JPEG
 */
export async function compressImageFile(file: File, maxSize = 256, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (readerEvent) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(readerEvent.target?.result as string);
          return;
        }

        // Draw and compress to JPEG
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error('Failed to load image for compression'));
      img.src = readerEvent.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Failed to read image file'));
    reader.readAsDataURL(file);
  });
}
