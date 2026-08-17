import React, { useState } from 'react';
import { useCall } from '../../context/CallContext';
import { Mic, MicOff, Volume2, VolumeX, PhoneOff, Phone, Activity } from 'lucide-react';

export const CallScreen: React.FC = () => {
  const {
    callState,
    activeCall,
    callDuration,
    isMuted,
    isSpeakerOn,
    audioStats,
    endCall,
    cancelCall,
    toggleMute,
    toggleSpeaker,
    testMicrophone,
    testRemoteAudio,
  } = useCall();

  const [diagnosticMsg, setDiagnosticMsg] = useState<string | null>(null);

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

  const handleTestMic = () => {
    const res = testMicrophone();
    if (res.ok) {
      setDiagnosticMsg(`🎙️ Mic Live: ${res.trackInfo.label || 'Active'}`);
    } else {
      setDiagnosticMsg(`⚠️ Mic Error: ${res.error || 'Track not ready'}`);
    }
    setTimeout(() => setDiagnosticMsg(null), 3000);
  };

  const handleTestSpeaker = () => {
    const res = testRemoteAudio();
    if (res.ok) {
      setDiagnosticMsg(`🔊 Speaker Output Active (Vol: 100%)`);
    } else {
      setDiagnosticMsg(`⚠️ Speaker Note: ${res.error || 'Awaiting stream'}`);
    }
    setTimeout(() => setDiagnosticMsg(null), 3000);
  };

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-b from-[#0B141A] via-[#111B21] to-[#0B141A] flex flex-col justify-between p-6 select-none animate-fadeIn">
      {/* Top Header */}
      <div className="pt-12 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-3">
          <Phone className="w-3.5 h-3.5" />
          <span>Kotha Hobe Voice Call</span>
        </div>
        <h2 className="text-2xl font-bold text-white tracking-tight">{displayName}</h2>
        {otherParticipant?.username && (
          <p className="text-sm text-chat-textMuted mt-0.5">@{otherParticipant.username}</p>
        )}
        <p
          className={`text-sm font-medium mt-2 transition-colors ${
            isConnected ? 'text-emerald-400 font-mono text-base font-bold' : 'text-chat-textMuted'
          }`}
        >
          {getStatusText()}
        </p>

        {/* Live RTP Audio Traffic Indicator */}
        {isConnected && audioStats && (
          <div className="mt-2 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/40 border border-emerald-500/20 text-[11px] font-mono text-emerald-300">
            <Activity className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span>
              Out: {audioStats.packetsSent} pkts | In: {audioStats.packetsReceived} pkts
            </span>
          </div>
        )}

        {/* Diagnostic Pop-up Message */}
        {diagnosticMsg && (
          <div className="mt-2 text-xs font-medium text-amber-300 bg-amber-950/60 border border-amber-500/30 px-3 py-1 rounded-lg inline-block animate-fade-in">
            {diagnosticMsg}
          </div>
        )}
      </div>

      {/* Center Avatar with Pulsing Halo */}
      <div className="flex flex-col items-center justify-center my-auto">
        <div className="relative flex items-center justify-center">
          {/* Animated concentric ripples during ringing/calling */}
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

        {/* Live Audio Visualizer Dots when connected */}
        {isConnected && !isMuted && (
          <div className="flex items-center gap-1.5 mt-8">
            <div className="w-1.5 h-4 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
            <div className="w-1.5 h-6 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
            <div className="w-1.5 h-8 bg-emerald-400 rounded-full animate-bounce" />
            <div className="w-1.5 h-6 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
            <div className="w-1.5 h-4 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
          </div>
        )}

        {/* Diagnostic Test Buttons during Connected Call */}
        {isConnected && (
          <div className="flex items-center gap-3 mt-6">
            <button
              type="button"
              onClick={handleTestMic}
              className="text-[11px] font-medium text-white/70 hover:text-white bg-white/10 hover:bg-white/15 px-3 py-1 rounded-full border border-white/10 transition-colors"
            >
              Test Mic
            </button>
            <button
              type="button"
              onClick={handleTestSpeaker}
              className="text-[11px] font-medium text-white/70 hover:text-white bg-white/10 hover:bg-white/15 px-3 py-1 rounded-full border border-white/10 transition-colors"
            >
              Test Speaker
            </button>
          </div>
        )}
      </div>

      {/* Bottom Floating Control Bar */}
      <div className="pb-10 flex flex-col items-center gap-6">
        <div className="flex items-center justify-center gap-8 bg-white/5 border border-white/10 backdrop-blur-md px-8 py-4 rounded-3xl shadow-2xl">
          {/* Mute Button */}
          <button
            type="button"
            onClick={toggleMute}
            disabled={!isConnected}
            className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center transition-all ${
              isMuted
                ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
            } disabled:opacity-40 active:scale-95`}
          >
            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </button>

          {/* Speakerphone Button */}
          <button
            type="button"
            onClick={toggleSpeaker}
            disabled={!isConnected}
            className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center transition-all ${
              isSpeakerOn
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
            } disabled:opacity-40 active:scale-95`}
          >
            {isSpeakerOn ? <Volume2 className="w-6 h-6" /> : <VolumeX className="w-6 h-6" />}
          </button>

          {/* End / Cancel Call Button */}
          <button
            type="button"
            onClick={isConnected ? endCall : cancelCall}
            disabled={isEnding}
            className="w-16 h-16 rounded-2xl bg-red-600 hover:bg-red-700 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-red-600/40 transition-transform"
          >
            <PhoneOff className="w-7 h-7" />
          </button>
        </div>
      </div>
    </div>
  );
};
