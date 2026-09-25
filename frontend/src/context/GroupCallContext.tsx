import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { useSocket } from './SocketContext';
import { useAuth } from './AuthContext';
import { soundService } from '../services/soundService';
import { webrtcGroupCallService, RemotePeerState } from '../services/webrtcGroupCallService';
import { fetchAndSetIceServers } from '../config/webrtcConfig';
import { IUser, IActiveGroupCallState } from '../types';
import {
  ensureAudioPermission,
  ensureCameraPermission,
  enableCallAudioMode,
  disableCallAudioMode,
  toggleNativeSpeakerphone,
} from '../services/nativeMediaService';

export interface GroupCallSession {
  callId: string;
  conversationId: string;
  groupName: string;
  groupAvatar?: string;
  callType: 'voice' | 'video';
  startedAt: Date;
  allParticipants: IUser[];
}

export interface IncomingGroupCallInfo {
  callId: string;
  conversationId: string;
  groupName: string;
  groupAvatar?: string;
  callType: 'voice' | 'video';
  caller: IUser;
}

interface GroupCallContextType {
  isGroupCallActive: boolean;
  groupCallSession: GroupCallSession | null;
  incomingGroupCall: IncomingGroupCallInfo | null;
  activeBanners: Map<string, IActiveGroupCallState>;
  localStream: MediaStream | null;
  isLocalSpeaking: boolean;
  localAudioLevel: number;
  remotePeers: Map<string, RemotePeerState>;
  isMuted: boolean;
  isVideoEnabled: boolean;
  isFrontCamera: boolean;
  isSpeakerOn: boolean;
  callDuration: number;
  startGroupCall: (conversationId: string, groupName: string, groupAvatar?: string, callType?: 'voice' | 'video') => Promise<void>;
  joinGroupCall: (callId: string, conversationId: string, groupName: string, groupAvatar?: string, callType?: 'voice' | 'video') => Promise<void>;
  leaveGroupCall: () => void;
  acceptIncomingGroupCall: () => Promise<void>;
  declineIncomingGroupCall: () => void;
  toggleMute: () => void;
  toggleVideo: () => void;
  switchCamera: () => Promise<void>;
  toggleSpeaker: () => Promise<void>;
}

const GroupCallContext = createContext<GroupCallContextType | undefined>(undefined);

export const GroupCallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { socket, isConnected } = useSocket();
  const { user } = useAuth();

  const [isGroupCallActive, setIsGroupCallActive] = useState<boolean>(false);
  const [groupCallSession, setGroupCallSession] = useState<GroupCallSession | null>(null);
  const groupCallSessionRef = useRef<GroupCallSession | null>(null);

  const [incomingGroupCall, setIncomingGroupCall] = useState<IncomingGroupCallInfo | null>(null);
  const [activeBanners, setActiveBanners] = useState<Map<string, IActiveGroupCallState>>(new Map());

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isLocalSpeaking, setIsLocalSpeaking] = useState<boolean>(false);
  const [localAudioLevel, setLocalAudioLevel] = useState<number>(0);
  const [remotePeers, setRemotePeers] = useState<Map<string, RemotePeerState>>(new Map());

  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isVideoEnabled, setIsVideoEnabled] = useState<boolean>(true);
  const [isFrontCamera, setIsFrontCamera] = useState<boolean>(true);
  const [isSpeakerOn, setIsSpeakerOn] = useState<boolean>(true);
  const [callDuration, setCallDuration] = useState<number>(0);

  const durationTimerRef = useRef<NodeJS.Timeout | null>(null);
  const socketRef = useRef<any>(socket);

  useEffect(() => {
    socketRef.current = socket;
  }, [socket]);

  useEffect(() => {
    groupCallSessionRef.current = groupCallSession;
  }, [groupCallSession]);

  // Subscribe to WebRTC Group Media Engine
  useEffect(() => {
    const unsubPeers = webrtcGroupCallService.subscribePeersChange((peers) => {
      setRemotePeers(peers);
    });

    const unsubLocal = webrtcGroupCallService.subscribeLocalStream((stream, isSpeaking, level) => {
      setLocalStream(stream);
      setIsLocalSpeaking(isSpeaking);
      setLocalAudioLevel(level);
    });

    return () => {
      unsubPeers();
      unsubLocal();
    };
  }, []);

  // Duration Timer
  const startDurationTimer = useCallback(() => {
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);
    setCallDuration(0);
    const start = Date.now();
    durationTimerRef.current = setInterval(() => {
      setCallDuration(Math.floor((Date.now() - start) / 1000));
    }, 1000);
  }, []);

  const stopDurationTimer = useCallback(() => {
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    setCallDuration(0);
  }, []);

  // Teardown / Cleanup
  const cleanupCall = useCallback(() => {
    console.log('[GroupCallContext] Cleaning up group call state');
    soundService.stopAll();
    stopDurationTimer();
    webrtcGroupCallService.cleanup();
    setIsGroupCallActive(false);
    setGroupCallSession(null);
    setIsMuted(false);
    setIsVideoEnabled(true);
    disableCallAudioMode();
  }, [stopDurationTimer]);

  // 1. Start a New Group Call
  const startGroupCall = useCallback(
    async (conversationId: string, groupName: string, groupAvatar?: string, callType: 'voice' | 'video' = 'voice') => {
      if (!socketRef.current || !conversationId) return;

      // Audio/Camera Permissions
      const audioGranted = await ensureAudioPermission();
      if (!audioGranted) {
        alert('Microphone permission is required to start a call.');
        return;
      }

      if (callType === 'video') {
        const videoGranted = await ensureCameraPermission();
        if (!videoGranted) {
          alert('Camera permission is required for video calls.');
          return;
        }
      }

      await fetchAndSetIceServers();

      try {
        await webrtcGroupCallService.startLocalMedia(callType, true);
        enableCallAudioMode();

        setGroupCallSession({
          callId: `initiating_${Date.now()}`,
          conversationId,
          groupName,
          groupAvatar,
          callType,
          startedAt: new Date(),
          allParticipants: user ? [user] : [],
        });

        socketRef.current.emit('group_call:initiate', {
          conversationId,
          callType,
        });

        setIsGroupCallActive(true);
        setIsVideoEnabled(callType === 'video');
        setIsFrontCamera(true);
        setIsSpeakerOn(true);
        startDurationTimer();
      } catch (err: any) {
        console.error('[GroupCallContext] Failed to start group call:', err);
        cleanupCall();
      }
    },
    [cleanupCall, startDurationTimer, user]
  );

  // 2. Join an Existing Active Group Call
  const joinGroupCall = useCallback(
    async (callId: string, conversationId: string, groupName: string, groupAvatar?: string, callType: 'voice' | 'video' = 'voice') => {
      if (!socketRef.current || !callId) return;

      const audioGranted = await ensureAudioPermission();
      if (!audioGranted) {
        alert('Microphone permission is required.');
        return;
      }

      if (callType === 'video') {
        const videoGranted = await ensureCameraPermission();
        if (!videoGranted) {
          alert('Camera permission is required.');
          return;
        }
      }

      await fetchAndSetIceServers();

      try {
        await webrtcGroupCallService.startLocalMedia(callType, true);
        enableCallAudioMode();

        socketRef.current.emit('group_call:join', { callId });

        setGroupCallSession({
          callId,
          conversationId,
          groupName,
          groupAvatar,
          callType,
          startedAt: new Date(),
          allParticipants: [],
        });

        setIsGroupCallActive(true);
        setIsVideoEnabled(callType === 'video');
        setIsFrontCamera(true);
        setIsSpeakerOn(true);
        startDurationTimer();
      } catch (err: any) {
        console.error('[GroupCallContext] Failed to join group call:', err);
        cleanupCall();
      }
    },
    [cleanupCall, startDurationTimer]
  );

  // 3. Leave Current Group Call
  const leaveGroupCall = useCallback(() => {
    const current = groupCallSessionRef.current;
    if (socketRef.current && current?.callId) {
      socketRef.current.emit('group_call:leave', { callId: current.callId });
    }
    cleanupCall();
  }, [cleanupCall]);

  // 4. Accept Incoming Group Call
  const acceptIncomingGroupCall = useCallback(async () => {
    if (!incomingGroupCall) return;
    const { callId, conversationId, groupName, groupAvatar, callType } = incomingGroupCall;
    soundService.stopAll();
    setIncomingGroupCall(null);
    await joinGroupCall(callId, conversationId, groupName, groupAvatar, callType);
  }, [incomingGroupCall, joinGroupCall]);

  // 5. Decline Incoming Group Call
  const declineIncomingGroupCall = useCallback(() => {
    soundService.stopAll();
    setIncomingGroupCall(null);
  }, []);

  // 6. Media Controls
  const toggleMute = useCallback(() => {
    const muted = webrtcGroupCallService.toggleMute();
    setIsMuted(muted);
  }, []);

  const toggleVideo = useCallback(() => {
    const enabled = webrtcGroupCallService.toggleVideo();
    setIsVideoEnabled(enabled);
  }, []);

  const switchCamera = useCallback(async () => {
    const isFront = await webrtcGroupCallService.switchCamera();
    setIsFrontCamera(isFront);
  }, []);

  const toggleSpeaker = useCallback(async () => {
    const nextState = !isSpeakerOn;
    setIsSpeakerOn(nextState);
    await toggleNativeSpeakerphone(nextState);
  }, [isSpeakerOn]);

  // Socket Event Handlers
  useEffect(() => {
    if (!socket || !isConnected) return;

    // Acknowledge Group Call Initiated
    const handleInitiated = (data: { callId: string; conversationId: string; callType: 'voice' | 'video'; activeParticipants: IUser[] }) => {
      console.log('[GroupCallContext] group_call:initiated received:', data);
      setGroupCallSession((prev) => ({
        callId: data.callId,
        conversationId: data.conversationId,
        groupName: prev?.groupName || 'Group Call',
        groupAvatar: prev?.groupAvatar,
        callType: data.callType,
        startedAt: new Date(),
        allParticipants: data.activeParticipants || [],
      }));
    };

    // Acknowledge Group Call Joined (Received list of other existing peers)
    const handleJoined = async (data: {
      callId: string;
      conversationId: string;
      callType: 'voice' | 'video';
      existingParticipants: IUser[];
      allParticipants: IUser[];
    }) => {
      console.log('[GroupCallContext] group_call:joined received. Initializing mesh peer connections to existing participants:', data.existingParticipants);

      setGroupCallSession((prev) => ({
        callId: data.callId,
        conversationId: data.conversationId,
        groupName: prev?.groupName || 'Group Call',
        groupAvatar: prev?.groupAvatar,
        callType: data.callType,
        startedAt: new Date(),
        allParticipants: data.allParticipants || [],
      }));

      // As the newly joined participant, we initiate WebRTC Offers to all existing participants in the call
      for (const peerUser of data.existingParticipants) {
        if (peerUser._id !== user?._id) {
          await webrtcGroupCallService.initPeerConnection(
            peerUser._id,
            peerUser,
            true, // isInitiator
            (targetUserId, signal) => {
              socket.emit('group_call:signal', {
                callId: data.callId,
                targetUserId,
                signal,
              });
            }
          );
        }
      }
    };

    // Incoming Group Call Notification
    const handleIncoming = (data: IncomingGroupCallInfo) => {
      console.log('[GroupCallContext] group_call:incoming:', data);
      // If already in a call, ignore or show silent banner
      if (groupCallSessionRef.current) return;

      setIncomingGroupCall(data);
      soundService.startRingtone();
    };

    // Banner Update (Active group call in progress)
    const handleBannerUpdate = (data: IActiveGroupCallState & { conversationId: string }) => {
      setActiveBanners((prev) => {
        const next = new Map(prev);
        if (data.isActive) {
          next.set(data.conversationId, data);
        } else {
          next.delete(data.conversationId);
        }
        return next;
      });
    };

    // Another participant joined the call
    const handleParticipantJoined = (data: { callId: string; user: IUser; activeParticipantCount: number }) => {
      console.log('[GroupCallContext] Peer joined call:', data.user.displayName);
      setGroupCallSession((prev) => {
        if (!prev) return prev;
        const exists = prev.allParticipants.some((p) => p._id === data.user._id);
        return {
          ...prev,
          allParticipants: exists ? prev.allParticipants : [...prev.allParticipants, data.user],
        };
      });
    };

    // Another participant left the call
    const handleParticipantLeft = (data: { callId: string; userId: string; activeParticipantCount: number }) => {
      console.log('[GroupCallContext] Peer left call:', data.userId);
      webrtcGroupCallService.removePeer(data.userId);

      setGroupCallSession((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          allParticipants: prev.allParticipants.filter((p) => p._id !== data.userId),
        };
      });
    };

    // WebRTC Signaling Relay Message
    const handleSignal = (data: { callId: string; senderId: string; signal: any }) => {
      webrtcGroupCallService.handleSignal(
        data.senderId,
        data.signal,
        (targetUserId, signal) => {
          socket.emit('group_call:signal', {
            callId: data.callId,
            targetUserId,
            signal,
          });
        }
      );
    };

    // Group Call Ended
    const handleCallEnded = (data: { callId: string; conversationId: string }) => {
      if (groupCallSessionRef.current?.callId === data.callId) {
        console.log('[GroupCallContext] Group call ended by server');
        cleanupCall();
      }
    };

    // Error from server
    const handleError = (data: { message: string }) => {
      console.warn('[GroupCallContext] group_call:error:', data.message);
      alert(data.message || 'Call failed');
      cleanupCall();
    };

    // Already Active in Group
    const handleAlreadyActive = (data: { callId: string; callType: 'voice' | 'video' }) => {
      console.log('[GroupCallContext] Call already active in group, connecting directly to callId:', data.callId);
      const current = groupCallSessionRef.current;
      if (current) {
        joinGroupCall(data.callId, current.conversationId, current.groupName, current.groupAvatar, data.callType);
      }
    };

    socket.on('group_call:initiated', handleInitiated);
    socket.on('group_call:joined', handleJoined);
    socket.on('group_call:incoming', handleIncoming);
    socket.on('group_call:banner_update', handleBannerUpdate);
    socket.on('group_call:participant_joined', handleParticipantJoined);
    socket.on('group_call:participant_left', handleParticipantLeft);
    socket.on('group_call:signal', handleSignal);
    socket.on('group_call:ended', handleCallEnded);
    socket.on('group_call:error', handleError);
    socket.on('group_call:already_active', handleAlreadyActive);

    return () => {
      socket.off('group_call:initiated', handleInitiated);
      socket.off('group_call:joined', handleJoined);
      socket.off('group_call:incoming', handleIncoming);
      socket.off('group_call:banner_update', handleBannerUpdate);
      socket.off('group_call:participant_joined', handleParticipantJoined);
      socket.off('group_call:participant_left', handleParticipantLeft);
      socket.off('group_call:signal', handleSignal);
      socket.off('group_call:ended', handleCallEnded);
      socket.off('group_call:error', handleError);
      socket.off('group_call:already_active', handleAlreadyActive);
    };
  }, [socket, isConnected, user, cleanupCall]);

  return (
    <GroupCallContext.Provider
      value={{
        isGroupCallActive,
        groupCallSession,
        incomingGroupCall,
        activeBanners,
        localStream,
        isLocalSpeaking,
        localAudioLevel,
        remotePeers,
        isMuted,
        isVideoEnabled,
        isFrontCamera,
        isSpeakerOn,
        callDuration,
        startGroupCall,
        joinGroupCall,
        leaveGroupCall,
        acceptIncomingGroupCall,
        declineIncomingGroupCall,
        toggleMute,
        toggleVideo,
        switchCamera,
        toggleSpeaker,
      }}
    >
      {children}
    </GroupCallContext.Provider>
  );
};

export const useGroupCall = (): GroupCallContextType => {
  const context = useContext(GroupCallContext);
  if (!context) {
    throw new Error('useGroupCall must be used within a GroupCallProvider');
  }
  return context;
};
