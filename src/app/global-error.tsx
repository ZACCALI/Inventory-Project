'use client';

import { AlertTriangle } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ margin: 0, background: '#0f172a' }}>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#f1f5f9',
          fontFamily: 'system-ui, sans-serif',
          textAlign: 'center',
          padding: '2rem',
        }}>
          <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'center' }}>
            <AlertTriangle size={56} color="#ef4444" />
          </div>
          <h1 style={{ color: '#f87171', marginBottom: '1rem' }}>Critical Application Error</h1>
          <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>Please refresh the page.</p>
          <button onClick={reset} style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', padding: '0.75rem 2rem', fontSize: '1rem', cursor: 'pointer' }}>
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
