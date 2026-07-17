'use client';

import { useState, useEffect, useRef } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { useSession } from 'next-auth/react';
import { AlertTriangle, Search, Filter, Calendar, Minus, X, Package } from 'lucide-react';
import { formatCurrency } from '@/lib/constants';
import { useAlert } from '@/components/AlertModal';
import { addSyncTask } from '@/lib/offlineSync';
import { db } from '@/lib/db';
import Image from "next/image";
interface Batch {
  id: string;
  stock: number;
  expiryDate: string;
  batchNumber?: string | null;
  productId: string;
  product: {
    name: string;
    sku: string;
    barcode: string | null;
    price: number;
    costPrice: number | null;
    image?: string | null;
    category: { name: string } | null;
    unit?: string;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    uoms?: any[];
  };
}

export default function ExpiryTrackingPage() {
 
  const { showAlert, showConfirm, showToast } = useAlert();
  const { data: session } = useSession();
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [warningDays, setWarningDays] = useState(30);
  const [lockProductEdit, setLockProductEdit] = useState(false);

  // Review Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [reviewBatch, setReviewBatch] = useState<Batch | null>(null);
  const [newExpiryDate, setNewExpiryDate] = useState('');
  const [newBatchNumber, setNewBatchNumber] = useState('');
  const [disposeQty, setDisposeQty] = useState<number | string>(1);
  const [actionLoading, setActionLoading] = useState(false);

  const isAdmin = session?.user?.role?.toLowerCase() === 'admin';
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(event.target as Node)) {
        setIsFiltersOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch(`/api/settings`);
      if (res.ok) {
        const data = await res.json();
        if (data.expiryWarningDays) setWarningDays(data.expiryWarningDays);
        if (data.lockProductEdit !== undefined) setLockProductEdit(data.lockProductEdit);
      }
    } catch {
      try {
        const cached = await db.settings.get('current');
        if (cached?.data) {
          const raw = JSON.parse(cached.data);
          if (raw.expiryWarningDays) setWarningDays(raw.expiryWarningDays);
          if (raw.lockProductEdit !== undefined) setLockProductEdit(raw.lockProductEdit);
        }
      } catch {}
    }
  };

  const { data: swrRes } = useSWR('/api/batches', fetcher);

  useEffect(() => {
    const applyOfflineTasks = async () => {
      let baseBatches = [];
      if (swrRes && Array.isArray(swrRes)) {
        baseBatches = [...swrRes];
        try {
          localStorage.setItem('amroding_cached_batches', JSON.stringify(swrRes));
        } catch {}
      } else {
        try {
          const cached = localStorage.getItem('amroding_cached_batches');
          if (cached) baseBatches = JSON.parse(cached);
        } catch {}
      }
      let finalBatches: Batch[] = baseBatches;
      try {
        const pendingTasks = await db.syncQueue.where('syncStatus').anyOf(['pending', 'failed']).toArray();
        for (const task of pendingTasks) {
          if (task.type === 'batch' && task.action === 'UPDATE') {
            const p = JSON.parse(task.payload);
            finalBatches = finalBatches.map(b => b.id === p.id ? { ...b, ...p } : b);
          }
          if (task.type === 'stock' && task.action === 'CREATE') {
            const p = JSON.parse(task.payload);
            if (p.type === 'OUT' && p.forceBatchId) {
              finalBatches = finalBatches.map(b => b.id === p.forceBatchId ? { ...b, stock: Math.max(0, b.stock - p.quantity) } : b);
            }
          }
        }
      } catch (e) { console.warn('Failed to merge offline batch tasks', e); }
      setBatches(finalBatches);
      setLoading(false);
    };
    applyOfflineTasks();
  }, [swrRes]);

  const fetchBatches = async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const res = await fetch('/api/batches');
      if (!res.ok) throw new Error('Network response was not ok');
      const data = await res.json();
      setBatches(data);
      try {
        localStorage.setItem('amroding_cached_batches', JSON.stringify(data));
      } catch {}
    } catch (error: unknown) {
      if ((error as Error)?.message === 'Failed to fetch' || error instanceof TypeError) {
        try {
          const cached = localStorage.getItem('amroding_cached_batches');
          if (cached) setBatches(JSON.parse(cached));
        } catch {}
        return;
      }
      console.error('Failed to fetch batches', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
    fetchBatches();

    // Realtime Auto-Polling
    const interval = setInterval(() => {
      fetchBatches();
    }, 5000);
    return () => clearInterval(interval);
  }, []);


  const getDaysLeft = (dateString: string | null) => {
    if (!dateString) return 999;
    const expiry = new Date(dateString).getTime();
    const now = new Date().getTime();
    return Math.ceil((expiry - now) / (1000 * 3600 * 24));
  };

  const formatTimeLeft = (days: number) => {
    if (days < 0) return 'Expired';
    if (days === 0) return 'Expires Today';
    
    const years = Math.floor(days / 365);
    const months = Math.floor((days % 365) / 30);
    const remainingDays = (days % 365) % 30;

    const parts = [];
    if (years > 0) parts.push(`${years} year${years > 1 ? 's' : ''}`);
    if (months > 0) parts.push(`${months} month${months > 1 ? 's' : ''}`);
    if (remainingDays > 0 && years === 0) parts.push(`${remainingDays} day${remainingDays > 1 ? 's' : ''}`);

    return parts.length > 0 ? parts.join(', ') + (days > 0 ? ' left' : '') : '0 days left';
  };

  const getStatusBadge = (days: number) => {
    if (days < 0) return <span className="badge badge-danger">Expired</span>;
    if (days <= warningDays) return <span className="badge badge-warning">Expiring Soon</span>;
    return <span className="badge badge-success">Safe</span>;
  };

  const expiryData = batches.map(b => ({
    ...b,
    daysLeft: getDaysLeft(b.expiryDate)
  })).sort((a, b) => a.daysLeft - b.daysLeft);

  const categories = Array.from(new Set(expiryData.map(b => b.product?.category?.name).filter(Boolean))) as string[];

  const filteredData = expiryData.filter(item => {
    const matchesSearch = item.product.name.toLowerCase().includes(search.toLowerCase()) || item.product.sku.toLowerCase().includes(search.toLowerCase());
    
    let matchesStatus = true;
    if (statusFilter === 'expired') matchesStatus = item.daysLeft < 0;
    if (statusFilter === 'soon') matchesStatus = item.daysLeft >= 0 && item.daysLeft <= warningDays;
    if (statusFilter === 'safe') matchesStatus = item.daysLeft > warningDays;
    
    const matchesCategory = categoryFilter === 'all' || item.product?.category?.name === categoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  const expiredCount = expiryData.filter(i => i.daysLeft < 0).length;
  const soonCount = expiryData.filter(i => i.daysLeft >= 0 && i.daysLeft <= warningDays).length;
  // Estimated Loss Value uses costPrice if available, otherwise price
  const estLoss = expiryData.filter(i => i.daysLeft < 0).reduce((sum, i) => sum + (i.stock * (i.product.costPrice || i.product.price)), 0);

  const handleReview = (batch: Batch) => {
    setReviewBatch(batch);
    setNewExpiryDate(batch.expiryDate ? new Date(batch.expiryDate).toISOString().split('T')[0] : '');
    setNewBatchNumber(batch.batchNumber || '');
    setDisposeQty(batch.stock); // default to full amount
    setIsModalOpen(true);
  };

  const handleStockOut = async () => {
    if (!reviewBatch) return;
    const qtyToDispose = Number(disposeQty);
    if (qtyToDispose <= 0 || qtyToDispose > reviewBatch.stock) {
      showAlert('error', 'Action Failed', `Invalid quantity. Must be between 1 and ${reviewBatch.stock}.`);
      return;
    }
    if (!await showConfirm('Confirm', `Are you sure you want to discard ${qtyToDispose} ${reviewBatch.product.unit || 'pcs'} of ${reviewBatch.product.name}?`)) return;
    
    setActionLoading(true);
    try {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      let networkFailed = false;

      if (!isOffline) {
        try {
          const moveRes = await fetch('/api/stock/movement', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId: reviewBatch.productId,
              forceBatchId: reviewBatch.id,
              type: 'OUT',
              quantity: qtyToDispose,
              reason: 'Expired (Discarded)',
              source: 'EXPIRY_TRACKING',
              userId: session?.user?.id
            })
          });

          if (moveRes.ok) {
            setIsModalOpen(false);
            fetchBatches();
            return;
          } else {
            const err = await moveRes.json();
            showAlert('error', 'Action Failed', 'Error: ' + err.error);
            return;
          }
        } catch (fetchErr) {
          console.warn('Network error, falling back to offline mode', fetchErr);
          networkFailed = true;
        }
      }

      if (isOffline || networkFailed) {
        await addSyncTask('stock', 'CREATE', { productId: reviewBatch.productId, forceBatchId: reviewBatch.id, type: 'OUT', quantity: qtyToDispose, reason: 'Expired (Discarded)', source: 'EXPIRY_TRACKING', userId: session?.user?.id });
        setIsModalOpen(false);
        showToast('offline', 'Disposal queued offline — will sync when connected');
        setBatches(prev => prev.map(b => b.id === reviewBatch.id ? { ...b, stock: Math.max(0, b.stock - qtyToDispose) } : b));
      }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      showAlert('error', 'Action Failed', 'Failed to discard stock');
    } finally {
      setActionLoading(false);
    }
  };

  const handleUpdateDate = async () => {
    if (!reviewBatch) return;
    if (!newExpiryDate) {
      showAlert('error', 'Action Blocked', 'You cannot remove an expiry date from an active tracking batch. If this batch was added by mistake (Ghost Expiry), please go to Stock In/Out and Void the original log.');
      return;
    }
    setActionLoading(true);
    try {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      let networkFailed = false;

      if (!isOffline) {
        try {
          const res = await fetch(`/api/batches/${reviewBatch.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ expiryDate: newExpiryDate, batchNumber: newBatchNumber })
          });
          if (res.ok) {
            setIsModalOpen(false);
            fetchBatches();
            return;
          } else {
            const err = await res.json();
            showAlert('error', 'Action Failed', 'Error: ' + err.error);
            return;
          }
        } catch (fetchErr) {
          console.warn('Network error, falling back to offline mode', fetchErr);
          networkFailed = true;
        }
      }

      if (isOffline || networkFailed) {
        await addSyncTask('batch', 'UPDATE', { id: reviewBatch.id, expiryDate: newExpiryDate, batchNumber: newBatchNumber });
        setIsModalOpen(false);
        showToast('offline', 'Update queued offline — will sync when connected');
        setBatches(prev => prev.map(b => b.id === reviewBatch.id ? { ...b, expiryDate: newExpiryDate, batchNumber: newBatchNumber } : b));
      }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      showAlert('error', 'Action Failed', 'Failed to update date');
    } finally {
      setActionLoading(false);
    }
  };

  const handleDirectDispose = async (batch: Batch) => {
    if (batch.stock <= 0) {
      showAlert('error', 'Action Failed', "Stock is already 0.");
      return;
    }
    if (!await showConfirm('Confirm', `Are you sure you want to dispose ${batch.stock} ${batch.product.unit || 'pcs'} of ${batch.product.name}?`)) return;
    
    try {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      let networkFailed = false;

      if (!isOffline) {
        try {
          const moveRes = await fetch('/api/stock/movement', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              productId: batch.productId,
              forceBatchId: batch.id,
              type: 'OUT',
              quantity: batch.stock,
              reason: 'Expired (Discarded)',
              source: 'EXPIRY_TRACKING',
              userId: session?.user?.id
            })
          });

          if (moveRes.ok) {
            fetchBatches();
            return;
          } else {
            const err = await moveRes.json();
            showAlert('error', 'Action Failed', 'Error: ' + err.error);
            return;
          }
        } catch (fetchErr) {
          console.warn('Network error, falling back to offline mode', fetchErr);
          networkFailed = true;
        }
      }

      if (isOffline || networkFailed) {
        await addSyncTask('stock', 'CREATE', { productId: batch.productId, forceBatchId: batch.id, type: 'OUT', quantity: batch.stock, reason: 'Expired (Discarded)', source: 'EXPIRY_TRACKING', userId: session?.user?.id });
        showToast('offline', 'Disposal queued offline — will sync when connected');
        setBatches(prev => prev.map(b => b.id === batch.id ? { ...b, stock: 0 } : b));
      }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      showAlert('error', 'Action Failed', 'Failed to dispose stock');
    }
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Expiry Tracking</h1>
          <p className="page-subtitle">Monitor product expiration dates to minimize waste</p>
        </div>
        <div className="page-header-actions" style={{ display: 'flex', gap: '12px' }}>
        </div>
      </div>

      {loading ? (
        <div className="stats-grid-3">
          {[1,2,3].map(i => (
            <div key={i} className="stat-card">
              <div className="skeleton" style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', flexShrink: 0 }} />
              <div className="stat-info">
                <div className="skeleton" style={{ height: '12px', width: '80px', marginBottom: '8px' }} />
                <div className="skeleton" style={{ height: '24px', width: '100px', marginBottom: '6px' }} />
                <div className="skeleton" style={{ height: '10px', width: '70px' }} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="stats-grid-3">
          <div className="stat-card">
            <div className="stat-icon red"><AlertTriangle size={24} /></div>
            <div className="stat-info">
              <div className="stat-label">Expired Batches</div>
              <div className="stat-value">{expiredCount}</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon orange"><AlertTriangle size={24} /></div>
            <div className="stat-info">
              <div className="stat-label">Expiring in {warningDays} Days</div>
              <div className="stat-value">{soonCount}</div>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-info">
              <div className="stat-label">Estimated Loss Value</div>
              <div className="stat-value" style={{ color: 'var(--danger-dark)' }}>{formatCurrency(estLoss)}</div>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header filter-bar">
          <div className="search-bar" style={{ maxWidth: '300px' }}>
            <Search size={18} className="search-icon" />
            <input 
              id="expiry-search"
              name="search"
              aria-label="Search product or SKU"
              type="text" 
              className="form-input" 
              placeholder="Search product or SKU..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div ref={filterRef} className="filter-dropdown-container" style={{ position: 'relative' }}>
            <button 
              className="btn btn-outline filter-btn" 
              onClick={() => setIsFiltersOpen(!isFiltersOpen)}
              style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%', justifyContent: 'center' }}
            >
              <Filter size={18} /> Filters {(statusFilter !== 'all' || categoryFilter !== 'all') && <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--primary)' }}></span>}
            </button>
            {isFiltersOpen && (
              <div className="filter-dropdown-menu" style={{
                position: 'absolute', top: '100%', right: 0, marginTop: '8px', zIndex: 50,
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
                padding: '20px', boxShadow: 'var(--shadow-xl)', width: '300px', display: 'flex', flexDirection: 'column', gap: '12px',
                backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)'
              }}>
                <h4 style={{ margin: '0 0 4px 0', fontSize: '14px', fontWeight: 600 }}>Filter Expiry</h4>
                <div>
                  <label htmlFor="expiry-status-filter" className="form-label" style={{ fontSize: '12px', marginBottom: '4px' }}>Status</label>
                  <select 
                    id="expiry-status-filter"
                    name="statusFilter"
                    className="form-select"
                    value={statusFilter}
                    onChange={e => setStatusFilter(e.target.value)}
                  >
                    <option value="all">All Statuses</option>
                    <option value="safe">Safe (&gt; 30 days)</option>
                    <option value="soon">Expiring Soon</option>
                    <option value="expired">Expired</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="expiry-category-filter" className="form-label" style={{ fontSize: '12px', marginBottom: '4px' }}>Category</label>
                  <select 
                    id="expiry-category-filter"
                    name="categoryFilter"
                    className="form-select"
                    value={categoryFilter}
                    onChange={e => setCategoryFilter(e.target.value)}
                  >
                    <option value="all">All Categories</option>
                    {categories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="table-container">
          {loading ? (
             <div style={{ padding: '40px', textAlign: 'center' }}>Loading expiration data...</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Product Details</th>
                  <th>Batch No.</th>
                  <th>Category</th>
                  <th>Expiry Date</th>
                  <th style={{ paddingRight: '40px' }}>Days Left</th>
                  <th style={{ textAlign: 'right', paddingRight: '40px' }}>Batch Qty</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((item) => (
                  <tr key={item.id} style={{ background: item.daysLeft < 0 ? 'var(--danger-light)' : 'transparent' }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'flex-start', textAlign: 'left', width: '100%' }}>
                        <div style={{
                          width: '40px', height: '40px', borderRadius: 'var(--radius-md)',
                          background: 'var(--bg-main)', border: '1px solid var(--border)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'
                        }}>
                          {item.product.image ? (
                            <Image width={400} height={400} src={item.product.image} alt={item.product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}  />
                          ) : (
                            <Package size={20} color="var(--text-tertiary)" />
                          )}
                        </div>
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{item.product.name}</div>
                          <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)' }}>{item.product.sku}</div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Batch No.">
                      <span className="badge badge-neutral" style={{ fontFamily: 'monospace' }}>
                        {item.batchNumber || 'N/A'}
                      </span>
                    </td>
                    <td data-label="Category">{item.product.category?.name || '-'}</td>
                    <td data-label="Expiry Date" style={{ fontWeight: 500 }}>
                      {item.expiryDate ? new Date(item.expiryDate).toLocaleDateString() : 'N/A'}
                    </td>
                    <td data-label="Days Left">
                      <span style={{ 
                        fontWeight: 'bold', 
                        color: item.daysLeft < 0 ? 'var(--danger-dark)' : item.daysLeft <= 30 ? 'var(--warning-dark)' : 'inherit'
                      }}>
                        {formatTimeLeft(item.daysLeft)}
                      </span>
                    </td>
                    <td data-label="Batch Qty" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        {/* Primary Base Stock */}
                        <div style={{ 
                          fontWeight: 700, 
                          fontSize: '15px',
                          color: 'var(--text-primary)'
                        }}>
                          {item.stock} <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-tertiary)' }}>{item.product.unit || 'Base'}(s)</span>
                        </div>
                        
                        {/* Secondary Bulk Stock Estimation */}
                        {item.product.uoms && item.product.uoms.length > 0 && item.stock > 0 && (() => {
 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
                          const sortedUoms = [...item.product.uoms].sort((a: any, b: any) => b.multiplier - a.multiplier);
                          let remaining = item.stock;
                          const parts = [];
                          for (const uom of sortedUoms) {
                            const qty = Math.floor(remaining / uom.multiplier);
                            if (qty > 0) {
                              parts.push(`${qty} ${uom.name}(s)`);
                              remaining %= uom.multiplier;
                            }
                          }
                          if (parts.length > 0) {
                            return (
                              <div style={{ fontSize: '11px', color: 'var(--text-secondary)', background: 'var(--bg-hover)', padding: '2px 6px', borderRadius: '4px', fontWeight: 500 }}>
                                ≈ {parts.join(' + ')}
                              </div>
                            );
                          }
                          return null;
                        })()}
                      </div>
                    </td>
                    <td data-label="Status">{getStatusBadge(item.daysLeft)}</td>
                    <td data-label="Actions" style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                      {(!lockProductEdit || isAdmin) && (
                        <>
                          {item.daysLeft < 0 && (
                            <button 
                              className="btn btn-sm btn-danger"
                              style={{ marginRight: '8px' }}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
                              onClick={() => handleDirectDispose(item as any)}
                            >
                              Dispose / Stock Out
                            </button>
                          )}
                          <button 
                            className="btn btn-sm btn-outline"
// eslint-disable-next-line @typescript-eslint/no-explicit-any
                            onClick={() => handleReview(item as any)}
                          >
                            Review
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredData.length === 0 && (
                  <tr><td colSpan={8} style={{textAlign: 'center', padding: '20px'}}>No expiring products found.</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Review Action Modal */}
      {isModalOpen && reviewBatch && (
        <div className="modal-overlay">
          <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: '400px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Review Batch Expiry</h2>
              <button className="btn btn-icon btn-ghost" onClick={() => setIsModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            
            <div className="modal-body" style={{ padding: '16px', maxHeight: '80vh', overflowY: 'auto' }}>
              <div style={{ marginBottom: '12px', padding: '12px', background: 'var(--bg-main)', borderRadius: 'var(--radius-md)' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '4px' }}>{reviewBatch.product.name}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '8px' }}>SKU: {reviewBatch.product.sku}</p>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 600 }}>
                  <span>Batch Qty: {reviewBatch.stock} {reviewBatch.product.unit || 'pcs'}</span>
                  <span>Time Left: {formatTimeLeft(getDaysLeft(reviewBatch.expiryDate))}</span>
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: '12px' }}>
                <div className="form-label">Update Batch Details</div>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input 
                    id="expiry-batch-number"
                    name="newBatchNumber"
                    aria-label="New Batch Number"
                    type="text" 
                    className="form-input" 
                    value={newBatchNumber}
                    onChange={e => setNewBatchNumber(e.target.value)}
                    placeholder="Batch Number"
                    style={{ flex: 1 }}
                  />
                  <input 
                    id="expiry-date"
                    name="newExpiryDate"
                    aria-label="New Expiry Date"
                    type="date" 
                    className="form-input" 
                    value={newExpiryDate}
                    onChange={e => setNewExpiryDate(e.target.value)}
                    style={{ flex: 1 }}
                  />
                </div>
                <button 
                  className="btn btn-secondary" 
                  onClick={handleUpdateDate}
                  disabled={actionLoading || (newExpiryDate === (reviewBatch.expiryDate ? new Date(reviewBatch.expiryDate).toISOString().split('T')[0] : '') && newBatchNumber === (reviewBatch.batchNumber || ''))}
                  style={{ width: '100%' }}
                >
                  <Calendar size={16} style={{ marginRight: '6px' }}/> Save Batch Details
                </button>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '12px' }}>
                <span style={{ height: '1px', background: 'var(--border)', flex: 1 }}></span>
                <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-sm)', fontWeight: 600 }}>OR</span>
                <span style={{ height: '1px', background: 'var(--border)', flex: 1 }}></span>
              </div>

              <div className="form-group" style={{ marginBottom: '12px' }}>
                <label htmlFor="expiry-dispose-qty" className="form-label">Partial or Full Disposal</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input 
                    id="expiry-dispose-qty"
                    name="disposeQty"
                    type="number" 
                    className="form-input" 
                    value={disposeQty}
                    min={1}
                    max={reviewBatch.stock}
                    onChange={(e) => {
                      let val = e.target.value;
                      if (val.length > 1 && val.startsWith('0')) {
                        val = val.replace(/^0+/, '');
                        if (val === '') val = '0';
                      }
                      setDisposeQty(val);
                    }}
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontWeight: 600 }}>{reviewBatch.product.unit || 'pcs'}</span>
                </div>
              </div>

              <button 
                className="btn btn-danger" 
                style={{ width: '100%', padding: '12px' }}
                onClick={handleStockOut}
                disabled={actionLoading || reviewBatch.stock <= 0 || Number(disposeQty) <= 0 || Number(disposeQty) > reviewBatch.stock}
              >
                <Minus size={18} style={{ marginRight: '8px' }}/>
                Discard {disposeQty || 0} {reviewBatch.product.unit || 'pcs'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
