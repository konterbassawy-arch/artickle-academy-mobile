/**
 * TeacherProfile — Phase 10
 *
 * Read-only view of the teacher's own profile.
 * Shows instrument, code, base rates, per-school rate overrides.
 * Teacher can see their OWN data; editing remains admin-only (Configuration page).
 */

import React from 'react';
import { useApp } from '../../context/AppContext';
import { Role } from '../../types';

export const TeacherProfile: React.FC = () => {
  const { currentUser, teachers, schools } = useApp();

  if (currentUser?.role !== Role.TEACHER) {
    return <div className="text-red-500 text-sm">Access Denied</div>;
  }

  const teacher = teachers.find(t => t.id === currentUser.id);

  if (!teacher) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">My Profile</h1>
          <p className="text-slate-500 text-sm mt-1">Your teaching profile details</p>
        </div>
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-10 text-center">
          <p className="text-slate-400 text-sm">Teacher profile not found. Please contact your administrator.</p>
        </div>
      </div>
    );
  }

  const schoolOverrides = Object.entries(teacher.ratesBySchool || {});

  return (
    <div className="space-y-8 max-w-2xl">
      {/* Page header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 rounded-2xl bg-primary-600/15 text-primary-300 flex items-center justify-center font-bold text-xl ring-1 ring-primary-500/25">
          {teacher.name.charAt(0)}
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">{teacher.name}</h1>
          <p className="text-slate-500 text-sm mt-0.5 capitalize">{teacher.instrument} · {teacher.code}</p>
        </div>
      </div>

      {/* Personal info card */}
      <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-6">
        <h2 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-4">Personal Information</h2>
        <div className="grid grid-cols-2 gap-5">
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Name</p>
            <p className="text-white font-medium text-sm">{teacher.name}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Teacher Code</p>
            <p className="text-white font-mono font-semibold text-sm">{teacher.code}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Instrument</p>
            <p className="text-white font-medium text-sm capitalize">{teacher.instrument}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1">Email</p>
            <p className="text-white font-medium text-sm truncate">{currentUser.email || currentUser.id}</p>
          </div>
        </div>
      </div>

      {/* Rates card */}
      <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-6">
        <h2 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-4">My Rates</h2>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-slate-800/60 ring-1 ring-white/5 rounded-xl p-4">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Individual Rate</p>
            <p className="text-2xl font-bold text-emerald-400 tabular-nums">{teacher.baseRate}
              <span className="text-xs font-normal text-slate-600 ml-1">SAR/hr</span>
            </p>
          </div>
          <div className="bg-slate-800/60 ring-1 ring-white/5 rounded-xl p-4">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">Group Rate</p>
            <p className="text-2xl font-bold text-emerald-400 tabular-nums">{teacher.baseGroupRate || 0}
              <span className="text-xs font-normal text-slate-600 ml-1">SAR/hr</span>
            </p>
          </div>
        </div>

        {/* Per-school overrides */}
        {schoolOverrides.length > 0 && (
          <div className="pt-4 border-t border-slate-800/60">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-3">School-Specific Overrides</p>
            <div className="bg-slate-800/40 ring-1 ring-white/5 rounded-xl overflow-hidden divide-y divide-slate-800/60">
              {schoolOverrides.map(([schoolId, rate]) => {
                const school = schools.find(s => s.id === schoolId);
                return (
                  <div key={schoolId} className="flex items-center justify-between px-4 py-2.5">
                    <span className="text-sm text-slate-300">{school?.name || schoolId}</span>
                    <span className="text-sm text-amber-400 font-semibold tabular-nums">{rate} SAR/hr</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Guarantee config */}
      {teacher.minimumDailyHoursByInstrument && Object.keys(teacher.minimumDailyHoursByInstrument).length > 0 && (
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-6">
          <h2 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-4">Daily Minimum Guarantee</h2>
          <div className="bg-slate-800/40 ring-1 ring-white/5 rounded-xl overflow-hidden divide-y divide-slate-800/60">
            {Object.entries(teacher.minimumDailyHoursByInstrument).map(([inst, config]: [string, { minHours: number; guaranteed: boolean }]) => (
              <div key={inst} className="flex items-center justify-between px-4 py-2.5">
                <span className="text-sm text-slate-300 capitalize">{inst}</span>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-400 tabular-nums">{config.minHours}h/day</span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                    config.guaranteed
                      ? 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20'
                      : 'bg-slate-500/15 text-slate-500 ring-1 ring-slate-500/20'
                  }`}>
                    {config.guaranteed ? 'Guaranteed' : 'Not Guaranteed'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-xs text-slate-600 italic">
        To update your profile or rates, please contact your administrator.
      </p>
    </div>
  );
};

export default TeacherProfile;
