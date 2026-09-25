import React from 'react';
import { useGroupCall } from '../../context/GroupCallContext';
import { Phone, PhoneOff, Video, Users } from 'lucide-react';

export const IncomingGroupCallModal: React.FC = () => {
  const { incomingGroupCall, acceptIncomingGroupCall, declineIncomingGroupCall } = useGroupCall();

  if (!incomingGroupCall) return null;

  const isVideo = incomingGroupCall.callType === 'video';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-fadeIn">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl p-6 w-full max-w-sm shadow-2xl flex flex-col items-center text-center relative overflow-hidden">
        {/* Glowing Background Radial */}
        <div className="absolute -top-16 -left-16 w-36 h-36 bg-emerald-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -right-16 w-36 h-36 bg-indigo-500/20 rounded-full blur-3xl pointer-events-none" />

        {/* Group Avatar Ring */}
        <div className="relative mb-4 mt-2">
          <div className="w-24 h-24 rounded-full bg-slate-800 border-2 border-emerald-500/50 flex items-center justify-center overflow-hidden shadow-xl animate-pulse">
            {incomingGroupCall.groupAvatar ? (
              <img
                src={incomingGroupCall.groupAvatar}
                alt={incomingGroupCall.groupName}
                className="w-full h-full object-cover"
              />
            ) : (
              <Users className="w-12 h-12 text-emerald-400" />
            )}
          </div>
          <span className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-emerald-600 text-white shadow-md">
            {isVideo ? <Video className="w-4 h-4" /> : <Phone className="w-4 h-4" />}
          </span>
        </div>

        {/* Group Info */}
        <h3 className="text-xl font-bold text-white mb-1 line-clamp-1">
          {incomingGroupCall.groupName}
        </h3>
        <p className="text-sm text-emerald-400 font-medium mb-1 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
          Incoming Group {isVideo ? 'Video' : 'Voice'} Call
        </p>
        <p className="text-xs text-slate-400 mb-6">
          Started by <span className="text-slate-200 font-semibold">{incomingGroupCall.caller?.displayName || 'a member'}</span>
        </p>

        {/* Action Buttons */}
        <div className="flex items-center justify-center gap-6 w-full mt-2">
          {/* Decline Button */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={declineIncomingGroupCall}
              className="w-14 h-14 rounded-full bg-red-600/90 text-white flex items-center justify-center hover:bg-red-500 transition-all duration-200 active:scale-95 shadow-lg shadow-red-600/30"
              title="Decline"
            >
              <PhoneOff className="w-6 h-6" />
            </button>
            <span className="text-xs text-slate-400 font-medium">Decline</span>
          </div>

          {/* Accept Button */}
          <div className="flex flex-col items-center gap-1.5">
            <button
              onClick={acceptIncomingGroupCall}
              className="w-14 h-14 rounded-full bg-emerald-600 text-white flex items-center justify-center hover:bg-emerald-500 transition-all duration-200 active:scale-95 shadow-lg shadow-emerald-600/40 animate-bounce"
              title="Join Call"
            >
              {isVideo ? <Video className="w-6 h-6" /> : <Phone className="w-6 h-6" />}
            </button>
            <span className="text-xs text-emerald-400 font-medium font-semibold">Join</span>
          </div>
        </div>
      </div>
    </div>
  );
};
