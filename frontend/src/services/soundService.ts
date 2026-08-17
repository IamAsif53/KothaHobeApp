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

  public stopAll(): void {
    this.stopRingbackTone();
    this.stopRingtone();
  }
}

export const soundService = new SoundService();
