/**
 * Dedicated WebRTC Voice Media Engine for Kotha Hobe
 * 
 * Completely decoupled from React render lifecycles.
 * Handles microphone capture, SDP negotiation, ICE candidate queueing,
 * remote audio playback, and live RTP audio statistics & diagnostics.
 */

import { getWebRTCConfig, getSanitizedWebRTCConfig } from '../config/webrtcConfig';

export interface CandidateCounts {
  total: number;
  host: number;
  srflx: number;
  relay: number;
  prflx: number;
}

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
  dtlsState?: string;
  iceGatheringState?: string;
  candidateCounts?: CandidateCounts;
  turnAvailable?: boolean;
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
  private pendingIceCandidates: Array<{ candidate: RTCIceCandidateInit; traceId?: string }> = [];
  private currentCallId: string | null = null;

  // Local candidate counters
  private candidateCounts: CandidateCounts = {
    total: 0,
    host: 0,
    srflx: 0,
    relay: 0,
    prflx: 0,
  };

  // Diagnostic callbacks
  private onIceCandidateCallback: ((candidate: RTCIceCandidateInit, traceId: string) => void) | null = null;
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
            googEchoCancellation: true,
            googAutoGainControl: true,
            googNoiseSuppression: true,
            googHighpassFilter: true,
            googTypingNoiseDetection: true,
          } as any,
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
    onIceCandidate: (candidate: RTCIceCandidateInit, traceId: string) => void,
    onRemoteTrack: (track: MediaStreamTrack, stream: MediaStream) => void,
    onConnectionStateChange: (state: RTCPeerConnectionState, iceState: RTCIceConnectionState) => void
  ): RTCPeerConnection {
    this.cleanupPeerConnection();

    this.currentCallId = callId;
    this.candidateCounts = { total: 0, host: 0, srflx: 0, relay: 0, prflx: 0 };
    this.onIceCandidateCallback = onIceCandidate;
    this.onRemoteTrackCallback = onRemoteTrack;
    this.onConnectionStateChangeCallback = onConnectionStateChange;

    const sanitizedConfig = getSanitizedWebRTCConfig();
    console.log('[WebRTC DIAGNOSTIC] 🚀 Runtime RTCPeerConnection ICE Configuration:', JSON.stringify(sanitizedConfig, null, 2));

    const config = getWebRTCConfig();
    const pc = new RTCPeerConnection(config);
    this.pc = pc;

    // A. ICE Candidate Generation & Classification
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const raw = event.candidate.candidate;
        let type: 'host' | 'srflx' | 'relay' | 'prflx' = 'host';
        if (raw.includes('typ srflx')) type = 'srflx';
        else if (raw.includes('typ relay')) type = 'relay';
        else if (raw.includes('typ prflx')) type = 'prflx';
        else if (raw.includes('typ host')) type = 'host';

        this.candidateCounts.total += 1;
        this.candidateCounts[type] += 1;

        const traceId = Math.random().toString(36).substring(2, 9);
        console.log(`[ICE_SEND] callId=${callId} traceId=${traceId} type=${type} protocol=${event.candidate.protocol} addr=${event.candidate.address}:${event.candidate.port} totalCount=${this.candidateCounts.total} (H:${this.candidateCounts.host}, S:${this.candidateCounts.srflx}, R:${this.candidateCounts.relay})`);

        if (this.onIceCandidateCallback) {
          this.onIceCandidateCallback(event.candidate.toJSON(), traceId);
        }
      } else {
        console.log(`[ICE_GATHERING] callId=${callId} Local ICE gathering completed. Total candidates generated: ${this.candidateCounts.total} (Host: ${this.candidateCounts.host}, SRFLX: ${this.candidateCounts.srflx}, Relay: ${this.candidateCounts.relay})`);
      }
    };

    // B. ICE Gathering State Monitoring
    pc.onicegatheringstatechange = () => {
      console.log(`[ICE_GATHERING_STATE] callId=${callId} gatheringState=${pc.iceGatheringState}`);
    };

    // C. ICE Candidate Error Logging (TURN auth/STUN unreachable)
    pc.onicecandidateerror = (event: any) => {
      console.warn(`[ICE_CANDIDATE_ERROR] callId=${callId} code=${event.errorCode} text="${event.errorText}" url=${event.url} address=${event.address}:${event.port}`);
    };

    // D. Connection & ICE State Monitoring
    pc.onconnectionstatechange = () => {
      console.log(`[CONN_STATE_CHANGE] callId=${callId} connectionState=${pc.connectionState} (iceConnectionState=${pc.iceConnectionState})`);
      if (this.onConnectionStateChangeCallback) {
        this.onConnectionStateChangeCallback(pc.connectionState, pc.iceConnectionState);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[ICE_STATE_CHANGE] callId=${callId} iceConnectionState=${pc.iceConnectionState} (connectionState=${pc.connectionState})`);
      if (this.onConnectionStateChangeCallback) {
        this.onConnectionStateChangeCallback(pc.connectionState, pc.iceConnectionState);
      }
    };

    // E. Remote Audio Track Received (ontrack)
    pc.ontrack = (event) => {
      console.log(`[REMOTE_TRACK_RECEIVED] callId=${callId} kind=${event.track.kind} id=${event.track.id} readyState=${event.track.readyState} enabled=${event.track.enabled} muted=${event.track.muted}`);

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

    // F. Attach Local Audio Track
    if (this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        console.log(`[LOCAL_TRACK_ATTACHED] callId=${callId} id=${track.id} label="${track.label}" readyState=${track.readyState}`);
        pc.addTrack(track, this.localStream!);
      });
    } else {
      console.warn(`[LOCAL_TRACK_WARN] callId=${callId} createPeerConnection called without localStream ready!`);
    }

    // G. Verify Senders
    const senders = pc.getSenders();
    console.log(`[SENDERS_VERIFIED] callId=${callId} count=${senders.length}`);
    senders.forEach((s, idx) => {
      console.log(`[SENDER_INFO] #${idx} kind=${s.track?.kind} id=${s.track?.id} enabled=${s.track?.enabled} readyState=${s.track?.readyState}`);
    });

    return pc;
  }

  /**
   * Helper: Detailed SDP Diagnostic Inspection
   */
  private inspectSDP(type: 'Offer' | 'Answer', sdpText: string | undefined): {
    hasAudio: boolean;
    direction: string;
    hasUfrag: boolean;
    hasPwd: boolean;
    dtlsSetup: string;
  } {
    const sdp = sdpText || '';
    const hasAudio = sdp.includes('m=audio');
    let direction = 'unknown';
    if (sdp.includes('a=sendrecv')) direction = 'sendrecv';
    else if (sdp.includes('a=sendonly')) direction = 'sendonly';
    else if (sdp.includes('a=recvonly')) direction = 'recvonly';
    else if (sdp.includes('a=inactive')) direction = 'inactive';

    const hasUfrag = sdp.includes('a=ice-ufrag:');
    const hasPwd = sdp.includes('a=ice-pwd:');

    let dtlsSetup = 'none';
    if (sdp.includes('a=setup:actpass')) dtlsSetup = 'actpass';
    else if (sdp.includes('a=setup:active')) dtlsSetup = 'active';
    else if (sdp.includes('a=setup:passive')) dtlsSetup = 'passive';

    console.log(`[SDP_VALIDATION] ${type}: hasAudio=${hasAudio}, direction=${direction}, dtlsSetup=${dtlsSetup}, hasIceUfrag=${hasUfrag}, hasIcePwd=${hasPwd}`);
    return { hasAudio, direction, hasUfrag, hasPwd, dtlsSetup };
  }

  /**
   * 3. Create SDP Offer (Caller side) - Clean Unified Plan
   */
  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('PeerConnection not initialized');

    console.log(`[SDP_OFFER_CREATE] callId=${this.currentCallId} Creating SDP Offer (Unified Plan)...`);
    const senders = this.pc.getSenders();
    if (senders.length === 0 && this.localStream) {
      this.localStream.getAudioTracks().forEach((track) => {
        this.pc!.addTrack(track, this.localStream!);
      });
    }

    const offer = await this.pc.createOffer();

    const validation = this.inspectSDP('Offer', offer.sdp);
    if (!validation.hasAudio) {
      console.error('[SDP_OFFER_ERROR] ❌ FATAL: SDP Offer does not contain m=audio!', offer.sdp);
      throw new Error('Generated SDP offer lacks audio media descriptor');
    }

    await this.pc.setLocalDescription(offer);
    console.log(`[SDP_OFFER_LOCAL_SET] callId=${this.currentCallId} Local description set for Offer successfully.`);
    return offer;
  }

  /**
   * 4. Handle Received SDP Offer (Receiver side)
   */
  public async handleOffer(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) throw new Error('PeerConnection not initialized');

    console.log(`[SDP_OFFER_REMOTE_SET] callId=${this.currentCallId} Setting remote description from Offer...`);
    this.inspectSDP('Offer', sdp.sdp);

    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    console.log(`[SDP_OFFER_REMOTE_SUCCESS] callId=${this.currentCallId} Remote Offer description set.`);

    await this.drainPendingIceCandidates();
  }

  /**
   * 5. Create SDP Answer (Receiver side) - Clean Unified Plan
   */
  public async createAnswer(): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('PeerConnection not initialized');

    const senders = this.pc.getSenders();
    const hasAudioSender = senders.some((s) => s.track && s.track.kind === 'audio');

    if (!hasAudioSender && this.localStream) {
      console.log(`[LOCAL_TRACK_ATTACH_ANSWER] callId=${this.currentCallId} Attaching local stream track to Receiver PC before createAnswer`);
      this.localStream.getAudioTracks().forEach((track) => {
        this.pc!.addTrack(track, this.localStream!);
      });
    }

    console.log(`[SDP_ANSWER_CREATE] callId=${this.currentCallId} Creating SDP Answer (Unified Plan)...`);
    const answer = await this.pc.createAnswer();

    const validation = this.inspectSDP('Answer', answer.sdp);
    if (!validation.hasAudio) {
      console.error('[SDP_ANSWER_ERROR] ❌ FATAL: SDP Answer does not contain m=audio!', answer.sdp);
      throw new Error('Generated SDP answer lacks audio media descriptor');
    }

    await this.pc.setLocalDescription(answer);
    console.log(`[SDP_ANSWER_LOCAL_SET] callId=${this.currentCallId} Local description set for Answer successfully.`);
    return answer;
  }

  /**
   * 6. Handle Received SDP Answer (Caller side)
   */
  public async handleAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) throw new Error('PeerConnection not initialized');

    console.log(`[SDP_ANSWER_REMOTE_SET] callId=${this.currentCallId} Setting remote description from Answer...`);
    this.inspectSDP('Answer', sdp.sdp);

    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    console.log(`[SDP_ANSWER_REMOTE_SUCCESS] callId=${this.currentCallId} Remote Answer description set.`);

    await this.drainPendingIceCandidates();
  }

  /**
   * 7. Add Remote ICE Candidate with robust buffering & individual error isolation
   */
  public async addIceCandidate(candidate: RTCIceCandidateInit, traceId?: string): Promise<void> {
    if (!candidate) return;

    if (!this.pc || !this.pc.remoteDescription || !this.pc.remoteDescription.type) {
      console.log(`[ICE_BUFFERED] callId=${this.currentCallId} traceId=${traceId || 'none'} Buffering candidate (remoteDescription not set yet)`);
      this.pendingIceCandidates.push({ candidate, traceId });
      return;
    }

    try {
      if (candidate.candidate === '' || candidate.candidate === null) {
        console.log(`[ICE_END_OF_CANDIDATES] callId=${this.currentCallId} End-of-candidates candidate received`);
        return;
      }
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log(`[ICE_ADDED] callId=${this.currentCallId} traceId=${traceId || 'none'} Successfully added candidate to PeerConnection`);
    } catch (err: any) {
      console.warn(`[ICE_ADD_ERROR] callId=${this.currentCallId} traceId=${traceId || 'none'} Error adding candidate: ${err?.message || err}`);
    }
  }

  private async drainPendingIceCandidates(): Promise<void> {
    if (!this.pc || !this.pc.remoteDescription) return;
    const count = this.pendingIceCandidates.length;
    if (count === 0) return;

    console.log(`[ICE_DRAIN_START] callId=${this.currentCallId} Draining ${count} queued ICE candidate(s)...`);
    while (this.pendingIceCandidates.length > 0) {
      const item = this.pendingIceCandidates.shift();
      if (item && item.candidate) {
        try {
          if (item.candidate.candidate === '' || item.candidate.candidate === null) continue;
          await this.pc.addIceCandidate(new RTCIceCandidate(item.candidate));
          console.log(`[ICE_DRAINED] callId=${this.currentCallId} traceId=${item.traceId || 'none'} Buffered candidate applied`);
        } catch (e: any) {
          console.warn(`[ICE_DRAIN_ERROR] callId=${this.currentCallId} traceId=${item.traceId || 'none'} Failed applying buffered candidate: ${e?.message || e}`);
        }
      }
    }
    console.log(`[ICE_DRAIN_COMPLETE] callId=${this.currentCallId} All buffered candidates processed.`);
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
   * 9. Query Real-Time WebRTC Audio Stats, Candidate Counts, DTLS State & Selected Candidate Pair
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
      dtlsState: 'idle',
      iceGatheringState: this.pc?.iceGatheringState || 'new',
      candidateCounts: { ...this.candidateCounts },
      turnAvailable: this.candidateCounts.relay > 0,
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

        // Candidate pair & DTLS transport analysis
        if (stat.type === 'transport') {
          if (stat.dtlsState) {
            stats.dtlsState = stat.dtlsState;
          }
          if (stat.selectedCandidatePairId) {
            activeCandidatePairId = stat.selectedCandidatePairId;
          }
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
        this.pc.onicegatheringstatechange = null;
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
    this.candidateCounts = { total: 0, host: 0, srflx: 0, relay: 0, prflx: 0 };
    this.onIceCandidateCallback = null;
    this.onRemoteTrackCallback = null;
    this.onConnectionStateChangeCallback = null;
  }
}

export const webrtcVoiceService = new WebRTCVoiceService();
