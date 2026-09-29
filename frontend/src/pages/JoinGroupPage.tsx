import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Users,
  ShieldCheck,
  ShieldAlert,
  ArrowLeft,
  Loader2,
  CheckCircle2,
  Clock,
  MessageSquare,
  Sparkles,
  AlertCircle,
  Share2,
} from 'lucide-react';
import { previewGroupByInviteCodeApi, joinGroupByInviteCodeApi } from '../api/groupApi';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Avatar } from '../components/common/Avatar';

export const JoinGroupPage: React.FC = () => {
  const { inviteCode } = useParams<{ inviteCode: string }>();
  const navigate = useNavigate();
  const { user: currentUser } = useAuth();
  const { themeConfig } = useTheme();

  const [loading, setLoading] = useState(true);
  const [group, setGroup] = useState<{
    _id: string;
    name: string;
    avatarUrl?: string;
    description?: string;
    memberCount: number;
    creator: any;
    requiresApproval: boolean;
    isMember: boolean;
    isPending: boolean;
  } | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [requestSubmitted, setRequestSubmitted] = useState(false);

  useEffect(() => {
    if (!inviteCode) {
      setError('No invite code provided');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    previewGroupByInviteCodeApi(inviteCode)
      .then((res) => {
        if (res.success && res.group) {
          setGroup(res.group);
          if (res.group.isPending) {
            setRequestSubmitted(true);
          }
        } else {
          setError('This group invite link is invalid or has been reset.');
        }
      })
      .catch((err) => {
        setError(err?.message || 'Failed to load group invite');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [inviteCode]);

  const handleJoin = async () => {
    if (!inviteCode || joining) return;
    setJoining(true);
    setError(null);

    try {
      const res = await joinGroupByInviteCodeApi(inviteCode);
      if (res.success) {
        if (res.requested) {
          setRequestSubmitted(true);
        } else if (res.conversationId) {
          navigate(`/chat/${res.conversationId}`, { replace: true });
        }
      } else {
        setError(res.message || 'Failed to join group');
      }
    } catch (err: any) {
      setError(err?.message || 'Error joining group');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div
      style={{ backgroundColor: themeConfig.bg }}
      className="flex-1 flex flex-col h-full text-chat-textPrimary safe-top safe-bottom select-none transition-colors duration-200"
    >
      {/* Top Header */}
      <div
        style={{ backgroundColor: themeConfig.panel }}
        className="px-4 py-3 border-b border-chat-border flex items-center justify-between z-10"
      >
        <button
          onClick={() => navigate('/chats', { replace: true })}
          className="p-2 rounded-full text-chat-textMuted hover:text-chat-textPrimary hover:bg-chat-card transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h2 className="text-base font-bold text-chat-textPrimary">Group Invitation</h2>
        <div className="w-9" />
      </div>

      {/* Main Body */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center text-brand-500 py-12">
            <Loader2 className="w-10 h-10 animate-spin mb-3" />
            <p className="text-sm text-chat-textMuted font-medium">Resolving group invite...</p>
          </div>
        ) : error ? (
          <div className="w-full max-w-sm p-6 rounded-3xl bg-chat-card border border-chat-border text-center space-y-4 shadow-xl">
            <div className="w-16 h-16 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-500 flex items-center justify-center mx-auto">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-chat-textPrimary">Invalid Invite Link</h3>
            <p className="text-xs text-chat-textMuted leading-relaxed">{error}</p>
            <button
              onClick={() => navigate('/chats', { replace: true })}
              className="w-full py-3 rounded-2xl bg-chat-panel border border-chat-border hover:bg-chat-border/50 text-chat-textPrimary text-sm font-semibold transition-all"
            >
              Back to Chats
            </button>
          </div>
        ) : group ? (
          <div className="w-full max-w-sm p-6 rounded-3xl bg-chat-card border border-chat-border flex flex-col items-center text-center shadow-2xl space-y-5 animate-fadeIn">
            {/* Avatar */}
            <div className="relative">
              <div className="w-24 h-24 rounded-3xl bg-chat-panel border-2 border-brand-500/40 flex items-center justify-center overflow-hidden shadow-lg">
                {group.avatarUrl ? (
                  <img
                    src={group.avatarUrl}
                    alt={group.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Users className="w-12 h-12 text-brand-400" />
                )}
              </div>
              <div className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-brand-500 text-white shadow-md">
                <Sparkles className="w-4 h-4" />
              </div>
            </div>

            {/* Title & Members */}
            <div className="space-y-1">
              <h1 className="text-xl font-bold text-chat-textPrimary">{group.name}</h1>
              <p className="text-xs font-semibold text-brand-500">
                {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
              </p>
            </div>

            {/* Description */}
            {group.description && (
              <div className="w-full p-3.5 rounded-2xl bg-chat-panel border border-chat-border text-left">
                <p className="text-xs text-chat-textMuted leading-relaxed line-clamp-4">
                  {group.description}
                </p>
              </div>
            )}

            {/* Privacy Badge */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-chat-panel border border-chat-border text-[11px] font-medium text-chat-textMuted">
              {group.requiresApproval ? (
                <>
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                  <span>Admin Approval Required</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                  <span>Direct Join Allowed</span>
                </>
              )}
            </div>

            {/* Action State */}
            {group.isMember ? (
              <button
                onClick={() => navigate(`/chat/${group._id}`, { replace: true })}
                className="w-full py-3.5 px-4 bg-brand-500 hover:bg-brand-600 active:scale-98 text-white text-sm font-bold rounded-2xl transition-all shadow-lg shadow-brand-500/25 flex items-center justify-center gap-2"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Open Group Chat</span>
              </button>
            ) : requestSubmitted || group.isPending ? (
              <div className="w-full p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-500 flex flex-col items-center gap-2">
                <Clock className="w-6 h-6 animate-pulse" />
                <h4 className="text-sm font-bold">Join Request Pending</h4>
                <p className="text-xs text-amber-400/90 leading-relaxed text-center">
                  Your request has been sent to group admins. You will be able to enter once approved.
                </p>
                <button
                  onClick={() => navigate('/chats', { replace: true })}
                  className="mt-2 text-xs font-semibold text-chat-textMuted hover:text-chat-textPrimary underline"
                >
                  Return to Chats
                </button>
              </div>
            ) : (
              <button
                onClick={handleJoin}
                disabled={joining}
                className="w-full py-3.5 px-4 bg-brand-500 hover:bg-brand-600 active:scale-98 text-white text-sm font-bold rounded-2xl transition-all shadow-lg shadow-brand-500/25 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {joining ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : group.requiresApproval ? (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>Request to Join Group</span>
                  </>
                ) : (
                  <>
                    <Users className="w-4 h-4" />
                    <span>Join Group</span>
                  </>
                )}
              </button>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};
