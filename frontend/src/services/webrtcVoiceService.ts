/**
 * Dedicated WebRTC Voice Media Engine for Kotha Hobe
 * 
 * Completely decoupled from React render lifecycles.
 * Handles microphone capture, SDP negotiation, ICE candidate queueing,
 * remote audio playback, and live RTP audio statistics & diagnostics.
 */

import { getWebRTCConfig } from '../config/webrtcConfig';

export interface CandidatePairInfo {
  localCandidateType: string;
  remoteCandidateType: string;
  protocol: string;
  rtt?: number;
}

export interface AudioStats {
  packetsSent: number;
  bytesSent: number;
  packetsReceived: number;
  bytesReceived: number;
  packetsLost: number;
  jitter: number;
  audioInputLevel?: number;
  audioOutputLevel?: number;
  selectedCandidatePair?: CandidatePairInfo;
  iceState?: string;
  connectionState?: string;
  localTrackStatus?: {
    id: string;
    label: string;
    kind: string;
    enabled: boolean;
    muted: boolean;
    readyState: string;
  };
  remoteTrackStatus?: {
    id: string;
    kind: string;
    enabled: boolean;
    muted: boolean;
    readyState: string;
  };
  remoteAudioElementStatus?: {
    srcObjectPresent: boolean;
    paused: boolean;
    muted: boolean;
    volume: number;
    playbackState: string;
  };
}

class WebRTCVoiceService {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private remoteAudioElement: HTMLAudioElement | null = null;
  private pendingIceCandidates: RTCIceCandidateInit[] = [];
  private currentCallId: string | null = null;

  // Diagnostic callbacks
  private onIceCandidateCallback: ((candidate: RTCIceCandidateInit) => void) | null = null;
  private onRemoteTrackCallback: ((track: MediaStreamTrack, stream: MediaStream) => void) | null = null;
  private onConnectionStateChangeCallback: ((state: RTCPeerConnectionState, iceState: RTCIceConnectionState) => void) | null = null;

  /**
   * 1. Capture Local Microphone Stream with strict validation & diagnostic logging
   */
  public async startLocalMicrophone(): Promise<MediaStream> {
    console.log('[WebRTC DIAGNOSTIC] 🎙️ Requesting microphone stream via getUserMedia...');
    try {
      if (this.localStream) {
        this.localStream.getTracks().forEach((t) => t.stop());
        this.localStream = null;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
          video: false,
        });
        console.log('[WebRTC DIAGNOSTIC] ✅ getUserMedia succeeded with advanced audio constraints');
      } catch (advancedErr: any) {
        console.warn('[WebRTC DIAGNOSTIC] ⚠️ Advanced audio constraints rejected, falling back to basic audio: true', advancedErr?.message);
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        console.log('[WebRTC DIAGNOSTIC] ✅ getUserMedia succeeded with basic constraints');
      }

      const audioTracks = stream.getAudioTracks();
      console.log(`[WebRTC DIAGNOSTIC] 🎤 Local microphone acquired! Count: ${audioTracks.length}`);

      if (audioTracks.length === 0) {
        console.error('[WebRTC DIAGNOSTIC] ❌ No audio tracks returned from microphone');
        throw new Error('No audio tracks returned from microphone');
      }

      audioTracks.forEach((track, idx) => {
        console.log(`[WebRTC DIAGNOSTIC] Local Audio Track #${idx}:`, {
          id: track.id,
          label: track.label,
          kind: track.kind,
          enabled: track.enabled,
          muted: track.muted,
          readyState: track.readyState,
        });
      });

      const primaryTrack = audioTracks[0];
      if (primaryTrack.readyState !== 'live') {
        console.error(`[WebRTC DIAGNOSTIC] ❌ Microphone track readyState is "${primaryTrack.readyState}", expected "live"`);
        throw new Error(`Microphone track readyState is "${primaryTrack.readyState}", expected "live"`);
      }

      primaryTrack.enabled = true;
      this.localStream = stream;
      return stream;
    } catch (err: any) {
      console.error('[WebRTC DIAGNOSTIC] ❌ Fatal getUserMedia error:', err.name, err.message);
      throw err;
    }
  }

  /**
   * 2. Initialize RTCPeerConnection and attach local microphone track
   */
  public createPeerConnection(
    callId: string,
    onIceCandidate: (candidate: RTCIceCandidateInit) => void,
    onRemoteTrack: (track: MediaStreamTrack, stream: MediaStream) => void,
    onConnectionStateChange: (state: RTCPeerConnectionState, iceState: RTCIceConnectionState) => void
  ): RTCPeerConnection {
    this.cleanupPeerConnection();

    this.currentCallId = callId;
    this.onIceCandidateCallback = onIceCandidate;
    this.onRemoteTrackCallback = onRemoteTrack;
    this.onConnectionStateChangeCallback = onConnectionStateChange;

    const config = getWebRTCConfig();
    console.log('[WebRTC DIAGNOSTIC] 🚀 Initializing RTCPeerConnection with ICE config:', config);
    const pc = new RTCPeerConnection(config);
    this.pc = pc;

    // A. ICE Candidate Generation
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[WebRTC DIAGNOSTIC] 🧊 Local ICE Candidate generated:', {
          type: event.candidate.type,
          protocol: event.candidate.protocol,
          address: event.candidate.address,
          port: event.candidate.port,
          candidate: event.candidate.candidate,
        });
        if (this.onIceCandidateCallback) {
          this.onIceCandidateCallback(event.candidate.toJSON());
        }
      } else {
        console.log('[WebRTC DIAGNOSTIC] 🧊 Local ICE gathering completed.');
      }
    };

    // B. ICE Candidate Error Logging
    pc.onicecandidateerror = (event: any) => {
      console.warn('[WebRTC DIAGNOSTIC] ⚠️ onicecandidateerror:', {
        errorCode: event.errorCode,
        errorText: event.errorText,
        url: event.url,
        address: event.address,
        port: event.port,
      });
    };

    // C. Connection State Monitoring
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC DIAGNOSTIC] 🔌 Connection State changed: ${pc.connectionState} (ICE State: ${pc.iceConnectionState})`);
      if (this.onConnectionStateChangeCallback) {
        this.onConnectionStateChangeCallback(pc.connectionState, pc.iceConnectionState);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[WebRTC DIAGNOSTIC] 🧊 ICE Connection State changed: ${pc.iceConnectionState} (PC State: ${pc.connectionState})`);
      if (this.onConnectionStateChangeCallback) {
        this.onConnectionStateChangeCallback(pc.connectionState, pc.iceConnectionState);
      }
    };

    // D. Remote Audio Track Received (ontrack)
    pc.ontrack = (event) => {
      console.log('[WebRTC DIAGNOSTIC] 📡 ontrack fired:', {
        kind: event.track.kind,
        id: event.track.id,
        readyState: event.track.readyState,
        enabled: event.track.enabled,
        muted: event.track.muted,
        streamsCount: event.streams ? event.streams.length : 0,
      });

      if (event.track.kind === 'audio') {
        const stream =
          event.streams && event.streams.length > 0 && event.streams[0]
            ? event.streams[0]
            : new MediaStream([event.track]);

        this.remoteStream = stream;
        this.attachRemoteAudio(event.track, stream);

        if (this.onRemoteTrackCallback) {
          this.onRemoteTrackCallback(event.track, stream);
        }
      }
    };

    // E. Attach Local Audio Track
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        console.log('[WebRTC DIAGNOSTIC] ➕ Adding local track to PeerConnection:', {
          id: track.id,
          label: track.label,
          enabled: track.enabled,
          readyState: track.readyState,
        });
        pc.addTrack(track, this.localStream!);
      });
    } else {
      console.warn('[WebRTC DIAGNOSTIC] ⚠️ Warning: createPeerConnection called without localStream ready!');
    }

    // Verify Senders
    const senders = pc.getSenders();
    console.log(`[WebRTC DIAGNOSTIC] 📤 Local Senders count: ${senders.length}`);
    senders.forEach((s, idx) => {
      console.log(`[WebRTC DIAGNOSTIC] RTCRtpSender #${idx}:`, {
        trackId: s.track?.id,
        trackKind: s.track?.kind,
        trackEnabled: s.track?.enabled,
        trackReadyState: s.track?.readyState,
      });
    });

    return pc;
  }

  /**
   * 3. Create SDP Offer (Caller side)
   */
  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('PeerConnection not initialized');

    console.log('[WebRTC DIAGNOSTIC] 📝 Creating SDP Offer...');
    const senders = this.pc.getSenders();
    if (senders.length === 0 && this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        this.pc!.addTrack(track, this.localStream!);
      });
    }

    const offer = await this.pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false,
    });

    console.log('[WebRTC DIAGNOSTIC] SDP Offer created. Checking m=audio section...');
    if (!offer.sdp || !offer.sdp.includes('m=audio')) {
      console.error('[WebRTC DIAGNOSTIC] ❌ FATAL: SDP Offer does not contain m=audio!', offer.sdp);
      throw new Error('Generated SDP offer lacks audio media descriptor');
    }
    console.log('[WebRTC DIAGNOSTIC] ✅ SDP Offer contains valid m=audio section');

    await this.pc.setLocalDescription(offer);
    console.log('[WebRTC DIAGNOSTIC] Local description set for Offer');
    return offer;
  }

  /**
   * 4. Handle Received SDP Offer (Receiver side)
   */
  public async handleOffer(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) throw new Error('PeerConnection not initialized');

    console.log('[WebRTC DIAGNOSTIC] 📥 Setting remote description from Offer...');
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    console.log('[WebRTC DIAGNOSTIC] ✅ Remote Offer description set successfully.');

    await this.drainPendingIceCandidates();
  }

  /**
   * 5. Create SDP Answer (Receiver side)
   */
  public async createAnswer(): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('PeerConnection not initialized');

    const senders = this.pc.getSenders();
    const hasAudioSender = senders.some((s) => s.track && s.track.kind === 'audio');

    if (!hasAudioSender && this.localStream) {
      console.log('[WebRTC DIAGNOSTIC] ➕ Attaching local stream track to Receiver PC before createAnswer');
      this.localStream.getAudioTracks().forEach((track) => {
        this.pc!.addTrack(track, this.localStream!);
      });
    }

    console.log('[WebRTC DIAGNOSTIC] 📝 Creating SDP Answer...');
    const answer = await this.pc.createAnswer();

    console.log('[WebRTC DIAGNOSTIC] SDP Answer created. Checking m=audio section...');
    if (!answer.sdp || !answer.sdp.includes('m=audio')) {
      console.error('[WebRTC DIAGNOSTIC] ❌ FATAL: SDP Answer does not contain m=audio!', answer.sdp);
      throw new Error('Generated SDP answer lacks audio media descriptor');
    }
    console.log('[WebRTC DIAGNOSTIC] ✅ SDP Answer contains valid m=audio section');

    await this.pc.setLocalDescription(answer);
    console.log('[WebRTC DIAGNOSTIC] Local description set for Answer');
    return answer;
  }

  /**
   * 6. Handle Received SDP Answer (Caller side)
   */
  public async handleAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) throw new Error('PeerConnection not initialized');

    console.log('[WebRTC DIAGNOSTIC] 📥 Setting remote description from Answer...');
    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    console.log('[WebRTC DIAGNOSTIC] ✅ Remote Answer description set successfully.');

    await this.drainPendingIceCandidates();
  }

  /**
   * 7. Add Remote ICE Candidate with buffering
   */
  public async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc || !this.pc.remoteDescription || !this.pc.remoteDescription.type) {
      console.log('[WebRTC DIAGNOSTIC] ⏳ Buffering ICE candidate (remoteDescription not set yet)');
      this.pendingIceCandidates.push(candidate);
      return;
    }

    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log('[WebRTC DIAGNOSTIC] 📥 ICE candidate added to PeerConnection');
    } catch (err) {
      console.warn('[WebRTC DIAGNOSTIC] ⚠️ Error adding ICE candidate:', err);
    }
  }

  private async drainPendingIceCandidates(): Promise<void> {
    if (!this.pc) return;
    console.log(`[WebRTC DIAGNOSTIC] ⏳ Draining ${this.pendingIceCandidates.length} queued ICE candidate(s)...`);
    while (this.pendingIceCandidates.length > 0) {
      const candidate = this.pendingIceCandidates.shift();
      if (candidate) {
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn('[WebRTC DIAGNOSTIC] ⚠️ Error adding buffered ICE candidate:', e);
        }
      }
    }
  }

  /**
   * 8. Attach Remote Stream to Dedicated Audio Element
   */
  public attachRemoteAudio(track: MediaStreamTrack, stream: MediaStream): void {
    try {
      let audio =
        this.remoteAudioElement ||
        (document.getElementById('kothahobe-remote-audio') as HTMLAudioElement);

      if (!audio) {
        console.log('[WebRTC DIAGNOSTIC] 🔊 Creating permanent #kothahobe-remote-audio element in DOM');
        audio = document.createElement('audio');
        audio.id = 'kothahobe-remote-audio';
        audio.autoplay = true;
        audio.setAttribute('playsinline', 'true');
        (audio as any).playsInline = true;
        audio.style.position = 'fixed';
        audio.style.top = '-9999px';
        audio.style.left = '-9999px';
        audio.style.width = '1px';
        audio.style.height = '1px';
        audio.style.opacity = '0';
        document.body.appendChild(audio);
        this.remoteAudioElement = audio;
      }

      audio.srcObject = stream;
      audio.muted = false;
      audio.volume = 1.0;

      console.log('[WebRTC DIAGNOSTIC] 🔊 Remote audio element attached:', {
        srcObjectNotNull: audio.srcObject !== null,
        tracksCount: stream.getAudioTracks().length,
        volume: audio.volume,
        muted: audio.muted,
        paused: audio.paused,
      });

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            console.log('[WebRTC DIAGNOSTIC] 🎉 audio.play() SUCCESS! Remote audio playback is LIVE.');
          })
          .catch((playErr) => {
            console.error('[WebRTC DIAGNOSTIC] ❌ audio.play() promise rejected:', playErr);
          });
      }
    } catch (err) {
      console.error('[WebRTC DIAGNOSTIC] ❌ Error in attachRemoteAudio:', err);
    }
  }

  /**
   * 9. Query Real-Time WebRTC Audio Stats & Selected Candidate Pair
   */
  public async getAudioStats(): Promise<AudioStats> {
    const stats: AudioStats = {
      packetsSent: 0,
      bytesSent: 0,
      packetsReceived: 0,
      bytesReceived: 0,
      packetsLost: 0,
      jitter: 0,
      iceState: this.pc?.iceConnectionState || 'idle',
      connectionState: this.pc?.connectionState || 'idle',
    };

    // Track local track status
    if (this.localStream) {
      const localTrack = this.localStream.getAudioTracks()[0];
      if (localTrack) {
        stats.localTrackStatus = {
          id: localTrack.id,
          label: localTrack.label,
          kind: localTrack.kind,
          enabled: localTrack.enabled,
          muted: localTrack.muted,
          readyState: localTrack.readyState,
        };
      }
    }

    // Track remote track status
    if (this.remoteStream) {
      const remoteTrack = this.remoteStream.getAudioTracks()[0];
      if (remoteTrack) {
        stats.remoteTrackStatus = {
          id: remoteTrack.id,
          kind: remoteTrack.kind,
          enabled: remoteTrack.enabled,
          muted: remoteTrack.muted,
          readyState: remoteTrack.readyState,
        };
      }
    }

    // Track remote audio element status
    const audio =
      this.remoteAudioElement ||
      (document.getElementById('kothahobe-remote-audio') as HTMLAudioElement | null);

    if (audio) {
      stats.remoteAudioElementStatus = {
        srcObjectPresent: audio.srcObject !== null,
        paused: audio.paused,
        muted: audio.muted,
        volume: audio.volume,
        playbackState: audio.paused ? 'PAUSED' : 'PLAYING',
      };
    } else {
      stats.remoteAudioElementStatus = {
        srcObjectPresent: false,
        paused: true,
        muted: false,
        volume: 1.0,
        playbackState: 'NOT_MOUNTED',
      };
    }

    if (!this.pc) return stats;

    try {
      const report = await this.pc.getStats();
      let activeCandidatePairId: string | null = null;
      const candidates = new Map<string, any>();
      const candidatePairs: any[] = [];

      report.forEach((stat) => {
        if (stat.type === 'outbound-rtp' && (stat.kind === 'audio' || stat.mediaType === 'audio')) {
          stats.packetsSent = stat.packetsSent || 0;
          stats.bytesSent = stat.bytesSent || 0;
        }
        if (stat.type === 'inbound-rtp' && (stat.kind === 'audio' || stat.mediaType === 'audio')) {
          stats.packetsReceived = stat.packetsReceived || 0;
          stats.bytesReceived = stat.bytesReceived || 0;
          stats.packetsLost = stat.packetsLost || 0;
          stats.jitter = stat.jitter || 0;
        }
        if (stat.type === 'media-source' && stat.kind === 'audio') {
          stats.audioInputLevel = stat.audioLevel;
        }

        // Candidate pair analysis
        if (stat.type === 'transport' && stat.selectedCandidatePairId) {
          activeCandidatePairId = stat.selectedCandidatePairId;
        }
        if (stat.type === 'candidate-pair') {
          candidatePairs.push(stat);
          if (stat.state === 'succeeded' || stat.nominated || stat.selected) {
            activeCandidatePairId = stat.id;
          }
        }
        if (stat.type === 'local-candidate' || stat.type === 'remote-candidate') {
          candidates.set(stat.id, stat);
        }
      });

      if (activeCandidatePairId) {
        const activePair = candidatePairs.find((p) => p.id === activeCandidatePairId);
        if (activePair) {
          const local = candidates.get(activePair.localCandidateId);
          const remote = candidates.get(activePair.remoteCandidateId);
          stats.selectedCandidatePair = {
            localCandidateType: local?.candidateType || 'unknown',
            remoteCandidateType: remote?.candidateType || 'unknown',
            protocol: activePair.protocol || local?.protocol || 'udp',
            rtt: activePair.currentRoundTripTime ? Math.round(activePair.currentRoundTripTime * 1000) : undefined,
          };
        }
      }
    } catch (e) {
      console.warn('[WebRTC DIAGNOSTIC] Error reading stats:', e);
    }

    return stats;
  }

  /**
   * 10. Mute / Unmute Local Microphone
   */
  public setMuted(muted: boolean): boolean {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !muted;
        console.log(`[WebRTC DIAGNOSTIC] Local microphone track.enabled set to: ${!muted}`);
        return muted;
      }
    }
    return false;
  }

  /**
   * Diagnostic verification helpers
   */
  public testLocalMicrophone(): { ok: boolean; trackInfo?: any; error?: string } {
    if (!this.localStream) {
      return { ok: false, error: 'No local stream exists' };
    }
    const tracks = this.localStream.getAudioTracks();
    if (tracks.length === 0) {
      return { ok: false, error: 'No audio tracks found' };
    }
    const t = tracks[0];
    return {
      ok: t.enabled && t.readyState === 'live',
      trackInfo: {
        id: t.id,
        label: t.label,
        enabled: t.enabled,
        muted: t.muted,
        readyState: t.readyState,
      },
    };
  }

  public testRemotePlayback(): { ok: boolean; details?: any; error?: string } {
    const audio =
      this.remoteAudioElement ||
      (document.getElementById('kothahobe-remote-audio') as HTMLAudioElement);

    if (!audio) {
      return { ok: false, error: 'No audio element found in DOM' };
    }
    if (!audio.srcObject) {
      return { ok: false, error: 'audio.srcObject is null' };
    }

    const stream = audio.srcObject as MediaStream;
    const tracks = stream.getAudioTracks();

    audio.play().catch((e) => console.warn('[WebRTC DIAGNOSTIC] Test play error:', e));

    return {
      ok: !audio.paused && tracks.length > 0,
      details: {
        paused: audio.paused,
        muted: audio.muted,
        volume: audio.volume,
        tracksCount: tracks.length,
        trackState: tracks[0]?.readyState,
      },
    };
  }

  private cleanupPeerConnection(): void {
    if (this.pc) {
      try {
        this.pc.onicecandidate = null;
        this.pc.ontrack = null;
        this.pc.onconnectionstatechange = null;
        this.pc.oniceconnectionstatechange = null;
        this.pc.onicecandidateerror = null;
        this.pc.close();
      } catch (e) {}
      this.pc = null;
    }
    this.pendingIceCandidates = [];
  }

  /**
   * Complete Call Cleanup
   */
  public cleanup(): void {
    console.log('[WebRTC DIAGNOSTIC] Cleaning up all WebRTC resources...');
    this.cleanupPeerConnection();

    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }

    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach((t) => t.stop());
      this.remoteStream = null;
    }

    if (this.remoteAudioElement) {
      this.remoteAudioElement.srcObject = null;
    }

    this.currentCallId = null;
    this.onIceCandidateCallback = null;
    this.onRemoteTrackCallback = null;
    this.onConnectionStateChangeCallback = null;
  }
}

export const webrtcVoiceService = new WebRTCVoiceService();
