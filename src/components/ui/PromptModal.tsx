import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface PromptModalProps {
  isOpen: boolean;
  title: string;
  label: string;
  placeholder?: string;
  defaultValue?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function PromptModal({
  isOpen,
  title,
  label,
  placeholder = '',
  defaultValue = '',
  onConfirm,
  onCancel,
  isLoading = false
}: PromptModalProps) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
    }
  }, [isOpen, defaultValue]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onConfirm(value.trim());
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button type="button" className="btn btn-icon btn-ghost" onClick={onCancel}>
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label htmlFor="prompt-modal-input" className="form-label">{label}</label>
              <input
                id="prompt-modal-input"
                name="promptInput"
                type="text"
                className="form-input"
                autoFocus
                placeholder={placeholder}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={isLoading}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={isLoading || !value.trim()}>
              {isLoading ? 'Saving...' : 'Confirm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
