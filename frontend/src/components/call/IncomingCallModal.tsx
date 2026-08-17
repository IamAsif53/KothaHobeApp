import React from 'react';
import { useCall } from '../../context/CallContext';
import { Phone, PhoneOff } from 'lucide-react';

export const IncomingCallModal: React.FC = () => {
  const { callState, activeCall, acceptCall, rejectCall } = useCall();

  if (callState !== 'RINGING' || !activeCall?.isIncoming) {
    return null;
  }

  const caller = activeCall.caller;
  const avatarUrl = caller?.avatarUrl || caller?.avatar;
  const displayName = caller?.displayName || 'Unknown Caller';

  return (
    <div className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md flex flex-col justify-between p-6 select-none animate-fadeIn">
      {/* Top Header */}
      <div className="pt-16 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-semibold uppercase tracking-wider mb-4 animate-bounce">
          <Phone className="w-3.5 h-3.5" />
          <span>Incoming Voice Call</span>
        </div>
        <h2 className="text-3xl font-bold text-white tracking-tight">{displayName}</h2>
        {caller?.username && (
          <p className="text-sm text-chat-textMuted mt-1">@{caller.username}</p>
        )}
        <p className="text-emerald-400 text-sm font-medium mt-3 animate-pulse">Ringing...</p>
      </div>

      {/* Center Avatar with Pulsing Rings */}
      <div className="flex flex-col items-center justify-center my-auto">
        <div className="relative flex items-center justify-center">
          <div className="absolute w-44 h-44 rounded-full bg-emerald-500/20 animate-ping duration-1000" />
          <div className="absolute w-36 h-36 rounded-full bg-emerald-500/30 animate-pulse" />

          <div className="w-28 h-28 rounded-full overflow-hidden border-2 border-emerald-500/60 shadow-2xl relative z-10 bg-[#202C33] flex items-center justify-center">
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

      {/* Bottom Accept / Decline Buttons */}
      <div className="pb-16 flex items-center justify-around max-w-xs mx-auto w-full">
        {/* Decline Button */}
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={rejectCall}
            className="w-16 h-16 rounded-full bg-red-600 hover:bg-red-700 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-red-600/40 transition-transform"
          >
            <PhoneOff className="w-7 h-7" />
          </button>
          <span className="text-xs text-chat-textMuted font-medium">Decline</span>
        </div>

        {/* Accept Button */}
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={acceptCall}
            className="w-16 h-16 rounded-full bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white flex items-center justify-center shadow-lg shadow-emerald-600/40 transition-transform animate-pulse"
          >
            <Phone className="w-7 h-7" />
          </button>
          <span className="text-xs text-emerald-400 font-medium">Accept</span>
        </div>
      </div>
    </div>
  );
};
