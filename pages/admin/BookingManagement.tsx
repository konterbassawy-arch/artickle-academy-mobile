/**
 * BookingManagement — Phase 14
 *
 * Admin page for managing all booking requests:
 * - View all bookings (pending, approved, rejected, converted, cancelled)
 * - Approve / reject pending bookings
 * - Assign teacher + school to unassigned bookings
 * - Convert approved bookings into real lessons (reuses addLesson)
 *
 * Admin sees ALL fields including adminNotes.
 */

import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { BookingStatus, BookingType, Role, DeliveryMode } from '../../types';
import { resolveTeacherRate } from '../../services/rateService';
import { matchesSearch } from '../../services/searchUtils';

const inputCls = 'w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600';
const selectCls = 'w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all';
const labelCls = 'block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5';

const STATUS_BADGE: Record<string, string> = {
  [BookingStatus.PENDING]: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20',
  [BookingStatus.APPROVED]: 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20',
  [BookingStatus.REJECTED]: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/20',
  [BookingStatus.CONVERTED]: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20',
  [BookingStatus.CANCELLED]: 'bg-slate-500/15 text-slate-400 ring-1 ring-slate-500/20',
};

const statusBadgeCls = (status: string) =>
  `text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_BADGE[status] || 'bg-slate-500/15 text-slate-400 ring-1 ring-slate-500/20'}`;

export const BookingManagement: React.FC = () => {
  const {
    currentUser,
    bookings,
    students,
    teachers,
    schools,
    updateBooking,
    convertBookingToLesson,
    addBooking,
  } = useApp();

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');

  // New booking form state
  const [showNewForm, setShowNewForm] = useState(false);
  const [newStudentId, setNewStudentId] = useState('');
  const [newSchoolId, setNewSchoolId] = useState('');
  const [newTeacherId, setNewTeacherId] = useState('');
  const [newType, setNewType] = useState<'trial' | 'regular'>('trial');
  const [newLessonType, setNewLessonType] = useState<'Individual' | 'Group'>('Individual');
  const [newDuration, setNewDuration] = useState(30);
  const [newPreferredDate, setNewPreferredDate] = useState('');
  const [newNotes, setNewNotes] = useState('');

  // Edit / action modal state
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [assignTeacherId, setAssignTeacherId] = useState('');
  const [assignSchoolId, setAssignSchoolId] = useState('');

  const selectedBooking = bookings.find(b => b.id === selectedBookingId);

  const filteredBookings = useMemo(() => {
    let result = [...bookings];
    if (statusFilter !== 'all') {
      result = result.filter(b => b.status === statusFilter);
    }
    if (search) {
      result = result.filter(b =>
        matchesSearch(search, [b.studentName, b.teacherName, b.schoolName, b.instrument, b.id])
      );
    }
    return result;
  }, [bookings, statusFilter, search]);

  const pendingCount = bookings.filter(b => b.status === BookingStatus.PENDING).length;

  if (currentUser?.role !== Role.ADMIN) {
    return <div className="text-red-500">Admin access required.</div>;
  }

  const handleCreateBooking = async () => {
    const student = students.find(s => s.id === newStudentId);
    const school = newSchoolId ? schools.find(s => s.id === newSchoolId) : undefined;
    const teacher = newTeacherId ? teachers.find(t => t.id === newTeacherId) : undefined;

    if (!student) {
      alert('Please select a student.');
      return;
    }

    const result = await addBooking({
      requestedBy: currentUser.id,
      requestedByName: currentUser.name,
      requestedAt: Date.now(),
      studentId: student.id,
      studentName: student.name,
      schoolId: school?.id,
      schoolName: school?.name,
      teacherId: teacher?.id,
      teacherName: teacher?.name,
      instrument: student.instrument || '',
      type: newType as BookingType,
      lessonType: newLessonType,
      durationMinutes: newDuration,
      preferredDate: newPreferredDate || undefined,
      notes: newNotes || undefined,
      status: BookingStatus.PENDING,
    });

    if (result.success) {
      alert('Booking created!');
      setShowNewForm(false);
      setNewStudentId('');
      setNewSchoolId('');
      setNewTeacherId('');
      setNewNotes('');
      setNewPreferredDate('');
    } else {
      alert(result.message || 'Failed to create booking');
    }
  };

  const handleApprove = async () => {
    if (!selectedBookingId) return;
    const updates: any = {
      status: BookingStatus.APPROVED,
      reviewedBy: currentUser.id,
      reviewedAt: Date.now(),
    };
    if (adminNotes) updates.adminNotes = adminNotes;
    if (assignTeacherId) {
      const t = teachers.find(t => t.id === assignTeacherId);
      updates.teacherId = assignTeacherId;
      updates.teacherName = t?.name || '';
    }
    if (assignSchoolId) {
      const s = schools.find(s => s.id === assignSchoolId);
      updates.schoolId = assignSchoolId;
      updates.schoolName = s?.name || '';
    }
    await updateBooking(selectedBookingId, updates);
    setSelectedBookingId(null);
    setAdminNotes('');
  };

  const handleReject = async () => {
    if (!selectedBookingId) return;
    await updateBooking(selectedBookingId, {
      status: BookingStatus.REJECTED,
      reviewedBy: currentUser.id,
      reviewedAt: Date.now(),
      ...(adminNotes ? { adminNotes } : {}),
    });
    setSelectedBookingId(null);
    setAdminNotes('');
  };

  const handleConvert = async () => {
    if (!selectedBookingId) return;
    const booking = bookings.find(b => b.id === selectedBookingId);
    if (!booking) return;
    if (!booking.teacherId || !booking.schoolId) {
      alert('Assign a teacher and school before converting.');
      return;
    }

    // Phase 17.1: Centralized rate resolution
    const teacher = teachers.find(t => t.id === booking.teacherId);
    const durationHours = (booking.durationMinutes || 30) / 60;
    const bookingDeliveryMode = booking.deliveryMode || DeliveryMode.IN_PERSON;
    const hourlyTeacherRate = teacher
      ? resolveTeacherRate(teacher, booking.schoolId || '', booking.lessonType, bookingDeliveryMode)
      : 60;
    const teacherRate = hourlyTeacherRate * durationHours;

    const result = await convertBookingToLesson(selectedBookingId, {
      teacherRate,
    });

    if (result.success) {
      alert('Booking converted to lesson!');
      setSelectedBookingId(null);
    } else {
      alert(result.message || 'Conversion failed');
    }
  };

  const openBooking = (bookingId: string) => {
    const b = bookings.find(x => x.id === bookingId);
    setSelectedBookingId(bookingId);
    setAdminNotes(b?.adminNotes || '');
    setAssignTeacherId(b?.teacherId || '');
    setAssignSchoolId(b?.schoolId || '');
  };

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex justify-between items-start gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Booking Management</h1>
          <p className="text-slate-500 text-sm mt-1">
            {bookings.length} booking{bookings.length !== 1 ? 's' : ''}
            {pendingCount > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 text-amber-400">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {pendingCount} pending
              </span>
            )}
          </p>
        </div>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shrink-0 ${
            showNewForm
              ? 'bg-slate-800 ring-1 ring-white/10 text-slate-300 hover:bg-slate-700'
              : 'bg-primary-600 hover:bg-primary-500 text-white shadow-lg shadow-primary-900/20 active:scale-[0.98]'
          }`}
        >
          {showNewForm ? 'Cancel' : '+ New Booking'}
        </button>
      </div>

      {/* New booking form */}
      {showNewForm && (
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-6 space-y-5">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Create Booking Request</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Student</label>
              <select value={newStudentId} onChange={e => setNewStudentId(e.target.value)} className={selectCls}>
                <option value="">Select Student</option>
                {students.map(s => <option key={s.id} value={s.id}>{s.name} ({s.instrument})</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>School</label>
              <select value={newSchoolId} onChange={e => setNewSchoolId(e.target.value)} className={selectCls}>
                <option value="">Select School</option>
                {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Teacher (optional)</label>
              <select value={newTeacherId} onChange={e => setNewTeacherId(e.target.value)} className={selectCls}>
                <option value="">Unassigned</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.instrument})</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Booking Type</label>
              <select value={newType} onChange={e => setNewType(e.target.value as any)} className={selectCls}>
                <option value="trial">Trial</option>
                <option value="regular">Regular</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Lesson Type</label>
              <select value={newLessonType} onChange={e => setNewLessonType(e.target.value as any)} className={selectCls}>
                <option value="Individual">Individual</option>
                <option value="Group">Group</option>
              </select>
            </div>
            <div>
              <label className={labelCls}>Duration (min)</label>
              <input type="number" value={newDuration} onChange={e => setNewDuration(Number(e.target.value))} min="15" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Preferred Date/Time</label>
              <input type="datetime-local" value={newPreferredDate} onChange={e => setNewPreferredDate(e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Notes</label>
              <input type="text" value={newNotes} onChange={e => setNewNotes(e.target.value)} placeholder="Any preferences..." className={inputCls} />
            </div>
          </div>
          <button onClick={handleCreateBooking}
            className="bg-primary-600 hover:bg-primary-500 text-white px-6 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-primary-900/20 transition-all active:scale-[0.98]">
            Create Booking
          </button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col md:flex-row gap-3">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search by student, teacher, school, instrument..."
          className={`flex-1 ${inputCls}`} />
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-slate-800/80 border border-slate-700/80 rounded-xl px-4 py-2.5 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all">
          <option value="all">All Statuses</option>
          <option value={BookingStatus.PENDING}>Pending</option>
          <option value={BookingStatus.APPROVED}>Approved</option>
          <option value={BookingStatus.REJECTED}>Rejected</option>
          <option value={BookingStatus.CONVERTED}>Converted</option>
          <option value={BookingStatus.CANCELLED}>Cancelled</option>
        </select>
      </div>

      {/* Count */}
      <span className="text-xs text-slate-500 tabular-nums">
        {filteredBookings.length} booking{filteredBookings.length !== 1 ? 's' : ''}
      </span>

      {/* Bookings list */}
      {filteredBookings.length === 0 ? (
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-10 text-center">
          <svg className="w-10 h-10 text-slate-600 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p className="text-slate-500 text-sm">No bookings match your filters.</p>
        </div>
      ) : (
        <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl overflow-hidden divide-y divide-slate-800/60">
          {filteredBookings.map(booking => (
            <div key={booking.id}
              onClick={() => openBooking(booking.id)}
              className="p-4 cursor-pointer hover:bg-slate-800/30 transition-colors">
              <div className="flex justify-between items-start mb-2 gap-3">
                <div>
                  <p className="text-white font-medium text-sm">{booking.studentName}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {booking.instrument}
                    <span className="mx-1 text-slate-700">·</span>
                    {booking.type === 'trial' ? 'Trial' : 'Regular'}
                    <span className="mx-1 text-slate-700">·</span>
                    {booking.lessonType}
                    <span className="mx-1 text-slate-700">·</span>
                    <span className="tabular-nums">{booking.durationMinutes}min</span>
                  </p>
                </div>
                <span className={statusBadgeCls(booking.status)}>{booking.status}</span>
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                {booking.teacherName && <span>Teacher: <span className="text-slate-300">{booking.teacherName}</span></span>}
                {booking.schoolName && <span>School: <span className="text-slate-300">{booking.schoolName}</span></span>}
                {booking.preferredDate && (
                  <span>Requested: <span className="text-slate-300">
                    {new Date(booking.preferredDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span></span>
                )}
                <span>Created: <span className="text-slate-300">
                  {new Date(booking.requestedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </span></span>
              </div>
              {booking.notes && <p className="text-xs text-slate-600 mt-1.5 italic line-clamp-1">"{booking.notes}"</p>}
              {booking.adminNotes && <p className="text-xs text-amber-500/70 mt-1 line-clamp-1">Admin: {booking.adminNotes}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Detail / Action modal */}
      {selectedBooking && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 ring-1 ring-white/10 rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl shadow-black/40">
            <div className="flex justify-between items-start mb-5">
              <h3 className="text-xl font-bold text-white">Booking Details</h3>
              <button onClick={() => setSelectedBookingId(null)} className="text-slate-500 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">Student</span>
                <span className="text-white font-medium">{selectedBooking.studentName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Instrument</span>
                <span className="text-white">{selectedBooking.instrument}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Type</span>
                <span className="text-white capitalize">{selectedBooking.type} / {selectedBooking.lessonType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Duration</span>
                <span className="text-white tabular-nums">{selectedBooking.durationMinutes}min</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Status</span>
                <span className={statusBadgeCls(selectedBooking.status)}>{selectedBooking.status}</span>
              </div>
              {selectedBooking.preferredDate && (
                <div className="flex justify-between">
                  <span className="text-slate-500">Preferred Date</span>
                  <span className="text-white">{new Date(selectedBooking.preferredDate).toLocaleString()}</span>
                </div>
              )}
              {selectedBooking.notes && (
                <div>
                  <span className="text-slate-500 block mb-1.5">Requester Notes</span>
                  <p className="text-slate-300 bg-slate-800/60 ring-1 ring-white/5 rounded-xl p-3 text-xs">{selectedBooking.notes}</p>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-slate-500">Requested By</span>
                <span className="text-white">{selectedBooking.requestedByName}</span>
              </div>

              {/* Assignment fields — editable for pending/approved */}
              {(selectedBooking.status === BookingStatus.PENDING || selectedBooking.status === BookingStatus.APPROVED) && (
                <div className="pt-4 border-t border-slate-800/60 space-y-4">
                  <div>
                    <label className={labelCls}>Assign Teacher</label>
                    <select value={assignTeacherId} onChange={e => setAssignTeacherId(e.target.value)} className={selectCls}>
                      <option value="">Unassigned</option>
                      {(selectedBooking.deliveryMode === DeliveryMode.ONLINE
                        ? teachers.filter(t => t.supportsOnline)
                        : teachers
                      ).map(t => <option key={t.id} value={t.id}>{t.name} ({t.instrument}){t.supportsOnline ? ' - Online' : ''}</option>)}
                    </select>
                    {selectedBooking.deliveryMode === DeliveryMode.ONLINE && teachers.filter(t => t.supportsOnline).length === 0 && (
                      <p className="text-xs text-amber-400 mt-1.5">No teachers support online. Configure in System Configuration.</p>
                    )}
                  </div>
                  <div>
                    <label className={labelCls}>Assign School</label>
                    <select value={assignSchoolId} onChange={e => setAssignSchoolId(e.target.value)} className={selectCls}>
                      <option value="">Select School</option>
                      {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Admin Notes</label>
                    <textarea value={adminNotes} onChange={e => setAdminNotes(e.target.value)}
                      className={`${inputCls} h-20 resize-none`}
                      placeholder="Internal admin notes..." />
                  </div>
                </div>
              )}

              {/* Action buttons */}
              <div className="pt-4 border-t border-slate-800/60 flex flex-wrap gap-2">
                {selectedBooking.status === BookingStatus.PENDING && (
                  <>
                    <button onClick={handleApprove}
                      className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold transition-all active:scale-[0.98]">
                      Approve
                    </button>
                    <button onClick={handleReject}
                      className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-semibold transition-all active:scale-[0.98]">
                      Reject
                    </button>
                  </>
                )}
                {selectedBooking.status === BookingStatus.APPROVED && (
                  <>
                    <button onClick={handleConvert}
                      className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-semibold transition-all active:scale-[0.98]">
                      Convert to Lesson
                    </button>
                    <button onClick={handleReject}
                      className="px-5 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl text-sm font-semibold transition-all active:scale-[0.98]">
                      Reject
                    </button>
                  </>
                )}
                {(selectedBooking.status === BookingStatus.PENDING || selectedBooking.status === BookingStatus.APPROVED) && (
                  <button onClick={async () => {
                    // Save assignment changes without status change
                    const updates: any = {};
                    if (adminNotes) updates.adminNotes = adminNotes;
                    if (assignTeacherId) {
                      const t = teachers.find(t => t.id === assignTeacherId);
                      updates.teacherId = assignTeacherId;
                      updates.teacherName = t?.name || '';
                    }
                    if (assignSchoolId) {
                      const s = schools.find(s => s.id === assignSchoolId);
                      updates.schoolId = assignSchoolId;
                      updates.schoolName = s?.name || '';
                    }
                    if (Object.keys(updates).length > 0) {
                      await updateBooking(selectedBookingId!, updates);
                      alert('Booking updated!');
                    }
                    setSelectedBookingId(null);
                  }}
                    className="px-5 py-2.5 bg-slate-800 ring-1 ring-white/10 hover:bg-slate-700 text-white rounded-xl text-sm font-medium transition-all">
                    Save Changes
                  </button>
                )}
                <button onClick={() => setSelectedBookingId(null)}
                  className="px-5 py-2.5 bg-slate-800 ring-1 ring-white/10 text-slate-300 rounded-xl hover:bg-slate-700 text-sm font-medium transition-all">
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
