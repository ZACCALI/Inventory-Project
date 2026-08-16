'use client';

import React, { useState } from 'react';
import { X, Edit, Trash2 } from 'lucide-react';
import { useAlert } from '@/components/AlertModal';
import { useModalDismiss } from '@/hooks/useModalDismiss';

export interface ManageReasonsModalProps {
  type: 'IN' | 'OUT';
  reasons: string[];
  onClose: () => void;
  onUpdate: (updated: string[]) => void;
}

export function ManageReasonsModal({ type, reasons, onClose, onUpdate }: ManageReasonsModalProps) {
  const { showAlert, showConfirm } = useAlert();
  const [inputValue, setInputValue] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [localReasons, setLocalReasons] = useState<string[]>([...reasons]);

  useModalDismiss(true, onClose);

  const title = type === 'IN' ? 'Manage Stock In Reasons' : 'Manage Stock Out Reasons';

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    const trimmed = inputValue.trim();

    if (editingIndex !== null) {
      const updated = [...localReasons];
      updated[editingIndex] = trimmed;
      setLocalReasons(updated);
      onUpdate(updated);
      setEditingIndex(null);
    } else {
      if (localReasons.includes(trimmed)) {
        showAlert('error', 'Action Failed', 'This reason already exists.');
        return;
      }
      const updated = [...localReasons, trimmed];
      setLocalReasons(updated);
      onUpdate(updated);
    }
    setInputValue('');
  };

  const handleDelete = async (index: number) => {
    const name = localReasons[index];
    if (!await showConfirm('Confirm', `Delete "${name}"?`)) return;
    const updated = localReasons.filter((_, i) => i !== index);
    setLocalReasons(updated);
    onUpdate(updated);
    if (editingIndex === index) {
      setEditingIndex(null);
      setInputValue('');
    }
  };

  const handleEdit = (index: number) => {
    setEditingIndex(index);
    setInputValue(localReasons[index]);
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
                id="stock-manage-reason-input"
                name="reasonName"
                aria-label="Type reason name"
                type="text"
                className="form-input"
                placeholder="Type reason name..."
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                required
                style={{ width: '100%' }}
              />
            </div>
            <div className="manage-list-actions">
              <button type="submit" className="btn btn-primary">
                {editingIndex !== null ? 'Update' : 'Add'}
              </button>
              {editingIndex !== null && (
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setEditingIndex(null);
                    setInputValue('');
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </form>

          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflowY: 'auto', maxHeight: '350px' }}>
            {localReasons.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                No reasons found. Add one above!
              </div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {localReasons.map((reason, index) => {
                  const isEditing = editingIndex === index;
                  return (
                    <li
                      key={index}
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
                      <span style={{ fontSize: '14px', fontWeight: isEditing ? 600 : 500, color: isEditing ? 'var(--primary)' : 'inherit' }}>
                        {reason}
                      </span>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          className="btn btn-icon"
                          onClick={() => handleEdit(index)}
                          data-tooltip="Edit"
                          style={{
                            width: '32px',
                            height: '32px',
                            padding: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'var(--bg-main)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-secondary)',
                            borderRadius: '6px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--primary)';
                            e.currentTarget.style.color = '#FFFFFF';
                            e.currentTarget.style.borderColor = 'var(--primary)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'var(--bg-main)';
                            e.currentTarget.style.color = 'var(--text-secondary)';
                            e.currentTarget.style.borderColor = 'var(--border)';
                          }}
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          type="button"
                          className="btn btn-icon"
                          onClick={() => handleDelete(index)}
                          data-tooltip="Delete"
                          style={{
                            width: '32px',
                            height: '32px',
                            padding: 0,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'var(--bg-main)',
                            border: '1px solid var(--border)',
                            color: 'var(--danger)',
                            borderRadius: '6px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--danger)';
                            e.currentTarget.style.color = '#FFFFFF';
                            e.currentTarget.style.borderColor = 'var(--danger)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'var(--bg-main)';
                            e.currentTarget.style.color = 'var(--danger)';
                            e.currentTarget.style.borderColor = 'var(--border)';
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
export default ManageReasonsModal;
