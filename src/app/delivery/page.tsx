'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { Truck, MapPin, Calendar, Search, X, Filter, CheckCircle2, Clock, Image as Phone } from 'lucide-react';
import { useAlert } from '@/components/AlertModal';
import { useDebounce } from '@/hooks/useDebounce';
import { addSyncTask } from '@/lib/offlineSync';
import { db } from '@/lib/db';
import { useSession } from 'next-auth/react';

interface Delivery {
  id: string;
  order: {
    orderNumber: string;
    customer: { name: string; address: string };
  };
  driverId?: string | null;
  driverName: string | null;
  driverPhone: string | null;
  scheduledDate: string | null;
  status: string;
  proofPhoto: string | null;
}

interface Driver {
  id: string;
  name: string;
  phone: string | null;
  status: string;
  vehicleInfo: string | null;
}

export default function DeliveryPage() {
 
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { showAlert, showConfirm, showToast } = useAlert();
  const { data: session } = useSession();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  const [page, setPage] = useState(1);
  const [totalDeliveries, setTotalDeliveries] = useState(0);
  const limit = 50;

  const [selectedDelivery, setSelectedDelivery] = useState<Delivery | null>(null);
  const [formData, setFormData] = useState({ driverId: '', driverName: '', driverPhone: '', status: '', proofPhoto: '' });
  const [actionLoading, setActionLoading] = useState(false);

  async function fetchDrivers() {
    try {
      const res = await fetch('/api/drivers');
      const data = await res.json();
      if (Array.isArray(data)) setDrivers(data);
      else setDrivers([]);
    } catch (e) { console.error(e); }
  }

  const getQueryString = () => {
    const params = new URLSearchParams();
    if (statusFilter) params.append('status', statusFilter);
    if (startDate) params.append('startDate', startDate);
    if (endDate) params.append('endDate', endDate);
    if (debouncedSearch) params.append('search', debouncedSearch);
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    return params.toString();
  };

  const { data: swrRes, error: swrError } = useSWR(
    session ? `/api/delivery?${getQueryString()}` : null,
    async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      return { data, totalCount: parseInt(res.headers.get('X-Total-Count') || '0', 10) };
    },
    { refreshInterval: 30000 }
  );

  // Skeleton timeout + syncQueue merge for deliveries
  useEffect(() => {
    if (!swrRes && !swrError) {
      const t = setTimeout(() => setLoading(false), 2000);
      return () => clearTimeout(t);
    }

    const applyOfflineTasks = async () => {
      try {
        const pendingTasks = await db.syncQueue
          .where('type').equals('delivery')
          .and(t => t.syncStatus === 'pending' || t.syncStatus === 'failed')
          .toArray();

        let modifiedDeliveries = swrRes?.data && Array.isArray(swrRes.data) ? [...swrRes.data] : [];

        for (const task of pendingTasks) {
          try {
            const payload = JSON.parse(task.payload);
            if (task.action === 'UPDATE') {
              modifiedDeliveries = modifiedDeliveries.map(d => d.id === payload.id ? { ...d, ...payload } : d);
            }
          } catch (e) {}
        }

        setDeliveries(modifiedDeliveries);
        setTotalDeliveries(swrRes?.totalCount || modifiedDeliveries.length);
      } catch (err) {
        console.error(err);
        if (swrRes?.data && Array.isArray(swrRes.data)) setDeliveries(swrRes.data);
      } finally {
        setLoading(false);
      }
    };

    if (swrRes || swrError) {
      applyOfflineTasks();
    }
  }, [swrRes, swrError]);

  async function fetchDeliveries() {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const res = await fetch(`/api/delivery?${getQueryString()}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setDeliveries(data);
        const totalCount = res.headers.get('X-Total-Count');
        if (totalCount) setTotalDeliveries(parseInt(totalCount, 10));
      }
      else {
        setDeliveries([]);
        setTotalDeliveries(0);
      }
    } catch (error) {
      console.error('Failed to fetch deliveries', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedDelivery) return;
    setActionLoading(true);

    try {
      const payload = {
        ...formData,
        deliveredAt: formData.status === 'delivered' ? new Date().toISOString() : undefined
      };

      let isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      let networkFailed = false;

      if (!isOffline) {
        try {
          const res = await fetch(`/api/delivery/${selectedDelivery.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (res.ok) {
            setSelectedDelivery(null);
            if (typeof navigator !== 'undefined' && navigator.onLine) fetchDeliveries();
            if (formData.status === 'failed' || formData.status === 'cancelled') {
              showAlert('warning', 'Action Required: Return Stock', 'The delivery is marked as failed, but the stock is still technically reserved. Once the driver physically returns the items to the warehouse, you must go to the Orders page and manually Cancel the order to release the stock back into available inventory.');
            } else {
              showAlert('success', 'Status Updated', 'Delivery status successfully updated.');
            }
            return;
          } else {
            showAlert('error', 'Action Failed', 'Failed to update delivery');
            return;
          }
        } catch (fetchErr) {
          console.warn('Network error, falling back to offline', fetchErr);
          networkFailed = true;
        }
      }

      if (isOffline || networkFailed) {
        await addSyncTask('delivery', 'UPDATE', { ...payload, id: selectedDelivery.id });
        showToast('offline', 'Delivery update queued offline — will sync when connected');
        // Optimistic update
        setDeliveries(prev => prev.map(d => d.id === selectedDelivery.id ? { ...d, ...payload } : d));
        setSelectedDelivery(null);
        return;
      }
    } catch (error) {
      console.error(error);
      showAlert('error', 'Action Failed', 'Error updating delivery');
    } finally {
      setActionLoading(false);
    }
  }

  // Close filter dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (isFilterOpen && !(e.target as Element).closest('.filter-dropdown-container')) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFilterOpen]);

  useEffect(() => {
    fetchDeliveries();
    fetchDrivers();
    const interval = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        fetchDeliveries();
      }
    }, 60000);
    
    return () => clearInterval(interval);
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, statusFilter, startDate, endDate, page]);

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'badge-warning', in_transit: 'badge-primary', delivered: 'badge-success', failed: 'badge-danger',
    };
    return map[status] || 'badge-neutral';
  };

  const getStatusText = (status: string) => {
    return status.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  const openModal = (delivery: Delivery) => {
    setSelectedDelivery(delivery);
    setFormData({
      driverId: delivery.driverId || '',
      driverName: delivery.driverName || '',
      driverPhone: delivery.driverPhone || '',
      status: delivery.status,
      proofPhoto: delivery.proofPhoto || ''
    });
  };

  const handleDriverSelect = (driverId: string) => {
    const driver = drivers.find(d => d.id === driverId);
    setFormData({
      ...formData,
      driverId: driverId,
      driverName: driver?.name || '',
      driverPhone: driver?.phone || formData.driverPhone
    });
  };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData({ ...formData, proofPhoto: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const formatCount = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
  };

  const completedDeliveries = deliveries.filter(d => d.status === 'delivered').length;
  const inTransitDeliveries = deliveries.filter(d => d.status === 'in_transit' || d.status === 'pending').length;

  let contextLabel = 'All Deliveries';
  if (search) contextLabel = `Search: ${search}`;
  else if (statusFilter || startDate || endDate) contextLabel = [statusFilter, startDate, endDate].filter(Boolean).join(' | ');

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Delivery Monitoring</h1>
          <p className="page-subtitle">Track and manage outgoing deliveries</p>
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
          <div className="stat-icon blue"><Truck size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Total Deliveries</div>
            <div className="stat-value">{formatCount(totalDeliveries)}</div>
            <div className="stat-change" style={{ color: 'var(--text-tertiary)', background: 'transparent', padding: 0, fontWeight: 500, marginTop: '4px' }}>{contextLabel}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><CheckCircle2 size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Completed</div>
            <div className="stat-value">{formatCount(completedDeliveries)}</div>
            <div className="stat-change" style={{ color: 'var(--text-tertiary)', background: 'transparent', padding: 0, fontWeight: 500, marginTop: '4px' }}>{contextLabel}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><Clock size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">In Transit / Pending</div>
            <div className="stat-value">{formatCount(inTransitDeliveries)}</div>
            <div className="stat-change" style={{ color: 'var(--text-tertiary)', background: 'transparent', padding: 0, fontWeight: 500, marginTop: '4px' }}>{contextLabel}</div>
          </div>
        </div>
      </div>
      )}

      <div className="card">
        <div className="card-header filter-bar" style={{ paddingTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="search-bar" style={{ flex: 1, minWidth: '280px', maxWidth: '400px' }}>
            <Search size={18} className="search-icon" />
            <input
              id="search-deliveries" name="search" type="text" className="form-input" placeholder="Search by order or driver..."
              aria-label="Search deliveries" value={search} onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="filter-dropdown-container" style={{ position: 'relative' }}>
            <button 
              onClick={() => setIsFilterOpen(!isFilterOpen)} 
              className="btn btn-outline filter-btn" 
              style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
            >
              <Filter size={18} />
              Filter { (statusFilter !== '' || startDate !== '' || endDate !== '') && <span style={{ width: '8px', height: '8px', background: 'var(--primary)', borderRadius: '50%' }}></span> }
            </button>

            {isFilterOpen && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: '8px', zIndex: 50,
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                padding: '16px', boxShadow: 'var(--shadow-lg)', width: '280px'
              }}>
                <h4 style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 600 }}>Filter Deliveries</h4>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label htmlFor="filter-status" className="form-label" style={{ fontSize: '12px' }}>Status</label>
                  <select id="filter-status" name="status" className="form-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="in_transit">In Transit</option>
                    <option value="delivered">Delivered</option>
                    <option value="failed">Failed</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label htmlFor="filter-start-date" className="form-label" style={{ fontSize: '12px' }}>From Date</label>
                  <input id="filter-start-date" name="startDate" type="date" className="form-input" value={startDate} onChange={e => setStartDate(e.target.value)} />
                </div>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label htmlFor="filter-end-date" className="form-label" style={{ fontSize: '12px' }}>To Date</label>
                  <input id="filter-end-date" name="endDate" type="date" className="form-input" value={endDate} onChange={e => setEndDate(e.target.value)} />
                </div>

                <button
                  className="btn btn-outline"
                  style={{ width: '100%' }}
                  onClick={() => { setStatusFilter(''); setStartDate(''); setEndDate(''); setIsFilterOpen(false); }}
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Order Ref</th>
                <th>Customer & Destination</th>
                <th>Driver</th>
                <th>Schedule</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(5).fill(0).map((_, idx) => (
                  <tr key={idx}>
                    <td><div className="skeleton" style={{ height: '20px', width: '70%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '80%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '60%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '50%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '50%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '40%' }} /></td>
                  </tr>
                ))
              ) : deliveries.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                    No deliveries found.
                  </td>
                </tr>
              ) : (
                deliveries.map((delivery) => (
                  <tr key={delivery.id}>
                    <td data-label="Order Ref">
                      <div style={{ fontWeight: 600, color: 'var(--primary)' }}>
                        {delivery.order?.orderNumber}
                      </div>
                    </td>
                    <td data-label="Customer & Destination">
                      <div className="responsive-cell-stack">
                        <div style={{ fontWeight: 500 }}>{delivery.order?.customer?.name}</div>
                        <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                          <MapPin size={12} />
                          {delivery.order?.customer?.address || 'No address provided'}
                        </div>
                      </div>
                    </td>
                    <td data-label="Driver">
                      <div className="responsive-cell-stack" style={{ gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
                          <Truck size={14} color="var(--text-tertiary)" />
                          {delivery.driverName ? delivery.driverName : <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>Unassigned</span>}
                        </div>
                        {delivery.driverName && drivers.find(d => d.name === delivery.driverName) && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: 'var(--text-tertiary)' }}>
                            {drivers.find(d => d.name === delivery.driverName)?.phone && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <Phone size={12} /> {drivers.find(d => d.name === delivery.driverName)?.phone}
                              </span>
                            )}
                            {drivers.find(d => d.name === delivery.driverName)?.vehicleInfo && (
                              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                • {drivers.find(d => d.name === delivery.driverName)?.vehicleInfo}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td data-label="Schedule">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: delivery.scheduledDate ? 'inherit' : 'var(--text-tertiary)' }}>
                        <Calendar size={16} />
                        {delivery.scheduledDate
                          ? new Date(delivery.scheduledDate).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })
                          : 'Not scheduled'
                        }
                      </div>
                    </td>
                    <td data-label="Status">
                      <span className={`badge ${statusBadge(delivery.status)}`}>
                        {getStatusText(delivery.status)}
                      </span>
                    </td>
                    <td data-label="Actions">
                      <button
                        onClick={() => openModal(delivery)}
                        className="btn btn-outline"
                        style={{ padding: '6px 12px', fontSize: 'var(--font-xs)' }}
                      >
                        Update
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalDeliveries > limit && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span style={{ fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>Page {page} of {Math.ceil(totalDeliveries / limit)}</span>
            <button className="btn btn-secondary" disabled={page >= Math.ceil(totalDeliveries / limit)} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        )}
      </div>

      {/* Update Delivery Modal */}
      {selectedDelivery && (
        <div className="modal-overlay">
          <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Update Delivery</h2>
              <button className="btn btn-icon btn-ghost" onClick={() => setSelectedDelivery(null)}><X size={20} /></button>
            </div>
            <div style={{ padding: '0 var(--space-lg)', paddingTop: 'var(--space-sm)' }}>
              <p style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>
                Order {selectedDelivery.order?.orderNumber} — {selectedDelivery.order?.customer?.name}
              </p>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                {selectedDelivery.status === 'cancelled' ? (
                  <div style={{ padding: '16px', background: 'var(--danger-light)', border: '1px solid var(--danger)', borderRadius: 'var(--radius-md)', color: 'var(--danger-dark)', marginTop: '16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, marginBottom: '4px' }}>
                      <X size={18} />
                      This order has been cancelled
                    </div>
                    <p style={{ fontSize: '14px', margin: 0 }}>Cancelled orders cannot be modified. Stock has already been restored. Create a new order instead.</p>
                  </div>
                ) : (
                  <>
                    <div className="form-group">
                      <label htmlFor="update-driver" className="form-label">Driver</label>
                      <select id="update-driver" name="driverId" className="form-select" value={formData.driverId} onChange={e => handleDriverSelect(e.target.value)}>
                        <option value="">-- Select a Driver --</option>
                        {drivers.filter(d => d.status === 'active' || d.id === formData.driverId).map(d => (
                          <option key={d.id} value={d.id}>{d.name}</option>
                        ))}
                      </select>
                    </div>
                    {formData.driverId && drivers.find(d => d.id === formData.driverId) && (
                      <div className="form-group" style={{ background: 'var(--bg-main)', padding: '16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                        <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-tertiary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Driver Details</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                            <Phone size={16} />
                            {drivers.find(d => d.id === formData.driverId)?.phone || <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No phone number on file</span>}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: 'var(--text-secondary)' }}>
                            <Truck size={16} />
                            {drivers.find(d => d.id === formData.driverId)?.vehicleInfo || <span style={{ color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No vehicle info on file</span>}
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="form-group">
                      <label htmlFor="update-status" className="form-label">Status</label>
                      <select id="update-status" name="status" className="form-select" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                        <option value="pending">Pending</option>
                        <option value="in_transit">In Transit</option>
                        <option value="delivered">Delivered</option>
                        <option value="failed">Failed</option>
                      </select>
                    </div>
                  </>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setSelectedDelivery(null)}>
                  {selectedDelivery.status === 'cancelled' ? 'Close' : 'Cancel'}
                </button>
                {selectedDelivery.status !== 'cancelled' && (
                  <button type="submit" disabled={actionLoading} className="btn btn-primary">
                    {actionLoading ? 'Saving...' : 'Save Changes'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
