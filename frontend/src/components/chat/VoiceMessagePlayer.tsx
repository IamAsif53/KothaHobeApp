import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Play, Pause, AlertCircle, Loader2 } from 'lucide-react';
import { getMediaUrl } from '../../api/messageApi';

interface VoiceMessagePlayerProps {
  audioUrl: string;
  duration?: number;
  isMe: boolean;
}

// Global active audio coordinator (ensures only 1 audio plays at a time)
let currentlyPlayingAudio: HTMLAudioElement | null = null;
let stopCurrentAudioCallback: (() => void) | null = null;

export const VoiceMessagePlayer: React.FC<VoiceMessagePlayerProps> = ({
  audioUrl,
  duration = 0,
  isMe,
}) => {
  // Parse safe initial duration
  const safeInitialDuration = Number.isFinite(duration) && duration > 0 ? duration : 0;

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState<number>(safeInitialDuration);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const fullUrl = getMediaUrl(audioUrl);

  const formatTime = (secs: number) => {
    if (!Number.isFinite(secs) || isNaN(secs) || secs < 0) return '0:00';
    const totalSecs = Math.floor(secs);
    const m = Math.floor(totalSecs / 60);
    const s = totalSecs % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Sync duration if prop updates
  useEffect(() => {
    if (Number.isFinite(duration) && duration > 0) {
      setTotalDuration((prev) => (prev > 0 ? prev : duration));
    }
  }, [duration]);

  // Smooth animation frame ticker when playing for fluid circle movement
  const updateProgress = useCallback(() => {
    const audio = audioRef.current;
    if (audio && !audio.paused && !audio.ended) {
      setCurrentTime(audio.currentTime);
      if (Number.isFinite(audio.duration) && audio.duration > 0 && audio.duration < 86400) {
        setTotalDuration(audio.duration);
      }
      animationFrameRef.current = requestAnimationFrame(updateProgress);
    }
  }, []);

  const handleTogglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !fullUrl) {
      setHasError(true);
      return;
    }

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      setIsLoading(false);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (currentlyPlayingAudio === audio) {
        currentlyPlayingAudio = null;
        stopCurrentAudioCallback = null;
      }
    } else {
      setHasError(false);

      // If was completed at the end, restart from 0
      if (currentTime >= totalDuration && totalDuration > 0) {
        audio.currentTime = 0;
        setCurrentTime(0);
      }

      // Pause any previously playing audio
      if (currentlyPlayingAudio && currentlyPlayingAudio !== audio) {
        currentlyPlayingAudio.pause();
        if (stopCurrentAudioCallback) stopCurrentAudioCallback();
      }

      currentlyPlayingAudio = audio;
      stopCurrentAudioCallback = () => {
        setIsPlaying(false);
        setIsLoading(false);
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      };

      // Ensure audio source is loaded if readyState is 0
      if (audio.readyState === 0) {
        setIsLoading(true);
        audio.load();
      }

      console.log('[VoicePlayer] Playback attempt:', {
        url: fullUrl,
        readyState: audio.readyState,
        networkState: audio.networkState,
      });

      audio
        .play()
        .then(() => {
          setIsPlaying(true);
          setIsLoading(false);
          setHasError(false);
          animationFrameRef.current = requestAnimationFrame(updateProgress);
        })
        .catch((err) => {
          console.warn('[VoicePlayer] Playback error:', err?.message || err, {
            url: fullUrl,
            error: audio.error,
            readyState: audio.readyState,
          });
          setIsPlaying(false);
          setIsLoading(false);
          setHasError(true);
        });
    }
  };

  const handleSeekByClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const bar = progressBarRef.current;
    if (!audio || !bar || totalDuration <= 0) return;

    const rect = bar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clickX / rect.width));
    const newTime = ratio * totalDuration;

    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0 && audio.duration < 86400) {
        setTotalDuration(audio.duration);
      }
      setIsLoading(false);
    };

    const handleCanPlay = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0 && audio.duration < 86400) {
        setTotalDuration((prev) => (prev > 0 ? prev : audio.duration));
      }
      setIsLoading(false);
      setHasError(false);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (Number.isFinite(audio.duration) && audio.duration > 0 && audio.duration < 86400) {
        setTotalDuration((prev) => (prev > 0 ? prev : audio.duration));
      }
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setIsLoading(false);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      // Keep playhead at 100% (right end) until played again
      setCurrentTime(totalDuration || audio.currentTime);
      if (currentlyPlayingAudio === audio) {
        currentlyPlayingAudio = null;
        stopCurrentAudioCallback = null;
      }
    };

    const handleError = () => {
      console.warn('[VoicePlayer] Audio load error:', {
        url: fullUrl,
        error: audio.error,
      });
      setIsPlaying(false);
      setIsLoading(false);
      setHasError(true);
    };

    const handleWaiting = () => {
      setIsLoading(true);
    };

    const handlePlaying = () => {
      setIsLoading(false);
      setIsPlaying(true);
      setHasError(false);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);
    audio.addEventListener('waiting', handleWaiting);
    audio.addEventListener('playing', handlePlaying);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
      audio.removeEventListener('waiting', handleWaiting);
      audio.removeEventListener('playing', handlePlaying);
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (currentlyPlayingAudio === audio) {
        currentlyPlayingAudio = null;
        stopCurrentAudioCallback = null;
      }
    };
  }, [fullUrl, totalDuration, updateProgress]);

  // Calculate clean percentage (0% to 100%)
  const effectiveDuration = totalDuration > 0 ? totalDuration : 1;
  const progressPercent = Math.min(100, Math.max(0, (currentTime / effectiveDuration) * 100));

  if (!fullUrl || hasError) {
    return (
      <div className="flex items-center gap-2.5 py-1.5 px-3 rounded-xl bg-red-950/40 border border-red-500/20 text-red-300 text-xs select-none">
        <AlertCircle className="w-4 h-4 flex-shrink-0 text-red-400" />
        <div className="flex-1 truncate">
          <p className="font-semibold">Audio unavailable</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setHasError(false);
            if (audioRef.current) {
              audioRef.current.load();
              handleTogglePlay();
            }
          }}
          className="text-[11px] underline text-red-300 hover:text-white"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 py-1 min-w-[220px] max-w-[280px] select-none">
      <audio
        ref={audioRef}
        src={fullUrl}
        preload="metadata"
        playsInline
      />

      {/* Play / Pause Circular Button */}
      <button
        type="button"
        onClick={handleTogglePlay}
        disabled={isLoading}
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all flex-shrink-0 shadow-md active:scale-95 ${
          isMe
            ? 'bg-white text-emerald-800 hover:bg-white/90'
            : 'bg-brand-500 text-white hover:bg-brand-600'
        }`}
        title={isPlaying ? 'Pause' : 'Play Voice Message'}
      >
        {isLoading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : isPlaying ? (
          <Pause className="w-5 h-5 fill-current" />
        ) : (
          <Play className="w-5 h-5 fill-current ml-0.5" />
        )}
      </button>

      {/* Waveform Scrubber & Duration */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
        {/* Custom Interactive Scrubber Bar with Moving Circle Thumb */}
        <div
          ref={progressBarRef}
          onClick={handleSeekByClick}
          className="relative w-full h-5 flex items-center cursor-pointer group"
        >
          {/* Base Track */}
          <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
            {/* Played Fill */}
            <div
              style={{ width: `${progressPercent}%` }}
              className={`h-full rounded-full transition-all duration-75 ${
                isMe ? 'bg-white' : 'bg-brand-400'
              }`}
            />
          </div>

          {/* Moving Circular Thumb */}
          <div
            style={{ left: `${progressPercent}%` }}
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full shadow-md transition-transform group-hover:scale-125 ${
              isMe ? 'bg-white' : 'bg-brand-400'
            }`}
          />
        </div>

        {/* Timestamps: Elapsed & Safe Total Duration */}
        <div className="flex items-center justify-between text-[11px] text-white/80 font-mono font-medium -mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>{isLoading ? 'Loading...' : formatTime(totalDuration)}</span>
        </div>
      </div>
    </div>
  );
};
