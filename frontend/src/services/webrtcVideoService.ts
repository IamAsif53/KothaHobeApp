/**
 * Dedicated WebRTC Video Media Engine for Kotha Hobe
 * 
 * Completely decoupled from voice calling media engine to ensure 100% voice call stability.
 * Handles dual audio + video capture, front/rear camera lifecycle,
 * on-the-fly track replacement without SDP renegotiation, Picture-in-Picture (PiP),
 * Unified Plan SDP negotiation, remote video/audio playback, and live RTP video diagnostics.
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

export interface VideoStats {
  audioPacketsSent: number;
  audioBytesSent: number;
  audioPacketsReceived: number;
  audioBytesReceived: number;
  videoPacketsSent: number;
  videoBytesSent: number;
  videoPacketsReceived: number;
  videoBytesReceived: number;
  videoPacketsLost: number;
  framesSent?: number;
  framesReceived?: number;
  framesDecoded?: number;
  framesDropped?: number;
  frameWidth?: number;
  frameHeight?: number;
  fps?: number;
  jitter: number;
  rtt?: number;
  selectedCandidatePair?: CandidatePairInfo;
  iceState: string;
  connectionState: string;
  dtlsState: string;
  iceGatheringState: string;
  candidateCounts: CandidateCounts;
  turnAvailable: boolean;
  isVideoEnabled: boolean;
  isFrontCamera: boolean;
}

class WebRTCVideoService {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private remoteAudioElement: HTMLAudioElement | null = null;
  private pendingIceCandidates: Array<{ candidate: RTCIceCandidateInit; traceId?: string }> = [];
  private currentCallId: string | null = null;
  private isFrontCamera: boolean = true;
  private isVideoEnabled: boolean = true;

  // Local candidate counters
  private candidateCounts: CandidateCounts = {
    total: 0,
    host: 0,
    srflx: 0,
    relay: 0,
    prflx: 0,
  };

  // Callbacks
  private onIceCandidateCallback: ((candidate: RTCIceCandidateInit, traceId: string) => void) | null = null;
  private onRemoteTrackCallback: ((track: MediaStreamTrack, stream: MediaStream) => void) | null = null;
  private onConnectionStateChangeCallback: ((state: RTCPeerConnectionState, iceState: RTCIceConnectionState) => void) | null = null;
  private onLocalStreamChangeCallback: ((stream: MediaStream | null) => void) | null = null;
  private onRemoteStreamChangeCallback: ((stream: MediaStream | null) => void) | null = null;

  public getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  public getRemoteStream(): MediaStream | null {
    return this.remoteStream;
  }

  public getIsFrontCamera(): boolean {
    return this.isFrontCamera;
  }

  public getIsVideoEnabled(): boolean {
    return this.isVideoEnabled;
  }

  public onLocalStreamChange(cb: (stream: MediaStream | null) => void): void {
    this.onLocalStreamChangeCallback = cb;
    if (this.localStream) cb(this.localStream);
  }

  public onRemoteStreamChange(cb: (stream: MediaStream | null) => void): void {
    this.onRemoteStreamChangeCallback = cb;
    if (this.remoteStream) cb(this.remoteStream);
  }

  /**
   * 1. Capture Local Audio & Video Stream (720p / 30fps with automatic device fallback)
   */
  public async startLocalMedia(options: { audio?: boolean; video?: boolean; isFrontCamera?: boolean } = { audio: true, video: true, isFrontCamera: true }): Promise<MediaStream> {
    this.isFrontCamera = options.isFrontCamera !== false;
    this.isVideoEnabled = options.video !== false;

    console.log(`[WebRTC-VIDEO] 📹🎙️ Requesting camera & mic stream (audio=${options.audio !== false}, video=${this.isVideoEnabled}, front=${this.isFrontCamera})...`);

    try {
      if (this.localStream) {
        this.localStream.getTracks().forEach((t) => t.stop());
        this.localStream = null;
      }

      const audioConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        googEchoCancellation: true,
        googAutoGainControl: true,
        googNoiseSuppression: true,
        googHighpassFilter: true,
        googTypingNoiseDetection: true,
      };

      const videoConstraints = this.isVideoEnabled
        ? {
            facingMode: this.isFrontCamera ? 'user' : 'environment',
            width: { ideal: 1280, max: 1280 },
            height: { ideal: 720, max: 720 },
            frameRate: { ideal: 30, max: 30 },
          }
        : false;

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: audioConstraints as any,
          video: videoConstraints,
        });
        console.log('[WebRTC-VIDEO] ✅ getUserMedia succeeded with 720p constraints');
      } catch (hdErr: any) {
        console.warn('[WebRTC-VIDEO] ⚠️ 720p constraints rejected, falling back to flexible VGA/480p:', hdErr?.message);
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: this.isVideoEnabled
              ? {
                  facingMode: this.isFrontCamera ? 'user' : 'environment',
                  width: { ideal: 640 },
                  height: { ideal: 480 },
                }
              : false,
          });
          console.log('[WebRTC-VIDEO] ✅ getUserMedia succeeded with fallback resolution');
        } catch (basicErr: any) {
          console.warn('[WebRTC-VIDEO] ⚠️ Fallback video failed, attempting basic true:', basicErr?.message);
          stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: this.isVideoEnabled ? true : false,
          });
        }
      }

      const audioTracks = stream.getAudioTracks();
      const videoTracks = stream.getVideoTracks();
      console.log(`[WebRTC-VIDEO] 🎥 Media acquired: ${audioTracks.length} audio track(s), ${videoTracks.length} video track(s)`);

      if (audioTracks.length === 0) {
        throw new Error('No audio track returned by device');
      }

      audioTracks.forEach((t) => (t.enabled = true));
      videoTracks.forEach((t) => (t.enabled = this.isVideoEnabled));

      this.localStream = stream;
      if (this.onLocalStreamChangeCallback) {
        this.onLocalStreamChangeCallback(stream);
      }

      return stream;
    } catch (err: any) {
      console.error('[WebRTC-VIDEO] ❌ Fatal media acquisition error:', err.name, err.message);
      throw err;
    }
  }

  /**
   * 2. Initialize RTCPeerConnection for Video + Audio Call
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
    console.log('[WebRTC-VIDEO] 🚀 Runtime RTCPeerConnection ICE Config:', JSON.stringify(sanitizedConfig, null, 2));

    const config = getWebRTCConfig();
    const pc = new RTCPeerConnection(config);
    this.pc = pc;

    // A. ICE Candidate Generation
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
        console.log(`[ICE_SEND_VIDEO] callId=${callId} traceId=${traceId} type=${type} protocol=${event.candidate.protocol} addr=${event.candidate.address}:${event.candidate.port} total=${this.candidateCounts.total}`);

        if (this.onIceCandidateCallback) {
          this.onIceCandidateCallback(event.candidate.toJSON(), traceId);
        }
      } else {
        console.log(`[ICE_GATHER_VIDEO] callId=${callId} ICE gathering complete. Total: ${this.candidateCounts.total}`);
      }
    };

    // B. State Changes
    pc.onconnectionstatechange = () => {
      console.log(`[CONN_STATE_VIDEO] callId=${callId} connectionState=${pc.connectionState} (ice=${pc.iceConnectionState})`);
      if (this.onConnectionStateChangeCallback) {
        this.onConnectionStateChangeCallback(pc.connectionState, pc.iceConnectionState);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[ICE_STATE_VIDEO] callId=${callId} iceConnectionState=${pc.iceConnectionState} (conn=${pc.connectionState})`);
      if (this.onConnectionStateChangeCallback) {
        this.onConnectionStateChangeCallback(pc.connectionState, pc.iceConnectionState);
      }
    };

    // C. Remote Track Arrival (ontrack)
    pc.ontrack = (event) => {
      console.log(`[REMOTE_TRACK_VIDEO] callId=${callId} kind=${event.track.kind} id=${event.track.id} readyState=${event.track.readyState}`);

      const stream =
        event.streams && event.streams.length > 0 && event.streams[0]
          ? event.streams[0]
          : this.remoteStream || new MediaStream();

      if (!this.remoteStream) {
        this.remoteStream = stream;
      }

      if (!this.remoteStream.getTracks().some((t) => t.id === event.track.id)) {
        this.remoteStream.addTrack(event.track);
      }

      if (event.track.kind === 'audio') {
        this.attachRemoteAudio(event.track, this.remoteStream);
      }

      if (this.onRemoteTrackCallback) {
        this.onRemoteTrackCallback(event.track, this.remoteStream);
      }

      if (this.onRemoteStreamChangeCallback) {
        this.onRemoteStreamChangeCallback(this.remoteStream);
      }
    };

    // D. Attach Local Audio & Video Tracks
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        console.log(`[LOCAL_TRACK_VIDEO] callId=${callId} kind=${track.kind} id=${track.id} label="${track.label}"`);
        pc.addTrack(track, this.localStream!);
      });
    } else {
      console.warn(`[LOCAL_TRACK_VIDEO_WARN] createPeerConnection called without localStream ready!`);
    }

    return pc;
  }

  /**
   * Helper: Inspect Unified Plan SDP
   */
  private inspectSDP(type: 'Offer' | 'Answer', sdpText: string | undefined): {
    hasAudio: boolean;
    hasVideo: boolean;
    direction: string;
  } {
    const sdp = sdpText || '';
    const hasAudio = sdp.includes('m=audio');
    const hasVideo = sdp.includes('m=video');
    let direction = 'sendrecv';
    if (sdp.includes('a=sendonly')) direction = 'sendonly';
    else if (sdp.includes('a=recvonly')) direction = 'recvonly';
    else if (sdp.includes('a=inactive')) direction = 'inactive';

    console.log(`[SDP_VIDEO_VALIDATION] ${type}: hasAudio=${hasAudio}, hasVideo=${hasVideo}, direction=${direction}`);
    return { hasAudio, hasVideo, direction };
  }

  /**
   * 3. Create Unified Plan SDP Offer with m=audio and m=video
   */
  public async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('PeerConnection not initialized');

    console.log(`[SDP_VIDEO_OFFER_CREATE] callId=${this.currentCallId} Creating SDP Offer (Unified Plan)...`);
    const senders = this.pc.getSenders();
    if (senders.length === 0 && this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        this.pc!.addTrack(track, this.localStream!);
      });
    }

    const offer = await this.pc.createOffer();
    this.inspectSDP('Offer', offer.sdp);

    await this.pc.setLocalDescription(offer);
    console.log(`[SDP_VIDEO_OFFER_SET] Local description set for video offer successfully.`);
    return offer;
  }

  /**
   * 4. Handle Received SDP Offer
   */
  public async handleOffer(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) throw new Error('PeerConnection not initialized');

    console.log(`[SDP_VIDEO_OFFER_HANDLE] Setting remote description for video offer...`);
    this.inspectSDP('Offer', sdp.sdp);

    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    await this.drainPendingIceCandidates();
  }

  /**
   * 5. Create Unified Plan SDP Answer
   */
  public async createAnswer(): Promise<RTCSessionDescriptionInit> {
    if (!this.pc) throw new Error('PeerConnection not initialized');

    const senders = this.pc.getSenders();
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        const alreadyAdded = senders.some((s) => s.track && s.track.id === track.id);
        if (!alreadyAdded) {
          console.log(`[ATTACH_TRACK_ANSWER] Attaching ${track.kind} track to PeerConnection`);
          this.pc!.addTrack(track, this.localStream!);
        }
      });
    }

    console.log(`[SDP_VIDEO_ANSWER_CREATE] Creating SDP Answer...`);
    const answer = await this.pc.createAnswer();
    this.inspectSDP('Answer', answer.sdp);

    await this.pc.setLocalDescription(answer);
    console.log(`[SDP_VIDEO_ANSWER_SET] Local description set for video answer successfully.`);
    return answer;
  }

  /**
   * 6. Handle Received SDP Answer
   */
  public async handleAnswer(sdp: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) throw new Error('PeerConnection not initialized');

    console.log(`[SDP_VIDEO_ANSWER_HANDLE] Setting remote description for video answer...`);
    this.inspectSDP('Answer', sdp.sdp);

    await this.pc.setRemoteDescription(new RTCSessionDescription(sdp));
    await this.drainPendingIceCandidates();
  }

  /**
   * 7. Add Remote ICE Candidate with Queuing
   */
  public async addIceCandidate(candidate: RTCIceCandidateInit, traceId?: string): Promise<void> {
    if (!candidate) return;

    if (!this.pc || !this.pc.remoteDescription || !this.pc.remoteDescription.type) {
      this.pendingIceCandidates.push({ candidate, traceId });
      return;
    }

    try {
      if (candidate.candidate === '' || candidate.candidate === null) return;
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
      console.log(`[ICE_ADDED_VIDEO] traceId=${traceId || 'none'} Candidate applied to video peer connection`);
    } catch (err: any) {
      console.warn(`[ICE_ADD_VIDEO_ERROR] Error adding video candidate:`, err?.message || err);
    }
  }

  private async drainPendingIceCandidates(): Promise<void> {
    if (!this.pc || !this.pc.remoteDescription) return;
    while (this.pendingIceCandidates.length > 0) {
      const item = this.pendingIceCandidates.shift();
      if (item && item.candidate) {
        try {
          if (item.candidate.candidate === '' || item.candidate.candidate === null) continue;
          await this.pc.addIceCandidate(new RTCIceCandidate(item.candidate));
        } catch (e) {}
      }
    }
  }

  /**
   * 8. Attach Remote Audio Playback
   */
  public attachRemoteAudio(track: MediaStreamTrack, stream: MediaStream): void {
    try {
      let audio =
        this.remoteAudioElement ||
        (document.getElementById('kothahobe-remote-audio') as HTMLAudioElement);

      if (!audio) {
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
      audio.play().catch((e) => console.warn('[WebRTC-VIDEO] Remote audio play note:', e));
    } catch (err) {
      console.warn('[WebRTC-VIDEO] Error attaching remote audio:', err);
    }
  }

  /**
   * 9. Attach Local Stream to <video> element
   */
  public attachLocalVideo(element: HTMLVideoElement | null): void {
    if (element) {
      element.srcObject = this.localStream;
      element.muted = true; // Prevent local audio feedback
      element.playsInline = true;
      element.play().catch(() => {});
    }
  }

  /**
   * 10. Attach Remote Stream to <video> element
   */
  public attachRemoteVideo(element: HTMLVideoElement | null): void {
    if (element) {
      element.srcObject = this.remoteStream;
      element.playsInline = true;
      element.play().catch(() => {});
    }
  }

  /**
   * 11. Toggle Local Video On/Off without disconnecting call
   */
  public toggleVideo(enabled?: boolean): boolean {
    if (this.localStream) {
      const videoTracks = this.localStream.getVideoTracks();
      if (videoTracks.length > 0) {
        const nextState = enabled !== undefined ? enabled : !videoTracks[0].enabled;
        videoTracks.forEach((t) => (t.enabled = nextState));
        this.isVideoEnabled = nextState;
        console.log(`[WebRTC-VIDEO] Camera track.enabled set to: ${nextState}`);
        if (this.onLocalStreamChangeCallback) {
          this.onLocalStreamChangeCallback(this.localStream);
        }
        return nextState;
      }
    }
    return false;
  }

  /**
   * 12. Toggle Local Audio Mute
   */
  public toggleMute(muted?: boolean): boolean {
    if (this.localStream) {
      const audioTracks = this.localStream.getAudioTracks();
      if (audioTracks.length > 0) {
        const isMuted = muted !== undefined ? muted : audioTracks[0].enabled;
        audioTracks.forEach((t) => (t.enabled = !isMuted));
        console.log(`[WebRTC-VIDEO] Microphone muted set to: ${isMuted}`);
        return isMuted;
      }
    }
    return false;
  }

  /**
   * 13. Switch Between Front and Rear Camera using RTCRtpSender.replaceTrack()
   */
  public async switchCamera(forceFront?: boolean): Promise<MediaStreamTrack | null> {
    if (!this.localStream) return null;

    const currentVideoTrack = this.localStream.getVideoTracks()[0];
    if (!currentVideoTrack) return null;

    const nextFront = forceFront !== undefined ? forceFront : !this.isFrontCamera;
    console.log(`[WebRTC-VIDEO] 🔄 Flipping camera to ${nextFront ? 'front' : 'rear'}...`);

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: nextFront ? 'user' : 'environment',
          width: { ideal: 1280, max: 1280 },
          height: { ideal: 720, max: 720 },
          frameRate: { ideal: 30, max: 30 },
        },
      });

      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) throw new Error('No video track found in switched camera stream');

      // Preserve enabled state
      newVideoTrack.enabled = this.isVideoEnabled;

      // Replace track on RTCPeerConnection sender seamlessly without renegotiation
      if (this.pc) {
        const senders = this.pc.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(newVideoTrack);
          console.log('[WebRTC-VIDEO] ✅ Successfully replaced video track on PeerConnection sender');
        }
      }

      // Stop old video track to release old camera hardware
      currentVideoTrack.stop();
      this.localStream.removeTrack(currentVideoTrack);
      this.localStream.addTrack(newVideoTrack);
      this.isFrontCamera = nextFront;

      if (this.onLocalStreamChangeCallback) {
        this.onLocalStreamChangeCallback(this.localStream);
      }

      return newVideoTrack;
    } catch (err: any) {
      console.warn('[WebRTC-VIDEO] ❌ Camera flip failed:', err?.message || err);
      return null;
    }
  }

  /**
   * 14. Real-time Video Diagnostics & Quality Monitoring
   */
  public async getVideoStats(): Promise<VideoStats> {
    const stats: VideoStats = {
      audioPacketsSent: 0,
      audioBytesSent: 0,
      audioPacketsReceived: 0,
      audioBytesReceived: 0,
      videoPacketsSent: 0,
      videoBytesSent: 0,
      videoPacketsReceived: 0,
      videoBytesReceived: 0,
      videoPacketsLost: 0,
      jitter: 0,
      iceState: this.pc?.iceConnectionState || 'idle',
      connectionState: this.pc?.connectionState || 'idle',
      dtlsState: 'idle',
      iceGatheringState: this.pc?.iceGatheringState || 'new',
      candidateCounts: { ...this.candidateCounts },
      turnAvailable: this.candidateCounts.relay > 0,
      isVideoEnabled: this.isVideoEnabled,
      isFrontCamera: this.isFrontCamera,
    };

    if (!this.pc) return stats;

    try {
      const report = await this.pc.getStats();
      let activeCandidatePairId: string | null = null;
      const candidates = new Map<string, any>();
      const candidatePairs: any[] = [];

      report.forEach((stat) => {
        if (stat.type === 'outbound-rtp') {
          if (stat.kind === 'audio' || stat.mediaType === 'audio') {
            stats.audioPacketsSent = stat.packetsSent || 0;
            stats.audioBytesSent = stat.bytesSent || 0;
          } else if (stat.kind === 'video' || stat.mediaType === 'video') {
            stats.videoPacketsSent = stat.packetsSent || 0;
            stats.videoBytesSent = stat.bytesSent || 0;
            stats.framesSent = stat.framesSent || 0;
            stats.fps = stat.framesPerSecond || 0;
          }
        }

        if (stat.type === 'inbound-rtp') {
          if (stat.kind === 'audio' || stat.mediaType === 'audio') {
            stats.audioPacketsReceived = stat.packetsReceived || 0;
            stats.audioBytesReceived = stat.bytesReceived || 0;
          } else if (stat.kind === 'video' || stat.mediaType === 'video') {
            stats.videoPacketsReceived = stat.packetsReceived || 0;
            stats.videoBytesReceived = stat.bytesReceived || 0;
            stats.videoPacketsLost = stat.packetsLost || 0;
            stats.framesReceived = stat.framesReceived || 0;
            stats.framesDecoded = stat.framesDecoded || 0;
            stats.framesDropped = stat.framesDropped || 0;
            stats.frameWidth = stat.frameWidth;
            stats.frameHeight = stat.frameHeight;
            stats.jitter = stat.jitter || 0;
          }
        }

        if (stat.type === 'transport') {
          if (stat.dtlsState) stats.dtlsState = stat.dtlsState;
          if (stat.selectedCandidatePairId) activeCandidatePairId = stat.selectedCandidatePairId;
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
          stats.rtt = stats.selectedCandidatePair.rtt;
        }
      }
    } catch (e) {
      console.warn('[WebRTC-VIDEO] Error reading stats:', e);
    }

    return stats;
  }

  private cleanupPeerConnection(): void {
    if (this.pc) {
      try {
        this.pc.onicecandidate = null;
        this.pc.onicegatheringstatechange = null;
        this.pc.ontrack = null;
        this.pc.onconnectionstatechange = null;
        this.pc.oniceconnectionstatechange = null;
        this.pc.close();
      } catch (e) {}
      this.pc = null;
    }
    this.pendingIceCandidates = [];
  }

  /**
   * Complete Video Call Teardown & Camera Hardware Release
   */
  public cleanup(): void {
    console.log('[WebRTC-VIDEO] 🧹 Full media teardown: stopping all camera and microphone tracks...');
    this.cleanupPeerConnection();

    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        track.stop();
        console.log(`[WebRTC-VIDEO] Stopped local ${track.kind} track (${track.id})`);
      });
      this.localStream = null;
    }

    if (this.remoteStream) {
      this.remoteStream.getTracks().forEach((track) => track.stop());
      this.remoteStream = null;
    }

    if (this.remoteAudioElement) {
      this.remoteAudioElement.srcObject = null;
    }

    if (this.onLocalStreamChangeCallback) {
      this.onLocalStreamChangeCallback(null);
    }
    if (this.onRemoteStreamChangeCallback) {
      this.onRemoteStreamChangeCallback(null);
    }

    this.currentCallId = null;
    this.candidateCounts = { total: 0, host: 0, srflx: 0, relay: 0, prflx: 0 };
    this.onIceCandidateCallback = null;
    this.onRemoteTrackCallback = null;
    this.onConnectionStateChangeCallback = null;
    this.isFrontCamera = true;
    this.isVideoEnabled = true;
  }
}

export const webrtcVideoService = new WebRTCVideoService();
