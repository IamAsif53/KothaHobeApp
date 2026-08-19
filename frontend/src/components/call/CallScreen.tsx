import React, { useState } from 'react';
import { useCall } from '../../context/CallContext';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  PhoneOff,
  Phone,
  Activity,
  ChevronDown,
  ChevronUp,
  Radio,
  Wifi,
} from 'lucide-react';

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
  const [hudExpanded, setHudExpanded] = useState<boolean>(true);

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
        return 'Connecting audio (ICE Negotiation)...';
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
      setDiagnosticMsg(`🎙️ Mic Live: ${res.trackInfo.label || 'Active'} (enabled=${res.trackInfo.enabled})`);
    } else {
      setDiagnosticMsg(`⚠️ Mic Error: ${res.error || 'Track not ready'}`);
    }
    setTimeout(() => setDiagnosticMsg(null), 3500);
  };

  const handleTestSpeaker = () => {
    const res = testRemoteAudio();
    if (res.ok) {
      setDiagnosticMsg(`🔊 Speaker Output Active (Paused=${res.details.paused}, Vol=${res.details.volume})`);
    } else {
      setDiagnosticMsg(`⚠️ Speaker Note: ${res.error || 'Awaiting stream'}`);
    }
    setTimeout(() => setDiagnosticMsg(null), 3500);
  };

  // Candidate Counts & Pair Helpers
  const counts = audioStats?.candidateCounts || { total: 0, host: 0, srflx: 0, relay: 0, prflx: 0 };
  const gatheringState = audioStats?.iceGatheringState || 'new';
  const selectedPair = audioStats?.selectedCandidatePair;
  const pairDisplay = selectedPair
    ? `${selectedPair.localCandidateType.toUpperCase()} ↔ ${selectedPair.remoteCandidateType.toUpperCase()} (${selectedPair.protocol.toUpperCase()}${selectedPair.rtt ? `, ${selectedPair.rtt}ms` : ''})`
    : counts.total > 0
    ? 'PENDING'
    : 'GATHERING';

  return (
    <div className="fixed inset-0 z-[100] bg-gradient-to-b from-[#0B141A] via-[#111B21] to-[#0B141A] flex flex-col justify-between p-3 select-none animate-fadeIn overflow-y-auto">
      {/* Top Header */}
      <div className="pt-6 text-center flex-shrink-0">
        <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-white/5 border border-white/10 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-1.5">
          <Phone className="w-3.5 h-3.5" />
          <span>Kotha Hobe Voice Call</span>
        </div>
        <h2 className="text-lg font-bold text-white tracking-tight">{displayName}</h2>
        {otherParticipant?.username && (
          <p className="text-xs text-chat-textMuted">@{otherParticipant.username}</p>
        )}
        <p
          className={`text-sm font-medium mt-1 transition-colors ${
            isConnected ? 'text-emerald-400 font-mono text-base font-bold' : 'text-chat-textMuted'
          }`}
        >
          {getStatusText()}
        </p>

        {/* Diagnostic Pop-up Message */}
        {diagnosticMsg && (
          <div className="mt-1.5 text-xs font-medium text-amber-300 bg-amber-950/80 border border-amber-500/40 px-3 py-1 rounded-lg inline-block animate-fade-in shadow-lg">
            {diagnosticMsg}
          </div>
        )}
      </div>

      {/* =========================================================================
          REAL-TIME WEBRTC DIAGNOSTIC HUD (ALL 15 REQUIRED METRICS)
         ========================================================================= */}
      <div className="my-1.5 bg-black/85 border border-emerald-500/30 rounded-xl p-2.5 shadow-2xl backdrop-blur-md text-left max-w-sm mx-auto w-full transition-all">
        <div
          onClick={() => setHudExpanded(!hudExpanded)}
          className="flex items-center justify-between cursor-pointer border-b border-white/10 pb-1"
        >
          <div className="flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            <span className="text-[11px] font-bold text-emerald-400 uppercase tracking-wide">
              WebRTC Diagnostic HUD
            </span>
          </div>
          <button
            type="button"
            className="text-[10px] text-chat-textMuted hover:text-white flex items-center gap-1"
          >
            <span>{hudExpanded ? 'Collapse' : 'Expand'}</span>
            {hudExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {hudExpanded && (
          <div className="pt-1.5 space-y-1 font-mono text-[10px] text-gray-300">
            {/* Top Status Bar: Call State, ICE State, Conn State, DTLS State */}
            <div className="grid grid-cols-4 gap-1 pb-1 border-b border-white/5">
              <div>
                <span className="text-gray-400">CALL:</span>{' '}
                <span className={callState === 'CONNECTED' ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                  {callState}
                </span>
              </div>
              <div>
                <span className="text-gray-400">ICE:</span>{' '}
                <span
                  className={
                    audioStats?.iceState === 'connected' || audioStats?.iceState === 'completed'
                      ? 'text-emerald-400 font-bold'
                      : audioStats?.iceState === 'failed' || audioStats?.iceState === 'disconnected'
                      ? 'text-red-400 font-bold'
                      : 'text-amber-400'
                  }
                >
                  {audioStats?.iceState || 'idle'}
                </span>
              </div>
              <div>
                <span className="text-gray-400">CONN:</span>{' '}
                <span
                  className={
                    audioStats?.connectionState === 'connected'
                      ? 'text-emerald-400 font-bold'
                      : audioStats?.connectionState === 'failed'
                      ? 'text-red-400 font-bold'
                      : 'text-amber-400'
                  }
                >
                  {audioStats?.connectionState || 'idle'}
                </span>
              </div>
              <div>
                <span className="text-gray-400">DTLS:</span>{' '}
                <span
                  className={
                    audioStats?.dtlsState === 'connected'
                      ? 'text-emerald-400 font-bold'
                      : audioStats?.dtlsState === 'failed'
                      ? 'text-red-400 font-bold'
                      : 'text-amber-400'
                  }
                >
                  {audioStats?.dtlsState || 'idle'}
                </span>
              </div>
            </div>

            {/* Candidate Counts & Gathering State */}
            <div className="pb-1 border-b border-white/5 space-y-0.5">
              <div className="flex justify-between">
                <span className="text-gray-400">ICE Gathering:</span>
                <span className="text-sky-300 font-semibold">{gatheringState.toUpperCase()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Candidates Total:</span>
                <span className="text-white font-bold">{counts.total} (Host: {counts.host}, SRFLX: {counts.srflx}, Relay: {counts.relay})</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">TURN Relay:</span>
                <span className={counts.relay > 0 ? 'text-emerald-400 font-bold' : 'text-red-400 font-bold'}>
                  {counts.relay > 0 ? `AVAILABLE (${counts.relay} relay candidates)` : 'UNAVAILABLE (0 relay)'}
                </span>
              </div>
            </div>

            {/* Selected Candidate Pair */}
            <div className="pb-1 border-b border-white/5">
              <span className="text-gray-400">Selected Pair:</span>{' '}
              <span className={selectedPair ? 'text-emerald-400 font-bold' : 'text-amber-400'}>
                {pairDisplay}
              </span>
            </div>

            {/* Local & Remote Audio Track State */}
            <div className="space-y-0.5 pb-1 border-b border-white/5">
              <div className="truncate">
                <span className="text-gray-400">Local Mic:</span>{' '}
                {audioStats?.localTrackStatus ? (
                  <span
                    className={
                      audioStats.localTrackStatus.readyState === 'live' && audioStats.localTrackStatus.enabled
                        ? 'text-emerald-400 font-bold'
                        : 'text-red-400'
                    }
                  >
                    {audioStats.localTrackStatus.readyState.toUpperCase()} /{' '}
                    {audioStats.localTrackStatus.enabled ? 'ENABLED' : 'MUTED'}
                  </span>
                ) : (
                  <span className="text-gray-500">Not initialized</span>
                )}
              </div>
              <div className="truncate">
                <span className="text-gray-400">Remote Track:</span>{' '}
                {audioStats?.remoteTrackStatus ? (
                  <span
                    className={
                      audioStats.remoteTrackStatus.readyState === 'live'
                        ? 'text-emerald-400 font-bold'
                        : 'text-red-400'
                    }
                  >
                    {audioStats.remoteTrackStatus.readyState.toUpperCase()} /{' '}
                    {audioStats.remoteTrackStatus.enabled ? 'ENABLED' : 'DISABLED'}
                  </span>
                ) : (
                  <span className="text-gray-500">Awaiting remote track...</span>
                )}
              </div>
            </div>

            {/* RTP Packet Counters */}
            <div className="grid grid-cols-2 gap-1 pb-1 border-b border-white/5">
              <div className="bg-white/5 p-1 rounded">
                <div className="text-[9px] text-gray-400">Outbound RTP</div>
                <div className="text-[11px] text-emerald-400 font-bold">
                  {audioStats?.packetsSent ?? 0} pkts
                </div>
                <div className="text-[8px] text-gray-400">
                  {((audioStats?.bytesSent ?? 0) / 1024).toFixed(1)} KB
                </div>
              </div>
              <div className="bg-white/5 p-1 rounded">
                <div className="text-[9px] text-gray-400">Inbound RTP</div>
                <div className="text-[11px] text-sky-400 font-bold">
                  {audioStats?.packetsReceived ?? 0} pkts
                </div>
                <div className="text-[8px] text-gray-400">
                  {((audioStats?.bytesReceived ?? 0) / 1024).toFixed(1)} KB (Lost: {audioStats?.packetsLost ?? 0})
                </div>
              </div>
            </div>

            {/* Remote Audio Element Playback State */}
            <div className="text-[9px] bg-white/5 p-1 rounded flex items-center justify-between">
              <span className="text-gray-400">Audio Element:</span>
              <span
                className={
                  audioStats?.remoteAudioElementStatus?.playbackState === 'PLAYING'
                    ? 'text-emerald-400 font-bold'
                    : 'text-amber-400'
                }
              >
                {audioStats?.remoteAudioElementStatus?.playbackState || 'NOT_MOUNTED'} (Src:{' '}
                {audioStats?.remoteAudioElementStatus?.srcObjectPresent ? 'YES' : 'NO'}, Vol:{' '}
                {audioStats?.remoteAudioElementStatus?.volume ?? 1}, Muted:{' '}
                {audioStats?.remoteAudioElementStatus?.muted ? 'YES' : 'NO'})
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Center Avatar */}
      <div className="flex flex-col items-center justify-center my-auto flex-shrink-0">
        <div className="relative flex items-center justify-center">
          {!isEnding && (
            <>
              <div className="absolute w-32 h-32 rounded-full bg-emerald-500/10 animate-ping duration-1000" />
              <div className="absolute w-28 h-28 rounded-full bg-emerald-500/20 animate-pulse" />
            </>
          )}

          <div className="w-20 h-20 rounded-full overflow-hidden border-2 border-emerald-500/40 shadow-2xl relative z-10 bg-[#202C33] flex items-center justify-center">
            {avatarUrl ? (
              <img src={avatarUrl} alt={displayName} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-emerald-700 flex items-center justify-center text-white text-xl font-bold">
                {displayName.charAt(0).toUpperCase()}
              </div>
            )}
          </div>
        </div>

        {/* Quick Diagnostic Test Buttons */}
        <div className="flex items-center gap-2 mt-3">
          <button
            type="button"
            onClick={handleTestMic}
            className="text-[10px] font-medium text-white/80 bg-white/10 hover:bg-white/20 active:scale-95 px-2.5 py-1 rounded-full border border-white/10 transition-colors"
          >
            Check Mic
          </button>
          <button
            type="button"
            onClick={handleTestSpeaker}
            className="text-[10px] font-medium text-white/80 bg-white/10 hover:bg-white/20 active:scale-95 px-2.5 py-1 rounded-full border border-white/10 transition-colors"
          >
            Check Speaker
          </button>
        </div>
      </div>

      {/* Bottom Floating Control Bar */}
      <div className="pb-4 pt-1 flex flex-col items-center gap-3 flex-shrink-0">
        <div className="flex items-center justify-center gap-5 bg-white/5 border border-white/10 backdrop-blur-md px-5 py-2.5 rounded-3xl shadow-2xl">
          {/* Mute Button */}
          <button
            type="button"
            onClick={toggleMute}
            disabled={!isConnected}
            className={`w-11 h-11 rounded-2xl flex flex-col items-center justify-center transition-all ${
              isMuted
                ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
            } disabled:opacity-40 active:scale-95`}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </button>

          {/* Speakerphone Button */}
          <button
            type="button"
            onClick={toggleSpeaker}
            disabled={!isConnected}
            className={`w-11 h-11 rounded-2xl flex flex-col items-center justify-center transition-all ${
              isSpeakerOn
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                : 'bg-white/10 hover:bg-white/20 text-white border border-white/10'
            } disabled:opacity-40 active:scale-95`}
          >
            {isSpeakerOn ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* End / Cancel Call Button */}
          <button
            type="button"
            onClick={isConnected ? endCall : cancelCall}
            disabled={isEnding}
            className="w-12 h-12 rounded-2xl bg-red-600 hover:bg-red-700 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-red-600/40 transition-transform"
          >
            <PhoneOff className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
