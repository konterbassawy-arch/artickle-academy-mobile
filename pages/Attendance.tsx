
import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { LessonStatus, Role, DeliveryMode, isTeacherOf } from '../types';
import { resolveTeacherRate } from '../services/rateService';
import { AIRewriteButton } from '../components/AIRewriteButton';

const selectCls = 'w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all';
const inputCls  = 'w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600';
const labelCls  = 'block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5';

/** Strip the AI marker the moment a teacher edits an AI-tagged field. */
function stripAITag(prev: string, next: string): string {
  if (prev.startsWith('** ') && next.startsWith('** ')) return next.slice(3);
  return next;
}

interface AttendanceProps {
  onClose?: () => void;
}

export const Attendance: React.FC<AttendanceProps> = ({ onClose }) => {
  const { currentUser, schools, students, teachers, addLesson } = useApp();
  const [showSaved, setShowSaved] = useState(false);

  const isAdmin = currentUser?.role === Role.ADMIN;
  const isTeacher = currentUser?.role === Role.TEACHER;

  // Form State
  // Use local time (not UTC) to avoid timezone offset issues
  const getLocalDateTimeString = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };
  const [date, setDate] = useState(getLocalDateTimeString());
  // Admin-only: which teacher is this attendance for
  const [selectedTeacherId, setSelectedTeacherId] = useState('');
  const [schoolId, setSchoolId] = useState('');
  const [studentId, setStudentId] = useState('');
  const [status, setStatus] = useState(LessonStatus.PRESENT);
  const [type, setType] = useState<'Individual' | 'Group'>('Individual');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>(DeliveryMode.IN_PERSON);
  const [duration, setDuration] = useState(30);

  // Evaluation
  const [interactivity, setInteractivity] = useState(0);
  const [behavior, setBehavior] = useState(0);
  const [ratingError, setRatingError] = useState(false);
  const evalRef = useRef<HTMLDivElement>(null);
  const [learning, setLearning] = useState('');
  const [notes, setNotes] = useState('');
  // Phase 13: Expanded evaluation
  const [overallGrade, setOverallGrade] = useState('');
  const [repertoire, setRepertoire] = useState('');
  const [practiceAssignment, setPracticeAssignment] = useState('');
  const [examPrepStatus, setExamPrepStatus] = useState('');

  if (!isTeacher && !isAdmin) {
      return <div className="text-red-500 text-sm">Only teachers and admins can access this page.</div>;
  }

  // Effective teacher: for teacher role, it's themselves; for admin, it's the one picked from dropdown
  const effectiveTeacherId = isAdmin ? selectedTeacherId : currentUser!.id;
  const effectiveTeacher = teachers.find(t => t.id === effectiveTeacherId);

  // P6: use isTeacherOf — supports multi-teacher with legacy fallback
  const myStudents = effectiveTeacherId
    ? students.filter(s => isTeacherOf(s, effectiveTeacherId))
    : [];

  // Filter students further if a school is selected
  const availableStudents = schoolId
    ? myStudents.filter(s => s.schoolId === schoolId)
    : myStudents;

  const handleSubmit = (e: React.FormEvent) => {
      e.preventDefault();
      if (isAdmin && !selectedTeacherId) {
          alert("Please select a teacher");
          return;
      }
      if (!schoolId || !studentId) {
          alert("Please select school and student");
          return;
      }

      // Ratings required for attended lessons
      const requiresRating = status === LessonStatus.PRESENT || status === LessonStatus.TAUGHT;
      if (requiresRating && (interactivity === 0 || behavior === 0)) {
          setRatingError(true);
          evalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          setTimeout(() => setRatingError(false), 3000);
          return;
      }

      const school = schools.find(s => s.id === schoolId);
      const student = students.find(s => s.id === studentId);
      const teacher = effectiveTeacher;

      // Phase 17.1: Centralized rate resolution.
      // Teacher rate computed client-side via resolveTeacherRate (teacher has own rate data).
      // School rate (schoolRate) computed server-side in addLesson —
      // teachers never see school billing rates, not even in DevTools.
      const durationHours = duration / 60;

      const hourlyTeacherRate = teacher
        ? resolveTeacherRate(teacher, schoolId, type, deliveryMode)
        : 60;

      let teacherRate = hourlyTeacherRate * durationHours;

      // Multiply by student count for Groups as rates are defined per student
      if (type === 'Group') {
        const studentCount = 1; // This form currently supports 1 student selection
        teacherRate = teacherRate * studentCount;
      }

      // Financial Rule: If Cancelled OR Absent (Excused), amounts are 0.
      if (status === LessonStatus.CANCELLED || status === LessonStatus.ABSENT_EXCUSED) {
          teacherRate = 0;
      }

      // Context generates ID now based on school/teacher codes
      // schoolRate is omitted — addLesson computes it server-side from Firestore
      // so teachers never need school billing data in their client state
      addLesson({
          date: date,
          teacherId: effectiveTeacherId,
          teacherName: teacher?.name || currentUser!.name,
          studentIds: [studentId],
          studentNames: [student?.name || 'Unknown'],
          schoolId: schoolId,
          schoolName: school?.name || 'Unknown',
          status,
          durationMinutes: duration,
          type,
          schoolRate: 0,
          teacherRate,
          deliveryMode,
          notes,
          learning,
          interactivity,
          behavior,
          // Phase 13: expanded evaluation (only saved if non-empty)
          ...(overallGrade ? { overallGrade } : {}),
          ...(repertoire ? { repertoire } : {}),
          ...(practiceAssignment ? { practiceAssignment } : {}),
          ...(examPrepStatus ? { examPrepStatus } : {}),
      });

      // Reset all form fields
      setDate(getLocalDateTimeString());
      setSelectedTeacherId('');
      setSchoolId('');
      setStudentId('');
      setStatus(LessonStatus.PRESENT);
      setType('Individual');
      setDeliveryMode(DeliveryMode.IN_PERSON);
      setDuration(30);
      setInteractivity(0);
      setBehavior(0);
      setLearning('');
      setNotes('');
      setOverallGrade('');
      setRepertoire('');
      setPracticeAssignment('');
      setExamPrepStatus('');

      setShowSaved(true);
      setTimeout(() => {
        setShowSaved(false);
      }, 2000);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">

      {/* Lesson Saved — white flash then blue-framed card */}
      {showSaved && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center">
          <style>{`
            @keyframes whiteFlash {
              0%   { opacity: 1; }
              35%  { opacity: 1; }
              100% { opacity: 0; }
            }
            @keyframes savedContentIn {
              0%   { opacity: 0; transform: scale(0.88); }
              100% { opacity: 1; transform: scale(1); }
            }
            @keyframes bluePulse {
              0%, 100% { box-shadow: 0 0 30px 6px rgba(59,130,246,0.6), 0 0 80px 20px rgba(59,130,246,0.2); }
              50%       { box-shadow: 0 0 50px 12px rgba(99,179,237,0.9), 0 0 120px 40px rgba(59,130,246,0.35); }
            }
          `}</style>

          {/* White flash layer */}
          <div style={{ animation: 'whiteFlash 0.55s ease-out forwards', position: 'absolute', inset: 0, background: 'white', zIndex: 1 }} />

          {/* Dark background */}
          <div className="absolute inset-0 bg-black/90" />

          {/* Blue-framed card */}
          <div style={{
            position: 'relative', zIndex: 2,
            animation: 'savedContentIn 0.4s ease-out 0.15s both, bluePulse 1.2s ease-in-out 0.15s infinite',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 32,
            padding: '48px 56px', textAlign: 'center', borderRadius: 24,
            background: 'rgba(15,23,42,0.85)',
            border: '2px solid rgba(59,130,246,0.8)',
            boxShadow: '0 0 30px 6px rgba(59,130,246,0.6), 0 0 80px 20px rgba(59,130,246,0.2)',
          }}>
            {/* Blue checkmark */}
            <div style={{ background: 'rgba(59,130,246,0.15)', borderRadius: '50%', width: 112, height: 112, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="56" height="56" fill="none" stroke="#60a5fa" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            {/* Big bold text */}
            <p style={{ color: 'white', fontWeight: 700, fontSize: 'clamp(2.5rem, 10vw, 4.5rem)', lineHeight: 1.1, margin: 0 }}>
              Lesson Saved
            </p>
            <p style={{ color: '#94a3b8', fontSize: '1.25rem', margin: 0 }}>Form is ready for the next lesson</p>
          </div>
        </div>
      )}
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold text-white tracking-tight">Take Attendance</h1>
        <p className="text-slate-500 text-sm mt-1">Record a lesson and evaluate the student</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">

        {/* ── Section 1: Lesson Details ── */}
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-6">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-5">Lesson Details</h2>

          {isAdmin && (
            <div className="mb-4">
              <label className={labelCls}>Teacher <span className="text-amber-400">*</span></label>
              <select
                value={selectedTeacherId}
                onChange={(e) => {
                  setSelectedTeacherId(e.target.value);
                  setStudentId('');
                  setSchoolId('');
                }}
                className={selectCls}
              >
                <option value="">Select Teacher</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.instrument})</option>)}
              </select>
              <p className="text-xs text-slate-500 mt-1.5">Attendance will be recorded on behalf of this teacher.</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className={labelCls}>Date & Time</label>
              <input
                type="datetime-local"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>School</label>
              <select
                value={schoolId}
                onChange={(e) => { setSchoolId(e.target.value); setStudentId(''); }}
                className={selectCls}
              >
                <option value="">Select School</option>
                {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>

          <div className="mb-4">
            <label className={labelCls}>Student</label>
            <select
              value={studentId}
              onChange={(e) => {
                const sId = e.target.value;
                setStudentId(sId);
                const st = myStudents.find(s => s.id === sId);
                if (st) setSchoolId(st.schoolId);
              }}
              className={selectCls}
            >
              <option value="">Select Student</option>
              {availableStudents.map(s => <option key={s.id} value={s.id}>{s.name} ({s.instrument})</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className={labelCls}>Type</label>
              <select value={type} onChange={(e:any) => setType(e.target.value)} className={selectCls}>
                <option value="Individual">Individual</option>
                <option value="Group">Group</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Delivery Mode</label>
              <select value={deliveryMode} onChange={(e: any) => setDeliveryMode(e.target.value)} className={selectCls}>
                <option value={DeliveryMode.IN_PERSON}>In-Person</option>
                <option value={DeliveryMode.ONLINE}>Online</option>
              </select>
              {deliveryMode === DeliveryMode.ONLINE && effectiveTeacher && !effectiveTeacher.supportsOnline && (
                <p className="text-xs text-amber-400 mt-1.5">
                  {isAdmin ? `${effectiveTeacher.name} is not configured for online lessons.` : 'Your profile is not configured for online lessons. Contact admin to enable.'}
                </p>
              )}
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select value={status} onChange={(e:any) => {
                setStatus(e.target.value);
                setRatingError(false);
              }} className={selectCls}>
                {Object.values(LessonStatus).filter(s => s !== LessonStatus.TAUGHT).map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className={labelCls}>Duration <span className="normal-case font-normal text-slate-600">(minutes)</span></label>
            <input
              type="number"
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
              className={inputCls}
              min="1"
            />
          </div>
        </div>

        {/* ── Section 2: Evaluation ── */}
        <div ref={evalRef} className={`bg-slate-900/60 ring-1 rounded-2xl p-6 transition-all duration-300 ${ratingError ? 'ring-red-500/60 bg-red-950/20' : 'ring-white/5'}`}>
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-5">Evaluation</h2>

          {/* Rating error banner */}
          {ratingError && (
            <div className="flex items-center gap-2.5 mb-4 px-4 py-3 rounded-xl bg-red-500/15 border border-red-500/40 animate-pulse">
              <svg className="w-4 h-4 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <p className="text-sm font-medium text-red-300">
                Please rate both <span className="font-bold">Effort</span> and <span className="font-bold">Practice</span> before saving.
              </p>
            </div>
          )}

          {/* Star ratings */}
          <div className="grid grid-cols-2 gap-6 mb-5">
            <div>
              <label className={`${labelCls} ${ratingError && interactivity === 0 ? 'text-red-400' : ''}`}>
                Effort {ratingError && interactivity === 0 && <span className="text-red-400 normal-case font-bold">— required</span>}
              </label>
              <div className={`flex gap-1.5 mt-1 rounded-xl px-2 py-1 -mx-2 transition-all duration-300 ${ratingError && interactivity === 0 ? 'bg-red-500/10' : ''}`}>
                {[1,2,3,4,5].map(star => (
                  <button
                    type="button"
                    key={star}
                    onClick={() => { setInteractivity(star); if (ratingError && behavior > 0) setRatingError(false); }}
                    className={`text-2xl transition-colors ${
                      star <= interactivity
                        ? 'text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.3)]'
                        : ratingError && interactivity === 0
                        ? 'text-red-500/70 hover:text-red-400 animate-pulse'
                        : 'text-slate-700 hover:text-slate-500'
                    }`}
                  >★</button>
                ))}
                <span className={`ml-2 text-xs self-center tabular-nums ${ratingError && interactivity === 0 ? 'text-red-400' : 'text-slate-500'}`}>
                  {interactivity}/5
                </span>
              </div>
            </div>
            <div>
              <label className={`${labelCls} ${ratingError && behavior === 0 ? 'text-red-400' : ''}`}>
                Practice {ratingError && behavior === 0 && <span className="text-red-400 normal-case font-bold">— required</span>}
              </label>
              <div className={`flex gap-1.5 mt-1 rounded-xl px-2 py-1 -mx-2 transition-all duration-300 ${ratingError && behavior === 0 ? 'bg-red-500/10' : ''}`}>
                {[1,2,3,4,5].map(star => (
                  <button
                    type="button"
                    key={star}
                    onClick={() => { setBehavior(star); if (ratingError && interactivity > 0) setRatingError(false); }}
                    className={`text-2xl transition-colors ${
                      star <= behavior
                        ? 'text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.3)]'
                        : ratingError && behavior === 0
                        ? 'text-red-500/70 hover:text-red-400 animate-pulse'
                        : 'text-slate-700 hover:text-slate-500'
                    }`}
                  >★</button>
                ))}
                <span className={`ml-2 text-xs self-center tabular-nums ${ratingError && behavior === 0 ? 'text-red-400' : 'text-slate-500'}`}>
                  {behavior}/5
                </span>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider">What did the student learn?</label>
                <AIRewriteButton value={learning} onRewrite={setLearning} />
              </div>
              <textarea
                value={learning}
                onChange={(e) => setLearning(stripAITag(learning, e.target.value))}
                className={`${inputCls} h-20 resize-none`}
                placeholder="Scales, new piece, etc..."
              />
            </div>

            {/* Phase 13: Expanded evaluation fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider">Overall Grade / Level</label>
                  <AIRewriteButton value={overallGrade} onRewrite={setOverallGrade} />
                </div>
                <input
                  type="text"
                  value={overallGrade}
                  onChange={(e) => setOverallGrade(stripAITag(overallGrade, e.target.value))}
                  className={inputCls}
                  placeholder="e.g. Grade 3, Beginner..."
                />
              </div>
              <div>
                <label className={labelCls}>Exam Prep Status</label>
                <select value={examPrepStatus} onChange={(e) => setExamPrepStatus(e.target.value)} className={selectCls}>
                  <option value="">N/A</option>
                  <option value="Not started">Not started</option>
                  <option value="Preparing">Preparing</option>
                  <option value="Ready">Ready</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider">Repertoire / Piece Being Studied</label>
                <AIRewriteButton value={repertoire} onRewrite={setRepertoire} />
              </div>
              <input
                type="text"
                value={repertoire}
                onChange={(e) => setRepertoire(stripAITag(repertoire, e.target.value))}
                className={inputCls}
                placeholder="e.g. Twinkle Twinkle, Sonata No. 1..."
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-[10px] font-medium text-slate-500 uppercase tracking-wider">Practice Assignment / Homework</label>
                <AIRewriteButton value={practiceAssignment} onRewrite={setPracticeAssignment} />
              </div>
              <textarea
                value={practiceAssignment}
                onChange={(e) => setPracticeAssignment(stripAITag(practiceAssignment, e.target.value))}
                className={`${inputCls} h-16 resize-none`}
                placeholder="Practice scales in G major, review bars 12-24..."
              />
            </div>
          </div>
        </div>

        {/* ── Section 3: Notes ── */}
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Private Notes</h2>
            <AIRewriteButton value={notes} onRewrite={setNotes} />
          </div>
          <textarea
            value={notes}
            onChange={(e) => setNotes(stripAITag(notes, e.target.value))}
            className={`${inputCls} h-20 resize-none`}
            placeholder="Internal notes (not visible to parents)..."
          />
        </div>

        {/* ── Submit ── */}
        <button
          type="submit"
          className="w-full bg-primary-600 hover:bg-primary-500 text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-primary-900/30 transition-all active:scale-[0.98] text-sm tracking-wide"
        >
          Save Attendance
        </button>
      </form>
    </div>
  );
};
