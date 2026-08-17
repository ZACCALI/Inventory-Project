'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, AlertTriangle, X } from 'lucide-react';

interface SyncFailureDetail {
  type: string;
  action: string;
  error: string;
}

interface SyncBannerState {
  kind: 'success' | 'failure';
  message: string;
  details?: SyncFailureDetail[];
}

/**
 * Global component that listens for real offline sync events dispatched by offlineSync.ts:
 *  - Clean, brief success toast ONLY when actual offline actions (> 0) were synced
 *  - Informative amber alert when an offline action encounters an error/conflict
 *  - 0-action routine data changes are handled completely silently without intrusive popups
 */
export default function SyncStatusBanner() {
  const [banner, setBanner] = useState<SyncBannerState | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handleSynced = (e: Event) => {
      const ev = e as CustomEvent<{ synced?: number; types?: string[] }>;
      const count = ev.detail?.synced || 0;
      
      // Approach 1: Silent if 0 actions were synced (prevents popup on regular data updates)
      if (count <= 0) return;

      const rawTypes = ev.detail?.types?.filter(t => t && t !== 'data') || [];
      const types = rawTypes.length > 0 ? ` (${rawTypes.join(', ')})` : '';

      setBanner({
        kind: 'success',
        message: `${count} offline ${count === 1 ? 'action' : 'actions'} synchronized successfully${types}.`,
      });
      setVisible(true);

      // Auto-dismiss success toast after 3.5 seconds
      const timer = setTimeout(() => setVisible(false), 3500);
      return () => clearTimeout(timer);
    };

    const handleFailed = (e: Event) => {
      const ev = e as CustomEvent<{ failed?: SyncFailureDetail[] }>;
      const failures = ev.detail?.failed || [];
      if (failures.length === 0) return;

      // Build a human-readable message
      const stockConflicts = failures.filter(f =>
        f.error?.toLowerCase().includes('cannot issue') ||
        f.error?.toLowerCase().includes('stock') ||
        f.error?.toLowerCase().includes('available')
      );
      const otherFailures = failures.filter(f => !stockConflicts.includes(f));

      let message = '';
      if (stockConflicts.length > 0) {
        message = `${stockConflicts.length} stock action${stockConflicts.length !== 1 ? 's' : ''} failed due to insufficient stock. Another user may have updated inventory while you were offline.`;
      } else {
        message = `${failures.length} offline action${failures.length !== 1 ? 's' : ''} failed to sync. Check your connection and try refreshing.`;
      }

      if (otherFailures.length > 0 && stockConflicts.length > 0) {
        message += ` (${otherFailures.length} other error${otherFailures.length !== 1 ? 's' : ''})`;
      }

      setBanner({ kind: 'failure', message, details: failures });
      setVisible(true);
    };

    window.addEventListener('amroding:synced', handleSynced);
    window.addEventListener('amroding:syncfailed', handleFailed);
    return () => {
      window.removeEventListener('amroding:synced', handleSynced);
      window.removeEventListener('amroding:syncfailed', handleFailed);
    };
  }, []);

  if (!visible || !banner) return null;

  const isSuccess = banner.kind === 'success';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 99999,
        maxWidth: '540px',
        width: 'calc(100vw - 32px)',
        background: isSuccess ? '#f0fdf4' : '#fffbeb',
        border: `1px solid ${isSuccess ? '#86efac' : '#fde68a'}`,
        borderRadius: '12px',
        padding: '12px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.08), 0 1px 3px rgba(0, 0, 0, 0.05)',
        animation: 'syncBannerSlideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      {isSuccess ? (
        <CheckCircle size={18} color="#16a34a" style={{ flexShrink: 0 }} />
      ) : (
        <AlertTriangle size={18} color="#d97706" style={{ flexShrink: 0 }} />
      )}
      <span
        style={{
          fontSize: '13px',
          fontWeight: 600,
          color: isSuccess ? '#15803d' : '#b45309',
          flex: 1,
          lineHeight: '1.4',
        }}
      >
        {banner.message}
      </span>
      <button
        onClick={() => setVisible(false)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: isSuccess ? '#15803d' : '#b45309',
          padding: '4px',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          opacity: 0.8,
        }}
        aria-label="Dismiss notification"
      >
        <X size={16} />
      </button>
      <style jsx>{`
        @keyframes syncBannerSlideUp {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
