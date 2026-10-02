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
  private peerAudioElements = new Map<string, HTMLAudioElement>();
  private pendingCandidates = new Map<string, RTCIceCandidateInit[]>();

  // Audio Context & Analysers for Active Speaker Detection
  private audioCtx: AudioContext | null = null;
  private localAnalyser: AnalyserNode | null = null;
  private peerAnalysers = new Map<string, AnalyserNode>();
  private speakerCheckInterval: NodeJS.Timeout | null = null;

  private isFrontCamera: boolean = true;
  private isMuted: boolean = false;
  private isVideoEnabled: boolean = true;
  private isScreenSharing: boolean = false;
  private screenStream: MediaStream | null = null;
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

  public getPeerConnection(userId: string): RTCPeerConnection | undefined {
    return this.peerConnections.get(userId);
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

  public getIsScreenSharing(): boolean {
    return this.isScreenSharing;
  }

  public isScreenShareSupported(): boolean {
    return (
      typeof navigator !== 'undefined' &&
      !!navigator.mediaDevices &&
      typeof navigator.mediaDevices.getDisplayMedia === 'function'
    );
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
      echoCancellation: { ideal: true },
      noiseSuppression: { ideal: true },
      autoGainControl: { ideal: true },
      channelCount: { ideal: 1 },
      sampleRate: { ideal: 48000 },
      googEchoCancellation: true,
      googAutoGainControl: true,
      googNoiseSuppression: true,
      googHighpassFilter: true,
      googTypingNoiseDetection: true,
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
          this.attachPeerAudio(remoteUserId, peerState.stream);
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
        this.notifyPeersChange();
      }
      if (state === 'failed') {
        console.warn(`[GroupRTC] Peer ${remoteUserId} connection failed. Attempting isolated ICE recovery...`);
        this.restartIceForPeer(remoteUserId, onSignal).catch(() => {});
      }
    };

    // ICE Connection State Change handler
    pc.oniceconnectionstatechange = () => {
      const iceState = pc.iceConnectionState;
      console.log(`[GroupRTC] Peer ${remoteUserId} ICE state: ${iceState}`);
      const peerState = this.peerStates.get(remoteUserId);
      if (peerState) {
        if (iceState === 'connected' || iceState === 'completed' || pc.connectionState === 'connected') {
          peerState.connectionState = 'connected';
          this.notifyPeersChange();
        } else if (iceState === 'disconnected' || iceState === 'failed') {
          peerState.connectionState = iceState;
          this.notifyPeersChange();
          console.warn(`[GroupRTC] Peer ${remoteUserId} ICE degraded (${iceState}). Attempting isolated ICE recovery...`);
          this.restartIceForPeer(remoteUserId, onSignal).catch(() => {});
        }
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
   * 2.1 Restart ICE for a specific degraded or disconnected peer connection
   * Non-destructive to other active peer streams in the mesh.
   */
  public async restartIceForPeer(
    remoteUserId: string,
    onSignal: (targetUserId: string, signal: any) => void
  ): Promise<boolean> {
    const pc = this.peerConnections.get(remoteUserId);
    if (!pc) {
      console.warn(`[GroupRTC] Cannot restart ICE: no PeerConnection for ${remoteUserId}`);
      return false;
    }

    try {
      console.log(`[GroupRTC] 🔄 Initiating isolated ICE restart for peer ${remoteUserId}...`);
      const offer = await pc.createOffer({
        iceRestart: true,
        offerToReceiveAudio: true,
        offerToReceiveVideo: this.callType === 'video',
      });
      await pc.setLocalDescription(offer);

      onSignal(remoteUserId, {
        type: 'offer',
        sdp: offer,
        isIceRestart: true,
      });

      console.log(`[GroupRTC] ⚡ Sent ICE restart offer to peer ${remoteUserId}`);
      return true;
    } catch (err) {
      console.error(`[GroupRTC] Failed to restart ICE for peer ${remoteUserId}:`, err);
      return false;
    }
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

          const peerState = this.peerStates.get(senderId);
          if (peerState && (pc.connectionState === 'connected' || pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed')) {
            peerState.connectionState = 'connected';
            this.notifyPeersChange();
          }
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

    this.detachPeerAudio(userId);
    this.pendingCandidates.delete(userId);
    this.notifyPeersChange();
    console.log(`[GroupRTC] Removed peer ${userId}`);
  }

  /**
   * 5. Mute / Unmute Microphone
   */
  public toggleMute(forceMute?: boolean): boolean {
    if (!this.localStream) return this.isMuted;
    this.isMuted = forceMute !== undefined ? forceMute : !this.isMuted;
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

    const targetFront = !this.isFrontCamera;
    const targetFacing = targetFront ? 'user' : 'environment';
    console.log(`[GroupRTC] 🔄 Flipping camera to ${targetFront ? 'front (user)' : 'rear (environment)'}...`);

    const oldVideoTrack = this.localStream.getVideoTracks()[0];
    if (oldVideoTrack) {
      try {
        oldVideoTrack.stop();
        this.localStream.removeTrack(oldVideoTrack);
      } catch (e) {
        console.warn('[GroupRTC] Note stopping old track:', e);
      }
    }

    let newStream: MediaStream | null = null;

    try {
      // 1. Try exact/ideal device enumeration if available
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === 'videoinput');
        if (videoDevices.length > 1) {
          const match = videoDevices.find((d) => {
            const lbl = (d.label || '').toLowerCase();
            return targetFront ? lbl.includes('front') || lbl.includes('user') : lbl.includes('back') || lbl.includes('rear') || lbl.includes('environment');
          });

          if (match && match.deviceId) {
            newStream = await navigator.mediaDevices.getUserMedia({
              video: {
                deviceId: { exact: match.deviceId },
                width: { ideal: 640, max: 1280 },
                height: { ideal: 480, max: 720 },
              },
            });
          }
        }
      } catch (enumErr) {
        console.warn('[GroupRTC] Device enumeration fallback:', enumErr);
      }

      // 2. Fallback to facingMode constraint
      if (!newStream) {
        try {
          newStream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: { ideal: targetFacing },
              width: { ideal: 640, max: 1280 },
              height: { ideal: 480, max: 720 },
            },
          });
        } catch {
          newStream = await navigator.mediaDevices.getUserMedia({
            video: {
              facingMode: targetFacing,
            },
          });
        }
      }

      const newVideoTrack = newStream.getVideoTracks()[0];
      if (!newVideoTrack) throw new Error('No video track found in switched camera stream');

      newVideoTrack.enabled = this.isVideoEnabled;
      this.localStream.addTrack(newVideoTrack);
      this.isFrontCamera = targetFront;

      // Replace video track in all active peer connections
      for (const pc of this.peerConnections.values()) {
        try {
          let replaced = false;
          const transceivers = pc.getTransceivers ? pc.getTransceivers() : [];
          for (const tr of transceivers) {
            if (tr.sender && (tr.sender.track?.kind === 'video' || tr.receiver?.track?.kind === 'video')) {
              await tr.sender.replaceTrack(newVideoTrack);
              replaced = true;
              break;
            }
          }
          if (!replaced) {
            const senders = pc.getSenders();
            const videoSender = senders.find((s) => s.track?.kind === 'video' || (s as any).kind === 'video');
            if (videoSender) {
              await videoSender.replaceTrack(newVideoTrack);
            }
          }
        } catch (pcErr) {
          console.warn('[GroupRTC] Error replacing track on peer:', pcErr);
        }
      }

      this.notifyLocalStream();
      return this.isFrontCamera;
    } catch (err) {
      console.error('[GroupRTC] switchCamera error:', err);
      // Recovery fallback
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const fallbackTrack = fallbackStream.getVideoTracks()[0];
        if (fallbackTrack) {
          fallbackTrack.enabled = this.isVideoEnabled;
          this.localStream.addTrack(fallbackTrack);
          for (const pc of this.peerConnections.values()) {
            const vs = pc.getSenders().find((s) => s.track?.kind === 'video');
            if (vs) await vs.replaceTrack(fallbackTrack);
          }
          this.notifyLocalStream();
        }
      } catch {}
      return this.isFrontCamera;
    }
  }

  /**
   * 8. Start Screen Sharing in Group Call Mesh
   */
  public async startScreenShare(): Promise<MediaStreamTrack | null> {
    if (!this.isScreenShareSupported()) {
      console.warn('[GroupRTC] Screen sharing is not supported in this environment');
      return null;
    }

    if (this.isScreenSharing && this.screenStream) {
      return this.screenStream.getVideoTracks()[0] || null;
    }

    console.log('[GroupRTC] 🖥️ Requesting screen share display stream...');
    try {
      const displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      const screenTrack = displayStream.getVideoTracks()[0];
      if (!screenTrack) throw new Error('No screen video track acquired');

      this.screenStream = displayStream;
      this.isScreenSharing = true;

      screenTrack.onended = () => {
        console.log('[GroupRTC] 🖥️ Screen sharing ended by user (native UI)');
        this.stopScreenShare();
      };

      // Replace video track in all active peer connections
      for (const pc of this.peerConnections.values()) {
        const senders = pc.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(screenTrack);
        }
      }

      if (this.localStream) {
        const oldTracks = this.localStream.getVideoTracks();
        oldTracks.forEach((t) => this.localStream?.removeTrack(t));
        this.localStream.addTrack(screenTrack);
      }

      this.notifyLocalStream();
      return screenTrack;
    } catch (err) {
      console.warn('[GroupRTC] startScreenShare error:', err);
      this.isScreenSharing = false;
      this.screenStream = null;
      return null;
    }
  }

  /**
   * 9. Stop Screen Sharing and restore camera feed in Group Call Mesh
   */
  public async stopScreenShare(): Promise<void> {
    if (!this.isScreenSharing && !this.screenStream) return;
    console.log('[GroupRTC] 🖥️ Stopping screen share and restoring camera feed...');

    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
    }
    this.isScreenSharing = false;

    try {
      let cameraStream: MediaStream;
      if (this.isVideoEnabled && this.callType === 'video') {
        cameraStream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: this.isFrontCamera ? 'user' : 'environment',
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
          },
        });
      } else {
        cameraStream = new MediaStream();
      }

      const cameraTrack = cameraStream.getVideoTracks()[0] || null;

      for (const pc of this.peerConnections.values()) {
        const senders = pc.getSenders();
        const videoSender = senders.find((s) => s.track && s.track.kind === 'video');
        if (videoSender) {
          await videoSender.replaceTrack(cameraTrack);
        }
      }

      if (this.localStream) {
        const oldTracks = this.localStream.getVideoTracks();
        oldTracks.forEach((t) => {
          t.stop();
          this.localStream?.removeTrack(t);
        });
        if (cameraTrack) {
          this.localStream.addTrack(cameraTrack);
        }
      }

      this.notifyLocalStream();
    } catch (err) {
      console.warn('[GroupRTC] Failed restoring camera after screen share:', err);
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
   * 7b. Dedicated background audio playback per remote peer
   */
  public attachPeerAudio(userId: string, stream: MediaStream): void {
    try {
      let audio = this.peerAudioElements.get(userId);
      if (!audio) {
        audio = document.getElementById(`kothahobe-group-audio-${userId}`) as HTMLAudioElement;
      }
      if (!audio) {
        audio = document.createElement('audio');
        audio.id = `kothahobe-group-audio-${userId}`;
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
      }
      audio.srcObject = stream;
      audio.muted = false;
      audio.volume = 1.0;
      this.peerAudioElements.set(userId, audio);
      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((err) => {
          console.warn(`[GroupRTC] Peer ${userId} audio play note:`, err);
        });
      }
    } catch (err) {
      console.warn(`[GroupRTC] Error attaching peer audio for ${userId}:`, err);
    }
  }

  public detachPeerAudio(userId: string): void {
    const audio = this.peerAudioElements.get(userId);
    if (audio) {
      try {
        audio.pause();
        audio.srcObject = null;
        if (audio.parentNode) {
          audio.parentNode.removeChild(audio);
        }
      } catch (e) {}
      this.peerAudioElements.delete(userId);
    }
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

    if (this.screenStream) {
      this.screenStream.getTracks().forEach((t) => t.stop());
      this.screenStream = null;
    }
    this.isScreenSharing = false;

    this.localAnalyser = null;
    this.peerAnalysers.clear();

    if (this.audioCtx && this.audioCtx.state !== 'closed') {
      try {
        this.audioCtx.close().catch(() => {});
      } catch (e) {}
      this.audioCtx = null;
    }

    for (const userId of Array.from(this.peerAudioElements.keys())) {
      this.detachPeerAudio(userId);
    }
    this.peerAudioElements.clear();

    this.pendingCandidates.clear();
    this.notifyLocalStream(false, 0);
    this.notifyPeersChange();
  }
}

export const webrtcGroupCallService = new WebRTCGroupCallService();
