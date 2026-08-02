'use client';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body>
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
          background: '#f3f4f6',
          fontFamily: 'sans-serif',
        }}>
          <h2 style={{ color: '#dc2626' }}>Critical Application Error</h2>
          <p style={{ color: '#6b7280' }}>{error.message}</p>
          <button
            onClick={reset}
            style={{ background: '#2563eb', color: 'white', border: 'none', borderRadius: '6px', padding: '0.5rem 1rem', cursor: 'pointer' }}
          >
            Reload Application
          </button>
        </div>
      </body>
    </html>
  );
}
