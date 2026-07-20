'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { useSession } from 'next-auth/react';
import { Plus, Search, Edit, Trash2, X, Save, Truck,  User, Users, CheckCircle2, List, FileText } from 'lucide-react';
import { useAlert } from '@/components/AlertModal';
import { addSyncTask } from '@/lib/offlineSync';
import { db } from '@/lib/db';

interface Driver {
  id: string;
  name: string;
  phone: string | null;
  vehicleInfo: string | null;
  status: string;
  createdAt?: string;
  _count?: {
    deliveries: number;
  };
}

export default function DriversPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role?.toLowerCase() === 'admin';
 
  const { showAlert, showConfirm, showToast } = useAlert();
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [isOnline, setIsOnline] = useState(typeof window !== 'undefined' ? navigator.onLine : true);
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDriver, setEditingDriver] = useState<Driver | null>(null);
  const [formData, setFormData] = useState({ name: '', phone: '', vehicleInfo: '', status: 'active' });
  const [isSaving, setIsSaving] = useState(false);

  const [activeTab, setActiveTab] = useState<'PROFILE' | 'TRANSACTIONS'>('PROFILE');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [driverTransactions, setDriverTransactions] = useState<any[]>([]);
  const [loadingTransactions, setLoadingTransactions] = useState(false);

  const fetchTransactions = async (driverId: string) => {
    setLoadingTransactions(true);
    setDriverTransactions([]);
    try {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      if (isOffline) {
        // Show pending offline deliveries from syncQueue
        setDriverTransactions([]);
        return;
      }
      const res = await fetch(`/api/drivers/${driverId}/deliveries`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setDriverTransactions(data);
    } catch (error) {
      console.error('Failed to fetch transactions', error);
      // Don't show hard error modal offline — just show empty list
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      if (!isOffline) showToast('offline', 'Could not load transactions. You appear to be offline.');
    } finally {
      setLoadingTransactions(false);
    }
  };

  const { data: swrRes, error: swrError } = useSWR(session ? '/api/drivers' : null, fetcher, { refreshInterval: 15000 });

  // Stop skeleton after 2s if offline with no cache
  useEffect(() => {
    if (!swrRes && !swrError) {
      const t = setTimeout(() => setLoading(false), 2000);
      return () => clearTimeout(t);
    }

    const applyOfflineTasks = async () => {
      try {
        const pendingTasks = await db.syncQueue
          .where('type')
          .equals('driver')
          .and(t => t.syncStatus === 'pending' || t.syncStatus === 'failed')
          .toArray();

        let baseDrivers: Driver[] = [];
        if (Array.isArray(swrRes)) {
          baseDrivers = [...swrRes];
        } else {
          try {
            const cached = await db.drivers.toArray();
            baseDrivers = cached.map(d => ({
              id: d.id,
              name: d.name,
              phone: d.phone,
              status: d.status,
              vehicleInfo: d.vehicleInfo,
              _count: { deliveries: 0 }
            }));
          } catch (dexieErr) {
            console.error('Failed to load drivers from Dexie', dexieErr);
          }
        }

        let modifiedDrivers = [...baseDrivers];

        for (const task of pendingTasks) {
          try {
            const payload = JSON.parse(task.payload);
            if (task.action === 'DELETE') {
              modifiedDrivers = modifiedDrivers.filter(d => d.id !== payload.id);
            } else if (task.action === 'UPDATE') {
              modifiedDrivers = modifiedDrivers.map(d => d.id === payload.id ? { ...d, ...payload } : d);
            } else if (task.action === 'CREATE') {
              if (!modifiedDrivers.find(d => d.id === payload.id)) {
                modifiedDrivers.unshift(payload as unknown as Driver);
              }
            }
          } catch {}
        }
        
        setDrivers(modifiedDrivers);
      } catch (err) {
        console.error('Failed to apply offline tasks', err);
        if (swrRes) setDrivers(Array.isArray(swrRes) ? swrRes : []);
      } finally {
        setLoading(false);
      }
    };

    if (swrRes || swrError) {
      applyOfflineTasks();
    }
  }, [swrRes, swrError]);

  const fetchDrivers = async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const res = await fetch('/api/drivers');
      if (!res.ok) throw new Error('Failed to fetch drivers');
      const data = await res.json();
      if (Array.isArray(data)) {
        setDrivers(data);
      } else {
        setDrivers([]);
      }
    } catch (error) {
      console.error('Failed to fetch drivers, using cache fallback', error);
      try {
        const cached = await db.drivers.toArray();
        setDrivers(cached.map(d => ({
          id: d.id,
          name: d.name,
          phone: d.phone,
          status: d.status,
          vehicleInfo: d.vehicleInfo,
          _count: { deliveries: 0 }
        })) as unknown as Driver[]);
      } catch (dexieErr) {
        console.error('Failed to load drivers from Dexie', dexieErr);
      }
    } finally {
      setLoading(false);
    }
  };




  const filteredDrivers = drivers.filter(d => {
    const matchesSearch = d.name.toLowerCase().includes(search.toLowerCase()) ||
      (d.phone || '').toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || d.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const openModal = (driver?: Driver) => {
    if (driver) {
      setEditingDriver(driver);
      setFormData({
        name: driver.name,
        phone: driver.phone || '',
        vehicleInfo: driver.vehicleInfo || '',
        status: driver.status
      });
      setActiveTab('PROFILE');
      fetchTransactions(driver.id);
    } else {
      setEditingDriver(null);
      setFormData({ name: '', phone: '', vehicleInfo: '', status: 'active' });
      setActiveTab('PROFILE');
    }
    setIsModalOpen(true);
  };

  const closeModal = () => { setIsModalOpen(false); setEditingDriver(null); };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      let networkFailed = false;

      if (!isOffline) {
        try {
          const method = editingDriver ? 'PUT' : 'POST';
          const url = editingDriver ? `/api/drivers/${editingDriver.id}` : '/api/drivers';
          const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
          });
          if (!res.ok) {
            const err = await res.json();
            showAlert('error', 'Action Failed', err.error || 'Failed to save');
            return;
          }
          await fetchDrivers();
          closeModal();
          return;
        } catch (fetchErr) {
          console.warn('Network error detected, falling back to offline mode', fetchErr);
          networkFailed = true;
        }
      }

      if (isOffline || networkFailed) {
        const action = editingDriver ? 'UPDATE' : 'CREATE';
        const payload = {
          ...formData,
          id: editingDriver?.id || `OFF-${Date.now()}`
        };
        await addSyncTask('driver', action, payload);
        showToast('offline', 'Action queued offline — will sync when connected');
        
        try {
          await db.drivers.put({
            id: payload.id,
            name: payload.name || '',
            phone: payload.phone || null,
            status: payload.status || 'active',
            vehicleInfo: payload.vehicleInfo || null,
            lastSynced: Date.now()
          });
        } catch (dexieErr) {
          console.error('Failed to update driver cache offline', dexieErr);
        }

        closeModal();
        if (editingDriver) {
          setDrivers(prev => prev.map(d => d.id === payload.id ? { ...d, ...payload } as unknown as Driver : d));
        } else {
          setDrivers(prev => [{ ...payload, createdAt: new Date().toISOString() } as unknown as Driver, ...prev]);
        }
        setIsSaving(false);
        return;
      }
    } catch (error) {
      console.error('Save error', error);
      showAlert('error', 'Action Failed', 'An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!await showConfirm('Confirm', `Are you sure you want to delete ${name}?`)) return;
    try {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      let networkFailed = false;

      if (!isOffline) {
        try {
          const res = await fetch(`/api/drivers/${id}`, { method: 'DELETE' });
          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}));
            throw new Error(errorData.error || 'Failed to delete');
          }
          await fetchDrivers();
          return;
        } catch (fetchErr: unknown) {
          if (fetchErr instanceof Error && fetchErr.message !== 'Failed to fetch') {
            throw fetchErr; // Re-throw legitimate API errors caught above
          }
          console.warn('Network error detected, falling back to offline mode', fetchErr);
          networkFailed = true;
        }
      }

      if (isOffline || networkFailed) {
        await addSyncTask('driver', 'DELETE', { id });
        showToast('offline', 'Action queued offline — will sync when connected');
        try {
          await db.drivers.delete(id);
        } catch {}
        setDrivers(prev => prev.filter(d => d.id !== id));
        return;
      }
    } catch (error: unknown) {
      showAlert('error', 'Action Failed', (error as Error).message);
    }
  };

  const formatCount = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
  };

  const totalDrivers = filteredDrivers.length;
  const activeDrivers = filteredDrivers.filter(d => d.status === 'active').length;

  let contextLabel = 'All Drivers';
  if (search) contextLabel = `Search: ${search}`;
  else if (statusFilter !== 'all') contextLabel = `Status: ${statusFilter}`;

  return (
    <>
      <div className="page-header mobile-col">
        <div>
          <h1 className="page-title">Delivery Men</h1>
          <p className="page-subtitle">Manage your delivery drivers and their assignments</p>
        </div>
        <div className="page-header-actions mobile-full-width">
          <button className="btn btn-primary mobile-full-width" onClick={() => openModal()} style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={18} /> Add Driver
          </button>
        </div>
      </div>

      {loading ? (
        <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
          {[1,2].map(i => (
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
      <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
        <div className="stat-card">
          <div className="stat-icon blue"><Users size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Total Drivers</div>
            <div className="stat-value">{formatCount(totalDrivers)}</div>
            <div className="stat-change" style={{ color: 'var(--text-tertiary)', background: 'transparent', padding: 0, fontWeight: 500, marginTop: '4px' }}>{contextLabel}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><CheckCircle2 size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Active Drivers</div>
            <div className="stat-value">{formatCount(activeDrivers)}</div>
            <div className="stat-change" style={{ color: 'var(--text-tertiary)', background: 'transparent', padding: 0, fontWeight: 500, marginTop: '4px' }}>{contextLabel}</div>
          </div>
        </div>
      </div>
      )}

      <div className="card">
        <div className="card-header filter-bar mobile-col">
          <div className="search-bar mobile-full-width" style={{ flex: 1, maxWidth: '400px' }}>
            <Search size={18} className="search-icon" />
            <input id="driver-search" name="search" autoComplete="off" type="text" className="form-input" placeholder="Search by name or phone..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <select id="driver-status-filter" name="statusFilter" aria-label="Filter drivers by status" className="form-select mobile-full-width" style={{ width: 'auto' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Driver</th>
                <th>Phone</th>
                <th>Vehicle Info</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(5).fill(0).map((_, idx) => (
                  <tr key={idx}>
                    <td><div className="skeleton" style={{ height: '20px', width: '70%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '60%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '80%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '50%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '40%', marginLeft: 'auto' }} /></td>
                  </tr>
                ))
              ) : filteredDrivers.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                    No delivery men found.
                  </td>
                </tr>
              ) : (
                filteredDrivers.map(driver => (
                  <tr key={driver.id}>
                    <td data-label="Driver">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: 'var(--primary-light)', color: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Truck size={18} />
                        </div>
                        <div style={{ fontWeight: 600 }}>{driver.name}</div>
                      </div>
                    </td>
                    <td data-label="Phone">{driver.phone || '-'}</td>
                    <td data-label="Vehicle Info">{driver.vehicleInfo || '-'}</td>
                    <td data-label="Status">
                      <span className={`badge ${driver.status === 'active' ? 'badge-success' : 'badge-neutral'}`}>
                        {driver.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td data-label="Actions" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        <button 
                          className="btn btn-icon" 
                          onClick={() => openModal(driver)} 
                          data-tooltip="View / Edit Details"
                          style={{ 
                            width: '32px', height: '32px', padding: 0,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: 'var(--bg-main)',
                            border: '1px solid var(--border)',
                            color: 'var(--primary)',
                            borderRadius: '6px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-main)'; e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                        ><Edit size={16} /></button>
                        {isAdmin && (
                        <button 
                          className="btn btn-icon" 
                          onClick={() => handleDelete(driver.id, driver.name)} 
                          data-tooltip="Delete"
                          style={{ 
                            width: '32px', height: '32px', padding: 0,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: 'var(--bg-main)',
                            border: '1px solid var(--border)',
                            color: 'var(--danger)',
                            borderRadius: '6px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--danger)'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = 'var(--danger)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-main)'; e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                        ><Trash2 size={16} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: '700px', display: 'flex', flexDirection: 'column', maxHeight: '90vh' }}>
            <div className="modal-header">
              <h2 className="modal-title">{editingDriver ? 'Manage Driver' : 'Add New Driver'}</h2>
              <button className="btn btn-icon btn-ghost" onClick={closeModal}><X size={20} /></button>
            </div>
            
            <div className="modal-body" style={{ overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column' }}>
              {editingDriver && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border)' }}>
                  <button type="button" onClick={() => setActiveTab('PROFILE')} className={`btn ${activeTab === 'PROFILE' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: 'var(--radius-md) var(--radius-md) 0 0', flex: 1, display: 'flex', gap: '8px' }}>
                    <User size={16} /> Profile Info
                  </button>
                  <button type="button" onClick={() => setActiveTab('TRANSACTIONS')} className={`btn ${activeTab === 'TRANSACTIONS' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: 'var(--radius-md) var(--radius-md) 0 0', flex: 1, display: 'flex', gap: '8px' }}>
                    <List size={16} /> Transactions
                  </button>
                </div>
              )}
              
              {activeTab === 'PROFILE' ? (
                <form id="driverForm" onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
                  <div className="form-group">
                    <label htmlFor="driver-name" className="form-label">Full Name *</label>
                    <input id="driver-name" name="name" autoComplete="name" type="text" className="form-input" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                  </div>
                  <div className="form-row">
                    <div className="form-group">
                      <label htmlFor="driver-phone" className="form-label">Phone Number</label>
                      <input 
                        id="driver-phone"
                        name="phone"
                        autoComplete="tel"
                        type="text" 
                        className="form-input" 
                        maxLength={11}
                        value={formData.phone} 
                        onChange={e => {
                          const val = e.target.value.replace(/\D/g, '');
                          if (val.length <= 11) {
                            setFormData({...formData, phone: val});
                          }
                        }} 
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="driver-vehicle" className="form-label">Vehicle Info</label>
                      <input id="driver-vehicle" name="vehicleInfo" autoComplete="off" type="text" className="form-input" placeholder="e.g., Motorcycle, Van" value={formData.vehicleInfo} onChange={e => setFormData({...formData, vehicleInfo: e.target.value})} />
                    </div>
                  </div>
                  {editingDriver && (
                    <div className="form-group">
                      <label htmlFor="driver-status" className="form-label">Status</label>
                      <select id="driver-status" name="status" className="form-select" value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                        <option value="active">Active</option>
                        <option value="inactive">Inactive</option>
                      </select>
                    </div>
                  )}
                </form>
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: '250px' }}>
                  {loadingTransactions ? (
                    <div style={{ padding: '40px', textAlign: 'center' }}>
                      <div className="loading-spinner lg" />
                      <div style={{ marginTop: '16px', color: 'var(--text-secondary)' }}>Loading transactions...</div>
                    </div>
                  ) : driverTransactions.length === 0 ? (
                    <div style={{ padding: '40px', textAlign: 'center' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px', color: 'var(--text-tertiary)' }}>
                        <FileText size={24} />
                      </div>
                      <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>No Transactions Found</h3>
                      <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>This driver hasn&apos;t been assigned any deliveries yet.</p>
                    </div>
                  ) : (
                    <div style={{ overflowX: 'auto', margin: '0 -16px' }}>
                      <table className="table" style={{ margin: 0, fontSize: '13px' }}>
                        <thead style={{ position: 'sticky', top: 0, background: '#FFFFFF', zIndex: 1, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                          <tr>
                            <th style={{ padding: '12px 24px' }}>Date</th>
                            <th style={{ padding: '12px 24px' }}>Order No.</th>
                            <th style={{ padding: '12px 24px' }}>Customer</th>
                            <th style={{ padding: '12px 24px' }}>Delivery Date</th>
                            <th style={{ padding: '12px 24px' }}>Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {driverTransactions.map((delivery) => (
                            <tr key={delivery.id} style={{ borderBottom: '1px solid var(--border)', background: '#FFFFFF' }}>
                              <td data-label="Date" style={{ padding: '12px 24px', color: 'var(--text-secondary)' }}>
                                {new Date(delivery.createdAt).toLocaleDateString()}
                              </td>
                              <td data-label="Order No." style={{ padding: '12px 24px', fontWeight: 600, color: 'var(--primary)' }}>
                                {delivery.order?.orderNumber}
                              </td>
                              <td data-label="Customer" style={{ padding: '12px 24px', fontWeight: 600 }}>
                                {delivery.order?.customer?.name || 'Walk-in'}
                              </td>
                              <td data-label="Delivery Date" style={{ padding: '12px 24px', color: 'var(--text-secondary)' }}>
                                {delivery.scheduledDate ? new Date(delivery.scheduledDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Not Scheduled'}
                              </td>
                              <td data-label="Status" style={{ padding: '12px 24px' }}>
                                <span className={`badge ${
                                  delivery.status === 'delivered' ? 'badge-success' : 
                                  delivery.status === 'in_transit' ? 'badge-warning' : 
                                  delivery.status === 'failed' || delivery.status === 'cancelled' ? 'badge-danger' : 
                                  'badge-neutral'
                                }`} style={{ fontSize: '10px' }}>
                                  {delivery.status.replace('_', ' ').toUpperCase()}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {activeTab !== 'TRANSACTIONS' && (
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={isSaving}>
                  Cancel
                </button>
                <button type="submit" form="driverForm" className="btn btn-primary" disabled={isSaving}>
                  <Save size={18} style={{ marginRight: '8px' }} />
                  {isSaving ? 'Saving...' : 'Save Driver'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

    </>
  );
}
