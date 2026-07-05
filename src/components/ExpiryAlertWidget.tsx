'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Clock } from 'lucide-react';

interface Batch {
  id: string;
  stock: number;
  expiryDate: string;
  product: {
    name: string;
    unit: string;
  };
}

export default function ExpiryAlertWidget() {
  const router = useRouter();
  const [expiringBatches, setExpiringBatches] = useState<Batch[]>([]);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [warningDays, setWarningDays] = useState(30);
  const [loading, setLoading] = useState(true);

  const fetchSettingsAndBatches = async () => {
    try {
      // Fetch settings for threshold
      const setRes = await fetch('/api/settings');
      let threshold = 30;
      if (setRes.ok) {
        const setData = await setRes.json();
        if (setData.expiryWarningDays) threshold = setData.expiryWarningDays;
        setWarningDays(threshold);
      }

      // Fetch batches
      const batchRes = await fetch('/api/batches');
      if (batchRes.ok) {
        const batches = await batchRes.json();
        
        // Calculate days left
        const today = new Date();
        const nowUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
        
// eslint-disable-next-line @typescript-eslint/no-explicit-any
        const expiring = batches.filter((b: any) => {
          if (!b.expiryDate) return false;
          const expiry = new Date(b.expiryDate);
          if (isNaN(expiry.getTime())) return false;
          const expiryUtc = Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate());
          const daysLeft = Math.ceil((expiryUtc - nowUtc) / (1000 * 3600 * 24));
          // include expired and expiring soon
          return daysLeft <= threshold;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
        }).map((b: any) => {
          const expiry = new Date(b.expiryDate);
          const expiryUtc = Date.UTC(expiry.getUTCFullYear(), expiry.getUTCMonth(), expiry.getUTCDate());
          const daysLeft = Math.ceil((expiryUtc - nowUtc) / (1000 * 3600 * 24));
          return { ...b, daysLeft };
 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
        }).sort((a: any, b: any) => a.daysLeft - b.daysLeft);

        setExpiringBatches(expiring);
      }
    } catch (e) {
      if (e instanceof TypeError && (e as Error).message.includes('fetch')) return;
      console.error('Failed to fetch expiry alerts', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettingsAndBatches();
    const interval = setInterval(() => {
      fetchSettingsAndBatches();
    }, 15000); // Poll every 15 seconds

    return () => clearInterval(interval);
  }, []);


  if (loading) return null;
  if (expiringBatches.length === 0) return null; // Only show if there's an alert

  return (
    <div className="card" style={{ border: '1px solid var(--warning-light)', background: 'rgba(245, 158, 11, 0.05)' }}>
      <div className="card-header" style={{ borderBottom: '1px solid var(--warning-light)' }}>
        <h3 className="card-title" style={{ color: 'var(--warning-dark)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <AlertCircle size={20} />
          Expiry Alerts
        </h3>
        <button onClick={() => router.push('/inventory/expiry')} className="btn btn-outline" style={{ fontSize: '12px', padding: '4px 8px' }}>
          View Details
        </button>
      </div>
      <div className="alert-list">
{/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
        {expiringBatches.slice(0, 5).map((batch: any) => (
          <div key={batch.id} className={`alert-item ${batch.daysLeft < 0 ? 'danger' : 'warning'}`}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: 'var(--font-base)' }}>{batch.product.name}</div>
              <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-secondary)' }}>
                {batch.stock} {batch.product.unit || 'pcs'}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontWeight: 700, color: batch.daysLeft < 0 ? 'var(--danger)' : 'var(--warning)', fontSize: 'var(--font-sm)', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                <Clock size={14} />
                {batch.daysLeft < 0 ? 'Expired' : `${batch.daysLeft} days left`}
              </div>
              <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)' }}>
                {new Date(batch.expiryDate).toLocaleDateString()}
              </div>
            </div>
          </div>
        ))}
        {expiringBatches.length > 5 && (
          <div style={{ textAlign: 'center', padding: '12px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            + {expiringBatches.length - 5} more items expiring soon
          </div>
        )}
      </div>
    </div>
  );
}
