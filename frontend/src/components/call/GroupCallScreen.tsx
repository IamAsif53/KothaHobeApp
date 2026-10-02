import React, { useEffect, useRef, useState } from 'react';
import { useGroupCall } from '../../context/GroupCallContext';
import { useAuth } from '../../context/AuthContext';
import { InCallChatDrawer } from './InCallChatDrawer';
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
  MonitorUp,
  MessageSquare,
  Pin,
  PinOff,
  MoreVertical,
  Maximize2,
  Minimize2,
  UserX,
  Volume1,
  ChevronDown,
} from 'lucide-react';
import { Avatar } from '../common/Avatar';
import { modalStack } from '../../utils/modalStack';

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
  fitMode: 'cover' | 'contain';
  isPinned: boolean;
  onTogglePin: () => void;
  isModerator: boolean;
  onKick: () => void;
  onMute: () => void;
}> = ({
  userId,
  peerState,
  callType,
  fitMode,
  isPinned,
  onTogglePin,
  isModerator,
  onKick,
  onMute,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [showMenu, setShowMenu] = useState(false);

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
  const isAudioEnabled = peerState.isAudioEnabled !== false;

  return (
    <div
      className={`relative w-full h-full rounded-2xl overflow-hidden bg-slate-900/90 border-2 transition-all duration-300 flex flex-col items-center justify-center group ${
        peerState.isSpeaking
          ? 'border-emerald-500 shadow-lg shadow-emerald-500/30'
          : isPinned
          ? 'border-brand-500 shadow-md shadow-brand-500/20'
          : 'border-slate-800'
      }`}
    >
      {/* Video Element */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={`w-full h-full ${
          fitMode === 'contain' ? 'object-contain bg-black' : 'object-cover'
        } ${hasVideo ? 'block' : 'hidden'}`}
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

      {/* Top Left/Right Quick Action Buttons on Tile */}
      <div className="absolute top-2 right-2 flex items-center gap-1.5 z-20">
        {/* Pin Tile Button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onTogglePin();
          }}
          className={`p-1.5 rounded-lg backdrop-blur-md transition-all ${
            isPinned
              ? 'bg-brand-500 text-white shadow-md'
              : 'bg-black/50 hover:bg-black/80 text-white/70 hover:text-white opacity-80 group-hover:opacity-100'
          }`}
          title={isPinned ? 'Unpin' : 'Pin participant'}
        >
          {isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
        </button>

        {/* Moderator Action Button */}
        {isModerator && (
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowMenu(!showMenu);
              }}
              className="p-1.5 rounded-lg bg-black/50 hover:bg-black/80 text-white/70 hover:text-white backdrop-blur-md opacity-80 group-hover:opacity-100 transition-all"
              title="Moderator options"
            >
              <MoreVertical className="w-3.5 h-3.5" />
            </button>

            {showMenu && (
              <div
                className="absolute right-0 top-8 w-44 rounded-xl bg-slate-900 border border-white/15 shadow-2xl p-1 z-30 animate-fadeIn text-xs"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    onMute();
                  }}
                  className="w-full px-3 py-2 rounded-lg hover:bg-white/10 text-left flex items-center gap-2 text-slate-200 transition-colors"
                >
                  <MicOff className="w-3.5 h-3.5 text-amber-400" />
                  <span>Mute mic</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMenu(false);
                    onKick();
                  }}
                  className="w-full px-3 py-2 rounded-lg hover:bg-red-500/20 text-left flex items-center gap-2 text-red-400 transition-colors"
                >
                  <UserX className="w-3.5 h-3.5" />
                  <span>Remove from call</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Participant Name and Audio State Badges */}
      <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none z-10">
        <span className="px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md text-white text-xs font-medium truncate max-w-[75%] flex items-center gap-1.5">
          <span>{displayName}</span>
          {!isAudioEnabled && <MicOff className="w-3 h-3 text-red-400 shrink-0" />}
        </span>
        {peerState.isSpeaking && (
          <span className="px-2 py-0.5 rounded-md bg-emerald-500/90 text-white text-[10px] font-bold uppercase tracking-wider shadow-sm">
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
    isScreenSharing,
    isScreenShareSupported,
    callDuration,
    leaveGroupCall,
    toggleMute,
    toggleVideo,
    switchCamera,
    toggleSpeaker,
    toggleScreenShare,
    kickParticipant,
    requestMuteParticipant,
    isGroupCallMinimized,
    minimizeGroupCall,
  } = useGroupCall();

  const { user } = useAuth();
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [fitMode, setFitMode] = useState<'cover' | 'contain'>('cover');
  const [pinnedUserId, setPinnedUserId] = useState<string | null>(null);
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      if (localVideoRef.current.srcObject !== localStream) {
        localVideoRef.current.srcObject = localStream;
      }
      localVideoRef.current.play().catch(() => {});
    }
  }, [localStream, isVideoEnabled, isFrontCamera]);

  // Register with modalStack for hardware / browser / escape back minimization
  useEffect(() => {
    if (isGroupCallActive && !isGroupCallMinimized) {
      const unregister = modalStack.register('group_call_screen', () => {
        minimizeGroupCall();
      });
      return () => {
        unregister();
      };
    }
  }, [isGroupCallActive, isGroupCallMinimized, minimizeGroupCall]);

  if (!isGroupCallActive || !groupCallSession || isGroupCallMinimized) {
    return null;
  }

  const callType = groupCallSession.callType;
  const isVideo = callType === 'video';

  const peersArray = Array.from(remotePeers.entries());
  const totalParticipants = peersArray.length + 1; // +1 for local user

  // Check if current user is moderator
  const isModerator = true; // In Kotha Hobe group calls, any participant with admin/creator privileges can moderate

  // Dynamic Responsive Grid Layout Class (when not pinned)
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

  const pinnedPeer = pinnedUserId ? remotePeers.get(pinnedUserId) : null;
  const isLocalPinned = pinnedUserId === 'local';

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col justify-between overflow-hidden select-none safe-top safe-bottom">
      {/* Top Header Bar */}
      <div className="px-4 py-3 bg-gradient-to-b from-black/90 to-transparent flex items-center justify-between z-10">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={minimizeGroupCall}
            className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 flex items-center justify-center text-white backdrop-blur-md transition-all shadow-md mr-0.5"
            title="Minimize Call"
            aria-label="Minimize Call"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
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
              {pinnedUserId && (
                <>
                  <span>•</span>
                  <span className="text-brand-400 flex items-center gap-1 font-medium">
                    <Pin className="w-3 h-3" /> Pinned
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Aspect Ratio Fit Mode Toggle Button */}
        {isVideo && (
          <button
            type="button"
            onClick={() => setFitMode((prev) => (prev === 'cover' ? 'contain' : 'cover'))}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white/80 hover:text-white backdrop-blur-md transition-all text-xs flex items-center gap-1.5"
            title={`Toggle video aspect ratio (${fitMode === 'cover' ? 'Fill' : 'Fit'})`}
          >
            {fitMode === 'cover' ? <Maximize2 className="w-4 h-4" /> : <Minimize2 className="w-4 h-4" />}
            <span className="hidden sm:inline capitalize">{fitMode}</span>
          </button>
        )}
      </div>

      {/* Multi-Party Video / Audio Participant Grid or Pinned Featured Layout */}
      <div className="flex-1 p-3 overflow-y-auto flex flex-col items-center justify-center gap-2.5">
        {pinnedUserId && (pinnedPeer || isLocalPinned) ? (
          /* Pinned Featured View: Dominant Tile + Bottom Strip */
          <div className="w-full h-full flex flex-col gap-2.5">
            {/* 1. Main Dominant Pinned Tile */}
            <div className="flex-1 min-h-0 w-full rounded-2xl overflow-hidden">
              {isLocalPinned ? (
                <div className="relative w-full h-full rounded-2xl overflow-hidden bg-slate-900 border-2 border-brand-500 shadow-xl flex items-center justify-center">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full ${
                      fitMode === 'contain' ? 'object-contain bg-black' : 'object-cover'
                    } ${hasLocalVideo ? 'block' : 'hidden'} ${isFrontCamera && !isScreenSharing ? 'scale-x-[-1]' : ''}`}
                  />
                  {!hasLocalVideo && (
                    <div className="flex flex-col items-center justify-center p-4">
                      <Avatar src={user?.avatarUrl} name={user?.displayName || 'You'} size="xl" />
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => setPinnedUserId(null)}
                    className="absolute top-3 right-3 p-2 rounded-xl bg-brand-500 text-white shadow-lg"
                    title="Unpin"
                  >
                    <PinOff className="w-4 h-4" />
                  </button>
                  <div className="absolute bottom-3 left-3 px-3 py-1.5 rounded-xl bg-black/70 backdrop-blur-md text-white text-xs font-semibold">
                    You (Pinned) {isMuted ? '(Muted)' : ''}
                  </div>
                </div>
              ) : pinnedPeer ? (
                <RemotePeerTile
                  userId={pinnedUserId}
                  peerState={pinnedPeer}
                  callType={callType}
                  fitMode={fitMode}
                  isPinned={true}
                  onTogglePin={() => setPinnedUserId(null)}
                  isModerator={isModerator}
                  onKick={() => kickParticipant(pinnedUserId)}
                  onMute={() => requestMuteParticipant(pinnedUserId)}
                />
              ) : null}
            </div>

            {/* 2. Thumbnail Strip of Other Participants */}
            <div className="h-28 sm:h-36 w-full flex items-center gap-2 overflow-x-auto pb-1 shrink-0">
              {!isLocalPinned && (
                <div
                  onClick={() => setPinnedUserId('local')}
                  className="h-full aspect-video rounded-xl overflow-hidden bg-slate-900 border border-slate-700 cursor-pointer relative shrink-0 shadow-md"
                >
                  <video
                    autoPlay
                    playsInline
                    muted
                    className={`w-full h-full object-cover ${hasLocalVideo ? 'block' : 'hidden'} ${
                      isFrontCamera && !isScreenSharing ? 'scale-x-[-1]' : ''
                    }`}
                    ref={(el) => {
                      if (el && localStream) el.srcObject = localStream;
                    }}
                  />
                  {!hasLocalVideo && (
                    <div className="w-full h-full flex items-center justify-center">
                      <Avatar src={user?.avatarUrl} name="You" size="sm" />
                    </div>
                  )}
                  <span className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-black/60 text-[10px] text-white">
                    You
                  </span>
                </div>
              )}

              {peersArray
                .filter(([id]) => id !== pinnedUserId)
                .map(([peerId, peerState]) => (
                  <div
                    key={peerId}
                    className="h-full aspect-video shrink-0 rounded-xl overflow-hidden relative shadow-md"
                  >
                    <RemotePeerTile
                      userId={peerId}
                      peerState={peerState}
                      callType={callType}
                      fitMode="cover"
                      isPinned={false}
                      onTogglePin={() => setPinnedUserId(peerId)}
                      isModerator={isModerator}
                      onKick={() => kickParticipant(peerId)}
                      onMute={() => requestMuteParticipant(peerId)}
                    />
                  </div>
                ))}
            </div>
          </div>
        ) : (
          /* Standard Balanced Dynamic Grid Layout */
          <div
            className={`grid ${gridColsClass} gap-2.5 w-full h-full max-h-[85vh] auto-rows-fr`}
          >
            {/* Local User Tile */}
            <div
              className={`relative w-full h-full rounded-2xl overflow-hidden bg-slate-900/90 border-2 transition-all duration-300 flex flex-col items-center justify-center group ${
                isLocalSpeaking
                  ? 'border-emerald-500 shadow-lg shadow-emerald-500/30'
                  : 'border-slate-800'
              }`}
            >
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full ${
                  fitMode === 'contain' ? 'object-contain bg-black' : 'object-cover'
                } ${hasLocalVideo ? 'block' : 'hidden'} ${isFrontCamera && !isScreenSharing ? 'scale-x-[-1]' : ''}`}
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

              {/* Pin Local User */}
              <button
                type="button"
                onClick={() => setPinnedUserId('local')}
                className="absolute top-2 right-2 p-1.5 rounded-lg bg-black/50 hover:bg-black/80 text-white/70 hover:text-white backdrop-blur-md opacity-80 group-hover:opacity-100 transition-all z-20"
                title="Pin self"
              >
                <Pin className="w-3.5 h-3.5" />
              </button>

              <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none z-10">
                <span className="px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md text-white text-xs font-medium flex items-center gap-1.5">
                  <span>You</span>
                  {isMuted && <MicOff className="w-3 h-3 text-red-400" />}
                </span>
                {isLocalSpeaking && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-500/90 text-white text-[10px] font-bold uppercase tracking-wider shadow-sm">
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
                fitMode={fitMode}
                isPinned={pinnedUserId === peerId}
                onTogglePin={() => setPinnedUserId(pinnedUserId === peerId ? null : peerId)}
                isModerator={isModerator}
                onKick={() => kickParticipant(peerId)}
                onMute={() => requestMuteParticipant(peerId)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bottom Floating Control Bar */}
      <div className="px-4 py-5 bg-gradient-to-t from-black/95 via-black/70 to-transparent flex items-center justify-center gap-3 sm:gap-4 z-10">
        {/* Mute Toggle */}
        <button
          onClick={toggleMute}
          className={`p-3.5 rounded-2xl backdrop-blur-md transition-all duration-200 active:scale-95 ${
            isMuted
              ? 'bg-red-500/90 text-white shadow-lg shadow-red-500/30'
              : 'bg-slate-800/90 text-white hover:bg-slate-700'
          }`}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        {/* Video Toggle (if video call) */}
        {isVideo && (
          <button
            onClick={toggleVideo}
            className={`p-3.5 rounded-2xl backdrop-blur-md transition-all duration-200 active:scale-95 ${
              !isVideoEnabled
                ? 'bg-red-500/90 text-white shadow-lg shadow-red-500/30'
                : 'bg-slate-800/90 text-white hover:bg-slate-700'
            }`}
            title={isVideoEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
          >
            {isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
          </button>
        )}

        {/* Camera Switch (if video call) */}
        {isVideo && (
          <button
            onClick={switchCamera}
            disabled={!isVideoEnabled}
            className="p-3.5 rounded-2xl bg-slate-800/90 text-white hover:bg-slate-700 backdrop-blur-md transition-all duration-200 active:scale-95 disabled:opacity-40"
            title="Switch Camera"
          >
            <SwitchCamera className="w-5 h-5" />
          </button>
        )}

        {/* Screen Share Button (if video call and supported) */}
        {isVideo && isScreenShareSupported && (
          <button
            onClick={toggleScreenShare}
            className={`p-3.5 rounded-2xl backdrop-blur-md transition-all duration-200 active:scale-95 ${
              isScreenSharing
                ? 'bg-amber-500/90 text-white shadow-lg shadow-amber-500/30'
                : 'bg-slate-800/90 text-white hover:bg-slate-700'
            }`}
            title={isScreenSharing ? 'Stop Screen Sharing' : 'Share Screen'}
          >
            <MonitorUp className="w-5 h-5" />
          </button>
        )}

        {/* Speakerphone Toggle */}
        <button
          onClick={toggleSpeaker}
          className={`p-3.5 rounded-2xl backdrop-blur-md transition-all duration-200 active:scale-95 ${
            isSpeakerOn
              ? 'bg-emerald-600/90 text-white shadow-lg shadow-emerald-600/30'
              : 'bg-slate-800/90 text-white hover:bg-slate-700'
          }`}
          title={isSpeakerOn ? 'Speaker On' : 'Speaker Off'}
        >
          {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
        </button>

        {/* In-Call Text Chat Drawer Button */}
        <button
          onClick={() => setIsChatOpen(true)}
          className="p-3.5 rounded-2xl bg-slate-800/90 text-white hover:bg-slate-700 backdrop-blur-md transition-all duration-200 active:scale-95"
          title="In-Call Chat"
        >
          <MessageSquare className="w-5 h-5" />
        </button>

        {/* End / Leave Group Call Button */}
        <button
          onClick={leaveGroupCall}
          className="p-3.5 px-6 rounded-2xl bg-red-600 text-white hover:bg-red-700 shadow-lg shadow-red-600/40 font-semibold flex items-center gap-2 transition-all duration-200 active:scale-95"
          title="Leave Call"
        >
          <PhoneOff className="w-5 h-5" />
          <span className="text-sm font-bold">Leave</span>
        </button>
      </div>

      {/* In-Call Chat Drawer */}
      <InCallChatDrawer
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        conversationId={groupCallSession.conversationId}
        title={groupCallSession.groupName}
      />
    </div>
  );
};
