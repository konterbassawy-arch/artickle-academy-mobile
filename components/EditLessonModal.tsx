
import React, { useState } from 'react';
import { Lesson, LessonStatus, Role, DeliveryMode, getDeliveryMode } from '../types';
import { useApp } from '../context/AppContext';
import { AIRewriteButton } from './AIRewriteButton';
import { resolveSchoolRate, resolveTeacherRate } from '../services/rateService';

/** Strip the AI marker the moment a teacher edits an AI-tagged field. */
function stripAITag(prev: string, next: string): string {
  if (prev.startsWith('** ') && next.startsWith('** ')) return next.slice(3);
  return next;
}

interface EditLessonModalProps {
  lesson: Lesson;
  onClose: () => void;
  onSave: (id: string, data: Partial<Lesson>) => void;
}

export const EditLessonModal: React.FC<EditLessonModalProps> = ({ lesson, onClose, onSave }) => {
  const { schools, teachers, currentUser } = useApp();
  const isAdmin   = currentUser?.role === Role.ADMIN;
  const isTeacher = currentUser?.role === Role.TEACHER;
  // canEditLesson: admin and teacher can edit the core lesson fields
  const canEditLesson = isAdmin || isTeacher;
  // canEditSchoolComments: only admin can edit school admin comment fields
  const canEditSchoolComments = isAdmin;

  const [formData, setFormData] = useState({
    date:                       lesson.date,
    status:                     lesson.status,
    type:                       lesson.type || 'Individual',
    deliveryMode:               getDeliveryMode(lesson),
    durationMinutes:            lesson.durationMinutes || 30,
    interactivity:              lesson.interactivity ?? 5,
    behavior:                   lesson.behavior ?? 5,
    learning:                   lesson.learning || '',
    notes:                      lesson.notes || '',
    overallGrade:               lesson.overallGrade || '',
    examPrepStatus:             lesson.examPrepStatus || '',
    repertoire:                 lesson.repertoire || '',
    practiceAssignment:         lesson.practiceAssignment || '',
    schoolAdminComment:         lesson.schoolAdminComment || '',
    schoolAdminInternalComment: lesson.schoolAdminInternalComment || '',
  });

  const set = (key: string, val: any) => setFormData(p => ({ ...p, [key]: val }));

  // datetime-local <-> storage helpers
  // Dates are stored as local datetime strings (no UTC conversion) to stay
  // consistent with how Attendance.tsx creates lessons.
  const isoToLocalInput = (iso: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const localInputToStorable = (local: string) => {
    if (!local) return '';
    const d = new Date(local);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const updates: any = { ...formData };

    // Financial Logic: recalculate rates when status/type/duration change
    if (
      formData.status === LessonStatus.ABSENT_EXCUSED ||
      formData.status === LessonStatus.CANCELLED
    ) {
      updates.teacherRate = 0;
      updates.schoolRate  = 0;
    } else {
      const teacher      = teachers.find(t => t.id === lesson.teacherId);
      const school       = schools.find(s => s.id === lesson.schoolId);
      const durationHours = (formData.durationMinutes || 30) / 60;
      const studentCount = lesson.studentIds.length > 0
        ? lesson.studentIds.length
        : (lesson.studentNames.length || 1);
      const multiplier = formData.type === 'Group' ? studentCount : 1;

      if (teacher) {
        const hourlyT = resolveTeacherRate(teacher, lesson.schoolId, formData.type as any, formData.deliveryMode);
        updates.teacherRate = parseFloat((hourlyT * durationHours * multiplier).toFixed(2));
      }

      if (isAdmin && school?.defaultRate !== undefined) {
        const instrument = teacher?.instrument || '';
        const hourlyS = resolveSchoolRate(school, lesson.teacherId, instrument, formData.type as any, formData.deliveryMode);
        updates.schoolRate = parseFloat((hourlyS * durationHours * multiplier).toFixed(2));
      }
    }

    onSave(lesson.id, updates);
    onClose();
  };

  // Shared style helpers
  const inputCls  = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/50';
  const selectCls = 'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-primary-500/50';
  const readCls   = 'w-full text-sm text-slate-300 bg-slate-800/60 border border-slate-700/40 rounded-lg px-3 py-2 min-h-[2.4rem]';
  const labelCls  = 'block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5';

  // Star rating widget (interactive or read-only)
  const StarRating = ({
    value,
    onChange,
    readonly = false,
  }: {
    value: number;
    onChange?: (v: number) => void;
    readonly?: boolean;
  }) => (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(i => (
        <button
          key={i}
          type="button"
          disabled={readonly}
          onClick={() => onChange?.(i)}
          className={`text-xl transition-colors ${readonly ? 'cursor-default' : 'cursor-pointer hover:scale-110'} ${i <= value ? 'text-amber-400' : 'text-slate-700'}`}
        >
          ★
        </button>
      ))}
      <span className="text-xs text-slate-500 self-center ml-1">{value}/5</span>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 flex items-start justify-center z-50 p-4 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 ring-1 ring-white/10 rounded-2xl w-full max-w-2xl my-8 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div>
            <h3 className="text-lg font-bold text-white">Lesson {lesson.id}</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {lesson.studentNames.join(', ')} · {lesson.teacherName} · {lesson.schoolName}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors text-2xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">

          {/* ── LESSON DETAILS ── */}
          <div>
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-4">Lesson Details</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* Date & Time */}
              <div>
                <label className={labelCls}>Date & Time</label>
                {canEditLesson ? (
                  <input
                    type="datetime-local"
                    value={isoToLocalInput(formData.date)}
                    onChange={e => set('date', localInputToStorable(e.target.value))}
                    className={inputCls}
                  />
                ) : (
                  <p className={readCls}>{new Date(lesson.date).toLocaleString()}</p>
                )}
              </div>

              {/* Status */}
              <div>
                <label className={labelCls}>Status</label>
                {canEditLesson ? (
                  <select value={formData.status} onChange={e => set('status', e.target.value as LessonStatus)} className={selectCls}>
                    {Object.values(LessonStatus).filter(s => s !== LessonStatus.TAUGHT).map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                ) : (
                  <p className={readCls}>{lesson.status}</p>
                )}
              </div>

              {/* Type */}
              <div>
                <label className={labelCls}>Type</label>
                {canEditLesson ? (
                  <select value={formData.type} onChange={e => set('type', e.target.value)} className={selectCls}>
                    <option value="Individual">Individual</option>
                    <option value="Group">Group</option>
                  </select>
                ) : (
                  <p className={readCls}>{lesson.type}</p>
                )}
              </div>

              {/* Delivery Mode */}
              <div>
                <label className={labelCls}>Delivery Mode</label>
                {canEditLesson ? (
                  <select value={formData.deliveryMode} onChange={e => set('deliveryMode', e.target.value as DeliveryMode)} className={selectCls}>
                    <option value={DeliveryMode.IN_PERSON}>In-Person</option>
                    <option value={DeliveryMode.ONLINE}>Online</option>
                  </select>
                ) : (
                  <p className={readCls}>{getDeliveryMode(lesson) === DeliveryMode.ONLINE ? 'Online' : 'In-Person'}</p>
                )}
              </div>

              {/* Duration */}
              <div>
                <label className={labelCls}>Duration (minutes)</label>
                {canEditLesson ? (
                  <input
                    type="number" min="5" max="480" step="5"
                    value={formData.durationMinutes}
                    onChange={e => set('durationMinutes', parseInt(e.target.value))}
                    className={inputCls}
                  />
                ) : (
                  <p className={readCls}>{lesson.durationMinutes}</p>
                )}
              </div>

            </div>
          </div>

          {/* ── EVALUATION ── */}
          <div className="border-t border-slate-800 pt-5">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-4">Evaluation</p>
            <div className="space-y-4">

              {/* Effort */}
              <div>
                <label className={labelCls}>Effort</label>
                <StarRating
                  value={formData.interactivity}
                  onChange={canEditLesson ? v => set('interactivity', v) : undefined}
                  readonly={!canEditLesson}
                />
              </div>

              {/* Practice */}
              <div>
                <label className={labelCls}>Practice</label>
                <StarRating
                  value={formData.behavior}
                  onChange={canEditLesson ? v => set('behavior', v) : undefined}
                  readonly={!canEditLesson}
                />
              </div>

              {/* What did the student learn */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={labelCls.replace('mb-1.5', '')}>What did the student learn?</label>
                  {canEditLesson && (
                    <AIRewriteButton value={formData.learning} onRewrite={v => set('learning', v)} />
                  )}
                </div>
                {canEditLesson ? (
                  <textarea
                    value={formData.learning}
                    onChange={e => set('learning', stripAITag(formData.learning, e.target.value))}
                    placeholder="Scales, new piece, etc..."
                    className={`${inputCls} h-20`}
                  />
                ) : (
                  <p className={`${readCls} min-h-[5rem] whitespace-pre-wrap`}>{lesson.learning || <span className="text-slate-600 italic">—</span>}</p>
                )}
              </div>

              {/* Overall Grade / Level + Exam Prep Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className={labelCls.replace('mb-1.5', '')}>Overall Grade / Level</label>
                    {canEditLesson && <AIRewriteButton value={formData.overallGrade} onRewrite={v => set('overallGrade', v)} />}
                  </div>
                  {canEditLesson ? (
                    <input
                      type="text"
                      value={formData.overallGrade}
                      onChange={e => set('overallGrade', stripAITag(formData.overallGrade, e.target.value))}
                      placeholder="e.g. Grade 3, Beginner..."
                      className={inputCls}
                    />
                  ) : (
                    <p className={readCls}>{lesson.overallGrade || <span className="text-slate-600 italic">—</span>}</p>
                  )}
                </div>
                <div>
                  <label className={labelCls}>Exam Prep Status</label>
                  {canEditLesson ? (
                    <select value={formData.examPrepStatus} onChange={e => set('examPrepStatus', e.target.value)} className={selectCls}>
                      <option value="">N/A</option>
                      <option value="Not started">Not started</option>
                      <option value="Preparing">Preparing</option>
                      <option value="Ready">Ready</option>
                      <option value="Completed">Completed</option>
                    </select>
                  ) : (
                    <p className={readCls}>{lesson.examPrepStatus || 'N/A'}</p>
                  )}
                </div>
              </div>

              {/* Repertoire */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={labelCls.replace('mb-1.5', '')}>Repertoire / Piece Being Studied</label>
                  {canEditLesson && <AIRewriteButton value={formData.repertoire} onRewrite={v => set('repertoire', v)} />}
                </div>
                {canEditLesson ? (
                  <input
                    type="text"
                    value={formData.repertoire}
                    onChange={e => set('repertoire', stripAITag(formData.repertoire, e.target.value))}
                    placeholder="e.g. Twinkle Twinkle, Sonata No. 1..."
                    className={inputCls}
                  />
                ) : (
                  <p className={readCls}>{lesson.repertoire || <span className="text-slate-600 italic">—</span>}</p>
                )}
              </div>

              {/* Practice Assignment */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={labelCls.replace('mb-1.5', '')}>Practice Assignment / Homework</label>
                  {canEditLesson && <AIRewriteButton value={formData.practiceAssignment} onRewrite={v => set('practiceAssignment', v)} />}
                </div>
                {canEditLesson ? (
                  <textarea
                    value={formData.practiceAssignment}
                    onChange={e => set('practiceAssignment', stripAITag(formData.practiceAssignment, e.target.value))}
                    placeholder="Practice scales in G major, review bars 12–24..."
                    className={`${inputCls} h-20`}
                  />
                ) : (
                  <p className={`${readCls} min-h-[5rem] whitespace-pre-wrap`}>{lesson.practiceAssignment || <span className="text-slate-600 italic">—</span>}</p>
                )}
              </div>

              {/* Notes (teacher private) */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className={labelCls.replace('mb-1.5', '')}>Teacher Notes</label>
                  {canEditLesson && <AIRewriteButton value={formData.notes} onRewrite={v => set('notes', v)} />}
                </div>
                {canEditLesson ? (
                  <textarea
                    value={formData.notes}
                    onChange={e => set('notes', stripAITag(formData.notes, e.target.value))}
                    placeholder="Private teacher notes..."
                    className={`${inputCls} h-20`}
                  />
                ) : (
                  <p className={`${readCls} min-h-[5rem] whitespace-pre-wrap`}>{lesson.notes || <span className="text-slate-600 italic">—</span>}</p>
                )}
              </div>

            </div>
          </div>

          {/* ── SCHOOL ADMIN COMMENTS ── */}
          <div className="border-t border-slate-800 pt-5">
            <p className="text-[10px] font-semibold text-primary-400 uppercase tracking-wider mb-4">School Admin Comments</p>
            <div className="space-y-4">

              {/* School Teacher Comment */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={labelCls.replace('mb-1.5', '')}>School Teacher Comment</label>
                  {canEditSchoolComments && <AIRewriteButton value={formData.schoolAdminComment} onRewrite={v => set('schoolAdminComment', v)} />}
                </div>
                <p className="text-[10px] text-slate-600 mb-1.5">Appears on the lesson PDF sent to parents.</p>
                {canEditSchoolComments ? (
                  <textarea
                    value={formData.schoolAdminComment}
                    onChange={e => set('schoolAdminComment', stripAITag(formData.schoolAdminComment, e.target.value))}
                    placeholder="School teacher comment..."
                    className={`${inputCls} h-20`}
                  />
                ) : (
                  <p className={`${readCls} min-h-[5rem] whitespace-pre-wrap`}>
                    {lesson.schoolAdminComment || <span className="text-slate-600 italic">No comment</span>}
                  </p>
                )}
              </div>

              {/* School Admin Internal Comment */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className={labelCls.replace('mb-1.5', '')}>School Admin Internal Comment</label>
                  {canEditSchoolComments && <AIRewriteButton value={formData.schoolAdminInternalComment} onRewrite={v => set('schoolAdminInternalComment', v)} />}
                </div>
                <p className="text-[10px] text-slate-600 mb-1.5">Internal only — not visible on PDF or to parents.</p>
                {canEditSchoolComments ? (
                  <textarea
                    value={formData.schoolAdminInternalComment}
                    onChange={e => set('schoolAdminInternalComment', stripAITag(formData.schoolAdminInternalComment, e.target.value))}
                    placeholder="Internal comment..."
                    className={`${inputCls} h-20`}
                  />
                ) : (
                  <p className={`${readCls} min-h-[5rem] whitespace-pre-wrap`}>
                    {lesson.schoolAdminInternalComment || <span className="text-slate-600 italic">No comment</span>}
                  </p>
                )}
              </div>

            </div>
          </div>

          {/* ── FOOTER ── */}
          <div className="flex justify-end gap-3 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-slate-400 hover:text-white transition-colors text-sm"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-primary-600 hover:bg-primary-500 text-white rounded-xl font-medium transition-colors text-sm"
            >
              Save Changes
            </button>
          </div>

        </form>
      </div>
    </div>
  );
};
