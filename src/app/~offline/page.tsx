import { CloudOff, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Offline | DistriTrack',
  description: 'You are currently offline.',
};

export default function OfflinePage() {
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
        maxWidth: '400px',
        width: '100%'
      }}>
        <div style={{ 
          width: '80px', 
          height: '80px', 
          background: 'var(--danger-light)', 
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 24px'
        }}>
          <CloudOff size={40} color="var(--danger)" strokeWidth={1.5} />
        </div>
        
        <h1 style={{ 
          fontSize: '24px', 
          fontWeight: 700, 
          color: 'var(--text-primary)',
          marginBottom: '12px',
          margin: 0
        }}>
          You're Offline
        </h1>
        
        <p style={{ 
          color: 'var(--text-secondary)',
          fontSize: '15px',
          lineHeight: 1.5,
          marginBottom: '32px',
          marginTop: '12px'
        }}>
          It looks like you've lost your internet connection or you refreshed the page while offline. Don't worry, the app is still working locally!
        </p>

        <Link 
          href="/dashboard" 
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            background: 'var(--primary)',
            color: 'white',
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
  );
}
