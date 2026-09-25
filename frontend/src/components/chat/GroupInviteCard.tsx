import React, { useState } from 'react';
import { Users, Check, X, Loader2 } from 'lucide-react';
import { acceptGroupInviteApi, declineGroupInviteApi } from '../../api/groupApi';
import { IConversation } from '../../types';

interface GroupInviteCardProps {
  conversation: IConversation;
  onAccepted?: (conversationId: string) => void;
  onDeclined?: (conversationId: string) => void;
}

export const GroupInviteCard: React.FC<GroupInviteCardProps> = ({
  conversation,
  onAccepted,
  onDeclined,
}) => {
  const [isAccepting, setIsAccepting] = useState(false);
  const [isDeclining, setIsDeclining] = useState(false);

  const groupName = conversation.groupMeta?.name || 'Group Invitation';
  const groupAvatar = conversation.groupMeta?.avatarUrl;

  const handleAccept = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsAccepting(true);
    try {
      const res = await acceptGroupInviteApi(conversation._id);
      if (res.success && onAccepted) {
        onAccepted(conversation._id);
      }
    } catch (err) {
      console.error('Failed to accept group invite:', err);
    } finally {
      setIsAccepting(false);
    }
  };

  const handleDecline = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsDeclining(true);
    try {
      const res = await declineGroupInviteApi(conversation._id);
      if (res.success && onDeclined) {
        onDeclined(conversation._id);
      }
    } catch (err) {
      console.error('Failed to decline group invite:', err);
    } finally {
      setIsDeclining(false);
    }
  };

  return (
    <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-800/80 to-slate-900 border border-emerald-500/30 shadow-md mb-2 transition-all hover:border-emerald-500/50">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 rounded-2xl bg-slate-800 border border-emerald-500/40 flex items-center justify-center overflow-hidden shrink-0">
          {groupAvatar ? (
            <img src={groupAvatar} alt={groupName} className="w-full h-full object-cover" />
          ) : (
            <Users className="w-6 h-6 text-emerald-400" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">
              Group Invite
            </span>
          </div>
          <h4 className="text-sm font-bold text-white truncate mt-0.5">{groupName}</h4>
          <p className="text-xs text-slate-400 truncate">
            {conversation.groupMeta?.members?.length || 1} members
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          onClick={handleDecline}
          disabled={isDeclining || isAccepting}
          className="flex-1 py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-xs border border-slate-700 flex items-center justify-center gap-1.5 transition-colors active:scale-95 disabled:opacity-50"
        >
          {isDeclining ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
          <span>Decline</span>
        </button>

        <button
          onClick={handleAccept}
          disabled={isAccepting || isDeclining}
          className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-md shadow-emerald-600/30 flex items-center justify-center gap-1.5 transition-colors active:scale-95 disabled:opacity-50"
        >
          {isAccepting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
          <span>Accept & Join</span>
        </button>
      </div>
    </div>
  );
};
