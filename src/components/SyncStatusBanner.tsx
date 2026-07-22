'use client';

import { useEffect, useState } from 'react';
import { CheckCircle, AlertTriangle, X, CloudOff, RefreshCw } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';

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
 * Global component that listens for sync events dispatched by offlineSync.ts
 * and shows the user a brief notification banner:
 *  - Green flash when sync completes successfully
 *  - Persistent amber warning when a sync task permanently fails
 */
export default function SyncStatusBanner() {
  const [banner, setBanner] = useState<SyncBannerState | null>(null);
  const [visible, setVisible] = useState(false);
  const [isOffline, setIsOffline] = useState(false);

  const pendingCount = useLiveQuery(
    () => db.syncQueue.where('syncStatus').equals('pending').count(),
    []
  ) || 0;

  const syncingCount = useLiveQuery(
    () => db.syncQueue.where('syncStatus').equals('syncing').count(),
    []
  ) || 0;

  useEffect(() => {
    const checkOnline = async () => {
      if (!navigator.onLine) {
        setIsOffline(true);
        return;
      }
      try {
        await fetch(`/api/test-ping?t=${Date.now()}`, { method: 'HEAD', cache: 'no-store' });
        setIsOffline(false);
      } catch {
        setIsOffline(true);
      }
    };

    checkOnline();
    window.addEventListener('online', checkOnline);
    window.addEventListener('offline', checkOnline);
    const interval = setInterval(checkOnline, 5000);
    return () => {
      window.removeEventListener('online', checkOnline);
      window.removeEventListener('offline', checkOnline);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const handleSynced = (e: Event) => {
      const ev = e as CustomEvent<{ synced: number; types: string[] }>;
      const count = ev.detail?.synced || 0;
      const types = ev.detail?.types?.join(', ') || 'data';
      setBanner({
        kind: 'success',
        message: `✅ ${count} offline action${count !== 1 ? 's' : ''} synced successfully (${types}).`,
      });
      setVisible(true);
      // Auto-dismiss success after 4 seconds
      setTimeout(() => setVisible(false), 4000);
    };

    const handleFailed = (e: Event) => {
      const ev = e as CustomEvent<{ failed: SyncFailureDetail[] }>;
      const failures = ev.detail?.failed || [];

      // Build a human-readable message
      const stockConflicts = failures.filter(f =>
        f.error.toLowerCase().includes('cannot issue') ||
        f.error.toLowerCase().includes('stock') ||
        f.error.toLowerCase().includes('available')
      );
      const otherFailures = failures.filter(f => !stockConflicts.includes(f));

      let message = '';
      if (stockConflicts.length > 0) {
        message = `⚠️ ${stockConflicts.length} stock action${stockConflicts.length !== 1 ? 's' : ''} failed due to insufficient stock. The items could not be deducted because the inventory was already updated by someone else while you were offline.`;
      } else {
        message = `⚠️ ${failures.length} offline action${failures.length !== 1 ? 's' : ''} failed to sync. Check your connection and try refreshing.`;
      }

      if (otherFailures.length > 0) {
        message += ` (${otherFailures.length} other error${otherFailures.length !== 1 ? 's' : ''})`;
      }

      setBanner({ kind: 'failure', message, details: failures });
      setVisible(true);
      // Failures stay visible until manually dismissed
    };

    window.addEventListener('amroding:synced', handleSynced);
    window.addEventListener('amroding:syncfailed', handleFailed);
    return () => {
      window.removeEventListener('amroding:synced', handleSynced);
      window.removeEventListener('amroding:syncfailed', handleFailed);
    };
  }, []);

  const isSuccess = banner?.kind === 'success';

  return (
    <>
      {/* Live pending queue indicator / Offline Status */}
      {(isOffline || pendingCount > 0 || syncingCount > 0) && (
        <div
          style={{
            position: 'fixed',
            bottom: '20px',
            right: '20px',
            zIndex: 99998,
            background: isOffline ? '#ef4444' : syncingCount > 0 ? '#3b82f6' : '#f59e0b',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            fontSize: '12px',
            fontWeight: 600,
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
            animation: 'fadeIn 0.3s ease'
          }}
        >
          {isOffline ? (
            <CloudOff size={14} />
          ) : syncingCount > 0 ? (
            <RefreshCw size={14} className="spin" />
          ) : (
            <CloudOff size={14} />
          )}
          <span>
            {isOffline 
              ? `Offline Mode (Working Offline)${pendingCount > 0 ? ` - ${pendingCount} pending` : ''}`
              : syncingCount > 0 
                ? `Syncing ${syncingCount} item${syncingCount !== 1 ? 's' : ''}...` 
                : `${pendingCount} offline item${pendingCount !== 1 ? 's' : ''} pending`}
          </span>
        </div>
      )}

      {/* Flash Banner for success/failure */}
      {visible && banner && (
        <div
          style={{
            position: 'fixed',
            bottom: '80px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 99999,
            maxWidth: '600px',
            width: 'calc(100vw - 32px)',
            background: isSuccess ? '#dcfce7' : '#fef3c7',
            border: `1px solid ${isSuccess ? '#16a34a' : '#f59e0b'}`,
            borderRadius: '12px',
            padding: '14px 16px',
            display: 'flex',
            alignItems: 'flex-start',
            gap: '12px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.15)',
            animation: 'slideUp 0.3s ease',
          }}
        >
          {isSuccess
            ? <CheckCircle size={18} color="#16a34a" style={{ flexShrink: 0, marginTop: '2px' }} />
            : <AlertTriangle size={18} color="#92400e" style={{ flexShrink: 0, marginTop: '2px' }} />}
          <span style={{
            fontSize: '13px',
            fontWeight: 500,
            color: isSuccess ? '#14532d' : '#92400e',
            flex: 1,
            lineHeight: '1.5',
          }}>
            {banner.message}
          </span>
          <button
            onClick={() => setVisible(false)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: isSuccess ? '#14532d' : '#92400e',
              padding: '2px',
              flexShrink: 0,
            }}
            aria-label="Dismiss"
          >
            <X size={16} />
          </button>
        </div>
      )}
      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateX(-50%) translateY(20px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </>
  );
}
