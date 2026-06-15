/**
 * ParentOnboarding — Phase 9
 *
 * Focused workflow for admin to:
 * 1. Create a parent account (or select existing parent)
 * 2. Search and select students
 * 3. Link selected students as the parent's children
 *
 * Linkage is one-directional for now: Parent.childIds → Student IDs.
 * Reverse linkage (Student.parentIds) added in Phase 11.
 */

import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Role } from '../../types';

type Step = 'select-parent' | 'link-children' | 'done';

export const ParentOnboarding: React.FC = () => {
  const { users, parents, students, schools, addUser, linkParentToStudents, unlinkParentFromStudent } = useApp();

  const [step, setStep] = useState<Step>('select-parent');
  const [selectedParentId, setSelectedParentId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Create parent form
  const [createForm, setCreateForm] = useState({ name: '', email: '', phone: '' });
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Student search
  const [studentSearch, setStudentSearch] = useState('');
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);

  // Get parent users
  const parentUsers = useMemo(() =>
    users.filter(u => u.role === Role.PARENT),
    [users]
  );

  const selectedParent = useMemo(() =>
    parents.find(p => p.id === selectedParentId),
    [parents, selectedParentId]
  );

  const filteredStudents = useMemo(() => {
    const q = studentSearch.toLowerCase();
    if (!q) return students;
    return students.filter(s =>
      s.name?.toLowerCase().includes(q) ||
      s.instrument?.toLowerCase().includes(q) ||
      schools.find(sc => sc.id === s.schoolId)?.name?.toLowerCase().includes(q)
    );
  }, [students, studentSearch, schools]);

  const handleCreateParent = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);
    if (!createForm.name.trim() || !createForm.email.trim()) {
      setStatus({ type: 'error', message: 'Name and email are required.' });
      return;
    }
    const res = await addUser(
      { name: createForm.name, email: createForm.email, role: Role.PARENT, phone: createForm.phone } as any
    );
    if (res.success) {
      // Find the newly created parent by email
      const emailId = createForm.email.trim().toLowerCase().replace(/[^a-z0-9]/g, '-');
      setSelectedParentId(emailId);
      setStatus({ type: 'success', message: `Parent "${createForm.name}" created. Now link children.` });
      setStep('link-children');
      setShowCreateForm(false);
      setCreateForm({ name: '', email: '', phone: '' });
    } else {
      setStatus({ type: 'error', message: res.message || 'Failed to create parent.' });
    }
  };

  const handleSelectExistingParent = (parentId: string) => {
    setSelectedParentId(parentId);
    setStep('link-children');
    setStatus(null);
  };

  const toggleStudent = (studentId: string) => {
    setSelectedStudentIds(prev =>
      prev.includes(studentId) ? prev.filter(id => id !== studentId) : [...prev, studentId]
    );
  };

  const handleLinkChildren = async () => {
    if (!selectedParentId || selectedStudentIds.length === 0) {
      setStatus({ type: 'error', message: 'Select at least one student.' });
      return;
    }
    setStatus(null);
    const res = await linkParentToStudents(selectedParentId, selectedStudentIds);
    if (res.success) {
      setStatus({ type: 'success', message: `Linked ${selectedStudentIds.length} student(s) to parent.` });
      setSelectedStudentIds([]);
      setStep('done');
    } else {
      setStatus({ type: 'error', message: res.message || 'Failed to link.' });
    }
  };

  const handleUnlink = async (childId: string) => {
    if (!selectedParentId) return;
    const res = await unlinkParentFromStudent(selectedParentId, childId);
    if (res.success) {
      setStatus({ type: 'success', message: 'Student unlinked.' });
    } else {
      setStatus({ type: 'error', message: res.message || 'Failed to unlink.' });
    }
  };

  const resetFlow = () => {
    setStep('select-parent');
    setSelectedParentId(null);
    setSelectedStudentIds([]);
    setStatus(null);
    setShowCreateForm(false);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Parent Onboarding</h1>
        <p className="text-sm text-slate-500 mt-1">Create a parent account and link their children</p>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs">
        {(['select-parent', 'link-children', 'done'] as Step[]).map((s, i) => (
          <React.Fragment key={s}>
            {i > 0 && <div className="w-8 h-px bg-slate-700" />}
            <div className={`px-3 py-1 rounded-full border ${
              step === s ? 'bg-primary-600/20 border-primary-500 text-primary-400' : 'border-slate-700 text-slate-500'
            }`}>
              {s === 'select-parent' ? '1. Select Parent' : s === 'link-children' ? '2. Link Children' : '3. Done'}
            </div>
          </React.Fragment>
        ))}
      </div>

      {/* Status */}
      {status && (
        <div className={`p-3 rounded-lg text-sm font-medium ${
          status.type === 'success' ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400' : 'bg-red-500/10 border border-red-500/20 text-red-400'
        }`}>
          {status.message}
        </div>
      )}

      {/* Step 1: Select or create parent */}
      {step === 'select-parent' && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">Existing Parents</h2>
              <button
                onClick={() => setShowCreateForm(!showCreateForm)}
                className="px-3 py-1.5 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-xs font-medium transition-colors"
              >
                {showCreateForm ? 'Cancel' : '+ New Parent'}
              </button>
            </div>

            {showCreateForm && (
              <form onSubmit={handleCreateParent} className="mb-4 p-4 bg-slate-800/50 rounded-lg space-y-3">
                <div className="grid sm:grid-cols-3 gap-3">
                  <input
                    value={createForm.name}
                    onChange={e => setCreateForm({ ...createForm, name: e.target.value })}
                    placeholder="Parent name"
                    className="bg-slate-800 text-white p-2.5 rounded border border-slate-700 text-sm"
                    required
                  />
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={e => setCreateForm({ ...createForm, email: e.target.value })}
                    placeholder="Email"
                    className="bg-slate-800 text-white p-2.5 rounded border border-slate-700 text-sm"
                    required
                  />
                  <input
                    value={createForm.phone}
                    onChange={e => setCreateForm({ ...createForm, phone: e.target.value })}
                    placeholder="Phone (optional)"
                    className="bg-slate-800 text-white p-2.5 rounded border border-slate-700 text-sm"
                  />
                </div>
                <button type="submit" className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm transition-colors">
                  Create Parent
                </button>
              </form>
            )}

            {parentUsers.length === 0 ? (
              <p className="text-sm text-slate-500 italic">No parent accounts yet. Create one above.</p>
            ) : (
              <div className="space-y-2">
                {parentUsers.map(pu => {
                  const parentDoc = parents.find(p => p.id === pu.id);
                  const childCount = parentDoc?.childIds?.length || 0;
                  return (
                    <button
                      key={pu.id}
                      onClick={() => handleSelectExistingParent(pu.id)}
                      className="w-full text-left p-3 bg-slate-800/50 hover:bg-slate-800 rounded-lg flex items-center justify-between transition-colors"
                    >
                      <div>
                        <p className="text-sm text-white font-medium">{pu.name}</p>
                        <p className="text-xs text-slate-500">{pu.email || pu.id}</p>
                      </div>
                      <div className="text-xs text-slate-400">
                        {childCount} child{childCount !== 1 ? 'ren' : ''}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Step 2: Link children */}
      {step === 'link-children' && selectedParentId && (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-1">
              Parent: {selectedParent?.name || parentUsers.find(u => u.id === selectedParentId)?.name || selectedParentId}
            </h2>

            {/* Current children */}
            {selectedParent && selectedParent.childIds.length > 0 && (
              <div className="mt-3 mb-4">
                <p className="text-xs text-slate-500 mb-2">Currently linked children:</p>
                <div className="flex flex-wrap gap-2">
                  {selectedParent.childIds.map(cid => {
                    const student = students.find(s => s.id === cid);
                    return (
                      <span key={cid} className="inline-flex items-center gap-1 px-2 py-1 bg-purple-500/10 border border-purple-500/30 text-purple-400 rounded text-xs">
                        {student?.name || cid}
                        <button onClick={() => handleUnlink(cid)} className="ml-1 text-red-400 hover:text-red-300">&times;</button>
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Search students */}
            <div className="mt-4">
              <input
                value={studentSearch}
                onChange={e => setStudentSearch(e.target.value)}
                placeholder="Search students by name, instrument, or school..."
                className="bg-slate-800 text-white w-full p-2.5 rounded border border-slate-700 text-sm mb-3"
              />

              <div className="max-h-60 overflow-y-auto space-y-1">
                {filteredStudents.map(s => {
                  const isLinked = selectedParent?.childIds?.includes(s.id);
                  const isSelected = selectedStudentIds.includes(s.id);
                  const school = schools.find(sc => sc.id === s.schoolId);
                  return (
                    <button
                      key={s.id}
                      onClick={() => !isLinked && toggleStudent(s.id)}
                      disabled={isLinked}
                      className={`w-full text-left p-2.5 rounded-lg flex items-center justify-between transition-colors ${
                        isLinked
                          ? 'bg-slate-800/30 opacity-50 cursor-not-allowed'
                          : isSelected
                            ? 'bg-primary-600/20 border border-primary-500/50'
                            : 'bg-slate-800/50 hover:bg-slate-800'
                      }`}
                    >
                      <div>
                        <p className="text-sm text-white">{s.name}</p>
                        <p className="text-xs text-slate-500">{s.instrument} | {school?.name || s.schoolId}</p>
                      </div>
                      <span className="text-xs">
                        {isLinked ? (
                          <span className="text-purple-400">Already linked</span>
                        ) : isSelected ? (
                          <span className="text-primary-400">Selected</span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
                {filteredStudents.length === 0 && (
                  <p className="text-sm text-slate-500 italic p-2">No students found</p>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={handleLinkChildren}
                disabled={selectedStudentIds.length === 0}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
              >
                Link {selectedStudentIds.length} Student{selectedStudentIds.length !== 1 ? 's' : ''}
              </button>
              <button
                onClick={resetFlow}
                className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
              >
                Back
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Done */}
      {step === 'done' && (
        <div className="bg-slate-900 border border-emerald-500/20 rounded-xl p-8 text-center">
          <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-white mb-2">Parent Onboarded</h2>
          <p className="text-sm text-slate-400 mb-6">
            Parent account is set up and children are linked.
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => { setStep('link-children'); }}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm transition-colors"
            >
              Link More Children
            </button>
            <button
              onClick={resetFlow}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg text-sm transition-colors"
            >
              Onboard Another Parent
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParentOnboarding;
