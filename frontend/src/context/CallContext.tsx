import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { soundService } from '../services/soundService';
import { webrtcVoiceService, AudioStats } from '../services/webrtcVoiceService';
import { fetchAndSetIceServers } from '../config/webrtcConfig';
import { fetchActiveCallApi } from '../api/callApi';
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
  audioStats: AudioStats | null;
  startCall: (recipient: CallParticipant, conversationId: string) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => void;
  cancelCall: () => void;
  endCall: () => void;
  toggleMute: () => void;
  toggleSpeaker: () => Promise<void>;
  testMicrophone: () => any;
  testRemoteAudio: () => any;
  permissionAlert: string | null;
  clearPermissionAlert: () => void;
  recipientPushStatus: { success?: boolean; message?: string; attempted?: number; successCount?: number; failureCount?: number } | null;
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
  const [isSpeakerOn, setIsSpeakerOn] = useState<boolean>(true);
  const [audioStats, setAudioStats] = useState<AudioStats | null>(null);
  const [permissionAlert, setPermissionAlert] = useState<string | null>(null);
  const [recipientPushStatus, setRecipientPushStatus] = useState<any>(null);

  const callDurationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const statsIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const socketRef = useRef<any>(socket);
  const isConnectedRef = useRef<boolean>(isConnected);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  useEffect(() => {
    isConnectedRef.current = isConnected;
  }, [isConnected]);

  // Sync refs with state
  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  // Clean up all resources
  const cleanupCall = useCallback(() => {
    soundService.stopAll();

    if (callDurationTimerRef.current) {
      clearInterval(callDurationTimerRef.current);
      callDurationTimerRef.current = null;
    }

    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
      statsIntervalRef.current = null;
    }

    webrtcVoiceService.cleanup();
    disableCallAudioMode();
    setIsMuted(false);
    setIsSpeakerOn(true);
    setAudioStats(null);
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

  // Transition to CONNECTED state (Strictly on genuine WebRTC connection)
  const markConnected = useCallback(
    (callId: string) => {
      if (callStateRef.current !== 'CONNECTED') {
        console.log('[WebRTC DIAGNOSTIC] 🎉 Transitioning to CONNECTED state (WebRTC transport established)!');
        callStateRef.current = 'CONNECTED';
        setCallState('CONNECTED');
        soundService.stopAll();

        // Enable Android hardware communication audio routing & loud speaker
        enableCallAudioMode();

        // Notify socket server that WebRTC audio stream is verified LIVE
        const activeSocket = socketRef.current || socket;
        if (activeSocket) {
          activeSocket.emit('call:connected', { callId });
        }

        // Start connected duration timer
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

  // Setup WebRTC Engine with Callbacks & 1-second live diagnostics polling
  const setupWebRTC = useCallback(
    (callId: string) => {
      // Start 1-second continuous diagnostics stats polling
      if (!statsIntervalRef.current) {
        statsIntervalRef.current = setInterval(async () => {
          const stats = await webrtcVoiceService.getAudioStats();
          setAudioStats(stats);
          if (callStateRef.current === 'CONNECTED' || callStateRef.current === 'CONNECTING') {
            console.log(
              `[WebRTC DIAGNOSTIC] 📊 Out: ${stats.packetsSent} pkts | In: ${stats.packetsReceived} pkts | ICE: ${stats.iceState} | PC: ${stats.connectionState} | Candidate: ${stats.selectedCandidatePair?.localCandidateType || 'none'}`
            );
          }
        }, 1000);
      }

      webrtcVoiceService.createPeerConnection(
        callId,
        // On local ICE candidate
        (candidate, traceId) => {
          const activeSocket = socketRef.current || socket;
          if (activeSocket) {
            activeSocket.emit('call:ice-candidate', { callId, candidate, traceId });
          }
        },
        // On remote track received
        (track, stream) => {
          console.log('[WebRTC DIAGNOSTIC] 📡 Remote track callback received in CallContext:', track.id);
        },
        // On connection state change
        (state, iceState) => {
          console.log(`[WebRTC DIAGNOSTIC] Connection state: ${state}, ICE state: ${iceState}`);
          if (state === 'connected' || iceState === 'connected' || iceState === 'completed') {
            markConnected(callId);
          } else if (state === 'failed' || iceState === 'failed') {
            console.error('[WebRTC DIAGNOSTIC] ❌ Call failed due to WebRTC state:', state, 'ICE:', iceState);
            soundService.playCallEndTone();
            setCallState('FAILED');
            callStateRef.current = 'FAILED';
            const activeSocket = socketRef.current || socket;
            if (activeSocket) activeSocket.emit('call:failed', { callId });
            resetToIdleAfterDelay(2500);
          }
        }
      );
    },
    [socket, markConnected, resetToIdleAfterDelay]
  );

  // Start Outgoing Voice Call
  const startCall = async (recipient: CallParticipant, conversationId: string) => {
    const activeSocket = socketRef.current || socket;
    if (!activeSocket || !isConnected || !user) {
      setPermissionAlert('Network connection required to start a call.');
      return;
    }

    if (callStateRef.current !== 'IDLE') {
      console.warn('[CallContext] Cannot initiate call: call in progress (state:', callStateRef.current, ')');
      return;
    }

    // 1. Check microphone permission
    const perm = await ensureAudioPermission();
    if (!perm.granted) {
      setPermissionAlert('Microphone permission is required to make calls.');
      if (perm.permanentlyDenied) {
        openSystemAppSettings();
      }
      return;
    }

    const tempCallId = 'call_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

    const session: CallSession = {
      callId: tempCallId,
      conversationId,
      caller: {
        _id: user._id,
        displayName: user.displayName,
        avatar: user.avatarUrl,
        username: user.username,
      },
      receiver: recipient,
      isIncoming: false,
      callType: 'voice',
      startedAt: new Date(),
    };

    setActiveCall(session);
    activeCallRef.current = session;
    setCallState('CALLING');
    callStateRef.current = 'CALLING';
    soundService.startRingbackTone();

    try {
      // 2. Refresh dynamic ICE servers & start local microphone stream
      await fetchAndSetIceServers();
      await webrtcVoiceService.startLocalMicrophone();

      // 3. Setup WebRTC PeerConnection
      setupWebRTC(tempCallId);

      // 4. Emit Call Initiation Signal to Server
      activeSocket.emit('call:initiate', {
        conversationId,
        receiverId: recipient._id,
        callType: 'voice',
      });
    } catch (err) {
      console.error('[CallContext] Start call error:', err);
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
    if (!current) return;

    console.log('[CallContext] acceptCall executing for callId:', current.callId, 'state:', callStateRef.current);
    soundService.stopAll();
    setCallState('CONNECTING');
    callStateRef.current = 'CONNECTING';

    // Auto-dismiss native Android notification immediately
    try {
      const CallPlugin = (window as any).Capacitor?.Plugins?.CallNotification;
      if (CallPlugin && typeof CallPlugin.dismissCallNotification === 'function') {
        CallPlugin.dismissCallNotification({ callId: current.callId });
      }
    } catch (e) {
      console.warn('[CallContext] Dismiss notification note:', e);
    }

    // 1. Check microphone permission
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
      // 2. Refresh dynamic ICE servers & start local microphone stream
      await fetchAndSetIceServers();
      await webrtcVoiceService.startLocalMicrophone();

      // 3. Setup WebRTC PeerConnection
      setupWebRTC(current.callId);

      // 4. Ensure socket is connected before emitting call:accept
      let activeSocket = socketRef.current || socket;
      if (activeSocket && !activeSocket.connected) {
        console.log('[CallContext] Waiting for socket connection before emitting call:accept...');
        await new Promise<void>((resolve) => {
          if (activeSocket.connected) return resolve();
          const timer = setTimeout(() => resolve(), 4000);
          activeSocket.once('connect', () => {
            clearTimeout(timer);
            resolve();
          });
        });
      }

      if (activeSocket && activeSocket.connected) {
        console.log('[CallContext] Emitting call:accept for callId:', current.callId);
        activeSocket.emit('call:accept', { callId: current.callId });
      } else {
        console.warn('[CallContext] Socket still not connected. Emitting call:accept on connect...');
        activeSocket?.once('connect', () => {
          activeSocket.emit('call:accept', { callId: current.callId });
        });
      }
    } catch (err) {
      console.error('[CallContext] Accept call error:', err);
      rejectCall();
    }
  };

  // Receiver Rejects Incoming Call
  const rejectCall = () => {
    const current = activeCallRef.current;
    const activeSocket = socketRef.current || socket;
    if (current && activeSocket) {
      activeSocket.emit('call:reject', { callId: current.callId });
    }
    soundService.playCallEndTone();
    setCallState('REJECTED');
    callStateRef.current = 'REJECTED';
    resetToIdleAfterDelay(1500);
  };

  // Caller Cancels Outgoing Call Before Answer
  const cancelCall = () => {
    const current = activeCallRef.current;
    const activeSocket = socketRef.current || socket;
    if (current && activeSocket) {
      activeSocket.emit('call:cancel', { callId: current.callId });
    }
    soundService.playCallEndTone();
    setCallState('CANCELLED');
    callStateRef.current = 'CANCELLED';
    resetToIdleAfterDelay(1500);
  };

  // Either Participant Ends Active Call
  const endCall = () => {
    const current = activeCallRef.current;
    const activeSocket = socketRef.current || socket;
    if (current && activeSocket) {
      activeSocket.emit('call:end', { callId: current.callId });
    }
    soundService.playCallEndTone();
    setCallState('ENDED');
    callStateRef.current = 'ENDED';
    resetToIdleAfterDelay(1500);
  };

  // Toggle Microphone Mute
  const toggleMute = () => {
    const nextMuted = !isMuted;
    webrtcVoiceService.setMuted(nextMuted);
    setIsMuted(nextMuted);
  };

  // Toggle Speaker / Earpiece
  const toggleSpeaker = async () => {
    const nextSpeaker = !isSpeakerOn;
    const success = await toggleNativeSpeakerphone(nextSpeaker);
    setIsSpeakerOn(nextSpeaker);
  };

  // Diagnostic Test Helpers
  const testMicrophone = () => webrtcVoiceService.testLocalMicrophone();
  const testRemoteAudio = () => webrtcVoiceService.testRemotePlayback();

  // Attach Socket.IO Signaling Listeners
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
      console.log('[Signaling] Incoming call received:', data.callId, 'from', data.caller?.displayName);

      // Deduplicate if receiver is already handling this exact call
      if (activeCallRef.current?.callId === data.callId) {
        console.log('[Signaling] Deduplicating incoming call event for active callId:', data.callId);
        return;
      }

      // If user is genuinely in another call with someone else
      if (callStateRef.current !== 'IDLE') {
        console.log('[Signaling] User busy with another call. Emitting call:busy for callId:', data.callId);
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

    // 4. Caller notified that receiver accepted -> create WebRTC Offer
    const handleCallAccepted = async (data: { callId: string }) => {
      // Guard: If this device is the receiver, never create an offer (receiver only answers)
      if (activeCallRef.current?.isIncoming) {
        console.log('[Signaling] Receiver received call:accepted acknowledgement (waiting for Caller SDP Offer)');
        return;
      }

      console.log('[Signaling] Receiver accepted call:', data.callId, 'Generating SDP Offer...');
      soundService.stopAll();
      setCallState('CONNECTING');
      callStateRef.current = 'CONNECTING';

      try {
        await fetchAndSetIceServers();
        setupWebRTC(data.callId);
        const offer = await webrtcVoiceService.createOffer();
        const activeSocket = socketRef.current || socket;
        if (activeSocket) {
          activeSocket.emit('call:offer', {
            callId: data.callId,
            sdp: offer,
          });
        }
      } catch (err) {
        console.error('[CallContext] Create offer error:', err);
        endCall();
      }
    };

    // 5. Receiver receives SDP Offer -> creates SDP Answer
    const handleCallOffer = async (data: { callId: string; sdp: any }) => {
      console.log('[Signaling] Received SDP Offer for call:', data.callId);
      try {
        await webrtcVoiceService.handleOffer(data.sdp);
        const answer = await webrtcVoiceService.createAnswer();
        const activeSocket = socketRef.current || socket;
        if (activeSocket) {
          activeSocket.emit('call:answer', {
            callId: data.callId,
            sdp: answer,
          });
        }
      } catch (err) {
        console.error('[CallContext] Handle offer / create answer error:', err);
      }
    };

    // 6. Caller receives SDP Answer
    const handleCallAnswer = async (data: { callId: string; sdp: any }) => {
      console.log('[Signaling] Received SDP Answer for call:', data.callId);
      try {
        await webrtcVoiceService.handleAnswer(data.sdp);
      } catch (err) {
        console.error('[CallContext] Handle answer error:', err);
      }
    };

    // 7. ICE Candidate Relay
    const handleIceCandidate = async (data: { callId: string; candidate: any; traceId?: string }) => {
      console.log(`[ICE_RECEIVED] callId=${data.callId} traceId=${data.traceId || 'none'}`);
      await webrtcVoiceService.addIceCandidate(data.candidate, data.traceId);
    };

    // 8. Call Connected confirmation from server (Informational; actual connection driven by WebRTC state)
    const handleCallConnected = (data: { callId: string }) => {
      console.log('[Signaling] Server confirmed call session established:', data.callId);
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
      setCallState('FAILED');
      callStateRef.current = 'FAILED';
      resetToIdleAfterDelay(2500);
    };

    // 14. Call Failed
    const handleCallFailed = (data: { message?: string }) => {
      console.log('[Signaling] Call failed:', data.message);
      soundService.playCallEndTone();
      setCallState('FAILED');
      callStateRef.current = 'FAILED';
      resetToIdleAfterDelay(2500);
    };

    // 15. Call Error
    const handleCallError = (data: { message: string }) => {
      console.warn('[Signaling] Call error:', data.message);
      setPermissionAlert(data.message || 'Call error occurred');
      soundService.playCallEndTone();
      setCallState('FAILED');
      callStateRef.current = 'FAILED';
      resetToIdleAfterDelay(2500);
    };

    // 16. Recipient Push Dispatch Status
    const handlePushStatus = (data: any) => {
      console.log('[Signaling] Received call:push_status:', data);
      if (data && data.pushResult) {
        setRecipientPushStatus(data.pushResult);
      }
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
    socket.on('call:push_status', handlePushStatus);

    // Support Push Notification / Background Incoming Call Wakeup
    const handleCustomIncomingCall = (event: any) => {
      const data = event.detail;
      if (data && (data.callId || data.type === 'incoming_call')) {
        console.log('[CallContext] Received kothahobe:incoming_call event from Push/Local notification:', data);
        if (activeCallRef.current?.callId === data.callId) {
          console.log('[CallContext] Deduplicating incoming call event for callId:', data.callId);
          return;
        }

        handleCallIncoming({
          callId: data.callId,
          conversationId: data.conversationId,
          caller: {
            _id: data.callerId || data.caller?._id || '',
            displayName: data.callerName || data.caller?.displayName || 'User',
            avatar: data.callerAvatar || data.caller?.avatar || '',
            username: data.callerUsername || data.caller?.username || '',
          },
          callType: data.callType || 'voice',
        });
      }
    };

    // Support Notification Native "ACCEPT" Action Button
    const handleCustomAcceptCall = async (event: any) => {
      const data = event.detail;
      if (data && data.callId) {
        console.log('[CallContext] Received kothahobe:accept_call action from notification:', data);
        
        // Auto-dismiss native Android notification immediately
        try {
          const CallPlugin = (window as any).Capacitor?.Plugins?.CallNotification;
          if (CallPlugin && typeof CallPlugin.dismissCallNotification === 'function') {
            CallPlugin.dismissCallNotification({ callId: data.callId });
          }
        } catch (e) {}

        const session: CallSession = {
          callId: data.callId,
          conversationId: data.conversationId,
          caller: {
            _id: data.callerId || data.caller?._id || '',
            displayName: data.callerName || data.caller?.displayName || 'User',
            avatar: data.callerAvatar || data.caller?.avatar || '',
            username: data.callerUsername || data.caller?.username || '',
          },
          receiver: { _id: user?._id || '', displayName: user?.displayName || '' },
          isIncoming: true,
          callType: data.callType || 'voice',
          startedAt: new Date(),
        };

        setActiveCall(session);
        activeCallRef.current = session;
        setCallState('RINGING');
        callStateRef.current = 'RINGING';

        await acceptCall();
      }
    };

    window.addEventListener('kothahobe:incoming_call', handleCustomIncomingCall);
    window.addEventListener('kothahobe:accept_call', handleCustomAcceptCall);

    // Proactively check if there's a live incoming call when app opens or reconnects
    if (callStateRef.current === 'IDLE') {
      fetchActiveCallApi()
        .then((res) => {
          if (
            res.success &&
            res.call &&
            res.call.isIncoming &&
            (res.call.status === 'calling' || res.call.status === 'ringing')
          ) {
            if (callStateRef.current === 'IDLE') {
              console.log('[CallContext] Restoring active incoming call from server:', res.call.callId);
              handleCallIncoming({
                callId: res.call.callId,
                conversationId: res.call.conversationId,
                caller: res.call.caller,
                callType: res.call.callType,
              });
            }
          }
        })
        .catch((e) => console.warn('[CallContext] Proactive active call check note:', e));
    }

    return () => {
      window.removeEventListener('kothahobe:incoming_call', handleCustomIncomingCall);
      window.removeEventListener('kothahobe:accept_call', handleCustomAcceptCall);
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
      socket.off('call:push_status', handlePushStatus);
    };
  }, [socket, user, setupWebRTC, markConnected, resetToIdleAfterDelay]);

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
        audioStats,
        startCall,
        acceptCall,
        rejectCall,
        cancelCall,
        endCall,
        toggleMute,
        toggleSpeaker,
        testMicrophone,
        testRemoteAudio,
        permissionAlert,
        clearPermissionAlert: () => setPermissionAlert(null),
        recipientPushStatus,
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
