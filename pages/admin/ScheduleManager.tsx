/**
 * ScheduleManager — Phase 15
 *
 * Admin page: CRUD timetable slots, trigger lesson generation for date range.
 * Only admin can create/edit/delete slots and generate lessons.
 */

import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { DeliveryMode, TimetableSlot } from '../../types';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export const ScheduleManager: React.FC = () => {
  const {
    timetableSlots, teachers, students, schools,
    addTimetableSlot, updateTimetableSlot, deleteTimetableSlot,
    generateLessonsFromTimetable
  } = useApp();

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editingSlot, setEditingSlot] = useState<TimetableSlot | null>(null);
  const [formTeacherId, setFormTeacherId] = useState('');
  const [formStudentIds, setFormStudentIds] = useState<string[]>([]);
  const [formSchoolId, setFormSchoolId] = useState('');
  const [formInstrument, setFormInstrument] = useState('');
  const [formDayOfWeek, setFormDayOfWeek] = useState(1);
  const [formStartTime, setFormStartTime] = useState('10:00');
  const [formEndTime, setFormEndTime] = useState('10:30');
  const [formDuration, setFormDuration] = useState(30);
  const [formType, setFormType] = useState<'Individual' | 'Group'>('Individual');
  const [formDeliveryMode, setFormDeliveryMode] = useState<DeliveryMode>(DeliveryMode.IN_PERSON);
  const [formNotes, setFormNotes] = useState('');

  // Generation state
  const [genStartDate, setGenStartDate] = useState('');
  const [genEndDate, setGenEndDate] = useState('');
  const [genResult, setGenResult] = useState<{ created: number; skipped: number; errors: number } | null>(null);
  const [generating, setGenerating] = useState(false);

  // Filter
  const [filterTeacher, setFilterTeacher] = useState('');

  const filteredSlots = useMemo(() => {
    let result = [...timetableSlots];
    if (filterTeacher) {
      result = result.filter(s => s.teacherId === filterTeacher);
    }
    return result;
  }, [timetableSlots, filterTeacher]);

  // Phase 16: Filter teachers to online-capable when delivery mode is ONLINE
  const availableTeachers = useMemo(() => {
    if (formDeliveryMode === DeliveryMode.ONLINE) {
      return teachers.filter(t => t.supportsOnline);
    }
    return teachers;
  }, [teachers, formDeliveryMode]);

  const selectedTeacher = teachers.find(t => t.id === formTeacherId);
  const teacherStudents = formTeacherId
    ? students.filter(s => s.teacherId === formTeacherId)
    : [];
  const schoolStudents = formSchoolId
    ? teacherStudents.filter(s => s.schoolId === formSchoolId)
    : teacherStudents;

  const resetForm = () => {
    setEditingSlot(null);
    setFormTeacherId('');
    setFormStudentIds([]);
    setFormSchoolId('');
    setFormInstrument('');
    setFormDayOfWeek(1);
    setFormStartTime('10:00');
    setFormEndTime('10:30');
    setFormDuration(30);
    setFormType('Individual');
    setFormDeliveryMode(DeliveryMode.IN_PERSON);
    setFormNotes('');
    setShowForm(false);
  };

  const openEditForm = (slot: TimetableSlot) => {
    setEditingSlot(slot);
    setFormTeacherId(slot.teacherId);
    setFormStudentIds([...slot.studentIds]);
    setFormSchoolId(slot.schoolId);
    setFormInstrument(slot.instrument);
    setFormDayOfWeek(slot.dayOfWeek);
    setFormStartTime(slot.startTime);
    setFormEndTime(slot.endTime);
    setFormDuration(slot.durationMinutes);
    setFormType(slot.type);
    setFormDeliveryMode(slot.deliveryMode || DeliveryMode.IN_PERSON);
    setFormNotes(slot.notes || '');
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTeacherId) return alert('Select a teacher');
    if (formStudentIds.length === 0) return alert('Select at least one student');

    const teacher = teachers.find(t => t.id === formTeacherId);
    const school = schools.find(s => s.id === formSchoolId);
    const selectedStudents = students.filter(s => formStudentIds.includes(s.id));

    const slotData: Omit<TimetableSlot, 'id' | 'createdAt'> = {
      teacherId: formTeacherId,
      teacherName: teacher?.name || '',
      studentIds: formStudentIds,
      studentNames: selectedStudents.map(s => s.name),
      schoolId: formSchoolId || '',
      schoolName: school?.name || (formSchoolId ? '' : 'Private'),
      instrument: formInstrument || teacher?.instrument || '',
      dayOfWeek: formDayOfWeek,
      startTime: formStartTime,
      endTime: formEndTime,
      durationMinutes: formDuration,
      type: formType,
      deliveryMode: formDeliveryMode,
      isActive: true,
      notes: formNotes || undefined,
    };

    if (editingSlot) {
      await updateTimetableSlot(editingSlot.id, slotData);
    } else {
      await addTimetableSlot(slotData);
    }
    resetForm();
  };

  const handleDelete = async (slot: TimetableSlot) => {
    if (!window.confirm(`Delete ${DAY_NAMES[slot.dayOfWeek]} ${slot.startTime} slot for ${slot.teacherName}?`)) return;
    await deleteTimetableSlot(slot.id);
  };

  const handleToggleActive = async (slot: TimetableSlot) => {
    await updateTimetableSlot(slot.id, { isActive: !slot.isActive });
  };

  const handleGenerate = async () => {
    if (!genStartDate || !genEndDate) return alert('Select a date range');
    if (genStartDate > genEndDate) return alert('Start date must be before end date');
    if (!window.confirm(`Generate lessons from ${genStartDate} to ${genEndDate}?\nThis will create lessons for all active timetable slots.`)) return;

    setGenerating(true);
    setGenResult(null);
    try {
      const result = await generateLessonsFromTimetable(genStartDate, genEndDate);
      setGenResult(result);
    } catch (e: any) {
      alert('Generation failed: ' + (e.message || e));
    }
    setGenerating(false);
  };

  const deliveryModeLabel = (mode: DeliveryMode | string | undefined) =>
    mode === DeliveryMode.ONLINE ? 'Online' : 'In-Person';

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Schedule Manager</h2>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="bg-primary-600 hover:bg-primary-500 text-white px-4 py-2 rounded-lg text-sm font-bold"
        >
          + New Timetable Slot
        </button>
      </div>

      {/* Generation Panel */}
      <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
        <h3 className="text-white font-semibold mb-3">Generate Lessons from Timetable</h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-slate-500 mb-1">From</label>
            <input type="date" value={genStartDate} onChange={e => setGenStartDate(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">To</label>
            <input type="date" value={genEndDate} onChange={e => setGenEndDate(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-white text-sm" />
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-600 text-white px-4 py-2 rounded-lg text-sm font-bold"
          >
            {generating ? 'Generating...' : 'Generate Lessons'}
          </button>
        </div>
        {genResult && (
          <div className="mt-3 flex gap-4 text-sm">
            <span className="text-emerald-400">Created: {genResult.created}</span>
            <span className="text-amber-400">Skipped (duplicates): {genResult.skipped}</span>
            {genResult.errors > 0 && <span className="text-red-400">Errors: {genResult.errors}</span>}
          </div>
        )}
      </div>

      {/* Filter */}
      <div className="flex gap-3">
        <select value={filterTeacher} onChange={e => setFilterTeacher(e.target.value)}
          className="bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 text-white text-sm">
          <option value="">All Teachers</option>
          {teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <span className="text-xs text-slate-500 self-center">
          {filteredSlots.length} slot{filteredSlots.length !== 1 ? 's' : ''}
          {' '}({filteredSlots.filter(s => s.isActive).length} active)
        </span>
      </div>

      {/* Slot Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-white mb-4">
              {editingSlot ? 'Edit Timetable Slot' : 'New Timetable Slot'}
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Teacher</label>
                <select value={formTeacherId} onChange={e => { setFormTeacherId(e.target.value); setFormStudentIds([]); }}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white">
                  <option value="">Select Teacher</option>
                  {availableTeachers.map(t => <option key={t.id} value={t.id}>{t.name} ({t.instrument}){t.supportsOnline ? ' ✓Online' : ''}</option>)}
                </select>
                {formDeliveryMode === DeliveryMode.ONLINE && availableTeachers.length === 0 && (
                  <p className="text-xs text-amber-400 mt-1">No teachers configured for online lessons. Enable "Supports Online" in Configuration → User Authorization.</p>
                )}
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">School (optional — leave empty for private)</label>
                <select value={formSchoolId} onChange={e => { setFormSchoolId(e.target.value); setFormStudentIds([]); }}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white">
                  <option value="">Private (No School)</option>
                  {schools.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Student(s)</label>
                <select multiple value={formStudentIds}
                  onChange={e => setFormStudentIds(Array.from(e.target.selectedOptions, (o: any) => o.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white min-h-[80px]">
                  {schoolStudents.map(s => <option key={s.id} value={s.id}>{s.name} ({s.instrument})</option>)}
                </select>
                <p className="text-xs text-slate-500 mt-1">Hold Ctrl/Cmd to select multiple for group lessons</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Day</label>
                  <select value={formDayOfWeek} onChange={e => setFormDayOfWeek(Number(e.target.value))}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white">
                    {DAY_NAMES.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Instrument</label>
                  <input type="text" value={formInstrument} onChange={e => setFormInstrument(e.target.value)}
                    placeholder={selectedTeacher?.instrument || 'e.g. Piano'}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Start</label>
                  <input type="time" value={formStartTime} onChange={e => setFormStartTime(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">End</label>
                  <input type="time" value={formEndTime} onChange={e => setFormEndTime(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Duration (min)</label>
                  <input type="number" value={formDuration} onChange={e => setFormDuration(Number(e.target.value))}
                    min={15} step={15}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Type</label>
                  <select value={formType} onChange={(e: any) => setFormType(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white">
                    <option value="Individual">Individual</option>
                    <option value="Group">Group</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Delivery Mode</label>
                  <select value={formDeliveryMode} onChange={(e: any) => {
                    const newMode = e.target.value;
                    setFormDeliveryMode(newMode);
                    // Phase 16: Clear teacher if switching to online and current teacher doesn't support it
                    if (newMode === DeliveryMode.ONLINE && formTeacherId) {
                      const t = teachers.find(t => t.id === formTeacherId);
                      if (t && !t.supportsOnline) { setFormTeacherId(''); setFormStudentIds([]); }
                    }
                  }}
                    className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white">
                    <option value={DeliveryMode.IN_PERSON}>In-Person</option>
                    <option value={DeliveryMode.ONLINE}>Online</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Notes (optional)</label>
                <input type="text" value={formNotes} onChange={e => setFormNotes(e.target.value)}
                  placeholder="e.g. Room 3, link for online..."
                  className="w-full bg-slate-900 border border-slate-700 rounded p-2 text-white" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit"
                  className="flex-1 bg-primary-600 hover:bg-primary-500 text-white py-2 rounded-lg font-bold text-sm">
                  {editingSlot ? 'Update Slot' : 'Create Slot'}
                </button>
                <button type="button" onClick={resetForm}
                  className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg font-bold text-sm">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Timetable Slot List */}
      {filteredSlots.length === 0 ? (
        <div className="bg-slate-800 rounded-xl border border-slate-700 p-8 text-center">
          <p className="text-slate-500">No timetable slots yet. Create one to get started.</p>
        </div>
      ) : (
        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-900 border-b border-slate-700">
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Day</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Time</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Teacher</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Student(s)</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">School</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Type</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Mode</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Status</th>
                <th className="px-4 py-3 text-left text-slate-400 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700">
              {filteredSlots.map(slot => (
                <tr key={slot.id} className={`hover:bg-slate-900/50 ${!slot.isActive ? 'opacity-50' : ''}`}>
                  <td className="px-4 py-3 text-white font-medium">{DAY_NAMES[slot.dayOfWeek]}</td>
                  <td className="px-4 py-3 text-slate-300">{slot.startTime}–{slot.endTime} ({slot.durationMinutes}min)</td>
                  <td className="px-4 py-3 text-slate-300">{slot.teacherName}</td>
                  <td className="px-4 py-3 text-slate-300">{slot.studentNames.join(', ')}</td>
                  <td className="px-4 py-3 text-slate-300">{slot.schoolName || 'Private'}</td>
                  <td className="px-4 py-3 text-slate-400">{slot.type}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      slot.deliveryMode === DeliveryMode.ONLINE
                        ? 'bg-blue-500/20 text-blue-300'
                        : 'bg-slate-600/30 text-slate-300'
                    }`}>
                      {deliveryModeLabel(slot.deliveryMode)}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${
                      slot.isActive ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                      {slot.isActive ? 'Active' : 'Paused'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEditForm(slot)} className="text-blue-400 hover:text-blue-300 text-xs font-bold">Edit</button>
                      <button onClick={() => handleToggleActive(slot)} className="text-amber-400 hover:text-amber-300 text-xs font-bold">
                        {slot.isActive ? 'Pause' : 'Resume'}
                      </button>
                      <button onClick={() => handleDelete(slot)} className="text-red-400 hover:text-red-300 text-xs font-bold">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
