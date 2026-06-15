import React, { useState, useMemo, useCallback } from 'react';
import { useApp } from '../../context/AppContext';
import { rewriteLessonNote } from '../../services/aiSummary/rewriteText';
import type { Lesson } from '../../types';

type TextFields = {
  learning: string;
  overallGrade: string;
  repertoire: string;
  practiceAssignment: string;
  notes: string;
};

type FixStatus = 'idle' | 'loading' | 'done' | 'saved' | 'error';

type LessonFix = {
  original: TextFields;
  fixed: TextFields;
  status: FixStatus;
};

const FIELD_LABELS: Record<keyof TextFields, string> = {
  learning: 'What Did the Student Learn?',
  overallGrade: 'Overall Grade / Level',
  repertoire: 'Repertoire / Piece',
  practiceAssignment: 'Practice Assignment',
  notes: 'Private Notes',
};

function extractFields(lesson: Lesson): TextFields {
  return {
    learning: lesson.learning ?? '',
    overallGrade: lesson.overallGrade ?? '',
    repertoire: lesson.repertoire ?? '',
    practiceAssignment: lesson.practiceAssignment ?? '',
    notes: lesson.notes ?? '',
  };
}

function hasContent(fields: TextFields): boolean {
  return Object.values(fields).some(v => v.trim().length > 0);
}

export const LessonGrammarFixer: React.FC = () => {
  const { teachers, students, lessons, updateLesson } = useApp();

  const [teacherFilter, setTeacherFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [fixStates, setFixStates] = useState<Record<string, LessonFix>>({});

  const filteredLessons = useMemo(() => {
    return lessons
      .filter(l => {
        if (teacherFilter && l.teacherId !== teacherFilter) return false;
        if (dateFrom && l.date < dateFrom) return false;
        if (dateTo && l.date > dateTo) return false;
        return hasContent(extractFields(l));
      })
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 100);
  }, [lessons, teacherFilter, dateFrom, dateTo]);

  const handleFix = useCallback(async (lesson: Lesson) => {
    const original = extractFields(lesson);
    const keys = (Object.keys(original) as (keyof TextFields)[]).filter(k => original[k].trim());

    if (keys.length === 0) return;

    setFixStates(prev => ({
      ...prev,
      [lesson.id]: { original, fixed: { ...original }, status: 'loading' },
    }));

    try {
      const results = await Promise.all(
        keys.map(async k => ({ key: k, value: await rewriteLessonNote(original[k]) }))
      );

      const fixed: TextFields = { ...original };
      results.forEach(({ key, value }) => { fixed[key] = value; });

      setFixStates(prev => ({
        ...prev,
        [lesson.id]: { original, fixed, status: 'done' },
      }));
    } catch {
      setFixStates(prev => ({
        ...prev,
        [lesson.id]: { original, fixed: { ...original }, status: 'error' },
      }));
    }
  }, []);

  const handleSave = useCallback(async (lesson: Lesson) => {
    const state = fixStates[lesson.id];
    if (!state || state.status !== 'done') return;

    try {
      await updateLesson(lesson.id, {
        learning: state.fixed.learning || undefined,
        overallGrade: state.fixed.overallGrade || undefined,
        repertoire: state.fixed.repertoire || undefined,
        practiceAssignment: state.fixed.practiceAssignment || undefined,
        notes: state.fixed.notes || undefined,
      });
      setFixStates(prev => ({ ...prev, [lesson.id]: { ...state, status: 'saved' } }));
    } catch {
      // leave as done so user can retry save
    }
  }, [fixStates, updateLesson]);

  const getStudentName = (id: string) => students.find(s => s.id === id)?.name ?? id;
  const getTeacherName = (id: string) => teachers.find(t => t.id === id)?.name ?? id;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white mb-1">Grammar & Spelling Fixer</h1>
        <p className="text-sm text-slate-400">
          Fix grammar and spelling in past lesson notes using AI — same engine as the attendance drawer. Fixed text is marked with <span className="text-violet-400 font-mono">**</span>.
        </p>
      </div>

      {/* Filters */}
      <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-4 mb-5 flex flex-wrap gap-4">
        <div className="flex-1 min-w-40">
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">Teacher</label>
          <select
            value={teacherFilter}
            onChange={e => setTeacherFilter(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500/40"
          >
            <option value="">All Teachers</option>
            {teachers.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500/40"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-slate-200 focus:outline-none focus:ring-1 focus:ring-violet-500/40"
          />
        </div>
      </div>

      <p className="text-xs text-slate-500 mb-4">{filteredLessons.length} lesson{filteredLessons.length !== 1 ? 's' : ''} with text content</p>

      {/* Lesson cards */}
      <div className="space-y-4">
        {filteredLessons.map(lesson => {
          const state = fixStates[lesson.id];
          const original = extractFields(lesson);

          return (
            <div key={lesson.id} className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-5">
              {/* Card header */}
              <div className="flex items-start justify-between mb-4">
                <div>
                  <p className="text-sm font-semibold text-white">{getStudentName(lesson.studentId)}</p>
                  <p className="text-xs text-slate-400">{lesson.date} · {getTeacherName(lesson.teacherId)}</p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  {state?.status === 'done' && (
                    <button
                      onClick={() => handleSave(lesson)}
                      className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 transition-all"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      Save Changes
                    </button>
                  )}

                  {state?.status === 'saved' && (
                    <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                      Saved
                    </span>
                  )}

                  {state?.status !== 'saved' && (
                    <button
                      onClick={() => handleFix(lesson)}
                      disabled={state?.status === 'loading'}
                      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition-all border disabled:opacity-50 disabled:cursor-not-allowed ${
                        state?.status === 'error'
                          ? 'bg-red-500/15 border-red-500/30 text-red-400 hover:bg-red-500/20'
                          : state?.status === 'done'
                          ? 'bg-slate-700/60 border-slate-600/50 text-slate-300 hover:bg-slate-700'
                          : 'bg-violet-500/10 border-violet-500/25 text-violet-400 hover:bg-violet-500/20 hover:text-violet-300'
                      }`}
                    >
                      {state?.status === 'loading' ? (
                        <>
                          <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          Fixing…
                        </>
                      ) : state?.status === 'error' ? (
                        'Failed — Retry'
                      ) : state?.status === 'done' ? (
                        'Re-fix'
                      ) : (
                        <>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                              d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.346.346a1 1 0 01-.707.293H9.372a1 1 0 01-.707-.293l-.346-.346z" />
                          </svg>
                          Fix Grammar
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Fields */}
              <div className="space-y-3">
                {(Object.keys(FIELD_LABELS) as (keyof TextFields)[]).map(key => {
                  const orig = original[key];
                  if (!orig.trim()) return null;

                  const fixed = state?.fixed?.[key];
                  const changed = !!fixed && fixed !== orig;

                  return (
                    <div key={key} className="border-l-2 border-slate-700/60 pl-3">
                      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
                        {FIELD_LABELS[key]}
                      </p>
                      {changed ? (
                        <div className="space-y-1">
                          <p className="text-xs text-slate-600 line-through leading-relaxed">{orig}</p>
                          <p className="text-xs text-emerald-300 leading-relaxed">{fixed}</p>
                        </div>
                      ) : (
                        <p className="text-xs text-slate-300 leading-relaxed">
                          {state?.fixed ? (fixed ?? orig) : orig}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {filteredLessons.length === 0 && (
          <div className="text-center py-16 text-slate-500 text-sm">
            No lessons with text content match the current filters.
          </div>
        )}
      </div>
    </div>
  );
};
