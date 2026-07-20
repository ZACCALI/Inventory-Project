'use client';

import { CloudOff, ArrowLeft, RefreshCw, Server, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { db } from '@/lib/db';
import { processSyncQueue } from '@/lib/offlineSync';

export default function OfflinePage() {
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingItems, setPendingItems] = useState<{type: string, count: number}[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isOnline, setIsOnline] = useState(true);

  const fetchSyncStatus = async () => {
    try {
      const pendingTasks = await db.syncQueue
        .where('syncStatus')
        .anyOf(['pending', 'failed'])
        .toArray();
      
      setPendingCount(pendingTasks.length);

      const grouped = pendingTasks.reduce((acc, task) => {
        acc[task.type] = (acc[task.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      setPendingItems(Object.entries(grouped).map(([type, count]) => ({ type, count })));
    } catch (error) {
      console.error('Failed to fetch sync status:', error);
    }
  };

  useEffect(() => {
    fetchSyncStatus();
    setIsOnline(navigator.onLine);

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Refresh every 5 seconds
    const interval = setInterval(fetchSyncStatus, 5000);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(interval);
    };
  }, []);

  const handleRetrySync = async () => {
    if (!navigator.onLine) {
      alert("You are still offline. Please connect to the internet first.");
      return;
    }
    
    setIsSyncing(true);
    try {
      await processSyncQueue();
      await fetchSyncStatus();
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      background: 'var(--bg-main)',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{
        background: 'var(--bg-card)',
        padding: '40px',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.05)',
        textAlign: 'center',
        maxWidth: '450px',
        width: '100%'
      }}>
        <div style={{ 
          width: '80px', 
          height: '80px', 
          background: isOnline ? 'var(--success-light)' : 'var(--danger-light)', 
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px'
        }}>
          {isOnline ? (
            <Server size={40} color="var(--success)" strokeWidth={1.5} />
          ) : (
            <CloudOff size={40} color="var(--danger)" strokeWidth={1.5} />
          )}
        </div>
        
        <h1 style={{ 
          fontSize: '24px', 
          fontWeight: 700, 
          color: 'var(--text-primary)',
          marginBottom: '12px',
          margin: 0
        }}>
          {isOnline ? "You're Back Online!" : "You're Offline"}
        </h1>
        
        <p style={{ 
          color: 'var(--text-secondary)',
          fontSize: '15px',
          lineHeight: 1.5,
          marginBottom: '32px',
          marginTop: '12px'
        }}>
          {isOnline 
            ? "Your internet connection has been restored. You can now sync your pending changes."
            : "It looks like you've lost your internet connection or you refreshed the page while offline. Don't worry, the app is still working locally!"}
        </p>

        <div style={{
          background: 'var(--bg-main)',
          padding: '20px',
          borderRadius: 'var(--radius-md)',
          marginBottom: '32px',
          border: '1px solid var(--border)'
        }}>
          <h3 style={{ margin: '0 0 16px', fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
            <RefreshCw size={18} color="var(--primary)" /> Pending Sync Tasks: {pendingCount}
          </h3>
          
          {pendingCount === 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', color: 'var(--success)', fontWeight: 500, fontSize: '14px' }}>
              <CheckCircle size={16} /> All data is synced
            </div>
          ) : (
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, textAlign: 'left' }}>
              {pendingItems.map((item) => (
                <li key={item.type} style={{ 
                  display: 'flex', 
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--border-light)',
                  fontSize: '14px'
                }}>
                  <span style={{ textTransform: 'capitalize', color: 'var(--text-primary)', fontWeight: 500 }}>
                    {item.type}
                  </span>
                  <span style={{ background: 'var(--primary-light)', color: 'var(--primary)', padding: '2px 8px', borderRadius: '12px', fontWeight: 600, fontSize: '12px' }}>
                    {item.count}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {pendingCount > 0 && (
            <button 
              onClick={handleRetrySync}
              disabled={isSyncing || !isOnline}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                background: (!isSyncing && isOnline) ? 'var(--primary)' : 'var(--text-tertiary)',
                color: 'white',
                border: 'none',
                cursor: (!isSyncing && isOnline) ? 'pointer' : 'not-allowed',
                padding: '12px 24px',
                borderRadius: 'var(--radius-md)',
                fontWeight: 600,
                fontSize: '15px',
                width: '100%',
                transition: 'background 0.2s ease'
              }}
            >
              <RefreshCw size={18} className={isSyncing ? "spin" : ""} /> 
              {isSyncing ? 'Syncing...' : 'Retry Sync Now'}
            </button>
          )}

          <Link 
            href="/dashboard" 
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              background: 'var(--bg-main)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border)',
              textDecoration: 'none',
              padding: '12px 24px',
              borderRadius: 'var(--radius-md)',
              fontWeight: 600,
              fontSize: '15px',
              width: '100%',
              transition: 'background 0.2s ease'
            }}
          >
            <ArrowLeft size={18} /> Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
