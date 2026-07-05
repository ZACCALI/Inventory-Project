'use client';

import { useState, createContext, useContext, useCallback, useEffect } from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';

interface ModalState {
  isOpen: boolean;
  isClosing: boolean;
  type: 'success' | 'error' | 'warning' | 'info' | 'confirm';
  title: string;
  message: string;
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface AlertContextType {
  showAlert: (type: ModalState['type'], title: string, message: string) => void;
  showConfirm: (title: string, message: string) => Promise<boolean>;
  showToast: (type: 'success' | 'error' | 'loading', message: string) => void;
}

const AlertContext = createContext<AlertContextType | null>(null);

export function useAlert() {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error('useAlert must be used within AlertProvider');
  return ctx;
}

export function AlertProvider({ children }: { children: React.ReactNode }) {
  const [modal, setModal] = useState<ModalState>({
    isOpen: false, isClosing: false, type: 'info', title: '', message: ''
  });

  // Smooth close: play exit animation then remove from DOM
  const closeWithAnimation = useCallback((callback?: () => void) => {
    setModal(prev => ({ ...prev, isClosing: true }));
    setTimeout(() => {
      setModal(prev => ({ ...prev, isOpen: false, isClosing: false }));
      callback?.();
    }, 220);
  }, []);

  const showAlert = useCallback((type: ModalState['type'], title: string, message: string) => {
    setModal({ isOpen: true, isClosing: false, type, title, message });
  }, []);

  const showConfirm = useCallback((title: string, message: string): Promise<boolean> => {
    return new Promise((resolve) => {
      setModal({
        isOpen: true,
        isClosing: false,
        type: 'confirm',
        title,
        message,
        onConfirm: () => closeWithAnimation(() => resolve(true)),
        onCancel:  () => closeWithAnimation(() => resolve(false)),
      });
    });
  }, [closeWithAnimation]);

  const showToast = useCallback((type: 'success' | 'error' | 'loading', message: string) => {
    if (type === 'success') toast.success(message);
    else if (type === 'error') toast.error(message);
    else toast.loading(message);
  }, []);

  const close = () => closeWithAnimation();

  const iconMap = {
    success: <CheckCircle2 size={28} color="var(--success)" />,
    error:   <XCircle size={28} color="var(--danger)" />,
    warning: <AlertTriangle size={28} color="var(--warning)" />,
    info:    <Info size={28} color="var(--primary)" />,
    confirm: <AlertTriangle size={28} color="var(--warning)" />,
  };

  const iconBgMap: Record<string, string> = {
    success: 'var(--success-light)',
    error:   'var(--danger-light)',
    warning: 'var(--warning-light)',
    info:    'var(--primary-light)',
    confirm: 'var(--warning-light)',
  };

  // Close on backdrop click
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && modal.type !== 'confirm') close();
  };

  // Close on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && modal.isOpen && modal.type !== 'confirm') close();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modal.isOpen, modal.type]);

  return (
    <AlertContext.Provider value={{ showAlert, showConfirm, showToast }}>
      {children}
      {modal.isOpen && (
        <div
          className="modal-overlay"
          style={{
            zIndex: 9999,
            animation: modal.isClosing
              ? 'overlayFadeIn 220ms cubic-bezier(0.4,0,1,1) reverse'
              : 'overlayFadeIn 220ms cubic-bezier(0.22,1,0.36,1)',
          }}
          onClick={handleOverlayClick}
        >
          <div
            className="modal" role="dialog" aria-modal="true"
            style={{
              maxWidth: '420px',
              animation: modal.isClosing
                ? 'modalSlideUp 220ms cubic-bezier(0.4,0,1,1) reverse'
                : 'modalSlideUp 320ms cubic-bezier(0.22,1,0.36,1)',
            }}
          >
            <div className="modal-header" style={{ borderBottom: '1px solid var(--border-light)', paddingBottom: 'var(--space-md)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{
                  width: '44px', height: '44px', borderRadius: 'var(--radius-md)',
                  background: iconBgMap[modal.type],
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  {iconMap[modal.type]}
                </div>
                <h2 className="modal-title" style={{ fontSize: 'var(--font-lg)', fontWeight: 700 }}>
                  {modal.title}
                </h2>
              </div>
              <button className="btn btn-icon btn-ghost" onClick={close} style={{ flexShrink: 0 }}>
                <X size={18} />
              </button>
            </div>
            <div className="modal-body">
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>{modal.message}</p>
            </div>
            <div className="modal-footer">
              {modal.type === 'confirm' ? (
                <>
                  <button className="btn btn-secondary" onClick={modal.onCancel}>Cancel</button>
                  <button className="btn btn-primary" onClick={modal.onConfirm}>Confirm</button>
                </>
              ) : (
                <button className="btn btn-primary" onClick={close} style={{ flex: 1 }}>OK</button>
              )}
            </div>
          </div>
        </div>
      )}
    </AlertContext.Provider>
  );
}
