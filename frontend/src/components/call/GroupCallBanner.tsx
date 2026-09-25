import React from 'react';
import { useGroupCall } from '../../context/GroupCallContext';
import { Phone, Video, Users } from 'lucide-react';

interface GroupCallBannerProps {
  conversationId: string;
  groupName: string;
  groupAvatar?: string;
}

export const GroupCallBanner: React.FC<GroupCallBannerProps> = ({
  conversationId,
  groupName,
  groupAvatar,
}) => {
  const { activeBanners, isGroupCallActive, groupCallSession, joinGroupCall } = useGroupCall();

  const banner = activeBanners.get(conversationId);
  if (!banner || !banner.isActive || !banner.callId) {
    return null;
  }

  const isAlreadyInThisCall =
    isGroupCallActive && groupCallSession?.conversationId === conversationId;

  if (isAlreadyInThisCall) {
    return null;
  }

  const isVideo = banner.callType === 'video';

  const handleJoin = () => {
    if (banner.callId) {
      joinGroupCall(banner.callId, conversationId, groupName, groupAvatar, banner.callType);
    }
  };

  return (
    <div className="mx-4 my-2 p-3 rounded-2xl bg-gradient-to-r from-emerald-950/80 via-slate-900 to-emerald-950/80 border border-emerald-500/40 shadow-lg flex items-center justify-between animate-fadeIn z-20">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-emerald-600/30 border border-emerald-500/50 flex items-center justify-center text-emerald-400">
          {isVideo ? <Video className="w-5 h-5 animate-pulse" /> : <Phone className="w-5 h-5 animate-pulse" />}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
            <h4 className="text-sm font-bold text-white leading-none">
              Group {isVideo ? 'Video' : 'Voice'} Call in Progress
            </h4>
          </div>
          <p className="text-xs text-emerald-400/90 font-medium mt-1 flex items-center gap-1">
            <Users className="w-3.5 h-3.5" />
            <span>{banner.participantCount || 1} participant{(banner.participantCount || 1) > 1 ? 's' : ''} active</span>
          </p>
        </div>
      </div>

      <button
        onClick={handleJoin}
        className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md shadow-emerald-600/30 flex items-center gap-1.5 transition-all duration-200 active:scale-95"
      >
        <span>Join</span>
      </button>
    </div>
  );
};
