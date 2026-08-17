import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause } from 'lucide-react';
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fullUrl = getMediaUrl(audioUrl);

  const formatTime = (secs: number) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleTogglePlay = () => {
    if (!audioRef.current) return;

    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
      if (currentlyPlayingAudio === audioRef.current) {
        currentlyPlayingAudio = null;
        stopCurrentAudioCallback = null;
      }
    } else {
      // Pause any previously playing audio
      if (currentlyPlayingAudio && currentlyPlayingAudio !== audioRef.current) {
        currentlyPlayingAudio.pause();
        if (stopCurrentAudioCallback) stopCurrentAudioCallback();
      }

      currentlyPlayingAudio = audioRef.current;
      stopCurrentAudioCallback = () => setIsPlaying(false);

      audioRef.current.play().catch((err) => {
        console.warn('[VoicePlayer] Autoplay error:', err);
      });
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setCurrentTime(val);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setTotalDuration(audio.duration);
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      currentlyPlayingAudio = null;
      stopCurrentAudioCallback = null;
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      if (currentlyPlayingAudio === audio) {
        currentlyPlayingAudio = null;
        stopCurrentAudioCallback = null;
      }
    };
  }, []);

  const progressPercent = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0;

  return (
    <div className="flex items-center gap-3 py-1 min-w-[210px] max-w-[270px]">
      <audio ref={audioRef} src={fullUrl} preload="metadata" />

      {/* Play / Pause Circular Button */}
      <button
        onClick={handleTogglePlay}
        className={`w-10 h-10 rounded-full flex items-center justify-center transition-all flex-shrink-0 shadow-md ${
          isMe
            ? 'bg-white text-emerald-800 hover:bg-white/90'
            : 'bg-brand-500 text-white hover:bg-brand-600'
        }`}
      >
        {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current ml-0.5" />}
      </button>

      {/* Waveform Scrubber & Duration */}
      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1.5">
        {/* Scrubber Bar */}
        <div className="relative w-full flex items-center">
          <input
            type="range"
            min="0"
            max={totalDuration || 1}
            step="0.1"
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer accent-white"
          />
          <div
            style={{ width: `${progressPercent}%` }}
            className={`absolute top-0 left-0 h-1.5 rounded-lg pointer-events-none ${
              isMe ? 'bg-white' : 'bg-brand-400'
            }`}
          />
        </div>

        {/* Timestamps */}
        <div className="flex items-center justify-between text-[11px] text-white/70 font-mono">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(totalDuration)}</span>
        </div>
      </div>
    </div>
  );
};
