'use client';

import React, { useState, useEffect } from 'react';
import { X, Edit, Trash2 } from 'lucide-react';
import { useAlert } from '@/components/AlertModal';
import { addSyncTask } from '@/lib/offlineSync';

export interface ManageListItem {
  id: string;
  name: string;
}

export interface ManageListModalProps {
  type: 'category' | 'unit';
  items: ManageListItem[];
  onClose: () => void;
  onUpdate: () => void;
}

export function ManageListModal({ type, items, onClose, onUpdate }: ManageListModalProps) {
  const { showAlert, showConfirm, showToast } = useAlert();
  const [inputValue, setInputValue] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const title = type === 'category' ? 'Manage Categories' : 'Manage Units';
  const apiPath = type === 'category' ? '/api/categories' : '/api/units';

  useEffect(() => {
    onUpdate();
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    setLoading(true);
    try {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      let networkFailed = false;

      if (!isOffline) {
        try {
          const url = editingId ? `${apiPath}/${editingId}` : apiPath;
          const method = editingId ? 'PUT' : 'POST';
          const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: inputValue.trim() })
          });

          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Operation failed');
          }
          setInputValue('');
          setEditingId(null);
          onUpdate();
          return;
        } catch (fetchErr: unknown) {
          if (fetchErr instanceof Error && fetchErr.message !== 'Failed to fetch') {
            throw fetchErr;
          }
          console.warn('Network error detected, falling back to offline mode', fetchErr);
          networkFailed = true;
        }
      }

      if (isOffline || networkFailed) {
        const action = editingId ? 'UPDATE' : 'CREATE';
        const payload = {
          id: editingId || `OFF-${Date.now()}`,
          name: inputValue.trim()
        };
        const entityName = type === 'category' ? 'category' : 'unit';
        await addSyncTask(entityName, action, payload);
        showToast('offline', 'Action queued offline — will sync when connected');

        setInputValue('');
        setEditingId(null);
        // Optimistically update the UI by calling onUpdate
        onUpdate();
        return;
      }
    } catch (err: unknown) {
      showAlert('error', 'Action Failed', (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!await showConfirm('Confirm', `Delete ${name}?`)) return;
    try {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      let networkFailed = false;

      if (!isOffline) {
        try {
          const res = await fetch(`${apiPath}/${id}`, { method: 'DELETE' });
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to delete');
          }
          onUpdate();
          return;
        } catch (fetchErr: unknown) {
          if (fetchErr instanceof Error && fetchErr.message !== 'Failed to fetch') {
            throw fetchErr;
          }
          console.warn('Network error detected, falling back to offline mode', fetchErr);
          networkFailed = true;
        }
      }

      if (isOffline || networkFailed) {
        const entityName = type === 'category' ? 'category' : 'unit';
        await addSyncTask(entityName, 'DELETE', { id });
        showToast('offline', 'Action queued offline — will sync when connected');
        onUpdate();
        return;
      }
    } catch (err: unknown) {
      showAlert('error', 'Action Failed', (err as Error).message);
    }
  };

  const handleEdit = (item: ManageListItem) => {
    setEditingId(item.id);
    setInputValue(item.name);
  };

  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Close dialog">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <form onSubmit={handleSave} className="manage-list-form">
            <div className="manage-list-input">
              <input
                id="manage-list-input"
                name="manageListItem"
                aria-label={`Type ${type} name`}
                type="text"
                className="form-input"
                placeholder={`Type ${type} name...`}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                required
                style={{ width: '100%' }}
              />
            </div>
            <div className="manage-list-actions">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {editingId ? 'Update' : 'Add'}
              </button>
              {editingId && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setEditingId(null);
                    setInputValue('');
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflowY: 'auto', maxHeight: '350px' }}>
            {items.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                No items found. Add one above!
              </div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {items.map(item => {
                  const isEditing = editingId === item.id;
                  const isPendingSync = String(item.id).startsWith('OFF-');
                  return (
                    <li
                      key={item.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px 16px',
                        borderBottom: '1px solid var(--border-light)',
                        background: isEditing ? 'var(--primary-light)' : 'transparent',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => { if (!isEditing) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={(e) => { if (!isEditing) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <span style={{ fontSize: '14px', fontWeight: isEditing ? 600 : 500, color: isEditing ? 'var(--primary)' : 'inherit' }}>
                          {item.name}
                        </span>
                        {isPendingSync && (
                          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--warning, #f59e0b)', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: '4px', padding: '1px 6px', whiteSpace: 'nowrap' }}>
                            Pending Sync
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        <button
                          type="button"
                          className="btn btn-icon"
                          onClick={() => handleEdit(item)}
                          data-tooltip={isPendingSync ? 'Cannot edit until synced' : 'Edit'}
                          disabled={isPendingSync}
                          style={{
                            width: '32px',
                            height: '32px',
                            padding: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'var(--bg-main)',
                            border: '1px solid var(--border)',
                            color: isPendingSync ? 'var(--text-disabled, #ccc)' : 'var(--text-secondary)',
                            borderRadius: '6px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                            opacity: isPendingSync ? 0.5 : 1,
                            cursor: isPendingSync ? 'not-allowed' : 'pointer',
                          }}
                          onMouseEnter={(e) => {
                            if (!isPendingSync) {
                              e.currentTarget.style.background = 'var(--primary)';
                              e.currentTarget.style.color = '#FFFFFF';
                              e.currentTarget.style.borderColor = 'var(--primary)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isPendingSync) {
                              e.currentTarget.style.background = 'var(--bg-main)';
                              e.currentTarget.style.color = 'var(--text-secondary)';
                              e.currentTarget.style.borderColor = 'var(--border)';
                            }
                          }}
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-icon"
                          onClick={() => handleDelete(item.id, item.name)}
                          data-tooltip={isPendingSync ? 'Cannot delete until synced' : 'Delete'}
                          disabled={isPendingSync}
                          style={{
                            width: '32px',
                            height: '32px',
                            padding: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'var(--bg-main)',
                            border: '1px solid var(--border)',
                            color: isPendingSync ? 'var(--text-disabled, #ccc)' : 'var(--danger)',
                            borderRadius: '6px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                            opacity: isPendingSync ? 0.5 : 1,
                            cursor: isPendingSync ? 'not-allowed' : 'pointer',
                          }}
                          onMouseEnter={(e) => {
                            if (!isPendingSync) {
                              e.currentTarget.style.background = 'var(--danger)';
                              e.currentTarget.style.color = '#FFFFFF';
                              e.currentTarget.style.borderColor = 'var(--danger)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isPendingSync) {
                              e.currentTarget.style.background = 'var(--bg-main)';
                              e.currentTarget.style.color = 'var(--danger)';
                              e.currentTarget.style.borderColor = 'var(--border)';
                            }
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
export default ManageListModal;
