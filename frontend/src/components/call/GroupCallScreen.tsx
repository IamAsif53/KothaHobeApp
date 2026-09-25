import React, { useEffect, useRef } from 'react';
import { useGroupCall } from '../../context/GroupCallContext';
import { useAuth } from '../../context/AuthContext';
import {
  Mic,
  MicOff,
  Video,
  VideoOff,
  Volume2,
  VolumeX,
  SwitchCamera,
  PhoneOff,
  Users,
} from 'lucide-react';
import { Avatar } from '../common/Avatar';

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// Subcomponent for Remote Peer Video/Audio Tile
const RemotePeerTile: React.FC<{
  userId: string;
  peerState: any;
  callType: 'voice' | 'video';
}> = ({ userId, peerState, callType }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && peerState.stream) {
      videoRef.current.srcObject = peerState.stream;
    }
  }, [peerState.stream]);

  const hasVideo =
    callType === 'video' &&
    peerState.stream &&
    peerState.stream.getVideoTracks().length > 0 &&
    peerState.stream.getVideoTracks().some((t: MediaStreamTrack) => t.enabled);

  const displayName = peerState.user?.displayName || peerState.user?.username || 'Member';

  return (
    <div
      className={`relative w-full h-full rounded-2xl overflow-hidden bg-slate-800/90 border-2 transition-all duration-300 flex flex-col items-center justify-center ${
        peerState.isSpeaking
          ? 'border-emerald-500 shadow-lg shadow-emerald-500/30'
          : 'border-slate-700/60'
      }`}
    >
      {/* Audio Playback Element (Always active for crisp audio) */}
      <audio
        ref={(el) => {
          if (el && peerState.stream && el.srcObject !== peerState.stream) {
            el.srcObject = peerState.stream;
            el.play().catch(() => {});
          }
        }}
        autoPlay
        playsInline
      />

      {/* Video Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={`w-full h-full object-cover ${hasVideo ? 'block' : 'hidden'}`}
      />

      {/* Fallback Avatar when video is off or call is voice-only */}
      {!hasVideo && (
        <div className="flex flex-col items-center justify-center p-4">
          <div
            className={`relative p-1 rounded-full transition-transform duration-300 ${
              peerState.isSpeaking ? 'scale-110' : 'scale-100'
            }`}
          >
            <Avatar
              src={peerState.user?.avatarUrl}
              name={displayName}
              size="lg"
            />
            {peerState.isSpeaking && (
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500" />
              </span>
            )}
          </div>
        </div>
      )}

      {/* Participant Name Badge */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
        <span className="px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-white text-xs font-medium truncate max-w-[80%]">
          {displayName}
        </span>
        {peerState.isSpeaking && (
          <span className="px-2 py-0.5 rounded-md bg-emerald-500/90 text-white text-[10px] font-bold uppercase tracking-wider">
            Speaking
          </span>
        )}
      </div>
    </div>
  );
};

export const GroupCallScreen: React.FC = () => {
  const {
    isGroupCallActive,
    groupCallSession,
    localStream,
    isLocalSpeaking,
    remotePeers,
    isMuted,
    isVideoEnabled,
    isFrontCamera,
    isSpeakerOn,
    callDuration,
    leaveGroupCall,
    toggleMute,
    toggleVideo,
    switchCamera,
    toggleSpeaker,
  } = useGroupCall();

  const { user } = useAuth();
  const localVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream;
    }
  }, [localStream]);

  if (!isGroupCallActive || !groupCallSession) {
    return null;
  }

  const callType = groupCallSession.callType;
  const isVideo = callType === 'video';

  const peersArray = Array.from(remotePeers.entries());
  const totalParticipants = peersArray.length + 1; // +1 for local user

  // Dynamic Responsive Grid Layout Class
  let gridColsClass = 'grid-cols-1';
  if (totalParticipants === 2) gridColsClass = 'grid-cols-1 sm:grid-cols-2';
  else if (totalParticipants >= 3 && totalParticipants <= 4) gridColsClass = 'grid-cols-2';
  else if (totalParticipants >= 5 && totalParticipants <= 6) gridColsClass = 'grid-cols-2 sm:grid-cols-3';
  else if (totalParticipants >= 7) gridColsClass = 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4';

  const hasLocalVideo =
    isVideo &&
    localStream &&
    localStream.getVideoTracks().length > 0 &&
    localStream.getVideoTracks().some((t) => t.enabled);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col justify-between overflow-hidden select-none safe-top safe-bottom">
      {/* Top Header Bar */}
      <div className="px-4 py-3 bg-gradient-to-b from-black/80 to-transparent flex items-center justify-between z-10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-emerald-600/30 border border-emerald-500/40 flex items-center justify-center font-bold text-emerald-400 overflow-hidden">
            {groupCallSession.groupAvatar ? (
              <img
                src={groupCallSession.groupAvatar}
                alt={groupCallSession.groupName}
                className="w-full h-full object-cover"
              />
            ) : (
              <Users className="w-5 h-5 text-emerald-400" />
            )}
          </div>
          <div>
            <h2 className="text-base font-semibold leading-tight text-white line-clamp-1">
              {groupCallSession.groupName}
            </h2>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span className="flex items-center gap-1 text-emerald-400 font-medium">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                {formatDuration(callDuration)}
              </span>
              <span>•</span>
              <span>{totalParticipants} in call</span>
            </div>
          </div>
        </div>
      </div>

      {/* Multi-Party Video / Audio Participant Grid */}
      <div className="flex-1 p-3 overflow-y-auto flex items-center justify-center">
        <div
          className={`grid ${gridColsClass} gap-2.5 w-full h-full max-h-[85vh] auto-rows-fr`}
        >
          {/* Local User Tile */}
          <div
            className={`relative w-full h-full rounded-2xl overflow-hidden bg-slate-800/90 border-2 transition-all duration-300 flex flex-col items-center justify-center ${
              isLocalSpeaking
                ? 'border-emerald-500 shadow-lg shadow-emerald-500/30'
                : 'border-slate-700/60'
            }`}
          >
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover ${hasLocalVideo ? 'block' : 'hidden'} ${
                isFrontCamera ? 'scale-x-[-1]' : ''
              }`}
            />

            {!hasLocalVideo && (
              <div className="flex flex-col items-center justify-center p-4">
                <div
                  className={`relative p-1 rounded-full transition-transform duration-300 ${
                    isLocalSpeaking ? 'scale-110' : 'scale-100'
                  }`}
                >
                  <Avatar
                    src={user?.avatarUrl}
                    name={user?.displayName || user?.username || 'You'}
                    size="lg"
                  />
                  {isLocalSpeaking && (
                    <span className="absolute -bottom-1 -right-1 flex h-4 w-4">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500" />
                    </span>
                  )}
                </div>
              </div>
            )}

            <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
              <span className="px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-white text-xs font-medium">
                You {isMuted ? '(Muted)' : ''}
              </span>
              {isLocalSpeaking && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/90 text-white text-[10px] font-bold uppercase tracking-wider">
                  Speaking
                </span>
              )}
            </div>
          </div>

          {/* Remote Peer Tiles */}
          {peersArray.map(([peerId, peerState]) => (
            <RemotePeerTile
              key={peerId}
              userId={peerId}
              peerState={peerState}
              callType={callType}
            />
          ))}
        </div>
      </div>

      {/* Bottom Floating Control Bar */}
      <div className="px-4 py-5 bg-gradient-to-t from-black/90 to-transparent flex items-center justify-center gap-3 sm:gap-4 z-10">
        {/* Mute Toggle */}
        <button
          onClick={toggleMute}
          className={`p-3.5 rounded-full backdrop-blur-md transition-all duration-200 active:scale-95 ${
            isMuted
              ? 'bg-red-500/90 text-white shadow-lg shadow-red-500/30'
              : 'bg-slate-800/80 text-white hover:bg-slate-700'
          }`}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
        </button>

        {/* Video Toggle (if video call) */}
        {isVideo && (
          <button
            onClick={toggleVideo}
            className={`p-3.5 rounded-full backdrop-blur-md transition-all duration-200 active:scale-95 ${
              !isVideoEnabled
                ? 'bg-red-500/90 text-white shadow-lg shadow-red-500/30'
                : 'bg-slate-800/80 text-white hover:bg-slate-700'
            }`}
            title={isVideoEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
          >
            {isVideoEnabled ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
          </button>
        )}

        {/* Camera Switch (if video call) */}
        {isVideo && (
          <button
            onClick={switchCamera}
            className="p-3.5 rounded-full bg-slate-800/80 text-white hover:bg-slate-700 backdrop-blur-md transition-all duration-200 active:scale-95"
            title="Switch Camera"
          >
            <SwitchCamera className="w-6 h-6" />
          </button>
        )}

        {/* Speakerphone Toggle */}
        <button
          onClick={toggleSpeaker}
          className={`p-3.5 rounded-full backdrop-blur-md transition-all duration-200 active:scale-95 ${
            isSpeakerOn
              ? 'bg-emerald-600/80 text-white shadow-lg shadow-emerald-600/30'
              : 'bg-slate-800/80 text-white hover:bg-slate-700'
          }`}
          title={isSpeakerOn ? 'Speaker On' : 'Speaker Off'}
        >
          {isSpeakerOn ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
        </button>

        {/* End / Leave Group Call Button */}
        <button
          onClick={leaveGroupCall}
          className="p-3.5 px-6 rounded-full bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-600/40 font-semibold flex items-center gap-2 transition-all duration-200 active:scale-95"
          title="Leave Call"
        >
          <PhoneOff className="w-6 h-6" />
          <span className="text-sm">Leave</span>
        </button>
      </div>
    </div>
  );
};
