/**
 * Sound Service for VoIP Calling (Web Audio API Synthesizer)
 * Zero external audio asset dependencies — generates pleasant tones programmatically.
 */

class SoundService {
  private audioCtx: AudioContext | null = null;
  private ringbackInterval: NodeJS.Timeout | null = null;
  private ringtoneInterval: NodeJS.Timeout | null = null;
  private isRingtonePlaying = false;
  private isRingbackPlaying = false;

  private getContext(): AudioContext {
    if (!this.audioCtx || this.audioCtx.state === 'closed') {
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioCtxClass();
    }
    if (this.audioCtx.state === 'suspended') {
      this.audioCtx.resume();
    }
    return this.audioCtx;
  }

  /**
   * Play Outgoing Ringback Tone ("Tuuut... Tuuut...")
   */
  public startRingbackTone(): void {
    if (this.isRingbackPlaying) return;
    this.isRingbackPlaying = true;
    this.stopRingtone();

    const playPulse = () => {
      try {
        const ctx = this.getContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, ctx.currentTime); // 440Hz standard tone

        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.08, ctx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.08, ctx.currentTime + 1.2);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 1.3);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 1.35);
      } catch (err) {
        console.warn('[SoundService] Ringback pulse error:', err);
      }
    };

    playPulse();
    this.ringbackInterval = setInterval(playPulse, 3500);
  }

  public stopRingbackTone(): void {
    this.isRingbackPlaying = false;
    if (this.ringbackInterval) {
      clearInterval(this.ringbackInterval);
      this.ringbackInterval = null;
    }
  }

  /**
   * Play Incoming Call Ringtone (Pleasant harmonic melodic chime)
   */
  public startRingtone(): void {
    if (this.isRingtonePlaying) return;
    this.isRingtonePlaying = true;
    this.stopRingbackTone();

    const playChimePattern = () => {
      try {
        const ctx = this.getContext();
        const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6 arpeggio

        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, ctx.currentTime + idx * 0.18);

          gain.gain.setValueAtTime(0, ctx.currentTime + idx * 0.18);
          gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + idx * 0.18 + 0.03);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + idx * 0.18 + 0.45);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(ctx.currentTime + idx * 0.18);
          osc.stop(ctx.currentTime + idx * 0.18 + 0.5);
        });
      } catch (err) {
        console.warn('[SoundService] Ringtone chime error:', err);
      }
    };

    playChimePattern();
    this.ringtoneInterval = setInterval(playChimePattern, 2200);
  }

  public stopRingtone(): void {
    this.isRingtonePlaying = false;
    if (this.ringtoneInterval) {
      clearInterval(this.ringtoneInterval);
      this.ringtoneInterval = null;
    }
  }

  /**
   * Play Call Ended Tone
   */
  public playCallEndTone(): void {
    this.stopRingbackTone();
    this.stopRingtone();

    try {
      const ctx = this.getContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, ctx.currentTime);
      osc.frequency.linearRampToValueAtTime(250, ctx.currentTime + 0.3);

      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.35);
    } catch (err) {
      console.warn('[SoundService] End tone error:', err);
    }
  }

  /**
   * Play Incoming Message Notification Tone (Pleasant dual harmonic chime)
   */
  public playMessageReceivedTone(): void {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;

      // Primary tone: C6 (1046.5Hz) -> E6 (1318.5Hz)
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(880, now); // A5
      osc1.frequency.exponentialRampToValueAtTime(1318.5, now + 0.12); // E6

      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(1760, now);
      osc2.frequency.exponentialRampToValueAtTime(2637, now + 0.12);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.38);
      osc2.stop(now + 0.38);
    } catch (err) {
      console.warn('[SoundService] Message received tone error:', err);
    }
  }

  /**
   * Play Outgoing Message Sent Tone (Subtle soft pop)
   */
  public playMessageSentTone(): void {
    try {
      const ctx = this.getContext();
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(900, now + 0.08);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.14);
    } catch (err) {
      console.warn('[SoundService] Message sent tone error:', err);
    }
  }

  /**
   * Trigger Haptic Vibration (Web Vibration API with fallback)
   */
  public triggerVibration(pattern: number | number[] = [80, 40, 80]): void {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator && navigator.vibrate) {
        navigator.vibrate(pattern);
      }
    } catch (err) {
      console.warn('[SoundService] Vibration error:', err);
    }
  }

  /**
   * Update PWA / Web App Icon Badge
   */
  public updateAppBadge(count: number): void {
    try {
      if (typeof navigator !== 'undefined' && 'setAppBadge' in navigator) {
        if (count > 0) {
          (navigator as any).setAppBadge(count).catch(() => {});
        } else {
          (navigator as any).clearAppBadge().catch(() => {});
        }
      }
    } catch (err) {
      console.warn('[SoundService] App badge update error:', err);
    }
  }

  public stopAll(): void {
    this.stopRingbackTone();
    this.stopRingtone();
  }
}

export const soundService = new SoundService();

