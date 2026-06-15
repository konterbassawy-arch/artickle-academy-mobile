/**
 * ViewLessonModal — Phase 19.2B
 *
 * Shared read-only lesson view. Role-aware: uses AppContext masking so
 * each role naturally sees only what they're permitted to see.
 *
 * Props:
 *   lesson  — Lesson to display
 *   onClose — Close the modal
 *   onEdit  — Optional: if provided, shows an Edit button in the header
 */

import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { Lesson, LessonStatus, DeliveryMode, getDeliveryMode, Role } from '../types';

interface Props {
  lesson: Lesson;
  onClose: () => void;
  onEdit?: () => void;
  editLabel?: string;
}

export const ViewLessonModal: React.FC<Props> = ({ lesson, onClose, onEdit, editLabel = 'Edit' }) => {
  const { currentUser, clearUnreadAdminNote } = useApp();
  const navigate = useNavigate();

  const studentDetailPath = (studentId: string) => {
    const base = currentUser?.role === Role.TEACHER ? '/teacher'
               : currentUser?.role === Role.SCHOOL_ADMIN ? '/school'
               : '/admin';
    return `${base}/students/${studentId}`;
  };

  const teacherDetailPath = currentUser?.role === Role.ADMIN
    ? `/admin/teachers/${lesson.teacherId}`
    : null;

  const isAdmin      = currentUser?.role === Role.ADMIN;
  const isTeacher    = currentUser?.role === Role.TEACHER;
  const isSchoolAdmin = currentUser?.role === Role.SCHOOL_ADMIN;
  // Only admin sees both billing rates
  const showBilling  = isAdmin;
  // Teacher sees their own earning only
  const showEarning  = isTeacher;
  // Admin, teacher, school_admin can see the internal comment
  const showInternal = isAdmin || isTeacher || isSchoolAdmin;

  // Phase 19.2C: Auto-clear unread flag when teacher opens a lesson that has one.
  // clearUnreadAdminNote performs its own safety checks (role + teacherId + flag state).
  useEffect(() => {
    if (isTeacher && lesson.hasUnreadAdminNote) {
      clearUnreadAdminNote(lesson.id);
    }
  }, [lesson.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const isCompleted =
    lesson.status === LessonStatus.PRESENT || lesson.status === LessonStatus.TAUGHT;

  // Status badge styling
  const statusCls =
    lesson.status === LessonStatus.PRESENT || lesson.status === LessonStatus.TAUGHT
      ? 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/20'
      : lesson.status === LessonStatus.CANCELLED
      ? 'bg-red-500/15 text-red-400 ring-red-500/20'
      : 'bg-amber-500/15 text-amber-400 ring-amber-500/20';

  // ── Helpers ──────────────────────────────────────────────────────────────

  const Field = ({
    label,
    value,
    className = '',
  }: {
    label: string;
    value: React.ReactNode;
    className?: string;
  }) => (
    <div className={className}>
      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">{label}</p>
      <p className="text-sm text-slate-300">
        {value || <span className="text-slate-600 italic">—</span>}
      </p>
    </div>
  );

  const TextBlock = ({ label, value }: { label: string; value: string }) => (
    <div>
      <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">{label}</p>
      <p className="text-sm text-slate-300 whitespace-pre-wrap bg-slate-800/40 rounded-lg px-3 py-2.5 leading-relaxed">
        {value}
      </p>
    </div>
  );

  const StarRow = ({ label, value }: { label: string; value: number | undefined | null }) => {
    if (!value) return null;
    return (
      <div>
        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1.5">{label}</p>
        <div className="flex items-center gap-1">
          {[1, 2, 3, 4, 5].map(i => (
            <svg
              key={i}
              className={`w-4 h-4 ${i <= value ? 'text-amber-400' : 'text-slate-700'}`}
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          ))}
          <span className="text-xs text-slate-500 ml-1 tabular-nums">{value}/5</span>
        </div>
      </div>
    );
  };

  const SectionLabel = ({ label }: { label: string }) => (
    <p className="text-[10px] text-slate-600 uppercase tracking-widest font-semibold">{label}</p>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-slate-900 ring-1 ring-white/10 rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Modal header ─────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between px-6 pt-5 pb-4 border-b border-slate-800 shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ring-1 ${statusCls}`}>
                {lesson.status}
              </span>
              {getDeliveryMode(lesson) === DeliveryMode.ONLINE ? (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20 font-medium">
                  Online
                </span>
              ) : (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-400 ring-1 ring-slate-600/20 font-medium">
                  In-Person
                </span>
              )}
            </div>
            <h3 className="text-base font-bold text-white font-mono tracking-tight">{lesson.id}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {new Date(lesson.date).toLocaleDateString('en-US', {
                weekday: 'short',
                year: 'numeric',
                month: 'long',
                day: 'numeric',
              })}
              {' · '}
              {new Date(lesson.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            {onEdit && (
              <button
                onClick={onEdit}
                className="px-3 py-1.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg text-xs font-medium transition-colors"
              >
                {editLabel}
              </button>
            )}
            <button
              onClick={onClose}
              className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-slate-800"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* ── Scrollable body ───────────────────────────────────────────────── */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* Context row */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Student" value={
              <span className="flex flex-wrap gap-x-1.5 gap-y-0.5">
                {lesson.studentNames.map((name, i) => {
                  const sid = lesson.studentIds?.[i];
                  return sid ? (
                    <button
                      key={sid}
                      onClick={() => { onClose(); navigate(studentDetailPath(sid)); }}
                      className="hover:text-primary-400 hover:underline transition-colors text-left"
                    >
                      {name}
                    </button>
                  ) : (
                    <span key={i}>{name}</span>
                  );
                })}
              </span>
            } />
            <Field label="Teacher" value={
              teacherDetailPath ? (
                <button
                  onClick={() => { onClose(); navigate(teacherDetailPath); }}
                  className="hover:text-primary-400 hover:underline transition-colors text-left"
                >
                  {lesson.teacherName}
                </button>
              ) : lesson.teacherName
            } />
          </div>
          {isAdmin && <Field label="School" value={lesson.schoolName} />}

          {/* Core details */}
          <div className={`grid gap-4 ${showBilling || showEarning ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-2 sm:grid-cols-3'}`}>
            <Field label="Type" value={lesson.type} />
            <Field label="Duration" value={`${lesson.durationMinutes} min`} />
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Mode</p>
              {getDeliveryMode(lesson) === DeliveryMode.ONLINE ? (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20 font-medium">Online</span>
              ) : (
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-700/40 text-slate-400 ring-1 ring-slate-600/20 font-medium">In-Person</span>
              )}
            </div>
            {showBilling && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">Billing</p>
                <p className="text-sm text-slate-300 font-mono tabular-nums">
                  Inv {lesson.schoolRate} / Pay {lesson.teacherRate}
                </p>
              </div>
            )}
            {showEarning && (
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-wider font-medium mb-1">My Earning</p>
                <p className="text-sm text-slate-300 font-mono tabular-nums">{lesson.teacherRate} SAR</p>
              </div>
            )}
          </div>

          {/* Performance evaluation */}
          {isCompleted && (lesson.interactivity || lesson.behavior) && (
            <div className="space-y-3 pt-1">
              <SectionLabel label="Evaluation" />
              <div className="grid grid-cols-2 gap-4">
                <StarRow label="Effort" value={lesson.interactivity} />
                <StarRow label="Practice" value={lesson.behavior} />
              </div>
            </div>
          )}

          {/* Academic progress */}
          {isCompleted && (lesson.overallGrade || lesson.examPrepStatus || lesson.repertoire || lesson.practiceAssignment) && (
            <div className="space-y-3 pt-1">
              <SectionLabel label="Academic Progress" />
              {(lesson.overallGrade || lesson.examPrepStatus) && (
                <div className="grid grid-cols-2 gap-4">
                  {lesson.overallGrade && <Field label="Overall Grade / Level" value={lesson.overallGrade} />}
                  {lesson.examPrepStatus && <Field label="Exam Prep Status" value={lesson.examPrepStatus} />}
                </div>
              )}
              {lesson.repertoire && <Field label="Repertoire / Piece Being Studied" value={lesson.repertoire} />}
              {lesson.practiceAssignment && <TextBlock label="Practice Assignment / Homework" value={lesson.practiceAssignment} />}
            </div>
          )}

          {/* Lesson notes */}
          {(lesson.learning || lesson.notes) && (
            <div className="space-y-3 pt-1">
              <SectionLabel label="Lesson Notes" />
              {lesson.learning && <TextBlock label="What Was Learned" value={lesson.learning} />}
              {lesson.notes && <TextBlock label="Teacher Notes" value={lesson.notes} />}
            </div>
          )}

          {/* ── School comments — visually separated ─────────────────────── */}
          {(lesson.schoolAdminComment || (showInternal && lesson.schoolAdminInternalComment)) && (
            <div className="pt-2 border-t border-slate-800 space-y-3">
              <SectionLabel label="School Comments" />

              {lesson.schoolAdminComment && (
                <div className="bg-primary-500/5 ring-1 ring-primary-500/15 rounded-xl px-4 py-3.5">
                  <p className="text-[10px] text-primary-400 uppercase tracking-wider font-semibold mb-1.5">
                    School Teacher Comment
                  </p>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {lesson.schoolAdminComment}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-2 italic">Appears on parent-facing PDF</p>
                </div>
              )}

              {showInternal && lesson.schoolAdminInternalComment && (
                <div className="bg-slate-800/50 ring-1 ring-slate-700/60 rounded-xl px-4 py-3.5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <p className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                      School Admin Internal Comment
                    </p>
                    {isTeacher && lesson.hasUnreadAdminNote && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30 font-bold uppercase leading-none">
                        New
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">
                    {lesson.schoolAdminInternalComment}
                  </p>
                  <p className="text-[10px] text-slate-600 mt-2 italic">Internal only — not visible to parents</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
