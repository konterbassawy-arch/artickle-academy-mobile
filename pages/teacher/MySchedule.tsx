/**
 * MySchedule — Phase 15
 *
 * Teacher read-only view of their weekly timetable.
 * Teachers can see their assigned slots but cannot edit or generate lessons.
 */

import React from 'react';
import { useApp } from '../../context/AppContext';
import { DeliveryMode, getDeliveryMode } from '../../types';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const MySchedule: React.FC = () => {
  const { timetableSlots } = useApp();

  // Already filtered to own slots by AppContext listener
  const activeSlots = timetableSlots.filter(s => s.isActive);
  const pausedSlots = timetableSlots.filter(s => !s.isActive);

  // Group active slots by day
  const slotsByDay: Record<number, typeof activeSlots> = {};
  activeSlots.forEach(slot => {
    if (!slotsByDay[slot.dayOfWeek]) slotsByDay[slot.dayOfWeek] = [];
    slotsByDay[slot.dayOfWeek].push(slot);
  });

  // Count active days
  const activeDayCount = Object.keys(slotsByDay).length;

  const deliveryModeLabel = (mode: DeliveryMode | string | undefined) =>
    mode === DeliveryMode.ONLINE ? 'Online' : 'In-Person';

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">My Weekly Schedule</h1>
        <p className="text-slate-500 text-sm mt-1">
          {activeSlots.length > 0
            ? `${activeSlots.length} slot${activeSlots.length !== 1 ? 's' : ''} across ${activeDayCount} day${activeDayCount !== 1 ? 's' : ''}`
            : 'Your timetable will appear here once set up by admin'
          }
        </p>
      </div>

      {activeSlots.length === 0 ? (
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-10 text-center">
          <svg className="w-10 h-10 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
          </svg>
          <p className="text-slate-500 text-sm">No scheduled lessons yet.</p>
          <p className="text-slate-600 text-xs mt-1">Your admin will set up your timetable.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {DAY_NAMES.map((dayName, dayIndex) => {
            const daySlots = slotsByDay[dayIndex];
            if (!daySlots || daySlots.length === 0) return null;
            return (
              <div key={dayIndex} className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl overflow-hidden">
                {/* Day header */}
                <div className="bg-slate-800/40 px-5 py-3 border-b border-slate-800/60 flex items-center justify-between">
                  <h3 className="text-white font-semibold text-sm">{dayName}</h3>
                  <span className="text-[10px] text-slate-500 tabular-nums">
                    {daySlots.length} slot{daySlots.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Slots */}
                <div className="divide-y divide-slate-800/60">
                  {daySlots.map(slot => (
                    <div key={slot.id} className="px-5 py-3.5 hover:bg-slate-800/20 transition-colors">
                      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                        {/* Time */}
                        <span className="text-white font-semibold text-sm tabular-nums min-w-[120px]">
                          {slot.startTime} – {slot.endTime}
                        </span>

                        {/* Students */}
                        <span className="text-slate-300 text-sm">
                          {slot.studentNames.join(', ')}
                        </span>

                        {/* School */}
                        <span className="text-slate-500 text-xs">
                          {slot.schoolName || 'Private'}
                        </span>

                        {/* Duration + type */}
                        <span className="text-xs text-slate-500 tabular-nums">
                          {slot.durationMinutes}min
                          <span className="mx-1 text-slate-700">·</span>
                          {slot.type}
                        </span>

                        {/* Delivery mode badge */}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          slot.deliveryMode === DeliveryMode.ONLINE
                            ? 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20'
                            : 'bg-slate-500/15 text-slate-400 ring-1 ring-slate-500/20'
                        }`}>
                          {deliveryModeLabel(slot.deliveryMode)}
                        </span>

                        {/* Instrument */}
                        {slot.instrument && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary-500/10 text-primary-400 ring-1 ring-primary-500/20 font-medium capitalize">
                            {slot.instrument}
                          </span>
                        )}
                      </div>

                      {/* Notes */}
                      {slot.notes && (
                        <p className="text-xs text-slate-600 italic mt-1.5 ml-[140px]">"{slot.notes}"</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Paused slots */}
      {pausedSlots.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Paused Slots
            <span className="ml-2 text-xs font-normal text-slate-600 normal-case tracking-normal">
              ({pausedSlots.length})
            </span>
          </h2>
          <div className="bg-slate-900/40 ring-1 ring-white/5 rounded-2xl overflow-hidden divide-y divide-slate-800/60 opacity-60">
            {pausedSlots.map(slot => (
              <div key={slot.id} className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-xs text-slate-500 font-medium min-w-[40px]">
                  {DAY_SHORT[slot.dayOfWeek]}
                </span>
                <span className="text-xs text-slate-400 tabular-nums min-w-[110px]">
                  {slot.startTime} – {slot.endTime}
                </span>
                <span className="text-xs text-slate-500">
                  {slot.studentNames.join(', ')}
                </span>
                <span className="text-xs text-slate-600">
                  {slot.schoolName || 'Private'}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-500/10 text-slate-500 ring-1 ring-slate-500/15 font-medium">
                  Paused
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
