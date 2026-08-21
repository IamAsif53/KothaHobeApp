import React, { useEffect, useRef, useState } from 'react';
import { useCall } from '../../context/CallContext';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  PhoneOff,
  Phone,
  Video,
  VideoOff,
  SwitchCamera,
  Move,
} from 'lucide-react';

export const CallScreen: React.FC = () => {
  const {
    callState,
    activeCall,
    callDuration,
    isMuted,
    isSpeakerOn,
    isVideoEnabled,
    isFrontCamera,
    localStream,
    remoteStream,
    endCall,
    cancelCall,
    toggleMute,
    toggleSpeaker,
    toggleVideo,
    switchCamera,
    attachLocalVideo,
    attachRemoteVideo,
  } = useCall();

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [isSwitchingCam, setIsSwitchingCam] = useState<boolean>(false);
  const [pipCorner, setPipCorner] = useState<'tr' | 'tl' | 'br' | 'bl'>('tr');

  const isVideo = activeCall?.callType === 'video';
  const otherParticipant = activeCall?.isIncoming ? activeCall.caller : activeCall?.receiver;
  const avatarUrl = otherParticipant?.avatarUrl || otherParticipant?.avatar;
  const displayName = otherParticipant?.displayName || 'User';

  // Bind local video stream
  useEffect(() => {
    if (isVideo && localVideoRef.current) {
      attachLocalVideo(localVideoRef.current);
    }
  }, [isVideo, localStream, attachLocalVideo]);

  // Bind remote video stream
  useEffect(() => {
    if (isVideo && remoteVideoRef.current) {
      attachRemoteVideo(remoteVideoRef.current);
    }
  }, [isVideo, remoteStream, attachRemoteVideo]);

  if (callState === 'IDLE' || (callState === 'RINGING' && activeCall?.isIncoming)) {
    return null;
  }

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusText = () => {
    switch (callState) {
      case 'CALLING':
        return 'Calling...';
      case 'RINGING':
        return 'Ringing...';
      case 'ACCEPTED':
      case 'CONNECTING':
        return isVideo ? 'Connecting video...' : 'Connecting audio...';
      case 'CONNECTED':
        return formatTimer(callDuration);
      case 'ENDED':
        return 'Call Ended';
      case 'REJECTED':
        return 'Call Declined';
      case 'CANCELLED':
        return 'Call Cancelled';
      case 'BUSY':
        return 'User Busy';
      case 'FAILED':
        return 'Connection Failed';
      default:
        return '';
    }
  };

  const isConnected = callState === 'CONNECTED';
  const isEnding = ['ENDED', 'REJECTED', 'CANCELLED', 'BUSY', 'FAILED'].includes(callState);

  const hasRemoteVideo =
    isVideo &&
    isConnected &&
    remoteStream &&
    remoteStream.getVideoTracks().length > 0 &&
    remoteStream.getVideoTracks().some((t) => t.enabled && t.readyState === 'live');

  const handleCameraFlip = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (isSwitchingCam) return;
    setIsSwitchingCam(true);
    try {
      await switchCamera();
      if (localVideoRef.current) {
        attachLocalVideo(localVideoRef.current);
      }
    } finally {
      setIsSwitchingCam(false);
    }
  };

  const cyclePipCorner = () => {
    setPipCorner((prev) => {
      if (prev === 'tr') return 'tl';
      if (prev === 'tl') return 'bl';
      if (prev === 'bl') return 'br';
      return 'tr';
    });
  };

  const getPipClasses = () => {
    switch (pipCorner) {
      case 'tl':
        return 'top-32 left-4';
      case 'bl':
        return 'bottom-36 left-4';
      case 'br':
        return 'bottom-36 right-4';
      case 'tr':
      default:
        return 'top-32 right-4';
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col justify-between select-none overflow-hidden animate-fadeIn">
      {/* 1. Fullscreen Remote Video or Background */}
      {isVideo ? (
        <div className="absolute inset-0 z-0 bg-[#0B141A] flex items-center justify-center">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            controls={false}
            disablePictureInPicture
            disableRemotePlayback
            className={`w-full h-full object-cover transition-opacity duration-300 pointer-events-none ${
              hasRemoteVideo ? 'opacity-100' : 'opacity-0'
            }`}
          />

          {/* Remote Video Fallback / Avatar Overlay when remote camera is off or connecting */}
          {!hasRemoteVideo && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-[#0B141A] via-[#111B21] to-[#0B141A]">
              <div className="relative flex items-center justify-center">
                {!isEnding && (
                  <>
                    <div className="absolute w-48 h-48 rounded-full bg-brand-500/10 animate-ping duration-1000" />
                    <div className="absolute w-40 h-40 rounded-full bg-brand-500/20 animate-pulse" />
                  </>
                )}
                <div className="w-32 h-32 rounded-full overflow-hidden border-2 border-brand-500/40 shadow-2xl relative z-10 bg-[#202C33] flex items-center justify-center">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full bg-brand-700 flex items-center justify-center text-white text-4xl font-bold">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
              </div>
              {isConnected && (
                <p className="text-chat-textMuted text-sm font-medium mt-4">Camera is turned off</p>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Voice Call Background with Center Avatar */
        <div className="absolute inset-0 z-0 bg-gradient-to-b from-[#0B141A] via-[#111B21] to-[#0B141A] flex items-center justify-center">
          <div className="relative flex items-center justify-center">
            {!isEnding && (
              <>
                <div className="absolute w-48 h-48 rounded-full bg-emerald-500/10 animate-ping duration-1000" />
                <div className="absolute w-40 h-40 rounded-full bg-emerald-500/20 animate-pulse" />
              </>
            )}
            <div className="w-32 h-32 rounded-full overflow-hidden border-2 border-emerald-500/40 shadow-2xl relative z-10 bg-[#202C33] flex items-center justify-center">
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full bg-emerald-700 flex items-center justify-center text-white text-4xl font-bold">
                  {displayName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. Top Header Overlay */}
      <div className="relative z-10 pt-12 pb-6 px-6 bg-gradient-to-b from-black/80 via-black/40 to-transparent flex flex-col items-center text-center">
        <div
          className={`inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full border text-xs font-semibold uppercase tracking-wider mb-2 shadow-sm backdrop-blur-md ${
            isVideo
              ? 'bg-brand-500/20 border-brand-500/30 text-brand-300'
              : 'bg-emerald-500/20 border-emerald-500/30 text-emerald-300'
          }`}
        >
          {isVideo ? <Video className="w-3.5 h-3.5" /> : <Phone className="w-3.5 h-3.5" />}
          <span>{isVideo ? 'Kotha Hobe Video Call' : 'Kotha Hobe Voice Call'}</span>
        </div>
        <h2 className="text-2xl font-bold text-white tracking-tight drop-shadow-md">{displayName}</h2>
        {otherParticipant?.username && (
          <p className="text-xs text-chat-textMuted mt-0.5">@{otherParticipant.username}</p>
        )}
        <p
          className={`text-sm font-medium mt-1.5 drop-shadow-sm transition-colors ${
            isConnected
              ? `${isVideo ? 'text-brand-400' : 'text-emerald-400'} font-mono text-base font-bold`
              : 'text-chat-textMuted'
          }`}
        >
          {getStatusText()}
        </p>
      </div>

      {/* 3. Floating Local Video Self-Preview (PiP) */}
      {isVideo && (
        <div
          onClick={cyclePipCorner}
          className={`absolute ${getPipClasses()} z-20 w-28 h-40 sm:w-36 sm:h-52 rounded-2xl overflow-hidden shadow-2xl border-2 border-white/20 bg-[#111B21] backdrop-blur-md cursor-pointer transition-all duration-300`}
        >
          {isVideoEnabled && localStream ? (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              controls={false}
              disablePictureInPicture
              disableRemotePlayback
              className={`w-full h-full object-cover pointer-events-none ${isFrontCamera ? 'scale-x-[-1]' : ''}`}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center p-2 text-center bg-black/70">
              <VideoOff className="w-6 h-6 text-gray-400 mb-1" />
              <span className="text-[10px] text-gray-400 font-medium leading-tight">Camera Off</span>
            </div>
          )}

          {/* Quick Controls overlay on Local PiP */}
          <div className="absolute top-1.5 left-1.5 p-1 rounded-md bg-black/50 text-white/70">
            <Move className="w-3 h-3" />
          </div>

          {isVideoEnabled && (
            <button
              type="button"
              onClick={handleCameraFlip}
              disabled={isSwitchingCam}
              className="absolute bottom-2 right-2 p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-white backdrop-blur-md transition-all active:scale-95 shadow-md"
              title="Flip Camera"
            >
              <SwitchCamera className={`w-3.5 h-3.5 ${isSwitchingCam ? 'animate-spin' : ''}`} />
            </button>
          )}
        </div>
      )}

      {/* 4. Bottom Floating Control Bar */}
      <div className="relative z-10 pb-12 pt-6 px-6 bg-gradient-to-t from-black/85 via-black/45 to-transparent flex flex-col items-center gap-4">
        <div className="flex items-center justify-center gap-4 sm:gap-6 bg-white/10 border border-white/15 backdrop-blur-xl px-6 py-3.5 rounded-3xl shadow-2xl">
          {/* Mute Mic Button */}
          <button
            type="button"
            onClick={toggleMute}
            disabled={!isConnected}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
              isMuted
                ? 'bg-red-500/30 text-red-400 border border-red-500/50'
                : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
            } disabled:opacity-40 active:scale-95`}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Video Toggle Button (Only for Video Calls) */}
          {isVideo && (
            <button
              type="button"
              onClick={toggleVideo}
              disabled={!isConnected}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
                !isVideoEnabled
                  ? 'bg-red-500/30 text-red-400 border border-red-500/50'
                  : 'bg-brand-500/30 text-brand-300 border border-brand-500/50'
              } disabled:opacity-40 active:scale-95`}
              title={isVideoEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
            >
              {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
            </button>
          )}

          {/* Switch Camera Button (Only for Video Calls) */}
          {isVideo && (
            <button
              type="button"
              onClick={handleCameraFlip}
              disabled={!isConnected || !isVideoEnabled || isSwitchingCam}
              className="w-12 h-12 rounded-2xl bg-white/10 hover:bg-white/20 text-white border border-white/10 flex items-center justify-center transition-all disabled:opacity-40 active:scale-95"
              title="Switch Front/Rear Camera"
            >
              <SwitchCamera className={`w-5 h-5 ${isSwitchingCam ? 'animate-spin' : ''}`} />
            </button>
          )}

          {/* Speakerphone Button */}
          <button
            type="button"
            onClick={toggleSpeaker}
            disabled={!isConnected}
            className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all ${
              isSpeakerOn
                ? `${isVideo ? 'bg-brand-500/30 text-brand-300 border-brand-500/50' : 'bg-emerald-500/30 text-emerald-300 border-emerald-500/50'} border`
                : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
            } disabled:opacity-40 active:scale-95`}
            title={isSpeakerOn ? 'Speaker On' : 'Speaker Off'}
          >
            {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>

          {/* End / Cancel Call Button */}
          <button
            type="button"
            onClick={isConnected ? endCall : cancelCall}
            disabled={isEnding}
            className="w-14 h-14 rounded-2xl bg-red-600 hover:bg-red-700 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-red-600/50 transition-transform"
            title="End Call"
          >
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};
