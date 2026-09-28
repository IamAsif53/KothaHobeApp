import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  Clock,
  MapPin,
  Plus,
  Trash2,
  CheckCircle,
  HelpCircle,
  XCircle,
  Loader2,
  CalendarCheck,
} from 'lucide-react';
import { IGroupEvent, IUser } from '../../types';
import {
  fetchGroupEventsApi,
  createGroupEventApi,
  rsvpGroupEventApi,
  deleteGroupEventApi,
} from '../../api/groupApi';

interface GroupEventsModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupId: string;
  currentUserId: string;
  canCreateEvent: boolean;
  canDeleteEvent: boolean;
}

export const GroupEventsModal: React.FC<GroupEventsModalProps> = ({
  isOpen,
  onClose,
  groupId,
  currentUserId,
  canCreateEvent,
  canDeleteEvent,
}) => {
  const [events, setEvents] = useState<IGroupEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [savingEvent, setSavingEvent] = useState(false);
  const [rsvpLoadingId, setRsvpLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [location, setLocation] = useState('');

  const loadEvents = async () => {
    if (!groupId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetchGroupEventsApi(groupId);
      if (res.success && res.events) {
        setEvents(res.events);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to load group events');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadEvents();
    }
  }, [isOpen, groupId]);

  if (!isOpen) return null;

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !date || !time) {
      setError('Title, date, and time are required');
      return;
    }

    setSavingEvent(true);
    setError(null);
    try {
      const res = await createGroupEventApi(groupId, {
        title: title.trim(),
        description: description.trim(),
        date,
        time,
        location: location.trim(),
      });
      if (res.success && res.event) {
        setEvents((prev) => [res.event, ...prev]);
        setIsCreating(false);
        setTitle('');
        setDescription('');
        setDate('');
        setTime('');
        setLocation('');
      } else {
        setError(res.message || 'Failed to create event');
      }
    } catch (err: any) {
      setError(err?.message || 'Error creating event');
    } finally {
      setSavingEvent(false);
    }
  };

  const handleRsvp = async (eventId: string, status: 'going' | 'maybe' | 'not_going') => {
    setRsvpLoadingId(eventId);
    try {
      const res = await rsvpGroupEventApi(groupId, eventId, status);
      if (res.success) {
        setEvents((prev) =>
          prev.map((ev) => {
            if (ev._id !== eventId) return ev;
            const attendees = (ev.attendees || []).filter((a) => a.user?._id !== currentUserId);
            const userObj: IUser = {
              _id: currentUserId,
              username: 'You',
              displayName: 'You',
              isOnline: true,
              lastSeen: new Date().toISOString(),
            };
            attendees.push({
              user: userObj,
              status,
            });
            return { ...ev, attendees };
          })
        );
      }
    } catch (err: any) {
      setError(err?.message || 'Error updating RSVP');
    } finally {
      setRsvpLoadingId(null);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!window.confirm('Are you sure you want to delete this event?')) return;
    try {
      const res = await deleteGroupEventApi(groupId, eventId);
      if (res.success) {
        setEvents((prev) => prev.filter((ev) => ev._id !== eventId));
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to delete event');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg bg-chat-panel border border-chat-border rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-chat-border">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-brand-500/10 text-brand-500 rounded-lg">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-chat-textPrimary">Group Events</h3>
              <p className="text-xs text-chat-textMuted">Upcoming meetups, sessions & plans</p>
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
        {canCreateEvent && !isCreating && (
          <div className="p-3.5 px-5 bg-chat-card/40 border-b border-chat-border flex items-center justify-between">
            <span className="text-xs text-chat-textMuted">Plan a hangout or meeting with members</span>
            <button
              onClick={() => setIsCreating(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-brand-500 hover:bg-brand-600 active:scale-95 text-white text-xs font-semibold rounded-lg transition-all shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Create Event</span>
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

          {/* Inline Event Creation Form */}
          {isCreating && (
            <form onSubmit={handleCreateEvent} className="p-4 bg-chat-card border border-brand-500/30 rounded-xl space-y-3.5 animate-fadeIn">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-chat-textPrimary">New Group Event</h4>
                <button
                  type="button"
                  onClick={() => setIsCreating(false)}
                  className="p-1 text-chat-textMuted hover:text-chat-textPrimary"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div>
                <label className="text-xs font-medium text-chat-textMuted">Event Title *</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Weekly Chillout, Tech Sync, Game Night"
                  className="w-full mt-1 px-3 py-2 bg-chat-panel border border-chat-border rounded-lg text-sm text-chat-textPrimary focus:outline-none focus:border-brand-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-chat-textMuted">Date *</label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-chat-panel border border-chat-border rounded-lg text-sm text-chat-textPrimary focus:outline-none focus:border-brand-500"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-chat-textMuted">Time *</label>
                  <input
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-chat-panel border border-chat-border rounded-lg text-sm text-chat-textPrimary focus:outline-none focus:border-brand-500"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-chat-textMuted">Location / Link (Optional)</label>
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="e.g. Discord, Zoom, Coffee Shop"
                  className="w-full mt-1 px-3 py-2 bg-chat-panel border border-chat-border rounded-lg text-sm text-chat-textPrimary focus:outline-none focus:border-brand-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-chat-textMuted">Description (Optional)</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Details or agenda..."
                  rows={2}
                  className="w-full mt-1 px-3 py-2 bg-chat-panel border border-chat-border rounded-lg text-sm text-chat-textPrimary focus:outline-none focus:border-brand-500 resize-none"
                />
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
                  disabled={savingEvent}
                  className="px-4 py-1.5 bg-brand-500 hover:bg-brand-600 text-white text-xs font-semibold rounded-lg shadow-sm disabled:opacity-50"
                >
                  {savingEvent ? 'Creating...' : 'Publish Event'}
                </button>
              </div>
            </form>
          )}

          {/* Event List */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
            </div>
          ) : events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-chat-card border border-chat-border flex items-center justify-center text-chat-textMuted mb-3">
                <CalendarCheck className="w-7 h-7" />
              </div>
              <p className="text-sm font-semibold text-chat-textPrimary">No Upcoming Events</p>
              <p className="text-xs text-chat-textMuted mt-1 max-w-xs">
                Schedule group meetups, voice sessions, or hangouts for everyone to join.
              </p>
            </div>
          ) : (
            events.map((ev) => {
              const myRsvp = ev.attendees?.find((a) => a.user?._id === currentUserId)?.status;
              const goingCount = ev.attendees?.filter((a) => a.status === 'going').length || 0;
              const maybeCount = ev.attendees?.filter((a) => a.status === 'maybe').length || 0;
              const canDeleteThis = canDeleteEvent || ev.creator?._id === currentUserId;

              return (
                <div
                  key={ev._id}
                  className="p-4 bg-chat-card border border-chat-border rounded-xl space-y-3 transition-all hover:border-brand-500/30"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-base font-bold text-chat-textPrimary">{ev.title}</h4>
                      {ev.description && (
                        <p className="text-xs text-chat-textMuted mt-1 leading-relaxed">{ev.description}</p>
                      )}
                    </div>
                    {canDeleteThis && (
                      <button
                        onClick={() => handleDeleteEvent(ev._id)}
                        className="p-1.5 text-chat-textMuted hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Delete Event"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Metadata Row */}
                  <div className="flex flex-wrap items-center gap-3 text-xs text-chat-textMuted">
                    <div className="flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-brand-500" />
                      <span>{ev.date}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-brand-500" />
                      <span>{ev.time}</span>
                    </div>
                    {ev.location && (
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-brand-500" />
                        <span>{ev.location}</span>
                      </div>
                    )}
                  </div>

                  {/* RSVP & Attendee Section */}
                  <div className="pt-2 border-t border-chat-border flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-emerald-500">{goingCount} Going</span>
                      {maybeCount > 0 && <span className="text-amber-500">• {maybeCount} Maybe</span>}
                    </div>

                    {/* Interactive RSVP Buttons */}
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleRsvp(ev._id, 'going')}
                        disabled={rsvpLoadingId === ev._id}
                        className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                          myRsvp === 'going'
                            ? 'bg-emerald-500 text-white shadow-sm'
                            : 'bg-chat-panel hover:bg-emerald-500/10 text-chat-textMuted hover:text-emerald-500 border border-chat-border'
                        }`}
                      >
                        <CheckCircle className="w-3 h-3" />
                        <span>Going</span>
                      </button>
                      <button
                        onClick={() => handleRsvp(ev._id, 'maybe')}
                        disabled={rsvpLoadingId === ev._id}
                        className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                          myRsvp === 'maybe'
                            ? 'bg-amber-500 text-white shadow-sm'
                            : 'bg-chat-panel hover:bg-amber-500/10 text-chat-textMuted hover:text-amber-500 border border-chat-border'
                        }`}
                      >
                        <HelpCircle className="w-3 h-3" />
                        <span>Maybe</span>
                      </button>
                      <button
                        onClick={() => handleRsvp(ev._id, 'not_going')}
                        disabled={rsvpLoadingId === ev._id}
                        className={`flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                          myRsvp === 'not_going'
                            ? 'bg-red-500 text-white shadow-sm'
                            : 'bg-chat-panel hover:bg-red-500/10 text-chat-textMuted hover:text-red-500 border border-chat-border'
                        }`}
                      >
                        <XCircle className="w-3 h-3" />
                      </button>
                    </div>
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
