import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BurstType } from '../../types/customEmoji';

interface EmojiBurstEffectProps {
  type?: BurstType;
  duration?: number;
  onComplete?: () => void;
  className?: string;
}

// Global active burst limiter (max 3 simultaneous active bursts on screen)
let activeBurstCount = 0;
const MAX_CONCURRENT_BURSTS = 3;

export const EmojiBurstEffect: React.FC<EmojiBurstEffectProps> = ({
  type = 'sparkle',
  duration = 750,
  onComplete,
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    // Check user's accessibility preference
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      setPrefersReducedMotion(mediaQuery.matches);
    }

    // Limit active simultaneous bursts
    if (activeBurstCount >= MAX_CONCURRENT_BURSTS) {
      if (onComplete) onComplete();
      return;
    }

    activeBurstCount += 1;
    setIsVisible(true);

    const timer = setTimeout(() => {
      setIsVisible(false);
      activeBurstCount = Math.max(0, activeBurstCount - 1);
      if (onComplete) onComplete();
    }, duration);

    return () => {
      clearTimeout(timer);
      activeBurstCount = Math.max(0, activeBurstCount - 1);
    };
  }, [duration, onComplete]);

  if (!isVisible) return null;

  // Reduced motion: subtle scale/fade glow instead of flying particles
  if (prefersReducedMotion) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: [0, 0.8, 0], scale: [0.8, 1.2, 1.4] }}
        transition={{ duration: duration / 1000, ease: 'easeOut' }}
        className={`absolute inset-0 pointer-events-none rounded-full bg-brand-500/20 blur-md ${className}`}
      />
    );
  }

  return (
    <div
      className={`absolute inset-0 pointer-events-none flex items-center justify-center overflow-visible z-20 ${className}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 200 200" className="w-[190px] h-[190px] overflow-visible">
        <defs>
          <linearGradient id="burstHeartGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF758C" />
            <stop offset="100%" stopColor="#FF4757" />
          </linearGradient>
          <linearGradient id="burstGoldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFEAA7" />
            <stop offset="100%" stopColor="#F39C12" />
          </linearGradient>
          <linearGradient id="burstFireGrad" x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="#FF4757" />
            <stop offset="60%" stopColor="#FFA502" />
            <stop offset="100%" stopColor="#FFFA65" />
          </linearGradient>
          <linearGradient id="burstTearGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#70A1FF" />
            <stop offset="100%" stopColor="#1E90FF" />
          </linearGradient>
        </defs>

        {/* 1. HEART BURST */}
        {type === 'heart' && (
          <g>
            {/* 8 Radiating Floating Hearts */}
            {[
              { angle: 0, r: 55, delay: 0 },
              { angle: 45, r: 65, delay: 0.05 },
              { angle: 90, r: 60, delay: 0.1 },
              { angle: 135, r: 65, delay: 0.05 },
              { angle: 180, r: 55, delay: 0 },
              { angle: 225, r: 65, delay: 0.08 },
              { angle: 270, r: 60, delay: 0.12 },
              { angle: 315, r: 65, delay: 0.08 },
            ].map((pt, i) => {
              const rad = (pt.angle * Math.PI) / 180;
              const tx = Math.cos(rad) * pt.r;
              const ty = Math.sin(rad) * pt.r;
              return (
                <motion.g
                  key={`heart_pt_${i}`}
                  initial={{ x: 100, y: 100, scale: 0, opacity: 0 }}
                  animate={{
                    x: [100, 100 + tx * 0.7, 100 + tx],
                    y: [100, 100 + ty * 0.7, 100 + ty],
                    scale: [0, 1.4, 0.8],
                    opacity: [0, 1, 0],
                  }}
                  transition={{ duration: 0.75, delay: pt.delay, ease: 'easeOut' }}
                >
                  <path
                    d="M 0 -8 C 0 -14, -8 -14, -8 -8 C -8 -3, 0 3, 0 6 C 0 3, 8 -3, 8 -8 C 8 -14, 0 -14, 0 -8 Z"
                    fill="url(#burstHeartGrad)"
                  />
                </motion.g>
              );
            })}
            {/* Central Glow Shockwave */}
            <motion.circle
              cx="100"
              cy="100"
              r="20"
              fill="none"
              stroke="#FF758C"
              strokeWidth="4"
              initial={{ r: 10, opacity: 0.9, strokeWidth: 5 }}
              animate={{ r: 60, opacity: 0, strokeWidth: 1 }}
              transition={{ duration: 0.6, ease: 'easeOut' }}
            />
          </g>
        )}

        {/* 2. LAUGH BURST */}
        {type === 'laugh' && (
          <g>
            {[
              { x: -45, y: -45, delay: 0 },
              { x: 45, y: -45, delay: 0.06 },
              { x: -55, y: 15, delay: 0.1 },
              { x: 55, y: 15, delay: 0.08 },
              { x: 0, y: -60, delay: 0.04 },
            ].map((pt, i) => (
              <motion.g
                key={`laugh_pt_${i}`}
                initial={{ x: 100, y: 100, scale: 0, opacity: 0 }}
                animate={{
                  x: [100, 100 + pt.x],
                  y: [100, 100 + pt.y],
                  scale: [0, 1.3, 0.9],
                  opacity: [0, 1, 0],
                }}
                transition={{ duration: 0.65, delay: pt.delay, ease: 'easeOut' }}
              >
                {/* Tear Sparkle */}
                <path
                  d="M 0 -7 C -5 -7, -7 0, 0 7 C 7 0, 5 -7, 0 -7 Z"
                  fill="url(#burstTearGrad)"
                />
              </motion.g>
            ))}
            {/* Sparkle Stars */}
            <motion.polygon
              points="100,60 103,70 113,70 105,76 108,86 100,80 92,86 95,76 87,70 97,70"
              fill="url(#burstGoldGrad)"
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: [0, 1.2, 0], opacity: [0, 1, 0] }}
              transition={{ duration: 0.6 }}
              style={{ transformOrigin: '100px 73px' }}
            />
          </g>
        )}

        {/* 3. PARTY / CELEBRATION BURST */}
        {type === 'party' && (
          <g>
            {[
              { x: -45, y: -55, color: '#E74C3C', rot: 45 },
              { x: 45, y: -55, color: '#3498DB', rot: -45 },
              { x: -60, y: -10, color: '#F1C40F', rot: 90 },
              { x: 60, y: -10, color: '#2ECC71', rot: -90 },
              { x: -35, y: 40, color: '#9B59B6', rot: 30 },
              { x: 35, y: 40, color: '#E67E22', rot: -30 },
              { x: 0, y: -70, color: '#FF758C', rot: 180 },
              { x: 0, y: 65, color: '#1ABC9C', rot: 0 },
            ].map((c, i) => (
              <motion.rect
                key={`confetti_${i}`}
                x={100}
                y={100}
                width="8"
                height="12"
                rx="2"
                fill={c.color}
                initial={{ x: 100, y: 100, scale: 0, rotate: 0, opacity: 0 }}
                animate={{
                  x: [100, 100 + c.x],
                  y: [100, 100 + c.y],
                  rotate: [0, c.rot * 3],
                  scale: [0, 1.2, 0.7],
                  opacity: [0, 1, 0],
                }}
                transition={{ duration: 0.8, ease: 'easeOut', delay: i * 0.03 }}
              />
            ))}
          </g>
        )}

        {/* 4. FIRE BURST */}
        {type === 'fire' && (
          <g>
            {[
              { x: -25, y: -65, s: 7 },
              { x: 0, y: -75, s: 10 },
              { x: 25, y: -65, s: 8 },
              { x: -45, y: -35, s: 6 },
              { x: 45, y: -35, s: 6 },
            ].map((f, i) => (
              <motion.circle
                key={`fire_ember_${i}`}
                cx={100}
                cy={100}
                r={f.s}
                fill="url(#burstFireGrad)"
                initial={{ cx: 100, cy: 100, scale: 0, opacity: 0 }}
                animate={{
                  cx: [100, 100 + f.x],
                  cy: [100, 100 + f.y],
                  scale: [0, 1.3, 0.4],
                  opacity: [0, 1, 0],
                }}
                transition={{ duration: 0.7, ease: 'easeOut', delay: i * 0.04 }}
              />
            ))}
          </g>
        )}

        {/* 5. SURPRISE BURST */}
        {type === 'surprise' && (
          <g>
            {/* Radiating Lightning/Spark Lines */}
            {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
              const rad = (angle * Math.PI) / 180;
              const x1 = 100 + Math.cos(rad) * 35;
              const y1 = 100 + Math.sin(rad) * 35;
              const x2 = 100 + Math.cos(rad) * 65;
              const y2 = 100 + Math.sin(rad) * 65;
              return (
                <motion.line
                  key={`spark_line_${i}`}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke="#FFD166"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  initial={{ pathLength: 0, opacity: 0 }}
                  animate={{ pathLength: [0, 1, 0], opacity: [0, 1, 0] }}
                  transition={{ duration: 0.65, delay: 0.05 }}
                />
              );
            })}
          </g>
        )}

        {/* 6. CRY BURST */}
        {type === 'cry' && (
          <g>
            {[-45, -25, 25, 45].map((xOffset, i) => (
              <motion.circle
                key={`cry_drop_${i}`}
                cx={100}
                cy={100}
                r="5"
                fill="url(#burstTearGrad)"
                initial={{ cx: 100, cy: 100, scale: 0, opacity: 0 }}
                animate={{
                  cx: [100, 100 + xOffset],
                  cy: [100, 100 + 40 + (i % 2) * 15],
                  scale: [0, 1.2, 0.6],
                  opacity: [0, 0.9, 0],
                }}
                transition={{ duration: 0.7, ease: 'easeOut', delay: i * 0.05 }}
              />
            ))}
          </g>
        )}

        {/* 7. DEFAULT SPARKLE BURST */}
        {type === 'sparkle' && (
          <g>
            {[
              { x: -40, y: -40 },
              { x: 40, y: -40 },
              { x: -40, y: 40 },
              { x: 40, y: 40 },
            ].map((p, i) => (
              <motion.circle
                key={`sparkle_${i}`}
                cx={100 + p.x}
                cy={100 + p.y}
                r="4"
                fill="url(#burstGoldGrad)"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: [0, 1.4, 0], opacity: [0, 1, 0] }}
                transition={{ duration: 0.6, delay: i * 0.08 }}
              />
            ))}
          </g>
        )}
      </svg>
    </div>
  );
};

export default EmojiBurstEffect;
