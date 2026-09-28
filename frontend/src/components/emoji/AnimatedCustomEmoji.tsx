import React, { useState, useEffect, useRef } from 'react';
import { motion, useAnimation, TargetAndTransition } from 'framer-motion';
import { getCustomEmojiById } from '../../data/customEmojiCatalog';
import { CustomEmojiRenderProps, CustomEmojiCharacter, CustomEmojiEmotion } from '../../types/customEmoji';

// Character Color Palettes (Kawaii / Soft Modern Aesthetic)
const PALETTES = {
  cat: {
    base: '#FF9E44', // Warm honey orange
    belly: '#FFF1E0',
    earsInner: '#FFAAA6',
    cheeks: '#FF8B94',
    nose: '#FF6B81',
    eyes: '#2D3436',
    whiskers: '#D35400',
    accent: '#E67E22',
  },
  dog: {
    base: '#FFD166', // Golden buttercup
    belly: '#FFFDF0',
    ears: '#F4A261',
    earsInner: '#FFCAD4',
    cheeks: '#FF99C8',
    nose: '#3E2723',
    eyes: '#2B2D42',
    accent: '#E76F51',
  },
  panda: {
    base: '#FDFEFE', // Bright fluffy white
    patches: '#2B2D42', // Dark slate eye patches & ears
    belly: '#F1F2F6',
    earsInner: '#3D405B',
    cheeks: '#FF99C8',
    nose: '#2B2D42',
    eyes: '#FFFFFF',
    accent: '#6C5CE7',
  },
  bunny: {
    base: '#FFF5EB', // Soft cream white
    belly: '#FFFFFF',
    earsInner: '#FFB5B5',
    cheeks: '#FF8DA1',
    nose: '#FF6B8B',
    eyes: '#2C3E50',
    accent: '#FF758C',
  },
  bear: {
    base: '#A0613B', // Warm milk chocolate
    belly: '#DDB892',
    snout: '#E6CCB2',
    earsInner: '#7F4F24',
    cheeks: '#FF8FA3',
    nose: '#4A2810',
    eyes: '#210F04',
    accent: '#B08968',
  },
  fox: {
    base: '#FF6B35', // Vibrant fox red-orange
    belly: '#FFF5EB',
    cheeksWhite: '#FFFFFF',
    earsInner: '#2F3542',
    cheeks: '#FF4757',
    nose: '#1E272E',
    eyes: '#2F3542',
    tailTip: '#FFFFFF',
    accent: '#E55039',
  },
};

export const AnimatedCustomEmoji: React.FC<CustomEmojiRenderProps> = ({
  emojiId,
  size = 'md',
  autoPlay = true,
  loop = false,
  interactive = true,
  className = '',
  onComplete,
  onClick,
}) => {
  const [isPlaying, setIsPlaying] = useState(autoPlay);
  const [playCount, setPlayCount] = useState(0);
  const emoji = getCustomEmojiById(emojiId);
  const controls = useAnimation();
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Compute pixel size
  const pixelSize =
    typeof size === 'number'
      ? size
      : size === 'sm'
      ? 28
      : size === 'md'
      ? 40
      : size === 'lg'
      ? 80
      : 140; // xl default

  const character = emoji ? emoji.character : 'cat';
  const emotion = emoji ? emoji.emotion : 'laugh';
  const palette = PALETTES[character] || PALETTES.cat;

  const triggerAnimation = () => {
    setIsPlaying(true);
    setPlayCount((prev) => prev + 1);

    if (timerRef.current) clearTimeout(timerRef.current);

    if (!loop) {
      const durationMs = emoji?.duration || 2000;
      timerRef.current = setTimeout(() => {
        setIsPlaying(false);
        if (onComplete) onComplete();
      }, durationMs);
    }
  };

  useEffect(() => {
    if (autoPlay) {
      triggerAnimation();
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [emojiId, autoPlay]);

  const handleTap = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (interactive) {
      triggerAnimation();
    }
    if (onClick) onClick();
  };

  if (!emoji) {
    // Graceful fallback for unknown emoji IDs
    return (
      <div
        style={{ width: pixelSize, height: pixelSize }}
        className={`inline-flex items-center justify-center rounded-2xl bg-brand-500/10 border border-brand-500/30 text-brand-500 select-none ${className}`}
        title={`Custom Emoji: ${emojiId}`}
      >
        <span className="text-xs font-mono font-bold">✨</span>
      </div>
    );
  }

  return (
    <motion.div
      onClick={handleTap}
      whileHover={interactive ? { scale: 1.08 } : undefined}
      whileTap={interactive ? { scale: 0.92 } : undefined}
      className={`relative inline-flex items-center justify-center select-none ${interactive ? 'cursor-pointer' : ''} ${className}`}
      style={{
        width: pixelSize,
        height: pixelSize,
        minWidth: pixelSize,
        minHeight: pixelSize,
      }}
      role="img"
      aria-label={emoji.name || emoji.description}
      title={emoji.name}
    >
      <svg
        viewBox="0 0 100 100"
        width="100%"
        height="100%"
        className="overflow-visible filter drop-shadow-sm"
      >
        <defs>
          {/* Radial Gradient for Glow & Cheeks */}
          <radialGradient id={`blush_${emojiId}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={palette.cheeks} stopOpacity="0.7" />
            <stop offset="100%" stopColor={palette.cheeks} stopOpacity="0" />
          </radialGradient>

          {/* Tear Gradient */}
          <linearGradient id="tearGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#70A1FF" />
            <stop offset="100%" stopColor="#1E90FF" />
          </linearGradient>

          {/* Heart Gradient */}
          <linearGradient id="heartGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF6B8B" />
            <stop offset="100%" stopColor="#FF4757" />
          </linearGradient>
        </defs>

        {/* --- 1. PARTICLES & EMOTION EFFECTS (Back Layer) --- */}
        {emotion === 'love' && (
          <LoveParticles isPlaying={isPlaying} playCount={playCount} />
        )}
        {emotion === 'angry' && (
          <AngrySteamParticles isPlaying={isPlaying} playCount={playCount} />
        )}
        {emotion === 'surprised' && (
          <SurpriseSparks isPlaying={isPlaying} playCount={playCount} />
        )}
        {emotion === 'laugh' && (
          <LaughTeardrops isPlaying={isPlaying} playCount={playCount} />
        )}
        {emotion === 'cry' && (
          <CryStreams isPlaying={isPlaying} playCount={playCount} />
        )}

        {/* --- 2. MAIN CHARACTER BODY & HEAD WITH PHYSICS --- */}
        <CharacterBody
          character={character}
          emotion={emotion}
          palette={palette}
          isPlaying={isPlaying}
          playCount={playCount}
        />
      </svg>
    </motion.div>
  );
};

// --- SUB-COMPONENTS: CHARACTER BODY & HEAD ---
interface CharacterBodyProps {
  character: CustomEmojiCharacter;
  emotion: CustomEmojiEmotion;
  palette: any;
  isPlaying: boolean;
  playCount: number;
}

const CharacterBody: React.FC<CharacterBodyProps> = ({
  character,
  emotion,
  palette,
  isPlaying,
  playCount,
}) => {
  // Motion animation variants based on emotion
  const getBodyMotion = (): TargetAndTransition => {
    if (!isPlaying) {
      return { y: 0, rotate: 0, scale: 1 };
    }
    switch (emotion) {
      case 'laugh':
        return {
          y: [0, -6, 2, -5, 1, -4, 0],
          rotate: [0, -3, 3, -2, 2, -1, 0],
          scale: [1, 1.05, 0.98, 1.04, 0.99, 1.02, 1],
          transition: { duration: 1.4, repeat: isPlaying ? 1 : 0, ease: 'easeInOut' as const },
        };
      case 'cry':
        return {
          y: [0, 3, -1, 4, 0],
          rotate: [0, -2, 2, -1, 1, 0],
          scale: [1, 0.97, 1.01, 0.98, 1],
          transition: { duration: 1.8, repeat: isPlaying ? 1 : 0, ease: 'easeInOut' as const },
        };
      case 'love':
        return {
          y: [0, -8, 0, -4, 0],
          scale: [1, 1.08, 0.97, 1.04, 1],
          transition: { duration: 1.5, repeat: isPlaying ? 1 : 0, ease: 'easeInOut' as const },
        };
      case 'angry':
        return {
          x: [0, -3, 3, -4, 4, -2, 2, 0],
          y: [0, 2, 0, 3, 0],
          rotate: [0, -4, 4, -5, 5, -2, 2, 0],
          scale: [1, 1.04, 0.98, 1.03, 1],
          transition: { duration: 1.1, repeat: isPlaying ? 1 : 0, ease: 'easeInOut' as const },
        };
      case 'surprised':
        return {
          y: [0, -12, 2, -4, 0],
          scale: [1, 1.12, 0.95, 1.03, 1],
          transition: { duration: 1.3, ease: 'backOut' as const },
        };
      default:
        return { y: 0, rotate: 0, scale: 1 };
    }
  };

  return (
    <motion.g animate={getBodyMotion()} key={playCount} style={{ transformOrigin: '50% 65%' }}>
      {/* 1. Ears Layer */}
      <CharacterEars character={character} palette={palette} emotion={emotion} isPlaying={isPlaying} />

      {/* 2. Main Head Circle / Rounded Shape */}
      <motion.circle
        cx="50"
        cy="54"
        r="36"
        fill={palette.base}
        stroke={character === 'panda' || character === 'bunny' ? '#E2E8F0' : 'none'}
        strokeWidth={character === 'panda' || character === 'bunny' ? '1.5' : '0'}
      />

      {/* 3. Character Specific Facial Patches & Markings */}
      {character === 'cat' && (
        <>
          {/* Whiskers */}
          <line x1="16" y1="56" x2="30" y2="58" stroke={palette.whiskers} strokeWidth="2" strokeLinecap="round" />
          <line x1="16" y1="62" x2="30" y2="61" stroke={palette.whiskers} strokeWidth="2" strokeLinecap="round" />
          <line x1="84" y1="56" x2="70" y2="58" stroke={palette.whiskers} strokeWidth="2" strokeLinecap="round" />
          <line x1="84" y1="62" x2="70" y2="61" stroke={palette.whiskers} strokeWidth="2" strokeLinecap="round" />
        </>
      )}

      {character === 'panda' && (
        <>
          {/* Panda Eye Patches */}
          <ellipse cx="34" cy="52" rx="10" ry="12" fill={palette.patches} transform="rotate(-15 34 52)" />
          <ellipse cx="66" cy="52" rx="10" ry="12" fill={palette.patches} transform="rotate(15 66 52)" />
        </>
      )}

      {character === 'fox' && (
        <>
          {/* Fox White Cheeks */}
          <path d="M 22 55 Q 36 78 50 78 Q 64 78 78 55 Q 86 65 72 82 Q 50 92 28 82 Q 14 65 22 55 Z" fill={palette.cheeksWhite} />
        </>
      )}

      {character === 'bear' && (
        <>
          {/* Bear Snout Patch */}
          <ellipse cx="50" cy="62" rx="14" ry="11" fill={palette.snout} />
        </>
      )}

      {/* 4. Blushing Cheeks */}
      <circle cx="28" cy="62" r="7" fill={palette.cheeks} opacity={emotion === 'love' ? 0.75 : 0.4} />
      <circle cx="72" cy="62" r="7" fill={palette.cheeks} opacity={emotion === 'love' ? 0.75 : 0.4} />

      {/* 5. Eyes & Eyebrows (Emotion Driven) */}
      <CharacterEyes emotion={emotion} palette={palette} character={character} isPlaying={isPlaying} />

      {/* 6. Nose & Mouth (Emotion Driven) */}
      <CharacterMouth emotion={emotion} palette={palette} character={character} isPlaying={isPlaying} />
    </motion.g>
  );
};

// --- EARS COMPONENT ---
const CharacterEars: React.FC<{
  character: CustomEmojiCharacter;
  palette: any;
  emotion: CustomEmojiEmotion;
  isPlaying: boolean;
}> = ({ character, palette, emotion, isPlaying }) => {
  const getEarMotion = (isLeft: boolean): TargetAndTransition => {
    if (!isPlaying) return { rotate: 0 };
    if (emotion === 'laugh') {
      return { rotate: isLeft ? [0, -8, 4, -6, 0] : [0, 8, -4, 6, 0], transition: { duration: 1.2 } };
    }
    if (emotion === 'surprised') {
      return { y: [-2, -8, 0], rotate: isLeft ? [-5, -12, 0] : [5, 12, 0], transition: { duration: 0.9 } };
    }
    if (emotion === 'cry') {
      return { y: [0, 4, 1, 3, 0], rotate: isLeft ? [0, -10, 0] : [0, 10, 0], transition: { duration: 1.6 } };
    }
    return { rotate: 0 };
  };

  switch (character) {
    case 'cat':
      return (
        <g>
          {/* Left Cat Ear */}
          <motion.polygon
            points="22,34 36,16 44,30"
            fill={palette.base}
            animate={getEarMotion(true)}
            style={{ transformOrigin: '30px 30px' }}
          />
          <polygon points="26,32 36,20 41,29" fill={palette.earsInner} />

          {/* Right Cat Ear */}
          <motion.polygon
            points="78,34 64,16 56,30"
            fill={palette.base}
            animate={getEarMotion(false)}
            style={{ transformOrigin: '70px 30px' }}
          />
          <polygon points="74,32 64,20 59,29" fill={palette.earsInner} />
        </g>
      );

    case 'dog':
      return (
        <g>
          {/* Floppy Dog Left Ear */}
          <motion.path
            d="M 22 36 C 12 45, 10 65, 20 72 C 28 76, 32 65, 28 46 Z"
            fill={palette.ears}
            animate={getEarMotion(true)}
            style={{ transformOrigin: '25px 36px' }}
          />
          {/* Floppy Dog Right Ear */}
          <motion.path
            d="M 78 36 C 88 45, 90 65, 80 72 C 72 76, 68 65, 72 46 Z"
            fill={palette.ears}
            animate={getEarMotion(false)}
            style={{ transformOrigin: '75px 36px' }}
          />
        </g>
      );

    case 'panda':
      return (
        <g>
          {/* Round Panda Ears */}
          <motion.circle
            cx="24"
            cy="28"
            r="12"
            fill={palette.patches}
            animate={getEarMotion(true)}
            style={{ transformOrigin: '24px 28px' }}
          />
          <motion.circle
            cx="76"
            cy="28"
            r="12"
            fill={palette.patches}
            animate={getEarMotion(false)}
            style={{ transformOrigin: '76px 28px' }}
          />
        </g>
      );

    case 'bunny':
      return (
        <g>
          {/* Tall Bunny Left Ear */}
          <motion.ellipse
            cx="32"
            cy="18"
            rx="8"
            ry="20"
            fill={palette.base}
            stroke="#E2E8F0"
            strokeWidth="1.5"
            animate={getEarMotion(true)}
            style={{ transformOrigin: '32px 34px' }}
          />
          <ellipse cx="32" cy="18" rx="4.5" ry="15" fill={palette.earsInner} />

          {/* Tall Bunny Right Ear */}
          <motion.ellipse
            cx="68"
            cy="18"
            rx="8"
            ry="20"
            fill={palette.base}
            stroke="#E2E8F0"
            strokeWidth="1.5"
            animate={getEarMotion(false)}
            style={{ transformOrigin: '68px 34px' }}
          />
          <ellipse cx="68" cy="18" rx="4.5" ry="15" fill={palette.earsInner} />
        </g>
      );

    case 'bear':
      return (
        <g>
          {/* Bear Round Ears */}
          <motion.circle
            cx="22"
            cy="28"
            r="13"
            fill={palette.base}
            animate={getEarMotion(true)}
            style={{ transformOrigin: '22px 28px' }}
          />
          <circle cx="22" cy="28" r="7" fill={palette.earsInner} />

          <motion.circle
            cx="78"
            cy="28"
            r="13"
            fill={palette.base}
            animate={getEarMotion(false)}
            style={{ transformOrigin: '78px 28px' }}
          />
          <circle cx="78" cy="28" r="7" fill={palette.earsInner} />
        </g>
      );

    case 'fox':
      return (
        <g>
          {/* Fox Triangular Ears with Dark Tips */}
          <motion.polygon
            points="18,36 32,10 44,28"
            fill={palette.base}
            animate={getEarMotion(true)}
            style={{ transformOrigin: '28px 30px' }}
          />
          <polygon points="26,32 32,16 40,27" fill={palette.earsInner} />

          <motion.polygon
            points="82,36 68,10 56,28"
            fill={palette.base}
            animate={getEarMotion(false)}
            style={{ transformOrigin: '72px 30px' }}
          />
          <polygon points="74,32 68,16 60,27" fill={palette.earsInner} />
        </g>
      );

    default:
      return null;
  }
};

// --- EYES COMPONENT ---
const CharacterEyes: React.FC<{
  emotion: CustomEmojiEmotion;
  palette: any;
  character: CustomEmojiCharacter;
  isPlaying: boolean;
}> = ({ emotion, palette, character, isPlaying }) => {
  const eyeColor = character === 'panda' ? '#FFFFFF' : palette.eyes;

  switch (emotion) {
    case 'laugh':
      // Happy Arched Closed Eyes ^^
      return (
        <g stroke={eyeColor} strokeWidth="3.5" strokeLinecap="round" fill="none">
          <path d="M 28 52 Q 36 44 44 52" />
          <path d="M 56 52 Q 64 44 72 52" />
        </g>
      );

    case 'cry':
      // Sad Drooping Eyes
      return (
        <g stroke={eyeColor} strokeWidth="3.5" strokeLinecap="round" fill="none">
          <path d="M 28 50 Q 36 57 44 52" />
          <path d="M 56 52 Q 64 57 72 50" />
        </g>
      );

    case 'love':
      // Heart Eyes or Sparkling Eyes
      return (
        <g fill="url(#heartGrad)">
          {/* Left Heart Eye */}
          <path d="M 36 44 C 36 38, 28 38, 28 44 C 28 49, 36 54, 36 56 C 36 54, 44 49, 44 44 C 44 38, 36 38, 36 44 Z" />
          {/* Right Heart Eye */}
          <path d="M 64 44 C 64 38, 56 38, 56 44 C 56 49, 64 54, 64 56 C 64 54, 72 49, 72 44 C 72 38, 64 38, 64 44 Z" />
        </g>
      );

    case 'angry':
      // Fierce Narrowed Eyes with Angled Brows
      return (
        <g>
          {/* Eyebrows */}
          <line x1="28" y1="42" x2="42" y2="48" stroke={eyeColor} strokeWidth="3" strokeLinecap="round" />
          <line x1="72" y1="42" x2="58" y2="48" stroke={eyeColor} strokeWidth="3" strokeLinecap="round" />
          {/* Eyes */}
          <circle cx="36" cy="52" r="4.5" fill={eyeColor} />
          <circle cx="64" cy="52" r="4.5" fill={eyeColor} />
        </g>
      );

    case 'surprised':
      // Big Wide Sparkling Eyes
      return (
        <g fill={eyeColor}>
          <circle cx="35" cy="50" r="7.5" />
          <circle cx="65" cy="50" r="7.5" />
          {/* Catchlight Highlights */}
          <circle cx="33" cy="48" r="2.8" fill="#FFFFFF" />
          <circle cx="63" cy="48" r="2.8" fill="#FFFFFF" />
          <circle cx="37" cy="52" r="1.4" fill="#FFFFFF" />
          <circle cx="67" cy="52" r="1.4" fill="#FFFFFF" />
        </g>
      );

    default:
      return (
        <g fill={eyeColor}>
          <circle cx="36" cy="52" r="4.5" />
          <circle cx="64" cy="52" r="4.5" />
        </g>
      );
  }
};

// --- MOUTH & NOSE COMPONENT ---
const CharacterMouth: React.FC<{
  emotion: CustomEmojiEmotion;
  palette: any;
  character: CustomEmojiCharacter;
  isPlaying: boolean;
}> = ({ emotion, palette, character, isPlaying }) => {
  const noseColor = palette.nose || '#2D3436';

  return (
    <g>
      {/* Little Cute Nose */}
      <polygon points="47,58 53,58 50,62" fill={noseColor} />

      {/* Mouth Expressions */}
      {emotion === 'laugh' && (
        <g>
          <path d="M 40 64 Q 50 78 60 64 Z" fill="#FF4757" stroke="#2D3436" strokeWidth="1.5" />
          {/* Tongue */}
          <path d="M 44 70 Q 50 66 56 70 Q 50 78 44 70 Z" fill="#FFAAA6" />
        </g>
      )}

      {emotion === 'cry' && (
        <path d="M 43 72 Q 50 64 57 72" stroke="#2D3436" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      )}

      {emotion === 'love' && (
        <path d="M 44 65 Q 50 72 56 65" stroke="#2D3436" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      )}

      {emotion === 'angry' && (
        <path d="M 43 68 Q 50 62 57 68" stroke="#2D3436" strokeWidth="3" strokeLinecap="round" fill="none" />
      )}

      {emotion === 'surprised' && (
        <ellipse cx="50" cy="68" rx="6" ry="8" fill="#FF4757" stroke="#2D3436" strokeWidth="1.5" />
      )}
    </g>
  );
};

// --- EMOTION PARTICLES & EFFECTS ---

// 1. Love Floating Hearts
const LoveParticles: React.FC<{ isPlaying: boolean; playCount: number }> = ({ isPlaying, playCount }) => {
  if (!isPlaying) return null;

  return (
    <g key={`love_${playCount}`} fill="url(#heartGrad)">
      {/* Top Left Heart */}
      <motion.path
        d="M 20 22 C 20 16, 12 16, 12 22 C 12 27, 20 32, 20 34 C 20 32, 28 27, 28 22 C 28 16, 20 16, 20 22 Z"
        initial={{ opacity: 0, y: 15, scale: 0.5 }}
        animate={{ opacity: [0, 1, 0.9, 0], y: [-5, -25], scale: [0.5, 1.2, 0.9] }}
        transition={{ duration: 1.6, ease: 'easeOut' }}
      />
      {/* Top Right Big Heart */}
      <motion.path
        d="M 80 18 C 80 11, 70 11, 70 18 C 70 24, 80 30, 80 33 C 80 30, 90 24, 90 18 C 90 11, 80 11, 80 18 Z"
        initial={{ opacity: 0, y: 15, scale: 0.6 }}
        animate={{ opacity: [0, 1, 0.9, 0], y: [-2, -28], scale: [0.6, 1.3, 1] }}
        transition={{ duration: 1.8, delay: 0.2, ease: 'easeOut' }}
      />
      {/* Sparkles */}
      <motion.circle
        cx="14"
        cy="40"
        r="2.5"
        fill="#FFD166"
        animate={{ scale: [0, 1.4, 0], opacity: [0, 1, 0] }}
        transition={{ duration: 1.2, delay: 0.3 }}
      />
      <motion.circle
        cx="86"
        cy="38"
        r="3"
        fill="#FFD166"
        animate={{ scale: [0, 1.5, 0], opacity: [0, 1, 0] }}
        transition={{ duration: 1.4, delay: 0.4 }}
      />
    </g>
  );
};

// 2. Cry Flowing Tear Streams
const CryStreams: React.FC<{ isPlaying: boolean; playCount: number }> = ({ isPlaying, playCount }) => {
  if (!isPlaying) return null;

  return (
    <g key={`cry_${playCount}`} fill="url(#tearGrad)">
      {/* Left Tear Waterfall */}
      <motion.path
        d="M 32 54 C 28 65, 26 80, 28 92 C 30 96, 36 96, 38 92 C 40 80, 38 65, 34 54 Z"
        initial={{ scaleY: 0, opacity: 0 }}
        animate={{ scaleY: [0, 1.2, 1], opacity: [0, 0.9, 0.8, 0] }}
        transition={{ duration: 1.8, ease: 'easeInOut' }}
        style={{ transformOrigin: '33px 54px' }}
      />
      {/* Right Tear Waterfall */}
      <motion.path
        d="M 68 54 C 64 65, 62 80, 64 92 C 66 96, 72 96, 74 92 C 76 80, 74 65, 70 54 Z"
        initial={{ scaleY: 0, opacity: 0 }}
        animate={{ scaleY: [0, 1.2, 1], opacity: [0, 0.9, 0.8, 0] }}
        transition={{ duration: 1.8, delay: 0.1, ease: 'easeInOut' }}
        style={{ transformOrigin: '69px 54px' }}
      />
      {/* Splashing Drops at bottom */}
      <motion.circle
        cx="25"
        cy="94"
        r="2.5"
        animate={{ x: [-2, -8], y: [0, -6, 2], opacity: [1, 0] }}
        transition={{ duration: 0.8, repeat: 2, delay: 0.4 }}
      />
      <motion.circle
        cx="75"
        cy="94"
        r="2.5"
        animate={{ x: [2, 8], y: [0, -6, 2], opacity: [1, 0] }}
        transition={{ duration: 0.8, repeat: 2, delay: 0.5 }}
      />
    </g>
  );
};

// 3. Laugh Bouncing Teardrops
const LaughTeardrops: React.FC<{ isPlaying: boolean; playCount: number }> = ({ isPlaying, playCount }) => {
  if (!isPlaying) return null;

  return (
    <g key={`laugh_${playCount}`} fill="url(#tearGrad)">
      {/* Left Joy Teardrop */}
      <motion.path
        d="M 18 48 C 12 48, 10 56, 16 60 C 22 62, 24 54, 20 48 Z"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.3, 0.9], x: [0, -8, -12], y: [0, 4, 8], opacity: [0, 1, 0] }}
        transition={{ duration: 1.4, ease: 'easeOut' }}
      />
      {/* Right Joy Teardrop */}
      <motion.path
        d="M 82 48 C 88 48, 90 56, 84 60 C 78 62, 76 54, 80 48 Z"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.3, 0.9], x: [0, 8, 12], y: [0, 4, 8], opacity: [0, 1, 0] }}
        transition={{ duration: 1.4, ease: 'easeOut' }}
      />
    </g>
  );
};

// 4. Angry Steam Puffs & Vein Pop
const AngrySteamParticles: React.FC<{ isPlaying: boolean; playCount: number }> = ({ isPlaying, playCount }) => {
  if (!isPlaying) return null;

  return (
    <g key={`angry_${playCount}`}>
      {/* Comic Anger Vein (Red Cross) */}
      <motion.g
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.3, 1, 1.2, 1], opacity: [0, 1, 0.9, 1, 0] }}
        transition={{ duration: 1.4 }}
        transform="translate(68, 20)"
      >
        <path d="M 0 4 Q 4 0 8 4 Q 4 8 0 4 Z" fill="#FF4757" />
        <path d="M 4 0 Q 8 4 4 8 Q 0 4 4 0 Z" fill="#FF4757" />
      </motion.g>

      {/* Left Steam Cloud */}
      <motion.path
        d="M 16 30 C 10 26, 8 18, 14 14 C 20 10, 24 16, 22 22 Z"
        fill="#FFFFFF"
        opacity="0.85"
        initial={{ scale: 0, y: 10, opacity: 0 }}
        animate={{ scale: [0, 1.2, 1.4], y: [-5, -18], opacity: [0, 0.8, 0] }}
        transition={{ duration: 1.1, ease: 'easeOut' }}
      />
      {/* Right Steam Cloud */}
      <motion.path
        d="M 84 30 C 90 26, 92 18, 86 14 C 80 10, 76 16, 78 22 Z"
        fill="#FFFFFF"
        opacity="0.85"
        initial={{ scale: 0, y: 10, opacity: 0 }}
        animate={{ scale: [0, 1.2, 1.4], y: [-5, -18], opacity: [0, 0.8, 0] }}
        transition={{ duration: 1.1, delay: 0.15, ease: 'easeOut' }}
      />
    </g>
  );
};

// 5. Surprise Question / Exclamation Sparks
const SurpriseSparks: React.FC<{ isPlaying: boolean; playCount: number }> = ({ isPlaying, playCount }) => {
  if (!isPlaying) return null;

  return (
    <g key={`surprise_${playCount}`}>
      {/* Big Animated Exclamation Pop ! */}
      <motion.g
        initial={{ scale: 0, y: 10, opacity: 0 }}
        animate={{ scale: [0, 1.4, 1], y: [0, -14], opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.2, ease: 'backOut' }}
      >
        <ellipse cx="50" cy="10" rx="3.5" ry="7" fill="#FF4757" />
        <circle cx="50" cy="21" r="3" fill="#FF4757" />
      </motion.g>

      {/* Radiating Shock Lines */}
      <motion.line
        x1="22"
        y1="18"
        x2="14"
        y2="10"
        stroke="#FFD166"
        strokeWidth="2.5"
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: [0, 1, 0], opacity: [0, 1, 0] }}
        transition={{ duration: 0.9 }}
      />
      <motion.line
        x1="78"
        y1="18"
        x2="86"
        y2="10"
        stroke="#FFD166"
        strokeWidth="2.5"
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: [0, 1, 0], opacity: [0, 1, 0] }}
        transition={{ duration: 0.9 }}
      />
    </g>
  );
};

export default AnimatedCustomEmoji;
