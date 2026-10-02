import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useCall } from '../../context/CallContext';
import { useGroupCall } from '../../context/GroupCallContext';
import { PhoneOff, MicOff, Users, RefreshCw, Video } from 'lucide-react';
import { Avatar } from '../common/Avatar';

function formatTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export const FloatingCallBubble: React.FC = () => {
  const {
    callState,
    activeCall,
    callDuration: oneToOneDuration,
    isMuted,
    remoteStream,
    isMinimized,
    restoreCall,
    endCall,
    cancelCall,
  } = useCall();

  const {
    isGroupCallActive,
    groupCallSession,
    remotePeers,
    callDuration: groupDuration,
    isGroupCallMinimized,
    restoreGroupCall,
    leaveGroupCall,
  } = useGroupCall();

  // Check which call is active in minimized presentation
  const isOneToOneActive =
    isMinimized &&
    callState !== 'IDLE' &&
    ['CONNECTED', 'RECONNECTING', 'CALLING', 'CONNECTING', 'ACCEPTED'].includes(callState) &&
    !!activeCall;

  const isGroupActive = isGroupCallMinimized && isGroupCallActive && !!groupCallSession;

  const isVideo = isOneToOneActive
    ? activeCall?.callType === 'video'
    : isGroupActive
    ? groupCallSession?.callType === 'video'
    : false;

  // Video element ref for mini live preview
  const miniVideoRef = useRef<HTMLVideoElement>(null);

  // Position & Drag state
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ x: number; y: number }>(() => {
    const width = 220;
    const defaultX = typeof window !== 'undefined' ? Math.max(16, window.innerWidth - width - 16) : 100;
    return { x: defaultX, y: 72 };
  });

  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ pointerX: number; pointerY: number; startX: number; startY: number; hasMoved: boolean }>({
    pointerX: 0,
    pointerY: 0,
    startX: 0,
    startY: 0,
    hasMoved: false,
  });

  // Calculate bubble dimensions
  const bubbleWidth = isVideo ? 128 : 210;
  const bubbleHeight = isVideo ? 172 : 64;

  // Keep inside screen boundaries on window resize or rotation
  useEffect(() => {
    const handleResize = () => {
      setPosition((prev) => {
        const maxX = Math.max(10, window.innerWidth - bubbleWidth - 10);
        const maxY = Math.max(56, window.innerHeight - bubbleHeight - 80);
        return {
          x: Math.min(Math.max(10, prev.x), maxX),
          y: Math.min(Math.max(56, prev.y), maxY),
        };
      });
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [bubbleWidth, bubbleHeight]);

  // Video stream attachment for 1-to-1 video call
  const has1to1RemoteVideo =
    isOneToOneActive &&
    isVideo &&
    remoteStream &&
    remoteStream.getVideoTracks().length > 0 &&
    remoteStream.getVideoTracks().some((t) => t.enabled && t.readyState === 'live');

  // Active video stream for Group video call (active speaker or first available peer with video)
  const activeGroupPeerWithVideo = isGroupActive && isVideo
    ? Array.from(remotePeers.values()).find((p) => p.isSpeaking && p.isVideoEnabled && p.stream) ||
      Array.from(remotePeers.values()).find((p) => p.isVideoEnabled && p.stream)
    : null;

  const hasGroupRemoteVideo =
    isGroupActive &&
    isVideo &&
    activeGroupPeerWithVideo?.stream &&
    activeGroupPeerWithVideo.stream.getVideoTracks().length > 0 &&
    activeGroupPeerWithVideo.stream.getVideoTracks().some((t) => t.enabled && t.readyState === 'live');

  // Bind video element to live media stream
  useEffect(() => {
    if (!isVideo || !miniVideoRef.current) return;

    if (isOneToOneActive && remoteStream) {
      if (miniVideoRef.current.srcObject !== remoteStream) {
        miniVideoRef.current.srcObject = remoteStream;
      }
      miniVideoRef.current.play().catch(() => {});
    } else if (isGroupActive && activeGroupPeerWithVideo?.stream) {
      if (miniVideoRef.current.srcObject !== activeGroupPeerWithVideo.stream) {
        miniVideoRef.current.srcObject = activeGroupPeerWithVideo.stream;
      }
      miniVideoRef.current.play().catch(() => {});
    }
  }, [isVideo, isOneToOneActive, isGroupActive, remoteStream, activeGroupPeerWithVideo?.stream]);

  // Drag Pointer Handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only primary button
    if (e.button !== 0) return;

    dragStartRef.current = {
      pointerX: e.clientX,
      pointerY: e.clientY,
      startX: position.x,
      startY: position.y,
      hasMoved: false,
    };
    setIsDragging(true);

    const onPointerMove = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - dragStartRef.current.pointerX;
      const deltaY = moveEvent.clientY - dragStartRef.current.pointerY;

      if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
        dragStartRef.current.hasMoved = true;
      }

      const minX = 10;
      const maxX = Math.max(minX, window.innerWidth - bubbleWidth - 10);
      const minY = 56;
      const maxY = Math.max(minY, window.innerHeight - bubbleHeight - 80);

      const nextX = Math.min(Math.max(minX, dragStartRef.current.startX + deltaX), maxX);
      const nextY = Math.min(Math.max(minY, dragStartRef.current.startY + deltaY), maxY);

      setPosition({ x: nextX, y: nextY });
    };

    const onPointerUp = () => {
      setIsDragging(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);

      // If user tapped without dragging, restore full screen call
      if (!dragStartRef.current.hasMoved) {
        if (isOneToOneActive) {
          restoreCall();
        } else if (isGroupActive) {
          restoreGroupCall();
        }
        return;
      }

      // Edge snapping: snap to left or right margin
      setPosition((curr) => {
        const snapLeft = 12;
        const snapRight = Math.max(12, window.innerWidth - bubbleWidth - 12);
        const midPoint = window.innerWidth / 2;
        const currentCenter = curr.x + bubbleWidth / 2;

        const snappedX = currentCenter < midPoint ? snapLeft : snapRight;
        return { x: snappedX, y: curr.y };
      });
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const handleEndCall = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isOneToOneActive) {
      if (['CONNECTED', 'RECONNECTING', 'CONNECTING', 'ACCEPTED'].includes(callState)) {
        endCall();
      } else {
        cancelCall();
      }
    } else if (isGroupActive) {
      leaveGroupCall();
    }
  };

  if (!isOneToOneActive && !isGroupActive) {
    return null;
  }

  // 1-to-1 Participant details
  const otherParticipant = activeCall?.isIncoming ? activeCall?.caller : activeCall?.receiver;
  const displayName = isOneToOneActive
    ? otherParticipant?.displayName || 'User'
    : groupCallSession?.groupName || 'Group Call';
  const avatarUrl = isOneToOneActive
    ? otherParticipant?.avatarUrl || otherParticipant?.avatar
    : groupCallSession?.groupAvatar;

  const duration = isOneToOneActive ? oneToOneDuration : groupDuration;
  const isReconnecting = isOneToOneActive && callState === 'RECONNECTING';

  return (
    <div
      ref={bubbleRef}
      onPointerDown={handlePointerDown}
      style={{
        transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
        touchAction: 'none',
      }}
      className={`fixed top-0 left-0 z-[90] select-none cursor-grab active:cursor-grabbing ${
        isDragging ? '' : 'transition-transform duration-250 ease-out'
      }`}
    >
      {/* ── VIDEO CALL MINIMIZED FLOATING CARD ── */}
      {isVideo ? (
        <div className="relative w-32 h-44 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/25 bg-[#0B141A] flex flex-col justify-between backdrop-blur-xl group hover:border-brand-400/60 transition-all">
          {/* Live Video Preview (Strictly muted to prevent any duplicate audio) */}
          <video
            ref={miniVideoRef}
            autoPlay
            playsInline
            muted
            controls={false}
            disablePictureInPicture
            disableRemotePlayback
            className={`absolute inset-0 w-full h-full object-cover pointer-events-none transition-opacity duration-300 ${
              (has1to1RemoteVideo || hasGroupRemoteVideo) ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* Avatar Fallback if camera off or stream connecting */}
          {!(has1to1RemoteVideo || hasGroupRemoteVideo) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#111B21] via-[#0B141A] to-[#111B21] p-2 text-center pointer-events-none">
              <div className="w-12 h-12 rounded-full overflow-hidden border border-white/20 mb-1.5 shadow-md flex items-center justify-center bg-[#202C33]">
                {avatarUrl ? (
                  <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-brand-700 flex items-center justify-center text-white text-base font-bold">
                    {displayName.charAt(0).toUpperCase()}
                  </div>
                )}
              </div>
              <span className="text-[11px] font-medium text-white truncate max-w-[100px] drop-shadow-sm">
                {displayName}
              </span>
            </div>
          )}

          {/* Top Duration & Reconnecting Badge Overlay */}
          <div className="relative z-10 p-2 flex items-center justify-between w-full bg-gradient-to-b from-black/80 to-transparent pointer-events-none">
            {isReconnecting ? (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/90 text-slate-950 text-[10px] font-bold shadow-sm animate-pulse">
                <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                <span>Reconnecting</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-emerald-400 font-mono text-[10px] font-bold border border-white/10 shadow-sm">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                {formatTimer(duration)}
              </span>
            )}

            {isMuted && isOneToOneActive && (
              <span className="p-1 rounded-full bg-red-500/90 text-white shadow-sm">
                <MicOff className="w-2.5 h-2.5" />
              </span>
            )}
          </div>

          {/* Bottom Bar: Name + Quick End Call Button */}
          <div className="relative z-10 p-2 flex items-center justify-between w-full bg-gradient-to-t from-black/90 via-black/50 to-transparent">
            <span className="text-[11px] font-semibold text-white truncate max-w-[70px] drop-shadow-md pointer-events-none">
              {displayName}
            </span>

            <button
              type="button"
              onClick={handleEndCall}
              onPointerDown={(e) => e.stopPropagation()}
              className="w-7 h-7 rounded-full bg-red-600 hover:bg-red-700 active:scale-90 flex items-center justify-center text-white shadow-lg transition-transform"
              title="End Call"
              aria-label="End Call"
            >
              <PhoneOff className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      ) : (
        /* ── AUDIO CALL MINIMIZED FLOATING CAPSULE ── */
        <div className="h-16 px-3 py-2 rounded-2xl bg-[#111B21]/92 border border-white/20 shadow-2xl backdrop-blur-xl flex items-center gap-2.5 hover:border-emerald-500/50 transition-colors">
          {/* Avatar with active green ring */}
          <div className="relative flex-shrink-0">
            <div className="w-10 h-10 rounded-full overflow-hidden border border-emerald-500/60 shadow-md bg-[#202C33] flex items-center justify-center">
              {isGroupActive ? (
                groupCallSession?.groupAvatar ? (
                  <img src={groupCallSession.groupAvatar} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                  <Users className="w-5 h-5 text-emerald-400" />
                )
              ) : avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-emerald-700 flex items-center justify-center text-white text-sm font-bold">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            {/* Active pulsing green indicator */}
            {!isReconnecting && (
              <span className="absolute -bottom-0.5 -right-0.5 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border border-slate-900" />
              </span>
            )}
          </div>

          {/* Name & Duration Info */}
          <div className="flex-1 min-w-0 pr-1 pointer-events-none">
            <h4 className="text-xs font-semibold text-white truncate leading-tight drop-shadow-sm">
              {displayName}
            </h4>
            <div className="flex items-center gap-1.5 mt-0.5">
              {isReconnecting ? (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-amber-400 animate-pulse">
                  <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                  <span>Reconnecting...</span>
                </span>
              ) : (
                <span className="text-[11px] font-mono font-medium text-emerald-400">
                  {formatTimer(duration)}
                </span>
              )}

              {isMuted && isOneToOneActive && (
                <span className="flex items-center text-red-400" title="Muted">
                  <MicOff className="w-3 h-3 stroke-[2.5]" />
                </span>
              )}

              {isGroupActive && (
                <span className="text-[10px] text-slate-400 flex items-center gap-0.5 ml-1">
                  <Users className="w-2.5 h-2.5" />
                  <span>{remotePeers.size + 1}</span>
                </span>
              )}
            </div>
          </div>

          {/* Quick End Call Button */}
          <button
            type="button"
            onClick={handleEndCall}
            onPointerDown={(e) => e.stopPropagation()}
            className="w-8 h-8 rounded-full bg-red-600/90 hover:bg-red-700 active:scale-90 flex items-center justify-center text-white shadow-md transition-all flex-shrink-0 ml-0.5"
            title="End Call"
            aria-label="End Call"
          >
            <PhoneOff className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};

export default FloatingCallBubble;
