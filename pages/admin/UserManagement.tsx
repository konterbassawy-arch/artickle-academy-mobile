/**
 * UserManagement — Phase 9 + Phase 9.1
 *
 * Full user list with role badges, search, and ability to
 * create users with any of the 5 roles. Shows parent linkage
 * indicators and school_admin school assignment.
 *
 * Phase 9.1: Added Edit button + modal with role-appropriate fields.
 * Role itself is NOT editable — role change requires delete + recreate.
 * Does NOT duplicate the teacher-specific editing from Configuration.tsx.
 * Configuration remains the place for detailed teacher/school/student editing.
 */

import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { Role, User } from '../../types';

const inputCls = 'w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all placeholder:text-slate-600';
const selectCls = 'w-full bg-slate-800/80 border border-slate-700/80 rounded-xl px-3.5 py-2.5 text-white text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent outline-none transition-all';
const labelCls = 'block text-[10px] font-medium text-slate-500 uppercase tracking-wider mb-1.5';

const ROLE_COLORS: Record<string, string> = {
  [Role.ADMIN]: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/20',
  [Role.TEACHER]: 'bg-blue-500/15 text-blue-400 ring-1 ring-blue-500/20',
  [Role.PARENT]: 'bg-purple-500/15 text-purple-400 ring-1 ring-purple-500/20',
  [Role.STUDENT]: 'bg-green-500/15 text-green-400 ring-1 ring-green-500/20',
  [Role.SCHOOL_ADMIN]: 'bg-amber-500/15 text-amber-400 ring-1 ring-amber-500/20',
};

const RoleBadge: React.FC<{ role: string }> = ({ role }) => (
  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${ROLE_COLORS[role] || 'bg-slate-500/15 text-slate-400 ring-1 ring-slate-500/20'}`}>
    {(role || '').replace('_', ' ')}
  </span>
);

function formatLastLogin(ts?: number): string {
  if (!ts) return 'Never';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export const UserManagement: React.FC = () => {
  const { users, schools, teachers, parents, students, addUser, deleteUser, updateUser } = useApp();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', role: Role.TEACHER as Role,
    instrument: '', schoolId: ''
  });
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  // Phase 9.1: Edit state
  const [editUser, setEditUser] = useState<User | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '', instrument: '', schoolId: '' });
  const [saving, setSaving] = useState(false);

  const filteredUsers = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return users;
    return users.filter(u =>
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q) ||
      u.role?.toLowerCase().includes(q) ||
      u.id?.toLowerCase().includes(q)
    );
  }, [users, search]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus(null);

    if (!form.name.trim() || !form.email.trim()) {
      setStatus({ type: 'error', message: 'Name and email are required.' });
      return;
    }
    if (form.role === Role.TEACHER && !form.instrument.trim()) {
      setStatus({ type: 'error', message: 'Instrument is required for teachers.' });
      return;
    }
    if (form.role === Role.SCHOOL_ADMIN && !form.schoolId) {
      setStatus({ type: 'error', message: 'School selection is required for school admins.' });
      return;
    }

    const userData: any = { name: form.name, email: form.email, role: form.role };
    if (form.role === Role.SCHOOL_ADMIN) userData.schoolId = form.schoolId;

    const teacherDetails = form.role === Role.TEACHER ? { instrument: form.instrument } : undefined;

    const res = await addUser(userData, teacherDetails);
    if (res.success) {
      setStatus({ type: 'success', message: `User "${form.name}" created as ${form.role}.` });
      setForm({ name: '', email: '', role: Role.TEACHER, instrument: '', schoolId: '' });
      setShowCreate(false);
    } else {
      setStatus({ type: 'error', message: res.message || 'Failed to create user.' });
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      await deleteUser(id);
      setStatus({ type: 'success', message: `User "${name}" deleted.` });
    } catch (e: any) {
      setStatus({ type: 'error', message: e?.message || 'Failed to delete user.' });
    }
    setDeleting(null);
  };

  // Phase 9.1: Open edit modal
  const openEdit = (u: User) => {
    const teacher = teachers.find(t => t.id === u.id);
    const schoolId = (u as any)?.schoolId || '';
    setEditForm({
      name: u.name || '',
      email: u.email || '',
      instrument: teacher?.instrument || '',
      schoolId,
    });
    setEditUser(u);
  };

  // Phase 9.1: Save edit
  const handleSave = async () => {
    if (!editUser) return;
    const name = editForm.name.trim();
    if (!name) { setStatus({ type: 'error', message: 'Name is required.' }); return; }
    setSaving(true);
    try {
      const userData: Partial<User> = { name };
      // email update on User doc (note: does NOT change Firebase Auth email)
      if (editForm.email.trim()) (userData as any).email = editForm.email.trim();
      // school_admin: update schoolId
      if (editUser.role === Role.SCHOOL_ADMIN) (userData as any).schoolId = editForm.schoolId;

      const teacherData = editUser.role === Role.TEACHER
        ? { name, instrument: editForm.instrument.trim() }
        : undefined;

      const ok = await updateUser(editUser.id, userData, teacherData);
      if (ok) {
        setStatus({ type: 'success', message: `User "${name}" updated.` });
        setEditUser(null);
      } else {
        setStatus({ type: 'error', message: 'Failed to update user.' });
      }
    } catch (e: any) {
      setStatus({ type: 'error', message: e?.message || 'Failed to update user.' });
    }
    setSaving(false);
  };

  // Helper: get extra info for a user
  const getUserMeta = (userId: string, role: string) => {
    if (role === Role.TEACHER) {
      const t = teachers.find(t => t.id === userId);
      return t ? `${t.instrument} | Code: ${t.code}` : '';
    }
    if (role === Role.PARENT) {
      const p = parents.find(p => p.id === userId);
      if (!p || !p.childIds?.length) return 'No children linked';
      const names = p.childIds.map(cid => students.find(s => s.id === cid)?.name || cid).join(', ');
      return `Children: ${names}`;
    }
    if (role === Role.SCHOOL_ADMIN) {
      const u = users.find(u => u.id === userId);
      const sid = (u as any)?.schoolId;
      if (!sid) return 'No school assigned';
      const school = schools.find(s => s.id === sid);
      return `School: ${school?.name || sid}`;
    }
    return '';
  };

  return (
    <div className="space-y-8">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">User Management</h1>
          <p className="text-slate-500 text-sm mt-1">{users.length} user{users.length !== 1 ? 's' : ''} total</p>
        </div>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
            showCreate
              ? 'bg-slate-800 ring-1 ring-white/10 text-slate-300 hover:bg-slate-700'
              : 'bg-primary-600 hover:bg-primary-500 text-white shadow-lg shadow-primary-900/20 active:scale-[0.98]'
          }`}
        >
          {showCreate ? 'Cancel' : '+ Create User'}
        </button>
      </div>

      {/* Status message */}
      {status && (
        <div className={`px-4 py-3 rounded-xl text-sm font-medium ${
          status.type === 'success' ? 'bg-emerald-500/10 ring-1 ring-emerald-500/20 text-emerald-400' : 'bg-red-500/10 ring-1 ring-red-500/20 text-red-400'
        }`}>
          {status.message}
        </div>
      )}

      {/* Create form */}
      {showCreate && (
        <form onSubmit={handleCreate} className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl p-6 space-y-5">
          <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Create New User</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>Name</label>
              <input
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                className={inputCls}
                placeholder="Full name"
                required
              />
            </div>
            <div>
              <label className={labelCls}>Email</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                className={inputCls}
                placeholder="user@email.com"
                required
              />
            </div>
            <div>
              <label className={labelCls}>Role</label>
              <select
                value={form.role}
                onChange={e => setForm({ ...form, role: e.target.value as Role })}
                className={selectCls}
              >
                <option value={Role.TEACHER}>Teacher</option>
                <option value={Role.ADMIN}>Admin</option>
                <option value={Role.PARENT}>Parent</option>
                <option value={Role.STUDENT}>Student</option>
                <option value={Role.SCHOOL_ADMIN}>School Admin</option>
              </select>
            </div>
            {form.role === Role.TEACHER && (
              <div>
                <label className={labelCls}>Instrument</label>
                <input
                  value={form.instrument}
                  onChange={e => setForm({ ...form, instrument: e.target.value })}
                  className={inputCls}
                  placeholder="e.g. Piano, Violin"
                  required
                />
              </div>
            )}
            {form.role === Role.SCHOOL_ADMIN && (
              <div>
                <label className={labelCls}>School</label>
                <select
                  value={form.schoolId}
                  onChange={e => setForm({ ...form, schoolId: e.target.value })}
                  className={selectCls}
                  required
                >
                  <option value="">Select school...</option>
                  {schools.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <button
            type="submit"
            className="bg-primary-600 hover:bg-primary-500 text-white px-6 py-2.5 rounded-xl text-sm font-semibold shadow-lg shadow-primary-900/20 transition-all active:scale-[0.98]"
          >
            Create User
          </button>
        </form>
      )}

      {/* Search */}
      <input
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Search users by name, email, or role..."
        className={inputCls}
      />

      {/* User table */}
      <div className="bg-slate-900/60 ring-1 ring-white/5 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-800/40 text-[10px] text-slate-500 uppercase tracking-wider">
                <th className="text-left px-5 py-3 font-medium">Name</th>
                <th className="text-left px-5 py-3 font-medium hidden sm:table-cell">Email</th>
                <th className="text-left px-5 py-3 font-medium">Role</th>
                <th className="text-left px-5 py-3 font-medium hidden md:table-cell">Details</th>
                <th className="text-left px-5 py-3 font-medium">Last Login</th>
                <th className="text-right px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredUsers.map(u => (
                <tr key={u.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="px-5 py-3.5 text-white font-medium">
                    {u.role === Role.TEACHER ? (
                      <button
                        onClick={() => navigate(`/admin/teachers/${u.id}`)}
                        className="hover:text-primary-400 hover:underline transition-colors text-left font-medium"
                      >
                        {u.name}
                      </button>
                    ) : u.name}
                  </td>
                  <td className="px-5 py-3.5 text-slate-400 hidden sm:table-cell text-xs">{u.email || u.id}</td>
                  <td className="px-5 py-3.5"><RoleBadge role={u.role} /></td>
                  <td className="px-5 py-3.5 text-xs text-slate-500 hidden md:table-cell">{getUserMeta(u.id, u.role)}</td>
                  <td className="px-5 py-3.5 text-xs text-slate-500">{formatLastLogin(u.lastLogin)}</td>
                  <td className="px-5 py-3.5 text-right space-x-3">
                    <button
                      onClick={() => openEdit(u)}
                      className="text-xs text-primary-400 hover:text-primary-300 font-medium transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(u.id, u.name)}
                      disabled={deleting === u.id}
                      className="text-xs text-red-400 hover:text-red-300 font-medium transition-colors disabled:opacity-50"
                    >
                      {deleting === u.id ? '...' : 'Delete'}
                    </button>
                  </td>
                </tr>
              ))}
              {filteredUsers.length === 0 && (
                <tr><td colSpan={6} className="px-5 py-10 text-center text-slate-500 text-sm">No users found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Phase 9.1: Edit Modal */}
      {editUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-slate-900 ring-1 ring-white/10 rounded-2xl p-6 w-full max-w-md space-y-5 shadow-2xl shadow-black/40 mx-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-white">Edit User</h2>
              <button onClick={() => setEditUser(null)} className="text-slate-500 hover:text-white text-lg transition-colors">&times;</button>
            </div>

            {/* Role badge (read-only) */}
            <div>
              <label className={labelCls}>Role (not editable)</label>
              <RoleBadge role={editUser.role} />
            </div>

            {/* Parent ID (read-only, Phase 9.1) */}
            {editUser.role === Role.PARENT && (() => {
              const p = parents.find(p => p.id === editUser.id);
              return p?.parentId ? (
                <div>
                  <label className={labelCls}>Parent ID</label>
                  <span className="text-sm text-slate-300 font-mono">{p.parentId}</span>
                </div>
              ) : null;
            })()}

            {/* Name */}
            <div>
              <label className={labelCls}>Name</label>
              <input
                value={editForm.name}
                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                className={inputCls}
              />
            </div>

            {/* Email */}
            <div>
              <label className={labelCls}>Email</label>
              <input
                type="email"
                value={editForm.email}
                onChange={e => setEditForm({ ...editForm, email: e.target.value })}
                className={inputCls}
              />
              <p className="text-[10px] text-slate-600 mt-1">Updates display email only, not Firebase Auth login.</p>
            </div>

            {/* Teacher: instrument */}
            {editUser.role === Role.TEACHER && (
              <div>
                <label className={labelCls}>Instrument</label>
                <input
                  value={editForm.instrument}
                  onChange={e => setEditForm({ ...editForm, instrument: e.target.value })}
                  className={inputCls}
                />
                <p className="text-[10px] text-slate-600 mt-1">For rates and detailed teacher config, use Configuration page.</p>
              </div>
            )}

            {/* School Admin: school picker */}
            {editUser.role === Role.SCHOOL_ADMIN && (
              <div>
                <label className={labelCls}>School</label>
                <select
                  value={editForm.schoolId}
                  onChange={e => setEditForm({ ...editForm, schoolId: e.target.value })}
                  className={selectCls}
                >
                  <option value="">No school</option>
                  {schools.map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Parent: linked children (read-only) */}
            {editUser.role === Role.PARENT && (() => {
              const p = parents.find(p => p.id === editUser.id);
              const childNames = (p?.childIds || []).map(cid => students.find(s => s.id === cid)?.name || cid);
              return (
                <div>
                  <label className={labelCls}>Linked Children</label>
                  <span className="text-sm text-slate-400">{childNames.length ? childNames.join(', ') : 'None'}</span>
                </div>
              );
            })()}

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-xl text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                onClick={() => setEditUser(null)}
                className="px-5 py-2.5 bg-slate-800 ring-1 ring-white/10 text-slate-300 rounded-xl hover:bg-slate-700 text-sm font-medium transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagement;
