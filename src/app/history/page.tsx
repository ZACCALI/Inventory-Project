'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { Search,   User, Activity, PlusCircle, Trash2, Edit3, ChevronLeft, ChevronRight, Wifi, WifiOff } from 'lucide-react';
import { useDebounce } from '@/hooks/useDebounce';
import { db } from '@/lib/db';

interface AuditLog {
  id: string;
  action: string;
  entity: string;
  details: string;
  mode: string;
  createdAt: string;
  user: {
    name: string;
    role: string;
  };
}

export default function HistoryPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const limit = 50;
  
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [actionFilter, setActionFilter] = useState('All');
  const [entityFilter, setEntityFilter] = useState('All');
  const [modeFilter, setModeFilter] = useState('All');

  const getQueryString = () => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.append('search', debouncedSearch);
    if (actionFilter !== 'All') params.append('action', actionFilter);
    if (entityFilter !== 'All') params.append('entity', entityFilter);
    if (modeFilter !== 'All') params.append('mode', modeFilter);
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    return params.toString();
  };

  const { data: swrRes, error: swrError } = useSWR(
    `/api/history?${getQueryString()}`,
    async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      return { data, totalCount: parseInt(res.headers.get('X-Total-Count') || '0', 10) };
    }
  );

  useEffect(() => {
    const applyOfflineTasks = async () => {
      let finalLogs: AuditLog[] = [];
      let finalCount = 0;

      if (swrRes && Array.isArray(swrRes.data)) {
        finalLogs = [...swrRes.data];
        finalCount = swrRes.totalCount || 0;
      }

      try {
        const pendingTasks = await db.syncQueue
          .where('syncStatus')
          .anyOf(['pending', 'failed'])
          .toArray();

        // Sort descending so newest is first
        pendingTasks.sort((a, b) => b.createdAt - a.createdAt);

        const mockLogs: AuditLog[] = pendingTasks.map(task => ({
          id: `mock-${task.id}`,
          action: task.action,
          entity: task.type === 'stock' ? 'Stock Movement' : task.type.charAt(0).toUpperCase() + task.type.slice(1),
          details: `Pending offline action (${task.action} ${task.type})`,
          mode: 'offline (pending)',
          createdAt: new Date(task.createdAt).toISOString(),
          user: { name: 'Offline User', role: 'ADMIN' }
        }));

        finalLogs = [...mockLogs, ...finalLogs];
        finalCount += mockLogs.length;
      } catch (e) {
        console.error('Failed to parse offline tasks for history', e);
      }

      setLogs(finalLogs);
      setTotalCount(finalCount);
      setLoading(false);
    };

    if (swrRes || swrError) {
      applyOfflineTasks();
    }
  }, [swrRes, swrError]);

  const fetchLogs = async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const res = await fetch(`/api/history?${getQueryString()}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data);
        const total = res.headers.get('X-Total-Count');
        if (total) setTotalCount(parseInt(total));
      }
    } catch (e) {
      console.error('Failed to fetch history logs', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(() => {
      fetchLogs();
    }, 60000);
    return () => clearInterval(interval);
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, actionFilter, entityFilter, modeFilter, page]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, actionFilter, entityFilter, modeFilter]);


  const getActionColor = (action: string) => {
    switch (action.toUpperCase()) {
      case 'CREATE': return 'var(--success)';
      case 'UPDATE': return 'var(--primary)';
      case 'DELETE': return 'var(--danger)';
      default: return 'var(--text-secondary)';
    }
  };

  const formatCount = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
  };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
  const totalLogs = logs.length;
  const createLogs = logs.filter(l => l.action.toUpperCase() === 'CREATE').length;
  const updateLogs = logs.filter(l => l.action.toUpperCase() === 'UPDATE').length;
  const deleteLogs = logs.filter(l => l.action.toUpperCase() === 'DELETE').length;

  const totalPages = Math.ceil(totalCount / limit);

  let contextLabel = 'All Actions';
  if (search) contextLabel = `Search: ${search}`;
  else if (actionFilter !== 'All' || entityFilter !== 'All') contextLabel = [actionFilter !== 'All' ? actionFilter : null, entityFilter !== 'All' ? entityFilter : null].filter(Boolean).join(' | ');

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Audit Logs</h1>
          <p className="page-subtitle">Audit log of all user activities and system changes</p>
        </div>
      </div>

      {loading ? (
        <div className="stats-grid">
          {[1,2,3,4].map(i => (
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
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue"><Activity size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Total Actions</div>
            <div className="stat-value">{formatCount(totalCount)}</div>
            <div className="stat-change" style={{ color: 'var(--text-tertiary)', background: 'transparent', padding: 0, fontWeight: 500, marginTop: '4px' }}>{contextLabel}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><PlusCircle size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Create Actions</div>
            <div className="stat-value">{formatCount(createLogs)}</div>
            <div className="stat-change" style={{ color: 'var(--text-tertiary)', background: 'transparent', padding: 0, fontWeight: 500, marginTop: '4px' }}>This page</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon primary"><Edit3 size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Update Actions</div>
            <div className="stat-value">{formatCount(updateLogs)}</div>
            <div className="stat-change" style={{ color: 'var(--text-tertiary)', background: 'transparent', padding: 0, fontWeight: 500, marginTop: '4px' }}>This page</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon red"><Trash2 size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Delete Actions</div>
            <div className="stat-value">{formatCount(deleteLogs)}</div>
            <div className="stat-change" style={{ color: 'var(--text-tertiary)', background: 'transparent', padding: 0, fontWeight: 500, marginTop: '4px' }}>This page</div>
          </div>
        </div>
      </div>
      )}

      <div className="card">
        <div className="card-header filter-bar" style={{ paddingTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'center', marginBottom: 0 }}>
          <div className="search-bar" style={{ flex: 1, minWidth: '280px', maxWidth: '400px' }}>
            <Search size={18} className="search-icon" />
            <input 
              id="history-search"
              name="search"
              aria-label="Search details or user"
              type="text" 
              className="form-input" 
              placeholder="Search details or user..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          
          <div className="filter-selects" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <select 
              id="history-action-filter"
              name="actionFilter"
              aria-label="Filter history by action"
              className="form-select" 
              value={actionFilter} 
              onChange={e => setActionFilter(e.target.value)}
            >
              <option value="All">All Actions</option>
              <option value="CREATE">Create</option>
              <option value="UPDATE">Update</option>
              <option value="DELETE">Delete</option>
            </select>
            
            <select 
              id="history-entity-filter"
              name="entityFilter"
              aria-label="Filter history by entity"
              className="form-select" 
              value={entityFilter} 
              onChange={e => setEntityFilter(e.target.value)}
            >
              <option value="All">All Entities</option>
              <option value="Order">Order</option>
              <option value="Expense">Expense</option>
              <option value="Delivery">Delivery</option>
              <option value="Product">Product</option>
              <option value="Customer">Customer</option>
              <option value="Stock Movement">Stock Movement</option>
              <option value="User">User</option>
              <option value="User Profile">User Profile</option>
              <option value="User Security">User Security</option>
              <option value="Settings">Settings</option>
            </select>

            <select 
              id="history-mode-filter"
              name="modeFilter"
              aria-label="Filter history by mode"
              className="form-select" 
              value={modeFilter} 
              onChange={e => setModeFilter(e.target.value)}
            >
              <option value="All">All Modes</option>
              <option value="online">Online</option>
              <option value="offline">Offline</option>
            </select>
          </div>
        </div>

        <div className="table-container">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '180px' }}>Date &amp; Time</th>
                <th>User</th>
                <th>Action</th>
                <th>Module</th>
                <th>Mode</th>
                <th style={{ width: '30%' }}>Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(5).fill(0).map((_, idx) => (
                  <tr key={idx}>
                    <td><div className="skeleton" style={{ height: '20px', width: '90%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '70%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '50%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '60%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '40%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '80%' }} /></td>
                  </tr>
                ))
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                    No history logs found matching your criteria.
                  </td>
                </tr>
              ) : (
                logs.map(log => (
                  <tr key={log.id}>
                    <td data-label="Date & Time" style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td data-label="User">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 500 }}>
                        <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <User size={14} color="var(--text-secondary)" />
                        </div>
                        {log.user?.name || 'System User'}
                      </div>
                    </td>
                    <td data-label="Action">
                      <span style={{ 
                        color: getActionColor(log.action),
                        fontWeight: 700,
                        fontSize: '12px',
                        padding: '4px 8px',
                        background: 'var(--bg-main)',
                        borderRadius: '4px',
                        display: 'inline-block'
                      }}>
                        {log.action}
                      </span>
                    </td>
                    <td data-label="Module">
                      <span className="badge badge-neutral">{log.entity}</span>
                    </td>
                    <td data-label="Mode">
                      {log.mode === 'offline' ? (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '4px 8px',
                          borderRadius: '6px',
                          background: 'rgba(245, 158, 11, 0.1)',
                          color: 'var(--warning)',
                          border: '1px solid rgba(245, 158, 11, 0.2)',
                          whiteSpace: 'nowrap'
                        }}>
                          <WifiOff size={12} /> OFFLINE
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '4px 8px',
                          borderRadius: '6px',
                          background: 'rgba(16, 185, 129, 0.1)',
                          color: 'var(--success)',
                          border: '1px solid rgba(16, 185, 129, 0.2)',
                          whiteSpace: 'nowrap'
                        }}>
                          <Wifi size={12} /> ONLINE
                        </span>
                      )}
                    </td>
                    <td data-label="Details" style={{ color: 'var(--text-primary)' }}>
                      <span>{log.details}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div style={{ 
            display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
            padding: '16px 24px', borderTop: '1px solid var(--border)' 
          }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Showing {((page - 1) * limit) + 1}–{Math.min(page * limit, totalCount)} of {totalCount} entries
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button 
                className="btn btn-secondary btn-sm"
                disabled={page <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px' }}
              >
                <ChevronLeft size={16} /> Previous
              </button>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', padding: '0 8px' }}>
                Page {page} of {totalPages}
              </span>
              <button 
                className="btn btn-secondary btn-sm"
                disabled={page >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px' }}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
