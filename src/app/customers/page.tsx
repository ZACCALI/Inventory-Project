'use client';

import React, { useState, useEffect } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { useSession } from 'next-auth/react';
import { Search, Plus, Phone, MapPin, Edit, Trash2, X,  FileText, ShoppingCart,   ChevronDown, ChevronUp, Users, UserCheck } from 'lucide-react';
import { useAlert } from '@/components/AlertModal';
import { formatCurrency } from '@/lib/constants';
import { useDebounce } from '@/hooks/useDebounce';
import { addSyncTask } from '@/lib/offlineSync';

interface Customer {
  id: string;
  name: string;
  contactPerson: string | null;
  phone: string | null;
  address: string | null;
  _count: {
    orders: number;
  };
  customerType?: string;
}

export default function CustomersPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { showAlert, showConfirm, showToast } = useAlert();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'ADD' | 'EDIT' | 'VIEW'>('ADD');
  const [currentCustomer, setCurrentCustomer] = useState<Partial<Customer>>({ customerType: 'wholesale' });
  const [actionLoading, setActionLoading] = useState(false);
  
  const [activeTab, setActiveTab] = useState<'PROFILE' | 'HISTORY'>('PROFILE');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [customerOrders, setCustomerOrders] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  const getQueryString = () => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.append('search', debouncedSearch);
    return params.toString();
  };

  const { data: swrRes } = useSWR(
    session ? `/api/customers?${getQueryString()}` : null,
    fetcher,
    { refreshInterval: 60000 }
  );

  useEffect(() => {
    if (swrRes) {
      setCustomers(swrRes);
      setLoading(false);
    }
  }, [swrRes]);

  const fetchCustomers = async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const res = await fetch(`/api/customers?${getQueryString()}`);
      const data = await res.json();
      if (!res.ok) throw new Error('Failed to fetch customers');
      setCustomers(data);
    } catch (error) {
      console.error('Failed to fetch customers', error);
    } finally {
      setLoading(false);
    }
  };



  const openAdd = () => {
    setModalMode('ADD');
    setCurrentCustomer({ name: '', contactPerson: '', phone: '', address: '', customerType: 'wholesale' });
    setIsModalOpen(true);
  };

  const fetchCustomerHistory = async (id: string) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/orders?customerId=${id}`);
      const data = await res.json();
      if (Array.isArray(data)) setCustomerOrders(data);
    } catch (error) {
      console.error(error);
    } finally {
      setHistoryLoading(false);
    }
  };


  const openEdit = (c: Customer) => {
    setModalMode('EDIT');
    setCurrentCustomer({ ...c });
    setActiveTab('PROFILE');
    setCustomerOrders([]);
    fetchCustomerHistory(c.id);
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (!await showConfirm('Delete Customer', 'Are you sure you want to delete this customer? This action cannot be undone.')) return;
    
    try {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      if (isOffline) {
        await addSyncTask('customer', 'DELETE', { id });
        showToast('offline', 'Action queued offline — will sync when connected');
        setCustomers(prev => prev.filter(c => c.id !== id));
        return;
      }

      const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchCustomers();
      } else {
        const data = await res.json();
        showAlert('error', 'Action Failed', data.error || 'Failed to delete');
      }
    } catch (error) {
      console.error(error);
      showAlert('error', 'Action Failed', 'Error deleting customer');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

      if (isOffline) {
        const action = modalMode === 'ADD' ? 'CREATE' : 'UPDATE';
        const payload = { ...currentCustomer, id: currentCustomer.id || `OFF-${Date.now()}` };
        
        await addSyncTask('customer', action, payload);
        showToast('offline', 'Action queued offline — will sync when connected');
        
        setIsModalOpen(false);
        // Optimistically update UI
        if (modalMode === 'ADD') {
          setCustomers(prev => [{...payload, _count: {orders: 0}} as any, ...prev]);
        } else {
          setCustomers(prev => prev.map(c => c.id === payload.id ? {...c, ...payload} as any : c));
        }
        setActionLoading(false);
        return;
      }

      const url = modalMode === 'ADD' ? '/api/customers' : `/api/customers/${currentCustomer.id}`;
      const method = modalMode === 'ADD' ? 'POST' : 'PUT';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(currentCustomer)
      });

      if (res.ok) {
        setIsModalOpen(false);
        fetchCustomers();
      } else {
        const err = await res.json();
        showAlert('error', 'Action Failed', err.error || 'Failed to save customer');
      }
    } catch (error) {
      console.error(error);
      showAlert('error', 'Action Failed', 'Error saving customer');
    } finally {
      setActionLoading(false);
    }
  };

  const formatCount = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
  };

  const displayCustomers = customers.filter(c => c.name !== '[Normal Walk-in]');
  const totalCustomers = displayCustomers.length;
  const activeCustomers = displayCustomers.filter(c => (c._count?.orders || 0) > 0).length;

  let contextLabel = 'All Customers';
  if (search) contextLabel = `Search: ${search}`;

  return (
    <>
      <div className="page-header mobile-col">
        <div>
          <h1 className="page-title">Customers</h1>
          <p className="page-subtitle">Manage your client base and view their order history</p>
        </div>
        <div className="page-header-actions mobile-full-width">
          <button onClick={openAdd} className="btn btn-primary mobile-full-width" style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={18} />
            Add Customer
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
            <div className="stat-label">Total Customers</div>
            <div className="stat-value">{formatCount(totalCustomers)}</div>
            <div className="stat-change" style={{ color: 'var(--text-tertiary)', background: 'transparent', padding: 0, fontWeight: 500, marginTop: '4px' }}>{contextLabel}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><UserCheck size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Active Customers</div>
            <div className="stat-value">{formatCount(activeCustomers)}</div>
            <div className="stat-change" style={{ color: 'var(--text-tertiary)', background: 'transparent', padding: 0, fontWeight: 500, marginTop: '4px' }}>{contextLabel}</div>
          </div>
        </div>
      </div>
      )}

      <div className="card">
        <div className="card-header filter-bar" style={{ display: 'flex', flexDirection: 'column', gap: '16px', alignItems: 'stretch' }}>
           <div style={{ display: 'none' }}></div>
           <div className="search-bar" style={{ position: 'relative', maxWidth: '400px' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input 
              id="customer-search"
              name="search"
              aria-label="Search customers by name or contact"
              type="text" 
              className="form-input" 
              placeholder="Search customers by name or contact..." 
              style={{ paddingLeft: '36px' }}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th>Store / Business Name</th>
                <th>Contact Person</th>
                <th>Phone</th>
                <th style={{ textAlign: 'center' }}>Total Orders</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(5).fill(0).map((_, idx) => (
                  <tr key={idx}>
                    <td><div className="skeleton" style={{ height: '20px', width: '80%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '60%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '70%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '50%', margin: '0 auto' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '50%', marginLeft: 'auto' }} /></td>
                  </tr>
                ))
              ) : displayCustomers.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                    No customers found.
                  </td>
                </tr>
              ) : (
                displayCustomers.map((customer) => (
                  <tr key={customer.id}>
                    <td data-label="Customer & Address">
                      <div className="responsive-cell-stack">
                        <div style={{ fontWeight: 600, color: 'var(--primary)', fontSize: 'var(--font-base)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {customer.name}
                        </div>
                        <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px' }}>
                          <MapPin size={12} style={{ flexShrink: 0 }} />
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '250px' }} data-tooltip={customer.address || 'No address provided'}>
                            {customer.address || 'No address provided'}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td data-label="Contact Person">
                      <div style={{ fontWeight: 500 }}>{customer.contactPerson || '-'}</div>
                    </td>
                    <td data-label="Phone">
                      {customer.phone ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--text-secondary)', fontSize: 'var(--font-sm)' }}>
                          <Phone size={14} /> {customer.phone}
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-tertiary)' }}>No phone</span>
                      )}
                    </td>
                    <td data-label="Total Orders" style={{ textAlign: 'center' }}>
                      <span className="badge badge-neutral" style={{ fontSize: 'var(--font-sm)', fontWeight: 600, padding: '4px 12px' }}>
                        {customer._count?.orders || 0}
                      </span>
                    </td>
                    <td data-label="Actions" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                        <button 
                          onClick={() => openEdit(customer)} 
                          className="btn btn-icon" 
                          style={{ 
                            width: '32px', height: '32px', padding: 0,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: 'var(--bg-main)', border: '1px solid var(--border)', color: 'var(--primary)', borderRadius: '6px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                          }}
                          data-tooltip="View / Edit Details"
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-main)'; e.currentTarget.style.color = 'var(--primary)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                        >
                          <Edit size={16} />
                        </button>
                        {isAdmin && (
                          <button 
                            onClick={() => handleDelete(customer.id)} 
                            className="btn btn-icon" 
                            style={{ 
                              width: '32px', height: '32px', padding: 0,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              background: 'var(--bg-main)', border: '1px solid var(--border)', color: 'var(--danger)', borderRadius: '6px', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                            }}
                            data-tooltip="Delete Customer"
                            onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--danger)'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = 'var(--danger)'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-main)'; e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                          >
                            <Trash2 size={16} />
                          </button>
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
        <div className="modal-overlay" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: '700px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div className="modal-header">
              <h2 className="modal-title">
                {modalMode === 'ADD' ? 'Add New Customer' : 'Manage Customer'}
              </h2>
              <button className="btn btn-icon btn-ghost" onClick={() => setIsModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', flex: 1 }}>
              <div className="modal-body" style={{ overflowY: 'auto', flex: 1 }}>
                {(modalMode === 'VIEW' || modalMode === 'EDIT') && (
                  <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', borderBottom: '1px solid var(--border)' }}>
                    <button type="button" onClick={() => setActiveTab('PROFILE')} className={`btn ${activeTab === 'PROFILE' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: 'var(--radius-md) var(--radius-md) 0 0', flex: 1, display: 'flex', gap: '8px' }}>
                      <FileText size={16} /> Profile Info
                    </button>
                    <button type="button" onClick={() => setActiveTab('HISTORY')} className={`btn ${activeTab === 'HISTORY' ? 'btn-primary' : 'btn-ghost'}`} style={{ borderRadius: 'var(--radius-md) var(--radius-md) 0 0', flex: 1, display: 'flex', gap: '8px' }}>
                      <ShoppingCart size={16} /> Order History
                    </button>
                  </div>
                )}

                {activeTab === 'PROFILE' ? (
                  <>
                    <div className="form-group">
                  <label htmlFor="customer-name" className="form-label">Store / Business Name *</label>
                  <input 
                    id="customer-name"
                    name="name"
                    autoComplete="organization"
                    type="text" 
                    required 
                    disabled={modalMode === 'VIEW'}
                    className="form-input"
                    value={currentCustomer.name || ''}
                    onChange={e => setCurrentCustomer({...currentCustomer, name: e.target.value})}
                  />
                </div>
                
                <div style={{ display: 'none' }}></div>
                
                <div className="form-group">
                  <label htmlFor="customer-contact" className="form-label">Contact Person</label>
                  <input 
                    id="customer-contact"
                    name="contactPerson"
                    autoComplete="name"
                    type="text" 
                    disabled={modalMode === 'VIEW'}
                    className="form-input"
                    value={currentCustomer.contactPerson || ''}
                    onChange={e => setCurrentCustomer({...currentCustomer, contactPerson: e.target.value})}
                  />
                </div>

                <div className="form-group">
                  <label htmlFor="customer-phone" className="form-label">Phone Number</label>
                  <input 
                    id="customer-phone"
                    name="phone"
                    autoComplete="tel"
                    type="text" 
                    maxLength={11}
                    disabled={modalMode === 'VIEW'}
                    className="form-input"
                    value={currentCustomer.phone || ''}
                    onChange={e => {
                      const val = e.target.value.replace(/\D/g, '');
                      setCurrentCustomer({...currentCustomer, phone: val});
                    }}
                  />
                </div>
                
                <div className="form-group">
                  <label htmlFor="customer-address" className="form-label">Physical Address</label>
                  <textarea 
                    id="customer-address"
                    name="address"
                    autoComplete="street-address"
                    rows={3}
                    disabled={modalMode === 'VIEW'}
                    className="form-input"
                    value={currentCustomer.address || ''}
                    onChange={e => setCurrentCustomer({...currentCustomer, address: e.target.value})}
                  />
                    </div>
                  </>
                ) : (
                  <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                    {historyLoading ? (
                      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)' }}>Loading history...</div>
                    ) : customerOrders.length === 0 ? (
                      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-tertiary)' }}>No orders found for this customer.</div>
                    ) : (
                      <table className="table" style={{ fontSize: '13px' }}>
                        <thead>
                          <tr>
                            <th>Order #</th>
                            <th>Date</th>
                            <th>Status</th>
                            <th>Payment</th>
                            <th style={{ textAlign: 'right' }}>Total</th>
                            <th style={{ textAlign: 'center' }}>Details</th>
                          </tr>
                        </thead>
                        <tbody>
                          {customerOrders.map(order => (
                            <React.Fragment key={order.id}>
                              <tr>
                                <td data-label="Order # & Customer" style={{ fontWeight: 600, color: 'var(--primary)' }}>{order.orderNumber} &bull; {currentCustomer.name}</td>
                                <td data-label="Date" style={{ color: 'var(--text-secondary)' }}>{new Date(order.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                                <td data-label="Status"><span className={`badge ${order.status === 'delivered' || order.status === 'paid' ? 'badge-success' : order.status === 'cancelled' ? 'badge-danger' : 'badge-warning'}`} style={{ fontSize: '10px', padding: '2px 6px' }}>{order.status}</span></td>
                                <td data-label="Payment"><span className={`badge ${order.paymentStatus === 'paid' ? 'badge-success' : order.paymentStatus === 'partial' ? 'badge-warning' : 'badge-danger'}`} style={{ fontSize: '10px', padding: '2px 6px' }}>{order.paymentStatus || 'unpaid'}</span></td>
                                <td data-label="Total" style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(order.totalAmount)}</td>
                                <td data-label="Details" style={{ textAlign: 'center' }}>
                                  <button 
                                    type="button"
                                    className="btn btn-icon btn-ghost" 
                                    onClick={() => setExpandedOrderId(expandedOrderId === order.id ? null : order.id)}
                                  >
                                    {expandedOrderId === order.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                  </button>
                                </td>
                              </tr>
                              {expandedOrderId === order.id && (
                                <tr style={{ background: 'var(--bg-main)' }}>
                                  <td colSpan={6} style={{ padding: '12px 16px', borderTop: 'none' }}>
                                    <div style={{ width: '100%', textAlign: 'left', display: 'flex', flexDirection: 'column' }}>
                                      <div style={{ fontSize: '12px', fontWeight: 600, marginBottom: '8px', color: 'var(--text-secondary)' }}>Items Purchased:</div>
                                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
{/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                        {order.items?.map((item: any) => (
                                          <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '4px', borderBottom: '1px dashed var(--border-light)' }}>
                                            <div style={{ display: 'flex', gap: '6px', overflow: 'hidden', alignItems: 'center' }}>
                                              <span style={{ fontWeight: 600, flexShrink: 0 }}>{item.quantity}x</span>
                                              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '13px' }} title={item.product?.name}>
                                                {item.product?.name}
                                              </span>
                                            </div>
                                            <span style={{ fontWeight: 500, flexShrink: 0, paddingLeft: '8px', fontSize: '13px' }}>
                                              {formatCurrency(item.subtotal)}
                                            </span>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                )}
              </div>
              
              {activeTab !== 'HISTORY' && (
                <div className="modal-footer">
                  {modalMode === 'VIEW' ? (
                    <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                      Close
                    </button>
                  ) : (
                    <>
                      <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                        Cancel
                      </button>
                      <button type="submit" className="btn btn-primary" disabled={actionLoading}>
                        {actionLoading ? 'Saving...' : 'Save Customer'}
                      </button>
                    </>
                  )}
                </div>
              )}
            </form>
          </div>
        </div>
      )}

    </>
  );
}
