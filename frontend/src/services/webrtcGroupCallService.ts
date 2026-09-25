import { getWebRTCConfig } from '../config/webrtcConfig';
import { IUser } from '../types';

export interface RemotePeerState {
  userId: string;
  user?: IUser;
  stream: MediaStream;
  isSpeaking: boolean;
  audioLevel: number;
  isVideoEnabled: boolean;
  isAudioEnabled: boolean;
  connectionState: RTCPeerConnectionState;
}

export type PeersChangeCallback = (peers: Map<string, RemotePeerState>) => void;
export type LocalStreamCallback = (stream: MediaStream | null, isSpeaking: boolean, audioLevel: number) => void;

class WebRTCGroupCallService {
  private localStream: MediaStream | null = null;
  private peerConnections = new Map<string, RTCPeerConnection>();
  private peerStates = new Map<string, RemotePeerState>();
  private pendingCandidates = new Map<string, RTCIceCandidateInit[]>();

  // Audio Context & Analysers for Active Speaker Detection
  private audioCtx: AudioContext | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private peerAnalysers = new Map<string, AnalyserNode>();
  private speakerCheckInterval: NodeJS.Timeout | null = null;

  private isFrontCamera: boolean = true;
  private isMuted: boolean = false;
  private isVideoEnabled: boolean = true;
  private callType: 'voice' | 'video' = 'voice';

  // Subscriptions
  private onPeersChangeCallbacks: PeersChangeCallback[] = [];
  private onLocalStreamCallbacks: LocalStreamCallback[] = [];

  public getLocalStream(): MediaStream | null {
    return this.localStream;
  }

  public getPeerStates(): Map<string, RemotePeerState> {
    return this.peerStates;
  }

  public getIsFrontCamera(): boolean {
    return this.isFrontCamera;
  }

  public getIsMuted(): boolean {
    return this.isMuted;
  }

  public getIsVideoEnabled(): boolean {
    return this.isVideoEnabled;
  }

  public subscribePeersChange(cb: PeersChangeCallback): () => void {
    this.onPeersChangeCallbacks.push(cb);
    cb(this.peerStates);
    return () => {
      this.onPeersChangeCallbacks = this.onPeersChangeCallbacks.filter((c) => c !== cb);
    };
  }

  public subscribeLocalStream(cb: LocalStreamCallback): () => void {
    this.onLocalStreamCallbacks.push(cb);
    cb(this.localStream, false, 0);
    return () => {
      this.onLocalStreamCallbacks = this.onLocalStreamCallbacks.filter((c) => c !== cb);
    };
  }

  private notifyPeersChange(): void {
    const copy = new Map(this.peerStates);
    this.onPeersChangeCallbacks.forEach((cb) => {
      try {
        cb(copy);
      } catch (e) {
        console.warn('[GroupRTC] notifyPeersChange callback error:', e);
      }
    });
  }

  private notifyLocalStream(isSpeaking = false, audioLevel = 0): void {
    this.onLocalStreamCallbacks.forEach((cb) => {
      try {
        cb(this.localStream, isSpeaking, audioLevel);
      } catch (e) {
        console.warn('[GroupRTC] notifyLocalStream callback error:', e);
      }
    });
  }

  /**
   * 1. Start Local Media Stream (Mic + optional Camera)
   */
  public async startLocalMedia(
    callType: 'voice' | 'video' = 'voice',
    isFrontCamera: boolean = true
  ): Promise<MediaStream> {
    this.callType = callType;
    this.isFrontCamera = isFrontCamera;
    this.isVideoEnabled = callType === 'video';
    this.isMuted = false;

    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }

    const audioConstraints = {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    };

    const videoConstraints =
      this.callType === 'video'
        ? {
            facingMode: this.isFrontCamera ? 'user' : 'environment',
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
            frameRate: { ideal: 24, max: 30 },
          }
        : false;

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: audioConstraints,
      video: videoConstraints,
    });

    this.localStream = stream;
    this.setupAudioContext();
    this.setupLocalAudioAnalyser();
    this.startSpeakerDetection();
    this.notifyLocalStream();

    console.log(`[GroupRTC] Local media started (${callType}, tracks: ${stream.getTracks().length})`);
    return stream;
  }

  /**
   * 2. Initialize a Peer Connection for a specific remote user
   */
  public async initPeerConnection(
    remoteUserId: string,
    remoteUser: IUser | undefined,
    isInitiator: boolean,
    onSignal: (targetUserId: string, signal: any) => void
  ): Promise<RTCPeerConnection> {
    // If existing PC exists for this peer, clean it first
    if (this.peerConnections.has(remoteUserId)) {
      this.removePeer(remoteUserId);
    }

    const config = getWebRTCConfig();
    const pc = new RTCPeerConnection(config);
    this.peerConnections.set(remoteUserId, pc);

    // Initial state for this peer
    const remoteStream = new MediaStream();
    this.peerStates.set(remoteUserId, {
      userId: remoteUserId,
      user: remoteUser,
      stream: remoteStream,
      isSpeaking: false,
      audioLevel: 0,
      isVideoEnabled: this.callType === 'video',
      isAudioEnabled: true,
      connectionState: 'new',
    });

    // Add local tracks to this peer connection
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => {
        pc.addTrack(track, this.localStream!);
      });
    }

    // ICE Candidate handler
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        onSignal(remoteUserId, {
          type: 'ice-candidate',
          candidate: event.candidate.toJSON(),
        });
      }
    };

    // Remote Track handler
    pc.ontrack = (event) => {
      console.log(`[GroupRTC] Received track (${event.track.kind}) from peer ${remoteUserId}`);
      const peerState = this.peerStates.get(remoteUserId);
      if (peerState) {
        // Add track to peer's remoteStream if not already added
        if (!peerState.stream.getTracks().some((t) => t.id === event.track.id)) {
          peerState.stream.addTrack(event.track);
        }

        if (event.track.kind === 'audio') {
          this.setupPeerAudioAnalyser(remoteUserId, peerState.stream);
        }

        this.notifyPeersChange();
      }
    };

    // Connection State Change handler
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      console.log(`[GroupRTC] Peer ${remoteUserId} connection state: ${state}`);
      const peerState = this.peerStates.get(remoteUserId);
      if (peerState) {
        peerState.connectionState = state;
        if (state === 'failed' || state === 'closed') {
          // Keep state for UI until explicit remove or reconnect
        }
        this.notifyPeersChange();
      }
    };

    // If initiator, create and send SDP Offer
    if (isInitiator) {
      try {
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: this.callType === 'video',
        });
        await pc.setLocalDescription(offer);

        onSignal(remoteUserId, {
          type: 'offer',
          sdp: offer,
        });
        console.log(`[GroupRTC] ⚡ Sent SDP offer to peer ${remoteUserId}`);
      } catch (err) {
        console.error(`[GroupRTC] Failed to create offer for peer ${remoteUserId}:`, err);
      }
    }

    this.notifyPeersChange();
    return pc;
  }

  /**
   * 3. Handle Incoming Signaling Message from another Peer
   */
  public async handleSignal(
    senderId: string,
    signal: { type: 'offer' | 'answer' | 'ice-candidate'; sdp?: any; candidate?: any },
    onSignal: (targetUserId: string, signal: any) => void
  ): Promise<void> {
    try {
      let pc = this.peerConnections.get(senderId);

      if (signal.type === 'offer') {
        if (!pc) {
          pc = await this.initPeerConnection(senderId, undefined, false, onSignal);
        }

        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        console.log(`[GroupRTC] Set remote offer from peer ${senderId}`);

        // Process any queued ICE candidates for this peer
        const queued = this.pendingCandidates.get(senderId) || [];
        for (const cand of queued) {
          await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
        }
        this.pendingCandidates.delete(senderId);

        // Create and send SDP Answer
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        onSignal(senderId, {
          type: 'answer',
          sdp: answer,
        });
        console.log(`[GroupRTC] ⚡ Sent SDP answer to peer ${senderId}`);
      } else if (signal.type === 'answer') {
        if (pc) {
          await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
          console.log(`[GroupRTC] Set remote answer from peer ${senderId}`);

          const queued = this.pendingCandidates.get(senderId) || [];
          for (const cand of queued) {
            await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
          }
          this.pendingCandidates.delete(senderId);
        }
      } else if (signal.type === 'ice-candidate') {
        if (signal.candidate) {
          if (pc && pc.remoteDescription) {
            await pc.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch((e) => {
              console.warn(`[GroupRTC] Error adding ICE candidate from ${senderId}:`, e);
            });
          } else {
            // Queue until remote description is set
            if (!this.pendingCandidates.has(senderId)) {
              this.pendingCandidates.set(senderId, []);
            }
            this.pendingCandidates.get(senderId)!.push(signal.candidate);
          }
        }
      }
    } catch (err) {
      console.error(`[GroupRTC] handleSignal error from ${senderId}:`, err);
    }
  }

  /**
   * 4. Remove a Peer (when user leaves group call)
   */
  public removePeer(userId: string): void {
    const pc = this.peerConnections.get(userId);
    if (pc) {
      try {
        pc.close();
      } catch (e) {}
      this.peerConnections.delete(userId);
    }

    const analyser = this.peerAnalysers.get(userId);
    if (analyser) {
      try {
        analyser.disconnect();
      } catch (e) {}
      this.peerAnalysers.delete(userId);
    }

    const state = this.peerStates.get(userId);
    if (state) {
      state.stream.getTracks().forEach((t) => t.stop());
      this.peerStates.delete(userId);
    }

    this.pendingCandidates.delete(userId);
    this.notifyPeersChange();
    console.log(`[GroupRTC] Removed peer ${userId}`);
  }

  /**
   * 5. Mute / Unmute Microphone
   */
  public toggleMute(): boolean {
    if (!this.localStream) return this.isMuted;
    this.isMuted = !this.isMuted;
    this.localStream.getAudioTracks().forEach((track) => {
      track.enabled = !this.isMuted;
    });
    this.notifyLocalStream(false, 0);
    return this.isMuted;
  }

  /**
   * 6. Enable / Disable Video Camera
   */
  public toggleVideo(): boolean {
    if (!this.localStream) return this.isVideoEnabled;
    this.isVideoEnabled = !this.isVideoEnabled;
    this.localStream.getVideoTracks().forEach((track) => {
      track.enabled = this.isVideoEnabled;
    });
    this.notifyLocalStream();
    return this.isVideoEnabled;
  }

  /**
   * 7. Switch Camera (Front <-> Back)
   */
  public async switchCamera(): Promise<boolean> {
    if (!this.localStream || this.callType !== 'video') return this.isFrontCamera;

    this.isFrontCamera = !this.isFrontCamera;
    const facingMode = this.isFrontCamera ? 'user' : 'environment';

    try {
      const newStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 640, max: 1280 },
          height: { ideal: 480, max: 720 },
        },
      });

      const newVideoTrack = newStream.getVideoTracks()[0];
      const oldVideoTrack = this.localStream.getVideoTracks()[0];

      if (oldVideoTrack) {
        this.localStream.removeTrack(oldVideoTrack);
        oldVideoTrack.stop();
      }
      this.localStream.addTrack(newVideoTrack);

      // Replace video track in all active peer connections
      for (const pc of this.peerConnections.values()) {
        const senders = pc.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(newVideoTrack);
        }
      }

      this.notifyLocalStream();
      return this.isFrontCamera;
    } catch (err) {
      console.error('[GroupRTC] switchCamera error:', err);
      return this.isFrontCamera;
    }
  }

  /**
   * Active Speaker Detection via Web Audio Analysers
   */
  private setupAudioContext(): void {
    if (!this.audioCtx) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContextClass) {
        this.audioCtx = new AudioContextClass();
      }
    }
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
  }

  private setupLocalAudioAnalyser(): void {
    if (!this.audioCtx || !this.localStream) return;
    try {
      const audioTrack = this.localStream.getAudioTracks()[0];
      if (!audioTrack) return;

      const source = this.audioCtx.createMediaStreamSource(new MediaStream([audioTrack]));
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      this.localAnalyser = analyser;
    } catch (e) {
      console.warn('[GroupRTC] Local audio analyser setup failed:', e);
    }
  }

  private setupPeerAudioAnalyser(userId: string, stream: MediaStream): void {
    if (!this.audioCtx) return;
    try {
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) return;

      const source = this.audioCtx.createMediaStreamSource(new MediaStream([audioTrack]));
      const analyser = this.audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.4;
      source.connect(analyser);
      this.peerAnalysers.set(userId, analyser);
    } catch (e) {
      console.warn(`[GroupRTC] Peer ${userId} audio analyser setup failed:`, e);
    }
  }

  private startSpeakerDetection(): void {
    if (this.speakerCheckInterval) return;

    const dataArray = new Uint8Array(128);

    this.speakerCheckInterval = setInterval(() => {
      // Check local speaker level
      if (this.localAnalyser && !this.isMuted) {
        this.localAnalyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i];
        }
        const avg = sum / dataArray.length;
        const level = Math.min(100, Math.round((avg / 128) * 100));
        const isSpeaking = level > 18;
        this.notifyLocalStream(isSpeaking, level);
      }

      // Check remote peer speaker levels
      let peersChanged = false;
      for (const [userId, analyser] of this.peerAnalysers.entries()) {
        const peerState = this.peerStates.get(userId);
        if (peerState) {
          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            sum += dataArray[i];
          }
          const avg = sum / dataArray.length;
          const level = Math.min(100, Math.round((avg / 128) * 100));
          const isSpeaking = level > 18;

          if (peerState.isSpeaking !== isSpeaking || Math.abs(peerState.audioLevel - level) > 10) {
            peerState.isSpeaking = isSpeaking;
            peerState.audioLevel = level;
            peersChanged = true;
          }
        }
      }

      if (peersChanged) {
        this.notifyPeersChange();
      }
    }, 200);
  }

  /**
   * 8. Complete Teardown and Cleanup
   */
  public cleanup(): void {
    console.log('[GroupRTC] Cleaning up all group call resources...');

    if (this.speakerCheckInterval) {
      clearInterval(this.speakerCheckInterval);
      this.speakerCheckInterval = null;
    }

    for (const pc of this.peerConnections.values()) {
      try {
        pc.close();
      } catch (e) {}
    }
    this.peerConnections.clear();

    for (const state of this.peerStates.values()) {
      try {
        state.stream.getTracks().forEach((t) => t.stop());
      } catch (e) {}
    }
    this.peerStates.clear();

    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => t.stop());
      this.localStream = null;
    }

    this.localAnalyser = null;
    this.peerAnalysers.clear();

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        this.audioCtx.close().catch(() => {});
      } catch (e) {}
      this.audioCtx = null;
    }

    this.pendingCandidates.clear();
    this.notifyLocalStream(false, 0);
    this.notifyPeersChange();
  }
}

export const webrtcGroupCallService = new WebRTCGroupCallService();
