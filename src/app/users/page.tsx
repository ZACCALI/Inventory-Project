'use client';

import React, { useState, useEffect, useCallback } from 'react';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {  Plus, Trash2, X, UserPlus,   Search, Users, User, Shield, Edit, AlertTriangle } from 'lucide-react';
import { useAlert } from '@/components/AlertModal';
import { useDebounce } from '@/hooks/useDebounce';

import Image from "next/image";
interface UserRecord {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
  avatar?: string | null;
}

export default function UsersPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const { showToast, showAlert } = useAlert();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [page, setPage] = useState(1);
  const [totalUsers, setTotalUsers] = useState(0);
  const limit = 50;
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<UserRecord | null>(null);
  const [formData, setFormData] = useState({ name: '', email: '', password: '', role: 'staff' });
  const [editFormData, setEditFormData] = useState({ name: '', email: '', password: '', role: 'staff' });
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const userRole = session?.user?.role;

  const getQueryString = useCallback(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.append('search', debouncedSearch);
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    return params.toString();
  }, [debouncedSearch, page]);

  const { data: swrRes, error: swrError } = useSWR(
    userRole === 'admin' ? `/api/users?${getQueryString()}` : null,
    async (url) => {
      const res = await fetch(url);
      if (res.status === 403) {
        router.push('/');
        throw new Error('Forbidden');
      }
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      return { data, totalCount: parseInt(res.headers.get('X-Total-Count') || '0', 10) };
    }
  );

  useEffect(() => {
    if (swrRes) {
      if (Array.isArray(swrRes.data)) {
        setUsers(swrRes.data);
        setTotalUsers(swrRes.totalCount);
      } else {
        setUsers([]);
        setTotalUsers(0);
      }
      setLoading(false);
    } else if (swrError) {
      setLoading(false);
    }
  }, [swrRes, swrError]);

  const fetchUsers = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const res = await fetch(`/api/users?${getQueryString()}`);
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
        const totalCount = res.headers.get('X-Total-Count');
        if (totalCount) setTotalUsers(parseInt(totalCount, 10));
      } else if (res.status === 403) {
        router.push('/');
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    } finally {
      setLoading(false);
    }
  }, [router, getQueryString]);

  useEffect(() => {
    if (userRole !== 'admin') {
      router.push('/');
      return;
    }
    fetchUsers();
  }, [userRole, router, fetchUsers]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!formData.name || !formData.email || !formData.password) {
      setError('All fields are required');
      return;
    }
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setCreating(true);
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (res.ok) {
        setShowModal(false);
        setFormData({ name: '', email: '', password: '', role: 'staff' });
        fetchUsers();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to create user');
      }
    } catch {
      setError('Network error');
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDeleteConfirm(null);
        showAlert('success', 'User Deleted', 'The user account has been successfully removed from the system.');
        fetchUsers();
      } else {
        const data = await res.json();
        setDeleteConfirm(null);
        showAlert('error', 'Cannot Delete User', data.error || 'Failed to delete user');
      }
    } catch {
      setDeleteConfirm(null);
      showAlert('error', 'Action Failed', 'Failed to communicate with server');
    }
  }

  async function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!editFormData.name || !editFormData.email || !editFormData.role) {
      setError('Name, email, and role are required');
      return;
    }
    setEditing(true);
    try {
      const res = await fetch(`/api/users/${showEditModal?.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFormData),
      });
      if (res.ok) {
        setShowEditModal(null);
        showToast('success', 'User updated successfully');
        fetchUsers();
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to update user');
      }
    } catch {
      setError('Network error');
    } finally {
      setEditing(false);
    }
  }

  // We do not do client-side filtering anymore since API handles it
  const filtered = users;

  const roleColors: Record<string, string> = {
    admin: '#dc2626',
    staff: '#2563eb',
    cashier: '#059669',
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="page-subtitle">Manage user accounts and roles ({totalUsers} users)</p>
        </div>
        <div className="page-header-actions" style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-primary" onClick={() => setShowModal(true)} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <UserPlus size={18} /> Add User
          </button>
        </div>
      </div>

      {loading ? (
        <div className="stats-grid-3" style={{ marginBottom: '24px' }}>
          {[1,2,3].map(i => (
            <div key={i} className="stat-card">
              <div className="skeleton" style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', flexShrink: 0 }} />
              <div className="stat-info">
                <div className="skeleton" style={{ height: '12px', width: '80px', marginBottom: '8px' }} />
                <div className="skeleton" style={{ height: '24px', width: '100px', marginBottom: '6px' }} />
                <div className="skeleton" style={{ height: '10px', width: '70px' }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
      <div className="stats-grid-3" style={{ marginBottom: '24px' }}>
        <div className="stat-card">
          <div className="stat-icon blue"><Users size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Total Users</div>
            <div className="stat-value">{totalUsers}</div>
            <div className="stat-change" style={{ color: 'var(--text-tertiary)', background: 'transparent', padding: 0, fontWeight: 500, marginTop: '4px' }}>All registered accounts</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon primary"><Shield size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Administrators</div>
            <div className="stat-value">{users.filter(u => u.role === 'admin').length}</div>
            <div className="stat-change" style={{ color: 'var(--text-tertiary)', background: 'transparent', padding: 0, fontWeight: 500, marginTop: '4px' }}>Full access</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><User size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Staff / Cashiers</div>
            <div className="stat-value">{users.filter(u => u.role !== 'admin').length}</div>
            <div className="stat-change" style={{ color: 'var(--text-tertiary)', background: 'transparent', padding: 0, fontWeight: 500, marginTop: '4px' }}>Limited access</div>
          </div>
        </div>
      </div>
      )}

      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ padding: '16px' }}>
          <div style={{ position: 'relative', maxWidth: '400px' }}>
            <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input
              id="user-search"
              name="search"
              aria-label="Search users"
              className="form-input"
              placeholder="Search users..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: '36px' }}
            />
          </div>
        </div>

        <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Created</th>
                <th style={{ textAlign: 'center', width: '80px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(5).fill(0).map((_, idx) => (
                  <tr key={idx}>
                    <td><div className="skeleton" style={{ height: '20px', width: '80%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '60%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '70%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '90%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '50%' }} /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                    No users found
                  </td>
                </tr>
              ) : (
                filtered.map((user) => (
                  <tr key={user.id}>
                    <td data-label="User" style={{ fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        {user.avatar ? (
                          <Image width={400} height={400} src={user.avatar} 
                            alt={user.name} 
                            style={{ width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' }} 
                           />
                        ) : (
                          <div style={{
                            width: '32px', height: '32px', borderRadius: '50%',
                            background: roleColors[user.role] || '#6b7280',
                            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '12px', fontWeight: 700, flexShrink: 0
                          }}>
                            {user.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
                          </div>
                        )}
                        {user.name}
                      </div>
                    </td>
                    <td data-label="Email" style={{ color: 'var(--text-secondary)' }}>{user.email}</td>
                    <td data-label="Role">
                      <span className="badge" style={{
                        background: `${roleColors[user.role] || '#6b7280'}20`,
                        color: roleColors[user.role] || '#6b7280',
                        padding: '4px 12px', borderRadius: '16px', fontSize: '12px',
                        fontWeight: 600, textTransform: 'capitalize'
                      }}>
                        {user.role}
                      </span>
                    </td>
                    <td data-label="Date Added" style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                      {new Date(user.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                    </td>
                    <td data-label="Actions" style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button
                          className="btn btn-icon"
                          onClick={() => {
                            setEditFormData({ name: user.name, email: user.email, role: user.role, password: '' });
                            setShowEditModal(user);
                            setError('');
                          }}
                          style={{ 
                            width: '32px', height: '32px', padding: 0,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: 'var(--bg-main)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-secondary)',
                            borderRadius: '6px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                          }}
                          data-tooltip="Edit user"
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-main)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                        >
                          <Edit size={16} />
                        </button>
                        {user.id !== session?.user?.id && (
                          <button
                            className="btn btn-icon"
                            onClick={() => setDeleteConfirm(user.id)}
                            style={{ 
                              width: '32px', height: '32px', padding: 0,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              background: 'var(--bg-main)',
                              border: '1px solid var(--border)',
                              color: 'var(--danger)',
                              borderRadius: '6px',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                            }}
                            data-tooltip="Delete user"
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--danger)'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = 'var(--danger)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-main)'; e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                          >
                            <Trash2 size={16} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalUsers > limit && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span style={{ fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>Page {page} of {Math.ceil(totalUsers / limit)}</span>
            <button className="btn btn-secondary" disabled={page >= Math.ceil(totalUsers / limit)} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      {showModal && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <UserPlus size={20} color="var(--primary)" /> Create New User
              </h2>
              <button className="btn btn-icon btn-ghost" onClick={() => { setShowModal(false); setError(''); }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreate}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {error && (
                  <div style={{ padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '13px' }}>
                    {error}
                  </div>
                )}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor="add-user-name" className="form-label">Full Name *</label>
                  <input id="add-user-name" name="name" autoComplete="name" className="form-input" placeholder="John Doe" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} required />
                </div>
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label htmlFor="add-user-email" className="form-label" style={{ fontWeight: 600, marginBottom: '6px' }}>Email Address *</label>
                  <input id="add-user-email" name="email" autoComplete="email" className="form-input" type="email" placeholder="john@amroding.com" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} required />
                </div>
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label htmlFor="add-user-password" className="form-label" style={{ fontWeight: 600, marginBottom: '6px' }}>Temporary Password *</label>
                  <input id="add-user-password" name="password" autoComplete="new-password" className="form-input" type="password" placeholder="••••••••" value={formData.password} onChange={(e) => setFormData({ ...formData, password: e.target.value })} required minLength={8} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor="add-user-role" className="form-label">Role *</label>
                  <select id="add-user-role" name="role" className="form-select" value={formData.role} onChange={(e) => setFormData({ ...formData, role: e.target.value })}>
                    <option value="staff">Staff</option>
                    <option value="cashier">Cashier</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowModal(false); setError(''); }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={creating} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <Plus size={16} /> {creating ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {showEditModal && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Edit size={20} color="var(--primary)" /> Edit User
              </h2>
              <button className="btn btn-icon btn-ghost" onClick={() => { setShowEditModal(null); setError(''); }}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleEdit}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {error && (
                  <div style={{ padding: '12px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '13px' }}>
                    {error}
                  </div>
                )}
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor="edit-user-name" className="form-label">Full Name *</label>
                  <input id="edit-user-name" name="name" autoComplete="name" className="form-input" placeholder="John Doe" value={editFormData.name} onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })} required />
                </div>
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label htmlFor="edit-user-email" className="form-label" style={{ fontWeight: 600, marginBottom: '6px' }}>Email Address *</label>
                  <input id="edit-user-email" name="email" autoComplete="email" className="form-input" type="email" placeholder="john@amroding.com" value={editFormData.email} onChange={(e) => setEditFormData({ ...editFormData, email: e.target.value })} required />
                </div>
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label htmlFor="edit-user-password" className="form-label" style={{ fontWeight: 600, marginBottom: '6px' }}>Reset Password (Optional)</label>
                  <input id="edit-user-password" name="password" autoComplete="new-password" className="form-input" type="password" placeholder="••••••••" value={editFormData.password} onChange={(e) => setEditFormData({ ...editFormData, password: e.target.value })} minLength={8} />
                  {editFormData.password && (
                    <p style={{ fontSize: '12px', color: 'var(--danger)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <AlertTriangle size={16} style={{ display: 'inline', marginBottom: '-3px', marginRight: '4px' }} /> This will reset the user&apos;s password. They will need the new password to log in.
                    </p>
                  )}
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label htmlFor="edit-user-role" className="form-label">Role *</label>
                  <select id="edit-user-role" name="role" className="form-select" value={editFormData.role} onChange={(e) => setEditFormData({ ...editFormData, role: e.target.value })}>
                    <option value="staff">Staff</option>
                    <option value="cashier">Cashier</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => { setShowEditModal(null); setError(''); }}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={editing} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <Edit size={16} /> {editing ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="modal-overlay" style={{ zIndex: 9999 }}>
          <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Delete User?</h2>
              <button className="btn btn-icon btn-ghost" onClick={() => setDeleteConfirm(null)}><X size={20} /></button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)', margin: 0 }}>
                This action cannot be undone. The user will be permanently removed.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirm)}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
