/**
 * BookingRequest — Phase 14
 *
 * Parent-facing page to:
 * - Submit a new trial or lesson booking request
 * - View status of own booking requests
 *
 * Privacy:
 * - Parent sees only own bookings (filtered in AppContext listener)
 * - No admin notes visible
 * - No financial data
 */

import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { BookingStatus, BookingType, Role } from '../../types';

const statusBadge = (status: string) => {
  const map: Record<string, string> = {
    [BookingStatus.PENDING]:   'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20',
    [BookingStatus.APPROVED]:  'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20',
    [BookingStatus.REJECTED]:  'bg-red-500/15 text-red-400 ring-1 ring-red-500/20',
    [BookingStatus.CONVERTED]: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20',
    [BookingStatus.CANCELLED]: 'bg-slate-500/15 text-slate-400 ring-1 ring-slate-500/20',
  };
  return `text-[10px] px-2 py-0.5 rounded-full font-medium ${map[status] || 'bg-slate-500/15 text-slate-400 ring-1 ring-slate-500/20'}`;
};

const selectCls = 'w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all';
const inputCls  = 'w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600';
const labelCls  = 'block text-xs font-medium text-slate-400 uppercase tracking-wider mb-1.5';

export const BookingRequest: React.FC = () => {
  const { currentUser, bookings, students, schools, addBooking } = useApp();

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [studentId, setStudentId] = useState('');
  const [bookingType, setBookingType] = useState<'trial' | 'regular'>('trial');
  const [lessonType, setLessonType] = useState<'Individual' | 'Group'>('Individual');
  const [duration, setDuration] = useState(30);
  const [preferredDate, setPreferredDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (currentUser?.role !== Role.PARENT) {
    return <div className="text-red-500 text-sm">Parent access required.</div>;
  }

  // My children (already filtered in AppContext for parent role)
  const myChildren = students;

  const myBookings = useMemo(() => {
    return bookings.filter(b => b.requestedBy === currentUser.id);
  }, [bookings, currentUser.id]);

  const pendingCount = myBookings.filter(b => b.status === BookingStatus.PENDING).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentId) {
      alert('Please select a child.');
      return;
    }

    setSubmitting(true);
    const student = myChildren.find(s => s.id === studentId);
    const school = student?.schoolId ? schools.find(s => s.id === student.schoolId) : undefined;

    const result = await addBooking({
      requestedBy: currentUser.id,
      requestedByName: currentUser.name,
      requestedAt: Date.now(),
      studentId: student!.id,
      studentName: student!.name,
      schoolId: school?.id,
      schoolName: school?.name,
      instrument: student!.instrument || '',
      type: bookingType as BookingType,
      lessonType,
      durationMinutes: duration,
      preferredDate: preferredDate || undefined,
      notes: notes || undefined,
      status: BookingStatus.PENDING,
    });

    setSubmitting(false);

    if (result.success) {
      alert('Booking request submitted! An admin will review it shortly.');
      setShowForm(false);
      setStudentId('');
      setNotes('');
      setPreferredDate('');
    } else {
      alert(result.message || 'Failed to submit request');
    }
  };

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Bookings</h1>
          <p className="text-slate-500 text-sm mt-1">Request a trial or new lesson for your child</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className={`shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            showForm
              ? 'bg-slate-700/80 hover:bg-slate-700 text-slate-300 ring-1 ring-white/10'
              : 'bg-primary-600 hover:bg-primary-500 text-white shadow-lg shadow-primary-900/20'
          }`}
        >
          {showForm ? 'Cancel' : '+ New Request'}
        </button>
      </div>

      {/* New request form */}
      {showForm && (
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-6">
          <h2 className="text-base font-semibold text-white mb-5">Request a Lesson</h2>
          <form onSubmit={handleSubmit}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
              <div>
                <label className={labelCls}>Child</label>
                <select value={studentId} onChange={e => setStudentId(e.target.value)}
                  className={selectCls} required>
                  <option value="">Select Child</option>
                  {myChildren.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.instrument})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Request Type</label>
                <select value={bookingType} onChange={e => setBookingType(e.target.value as any)}
                  className={selectCls}>
                  <option value="trial">Trial Lesson</option>
                  <option value="regular">Regular Lesson</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Lesson Type</label>
                <select value={lessonType} onChange={e => setLessonType(e.target.value as any)}
                  className={selectCls}>
                  <option value="Individual">Individual</option>
                  <option value="Group">Group</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Duration</label>
                <select value={duration} onChange={e => setDuration(Number(e.target.value))}
                  className={selectCls}>
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                  <option value="60">60 minutes</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Preferred Date / Time <span className="normal-case text-slate-600 font-normal">(optional)</span></label>
                <input type="datetime-local" value={preferredDate}
                  onChange={e => setPreferredDate(e.target.value)}
                  className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Notes <span className="normal-case text-slate-600 font-normal">(optional)</span></label>
                <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder="e.g. Morning preferred, weekdays only…"
                  className={inputCls} />
              </div>
            </div>

            {/* Divider */}
            <div className="border-t border-slate-800/60 pt-5 flex justify-end">
              <button type="submit" disabled={submitting}
                className="px-6 py-2.5 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-semibold transition-all shadow-lg shadow-primary-900/20 active:scale-[0.98]">
                {submitting ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    Submitting…
                  </span>
                ) : 'Submit Request'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Pending notice */}
      {pendingCount > 0 && (
        <div className="flex items-center gap-2.5 px-4 py-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
          <svg className="w-4 h-4 text-amber-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-sm text-amber-400">
            {pendingCount} request{pendingCount !== 1 ? 's' : ''} awaiting review
          </p>
        </div>
      )}

      {/* My bookings list */}
      {myBookings.length === 0 ? (
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-10 text-center">
          <svg className="w-10 h-10 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-slate-500 text-sm">No booking requests yet.</p>
          <p className="text-slate-600 text-xs mt-1">Click "+ New Request" to get started.</p>
        </div>
      ) : (
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl overflow-hidden divide-y divide-slate-800/60">
          {myBookings.map(booking => (
            <div key={booking.id} className="p-4 hover:bg-slate-800/30 transition-colors">
              <div className="flex justify-between items-start gap-3 mb-2">
                <div>
                  <p className="text-white font-medium text-sm">{booking.studentName}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {booking.instrument}
                    <span className="mx-1 text-slate-700">·</span>
                    {booking.type === 'trial' ? 'Trial' : 'Regular'}
                    <span className="mx-1 text-slate-700">·</span>
                    {booking.lessonType}
                    <span className="mx-1 text-slate-700">·</span>
                    {booking.durationMinutes}min
                  </p>
                </div>
                <span className={statusBadge(booking.status)}>{booking.status}</span>
              </div>

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 mb-1">
                {booking.schoolName && (
                  <span>School: <span className="text-slate-300">{booking.schoolName}</span></span>
                )}
                {booking.teacherName && (
                  <span>Teacher: <span className="text-slate-300">{booking.teacherName}</span></span>
                )}
                {booking.preferredDate && (
                  <span>Requested for: <span className="text-slate-300">
                    {new Date(booking.preferredDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span></span>
                )}
              </div>

              {booking.notes && (
                <p className="text-xs text-slate-600 mt-1 italic">"{booking.notes}"</p>
              )}
              {booking.status === BookingStatus.CONVERTED && (
                <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  This booking has been confirmed and scheduled as a lesson.
                </p>
              )}
              {booking.status === BookingStatus.REJECTED && (
                <p className="text-xs text-red-400 mt-2">
                  This request was not approved. Please contact the academy for details.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
