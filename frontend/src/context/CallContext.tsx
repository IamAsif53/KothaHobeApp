import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { getWebRTCConfig } from '../config/webrtcConfig';
import { soundService } from '../services/soundService';
import {
  ensureAudioPermission,
  openSystemAppSettings,
  enableCallAudioMode,
  disableCallAudioMode,
  toggleNativeSpeakerphone,
  getNativeSpeakerphoneStatus,
} from '../services/nativeMediaService';

export type CallState =
  | 'IDLE'
  | 'CALLING'
  | 'RINGING'
  | 'ACCEPTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'ENDED'
  | 'REJECTED'
  | 'CANCELLED'
  | 'BUSY'
  | 'FAILED';

export interface CallParticipant {
  _id: string;
  displayName: string;
  avatar?: string;
  avatarUrl?: string;
  username?: string;
}

export interface CallSession {
  callId: string;
  conversationId: string;
  caller: CallParticipant;
  receiver: CallParticipant;
  isIncoming: boolean;
  callType: 'voice' | 'video';
  startedAt: Date;
  connectedAt?: Date;
}

interface CallContextType {
  callState: CallState;
  activeCall: CallSession | null;
  callDuration: number;
  isMuted: boolean;
  isSpeakerOn: boolean;
  startCall: (recipient: CallParticipant, conversationId: string) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  cancelCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleSpeaker: () => Promise<void>;
  permissionAlert: string | null;
  clearPermissionAlert: () => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { socket, isConnected } = useSocket();
  const { user } = useAuth();

  const [callState, setCallState] = useState<CallState>('IDLE');
  const callStateRef = useRef<CallState>('IDLE');
  const [activeCall, setActiveCall] = useState<CallSession | null>(null);
  const activeCallRef = useRef<CallSession | null>(null);
  const [callDuration, setCallDuration] = useState<number>(0);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isSpeakerOn, setIsSpeakerOn] = useState<boolean>(false);
  const [permissionAlert, setPermissionAlert] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const callDurationTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Sync refs with state
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  // Clean up all WebRTC resources and audio tracks
  const cleanupCall = useCallback(() => {
    soundService.stopAll();

    if (callDurationTimerRef.current) {
      clearInterval(callDurationTimerRef.current);
      callDurationTimerRef.current = null;
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    }

    if (pcRef.current) {
      try {
        pcRef.current.onicecandidate = null;
        pcRef.current.ontrack = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.oniceconnectionstatechange = null;
        pcRef.current.close();
      } catch (e) {
        // Ignore close error
      }
      pcRef.current = null;
    }

    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    pendingIceCandidatesRef.current = [];
    disableCallAudioMode();
    setIsMuted(false);
    setIsSpeakerOn(false);
  }, []);

  // Reset to IDLE after showing transient state (e.g. Call Ended, User Busy)
  const resetToIdleAfterDelay = useCallback(
    (delayMs = 2000) => {
      setTimeout(() => {
        setCallState('IDLE');
        callStateRef.current = 'IDLE';
        setActiveCall(null);
        activeCallRef.current = null;
        setCallDuration(0);
        cleanupCall();
      }, delayMs);
    },
    [cleanupCall]
  );

  // Mark Call as CONNECTED
  const markConnected = useCallback(
    (callId: string) => {
      if (callStateRef.current !== 'CONNECTED') {
        console.log('[WebRTC] Voice call CONNECTED successfully!');
        callStateRef.current = 'CONNECTED';
        setCallState('CONNECTED');
        soundService.stopAll();
        enableCallAudioMode();

        // Notify socket server
        if (socket) {
          socket.emit('call:connected', { callId });
        }

        // Start duration timer
        if (!callDurationTimerRef.current) {
          setCallDuration(0);
          callDurationTimerRef.current = setInterval(() => {
            setCallDuration((prev) => prev + 1);
          }, 1000);
        }
      }
    },
    [socket]
  );

  // Handle WebRTC Peer Connection setup
  const createPeerConnection = useCallback(
    (callId: string): RTCPeerConnection => {
      if (pcRef.current) {
        try {
          pcRef.current.close();
        } catch (e) {}
        pcRef.current = null;
      }

      const config = getWebRTCConfig();
      console.log('[WebRTC] Initializing RTCPeerConnection with STUN servers:', config.iceServers);
      const pc = new RTCPeerConnection(config);
      pcRef.current = pc;

      // 1. ICE Candidate Relay
      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          socket.emit('call:ice-candidate', {
            callId,
            candidate: event.candidate.toJSON(),
          });
        }
      };

      // 2. Remote Audio Track Received
      pc.ontrack = (event) => {
        console.log('[WebRTC] Remote audio track received:', event.track.kind);
        if (event.streams && event.streams[0]) {
          if (!remoteAudioRef.current) {
            const audio = document.createElement('audio');
            audio.autoplay = true;
            audio.setAttribute('playsinline', 'true');
            (audio as any).playsInline = true;
            remoteAudioRef.current = audio;
            document.body.appendChild(audio);
          }
          remoteAudioRef.current.srcObject = event.streams[0];
          remoteAudioRef.current.play().then(() => {
            console.log('[WebRTC] Remote audio output playing');
            markConnected(callId);
          }).catch((err) => {
            console.warn('[WebRTC] Remote audio play error:', err);
          });
        }
      };

      // 3. WebRTC Connection State Machine
      pc.onconnectionstatechange = () => {
        console.log('[WebRTC] PeerConnection State:', pc.connectionState);
        if (pc.connectionState === 'connected') {
          markConnected(callId);
        } else if (pc.connectionState === 'failed') {
          console.warn('[WebRTC] Connection failed, attempting ICE restart...');
          try {
            pc.restartIce();
          } catch (e) {
            soundService.playCallEndTone();
            setCallState('FAILED');
            callStateRef.current = 'FAILED';
            if (socket) socket.emit('call:failed', { callId });
            resetToIdleAfterDelay(2500);
          }
        } else if (pc.connectionState === 'closed') {
          cleanupCall();
        }
      };

      // 4. ICE Connection State Monitoring
      pc.oniceconnectionstatechange = () => {
        console.log('[WebRTC] ICE Connection State:', pc.iceConnectionState);
        if (
          pc.iceConnectionState === 'connected' ||
          pc.iceConnectionState === 'completed'
        ) {
          markConnected(callId);
        } else if (pc.iceConnectionState === 'failed') {
          console.warn('[WebRTC] ICE failed, attempting restart...');
          try {
            pc.restartIce();
          } catch (e) {
            console.error('[WebRTC] ICE restart failed:', e);
          }
        }
      };

      return pc;
    },
    [socket, markConnected, resetToIdleAfterDelay, cleanupCall]
  );

  // Request Microphone Stream with Acoustic Processing
  const getMicrophoneAudioStream = async (): Promise<MediaStream> => {
    try {
      // First try with full hardware AEC / NS / AGC
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video: false,
      });
      localStreamRef.current = stream;
      return stream;
    } catch (err: any) {
      console.warn('[WebRTC] Advanced audio constraints failed, trying basic audio: true fallback...', err);
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: false,
        });
        localStreamRef.current = fallbackStream;
        return fallbackStream;
      } catch (fallbackErr: any) {
        console.error('[WebRTC] Microphone getUserMedia fatal error:', fallbackErr);
        throw fallbackErr;
      }
    }
  };

  // Start Outgoing Voice Call
  const startCall = async (recipient: CallParticipant, conversationId: string) => {
    if (!socket || !isConnected || !user) {
      setPermissionAlert('Network connection required to start a call.');
      return;
    }

    if (callStateRef.current !== 'IDLE') {
      console.warn('[Call] Cannot initiate call: call already in progress (state:', callStateRef.current, ')');
      return;
    }

    // 1. Verify Microphone Permission
    const perm = await ensureAudioPermission();
    if (!perm.granted) {
      setPermissionAlert(
        perm.permanentlyDenied
          ? 'Microphone permission is permanently disabled. Please enable it in Android Settings to make voice calls.'
          : 'Microphone permission is required to start a voice call.'
      );
      if (perm.permanentlyDenied) {
        openSystemAppSettings();
      }
      return;
    }

    try {
      // 2. Prepare Local Audio Stream
      const stream = await getMicrophoneAudioStream();

      // 3. Set Outgoing Call State
      const newSession: CallSession = {
        callId: '',
        conversationId,
        caller: {
          _id: user._id,
          displayName: user.displayName,
          avatar: user.avatarUrl,
        },
        receiver: recipient,
        isIncoming: false,
        callType: 'voice',
        startedAt: new Date(),
      };

      setActiveCall(newSession);
      activeCallRef.current = newSession;
      setCallState('CALLING');
      callStateRef.current = 'CALLING';
      soundService.startRingbackTone();

      // 4. Send Initiation to Socket.IO Signaling
      socket.emit('call:initiate', {
        conversationId,
        receiverId: recipient._id,
        callType: 'voice',
      });
    } catch (err: any) {
      console.error('[Call] Start call error:', err);
      soundService.stopAll();
      setCallState('IDLE');
      callStateRef.current = 'IDLE';
      setActiveCall(null);
      activeCallRef.current = null;
      setPermissionAlert('Could not access microphone for call.');
    }
  };

  // Receiver Accepts Incoming Call
  const acceptCall = async () => {
    const current = activeCallRef.current;
    if (!current || !socket || callStateRef.current !== 'RINGING') return;

    soundService.stopAll();
    setCallState('CONNECTING');
    callStateRef.current = 'CONNECTING';

    // 1. Verify Microphone Permission
    const perm = await ensureAudioPermission();
    if (!perm.granted) {
      setPermissionAlert('Microphone permission is required to accept call.');
      if (perm.permanentlyDenied) {
        openSystemAppSettings();
      }
      rejectCall();
      return;
    }

    try {
      // 2. Capture Microphone Stream
      const stream = await getMicrophoneAudioStream();

      // 3. Create WebRTC Peer Connection
      const pc = createPeerConnection(current.callId);
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // 4. Emit Call Accepted Signal to Caller
      socket.emit('call:accept', { callId: current.callId });
    } catch (err) {
      console.error('[Call] Accept call error:', err);
      rejectCall();
    }
  };

  // Receiver Rejects Incoming Call
  const rejectCall = () => {
    const current = activeCallRef.current;
    if (current && socket) {
      socket.emit('call:reject', { callId: current.callId });
    }
    soundService.playCallEndTone();
    setCallState('REJECTED');
    callStateRef.current = 'REJECTED';
    resetToIdleAfterDelay(1500);
  };

  // Caller Cancels Outgoing Call Before Answer
  const cancelCall = () => {
    const current = activeCallRef.current;
    if (current && socket) {
      socket.emit('call:cancel', { callId: current.callId });
    }
    soundService.playCallEndTone();
    setCallState('CANCELLED');
    callStateRef.current = 'CANCELLED';
    resetToIdleAfterDelay(1500);
  };

  // Either Participant Ends Connected / Ongoing Call
  const endCall = () => {
    const current = activeCallRef.current;
    if (current && socket) {
      socket.emit('call:end', { callId: current.callId });
    }
    soundService.playCallEndTone();
    setCallState('ENDED');
    callStateRef.current = 'ENDED';
    resetToIdleAfterDelay(2000);
  };

  // Toggle Microphone Mute
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        const nextMuted = !isMuted;
        audioTrack.enabled = !nextMuted;
        setIsMuted(nextMuted);
      }
    }
  };

  // Toggle Physical Loudspeaker
  const toggleSpeaker = async () => {
    const nextSpeaker = !isSpeakerOn;
    const success = await toggleNativeSpeakerphone(nextSpeaker);
    setIsSpeakerOn(nextSpeaker);
  };

  // Attach Socket.IO Call Signaling Listeners
  useEffect(() => {
    if (!socket) return;

    // 1. Caller receives acknowledgment from server with generated callId
    const handleCallInitiated = (data: { callId: string; conversationId: string; receiver: any }) => {
      console.log('[Signaling] Call initiated on server:', data.callId);
      setActiveCall((prev) => (prev ? { ...prev, callId: data.callId } : prev));
      if (activeCallRef.current) {
        activeCallRef.current.callId = data.callId;
      }
    };

    // 2. Receiver gets incoming call
    const handleCallIncoming = (data: { callId: string; conversationId: string; caller: CallParticipant; callType: 'voice' | 'video' }) => {
      console.log('[Signaling] Incoming call received:', data.callId, 'from', data.caller.displayName);
      if (callStateRef.current !== 'IDLE') {
        socket.emit('call:busy', { callId: data.callId });
        return;
      }

      const session: CallSession = {
        callId: data.callId,
        conversationId: data.conversationId,
        caller: data.caller,
        receiver: { _id: user?._id || '', displayName: user?.displayName || '' },
        isIncoming: true,
        callType: data.callType || 'voice',
        startedAt: new Date(),
      };

      setActiveCall(session);
      activeCallRef.current = session;
      setCallState('RINGING');
      callStateRef.current = 'RINGING';
      soundService.startRingtone();

      // Send ringing acknowledgment back to caller
      socket.emit('call:ringing', { callId: data.callId });
    };

    // 3. Caller hears receiver ringing
    const handleCallRinging = (data: { callId: string }) => {
      console.log('[Signaling] Receiver device is ringing:', data.callId);
      if (callStateRef.current === 'CALLING') {
        setCallState('RINGING');
        callStateRef.current = 'RINGING';
      }
    };

    // 4. Caller notified that receiver accepted -> start WebRTC Offer
    const handleCallAccepted = async (data: { callId: string }) => {
      console.log('[Signaling] Receiver accepted call:', data.callId, 'Starting WebRTC Offer...');
      soundService.stopAll();
      setCallState('CONNECTING');
      callStateRef.current = 'CONNECTING';

      try {
        const pc = createPeerConnection(data.callId);

        // Attach local microphone audio track to PeerConnection
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => {
            pc.addTrack(track, localStreamRef.current!);
          });
        }

        // Create SDP Offer
        const offer = await pc.createOffer({
          offerToReceiveAudio: true,
          offerToReceiveVideo: false,
        });
        await pc.setLocalDescription(offer);

        socket.emit('call:offer', {
          callId: data.callId,
          sdp: offer,
        });
      } catch (err) {
        console.error('[WebRTC] Create offer error:', err);
        endCall();
      }
    };

    // 5. Receiver receives SDP Offer -> creates SDP Answer
    const handleCallOffer = async (data: { callId: string; sdp: any }) => {
      console.log('[Signaling] Received SDP Offer for call:', data.callId);
      const pc = pcRef.current;
      if (!pc) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

        // Flush any buffered ICE candidates that arrived before remoteDescription
        while (pendingIceCandidatesRef.current.length > 0) {
          const candidate = pendingIceCandidatesRef.current.shift();
          if (candidate) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
              console.warn('[WebRTC] Add pending ICE candidate note:', e);
            }
          }
        }

        // Create SDP Answer
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        socket.emit('call:answer', {
          callId: data.callId,
          sdp: answer,
        });
      } catch (err) {
        console.error('[WebRTC] Set offer / create answer error:', err);
      }
    };

    // 6. Caller receives SDP Answer
    const handleCallAnswer = async (data: { callId: string; sdp: any }) => {
      console.log('[Signaling] Received SDP Answer for call:', data.callId);
      const pc = pcRef.current;
      if (!pc) return;

      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

        // Flush any buffered ICE candidates
        while (pendingIceCandidatesRef.current.length > 0) {
          const candidate = pendingIceCandidatesRef.current.shift();
          if (candidate) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
              console.warn('[WebRTC] Add pending ICE candidate note:', e);
            }
          }
        }
      } catch (err) {
        console.error('[WebRTC] Set remote answer error:', err);
      }
    };

    // 7. ICE Candidate Exchange
    const handleIceCandidate = async (data: { callId: string; candidate: any }) => {
      const pc = pcRef.current;
      if (!pc) return;

      try {
        if (pc.remoteDescription && pc.remoteDescription.type) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        } else {
          // Buffer candidate until remote description is ready
          pendingIceCandidatesRef.current.push(data.candidate);
        }
      } catch (err) {
        console.warn('[WebRTC] Add ICE candidate note:', err);
      }
    };

    // 8. Call Connected notification from server
    const handleCallConnected = (data: { callId: string }) => {
      console.log('[Signaling] Server confirmed call connected:', data.callId);
      markConnected(data.callId);
    };

    // 9. Call Rejection
    const handleCallRejected = () => {
      console.log('[Signaling] Call was rejected by recipient');
      soundService.playCallEndTone();
      setCallState('REJECTED');
      callStateRef.current = 'REJECTED';
      resetToIdleAfterDelay(2000);
    };

    // 10. Call Cancellation
    const handleCallCancelled = () => {
      console.log('[Signaling] Call was cancelled by caller');
      soundService.playCallEndTone();
      setCallState('CANCELLED');
      callStateRef.current = 'CANCELLED';
      resetToIdleAfterDelay(2000);
    };

    // 11. Call Ended
    const handleCallEnded = (data: { duration: number }) => {
      console.log('[Signaling] Call ended. Total duration:', data.duration);
      soundService.playCallEndTone();
      setCallState('ENDED');
      callStateRef.current = 'ENDED';
      resetToIdleAfterDelay(2000);
    };

    // 12. Recipient Busy
    const handleCallBusy = (data: { message?: string }) => {
      console.log('[Signaling] Recipient is busy:', data.message);
      soundService.playCallEndTone();
      setCallState('BUSY');
      callStateRef.current = 'BUSY';
      resetToIdleAfterDelay(2500);
    };

    // 13. Call Timeout (Missed Call)
    const handleCallTimeout = () => {
      console.log('[Signaling] Call timed out (missed call)');
      soundService.playCallEndTone();
      setCallState('ENDED');
      callStateRef.current = 'ENDED';
      resetToIdleAfterDelay(2000);
    };

    // 14. Call Failed
    const handleCallFailed = () => {
      console.log('[Signaling] Call connection failed');
      soundService.playCallEndTone();
      setCallState('FAILED');
      callStateRef.current = 'FAILED';
      resetToIdleAfterDelay(2500);
    };

    // 15. Call Error
    const handleCallError = (data: { message?: string }) => {
      console.error('[Signaling] Call error:', data.message);
      soundService.playCallEndTone();
      setPermissionAlert(data.message || 'Call failed.');
      setCallState('FAILED');
      callStateRef.current = 'FAILED';
      resetToIdleAfterDelay(2500);
    };

    socket.on('call:initiated', handleCallInitiated);
    socket.on('call:incoming', handleCallIncoming);
    socket.on('call:ringing', handleCallRinging);
    socket.on('call:accepted', handleCallAccepted);
    socket.on('call:connected', handleCallConnected);
    socket.on('call:offer', handleCallOffer);
    socket.on('call:answer', handleCallAnswer);
    socket.on('call:ice-candidate', handleIceCandidate);
    socket.on('call:rejected', handleCallRejected);
    socket.on('call:cancelled', handleCallCancelled);
    socket.on('call:ended', handleCallEnded);
    socket.on('call:busy', handleCallBusy);
    socket.on('call:timeout', handleCallTimeout);
    socket.on('call:failed', handleCallFailed);
    socket.on('call:error', handleCallError);

    return () => {
      socket.off('call:initiated', handleCallInitiated);
      socket.off('call:incoming', handleCallIncoming);
      socket.off('call:ringing', handleCallRinging);
      socket.off('call:accepted', handleCallAccepted);
      socket.off('call:connected', handleCallConnected);
      socket.off('call:offer', handleCallOffer);
      socket.off('call:answer', handleCallAnswer);
      socket.off('call:ice-candidate', handleIceCandidate);
      socket.off('call:rejected', handleCallRejected);
      socket.off('call:cancelled', handleCallCancelled);
      socket.off('call:ended', handleCallEnded);
      socket.off('call:busy', handleCallBusy);
      socket.off('call:timeout', handleCallTimeout);
      socket.off('call:failed', handleCallFailed);
      socket.off('call:error', handleCallError);
    };
  }, [socket, user, createPeerConnection, markConnected, resetToIdleAfterDelay]);

  // Clean up on component unmount
  useEffect(() => {
    return () => {
      cleanupCall();
    };
  }, [cleanupCall]);

  return (
    <CallContext.Provider
      value={{
        callState,
        activeCall,
        callDuration,
        isMuted,
        isSpeakerOn,
        startCall,
        acceptCall,
        rejectCall,
        cancelCall,
        endCall,
        toggleMute,
        toggleSpeaker,
        permissionAlert,
        clearPermissionAlert: () => setPermissionAlert(null),
      }}
    >
      {children}
    </CallContext.Provider>
  );
};

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
};
