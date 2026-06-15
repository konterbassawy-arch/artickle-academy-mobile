/**
 * TeacherBookings — Phase 14
 *
 * Read-only view of bookings assigned to this teacher.
 * Teacher sees:
 * - Student name, instrument, type, status
 * - Preferred date/time, notes from requester
 * Teacher does NOT see:
 * - Admin internal notes
 * - Financial data
 */

import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { BookingStatus, Role } from '../../types';

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

export const TeacherBookings: React.FC = () => {
  const { currentUser, bookings } = useApp();
  const [statusFilter, setStatusFilter] = useState<string>('all');

  if (currentUser?.role !== Role.TEACHER) {
    return <div className="text-red-500 text-sm">Teacher access required.</div>;
  }

  const filteredBookings = useMemo(() => {
    let result = [...bookings]; // already filtered to own in AppContext
    if (statusFilter !== 'all') {
      result = result.filter(b => b.status === statusFilter);
    }
    return result;
  }, [bookings, statusFilter]);

  const pendingCount = bookings.filter(b => b.status === BookingStatus.PENDING || b.status === BookingStatus.APPROVED).length;

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">My Bookings</h1>
        <p className="text-slate-500 text-sm mt-1">
          Upcoming and recent booking requests assigned to you
          {pendingCount > 0 && (
            <span className="ml-2 inline-flex items-center gap-1 text-amber-400">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {pendingCount} active
            </span>
          )}
        </p>
      </div>

      {/* Filter + count row */}
      <div className="flex items-center justify-between gap-4">
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-slate-800/80 border border-slate-700/80 rounded-xl px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
        >
          <option value="all">All Statuses</option>
          <option value={BookingStatus.PENDING}>Pending</option>
          <option value={BookingStatus.APPROVED}>Approved</option>
          <option value={BookingStatus.CONVERTED}>Converted</option>
          <option value={BookingStatus.REJECTED}>Rejected</option>
          <option value={BookingStatus.CANCELLED}>Cancelled</option>
        </select>
        <span className="text-xs text-slate-500 tabular-nums">
          {filteredBookings.length} booking{filteredBookings.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Bookings list */}
      {filteredBookings.length === 0 ? (
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-10 text-center">
          <svg className="w-10 h-10 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-slate-500 text-sm">No bookings assigned to you yet.</p>
        </div>
      ) : (
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl overflow-hidden divide-y divide-slate-800/60">
          {filteredBookings.map(booking => (
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

              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                {booking.schoolName && (
                  <span>School: <span className="text-slate-300">{booking.schoolName}</span></span>
                )}
                {booking.preferredDate && (
                  <span>Requested date: <span className="text-slate-300">
                    {new Date(booking.preferredDate).toLocaleDateString('en-US', {
                      weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                  </span></span>
                )}
                <span>Requested by: <span className="text-slate-300">{booking.requestedByName}</span></span>
              </div>

              {booking.notes && (
                <p className="text-xs text-slate-600 mt-1.5 italic">"{booking.notes}"</p>
              )}
              {booking.status === BookingStatus.APPROVED && (
                <p className="text-xs text-blue-400 mt-2 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Approved — awaiting conversion to lesson by admin.
                </p>
              )}
              {booking.status === BookingStatus.CONVERTED && (
                <p className="text-xs text-emerald-400 mt-2 flex items-center gap-1.5">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  This booking has been scheduled as a lesson.
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
