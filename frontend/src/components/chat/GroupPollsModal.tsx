import React, { useState, useEffect } from 'react';
import {
  X,
  BarChart2,
  Plus,
  Trash2,
  CheckCircle2,
  Lock,
  Loader2,
  Vote,
  Minus,
} from 'lucide-react';
import { IGroupPoll } from '../../types';
import {
  fetchGroupPollsApi,
  createGroupPollApi,
  voteGroupPollApi,
  closeGroupPollApi,
} from '../../api/groupApi';

interface GroupPollsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  currentUserId: string;
  canCreatePoll: boolean;
  canManagePolls: boolean;
}

export const GroupPollsModal: React.FC<GroupPollsModalProps> = ({
  isOpen,
  onClose,
  groupId,
  currentUserId,
  canCreatePoll,
  canManagePolls,
}) => {
  const [polls, setPolls] = useState<IGroupPoll[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [savingPoll, setSavingPoll] = useState(false);
  const [votingPollId, setVotingPollId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);

  const loadPolls = async () => {
    if (!groupId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchGroupPollsApi(groupId);
      if (res.success && res.polls) {
        setPolls(res.polls);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load group polls');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadPolls();
    }
  }, [isOpen, groupId]);

  if (!isOpen) return null;

  const handleAddOption = () => {
    if (options.length < 6) {
      setOptions([...options, '']);
    }
  };

  const handleRemoveOption = (index: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== index));
    }
  };

  const handleOptionChange = (index: number, val: string) => {
    const updated = [...options];
    updated[index] = val;
    setOptions(updated);
  };

  const handleCreatePoll = async (e: React.FormEvent) => {
    e.preventDefault();
    const validOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim()) {
      setError('Poll question is required');
      return;
    }
    if (validOptions.length < 2) {
      setError('Please provide at least 2 valid options');
      return;
    }

    setSavingPoll(true);
    setError(null);
    try {
      const res = await createGroupPollApi(groupId, {
        question: question.trim(),
        options: validOptions,
      });
      if (res.success && res.poll) {
        setPolls((prev) => [res.poll, ...prev]);
        setIsCreating(false);
        setQuestion('');
        setOptions(['', '']);
      } else {
        setError(res.message || 'Failed to create poll');
      }
    } catch (err: any) {
      setError(err?.message || 'Error creating poll');
    } finally {
      setSavingPoll(false);
    }
  };

  const handleVote = async (pollId: string, optionIndex: number) => {
    setVotingPollId(pollId);
    setError(null);
    try {
      const res = await voteGroupPollApi(groupId, pollId, optionIndex);
      if (res.success && res.poll) {
        setPolls((prev) => prev.map((p) => (p._id === pollId ? res.poll : p)));
      }
    } catch (err: any) {
      setError(err?.message || 'Error recording vote');
    } finally {
      setVotingPollId(null);
    }
  };

  const handleClosePoll = async (pollId: string) => {
    if (!window.confirm('Are you sure you want to end and close this poll?')) return;
    try {
      const res = await closeGroupPollApi(groupId, pollId);
      if (res.success) {
        setPolls((prev) =>
          prev.map((p) => (p._id === pollId ? { ...p, isClosed: true } : p))
        );
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to close poll');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg bg-chat-panel border border-chat-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-chat-border">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-brand-500/10 text-brand-500 rounded-lg">
              <BarChart2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-chat-textPrimary">Group Polls</h3>
              <p className="text-xs text-chat-textMuted">Community questions & instant voting</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-chat-textMuted hover:text-chat-textPrimary hover:bg-chat-card transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action / Create Row */}
        {canCreatePoll && !isCreating && (
          <div className="p-3.5 px-5 bg-chat-card/40 border-b border-chat-border flex items-center justify-between">
            <span className="text-xs text-chat-textMuted">Ask questions and collect member votes</span>
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 active:scale-95 text-white text-xs font-semibold rounded-lg transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Create Poll</span>
            </button>
          </div>
        )}

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1">
          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-500 text-xs font-medium">
              {error}
            </div>
          )}

          {/* Inline Create Poll Form */}
          {isCreating && (
            <form onSubmit={handleCreatePoll} className="p-4 bg-chat-card border border-brand-500/30 rounded-xl space-y-3.5 animate-fadeIn">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-chat-textPrimary">New Group Poll</h4>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="p-1 text-chat-textMuted hover:text-chat-textPrimary"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="text-xs font-medium text-chat-textMuted">Poll Question *</label>
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="e.g. When should our next meet be?"
                  className="w-full mt-1 px-3 py-2 bg-chat-panel border border-chat-border rounded-lg text-sm text-chat-textPrimary focus:outline-none focus:border-brand-500"
                  required
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-chat-textMuted">Options (2-6)</label>
                {options.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={opt}
                      onChange={(e) => handleOptionChange(idx, e.target.value)}
                      placeholder={`Option ${idx + 1}`}
                      className="flex-1 px-3 py-1.5 bg-chat-panel border border-chat-border rounded-lg text-sm text-chat-textPrimary focus:outline-none focus:border-brand-500"
                      required
                    />
                    {options.length > 2 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveOption(idx)}
                        className="p-1.5 text-chat-textMuted hover:text-red-500 transition-colors"
                      >
                        <Minus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ))}
                {options.length < 6 && (
                  <button
                    type="button"
                    onClick={handleAddOption}
                    className="flex items-center gap-1 text-xs text-brand-500 font-semibold hover:underline mt-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add another option</span>
                  </button>
                )}
              </div>

              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="px-3 py-1.5 text-xs text-chat-textMuted hover:text-chat-textPrimary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingPoll}
                  className="px-4 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-lg shadow-sm disabled:opacity-50"
                >
                  {savingPoll ? 'Creating...' : 'Start Poll'}
                </button>
              </div>
            </form>
          )}

          {/* Polls List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
            </div>
          ) : polls.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-chat-card border border-chat-border flex items-center justify-center text-chat-textMuted mb-3">
                <Vote className="w-7 h-7" />
              </div>
              <p className="text-sm font-semibold text-chat-textPrimary">No Active Polls</p>
              <p className="text-xs text-chat-textMuted mt-1 max-w-xs">
                Launch a poll to gather quick decisions or feedback from your group.
              </p>
            </div>
          ) : (
            polls.map((poll) => {
              const totalVotes = (poll.options || []).reduce(
                (sum, o) => sum + (o.voters ? o.voters.length : 0),
                0
              );
              const canCloseThis =
                (canManagePolls || poll.creator?._id === currentUserId) && !poll.isClosed;

              return (
                <div
                  key={poll._id}
                  className="p-4 bg-chat-card border border-chat-border rounded-xl space-y-3.5 transition-all hover:border-brand-500/30"
                >
                  {/* Question & Status Row */}
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="text-base font-bold text-chat-textPrimary">{poll.question}</h4>
                        {poll.isClosed ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
                            <Lock className="w-2.5 h-2.5" />
                            Closed
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                            Active
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-chat-textMuted mt-0.5">
                        Created by {poll.creator?.displayName || poll.creator?.username || 'Member'} • {totalVotes} {totalVotes === 1 ? 'vote' : 'votes'}
                      </p>
                    </div>

                    {canCloseThis && (
                      <button
                        onClick={() => handleClosePoll(poll._id)}
                        className="p-1.5 text-xs font-medium text-amber-500 hover:bg-amber-500/10 rounded-lg transition-colors"
                        title="Close Poll"
                      >
                        End Poll
                      </button>
                    )}
                  </div>

                  {/* Options & Live Progress Bars */}
                  <div className="space-y-2">
                    {(poll.options || []).map((opt, idx) => {
                      const voteCount = opt.voters ? opt.voters.length : 0;
                      const percentage = totalVotes > 0 ? Math.round((voteCount / totalVotes) * 100) : 0;
                      const hasVotedThis = (opt.voters || []).some(
                        (v: any) => (typeof v === 'string' ? v : v?._id) === currentUserId
                      );

                      return (
                        <div
                          key={idx}
                          onClick={() => !poll.isClosed && handleVote(poll._id, idx)}
                          className={`relative overflow-hidden p-3 rounded-xl border transition-all select-none ${
                            poll.isClosed
                              ? 'border-chat-border bg-chat-panel/40 cursor-default'
                              : 'border-chat-border bg-chat-panel hover:border-brand-500/50 cursor-pointer active:scale-[0.99]'
                          }`}
                        >
                          {/* Percentage Fill Bar */}
                          <div
                            className={`absolute left-0 top-0 bottom-0 transition-all duration-500 ${
                              hasVotedThis ? 'bg-brand-500/20' : 'bg-chat-border/40'
                            }`}
                            style={{ width: `${percentage}%` }}
                          />

                          <div className="relative z-10 flex items-center justify-between gap-3 text-xs">
                            <div className="flex items-center gap-2 min-w-0">
                              {hasVotedThis && <CheckCircle2 className="w-4 h-4 text-brand-500 shrink-0" />}
                              <span
                                className={`font-semibold truncate ${
                                  hasVotedThis ? 'text-brand-500' : 'text-chat-textPrimary'
                                }`}
                              >
                                {opt.text}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 shrink-0 font-medium">
                              <span className="text-chat-textMuted">{voteCount}</span>
                              <span className="font-bold text-chat-textPrimary">{percentage}%</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
