import React, { useState, useEffect, useRef } from 'react';
import { motion, TargetAndTransition } from 'framer-motion';
import { getCustomEmojiById } from '../../data/customEmojiCatalog';
import { CustomEmojiRenderProps, CustomEmojiCharacter, CustomEmojiEmotion } from '../../types/customEmoji';

// Character Color Palettes (Kawaii Soft Modern Aesthetic)
const PALETTES: Record<string, any> = {
  cat: {
    base: '#FF9E44',
    belly: '#FFF1E0',
    earsInner: '#FFAAA6',
    cheeks: '#FF8B94',
    nose: '#FF6B81',
    eyes: '#2D3436',
    whiskers: '#D35400',
    accent: '#E67E22',
  },
  dog: {
    base: '#FFD166',
    belly: '#FFFDF0',
    ears: '#F4A261',
    earsInner: '#FFCAD4',
    cheeks: '#FF99C8',
    nose: '#3E2723',
    eyes: '#2B2D42',
    accent: '#E76F51',
  },
  panda: {
    base: '#FDFEFE',
    patches: '#2B2D42',
    belly: '#F1F2F6',
    earsInner: '#3D405B',
    cheeks: '#FF99C8',
    nose: '#2B2D42',
    eyes: '#FFFFFF',
    accent: '#6C5CE7',
  },
  bunny: {
    base: '#FFF5EB',
    belly: '#FFFFFF',
    earsInner: '#FFB5B5',
    cheeks: '#FF8DA1',
    nose: '#FF6B8B',
    eyes: '#2C3E50',
    accent: '#FF758C',
  },
  bear: {
    base: '#A0613B',
    belly: '#DDB892',
    snout: '#E6CCB2',
    earsInner: '#7F4F24',
    cheeks: '#FF8FA3',
    nose: '#4A2810',
    eyes: '#210F04',
    accent: '#B08968',
  },
  fox: {
    base: '#FF6B35',
    belly: '#FFF5EB',
    cheeksWhite: '#FFFFFF',
    earsInner: '#2F3542',
    cheeks: '#FF4757',
    nose: '#1E272E',
    eyes: '#2F3542',
    tailTip: '#FFFFFF',
    accent: '#E55039',
  },
  penguin: {
    base: '#2C3E50',
    belly: '#FFFFFF',
    beak: '#F39C12',
    feet: '#E67E22',
    cheeks: '#FF8DA1',
    eyes: '#2C3E50',
    accent: '#3498DB',
  },
  koala: {
    base: '#95A5A6',
    belly: '#ECF0F1',
    ears: '#7F8C8D',
    earsInner: '#FFD1DC',
    nose: '#2C3E50',
    cheeks: '#FF99C8',
    eyes: '#2C3E50',
    accent: '#16A085',
  },
  hamster: {
    base: '#E67E22',
    belly: '#FFF5EB',
    earsInner: '#FFAAA6',
    cheeks: '#FF8B94',
    nose: '#E74C3C',
    eyes: '#2C3E50',
    accent: '#F39C12',
  },
  frog: {
    base: '#2ECC71',
    belly: '#A3E4D7',
    cheeks: '#FF7675',
    mouth: '#27AE60',
    eyes: '#2C3E50',
    accent: '#1ABC9C',
  },
  duck: {
    base: '#F1C40F',
    beak: '#E67E22',
    cheeks: '#FF99C8',
    belly: '#FFF9E6',
    eyes: '#2C3E50',
    accent: '#E67E22',
  },
  lion: {
    base: '#F39C12',
    mane: '#D35400',
    earsInner: '#FFAAA6',
    cheeks: '#FF99C8',
    nose: '#2C3E50',
    eyes: '#2C3E50',
    accent: '#E67E22',
  },
  tiger: {
    base: '#E67E22',
    stripes: '#2C3E50',
    belly: '#FFF5EB',
    cheeks: '#FF8B94',
    nose: '#E74C3C',
    eyes: '#2C3E50',
    accent: '#D35400',
  },
  elephant: {
    base: '#BDC3C7',
    belly: '#ECF0F1',
    earsInner: '#FFCAD4',
    cheeks: '#FF99C8',
    trunk: '#95A5A6',
    eyes: '#2C3E50',
    accent: '#3498DB',
  },
  monkey: {
    base: '#8D6E63',
    belly: '#D7CCC8',
    cheeks: '#FF8A80',
    earsInner: '#BCAAA4',
    eyes: '#2C3E50',
    accent: '#5D4037',
  },
  owl: {
    base: '#795548',
    belly: '#D7CCC8',
    eyes: '#FFD54F',
    beak: '#FF9800',
    cheeks: '#FF8A80',
    accent: '#4E342E',
  },
  default: {
    base: '#FFD166',
    belly: '#FFFDF0',
    cheeks: '#FF99C8',
    eyes: '#2B2D42',
    nose: '#3E2723',
    accent: '#E76F51',
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
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Pixel sizing mapping
  const pixelSize =
    typeof size === 'number'
      ? size
      : size === 'sm'
      ? 28
      : size === 'md'
      ? 40
      : size === 'lg'
      ? 80
      : 140; // xl

  const character = emoji ? emoji.character : 'cat';
  const emotion = emoji ? emoji.emotion : 'laugh';
  const packId = emoji ? emoji.packId : 'cute_friends';
  const palette = PALETTES[character] || PALETTES.default;

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
    if (!interactive && !onClick) return;
    if (interactive) {
      e.stopPropagation();
      triggerAnimation();
    }
    if (onClick) onClick();
  };

  if (!emoji) {
    return (
      <div
        style={{ width: pixelSize, height: pixelSize }}
        className={`inline-flex items-center justify-center rounded-2xl bg-brand-500/10 border border-brand-500/30 text-brand-500 select-none pointer-events-none ${className}`}
        title={`Custom Emoji: ${emojiId}`}
      >
        <span className="text-xs font-mono font-bold">✨</span>
      </div>
    );
  }

  const isClickable = Boolean(interactive || onClick);

  return (
    <motion.div
      onClick={isClickable ? handleTap : undefined}
      whileHover={interactive ? { scale: 1.08 } : undefined}
      whileTap={interactive ? { scale: 0.92 } : undefined}
      className={`relative inline-flex items-center justify-center select-none ${isClickable ? 'cursor-pointer' : 'pointer-events-none'} ${className}`}
      style={{
        width: pixelSize,
        height: pixelSize,
        minWidth: pixelSize,
        minHeight: pixelSize,
        pointerEvents: isClickable ? 'auto' : 'none',
      }}
      role="img"
      aria-label={emoji.name || emoji.description}
      title={emoji.name}
    >
      <svg
        viewBox="0 0 100 100"
        width="100%"
        height="100%"
        className="overflow-visible filter drop-shadow-xs"
      >
        <defs>
          {/* Blush / Cheek Glow */}
          <radialGradient id={`blush_${emojiId}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor={palette.cheeks || '#FF8B94'} stopOpacity="0.8" />
            <stop offset="100%" stopColor={palette.cheeks || '#FF8B94'} stopOpacity="0" />
          </radialGradient>

          {/* Tear Waterfall Gradient */}
          <linearGradient id="tearGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#70A1FF" />
            <stop offset="100%" stopColor="#1E90FF" />
          </linearGradient>

          {/* Pink/Red Heart Gradient */}
          <linearGradient id="heartGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF6B8B" />
            <stop offset="100%" stopColor="#FF4757" />
          </linearGradient>

          {/* Gold / Star / Trophy Gradient */}
          <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFEAA7" />
            <stop offset="50%" stopColor="#FDCB6E" />
            <stop offset="100%" stopColor="#E17055" />
          </linearGradient>

          {/* Fire Gradient */}
          <linearGradient id="fireGrad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#FF4757" />
            <stop offset="50%" stopColor="#FFA502" />
            <stop offset="100%" stopColor="#FFFA65" />
          </linearGradient>

          {/* Pizza Crust Gradient */}
          <linearGradient id="crustGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#D35400" />
            <stop offset="100%" stopColor="#E67E22" />
          </linearGradient>

          {/* Boba Tea Gradient */}
          <linearGradient id="teaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#E0AE87" />
            <stop offset="100%" stopColor="#C68B59" />
          </linearGradient>
        </defs>

        {/* --- 1. PARTICLE EFFECTS & ATMOSPHERE (Back Layer) --- */}
        {(emotion === 'love' || packId === 'love') && (
          <LoveParticles isPlaying={isPlaying} playCount={playCount} />
        )}
        {(emotion === 'cry' || emotion === 'sad') && (
          <CryStreams isPlaying={isPlaying} playCount={playCount} />
        )}
        {(emotion === 'laugh' || emotion === 'rofl' || emotion === 'lol') && (
          <LaughTeardrops isPlaying={isPlaying} playCount={playCount} />
        )}
        {emotion === 'angry' && (
          <AngrySteamParticles isPlaying={isPlaying} playCount={playCount} />
        )}
        {(emotion === 'surprised' || emotion === 'shocked' || emotion === 'mindblown') && (
          <SurpriseSparks isPlaying={isPlaying} playCount={playCount} />
        )}
        {(packId === 'celebration' || emotion === 'party' || emotion === 'celebrate') && (
          <PartyConfettiParticles isPlaying={isPlaying} playCount={playCount} />
        )}
        {(character === 'fire' || emotion === 'fire') && (
          <FireEmbersParticles isPlaying={isPlaying} playCount={playCount} />
        )}
        {(character === 'coffee' || character === 'tea' || character === 'ramen') && (
          <SteamParticles isPlaying={isPlaying} playCount={playCount} />
        )}
        {(emotion === 'sleepy' || emotion === 'sleep') && (
          <ZzzSleepParticles isPlaying={isPlaying} playCount={playCount} />
        )}

        {/* --- 2. MAIN BODY DISPATCHER --- */}
        {packId === 'love' ? (
          <LovePackRenderer emoji={emoji} isPlaying={isPlaying} playCount={playCount} />
        ) : packId === 'food' ? (
          <FoodPackRenderer emoji={emoji} isPlaying={isPlaying} playCount={playCount} />
        ) : packId === 'celebration' ? (
          <CelebrationPackRenderer emoji={emoji} isPlaying={isPlaying} playCount={playCount} />
        ) : packId === 'funny' ? (
          <FunnyPackRenderer emoji={emoji} isPlaying={isPlaying} playCount={playCount} />
        ) : packId === 'mood' ? (
          <MoodPackRenderer emoji={emoji} isPlaying={isPlaying} playCount={playCount} />
        ) : (
          /* Default to cute animal character body (Cute Friends & Animals packs) */
          <CharacterBody
            character={character}
            emotion={emotion}
            palette={palette}
            isPlaying={isPlaying}
            playCount={playCount}
          />
        )}
      </svg>
    </motion.div>
  );
};

// =========================================================================
// 1. ANIMAL CHARACTERS (Cute Friends & Animal Kingdom)
// =========================================================================

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
  const getBodyMotion = (): TargetAndTransition => {
    if (!isPlaying) return { y: 0, rotate: 0, scale: 1 };
    switch (emotion) {
      case 'laugh':
      case 'rofl':
      case 'lol':
        return {
          y: [0, -6, 2, -5, 1, -4, 0],
          rotate: [0, -3, 3, -2, 2, -1, 0],
          scale: [1, 1.05, 0.98, 1.04, 0.99, 1.02, 1],
          transition: { duration: 1.4, repeat: isPlaying ? 1 : 0, ease: 'easeInOut' },
        };
      case 'cry':
      case 'sad':
        return {
          y: [0, 3, -1, 4, 0],
          rotate: [0, -2, 2, -1, 1, 0],
          scale: [1, 0.97, 1.01, 0.98, 1],
          transition: { duration: 1.8, repeat: isPlaying ? 1 : 0, ease: 'easeInOut' },
        };
      case 'love':
      case 'hug':
      case 'kiss':
        return {
          y: [0, -8, 0, -4, 0],
          scale: [1, 1.08, 0.97, 1.04, 1],
          transition: { duration: 1.5, repeat: isPlaying ? 1 : 0, ease: 'easeInOut' },
        };
      case 'angry':
      case 'roar':
        return {
          x: [0, -3, 3, -4, 4, -2, 2, 0],
          y: [0, 2, 0, 3, 0],
          rotate: [0, -4, 4, -5, 5, -2, 2, 0],
          scale: [1, 1.06, 0.96, 1.04, 1],
          transition: { duration: 1.1, repeat: isPlaying ? 1 : 0, ease: 'easeInOut' },
        };
      case 'surprised':
      case 'shocked':
        return {
          y: [0, -12, 2, -4, 0],
          scale: [1, 1.12, 0.95, 1.03, 1],
          transition: { duration: 1.3, ease: 'backOut' },
        };
      case 'dance':
      case 'waddle':
        return {
          y: [0, -6, 0, -6, 0],
          rotate: [-6, 6, -6, 6, 0],
          transition: { duration: 1.2, repeat: 1, ease: 'easeInOut' },
        };
      case 'sleepy':
      case 'sleep':
        return {
          y: [0, 2, 0, 2, 0],
          scale: [1, 0.98, 1.01, 0.98, 1],
          transition: { duration: 2.2, repeat: 1, ease: 'easeInOut' },
        };
      default:
        return { y: 0, rotate: 0, scale: 1 };
    }
  };

  return (
    <motion.g animate={getBodyMotion()} key={playCount} style={{ transformOrigin: '50% 65%' }}>
      {/* 1. Specialized Ears & Headwear Layer */}
      <CharacterEars character={character} palette={palette} emotion={emotion} isPlaying={isPlaying} />

      {/* 2. Main Head Circle / Body Base */}
      {character === 'penguin' ? (
        // Penguin Egg-Shaped Body
        <g>
          <ellipse cx="50" cy="56" rx="34" ry="38" fill={palette.base} />
          <ellipse cx="50" cy="58" rx="24" ry="28" fill={palette.belly} />
        </g>
      ) : character === 'duck' ? (
        // Duck Head & Cheerful Crest
        <g>
          <circle cx="50" cy="52" r="35" fill={palette.base} />
          <ellipse cx="50" cy="62" rx="26" ry="20" fill={palette.belly} />
        </g>
      ) : character === 'frog' ? (
        // Frog Wide Oval Head
        <g>
          {/* Big Frog Eye Domes */}
          <circle cx="30" cy="36" r="16" fill={palette.base} />
          <circle cx="70" cy="36" r="16" fill={palette.base} />
          <ellipse cx="50" cy="58" rx="38" ry="30" fill={palette.base} />
          <ellipse cx="50" cy="66" rx="26" ry="18" fill={palette.belly} />
        </g>
      ) : character === 'owl' ? (
        // Owl Body
        <g>
          <ellipse cx="50" cy="54" rx="35" ry="37" fill={palette.base} />
          <ellipse cx="50" cy="64" rx="24" ry="24" fill={palette.belly} />
          {/* Owl Feather Details */}
          <path d="M 42 62 Q 50 66 58 62" stroke="#BCAAA4" strokeWidth="2" fill="none" strokeLinecap="round" />
          <path d="M 44 68 Q 50 72 56 68" stroke="#BCAAA4" strokeWidth="2" fill="none" strokeLinecap="round" />
        </g>
      ) : (
        // Standard Kawaii Round Head
        <circle
          cx="50"
          cy="54"
          r="36"
          fill={palette.base}
          stroke={character === 'panda' || character === 'bunny' ? '#E2E8F0' : 'none'}
          strokeWidth={character === 'panda' || character === 'bunny' ? '1.5' : '0'}
        />
      )}

      {/* 3. Character Specific Markings */}
      {character === 'cat' && (
        <>
          <line x1="16" y1="56" x2="30" y2="58" stroke={palette.whiskers} strokeWidth="2" strokeLinecap="round" />
          <line x1="16" y1="62" x2="30" y2="61" stroke={palette.whiskers} strokeWidth="2" strokeLinecap="round" />
          <line x1="84" y1="56" x2="70" y2="58" stroke={palette.whiskers} strokeWidth="2" strokeLinecap="round" />
          <line x1="84" y1="62" x2="70" y2="61" stroke={palette.whiskers} strokeWidth="2" strokeLinecap="round" />
        </>
      )}

      {character === 'panda' && (
        <>
          <ellipse cx="34" cy="52" rx="10" ry="12" fill={palette.patches} transform="rotate(-15 34 52)" />
          <ellipse cx="66" cy="52" rx="10" ry="12" fill={palette.patches} transform="rotate(15 66 52)" />
        </>
      )}

      {character === 'fox' && (
        <path d="M 22 55 Q 36 78 50 78 Q 64 78 78 55 Q 86 65 72 82 Q 50 92 28 82 Q 14 65 22 55 Z" fill={palette.cheeksWhite} />
      )}

      {character === 'bear' && (
        <ellipse cx="50" cy="62" rx="14" ry="11" fill={palette.snout} />
      )}

      {character === 'tiger' && (
        <g stroke={palette.stripes} strokeWidth="2.5" strokeLinecap="round">
          {/* Forehead Stripes */}
          <line x1="50" y1="28" x2="50" y2="38" />
          <line x1="44" y1="32" x2="56" y2="32" />
          {/* Cheek Stripes */}
          <line x1="20" y1="54" x2="28" y2="56" />
          <line x1="80" y1="54" x2="72" y2="56" />
        </g>
      )}

      {character === 'lion' && (
        <ellipse cx="50" cy="62" rx="14" ry="10" fill="#FFEAA7" />
      )}

      {character === 'elephant' && (
        <g>
          {/* Elephant Trunk */}
          <path d="M 47 56 Q 44 70 50 78 Q 56 82 60 76" stroke={palette.trunk} strokeWidth="7" fill="none" strokeLinecap="round" />
        </g>
      )}

      {character === 'monkey' && (
        <g>
          {/* Monkey Light Face Area */}
          <ellipse cx="40" cy="52" rx="14" ry="14" fill={palette.belly} />
          <ellipse cx="60" cy="52" rx="14" ry="14" fill={palette.belly} />
          <ellipse cx="50" cy="62" rx="20" ry="14" fill={palette.belly} />
        </g>
      )}

      {character === 'hamster' && (
        <ellipse cx="50" cy="62" rx="16" ry="12" fill={palette.belly} />
      )}

      {/* 4. Blushing Cheeks */}
      <circle cx="28" cy="62" r="7" fill={palette.cheeks} opacity={emotion === 'love' ? 0.8 : 0.45} />
      <circle cx="72" cy="62" r="7" fill={palette.cheeks} opacity={emotion === 'love' ? 0.8 : 0.45} />

      {/* 5. Eyes & Eyebrows */}
      <CharacterEyes emotion={emotion} palette={palette} character={character} isPlaying={isPlaying} />

      {/* 6. Nose & Mouth */}
      <CharacterMouth emotion={emotion} palette={palette} character={character} isPlaying={isPlaying} />
    </motion.g>
  );
};

// --- EARS & ACCESSORIES COMPONENT ---
const CharacterEars: React.FC<{
  character: CustomEmojiCharacter;
  palette: any;
  emotion: CustomEmojiEmotion;
  isPlaying: boolean;
}> = ({ character, palette, emotion, isPlaying }) => {
  const getEarMotion = (isLeft: boolean): TargetAndTransition => {
    if (!isPlaying) return { rotate: 0 };
    if (emotion === 'laugh' || emotion === 'lol' || emotion === 'rofl') {
      return { rotate: isLeft ? [0, -8, 4, -6, 0] : [0, 8, -4, 6, 0], transition: { duration: 1.2 } };
    }
    if (emotion === 'surprised' || emotion === 'shocked') {
      return { y: [-2, -8, 0], rotate: isLeft ? [-5, -12, 0] : [5, 12, 0], transition: { duration: 0.9 } };
    }
    if (emotion === 'cry' || emotion === 'sad') {
      return { y: [0, 4, 1, 3, 0], rotate: isLeft ? [0, -10, 0] : [0, 10, 0], transition: { duration: 1.6 } };
    }
    return { rotate: 0 };
  };

  switch (character) {
    case 'cat':
      return (
        <g>
          <motion.polygon points="22,34 36,16 44,30" fill={palette.base} animate={getEarMotion(true)} style={{ transformOrigin: '30px 30px' }} />
          <polygon points="26,32 36,20 41,29" fill={palette.earsInner} />
          <motion.polygon points="78,34 64,16 56,30" fill={palette.base} animate={getEarMotion(false)} style={{ transformOrigin: '70px 30px' }} />
          <polygon points="74,32 64,20 59,29" fill={palette.earsInner} />
        </g>
      );

    case 'dog':
      return (
        <g>
          <motion.path d="M 22 36 C 12 45, 10 65, 20 72 C 28 76, 32 65, 28 46 Z" fill={palette.ears} animate={getEarMotion(true)} style={{ transformOrigin: '25px 36px' }} />
          <motion.path d="M 78 36 C 88 45, 90 65, 80 72 C 72 76, 68 65, 72 46 Z" fill={palette.ears} animate={getEarMotion(false)} style={{ transformOrigin: '75px 36px' }} />
        </g>
      );

    case 'panda':
      return (
        <g>
          <motion.circle cx="24" cy="28" r="12" fill={palette.patches} animate={getEarMotion(true)} style={{ transformOrigin: '24px 28px' }} />
          <motion.circle cx="76" cy="28" r="12" fill={palette.patches} animate={getEarMotion(false)} style={{ transformOrigin: '76px 28px' }} />
        </g>
      );

    case 'bunny':
      return (
        <g>
          <motion.ellipse cx="32" cy="18" rx="8" ry="20" fill={palette.base} stroke="#E2E8F0" strokeWidth="1.5" animate={getEarMotion(true)} style={{ transformOrigin: '32px 34px' }} />
          <ellipse cx="32" cy="18" rx="4.5" ry="15" fill={palette.earsInner} />
          <motion.ellipse cx="68" cy="18" rx="8" ry="20" fill={palette.base} stroke="#E2E8F0" strokeWidth="1.5" animate={getEarMotion(false)} style={{ transformOrigin: '68px 34px' }} />
          <ellipse cx="68" cy="18" rx="4.5" ry="15" fill={palette.earsInner} />
        </g>
      );

    case 'bear':
    case 'hamster':
      return (
        <g>
          <motion.circle cx="22" cy="28" r="13" fill={palette.base} animate={getEarMotion(true)} style={{ transformOrigin: '22px 28px' }} />
          <circle cx="22" cy="28" r="7" fill={palette.earsInner} />
          <motion.circle cx="78" cy="28" r="13" fill={palette.base} animate={getEarMotion(false)} style={{ transformOrigin: '78px 28px' }} />
          <circle cx="78" cy="28" r="7" fill={palette.earsInner} />
        </g>
      );

    case 'fox':
    case 'tiger':
      return (
        <g>
          <motion.polygon points="18,36 32,10 44,28" fill={palette.base} animate={getEarMotion(true)} style={{ transformOrigin: '28px 30px' }} />
          <polygon points="26,32 32,16 40,27" fill={palette.earsInner} />
          <motion.polygon points="82,36 68,10 56,28" fill={palette.base} animate={getEarMotion(false)} style={{ transformOrigin: '72px 30px' }} />
          <polygon points="74,32 68,16 60,27" fill={palette.earsInner} />
        </g>
      );

    case 'koala':
      return (
        <g>
          {/* Fluffy Round Koala Ears */}
          <motion.circle cx="18" cy="32" r="16" fill={palette.ears} animate={getEarMotion(true)} style={{ transformOrigin: '20px 34px' }} />
          <circle cx="18" cy="32" r="10" fill={palette.earsInner} />
          <motion.circle cx="82" cy="32" r="16" fill={palette.ears} animate={getEarMotion(false)} style={{ transformOrigin: '80px 34px' }} />
          <circle cx="82" cy="32" r="10" fill={palette.earsInner} />
        </g>
      );

    case 'lion':
      return (
        <g>
          {/* Lion Lush Round Mane */}
          <motion.circle cx="50" cy="54" r="44" fill={palette.mane} stroke="#C0392B" strokeWidth="2" />
        </g>
      );

    case 'elephant':
      return (
        <g>
          {/* Large Flapping Elephant Ears */}
          <motion.ellipse cx="14" cy="50" rx="14" ry="22" fill={palette.base} animate={getEarMotion(true)} style={{ transformOrigin: '22px 50px' }} />
          <ellipse cx="14" cy="50" rx="9" ry="16" fill={palette.earsInner} />
          <motion.ellipse cx="86" cy="50" rx="14" ry="22" fill={palette.base} animate={getEarMotion(false)} style={{ transformOrigin: '78px 50px' }} />
          <ellipse cx="86" cy="50" rx="9" ry="16" fill={palette.earsInner} />
        </g>
      );

    case 'monkey':
      return (
        <g>
          {/* Round Monkey Ears */}
          <motion.circle cx="14" cy="52" r="12" fill={palette.base} animate={getEarMotion(true)} style={{ transformOrigin: '20px 52px' }} />
          <circle cx="14" cy="52" r="7" fill={palette.earsInner} />
          <motion.circle cx="86" cy="52" r="12" fill={palette.base} animate={getEarMotion(false)} style={{ transformOrigin: '80px 52px' }} />
          <circle cx="86" cy="52" r="7" fill={palette.earsInner} />
        </g>
      );

    case 'owl':
      return (
        <g>
          {/* Owl Feather Tufts */}
          <polygon points="26,30 32,14 42,26" fill={palette.base} />
          <polygon points="74,30 68,14 58,26" fill={palette.base} />
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
}> = ({ emotion, palette, character }) => {
  const eyeColor = character === 'panda' ? '#FFFFFF' : palette.eyes || '#2D3436';

  if (character === 'owl') {
    return (
      <g>
        {/* Big Owl Golden Ring Eyes */}
        <circle cx="34" cy="48" r="13" fill="#FFEAA7" />
        <circle cx="66" cy="48" r="13" fill="#FFEAA7" />
        <circle cx="34" cy="48" r="8" fill="#2D3436" />
        <circle cx="66" cy="48" r="8" fill="#2D3436" />
        <circle cx="31" cy="45" r="3" fill="#FFFFFF" />
        <circle cx="63" cy="45" r="3" fill="#FFFFFF" />
      </g>
    );
  }

  if (character === 'frog') {
    return (
      <g>
        <circle cx="30" cy="36" r="10" fill="#FFFFFF" />
        <circle cx="70" cy="36" r="10" fill="#FFFFFF" />
        <circle cx="30" cy="36" r="5" fill="#2D3436" />
        <circle cx="70" cy="36" r="5" fill="#2D3436" />
        <circle cx="28" cy="34" r="2" fill="#FFFFFF" />
        <circle cx="68" cy="34" r="2" fill="#FFFFFF" />
      </g>
    );
  }

  switch (emotion) {
    case 'laugh':
    case 'lol':
    case 'rofl':
    case 'wink':
      return (
        <g stroke={eyeColor} strokeWidth="3.5" strokeLinecap="round" fill="none">
          <path d="M 28 52 Q 36 44 44 52" />
          <path d="M 56 52 Q 64 44 72 52" />
        </g>
      );

    case 'cry':
    case 'sad':
      return (
        <g stroke={eyeColor} strokeWidth="3.5" strokeLinecap="round" fill="none">
          <path d="M 28 50 Q 36 57 44 52" />
          <path d="M 56 52 Q 64 57 72 50" />
        </g>
      );

    case 'love':
    case 'hug':
    case 'kiss':
      return (
        <g fill="url(#heartGrad)">
          <path d="M 36 44 C 36 38, 28 38, 28 44 C 28 49, 36 54, 36 56 C 36 54, 44 49, 44 44 C 44 38, 36 38, 36 44 Z" />
          <path d="M 64 44 C 64 38, 56 38, 56 44 C 56 49, 64 54, 64 56 C 64 54, 72 49, 72 44 C 72 38, 64 38, 64 44 Z" />
        </g>
      );

    case 'angry':
    case 'roar':
      return (
        <g>
          <line x1="28" y1="42" x2="42" y2="48" stroke={eyeColor} strokeWidth="3" strokeLinecap="round" />
          <line x1="72" y1="42" x2="58" y2="48" stroke={eyeColor} strokeWidth="3" strokeLinecap="round" />
          <circle cx="36" cy="52" r="4.5" fill={eyeColor} />
          <circle cx="64" cy="52" r="4.5" fill={eyeColor} />
        </g>
      );

    case 'surprised':
    case 'shocked':
      return (
        <g fill={eyeColor}>
          <circle cx="35" cy="50" r="7.5" />
          <circle cx="65" cy="50" r="7.5" />
          <circle cx="33" cy="48" r="2.8" fill="#FFFFFF" />
          <circle cx="63" cy="48" r="2.8" fill="#FFFFFF" />
          <circle cx="37" cy="52" r="1.4" fill="#FFFFFF" />
          <circle cx="67" cy="52" r="1.4" fill="#FFFFFF" />
        </g>
      );

    case 'cool':
      // Black Sunglasses
      return (
        <g fill="#2D3436">
          <path d="M 22 46 C 22 42, 44 42, 44 46 L 43 56 C 43 60, 24 60, 23 56 Z" />
          <path d="M 56 46 C 56 42, 78 42, 78 46 L 77 56 C 77 60, 58 60, 57 56 Z" />
          <line x1="44" y1="48" x2="56" y2="48" stroke="#2D3436" strokeWidth="3" strokeLinecap="round" />
          {/* Glass White Sheen */}
          <line x1="26" y1="48" x2="34" y2="56" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
          <line x1="60" y1="48" x2="68" y2="56" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
        </g>
      );

    case 'sleepy':
    case 'sleep':
      return (
        <g stroke={eyeColor} strokeWidth="3" strokeLinecap="round" fill="none">
          <line x1="28" y1="52" x2="42" y2="52" />
          <line x1="58" y1="52" x2="72" y2="52" />
        </g>
      );

    default:
      return (
        <g fill={eyeColor}>
          <circle cx="36" cy="52" r="4.5" />
          <circle cx="64" cy="52" r="4.5" />
          <circle cx="34.5" cy="50.5" r="1.5" fill="#FFFFFF" />
          <circle cx="62.5" cy="50.5" r="1.5" fill="#FFFFFF" />
        </g>
      );
  }
};

// --- MOUTH COMPONENT ---
const CharacterMouth: React.FC<{
  emotion: CustomEmojiEmotion;
  palette: any;
  character: CustomEmojiCharacter;
  isPlaying: boolean;
}> = ({ emotion, palette, character }) => {
  const noseColor = palette.nose || '#2D3436';

  if (character === 'duck' || character === 'penguin') {
    return (
      <g>
        {/* Orange Beak */}
        <path d="M 40 60 Q 50 68 60 60 Q 50 72 40 60 Z" fill={palette.beak || '#E67E22'} stroke="#D35400" strokeWidth="1.5" />
      </g>
    );
  }

  if (character === 'owl') {
    return (
      <polygon points="46,58 54,58 50,68" fill={palette.beak || '#FF9800'} />
    );
  }

  if (character === 'koala') {
    return (
      <g>
        {/* Big Large Koala Nose */}
        <ellipse cx="50" cy="58" rx="8" ry="12" fill={palette.nose} />
        <path d="M 45 72 Q 50 75 55 72" stroke="#2D3436" strokeWidth="2" strokeLinecap="round" fill="none" />
      </g>
    );
  }

  return (
    <g>
      {/* Cute Little Nose (except frog & elephant) */}
      {character !== 'frog' && character !== 'elephant' && (
        <polygon points="47,58 53,58 50,62" fill={noseColor} />
      )}

      {/* Mouth Expressions */}
      {(emotion === 'laugh' || emotion === 'lol' || emotion === 'rofl' || emotion === 'happy') && (
        <g>
          <path d="M 40 64 Q 50 78 60 64 Z" fill="#FF4757" stroke="#2D3436" strokeWidth="1.5" />
          <path d="M 44 70 Q 50 66 56 70 Q 50 78 44 70 Z" fill="#FFAAA6" />
        </g>
      )}

      {(emotion === 'cry' || emotion === 'sad') && (
        <path d="M 43 72 Q 50 64 57 72" stroke="#2D3436" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      )}

      {(emotion === 'love' || emotion === 'hug' || emotion === 'blush') && (
        <path d="M 44 65 Q 50 72 56 65" stroke="#2D3436" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      )}

      {(emotion === 'angry' || emotion === 'roar') && (
        <path d="M 43 68 Q 50 62 57 68" stroke="#2D3436" strokeWidth="3" strokeLinecap="round" fill="none" />
      )}

      {(emotion === 'surprised' || emotion === 'shocked') && (
        <ellipse cx="50" cy="68" rx="6" ry="8" fill="#FF4757" stroke="#2D3436" strokeWidth="1.5" />
      )}

      {emotion === 'kiss' && (
        <ellipse cx="50" cy="66" rx="5" ry="4" fill="#FF4757" />
      )}
    </g>
  );
};

// =========================================================================
// 2. LOVE PACK RENDERER (Hearts, Kisses, Hugs, Roses, Letters, Couples)
// =========================================================================

const LovePackRenderer: React.FC<{ emoji: any; isPlaying: boolean; playCount: number }> = ({
  emoji,
  isPlaying,
  playCount,
}) => {
  const getMotion = (): TargetAndTransition => {
    if (!isPlaying) return { scale: 1, rotate: 0 };
    switch (emoji.id) {
      case 'love_heart':
      case 'love_heart_eyes':
        return { scale: [1, 1.25, 0.95, 1.18, 1], transition: { duration: 1.2, repeat: 1 } };
      case 'love_kiss':
        return { scale: [1, 1.15, 0.9, 1.1, 1], rotate: [0, -8, 8, -4, 0], transition: { duration: 1.3 } };
      case 'love_broken_heart':
        return { x: [0, -3, 3, -2, 2, 0], transition: { duration: 0.8 } };
      case 'love_letter':
        return { y: [0, -10, 0, -5, 0], rotate: [0, -5, 5, 0], transition: { duration: 1.4 } };
      case 'love_rose':
        return { scale: [0.9, 1.1, 1], rotate: [0, 8, -8, 0], transition: { duration: 1.5 } };
      default:
        return { scale: [1, 1.1, 0.95, 1.05, 1], transition: { duration: 1.4 } };
    }
  };

  return (
    <motion.g animate={getMotion()} key={playCount} style={{ transformOrigin: '50% 50%' }}>
      {emoji.id === 'love_broken_heart' ? (
        // Broken Heart
        <g fill="url(#heartGrad)">
          <path d="M 50 85 C 15 55, 10 25, 30 18 C 45 12, 48 30, 48 30 L 52 42 L 46 54 L 52 66 L 50 85 Z" />
          <path d="M 50 85 C 85 55, 90 25, 70 18 C 55 12, 52 30, 52 30 L 56 42 L 50 54 L 56 66 L 50 85 Z" />
        </g>
      ) : emoji.id === 'love_rose' ? (
        // Kawaii Blooming Red Rose
        <g>
          {/* Stem & Leaves */}
          <path d="M 50 50 Q 50 85 45 92" stroke="#27AE60" strokeWidth="5" fill="none" strokeLinecap="round" />
          <path d="M 48 70 Q 30 65 34 78 Q 45 76 48 70 Z" fill="#2ECC71" />
          <path d="M 50 62 Q 70 56 66 68 Q 55 68 50 62 Z" fill="#2ECC71" />
          {/* Rose Petals */}
          <circle cx="50" cy="38" r="24" fill="url(#heartGrad)" />
          <path d="M 38 34 C 42 20, 58 20, 62 34 C 64 48, 36 48, 38 34 Z" fill="#E74C3C" />
          <circle cx="50" cy="36" r="9" fill="#C0392B" />
        </g>
      ) : emoji.id === 'love_letter' ? (
        // Cute Love Letter with Heart Seal
        <g>
          <rect x="18" y="28" width="64" height="46" rx="8" fill="#FFFDF0" stroke="#FF758C" strokeWidth="3" />
          <path d="M 20 30 L 50 54 L 80 30" stroke="#FF758C" strokeWidth="3" fill="none" strokeLinecap="round" />
          {/* Heart Seal */}
          <path d="M 50 58 C 50 52, 44 52, 44 58 C 44 63, 50 68, 50 70 C 50 68, 56 63, 56 58 C 56 52, 50 52, 50 58 Z" fill="url(#heartGrad)" />
        </g>
      ) : emoji.id === 'love_kiss' ? (
        // Juicy Kiss Lips
        <g fill="url(#heartGrad)">
          <path d="M 20 50 C 32 32, 45 42, 50 48 C 55 42, 68 32, 80 50 C 70 56, 58 52, 50 54 C 42 52, 30 56, 20 50 Z" />
          <path d="M 22 52 C 34 68, 66 68, 78 52 C 65 60, 35 60, 22 52 Z" />
        </g>
      ) : (
        // Big Luscious Pulsing Heart
        <g fill="url(#heartGrad)">
          <path d="M 50 85 C 10 55, 8 20, 30 18 C 44 16, 48 32, 50 36 C 52 32, 56 16, 70 18 C 92 20, 90 55, 50 85 Z" />
          {/* Kawaii Face on Heart */}
          <circle cx="38" cy="46" r="3.5" fill="#FFFFFF" />
          <circle cx="62" cy="46" r="3.5" fill="#FFFFFF" />
          <circle cx="30" cy="54" r="5" fill="#FFAAA6" opacity="0.8" />
          <circle cx="70" cy="54" r="5" fill="#FFAAA6" opacity="0.8" />
          <path d="M 45 56 Q 50 62 55 56" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        </g>
      )}
    </motion.g>
  );
};

// =========================================================================
// 3. FOOD & DRINKS PACK RENDERER
// =========================================================================

const FoodPackRenderer: React.FC<{ emoji: any; isPlaying: boolean; playCount: number }> = ({
  emoji,
  isPlaying,
  playCount,
}) => {
  const getMotion = (): TargetAndTransition => {
    if (!isPlaying) return { scale: 1, rotate: 0 };
    return {
      scale: [1, 1.12, 0.96, 1.06, 1],
      rotate: [0, -4, 4, 0],
      transition: { duration: 1.3 },
    };
  };

  return (
    <motion.g animate={getMotion()} key={playCount} style={{ transformOrigin: '50% 50%' }}>
      {emoji.id === 'food_pizza' ? (
        // Cheesy Pizza Slice
        <g>
          <path d="M 50 86 L 20 28 Q 50 16 80 28 Z" fill="#F39C12" />
          {/* Crust */}
          <path d="M 18 28 Q 50 14 82 28 Q 50 20 18 28 Z" fill="url(#crustGrad)" />
          {/* Pepperoni & Cheesy Drops */}
          <circle cx="45" cy="44" r="7" fill="#C0392B" />
          <circle cx="62" cy="54" r="6" fill="#C0392B" />
          <circle cx="38" cy="62" r="5.5" fill="#C0392B" />
          {/* Cute Face */}
          <circle cx="46" cy="42" r="1.5" fill="#FFFFFF" />
          <circle cx="63" cy="52" r="1.5" fill="#FFFFFF" />
        </g>
      ) : emoji.id === 'food_burger' ? (
        // Stacked Kawaii Burger
        <g>
          {/* Top Bun */}
          <path d="M 20 40 C 20 20, 80 20, 80 40 Z" fill="#E67E22" />
          {/* Seeds */}
          <ellipse cx="40" cy="28" rx="2" ry="1" fill="#FFFDF0" />
          <ellipse cx="55" cy="26" rx="2" ry="1" fill="#FFFDF0" />
          <ellipse cx="65" cy="32" rx="2" ry="1" fill="#FFFDF0" />
          {/* Tomato & Lettuce */}
          <rect x="22" y="40" width="56" height="6" rx="3" fill="#E74C3C" />
          <path d="M 18 48 Q 30 42 40 48 Q 50 42 60 48 Q 70 42 82 48" stroke="#2ECC71" strokeWidth="5" fill="none" />
          {/* Patty */}
          <rect x="20" y="52" width="60" height="10" rx="4" fill="#795548" />
          {/* Bottom Bun */}
          <rect x="22" y="64" width="56" height="12" rx="6" fill="#E67E22" />
          {/* Eyes & Smile */}
          <circle cx="42" cy="35" r="2.5" fill="#2D3436" />
          <circle cx="58" cy="35" r="2.5" fill="#2D3436" />
          <path d="M 48 37 Q 50 40 52 37" stroke="#2D3436" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </g>
      ) : emoji.id === 'food_coffee' || emoji.id === 'food_tea' ? (
        // Cute Steaming Mug
        <g>
          {/* Mug Handle */}
          <path d="M 70 46 C 86 46, 86 70, 70 70" stroke="#E67E22" strokeWidth="6" fill="none" strokeLinecap="round" />
          {/* Mug Body */}
          <rect x="22" y="38" width="52" height="42" rx="10" fill="#FF7675" />
          {/* Eyes & Cheeks */}
          <circle cx="38" cy="54" r="3" fill="#FFFFFF" />
          <circle cx="58" cy="54" r="3" fill="#FFFFFF" />
          <circle cx="32" cy="60" r="4" fill="#FF8B94" />
          <circle cx="64" cy="60" r="4" fill="#FF8B94" />
          <path d="M 44 60 Q 48 64 52 60" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" fill="none" />
        </g>
      ) : emoji.id === 'food_boba' ? (
        // Boba Bubble Tea
        <g>
          {/* Straw */}
          <rect x="52" y="12" width="6" height="30" rx="2" fill="#E74C3C" transform="rotate(15 52 12)" />
          {/* Cup */}
          <path d="M 28 32 L 34 84 Q 50 88 66 84 L 72 32 Z" fill="url(#teaGrad)" stroke="#BCAAA4" strokeWidth="2" />
          {/* Boba Pearls */}
          <circle cx="42" cy="74" r="4" fill="#2D3436" />
          <circle cx="54" cy="76" r="4" fill="#2D3436" />
          <circle cx="48" cy="66" r="4" fill="#2D3436" />
          <circle cx="60" cy="68" r="4" fill="#2D3436" />
          {/* Eyes & Smile */}
          <circle cx="44" cy="48" r="3" fill="#2D3436" />
          <circle cx="58" cy="48" r="3" fill="#2D3436" />
          <path d="M 48 54 Q 51 57 54 54" stroke="#2D3436" strokeWidth="2" strokeLinecap="round" fill="none" />
        </g>
      ) : emoji.id === 'food_donut' ? (
        // Glazed Donut with Sprinkles
        <g>
          <circle cx="50" cy="50" r="36" fill="#F39C12" />
          <circle cx="50" cy="50" r="32" fill="#FF758C" />
          <circle cx="50" cy="50" r="14" fill="#FFFFFF" />
          {/* Sprinkles */}
          <line x1="30" y1="36" x2="38" y2="34" stroke="#FFD166" strokeWidth="3" strokeLinecap="round" />
          <line x1="62" y1="32" x2="68" y2="38" stroke="#2ECC71" strokeWidth="3" strokeLinecap="round" />
          <line x1="66" y1="62" x2="72" y2="56" stroke="#3498DB" strokeWidth="3" strokeLinecap="round" />
          <line x1="32" y1="64" x2="40" y2="66" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
        </g>
      ) : (
        // Yummy Cake / Icecream
        <g>
          <circle cx="50" cy="50" r="36" fill="#FFD166" />
          <circle cx="36" cy="46" r="4" fill="#2D3436" />
          <circle cx="64" cy="46" r="4" fill="#2D3436" />
          <path d="M 42 56 Q 50 66 58 56 Z" fill="#FF4757" />
          <circle cx="30" cy="54" r="5" fill="#FF8B94" />
          <circle cx="70" cy="54" r="5" fill="#FF8B94" />
        </g>
      )}
    </motion.g>
  );
};

// =========================================================================
// 4. CELEBRATION & PARTY PACK RENDERER
// =========================================================================

const CelebrationPackRenderer: React.FC<{ emoji: any; isPlaying: boolean; playCount: number }> = ({
  emoji,
  isPlaying,
  playCount,
}) => {
  const getMotion = (): TargetAndTransition => {
    if (!isPlaying) return { scale: 1, rotate: 0 };
    switch (emoji.id) {
      case 'party_popper':
      case 'party_birthday':
        return { y: [0, -10, 0], scale: [1, 1.2, 0.95, 1], rotate: [-8, 8, -4, 0], transition: { duration: 1.2 } };
      case 'party_trophy':
      case 'party_star':
        return { scale: [1, 1.25, 0.9, 1.1, 1], rotate: [0, -10, 10, 0], transition: { duration: 1.4 } };
      case 'party_fire':
        return { scale: [1, 1.15, 0.95, 1.1, 1], transition: { duration: 1.1, repeat: 1 } };
      default:
        return { scale: [1, 1.15, 1], transition: { duration: 1.2 } };
    }
  };

  return (
    <motion.g animate={getMotion()} key={playCount} style={{ transformOrigin: '50% 50%' }}>
      {emoji.id === 'party_trophy' ? (
        // Golden Winner Trophy
        <g fill="url(#goldGrad)">
          {/* Base */}
          <rect x="34" y="78" width="32" height="10" rx="3" fill="#F39C12" />
          <rect x="42" y="66" width="16" height="14" fill="#F1C40F" />
          {/* Cup */}
          <path d="M 28 26 L 72 26 L 66 58 Q 50 68 34 58 Z" />
          {/* Handles */}
          <path d="M 28 32 C 14 32, 14 50, 32 50" stroke="#F39C12" strokeWidth="4" fill="none" strokeLinecap="round" />
          <path d="M 72 32 C 86 32, 86 50, 68 50" stroke="#F39C12" strokeWidth="4" fill="none" strokeLinecap="round" />
          {/* Star on Cup */}
          <polygon points="50,34 53,42 61,42 55,47 57,55 50,50 43,55 45,47 39,42 47,42" fill="#FFFFFF" />
        </g>
      ) : emoji.id === 'party_fire' ? (
        // Roaring Flame
        <g fill="url(#fireGrad)">
          <path d="M 50 14 C 65 34, 82 50, 76 72 C 70 88, 30 88, 24 72 C 18 52, 38 38, 50 14 Z" />
          <path d="M 50 42 C 58 54, 68 64, 62 76 C 58 84, 42 84, 38 76 C 34 66, 44 56, 50 42 Z" fill="#FFFFA6" />
        </g>
      ) : (
        // Cheerful Party Emoji with Cone Hat
        <g>
          {/* Party Cone Hat */}
          <polygon points="50,8 34,34 66,34" fill="#9B59B6" />
          <circle cx="50" cy="8" r="4" fill="#FFD166" />
          <path d="M 38 26 L 62 26" stroke="#FF7675" strokeWidth="3" />
          <path d="M 42 18 L 58 18" stroke="#2ECC71" strokeWidth="3" />
          {/* Face Base */}
          <circle cx="50" cy="58" r="34" fill="#FFD166" />
          {/* Eyes & Big Grin */}
          <g stroke="#2D3436" strokeWidth="3.5" strokeLinecap="round" fill="none">
            <path d="M 30 54 Q 38 46 46 54" />
            <path d="M 54 54 Q 62 46 70 54" />
          </g>
          <path d="M 38 66 Q 50 82 62 66 Z" fill="#FF4757" stroke="#2D3436" strokeWidth="1.5" />
          <circle cx="28" cy="64" r="5" fill="#FF8B94" />
          <circle cx="72" cy="64" r="5" fill="#FF8B94" />
        </g>
      )}
    </motion.g>
  );
};

// =========================================================================
// 5. FUNNY & MOOD PACK RENDERERS
// =========================================================================

const FunnyPackRenderer: React.FC<{ emoji: any; isPlaying: boolean; playCount: number }> = ({
  emoji,
  isPlaying,
  playCount,
}) => {
  const getMotion = (): TargetAndTransition => {
    if (!isPlaying) return { scale: 1, rotate: 0 };
    switch (emoji.id) {
      case 'funny_rofl':
      case 'funny_lol':
        return { rotate: [-15, 15, -15, 15, 0], scale: [1, 1.15, 0.95, 1.1, 1], transition: { duration: 1.3 } };
      case 'funny_dead':
        return { y: [0, -8, 2, -6, 0], transition: { duration: 1.5 } };
      case 'funny_mindblown':
        return { scale: [1, 1.25, 0.9, 1.1, 1], transition: { duration: 1.2 } };
      default:
        return { scale: [1, 1.1, 0.95, 1], transition: { duration: 1.2 } };
    }
  };

  return (
    <motion.g animate={getMotion()} key={playCount} style={{ transformOrigin: '50% 50%' }}>
      {emoji.id === 'funny_dead' ? (
        // Ghost / Dead X_X
        <g>
          <circle cx="50" cy="50" r="36" fill="#BDC3C7" />
          {/* X Eyes */}
          <g stroke="#2D3436" strokeWidth="4" strokeLinecap="round">
            <line x1="30" y1="40" x2="42" y2="52" />
            <line x1="42" y1="40" x2="30" y2="52" />
            <line x1="58" y1="40" x2="70" y2="52" />
            <line x1="70" y1="40" x2="58" y2="52" />
          </g>
          {/* Wavy Mouth & Tongue */}
          <path d="M 40 68 Q 50 62 60 68" stroke="#2D3436" strokeWidth="3" fill="none" strokeLinecap="round" />
          <ellipse cx="50" cy="74" rx="4" ry="6" fill="#FF7675" />
        </g>
      ) : emoji.id === 'funny_mindblown' ? (
        // Mind Blown Exploding Head
        <g>
          {/* Brain Explosion Cloud */}
          <path d="M 24 30 C 14 18, 40 8, 50 14 C 60 8, 86 18, 76 30 C 88 38, 78 50, 70 46 C 60 52, 40 52, 30 46 Z" fill="#FF7675" />
          <circle cx="50" cy="58" r="34" fill="#FFD166" />
          {/* Shocked Eyes & Mouth */}
          <circle cx="36" cy="54" r="5" fill="#2D3436" />
          <circle cx="64" cy="54" r="5" fill="#2D3436" />
          <ellipse cx="50" cy="70" rx="8" ry="10" fill="#2D3436" />
        </g>
      ) : (
        // Big Laugh ROFL Face
        <g>
          <circle cx="50" cy="50" r="36" fill="#FFD166" />
          <g stroke="#2D3436" strokeWidth="4" strokeLinecap="round" fill="none">
            <path d="M 28 44 Q 36 34 44 44" />
            <path d="M 56 44 Q 64 34 72 44" />
          </g>
          <path d="M 32 54 Q 50 84 68 54 Z" fill="#FF4757" stroke="#2D3436" strokeWidth="2" />
          <path d="M 40 68 Q 50 60 60 68 Q 50 84 40 68 Z" fill="#FFAAA6" />
        </g>
      )}
    </motion.g>
  );
};

const MoodPackRenderer: React.FC<{ emoji: any; isPlaying: boolean; playCount: number }> = ({
  emoji,
  isPlaying,
  playCount,
}) => {
  const getMotion = (): TargetAndTransition => {
    if (!isPlaying) return { scale: 1, rotate: 0 };
    switch (emoji.id) {
      case 'mood_angry':
        return { x: [-3, 3, -3, 3, 0], scale: [1, 1.08, 1], transition: { duration: 1 } };
      case 'mood_cool':
        return { y: [0, -6, 0], rotate: [0, -4, 4, 0], transition: { duration: 1.4 } };
      default:
        return { scale: [1, 1.1, 0.95, 1], transition: { duration: 1.2 } };
    }
  };

  return (
    <motion.g animate={getMotion()} key={playCount} style={{ transformOrigin: '50% 50%' }}>
      <circle
        cx="50"
        cy="50"
        r="36"
        fill={emoji.id === 'mood_angry' ? '#FF4757' : emoji.id === 'mood_cool' ? '#FFD166' : '#FFD166'}
      />
      {emoji.id === 'mood_cool' ? (
        // Sunglasses
        <g fill="#2D3436">
          <path d="M 22 42 C 22 38, 44 38, 44 42 L 43 52 C 43 56, 24 56, 23 52 Z" />
          <path d="M 56 42 C 56 38, 78 38, 78 42 L 77 52 C 77 56, 58 56, 57 52 Z" />
          <line x1="44" y1="44" x2="56" y2="44" stroke="#2D3436" strokeWidth="3" strokeLinecap="round" />
          {/* Smirk */}
          <path d="M 44 64 Q 54 70 60 62" stroke="#2D3436" strokeWidth="3" strokeLinecap="round" fill="none" />
        </g>
      ) : emoji.id === 'mood_angry' ? (
        // Fierce Mood
        <g>
          <line x1="26" y1="36" x2="42" y2="44" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" />
          <line x1="74" y1="36" x2="58" y2="44" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" />
          <circle cx="36" cy="48" r="4" fill="#FFFFFF" />
          <circle cx="64" cy="48" r="4" fill="#FFFFFF" />
          <path d="M 40 68 Q 50 58 60 68" stroke="#FFFFFF" strokeWidth="3.5" strokeLinecap="round" fill="none" />
        </g>
      ) : (
        // Happy / Mood Standard
        <g>
          <circle cx="36" cy="44" r="4.5" fill="#2D3436" />
          <circle cx="64" cy="44" r="4.5" fill="#2D3436" />
          <circle cx="28" cy="54" r="6" fill="#FF8B94" opacity="0.6" />
          <circle cx="72" cy="54" r="6" fill="#FF8B94" opacity="0.6" />
          <path d="M 40 58 Q 50 72 60 58" stroke="#2D3436" strokeWidth="3" strokeLinecap="round" fill="none" />
        </g>
      )}
    </motion.g>
  );
};

// =========================================================================
// 6. EMOTION PARTICLES & ATMOSPHERIC LAYERS
// =========================================================================

// Love Floating Hearts
const LoveParticles: React.FC<{ isPlaying: boolean; playCount: number }> = ({ isPlaying, playCount }) => {
  if (!isPlaying) return null;
  return (
    <g key={`love_${playCount}`} fill="url(#heartGrad)">
      <motion.path
        d="M 20 22 C 20 16, 12 16, 12 22 C 12 27, 20 32, 20 34 C 20 32, 28 27, 28 22 C 28 16, 20 16, 20 22 Z"
        initial={{ opacity: 0, y: 15, scale: 0.5 }}
        animate={{ opacity: [0, 1, 0.9, 0], y: [-5, -25], scale: [0.5, 1.2, 0.9] }}
        transition={{ duration: 1.6, ease: 'easeOut' }}
      />
      <motion.path
        d="M 80 18 C 80 11, 70 11, 70 18 C 70 24, 80 30, 80 33 C 80 30, 90 24, 90 18 C 90 11, 80 11, 80 18 Z"
        initial={{ opacity: 0, y: 15, scale: 0.6 }}
        animate={{ opacity: [0, 1, 0.9, 0], y: [-2, -28], scale: [0.6, 1.3, 1] }}
        transition={{ duration: 1.8, delay: 0.2, ease: 'easeOut' }}
      />
    </g>
  );
};

// Cry Tear Waterfall
const CryStreams: React.FC<{ isPlaying: boolean; playCount: number }> = ({ isPlaying, playCount }) => {
  if (!isPlaying) return null;
  return (
    <g key={`cry_${playCount}`} fill="url(#tearGrad)">
      <motion.path
        d="M 32 54 C 28 65, 26 80, 28 92 C 30 96, 36 96, 38 92 C 40 80, 38 65, 34 54 Z"
        initial={{ scaleY: 0, opacity: 0 }}
        animate={{ scaleY: [0, 1.2, 1], opacity: [0, 0.9, 0.8, 0] }}
        transition={{ duration: 1.8, ease: 'easeInOut' }}
        style={{ transformOrigin: '33px 54px' }}
      />
      <motion.path
        d="M 68 54 C 64 65, 62 80, 64 92 C 66 96, 72 96, 74 92 C 76 80, 74 65, 70 54 Z"
        initial={{ scaleY: 0, opacity: 0 }}
        animate={{ scaleY: [0, 1.2, 1], opacity: [0, 0.9, 0.8, 0] }}
        transition={{ duration: 1.8, delay: 0.1, ease: 'easeInOut' }}
        style={{ transformOrigin: '69px 54px' }}
      />
    </g>
  );
};

// Laugh Teardrops
const LaughTeardrops: React.FC<{ isPlaying: boolean; playCount: number }> = ({ isPlaying, playCount }) => {
  if (!isPlaying) return null;
  return (
    <g key={`laugh_${playCount}`} fill="url(#tearGrad)">
      <motion.path
        d="M 18 48 C 12 48, 10 56, 16 60 C 22 62, 24 54, 20 48 Z"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.3, 0.9], x: [0, -8, -12], y: [0, 4, 8], opacity: [0, 1, 0] }}
        transition={{ duration: 1.4, ease: 'easeOut' }}
      />
      <motion.path
        d="M 82 48 C 88 48, 90 56, 84 60 C 78 62, 76 54, 80 48 Z"
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.3, 0.9], x: [0, 8, 12], y: [0, 4, 8], opacity: [0, 1, 0] }}
        transition={{ duration: 1.4, ease: 'easeOut' }}
      />
    </g>
  );
};

// Angry Steam Puffs
const AngrySteamParticles: React.FC<{ isPlaying: boolean; playCount: number }> = ({ isPlaying, playCount }) => {
  if (!isPlaying) return null;
  return (
    <g key={`angry_${playCount}`}>
      <motion.g
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 1.3, 1, 1.2, 1], opacity: [0, 1, 0.9, 1, 0] }}
        transition={{ duration: 1.4 }}
        transform="translate(68, 20)"
      >
        <path d="M 0 4 Q 4 0 8 4 Q 4 8 0 4 Z" fill="#FF4757" />
        <path d="M 4 0 Q 8 4 4 8 Q 0 4 4 0 Z" fill="#FF4757" />
      </motion.g>
    </g>
  );
};

// Surprise Sparks
const SurpriseSparks: React.FC<{ isPlaying: boolean; playCount: number }> = ({ isPlaying, playCount }) => {
  if (!isPlaying) return null;
  return (
    <g key={`surprise_${playCount}`}>
      <motion.g
        initial={{ scale: 0, y: 10, opacity: 0 }}
        animate={{ scale: [0, 1.4, 1], y: [0, -14], opacity: [0, 1, 1, 0] }}
        transition={{ duration: 1.2, ease: 'backOut' }}
      >
        <ellipse cx="50" cy="10" rx="3.5" ry="7" fill="#FF4757" />
        <circle cx="50" cy="21" r="3" fill="#FF4757" />
      </motion.g>
    </g>
  );
};

// Party Confetti
const PartyConfettiParticles: React.FC<{ isPlaying: boolean; playCount: number }> = ({ isPlaying, playCount }) => {
  if (!isPlaying) return null;
  return (
    <g key={`confetti_${playCount}`}>
      <motion.circle cx="16" cy="24" r="3" fill="#E74C3C" animate={{ y: [-5, -20], x: [-5, -12], opacity: [0, 1, 0] }} transition={{ duration: 1.2 }} />
      <motion.rect x="80" y="20" width="5" height="5" fill="#3498DB" animate={{ y: [-5, -24], x: [5, 14], rotate: [0, 180], opacity: [0, 1, 0] }} transition={{ duration: 1.4 }} />
      <motion.circle cx="28" cy="14" r="3" fill="#F1C40F" animate={{ y: [-5, -18], opacity: [0, 1, 0] }} transition={{ duration: 1.1 }} />
      <motion.rect x="70" y="12" width="4" height="6" fill="#2ECC71" animate={{ y: [-5, -22], rotate: [0, 90], opacity: [0, 1, 0] }} transition={{ duration: 1.3 }} />
    </g>
  );
};

// Fire Embers
const FireEmbersParticles: React.FC<{ isPlaying: boolean; playCount: number }> = ({ isPlaying, playCount }) => {
  if (!isPlaying) return null;
  return (
    <g key={`fire_embers_${playCount}`}>
      <motion.circle cx="44" cy="25" r="2" fill="#FFA502" animate={{ y: [0, -25], opacity: [1, 0] }} transition={{ duration: 1 }} />
      <motion.circle cx="56" cy="20" r="2.5" fill="#FF4757" animate={{ y: [0, -30], opacity: [1, 0] }} transition={{ duration: 1.2, delay: 0.2 }} />
    </g>
  );
};

// Steam Particles (Coffee, Tea, Ramen)
const SteamParticles: React.FC<{ isPlaying: boolean; playCount: number }> = ({ isPlaying, playCount }) => {
  if (!isPlaying) return null;
  return (
    <g key={`steam_${playCount}`} stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.7">
      <motion.path d="M 40 32 Q 36 24 40 16" animate={{ y: [0, -10], opacity: [0, 0.8, 0] }} transition={{ duration: 1.4, repeat: 1 }} />
      <motion.path d="M 50 30 Q 54 22 50 14" animate={{ y: [0, -12], opacity: [0, 0.8, 0] }} transition={{ duration: 1.6, delay: 0.2, repeat: 1 }} />
      <motion.path d="M 60 32 Q 56 24 60 16" animate={{ y: [0, -10], opacity: [0, 0.8, 0] }} transition={{ duration: 1.4, delay: 0.4, repeat: 1 }} />
    </g>
  );
};

// Zzz Sleep Particles
const ZzzSleepParticles: React.FC<{ isPlaying: boolean; playCount: number }> = ({ isPlaying, playCount }) => {
  if (!isPlaying) return null;
  return (
    <g key={`zzz_${playCount}`} fill="#3498DB" fontWeight="bold" fontFamily="sans-serif">
      <motion.text x="68" y="32" fontSize="12" animate={{ x: [68, 76], y: [32, 18], opacity: [0, 1, 0] }} transition={{ duration: 1.5 }}>
        Z
      </motion.text>
      <motion.text x="76" y="22" fontSize="16" animate={{ x: [76, 88], y: [22, 6], opacity: [0, 1, 0] }} transition={{ duration: 1.8, delay: 0.3 }}>
        Z
      </motion.text>
    </g>
  );
};

export default AnimatedCustomEmoji;
