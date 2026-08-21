import React from 'react';
import { useCall } from '../../context/CallContext';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  PhoneOff,
  Phone,
} from 'lucide-react';

export const CallScreen: React.FC = () => {
  const {
    callState,
    activeCall,
    callDuration,
    isMuted,
    isSpeakerOn,
    endCall,
    cancelCall,
    toggleMute,
    toggleSpeaker,
  } = useCall();

  if (callState === 'IDLE' || (callState === 'RINGING' && activeCall?.isIncoming)) {
    return null;
  }

  const otherParticipant = activeCall?.isIncoming ? activeCall.caller : activeCall?.receiver;
  const avatarUrl = otherParticipant?.avatarUrl || otherParticipant?.avatar;
  const displayName = otherParticipant?.displayName || 'User';

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
        return 'Connecting audio...';
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

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-b from-[#0B141A] via-[#111B21] to-[#0B141A] flex flex-col justify-between p-6 select-none animate-fadeIn">
      {/* Top Header */}
      <div className="pt-8 text-center flex-shrink-0">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-3 shadow-sm">
          <Phone className="w-3.5 h-3.5" />
          <span>Kotha Hobe Voice Call</span>
        </div>
        <h2 className="text-2xl font-bold text-white tracking-tight">{displayName}</h2>
        {otherParticipant?.username && (
          <p className="text-sm text-chat-textMuted mt-0.5">@{otherParticipant.username}</p>
        )}
        <p
          className={`text-base font-medium mt-2 transition-colors ${
            isConnected ? 'text-emerald-400 font-mono text-lg font-bold' : 'text-chat-textMuted'
          }`}
        >
          {getStatusText()}
        </p>
      </div>

      {/* Center Avatar */}
      <div className="flex flex-col items-center justify-center my-auto flex-shrink-0">
        <div className="relative flex items-center justify-center">
          {!isEnding && (
            <>
              <div className="absolute w-44 h-44 rounded-full bg-emerald-500/10 animate-ping duration-1000" />
              <div className="absolute w-36 h-36 rounded-full bg-emerald-500/20 animate-pulse" />
            </>
          )}

          <div className="w-28 h-28 rounded-full overflow-hidden border-2 border-emerald-500/40 shadow-2xl relative z-10 bg-[#202C33] flex items-center justify-center">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-emerald-700 flex items-center justify-center text-white text-3xl font-bold">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Floating Control Bar */}
      <div className="pb-10 flex flex-col items-center gap-4 flex-shrink-0">
        <div className="flex items-center justify-center gap-6 bg-white/5 border border-white/10 backdrop-blur-md px-6 py-3.5 rounded-3xl shadow-2xl">
          {/* Mute Button */}
          <button
            type="button"
            onClick={toggleMute}
            disabled={!isConnected}
            className={`w-13 h-13 p-3.5 rounded-2xl flex flex-col items-center justify-center transition-all ${
              isMuted
                ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
            } disabled:opacity-40 active:scale-95`}
          >
            {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
          </button>

          {/* Speakerphone Button */}
          <button
            type="button"
            onClick={toggleSpeaker}
            disabled={!isConnected}
            className={`w-13 h-13 p-3.5 rounded-2xl flex flex-col items-center justify-center transition-all ${
              isSpeakerOn
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
            } disabled:opacity-40 active:scale-95`}
          >
            {isSpeakerOn ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
          </button>

          {/* End / Cancel Call Button */}
          <button
            type="button"
            onClick={isConnected ? endCall : cancelCall}
            disabled={isEnding}
            className="w-14 h-14 rounded-2xl bg-red-600 hover:bg-red-700 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-red-600/40 transition-transform"
          >
            <PhoneOff className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};

