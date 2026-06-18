
import React, { useState, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { SchoolCertificateBranding } from '../components/SchoolCertificateBranding';
import { useApp } from '../context/AppContext';
import { Role, School, Teacher, User, Student, DeliveryMode, GuaranteeConfig, GuaranteeAppliesTo } from '../types';
import { studentsToExcel, downloadExcel, STUDENT_IMPORT_INSTRUCTIONS } from '../services/exportUtils';
import { parseStudentExcel } from '../services/importUtils';
import { ImportResultsModal } from '../components/ImportResultsModal';
import { normalizeInstrument } from '../services/rateService';
import { SchoolPeriodManager } from './admin/SchoolPeriodManager';
import { ParentOnboarding } from './admin/ParentOnboarding';
// @ts-ignore — CDN imports for Firebase Storage + Firestore
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { getApp } from 'firebase/app';
import { getFirestore, doc as firestoreDoc, setDoc as firestoreSetDoc, deleteDoc as firestoreDeleteDoc } from 'firebase/firestore';

const normKey = (s: any) => String(s || '').trim().toLowerCase();

// Phase 17.G: Migrate old guarantee format to new on read
const migrateOldGuarantees = (
  oldConfig?: Record<string, { minHours: number; guaranteed: boolean }>
): Record<string, GuaranteeConfig> => {
  const result: Record<string, GuaranteeConfig> = {};
  if (!oldConfig) return result;
  Object.entries(oldConfig).forEach(([inst, cfg]) => {
    result[normalizeInstrument(inst)] = {
      enabled: cfg.guaranteed,
      minHours: cfg.minHours,
      appliesTo: 'in_person_only' // safe default for legacy data
    };
  });
  return result;
};

// Phase 17.G Migration: Preview row for dry-run display
interface MigrationPreviewRow {
  teacherId: string;
  teacherName: string;
  instrument: string;
  legacyGuarantees: Record<string, { minHours: number; guaranteed: boolean }>;
  inferredSchools: { id: string; name: string; source: string }[];
  newGuaranteesBySchool: Record<string, Record<string, GuaranteeConfig>>;
  needsManualReview: boolean;
}

/**
 * Infer school IDs for a teacher using the priority chain:
 * 1. Existing guaranteesBySchool keys (if any partial migration)
 * 2. ratesBySchool keys
 * 3. Schools from lessons
 * 4. Schools from assigned students
 * Returns array of { id, name, source } for display.
 */
const inferSchoolsForTeacher = (
  teacher: Teacher,
  lessons: { schoolId: string; teacherId: string }[],
  students: { schoolId: string; teacherId: string }[],
  schools: School[]
): { id: string; name: string; source: string }[] => {
  const seen = new Set<string>();
  const result: { id: string; name: string; source: string }[] = [];

  const add = (schoolId: string, source: string) => {
    if (!schoolId || seen.has(schoolId)) return;
    seen.add(schoolId);
    const school = schools.find(s => s.id === schoolId);
    result.push({ id: schoolId, name: school?.name || schoolId, source });
  };

  // Priority 1: Existing new-format keys (partial migration)
  if (teacher.guaranteesBySchool) {
    Object.keys(teacher.guaranteesBySchool).forEach(sid => add(sid, 'existing guarantee'));
  }

  // Priority 2: ratesBySchool keys
  if (teacher.ratesBySchool) {
    Object.keys(teacher.ratesBySchool).forEach(sid => add(sid, 'rate config'));
  }

  // Priority 3: Schools from lessons
  lessons
    .filter(l => l.teacherId === teacher.id && l.schoolId)
    .forEach(l => add(l.schoolId, 'lessons'));

  // Priority 4: Schools from assigned students
  students
    .filter(s => s.teacherId === teacher.id && s.schoolId)
    .forEach(s => add(s.schoolId, 'students'));

  return result;
};

// Read guaranteesByInstrument (new) with fallback to minimumDailyHoursByInstrument (legacy)
const readSchoolGuarantees = (school: School): Record<string, GuaranteeConfig> => {
  if (school.guaranteesByInstrument && Object.keys(school.guaranteesByInstrument).length > 0) {
    return { ...school.guaranteesByInstrument };
  }
  return migrateOldGuarantees(school.minimumDailyHoursByInstrument);
};

// Read guaranteesBySchool (new) with fallback to minimumDailyHoursByInstrument (legacy, all schools)
// When context arrays are provided, legacy data is auto-mapped to inferred schools.
const readTeacherGuarantees = (
  teacher: Teacher,
  allLessons?: { schoolId: string; teacherId: string }[],
  allStudents?: { schoolId: string; teacherId: string }[],
  allSchools?: School[]
): Record<string, Record<string, GuaranteeConfig>> => {
  if (teacher.guaranteesBySchool && Object.keys(teacher.guaranteesBySchool).length > 0) {
    return JSON.parse(JSON.stringify(teacher.guaranteesBySchool)); // deep clone
  }
  // Legacy fallback: if context is provided, infer schools and map legacy data
  if (teacher.minimumDailyHoursByInstrument &&
      Object.keys(teacher.minimumDailyHoursByInstrument).length > 0 &&
      allLessons && allStudents && allSchools) {
    const inferred = inferSchoolsForTeacher(teacher, allLessons, allStudents, allSchools);
    if (inferred.length > 0) {
      const result: Record<string, Record<string, GuaranteeConfig>> = {};
      const migrated = migrateOldGuarantees(teacher.minimumDailyHoursByInstrument);
      inferred.forEach(s => { result[s.id] = JSON.parse(JSON.stringify(migrated)); });
      return result;
    }
  }
  return {};
};

const cfgInputCls = 'w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600';
const cfgSelectCls = 'w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all';
const cfgLabelCls = 'block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5';

const TabButton = ({ name, label, activeTab, onClick }: any) => (
    <button
        onClick={onClick}
        className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${activeTab === name ? 'bg-primary-600 text-white shadow-lg shadow-primary-900/20' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
    >
        {label}
    </button>
);

// Phase 17.G: Unified guarantee badge — reads both old and new format
const GuaranteeBadge = ({ school, teacher }: { school?: School; teacher?: Teacher }) => {
    // School badge
    if (school) {
      const config = readSchoolGuarantees(school);
      if (Object.keys(config).length === 0) return null;
      return (
        <div className="text-[10px] text-slate-500 mt-1 flex flex-wrap gap-1">
          {Object.entries(config).map(([inst, cfg]) => {
            const bgClass = cfg.enabled ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-slate-700/30 border-slate-600/30 text-slate-400';
            const modeLabel = cfg.appliesTo === 'both' ? '' : cfg.appliesTo === 'online_only' ? ' (online)' : ' (in-person)';
            return (
              <span key={inst} className={`px-1.5 py-0.5 rounded border ${bgClass}`}>
                {inst}: {cfg.minHours}h/day {cfg.enabled ? 'on' : 'off'}{modeLabel}
              </span>
            );
          })}
        </div>
      );
    }
    // Teacher badge
    if (teacher) {
      const bySchool = readTeacherGuarantees(teacher);
      // Also show legacy if not migrated
      if (Object.keys(bySchool).length === 0 && teacher.minimumDailyHoursByInstrument) {
        const legacy = migrateOldGuarantees(teacher.minimumDailyHoursByInstrument);
        if (Object.keys(legacy).length === 0) return null;
        return (
          <div className="text-[10px] text-amber-500/60 mt-1 italic">
            Legacy guarantee: {Object.entries(legacy).map(([inst, cfg]) => `${inst}=${cfg.minHours}h`).join(', ')} (needs migration)
          </div>
        );
      }
      if (Object.keys(bySchool).length === 0) return null;
      return (
        <div className="text-[10px] text-slate-500 mt-1 space-y-0.5">
          {Object.entries(bySchool).map(([, instruments]) =>
            Object.entries(instruments).map(([inst, cfg]) => {
              const bgClass = cfg.enabled ? 'bg-amber-500/10 border-amber-500/30 text-amber-400' : 'bg-slate-700/30 border-slate-600/30 text-slate-400';
              const modeLabel = cfg.appliesTo === 'both' ? '' : cfg.appliesTo === 'online_only' ? ' (online)' : ' (in-person)';
              return (
                <span key={inst} className={`px-1.5 py-0.5 rounded border ${bgClass} mr-1`}>
                  {inst}: {cfg.minHours}h/day{modeLabel}
                </span>
              );
            })
          )}
        </div>
      );
    }
    return null;
};

const APPLIES_TO_OPTIONS: { value: GuaranteeAppliesTo; label: string }[] = [
  { value: 'in_person_only', label: 'In-Person' },
  { value: 'online_only', label: 'Online' },
  { value: 'both', label: 'Both' },
];

// Phase 17.G: School guarantee editor (structured rows)
const SchoolGuaranteeEditor = ({ guarantees, onChange }: {
  guarantees: Record<string, GuaranteeConfig>;
  onChange: (g: Record<string, GuaranteeConfig>) => void;
}) => {
  const entries = Object.entries(guarantees);

  const updateEntry = (oldKey: string, field: string, value: any) => {
    const updated = { ...guarantees };
    if (field === 'instrument') {
      const newKey = normalizeInstrument(value);
      if (newKey === oldKey) return;
      updated[newKey] = updated[oldKey];
      delete updated[oldKey];
    } else {
      updated[oldKey] = { ...updated[oldKey], [field]: value };
    }
    onChange(updated);
  };

  const addRow = () => {
    const key = `instrument_${Date.now()}`;
    onChange({ ...guarantees, [key]: { enabled: true, minHours: 0, appliesTo: 'in_person_only' } });
  };

  const removeRow = (key: string) => {
    const updated = { ...guarantees };
    delete updated[key];
    onChange(updated);
  };

  return (
    <div className="p-3 bg-slate-800/40 rounded-xl ring-1 ring-white/5 mt-3">
      <label className="block text-[10px] font-bold text-primary-400 uppercase tracking-wider mb-2">School Guarantees</label>
      {entries.length === 0 && <p className="text-[10px] text-slate-600 italic mb-2">No guarantees configured.</p>}
      <div className="space-y-2">
        {entries.map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-2 flex-wrap">
            <input
              className="bg-slate-800/80 text-white p-1.5 rounded-lg border border-slate-700/80 text-xs w-28 focus:ring-1 focus:ring-primary-500 outline-none"
              value={key}
              onChange={e => updateEntry(key, 'instrument', e.target.value)}
              placeholder="Instrument"
            />
            <label className="flex items-center gap-1 text-[10px] text-slate-400">
              <input type="checkbox" checked={cfg.enabled} onChange={e => updateEntry(key, 'enabled', e.target.checked)} />
              On
            </label>
            <input
              type="number" step="0.5" min="0"
              className="bg-slate-800 text-white p-1.5 rounded border border-slate-700 text-xs w-16"
              value={cfg.minHours}
              onChange={e => updateEntry(key, 'minHours', parseFloat(e.target.value) || 0)}
              placeholder="Hours"
            />
            <select
              className="bg-slate-800 text-white p-1.5 rounded border border-slate-700 text-[10px]"
              value={cfg.appliesTo}
              onChange={e => updateEntry(key, 'appliesTo', e.target.value)}
            >
              {APPLIES_TO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <button onClick={() => removeRow(key)} className="text-red-500 text-xs hover:text-red-400">✕</button>
          </div>
        ))}
      </div>
      <button onClick={addRow} className="mt-2 text-[10px] text-primary-400 hover:text-primary-300">+ Add Guarantee</button>
    </div>
  );
};

// Phase 17.G: Teacher guarantee editor (grouped by school)
const TeacherGuaranteeEditor = ({ guaranteesBySchool, schools, onChange }: {
  guaranteesBySchool: Record<string, Record<string, GuaranteeConfig>>;
  schools: School[];
  onChange: (g: Record<string, Record<string, GuaranteeConfig>>) => void;
}) => {
  const schoolEntries = Object.entries(guaranteesBySchool);

  const updateInstrument = (schoolId: string, oldKey: string, field: string, value: any) => {
    const updated = JSON.parse(JSON.stringify(guaranteesBySchool));
    if (!updated[schoolId]) updated[schoolId] = {};
    if (field === 'instrument') {
      const newKey = normalizeInstrument(value);
      if (newKey === oldKey) return;
      updated[schoolId][newKey] = updated[schoolId][oldKey];
      delete updated[schoolId][oldKey];
    } else {
      updated[schoolId][oldKey] = { ...updated[schoolId][oldKey], [field]: value };
    }
    onChange(updated);
  };

  const addInstrument = (schoolId: string) => {
    const updated = JSON.parse(JSON.stringify(guaranteesBySchool));
    if (!updated[schoolId]) updated[schoolId] = {};
    updated[schoolId][`instrument_${Date.now()}`] = { enabled: true, minHours: 0, appliesTo: 'in_person_only' as GuaranteeAppliesTo };
    onChange(updated);
  };

  const removeInstrument = (schoolId: string, key: string) => {
    const updated = JSON.parse(JSON.stringify(guaranteesBySchool));
    delete updated[schoolId][key];
    if (Object.keys(updated[schoolId]).length === 0) delete updated[schoolId];
    onChange(updated);
  };

  const addSchool = () => {
    if (schools.length === 0) return;
    const unused = schools.find(s => !guaranteesBySchool[s.id]);
    if (!unused) { alert('All schools already have guarantee entries.'); return; }
    const updated = JSON.parse(JSON.stringify(guaranteesBySchool));
    updated[unused.id] = {};
    onChange(updated);
  };

  const changeSchool = (oldSchoolId: string, newSchoolId: string) => {
    if (oldSchoolId === newSchoolId) return;
    const updated = JSON.parse(JSON.stringify(guaranteesBySchool));
    updated[newSchoolId] = updated[oldSchoolId];
    delete updated[oldSchoolId];
    onChange(updated);
  };

  const removeSchool = (schoolId: string) => {
    const updated = JSON.parse(JSON.stringify(guaranteesBySchool));
    delete updated[schoolId];
    onChange(updated);
  };

  return (
    <div className="p-3 bg-slate-800/40 rounded-xl ring-1 ring-white/5 mt-3">
      <label className="block text-[10px] font-bold text-primary-400 uppercase tracking-wider mb-2">Teacher Guarantees (by School)</label>
      {schoolEntries.length === 0 && <p className="text-[10px] text-slate-600 italic mb-2">No guarantees configured. Add a school to start.</p>}
      <div className="space-y-3">
        {schoolEntries.map(([schoolId, instruments]) => {
          const schoolName = schools.find(s => s.id === schoolId)?.name || schoolId;
          return (
            <div key={schoolId} className="bg-slate-800/50 rounded-lg p-2 border border-slate-700/50">
              <div className="flex items-center gap-2 mb-2">
                <select
                  className="bg-slate-800 text-white p-1 rounded border border-slate-700 text-xs flex-1"
                  value={schoolId}
                  onChange={e => changeSchool(schoolId, e.target.value)}
                >
                  <option value={schoolId}>{schoolName}</option>
                  {schools.filter(s => s.id !== schoolId && !guaranteesBySchool[s.id]).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <button onClick={() => removeSchool(schoolId)} className="text-red-500 text-xs hover:text-red-400">✕</button>
              </div>
              <div className="space-y-1">
                {Object.entries(instruments).map(([key, cfg]) => (
                  <div key={key} className="flex items-center gap-2 flex-wrap pl-2">
                    <input
                      className="bg-slate-800 text-white p-1 rounded border border-slate-700 text-xs w-24"
                      value={key}
                      onChange={e => updateInstrument(schoolId, key, 'instrument', e.target.value)}
                      placeholder="Instrument"
                    />
                    <label className="flex items-center gap-1 text-[10px] text-slate-400">
                      <input type="checkbox" checked={cfg.enabled} onChange={e => updateInstrument(schoolId, key, 'enabled', e.target.checked)} />
                      On
                    </label>
                    <input
                      type="number" step="0.5" min="0"
                      className="bg-slate-800 text-white p-1 rounded border border-slate-700 text-xs w-14"
                      value={cfg.minHours}
                      onChange={e => updateInstrument(schoolId, key, 'minHours', parseFloat(e.target.value) || 0)}
                    />
                    <select
                      className="bg-slate-800 text-white p-1 rounded border border-slate-700 text-[10px]"
                      value={cfg.appliesTo}
                      onChange={e => updateInstrument(schoolId, key, 'appliesTo', e.target.value)}
                    >
                      {APPLIES_TO_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <button onClick={() => removeInstrument(schoolId, key)} className="text-red-500 text-xs hover:text-red-400">✕</button>
                  </div>
                ))}
              </div>
              <button onClick={() => addInstrument(schoolId)} className="mt-1 pl-2 text-[10px] text-primary-400 hover:text-primary-300">+ Add Instrument</button>
            </div>
          );
        })}
      </div>
      <button onClick={addSchool} className="mt-2 text-[10px] text-primary-400 hover:text-primary-300">+ Add School Guarantee</button>
    </div>
  );
};

// Helper component for School Rates Editor

const SchoolRatesEditor = ({ schools, rates, onChange }: { schools: School[], rates: Record<string, number>, onChange: (schoolId: string, val: string) => void }) => {
    return (
        <div className="mt-3 p-3 bg-slate-800/40 rounded-xl ring-1 ring-white/5">
            <label className="block text-[10px] font-bold text-primary-400 uppercase tracking-wider mb-2">Per-School Rates (Override Base)</label>
            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                {schools.map(school => (
                    <div key={school.id} className="flex flex-col">
                        <label className="text-[10px] text-slate-400 truncate">{school.name}</label>
                        <input
                            type="number"
                            placeholder="Default"
                            className="bg-slate-800/80 text-white p-1.5 rounded-lg text-xs border border-slate-700/80 focus:ring-1 focus:ring-primary-500 outline-none transition-all"
                            value={rates?.[school.id] || ''}
                            onChange={(e) => onChange(school.id, e.target.value)}
                        />
                    </div>
                ))}
            </div>
        </div>
    );
};

// Phase 16: Online configuration panel for teacher edit form
const OnlineConfigEditor = ({ formData, onChange, schools, onSchoolRateChange }: {
    formData: any;
    onChange: (field: string, value: any) => void;
    schools: School[];
    onSchoolRateChange: (schoolId: string, val: string) => void;
}) => {
    return (
        <div className="mt-3 p-3 bg-slate-800/40 rounded-xl ring-1 ring-blue-500/10">
            <div className="flex items-center justify-between mb-3">
                <label className="block text-[10px] font-bold text-blue-400 uppercase tracking-wider">Online Lessons</label>
                <label className="flex items-center gap-2 cursor-pointer">
                    <input
                        type="checkbox"
                        checked={formData.supportsOnline || false}
                        onChange={e => onChange('supportsOnline', e.target.checked)}
                        className="accent-blue-500 w-4 h-4"
                    />
                    <span className="text-xs text-slate-300">Supports Online</span>
                </label>
            </div>
            {formData.supportsOnline && (
                <div className="space-y-3 animate-fade-in">
                    <div className="flex gap-2">
                        <div className="flex-1">
                            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Online Base Rate</label>
                            <input type="number" className={cfgInputCls} value={formData.onlineRate || ''} onChange={e => onChange('onlineRate', e.target.value)} placeholder="Same as base" />
                        </div>
                        <div className="flex-1">
                            <label className="text-[10px] text-slate-500 uppercase tracking-wider">Online Group Rate</label>
                            <input type="number" className={cfgInputCls} value={formData.onlineGroupRate || ''} onChange={e => onChange('onlineGroupRate', e.target.value)} placeholder="Same as group" />
                        </div>
                    </div>
                    {schools.length > 0 && (
                        <div>
                            <label className="block text-[10px] font-bold text-blue-400/70 uppercase tracking-wider mb-1">Online Per-School Rates</label>
                            <div className="grid grid-cols-2 gap-2 max-h-40 overflow-y-auto">
                                {schools.map(school => (
                                    <div key={school.id} className="flex flex-col">
                                        <label className="text-[10px] text-slate-400 truncate">{school.name}</label>
                                        <input
                                            type="number"
                                            placeholder="Default"
                                            className="bg-slate-800/80 text-white p-1.5 rounded-lg text-xs border border-slate-700/80 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                                            value={formData.onlineRatesBySchool?.[school.id] || ''}
                                            onChange={(e) => onSchoolRateChange(school.id, e.target.value)}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

// ── User Edit Modal ──────────────────────────────────────────────────────────
const UserEditModal: React.FC<{
  user: User;
  formData: any;
  schools: School[];
  signatureFile: File | null;
  signatureUploading: boolean;
  signatureInputRef: React.RefObject<HTMLInputElement>;
  onChange: (field: string, value: any) => void;
  onSchoolRateChange: (schoolId: string, val: string) => void;
  onOnlineSchoolRateChange: (schoolId: string, val: string) => void;
  onSignatureFileChange: (file: File | null) => void;
  onSave: () => void;
  onCancel: () => void;
}> = ({ user, formData, schools, signatureFile, signatureUploading, signatureInputRef, onChange, onSchoolRateChange, onOnlineSchoolRateChange, onSignatureFileChange, onSave, onCancel }) => {
  const isTeacher = formData.role === Role.TEACHER;
  const initials = (formData.name || '?').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();

  const roleColor = {
    [Role.TEACHER]: 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/25',
    [Role.ADMIN]: 'bg-primary-500/15 text-primary-400 ring-primary-500/25',
    [Role.PARENT]: 'bg-amber-500/15 text-amber-400 ring-amber-500/25',
    [Role.SCHOOL_ADMIN]: 'bg-blue-500/15 text-blue-400 ring-blue-500/25',
    [Role.STUDENT]: 'bg-slate-500/15 text-slate-400 ring-slate-500/25',
  } as Record<string, string>;

  const sectionCls = 'bg-slate-800/30 ring-1 ring-white/5 rounded-2xl p-5';

  return (
    <div className="fixed inset-0 bg-black/70 flex items-start justify-center z-50 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 ring-1 ring-white/10 rounded-2xl w-full max-w-3xl my-8 shadow-2xl flex flex-col">

        {/* Header */}
        <div className="flex items-center gap-4 px-6 py-5 border-b border-slate-800/80">
          <div className="w-11 h-11 rounded-xl bg-primary-600/20 ring-1 ring-primary-500/30 flex items-center justify-center flex-shrink-0">
            <span className="text-primary-400 font-bold text-sm">{initials}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="text-base font-bold text-white">{user.name}</h3>
              <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ring-1 capitalize ${roleColor[user.role] || roleColor[Role.STUDENT]}`}>
                {user.role.replace('_', ' ')}
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5 truncate">{user.email} · <span className="font-mono text-slate-600">{user.id}</span></p>
          </div>
          <button onClick={onCancel} className="text-slate-500 hover:text-white transition-colors w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-800 text-2xl leading-none flex-shrink-0">×</button>
        </div>

        {/* Scrollable body */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[calc(100vh-16rem)]">

          {/* Identity */}
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Identity</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={cfgLabelCls}>Name</label>
                <input className={cfgInputCls} value={formData.name} onChange={e => onChange('name', e.target.value)} placeholder="Full name" />
              </div>
              <div>
                <label className={cfgLabelCls}>Email</label>
                <input type="email" className={cfgInputCls} value={formData.email} onChange={e => onChange('email', e.target.value)} placeholder="email@example.com" />
              </div>
            </div>
          </div>

          {/* Role */}
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Role</p>
            <select className={`${cfgSelectCls} max-w-xs`} value={formData.role} onChange={e => onChange('role', e.target.value)}>
              <option value={Role.TEACHER}>Teacher</option>
              <option value={Role.ADMIN}>Admin</option>
              <option value={Role.PARENT}>Parent</option>
              <option value={Role.STUDENT}>Student</option>
              <option value={Role.SCHOOL_ADMIN}>School Admin</option>
            </select>
          </div>

          {isTeacher && (
            <>
              {/* Instrument & Base Rates */}
              <div className={sectionCls}>
                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-4">Instrument & Base Rates</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className={cfgLabelCls}>Instrument</label>
                    <input className={cfgInputCls} value={formData.instrument} onChange={e => onChange('instrument', e.target.value)} placeholder="e.g. Piano" />
                  </div>
                  <div>
                    <label className={cfgLabelCls}>Base Rate (SAR)</label>
                    <input type="number" className={cfgInputCls} value={formData.baseRate} onChange={e => onChange('baseRate', e.target.value)} placeholder="0" />
                  </div>
                  <div>
                    <label className={cfgLabelCls}>Group Rate (SAR)</label>
                    <input type="number" className={cfgInputCls} value={formData.baseGroupRate} onChange={e => onChange('baseGroupRate', e.target.value)} placeholder="0" />
                  </div>
                </div>
              </div>

              {/* Per-School Rates */}
              <SchoolRatesEditor schools={schools} rates={formData.ratesBySchool || {}} onChange={onSchoolRateChange} />

              {/* Teacher Guarantees */}
              <TeacherGuaranteeEditor
                guaranteesBySchool={formData.teacherGuarantees || {}}
                schools={schools}
                onChange={(g: Record<string, Record<string, GuaranteeConfig>>) => onChange('teacherGuarantees', g)}
              />

              {/* Online Lessons */}
              <OnlineConfigEditor
                formData={formData}
                onChange={onChange}
                schools={schools}
                onSchoolRateChange={onOnlineSchoolRateChange}
              />

              {/* Report Identity */}
              <div className="bg-slate-800/30 ring-1 ring-violet-500/10 rounded-2xl p-5">
                <p className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider mb-4">Report Identity</p>
                <div className="space-y-4">
                  <div>
                    <label className={cfgLabelCls}>Name on Reports</label>
                    <input
                      className={cfgInputCls}
                      value={formData.reportDisplayName || ''}
                      onChange={e => onChange('reportDisplayName', e.target.value)}
                      placeholder={`e.g. Mrs. ${formData.name || 'Teacher Name'}`}
                    />
                    <p className="text-[10px] text-slate-600 mt-1">Printed at the bottom of PDF reports. Defaults to login name if blank.</p>
                  </div>
                  <div>
                    <label className={cfgLabelCls}>Signature PNG</label>
                    <div className="mt-1.5 flex items-center gap-3">
                      {(signatureFile ? URL.createObjectURL(signatureFile) : formData.signatureUrl) ? (
                        <img
                          src={signatureFile ? URL.createObjectURL(signatureFile) : formData.signatureUrl}
                          alt="Signature preview"
                          className="h-10 max-w-[120px] object-contain rounded bg-white/5 border border-slate-700 px-1"
                        />
                      ) : (
                        <div className="h-10 w-24 rounded bg-slate-800 border border-dashed border-slate-600 flex items-center justify-center">
                          <span className="text-[10px] text-slate-600">No sig</span>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => signatureInputRef.current?.click()}
                          className="text-xs px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 transition-colors"
                        >
                          {signatureFile ? 'Change' : formData.signatureUrl ? 'Replace' : 'Upload PNG'}
                        </button>
                        {(signatureFile || formData.signatureUrl) && (
                          <button
                            type="button"
                            onClick={() => { onSignatureFileChange(null); onChange('signatureUrl', ''); }}
                            className="text-xs px-3 py-1.5 rounded-lg bg-red-900/30 hover:bg-red-900/50 text-red-400 transition-colors"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                    <input
                      ref={signatureInputRef}
                      type="file"
                      accept="image/png,image/jpeg"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) onSignatureFileChange(file);
                        e.target.value = '';
                      }}
                    />
                    {signatureFile && <p className="text-[10px] text-amber-400 mt-1">New file selected — will upload on Save.</p>}
                    <p className="text-[10px] text-slate-600 mt-0.5">PNG/JPG, max 2 MB. Transparent background recommended.</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800/80 flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-xl bg-slate-800 ring-1 ring-white/10 text-slate-300 text-sm font-medium hover:bg-slate-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSave}
            disabled={signatureUploading}
            className="px-5 py-2 rounded-xl bg-primary-600 hover:bg-primary-500 disabled:opacity-60 disabled:cursor-wait text-white text-sm font-semibold transition-colors shadow-lg shadow-primary-900/20"
          >
            {signatureUploading ? 'Uploading…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
};

export const Configuration: React.FC = () => {
  const { schools, teachers, students, users, lessons, currentUser, addSchool, addUser, addStudent, updateSchool, updateUser, updateStudent, deleteUser, deleteSchool, deleteStudent, processStudentImport, repairSchoolRates } = useApp();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(() => searchParams.get('tab') || 'schools');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<any>({});
  
  // Create New States
  const [newSchool, setNewSchool] = useState({ name: '', code: '', rate: 120, groupRate: 80 });
  const [newStudent, setNewStudent] = useState({ name: '', schoolId: '', teacherId: '', instrument: '', yearGrade: '', email: '', dateOfBirth: '' });
  const [inviteUser, setInviteUser] = useState({ name: '', email: '', password: '', role: Role.TEACHER, instrument: '' });

  // Search State
  const [studentSearch, setStudentSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');

  // Signature upload state
  const [signatureFile, setSignatureFile] = useState<File | null>(null);
  const [signatureUploading, setSignatureUploading] = useState(false);
  const signatureInputRef = useRef<HTMLInputElement>(null);

  // Rate repair
  const [repairRunning, setRepairRunning] = useState(false);
  const [repairResult, setRepairResult] = useState<{ fixed: number; total: number; details: string[] } | null>(null);

  const handleRepairRates = async () => {
    if (!window.confirm('This will scan all lessons and fix any incorrect school billing rates. Continue?')) return;
    setRepairRunning(true);
    setRepairResult(null);
    try {
      const result = await repairSchoolRates();
      setRepairResult(result);
    } catch (e: any) {
      alert('Repair failed: ' + (e.message || e));
    }
    setRepairRunning(false);
  };

  // Phase 17.G Migration Tool State
  const [migrationPreview, setMigrationPreview] = useState<null | MigrationPreviewRow[]>(null);
  const [migrationRunning, setMigrationRunning] = useState(false);
  const [migrationResult, setMigrationResult] = useState<string | null>(null);

  // Identify teachers that need migration: have legacy field, no (or empty) new field
  const legacyTeachers = useMemo(() =>
    teachers.filter(t =>
      t.minimumDailyHoursByInstrument &&
      Object.keys(t.minimumDailyHoursByInstrument).length > 0 &&
      (!t.guaranteesBySchool || Object.keys(t.guaranteesBySchool).length === 0)
    ),
    [teachers]
  );

  // Generate dry-run preview
  const generateMigrationPreview = () => {
    const rows: MigrationPreviewRow[] = legacyTeachers.map(teacher => {
      const legacy = teacher.minimumDailyHoursByInstrument!;
      const inferredSchools = inferSchoolsForTeacher(teacher, lessons, students, schools);
      const needsManualReview = inferredSchools.length === 0;

      // Build new guaranteesBySchool: apply legacy guarantees to each inferred school
      const newGuaranteesBySchool: Record<string, Record<string, GuaranteeConfig>> = {};
      inferredSchools.forEach(({ id: schoolId }) => {
        const instruments: Record<string, GuaranteeConfig> = {};
        Object.entries(legacy).forEach(([inst, cfg]) => {
          instruments[normalizeInstrument(inst)] = {
            enabled: cfg.guaranteed,
            minHours: cfg.minHours,
            appliesTo: 'in_person_only' // safe default for legacy data
          };
        });
        newGuaranteesBySchool[schoolId] = instruments;
      });

      return {
        teacherId: teacher.id,
        teacherName: teacher.name,
        instrument: teacher.instrument,
        legacyGuarantees: legacy,
        inferredSchools,
        newGuaranteesBySchool,
        needsManualReview
      };
    });

    setMigrationPreview(rows);
    setMigrationResult(null);
  };

  // Execute migration for all previewed teachers (except manual review ones)
  const executeMigration = async () => {
    if (!migrationPreview) return;
    const migratable = migrationPreview.filter(r => !r.needsManualReview);
    if (migratable.length === 0) {
      setMigrationResult('No teachers to migrate automatically. All need manual review.');
      return;
    }

    if (!window.confirm(
      `This will migrate ${migratable.length} teacher(s) to the new guarantee format and remove their legacy data. Continue?`
    )) return;

    setMigrationRunning(true);
    let successCount = 0;
    let errorCount = 0;

    for (const row of migratable) {
      try {
        const teacher = teachers.find(t => t.id === row.teacherId);
        if (!teacher) { errorCount++; continue; }

        // Call updateUser with guaranteesBySchool — Fix 3 will deleteField() the legacy field
        const result = await updateUser(row.teacherId, { name: teacher.name }, {
          instrument: teacher.instrument,
          baseRate: teacher.baseRate,
          baseGroupRate: teacher.baseGroupRate,
          ratesBySchool: teacher.ratesBySchool || {},
          guaranteesBySchool: row.newGuaranteesBySchool,
          supportsOnline: teacher.supportsOnline || false,
          onlineRate: teacher.onlineRate || 0,
          onlineGroupRate: teacher.onlineGroupRate || 0,
          onlineRatesBySchool: teacher.onlineRatesBySchool || {}
        } as any);

        if (result) successCount++;
        else errorCount++;
      } catch (e) {
        console.error(`Migration failed for ${row.teacherId}:`, e);
        errorCount++;
      }
    }

    setMigrationRunning(false);
    const manualCount = migrationPreview.filter(r => r.needsManualReview).length;
    setMigrationResult(
      `Migration complete: ${successCount} succeeded, ${errorCount} failed` +
      (manualCount > 0 ? `, ${manualCount} need manual review` : '')
    );
    setMigrationPreview(null);
  };

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importResults, setImportResults] = useState<{ added: number; skipped: number; errors: number; updated: number } | null>(null);

  const filteredStudents = useMemo(() => {
    if (!studentSearch.trim()) return students;
    const query = studentSearch.toLowerCase();
    return students.filter(s => {
        // Defensive: some legacy student records may be missing fields.
        const safeId = String((s as any)?.id || '').toLowerCase();
        const safeName = String((s as any)?.name || '').toLowerCase();
        const safeInstrument = String((s as any)?.instrument || '').toLowerCase();
        const safePhone = String((s as any)?.phone || '').toLowerCase();

        const schoolName = String(schools.find(sch => sch.id === (s as any)?.schoolId)?.name || '').toLowerCase();
        return (
            safeId.includes(query) ||
            safeName.includes(query) ||
            safeInstrument.includes(query) ||
            schoolName.includes(query) ||
            (safePhone && safePhone.includes(query))
        );
    });
  }, [students, studentSearch, schools]);

  const startEditing = (item: any) => {
    setEditingId(item.id);
    let formData = { ...item };
    
    if (activeTab === 'users' && item.role === Role.TEACHER) {
        const teacher = teachers.find(t => t.id === item.id);
        if (teacher) {
            formData = {
                ...formData,
                instrument: teacher.instrument,
                baseRate: teacher.baseRate,
                baseGroupRate: teacher.baseGroupRate,
                ratesBySchool: teacher.ratesBySchool || {},
                // Phase 17.G: Load structured teacher guarantees (with legacy inference)
                teacherGuarantees: readTeacherGuarantees(teacher, lessons, students, schools),
                // Phase 16: Online config
                supportsOnline: teacher.supportsOnline || false,
                onlineRate: teacher.onlineRate || '',
                onlineGroupRate: teacher.onlineGroupRate || '',
                onlineRatesBySchool: teacher.onlineRatesBySchool || {},
                reportDisplayName: teacher.reportDisplayName || '',
                signatureUrl: teacher.signatureUrl || '',
            };
        }
    }

    if (activeTab === 'schools') {
        formData = {
            ...formData,
            // Phase 17.G: Load structured school guarantees
            schoolGuarantees: readSchoolGuarantees(item),
            // Phase 16: Online rate fields
            defaultOnlineRate: item.defaultOnlineRate || '',
            defaultOnlineGroupRate: item.defaultOnlineGroupRate || ''
        };
    }

    setEditFormData(formData);
  };

  const cancelEditing = () => { setEditingId(null); setEditFormData({}); setSignatureFile(null); };

  const handleEditChange = (field: string, value: any) => {
    setEditFormData((prev: any) => ({ ...prev, [field]: value }));
  };
  
  // New handler for ratesBySchool nested changes
  const handleSchoolRateChange = (schoolId: string, value: string) => {
      setEditFormData((prev: any) => ({
          ...prev,
          ratesBySchool: {
              ...prev.ratesBySchool,
              [schoolId]: value === '' ? undefined : Number(value)
          }
      }));
  };

  // Phase 16: Handler for online per-school rate changes
  const handleOnlineSchoolRateChange = (schoolId: string, value: string) => {
      setEditFormData((prev: any) => ({
          ...prev,
          onlineRatesBySchool: {
              ...prev.onlineRatesBySchool,
              [schoolId]: value === '' ? undefined : Number(value)
          }
      }));
  };

  const handleSave = async () => {
    try {
            if (activeTab === 'schools') {
                // Phase 17.G: Clean and normalize school guarantees
                const schoolGuarantees: Record<string, GuaranteeConfig> = {};
                if (editFormData.schoolGuarantees) {
                    Object.entries(editFormData.schoolGuarantees).forEach(([key, cfg]: [string, any]) => {
                        const normKey = normalizeInstrument(key);
                        if (normKey && !normKey.startsWith('instrument_')) {
                            schoolGuarantees[normKey] = {
                                enabled: !!cfg.enabled,
                                minHours: Number(cfg.minHours) || 0,
                                appliesTo: cfg.appliesTo || 'in_person_only'
                            };
                        }
                    });
                }

                await updateSchool(editingId!, {
                    name: editFormData.name, code: editFormData.code,
                    defaultRate: Number(editFormData.defaultRate), defaultGroupRate: Number(editFormData.defaultGroupRate),
                    // Phase 17.G: Write ONLY to new field (source of truth)
                    guaranteesByInstrument: schoolGuarantees,
                    // Phase 16: Online rates
                    defaultOnlineRate: Number(editFormData.defaultOnlineRate) || 0,
                    defaultOnlineGroupRate: Number(editFormData.defaultOnlineGroupRate) || 0
                });
            } else if (activeTab === 'users') {
                // Clean up ratesBySchool (remove undefined/null values)
                const cleanRatesBySchool: Record<string, number> = {};
                if (editFormData.ratesBySchool) {
                    Object.entries(editFormData.ratesBySchool).forEach(([key, val]) => {
                        if (val !== undefined && val !== null && val !== '' && !isNaN(Number(val))) {
                            cleanRatesBySchool[key] = Number(val);
                        }
                    });
                }

                // Phase 16: Clean up onlineRatesBySchool
                const cleanOnlineRatesBySchool: Record<string, number> = {};
                if (editFormData.onlineRatesBySchool) {
                    Object.entries(editFormData.onlineRatesBySchool).forEach(([key, val]) => {
                        if (val !== undefined && val !== null && val !== '' && !isNaN(Number(val))) {
                            cleanOnlineRatesBySchool[key] = Number(val);
                        }
                    });
                }

                // Phase 17.G: Clean and normalize teacher guarantees
                const teacherGuarantees: Record<string, Record<string, GuaranteeConfig>> = {};
                if (editFormData.teacherGuarantees) {
                    Object.entries(editFormData.teacherGuarantees).forEach(([schoolId, instruments]: [string, any]) => {
                        const cleanInstruments: Record<string, GuaranteeConfig> = {};
                        Object.entries(instruments).forEach(([key, cfg]: [string, any]) => {
                            const normKey = normalizeInstrument(key);
                            if (normKey && !normKey.startsWith('instrument_')) {
                                cleanInstruments[normKey] = {
                                    enabled: !!cfg.enabled,
                                    minHours: Number(cfg.minHours) || 0,
                                    appliesTo: cfg.appliesTo || 'in_person_only'
                                };
                            }
                        });
                        if (Object.keys(cleanInstruments).length > 0) {
                            teacherGuarantees[schoolId] = cleanInstruments;
                        }
                    });
                }

                // Upload signature PNG if a new file was selected
                let resolvedSignatureUrl: string | undefined = editFormData.signatureUrl || undefined;
                if (signatureFile && editFormData.role === Role.TEACHER) {
                  setSignatureUploading(true);
                  try {
                    const storage = getStorage(getApp());
                    const sigRef = storageRef(storage, `signatures/${editingId}`);
                    await uploadBytes(sigRef, signatureFile, { contentType: signatureFile.type });
                    resolvedSignatureUrl = await getDownloadURL(sigRef);
                    // Also store as base64 in Firestore (avoids CORS when rendering PDFs)
                    const base64: string = await new Promise((resolve, reject) => {
                      const reader = new FileReader();
                      reader.onload = () => resolve(reader.result as string);
                      reader.onerror = reject;
                      reader.readAsDataURL(signatureFile!);
                    });
                    const db = getFirestore(getApp());
                    await firestoreSetDoc(firestoreDoc(db, 'teacherSignatures', editingId!), { base64 });
                  } finally {
                    setSignatureUploading(false);
                    setSignatureFile(null);
                  }
                }
                // If admin removed the signature, clear the Firestore record too
                if (!resolvedSignatureUrl && editFormData.role === Role.TEACHER) {
                  try {
                    const db = getFirestore(getApp());
                    await firestoreDeleteDoc(firestoreDoc(db, 'teacherSignatures', editingId!));
                  } catch { /* doc might not exist — ignore */ }
                }

                await updateUser(editingId!, { name: editFormData.name, email: editFormData.email },
                    editFormData.role === Role.TEACHER ? {
                        instrument: editFormData.instrument,
                        baseRate: Number(editFormData.baseRate),
                        baseGroupRate: Number(editFormData.baseGroupRate),
                        ratesBySchool: cleanRatesBySchool,
                        // Phase 17.G: Write ONLY to new field (source of truth)
                        guaranteesBySchool: teacherGuarantees,
                        // Phase 16: Online fields
                        supportsOnline: editFormData.supportsOnline || false,
                        onlineRate: Number(editFormData.onlineRate) || 0,
                        onlineGroupRate: Number(editFormData.onlineGroupRate) || 0,
                        onlineRatesBySchool: cleanOnlineRatesBySchool,
                        // Report identity fields
                        reportDisplayName: editFormData.reportDisplayName?.trim() || null,
                        signatureUrl: resolvedSignatureUrl || null,
                    } : undefined
                );
            } else if (activeTab === 'students') {
                // Phase 19.4B: sanitise enrichment fields — drop empty, normalise email
                const studentPatch: Record<string, any> = {
                  name: editFormData.name,
                  schoolId: editFormData.schoolId,
                  teacherId: editFormData.teacherId,
                  instrument: editFormData.instrument,
                };
                const yg = String(editFormData.yearGrade ?? '').replace(/\D/g, '') || null;
                const em = String(editFormData.email ?? '').trim().toLowerCase();
                const db_ = String(editFormData.dateOfBirth ?? '').trim().substring(0, 10);
                studentPatch.yearGrade = yg; // null clears stored value
                if (em) studentPatch.email = em;     else studentPatch.email = null;
                if (db_) studentPatch.dateOfBirth = db_; else studentPatch.dateOfBirth = null;
                await updateStudent(editingId!, studentPatch);
            }
      alert('Saved successfully.');
      cancelEditing();
    } catch (e: any) {
      console.error(e);
      alert(e?.message || 'Save failed.');
    }
  };

  const handleDelete = async (id: string, name: string) => {
    try {
            if (id === currentUser?.id) { alert("You cannot delete your own account."); return; }
            if (!window.confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) return;
            if (activeTab === 'schools') await deleteSchool(id);
            else if (activeTab === 'users') await deleteUser(id);
            else if (activeTab === 'students') await deleteStudent(id);
    } catch (e: any) {
      console.error(e);
      alert(e?.message || 'Delete failed.');
    }
  };

  const handleAddSchoolSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      const res = await addSchool(newSchool.name, newSchool.rate, newSchool.groupRate, newSchool.code);
      if (res.success) { setNewSchool({ name: '', code: '', rate: 120, groupRate: 80 }); alert("School added."); }
      else alert(res.message);
  };

  const handleAddUserSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (inviteUser.role === Role.TEACHER && !inviteUser.instrument.trim()) {
        alert('Please enter an instrument for the teacher (e.g., Violin, Piano).');
        return;
      }
      const userData: any = { name: inviteUser.name, email: inviteUser.email, role: inviteUser.role };
      if (inviteUser.role === Role.SCHOOL_ADMIN) userData.schoolId = (inviteUser as any).schoolId;
      const res = await addUser(
        userData,
        inviteUser.role === Role.TEACHER ? { instrument: inviteUser.instrument } : undefined,
        inviteUser.password || undefined
      );
      if (res.success) { setInviteUser({ name: '', email: '', password: '', role: Role.TEACHER, instrument: '' }); alert("User created."); }
      else alert(res.message);
  };

  const handleAddStudentSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      const res = await addStudent(
        newStudent.name, newStudent.schoolId, newStudent.teacherId, newStudent.instrument,
        { yearGrade: newStudent.yearGrade, email: newStudent.email, dateOfBirth: newStudent.dateOfBirth },
      );
      if (res.success) {
        setNewStudent({ name: '', schoolId: '', teacherId: '', instrument: '', yearGrade: '', email: '', dateOfBirth: '' });
        alert('Student added.');
      } else {
        alert(res.message || 'Failed to add student.');
      }
  };

  const handleExportStudents = () => {
    const data = studentsToExcel(students, schools, teachers);
    downloadExcel(data, `Students_Export_${new Date().toISOString().slice(0,10)}.xlsx`, 'Students', STUDENT_IMPORT_INSTRUCTIONS);
  };

  const handleImportStudents = async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
          const data = await parseStudentExcel(file);
          const results = await processStudentImport(data, {
            role: currentUser?.role,
            currentUserId: currentUser?.id,
          });
          setImportResults(results);
      } catch (err) { alert('Import failed: ' + err); }
      if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const editingUser = activeTab === 'users' && editingId ? users.find(u => u.id === editingId) : null;

  return (
    <div className="space-y-8">
      {importResults && <ImportResultsModal results={importResults} onClose={() => setImportResults(null)} />}

      {/* User edit modal */}
      {editingUser && (
        <UserEditModal
          user={editingUser}
          formData={editFormData}
          schools={schools}
          signatureFile={signatureFile}
          signatureUploading={signatureUploading}
          signatureInputRef={signatureInputRef}
          onChange={handleEditChange}
          onSchoolRateChange={handleSchoolRateChange}
          onOnlineSchoolRateChange={handleOnlineSchoolRateChange}
          onSignatureFileChange={setSignatureFile}
          onSave={handleSave}
          onCancel={cancelEditing}
        />
      )}

      {/* Page header */}
      <div className="flex justify-between items-start gap-4">
          <div>
            <h1 className="text-3xl font-bold text-white tracking-tight">System Configuration</h1>
            <p className="text-slate-500 text-sm mt-1">Manage schools, users, and students</p>
          </div>
          {activeTab === 'students' && (
              <div className="flex gap-2 shrink-0">
                  <input type="file" ref={fileInputRef} onChange={handleImportStudents} className="hidden" accept=".xlsx, .xls, .csv" />
                  <button onClick={() => fileInputRef.current?.click()} className="bg-slate-800/80 ring-1 ring-white/5 hover:bg-slate-700/80 text-slate-300 hover:text-white px-3.5 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                    Import
                  </button>
                  <button onClick={handleExportStudents} className="bg-slate-800/80 ring-1 ring-white/5 hover:bg-slate-700/80 text-slate-300 hover:text-white px-3.5 py-2 rounded-xl text-xs font-medium transition-all flex items-center gap-2">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    Export
                  </button>
              </div>
          )}
      </div>

      {/* Tab bar */}
      <div className="flex gap-2 border-b border-slate-800/60 pb-4">
        <TabButton name="schools" label="Schools Management" activeTab={activeTab} onClick={() => setActiveTab('schools')} />
        <TabButton name="users" label="User Authorization" activeTab={activeTab} onClick={() => setActiveTab('users')} />
        <TabButton name="students" label="Student Directory" activeTab={activeTab} onClick={() => setActiveTab('students')} />
        <TabButton name="periods" label="School Periods" activeTab={activeTab} onClick={() => setActiveTab('periods')} />
        <TabButton name="parents" label="Parent Onboarding" activeTab={activeTab} onClick={() => setActiveTab('parents')} />
      </div>

      {/* SCHOOLS TAB */}
      {activeTab === 'schools' && (
        <div className="space-y-6">
            <div className="bg-white/5 backdrop-blur-xl ring-1 ring-white/10 rounded-2xl p-6">
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-5">Add New School</h2>
                <form onSubmit={handleAddSchoolSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div>
                        <label className={cfgLabelCls}>School Name</label>
                        <input required value={newSchool.name} onChange={e=>setNewSchool({...newSchool, name: e.target.value})} className={cfgInputCls} placeholder="e.g. British School" />
                    </div>
                    <div>
                        <label className={cfgLabelCls}>Code (2 Chars)</label>
                        <input required maxLength={2} value={newSchool.code} onChange={e=>setNewSchool({...newSchool, code: e.target.value.toUpperCase()})} className={cfgInputCls} placeholder="KC" />
                    </div>
                    <div>
                        <label className={cfgLabelCls}>Indiv/Group Rates (SAR)</label>
                        <div className="flex gap-2">
                            <input type="number" value={newSchool.rate} onChange={e=>setNewSchool({...newSchool, rate: Number(e.target.value)})} className={cfgInputCls} />
                            <input type="number" value={newSchool.groupRate} onChange={e=>setNewSchool({...newSchool, groupRate: Number(e.target.value)})} className={cfgInputCls} />
                        </div>
                    </div>
                    <button type="submit" className="bg-primary-600 hover:bg-primary-500 text-white font-semibold py-2.5 rounded-xl shadow-lg shadow-primary-900/20 transition-all active:scale-[0.98]">Add School</button>
                </form>
            </div>
            
            <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="bg-slate-800/40 text-[10px] text-slate-500 uppercase tracking-wider">
                            <th className="px-5 py-3 font-medium">School</th><th className="px-5 py-3 font-medium">Code</th><th className="px-5 py-3 font-medium">Rates</th><th className="px-5 py-3 text-right font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                        {schools.map(s => {
                            const isEditing = editingId === s.id;
                            return (
                              <React.Fragment key={s.id}>
                                <tr className="hover:bg-slate-800/30 transition-colors">
                                    {isEditing ? (
                                        <>
                                            <td className="px-5 py-3.5"><input className={cfgInputCls} value={editFormData.name} onChange={e=>handleEditChange('name', e.target.value)} /></td>
                                            <td className="px-5 py-3.5"><input className={`${cfgInputCls} !w-16`} value={editFormData.code} onChange={e=>handleEditChange('code', e.target.value.toUpperCase())} /></td>
                                            <td className="px-5 py-3.5">
                                                <div className="mb-2">
                                                    <label className="text-[10px] text-slate-500 uppercase tracking-wider">In-Person Rates (Indiv / Group)</label>
                                                    <div className="flex gap-2 mt-1">
                                                        <input type="number" className={`${cfgInputCls} !w-20`} value={editFormData.defaultRate} onChange={e=>handleEditChange('defaultRate', e.target.value)} />
                                                        <input type="number" className={`${cfgInputCls} !w-20`} value={editFormData.defaultGroupRate} onChange={e=>handleEditChange('defaultGroupRate', e.target.value)} />
                                                    </div>
                                                </div>
                                                <div className="mb-2">
                                                    <label className="text-[10px] text-blue-400/70 uppercase tracking-wider">Online Rates (Indiv / Group)</label>
                                                    <div className="flex gap-2 mt-1">
                                                        <input type="number" className={`${cfgInputCls} !w-20`} value={editFormData.defaultOnlineRate} onChange={e=>handleEditChange('defaultOnlineRate', e.target.value)} placeholder="0" />
                                                        <input type="number" className={`${cfgInputCls} !w-20`} value={editFormData.defaultOnlineGroupRate} onChange={e=>handleEditChange('defaultOnlineGroupRate', e.target.value)} placeholder="0" />
                                                    </div>
                                                </div>
                                                <SchoolGuaranteeEditor guarantees={editFormData.schoolGuarantees || {}} onChange={(g: Record<string, GuaranteeConfig>) => handleEditChange('schoolGuarantees', g)} />
                                            </td>
                                            <td className="px-5 py-3.5 text-right space-y-2">
                                                <button onClick={handleSave} className="bg-primary-600 hover:bg-primary-500 px-3 py-1.5 rounded-lg text-white text-xs font-medium block w-full transition-colors">Save</button>
                                                <button onClick={cancelEditing} className="bg-slate-800 ring-1 ring-white/10 px-3 py-1.5 rounded-lg text-slate-300 text-xs font-medium block w-full hover:bg-slate-700 transition-colors">Cancel</button>
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="px-5 py-3.5 text-white font-medium">{s.name}</td>
                                            <td className="px-5 py-3.5 text-slate-400 font-mono uppercase">{s.code}</td>
                                            <td className="px-5 py-3.5 text-slate-300">
                                                <div className="tabular-nums">{s.defaultRate}/{s.defaultGroupRate} SAR</div>
                                                {((s as any).defaultOnlineRate > 0 || (s as any).defaultOnlineGroupRate > 0) && (
                                                    <div className="text-blue-400/70 text-[11px] tabular-nums">Online: {(s as any).defaultOnlineRate || 0}/{(s as any).defaultOnlineGroupRate || 0} SAR</div>
                                                )}
                                                <GuaranteeBadge school={s} />
                                            </td>
                                            <td className="px-5 py-3.5 text-right space-x-3">
                                                <button onClick={()=>startEditing(s)} className="text-primary-400 hover:text-primary-300 text-xs font-medium transition-colors">Edit</button>
                                                <button onClick={()=>handleDelete(s.id, s.name)} className="text-red-400 hover:text-red-300 text-xs font-medium transition-colors">Delete</button>
                                            </td>
                                        </>
                                    )}
                                </tr>
                                {isEditing && (
                                  <tr>
                                    <td colSpan={4} className="px-5 pb-4">
                                      <SchoolCertificateBranding schoolId={s.id} schoolName={s.name} />
                                    </td>
                                  </tr>
                                )}
                              </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
      )}

      {/* USERS TAB */}
      {activeTab === 'users' && (
        <div className="space-y-6">
            <div className="bg-white/5 backdrop-blur-xl ring-1 ring-white/10 rounded-2xl p-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Authorize User</h2>
                </div>
                <form onSubmit={handleAddUserSubmit} className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                    <div>
                        <label className={cfgLabelCls}>Name</label>
                        <input required value={inviteUser.name} onChange={e=>setInviteUser({...inviteUser, name:e.target.value})} className={cfgInputCls} />
                    </div>
                    <div>
                        <label className={cfgLabelCls}>Email</label>
                        <input required type="email" value={inviteUser.email} onChange={e=>setInviteUser({...inviteUser, email:e.target.value})} className={cfgInputCls} />
                    </div>
                    <div>
                        <label className={cfgLabelCls}>Password <span className="normal-case font-normal text-slate-600">(for email login)</span></label>
                        <input type="password" value={inviteUser.password} onChange={e=>setInviteUser({...inviteUser, password:e.target.value})} placeholder="Min 6 chars (optional)" minLength={6} className={cfgInputCls} />
                    </div>
                    <div>
                        <label className={cfgLabelCls}>Role/Instrument</label>
                        <div className="flex gap-2">
                            <select value={inviteUser.role} onChange={e=>setInviteUser({...inviteUser, role:e.target.value as Role})} className={cfgSelectCls}>
                                <option value={Role.TEACHER}>Teacher</option>
                                <option value={Role.ADMIN}>Admin</option>
                                <option value={Role.PARENT}>Parent</option>
                                <option value={Role.STUDENT}>Student</option>
                                <option value={Role.SCHOOL_ADMIN}>School Admin</option>
                            </select>
                            {inviteUser.role === Role.TEACHER && (
                              <input
                                required
                                value={inviteUser.instrument}
                                onChange={e=>setInviteUser({...inviteUser, instrument:e.target.value})}
                                placeholder="Instrument (e.g., Violin)"
                                className={cfgInputCls}
                              />
                            )}
                            {inviteUser.role === Role.SCHOOL_ADMIN && (
                              <select
                                required
                                value={(inviteUser as any).schoolId || ''}
                                onChange={e=>setInviteUser({...inviteUser, schoolId: e.target.value} as any)}
                                className={cfgSelectCls}
                              >
                                <option value="">Select school...</option>
                                {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                              </select>
                            )}
                        </div>
                    </div>
                    <button type="submit" className="bg-primary-600 hover:bg-primary-500 text-white font-semibold py-2.5 rounded-xl shadow-lg shadow-primary-900/20 transition-all active:scale-[0.98]">Authorize</button>
                </form>
            </div>

            {/* Phase 17.G: Legacy Guarantee Migration Tool — visible only when legacy teachers exist */}
            {legacyTeachers.length > 0 && (
              <div className="bg-amber-500/5 ring-1 ring-amber-500/20 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-bold text-amber-400">⚠ Legacy Guarantee Migration</h3>
                    <p className="text-xs text-amber-500/70 mt-1">
                      {legacyTeachers.length} teacher(s) have legacy guarantees that need migration to the new per-school format.
                    </p>
                  </div>
                  {!migrationPreview && (
                    <button
                      onClick={generateMigrationPreview}
                      className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold px-4 py-2 rounded-lg"
                    >
                      Preview Migration
                    </button>
                  )}
                </div>

                {migrationResult && (
                  <div className="bg-emerald-500/5 ring-1 ring-emerald-500/20 rounded-xl p-3 mb-3">
                    <p className="text-xs text-emerald-400">{migrationResult}</p>
                  </div>
                )}

                {migrationPreview && (
                  <div className="space-y-3">
                    <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-xl overflow-hidden">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="bg-slate-800/40 text-[10px] text-slate-500 uppercase tracking-wider">
                            <th className="p-3">Teacher</th>
                            <th className="p-3">Legacy Guarantees</th>
                            <th className="p-3">Inferred Schools</th>
                            <th className="p-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {migrationPreview.map(row => (
                            <tr key={row.teacherId} className={row.needsManualReview ? 'bg-red-500/5' : ''}>
                              <td className="p-3">
                                <div className="text-white font-bold">{row.teacherName}</div>
                                <div className="text-slate-500 text-[10px]">{row.instrument}</div>
                              </td>
                              <td className="p-3 text-slate-300">
                                {Object.entries(row.legacyGuarantees).map(([inst, cfg]) => (
                                  <span key={inst} className="inline-block bg-slate-800 px-1.5 py-0.5 rounded border border-slate-700 mr-1 mb-1">
                                    {inst}: {cfg.minHours}h {cfg.guaranteed ? '✓' : '✗'}
                                  </span>
                                ))}
                              </td>
                              <td className="p-3">
                                {row.inferredSchools.length > 0 ? (
                                  <div className="space-y-1">
                                    {row.inferredSchools.map(s => (
                                      <div key={s.id} className="text-slate-300">
                                        <span className="font-medium">{s.name}</span>
                                        <span className="text-slate-500 text-[10px] ml-1">({s.source})</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-rose-400 italic">No school found</span>
                                )}
                              </td>
                              <td className="p-3">
                                {row.needsManualReview ? (
                                  <span className="text-rose-400 text-[10px] font-bold">MANUAL REVIEW</span>
                                ) : (
                                  <span className="text-emerald-400 text-[10px] font-bold">READY</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div className="flex gap-3 justify-end">
                      <button
                        onClick={() => { setMigrationPreview(null); setMigrationResult(null); }}
                        className="bg-slate-800 ring-1 ring-white/10 hover:bg-slate-700 text-slate-300 text-xs font-medium px-4 py-2 rounded-xl transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={executeMigration}
                        disabled={migrationRunning || migrationPreview.filter(r => !r.needsManualReview).length === 0}
                        className="bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-medium px-4 py-2 rounded-xl transition-colors"
                      >
                        {migrationRunning ? 'Migrating...' : `Confirm Migration (${migrationPreview.filter(r => !r.needsManualReview).length} teachers)`}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-800/60 flex items-center justify-between gap-3">
                  <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider whitespace-nowrap">Authorized Users</span>
                  <div className="relative flex-1 max-w-xs">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                    <input
                      type="text"
                      placeholder="Search by name, email, or role…"
                      value={userSearch}
                      onChange={e => setUserSearch(e.target.value)}
                      className="w-full bg-slate-800/60 border border-slate-700/50 rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder:text-slate-600 focus:ring-1 focus:ring-primary-500 focus:border-transparent outline-none transition-all"
                    />
                    {userSearch && (
                      <button onClick={() => setUserSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] font-medium text-slate-600 tabular-nums whitespace-nowrap">{users.length} total</span>
                </div>
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="bg-slate-800/40 text-[10px] text-slate-500 uppercase tracking-wider">
                            <th className="px-5 py-3 font-medium">User</th><th className="px-5 py-3 font-medium">Role</th><th className="px-5 py-3 font-medium">Instrument / Rates</th><th className="px-5 py-3 text-right font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                        {users.filter(u => {
                          if (!userSearch.trim()) return true;
                          const q = userSearch.trim().toLowerCase();
                          const teacher = teachers.find(t => t.id === u.id);
                          return (
                            u.name.toLowerCase().includes(q) ||
                            u.email.toLowerCase().includes(q) ||
                            u.role.toLowerCase().includes(q) ||
                            (teacher?.instrument?.toLowerCase().includes(q))
                          );
                        }).map(u => {
                            const teacher = teachers.find(t => t.id === u.id);

                            return (
                                <tr key={u.id} onClick={() => startEditing(u)} className="hover:bg-slate-800/50 cursor-pointer transition-colors">
                                    <td className="px-5 py-3.5">
                                        <div className="text-white font-medium">{u.name}</div>
                                        <div className="text-slate-500 text-xs">{u.email}</div>
                                        <div className="text-slate-600 text-[10px] font-mono mt-1">ID: {u.id}</div>
                                    </td>
                                    <td className="px-5 py-3.5">
                                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium ring-1 ${
                                          u.role === Role.ADMIN ? 'bg-primary-500/15 text-primary-400 ring-primary-500/20' :
                                          u.role === Role.TEACHER ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20' :
                                          u.role === Role.PARENT ? 'bg-amber-500/15 text-amber-400 ring-amber-500/20' :
                                          u.role === Role.SCHOOL_ADMIN ? 'bg-blue-500/15 text-blue-400 ring-blue-500/20' :
                                          'bg-slate-500/15 text-slate-400 ring-slate-500/20'
                                        } capitalize`}>{u.role.replace('_', ' ')}</span>
                                    </td>
                                    <td className="px-5 py-3.5 text-slate-300">
                                        {u.role === Role.TEACHER && teacher ? (
                                            <div className="text-xs">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                  <span className="font-semibold text-primary-400">{teacher.instrument}</span>
                                                  {teacher.supportsOnline && <span className="px-1.5 py-0.5 bg-blue-500/15 ring-1 ring-blue-500/20 text-blue-400 rounded-full text-[10px] font-medium">Online</span>}
                                                </div>
                                                <p className="text-slate-500 mt-1 tabular-nums">Base: <span className="text-slate-400">{teacher.baseRate}</span> SAR / Group: <span className="text-slate-400">{teacher.baseGroupRate || teacher.baseRate}</span> SAR</p>
                                                {teacher.supportsOnline && (teacher.onlineRate || teacher.onlineGroupRate) ? (
                                                    <p className="text-blue-400/70 mt-0.5 tabular-nums">Online: {teacher.onlineRate || teacher.baseRate} SAR / Group: {teacher.onlineGroupRate || teacher.baseGroupRate || teacher.baseRate} SAR</p>
                                                ) : null}
                                                {teacher.ratesBySchool && Object.keys(teacher.ratesBySchool).length > 0 && (
                                                    <div className="mt-2 flex flex-wrap gap-1">
                                                        {Object.entries(teacher.ratesBySchool).map(([sid, rate]) => {
                                                            const sName = schools.find(s => s.id === sid)?.name || sid;
                                                            return <span key={sid} className="bg-slate-800/80 ring-1 ring-white/5 px-1.5 py-0.5 rounded text-[10px] tabular-nums">{sName}: {rate}</span>
                                                        })}
                                                    </div>
                                                )}
                                                <GuaranteeBadge teacher={teacher} />
                                                {(teacher.reportDisplayName || teacher.signatureUrl) && (
                                                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                                                    {teacher.reportDisplayName && (
                                                      <span className="text-[10px] text-violet-400/80 bg-violet-500/10 ring-1 ring-violet-500/20 px-1.5 py-0.5 rounded-full truncate max-w-[160px]" title={teacher.reportDisplayName}>
                                                        ✍ {teacher.reportDisplayName}
                                                      </span>
                                                    )}
                                                    {teacher.signatureUrl && (
                                                      <span className="text-[10px] text-emerald-400/80 bg-emerald-500/10 ring-1 ring-emerald-500/20 px-1.5 py-0.5 rounded-full">
                                                        🖊 Signature set
                                                      </span>
                                                    )}
                                                  </div>
                                                )}
                                            </div>
                                        ) : <span className="text-slate-600 text-xs">—</span>}
                                    </td>
                                    <td className="px-5 py-3.5 text-right align-top">
                                        <button onClick={e => { e.stopPropagation(); handleDelete(u.id, u.name); }} className="text-red-400 hover:text-red-300 text-xs font-medium transition-colors">Delete</button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
      )}

      {/* STUDENTS TAB */}
      {activeTab === 'students' && (
        <div className="space-y-6">
            <div className="relative">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11A6 6 0 105 11a6 6 0 0012 0z" /></svg>
                <input
                    type="text"
                    placeholder="Search students, schools, teachers…"
                    className={`${cfgInputCls} pl-9`}
                    value={studentSearch}
                    onChange={e => setStudentSearch(e.target.value)}
                />
            </div>

            <div className="bg-white/5 backdrop-blur-xl ring-1 ring-white/10 rounded-2xl p-6">
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-5">Add New Student</h2>
                <form onSubmit={handleAddStudentSubmit} className="flex flex-wrap gap-4 items-end">
                    <div className="flex-1 min-w-[200px]">
                        <label className={cfgLabelCls}>Name</label>
                        <input required value={newStudent.name} onChange={e=>setNewStudent({...newStudent, name:e.target.value})} className={cfgInputCls} />
                    </div>
                    <div className="w-48">
                        <label className={cfgLabelCls}>School</label>
                        <select required value={newStudent.schoolId} onChange={e=>setNewStudent({...newStudent, schoolId:e.target.value})} className={cfgSelectCls}>
                            <option value="">Select School</option>
                            {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                    </div>
                    <div className="w-48">
                        <label className={cfgLabelCls}>Teacher</label>
                        <select required value={newStudent.teacherId} onChange={e=>setNewStudent({...newStudent, teacherId:e.target.value})} className={cfgSelectCls}>
                            <option value="">Select Teacher</option>
                            {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </div>
                    <div className="w-40">
                        <label className={cfgLabelCls}>Instrument</label>
                        <input required value={newStudent.instrument} onChange={e=>setNewStudent({...newStudent, instrument:e.target.value})} className={cfgInputCls} />
                    </div>
                    <div className="w-36">
                        <label className={cfgLabelCls}>Year / Grade</label>
                        <input type="number" min={1} max={12} step={1} value={newStudent.yearGrade} onChange={e=>setNewStudent({...newStudent, yearGrade:e.target.value})} placeholder="1–12" className={cfgInputCls} />
                    </div>
                    <div className="w-48">
                        <label className={cfgLabelCls}>Email</label>
                        <input type="email" value={newStudent.email} onChange={e=>setNewStudent({...newStudent, email:e.target.value})} placeholder="student@email.com" className={cfgInputCls} />
                    </div>
                    <div className="w-40">
                        <label className={cfgLabelCls}>Date of Birth</label>
                        <input type="date" value={newStudent.dateOfBirth} onChange={e=>setNewStudent({...newStudent, dateOfBirth:e.target.value})} className={cfgInputCls} />
                    </div>
                    <button type="submit" className="bg-primary-600 hover:bg-primary-500 text-white font-semibold py-2.5 px-6 rounded-xl shadow-lg shadow-primary-900/20 transition-all active:scale-[0.98]">Add Student</button>
                </form>
            </div>

            <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-800/60 flex items-center justify-between">
                  <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Student Directory</span>
                  <span className="text-[10px] font-medium text-slate-600 tabular-nums">{filteredStudents.length} {studentSearch ? 'found' : 'total'}</span>
                </div>
                <table className="w-full text-left text-sm">
                    <thead>
                        <tr className="bg-slate-800/40 text-[10px] text-slate-500 uppercase tracking-wider">
                            <th className="px-5 py-3 font-medium">Student</th><th className="px-5 py-3 font-medium">School</th><th className="px-5 py-3 font-medium">Teacher</th><th className="px-5 py-3 font-medium">Instrument</th><th className="px-5 py-3 font-medium">Year / Grade</th><th className="px-5 py-3 font-medium">Email</th><th className="px-5 py-3 font-medium">Date of Birth</th><th className="px-5 py-3 text-right font-medium">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                        {filteredStudents.map(s => {
                            const isEditing = editingId === s.id;
                            const school = schools.find(sch => sch.id === s.schoolId);
                            const teacher = teachers.find(t => t.id === s.teacherId);

                            return (
                                <tr key={s.id} className="hover:bg-slate-800/30 transition-colors">
                                    {isEditing ? (
                                        <>
                                            <td className="px-5 py-3.5"><input className={cfgInputCls} value={editFormData.name} onChange={e=>handleEditChange('name', e.target.value)} /></td>
                                            <td className="px-5 py-3.5">
                                                <select className={cfgSelectCls} value={editFormData.schoolId} onChange={e=>handleEditChange('schoolId', e.target.value)}>
                                                    {schools.map(sch => <option key={sch.id} value={sch.id}>{sch.name}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <select className={cfgSelectCls} value={editFormData.teacherId} onChange={e=>handleEditChange('teacherId', e.target.value)}>
                                                    {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-5 py-3.5"><input className={cfgInputCls} value={editFormData.instrument} onChange={e=>handleEditChange('instrument', e.target.value)} /></td>
                                            <td className="px-5 py-3.5"><input type="number" min={1} max={12} step={1} className={cfgInputCls} value={editFormData.yearGrade ?? ''} onChange={e=>handleEditChange('yearGrade', e.target.value)} placeholder="1–12" /></td>
                                            <td className="px-5 py-3.5"><input type="email" className={cfgInputCls} value={editFormData.email ?? ''} onChange={e=>handleEditChange('email', e.target.value)} placeholder="student@email.com" /></td>
                                            <td className="px-5 py-3.5"><input type="date" className={cfgInputCls} value={editFormData.dateOfBirth ?? ''} onChange={e=>handleEditChange('dateOfBirth', e.target.value)} /></td>
                                            <td className="px-5 py-3.5 text-right space-y-2">
                                                <button onClick={handleSave} className="bg-primary-600 hover:bg-primary-500 px-3 py-1.5 rounded-lg text-white text-xs font-medium block w-full transition-colors">Save</button>
                                                <button onClick={cancelEditing} className="bg-slate-800 ring-1 ring-white/10 px-3 py-1.5 rounded-lg text-slate-300 text-xs font-medium block w-full hover:bg-slate-700 transition-colors">Cancel</button>
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="px-5 py-3.5">
                                                <div className="font-medium text-white">{s.name}</div>
                                                <div className="text-[10px] text-slate-600 font-mono mt-0.5">{s.id}</div>
                                            </td>
                                            <td className="px-5 py-3.5 text-slate-400 text-xs">{school?.name || <span className="text-slate-600">Unknown</span>}</td>
                                            <td className="px-5 py-3.5 text-slate-400 text-xs">{teacher?.name || <span className="text-slate-600">Unknown</span>}</td>
                                            <td className="px-5 py-3.5">
                                                {s.instrument ? (
                                                  <span className="px-2 py-0.5 bg-primary-500/10 ring-1 ring-primary-500/20 text-primary-400 rounded-full text-[10px] font-medium capitalize">{s.instrument}</span>
                                                ) : <span className="text-slate-600 text-xs">—</span>}
                                            </td>
                                            <td className="px-5 py-3.5 text-slate-400 text-xs">{s.yearGrade ? `Grade ${s.yearGrade}` : <span className="text-slate-600">—</span>}</td>
                                            <td className="px-5 py-3.5 text-slate-400 text-xs">{s.email || <span className="text-slate-600">—</span>}</td>
                                            <td className="px-5 py-3.5 text-slate-400 text-xs">{s.dateOfBirth || <span className="text-slate-600">—</span>}</td>
                                            <td className="px-5 py-3.5 text-right space-x-3">
                                                <button onClick={()=>startEditing(s)} className="text-primary-400 hover:text-primary-300 text-xs font-medium transition-colors">Edit</button>
                                                <button onClick={()=>handleDelete(s.id, s.name)} className="text-red-400 hover:text-red-300 text-xs font-medium transition-colors">Delete</button>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            );
                        })}
                        {filteredStudents.length === 0 && (
                            <tr><td colSpan={8} className="px-5 py-12 text-center text-slate-500 text-sm">
                                {studentSearch ? `No students matching "${studentSearch}"` : 'No students yet. Add one above.'}
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
      )}

      {/* SYSTEM TOOLS — visible on schools tab */}
      {activeTab === 'schools' && (
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-6 mt-6">
          <h3 className="text-sm font-semibold text-slate-300 mb-3">System Tools</h3>
          <div className="flex items-center gap-4">
            <button
              onClick={handleRepairRates}
              disabled={repairRunning}
              className="px-4 py-2 bg-amber-600/20 hover:bg-amber-600/30 ring-1 ring-amber-500/30 text-amber-400 rounded-xl text-sm font-medium transition-all disabled:opacity-50"
            >
              {repairRunning ? 'Scanning...' : 'Repair School Billing Rates'}
            </button>
            {repairResult && (
              <span className="text-xs text-slate-400">
                Scanned {repairResult.total} lessons, fixed {repairResult.fixed}
              </span>
            )}
          </div>
          {repairResult && repairResult.details.length > 0 && (
            <div className="mt-3 bg-slate-800/60 rounded-lg p-3 max-h-40 overflow-y-auto">
              {repairResult.details.map((d, i) => (
                <div key={i} className="text-xs text-slate-400 font-mono">{d}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SCHOOL PERIODS TAB */}
      {activeTab === 'periods' && (
        <SchoolPeriodManager />
      )}

      {/* PARENT ONBOARDING TAB */}
      {activeTab === 'parents' && (
        <ParentOnboarding />
      )}
    </div>
  );
};
