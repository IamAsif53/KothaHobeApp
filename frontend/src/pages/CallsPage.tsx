import React, { useState, useEffect, useCallback, useTransition } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCall } from '../context/CallContext';
import { useGroupCall } from '../context/GroupCallContext';
import { useTheme } from '../context/ThemeContext';
import { Avatar } from '../components/common/Avatar';
import {
  fetchCallHistoryApi,
  CallHistoryItem,
  CallHistoryParticipant,
} from '../api/callApi';
import {
  Phone,
  Video,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Clock,
  Users,
} from 'lucide-react';

export const CallsPage: React.FC = () => {
  const { themeConfig } = useTheme();
  const { user } = useAuth();
  const { startCall } = useCall();
  const { startGroupCall } = useGroupCall();
  const navigate = useNavigate();

  const [filter, setFilter] = useState<'all' | 'missed'>('all');
  const [calls, setCalls] = useState<CallHistoryItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [loadingMore, setLoadingMore] = useState<boolean>(false);
  const [, startTransition] = useTransition();

  const currentUserId = user?._id?.toString();

  const loadHistory = useCallback(
    async (targetPage = 1, currentFilter = filter, isRefresh = false) => {
      if (targetPage === 1 && !isRefresh) {
        setLoading(true);
      } else if (isRefresh) {
        setRefreshing(true);
      } else {
        setLoadingMore(true);
      }

      try {
        const res = await fetchCallHistoryApi({
          page: targetPage,
          limit: 25,
          filter: currentFilter,
        });

        if (res.success && res.calls) {
          if (targetPage === 1) {
            setCalls(res.calls);
          } else {
            setCalls((prev) => {
              const existingIds = new Set(prev.map((c) => c._id || c.callId));
              const newCalls = res.calls.filter((c) => !existingIds.has(c._id || c.callId));
              return [...prev, ...newCalls];
            });
          }
          setPage(targetPage);
          setHasMore(res.pagination?.hasMore || false);
        }
      } catch (err) {
        console.error('[CallsPage] Error fetching call history:', err);
      } finally {
        setLoading(false);
        setRefreshing(false);
        setLoadingMore(false);
      }
    },
    [filter]
  );

  useEffect(() => {
    loadHistory(1, filter);
  }, [filter, loadHistory]);

  const handleFilterChange = (newFilter: 'all' | 'missed') => {
    if (newFilter === filter) return;
    setFilter(newFilter);
    startTransition(() => {
      setCalls([]);
    });
  };

  const handleRedial = (call: CallHistoryItem, e: React.MouseEvent) => {
    e.stopPropagation();

    if (call.isGroup && call.conversation?._id) {
      startGroupCall(
        call.conversation._id,
        call.conversation.name || 'Group Call',
        call.conversation.avatar,
        call.callType
      );
      return;
    }

    const otherParticipant: CallHistoryParticipant | null =
      call.direction === 'outgoing' ? call.receiver : call.caller;

    if (otherParticipant && call.conversation?._id) {
      startCall(
        {
          _id: otherParticipant._id,
          displayName: otherParticipant.displayName || otherParticipant.username || 'User',
          avatar: otherParticipant.avatar,
          username: otherParticipant.username,
        },
        call.conversation._id,
        call.callType
      );
    }
  };

  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return '';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins >= 60) {
      const hrs = Math.floor(mins / 60);
      const remMins = mins % 60;
      return `${hrs}h ${remMins}m`;
    }
    if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  const formatCallDate = (dateStr: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();

    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    if (isToday) {
      return `Today, ${timeStr}`;
    }
    if (isYesterday) {
      return `Yesterday, ${timeStr}`;
    }

    const isThisYear = date.getFullYear() === now.getFullYear();
    const monthDay = date.toLocaleDateString([], {
      month: 'short',
      day: 'numeric',
      ...(isThisYear ? {} : { year: 'numeric' }),
    });

    return `${monthDay}, ${timeStr}`;
  };

  return (
    <div
      style={{ backgroundColor: themeConfig.bg }}
      className="h-full w-full flex flex-col overflow-hidden select-none transition-colors duration-200"
    >
      {/* Top Header */}
      <header
        style={{ backgroundColor: themeConfig.panel }}
        className="pt-10 pb-3 px-4 border-b border-chat-border flex flex-col gap-3 flex-shrink-0 z-10 transition-colors duration-200"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold text-chat-textPrimary tracking-tight">Calls</h1>
          </div>

          <button
            onClick={() => loadHistory(1, filter, true)}
            disabled={refreshing}
            className={`p-2 rounded-full hover:bg-chat-surfaceSecondary text-chat-textMuted hover:text-chat-textPrimary transition-all ${
              refreshing ? 'animate-spin text-brand-500' : 'active:scale-95'
            }`}
            title="Refresh Calls"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 bg-chat-input/50 p-1 rounded-xl border border-white/5">
          <button
            onClick={() => handleFilterChange('all')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
              filter === 'all'
                ? 'bg-chat-surfaceSecondary text-chat-textPrimary shadow-sm'
                : 'text-chat-textMuted hover:text-chat-textSecondary'
            }`}
          >
            All Calls
          </button>
          <button
            onClick={() => handleFilterChange('missed')}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
              filter === 'missed'
                ? 'bg-red-500/15 text-red-500 shadow-sm'
                : 'text-chat-textMuted hover:text-chat-textSecondary'
            }`}
          >
            Missed
          </button>
        </div>
      </header>

      {/* Main Call History List */}
      <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
        {loading ? (
          <div className="space-y-3 p-2">
            {[1, 2, 3, 4, 5, 6].map((idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 p-3 rounded-2xl bg-chat-surface/40 animate-pulse border border-white/5"
              >
                <div className="w-11 h-11 rounded-full bg-chat-surfaceSecondary flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-chat-surfaceSecondary rounded w-1/3" />
                  <div className="h-3 bg-chat-surfaceSecondary rounded w-1/2" />
                </div>
                <div className="w-8 h-8 rounded-full bg-chat-surfaceSecondary" />
              </div>
            ))}
          </div>
        ) : calls.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 gap-3">
            <div className="w-16 h-16 rounded-full bg-chat-surfaceSecondary flex items-center justify-center text-chat-textMuted shadow-inner">
              {filter === 'missed' ? (
                <PhoneMissed className="w-8 h-8 text-red-400" />
              ) : (
                <Phone className="w-8 h-8 text-chat-textMuted" />
              )}
            </div>
            <div>
              <h3 className="text-base font-semibold text-chat-textPrimary">
                {filter === 'missed' ? 'No Missed Calls' : 'No Call History'}
              </h3>
              <p className="text-xs text-chat-textMuted mt-1 max-w-xs">
                {filter === 'missed'
                  ? 'You do not have any missed calls.'
                  : 'Calls you make and receive will appear here with duration and call details.'}
              </p>
            </div>
          </div>
        ) : (
          <>
            {calls.map((call) => {
              const isGroup = call.isGroup;
              const isOutgoing = call.direction === 'outgoing';
              const isMissed =
                call.status === 'missed' ||
                (!isOutgoing && (call.status === 'declined' || call.status === 'cancelled' || call.status === 'failed') && call.duration === 0);

              const otherParty: CallHistoryParticipant | null = isOutgoing ? call.receiver : call.caller;
              const displayName = isGroup
                ? call.conversation?.name || 'Group Call'
                : otherParty?.displayName || otherParty?.username || 'Kotha Hobe User';
              const avatarUrl = isGroup ? call.conversation?.avatar : otherParty?.avatar;

              const durationText = formatDuration(call.duration);
              const dateText = formatCallDate(call.startedAt);

              return (
                <div
                  key={call._id || call.callId}
                  onClick={() => {
                    if (call.conversation?._id) {
                      navigate(`/chat/${call.conversation._id}`);
                    }
                  }}
                  className="flex items-center justify-between p-3 rounded-2xl hover:bg-chat-surfaceSecondary/60 active:bg-chat-surfaceSecondary transition-colors cursor-pointer border border-transparent hover:border-white/5"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    {/* Avatar */}
                    {isGroup ? (
                      <div className="w-11 h-11 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white flex-shrink-0 shadow-sm border border-white/10">
                        <Users className="w-5 h-5" />
                      </div>
                    ) : (
                      <Avatar
                        src={avatarUrl}
                        name={displayName}
                        size="md"
                        className="flex-shrink-0"
                      />
                    )}

                    {/* Info */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h4
                          className={`text-sm font-semibold truncate ${
                            isMissed ? 'text-red-500 dark:text-red-400' : 'text-chat-textPrimary'
                          }`}
                        >
                          {displayName}
                        </h4>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-chat-textMuted mt-0.5">
                        {/* Call Direction & Status Icon */}
                        {isMissed ? (
                          <PhoneMissed className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />
                        ) : isOutgoing ? (
                          <ArrowUpRight className="w-3.5 h-3.5 text-brand-500 flex-shrink-0" />
                        ) : (
                          <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                        )}

                        <span className="truncate">
                          {isMissed
                            ? 'Missed call'
                            : isOutgoing
                            ? 'Outgoing'
                            : 'Incoming'}
                        </span>

                        <span>•</span>
                        <span className="truncate">{dateText}</span>

                        {durationText && (
                          <>
                            <span>•</span>
                            <span className="text-[11px] font-medium text-chat-textSecondary">
                              {durationText}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Redial Action Button */}
                  <button
                    type="button"
                    onClick={(e) => handleRedial(call, e)}
                    className="p-2.5 rounded-full hover:bg-brand-500/10 active:bg-brand-500/20 text-brand-500 transition-all flex-shrink-0 ml-2 pressable-icon"
                    title={call.callType === 'video' ? 'Redial Video Call' : 'Redial Voice Call'}
                  >
                    {call.callType === 'video' ? (
                      <Video className="w-5 h-5" />
                    ) : (
                      <Phone className="w-5 h-5" />
                    )}
                  </button>
                </div>
              );
            })}

            {/* Load More Button */}
            {hasMore && (
              <div className="pt-2 pb-4 text-center">
                <button
                  type="button"
                  onClick={() => loadHistory(page + 1, filter)}
                  disabled={loadingMore}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-chat-surfaceSecondary text-chat-textPrimary hover:bg-chat-surfaceSecondary/80 active:scale-95 transition-all inline-flex items-center gap-2 border border-white/5 shadow-sm"
                >
                  {loadingMore ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
                      <span>Loading...</span>
                    </>
                  ) : (
                    <span>Load Older Calls</span>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
