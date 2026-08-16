'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { db } from '@/lib/db';
import { addSyncTask } from '@/lib/offlineSync';
import { useSession } from 'next-auth/react';
import { Search, ArrowDownRight, ArrowUpRight, Clock, X, Trash2, Package, Edit, Save, Filter, AlertTriangle } from 'lucide-react';
import { useAlert } from '@/components/AlertModal';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useModalDismiss } from '@/hooks/useModalDismiss';
import Image from "next/image";
import { StockMovementModal, Product } from '@/components/stock/StockMovementModal';
import { ManageReasonsModal } from '@/components/stock/ManageReasonsModal';

interface StockLog {
  id: string;
  date: string;
  product: string;
  sku: string;
  category: string;
  type: string;
  quantity: number;
  reference: string;
  source: string;
  user: string;
  image?: string | null;
  productId: string;
  isVoided?: boolean;
}

export default function StockInOutPage() {
  const { showAlert, showConfirm, showToast } = useAlert();
  const { data: session } = useSession();
  const isAdmin = session?.user?.role === 'admin';
  
  const [search, setSearch] = useState('');
  const [tableCategoryFilter, setTableCategoryFilter] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'IN' | 'OUT'>('ALL');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'STOCK_IN' | 'STOCK_OUT' | 'WALK_IN_HOME' | 'WALK_IN_STORE' | 'AUDIT' | 'EXPIRY_TRACKING'>('ALL');
  const [dateFilter, setDateFilter] = useState('');
  const [showVoided, setShowVoided] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [logs, setLogs] = useState<StockLog[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<{id: string, name: string}[]>([]);
  const [loading, setLoading] = useState(true);
  const isOnline = useOnlineStatus();

  // Stock In / Out Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'IN' | 'OUT'>('IN');
  const [lockStockVoid, setLockStockVoid] = useState(true);
  
  const [inReasons, setInReasons] = useState(['New Stock Delivery', 'Customer Return', 'Inventory Adjustment', 'Transfer In', 'Other']);
  const [outReasons, setOutReasons] = useState(['Damage/Spoilage', 'Expired', 'Internal Use', 'Inventory Adjustment', 'Customer Order', 'Transfer Out', 'Other']);
  
  // Edit Log Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<StockLog | null>(null);
  const [editFormData, setEditFormData] = useState({ quantity: 1, reason: '', productId: '' });
  const [editManageReasonType, setEditManageReasonType] = useState<'IN' | 'OUT' | null>(null);
  const [editSelectedUomId, setEditSelectedUomId] = useState<string>('BASE');
  const [editExpiryDate, setEditExpiryDate] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Modal dismiss & body scroll locking
  useModalDismiss(isEditModalOpen, () => setIsEditModalOpen(false));
  useModalDismiss(!!editManageReasonType, () => setEditManageReasonType(null));

  // Dashboard Stats State
  const [statsTimeframe, setStatsTimeframe] = useState<'today' | 'week' | 'month' | 'year' | 'all'>('today');
  const [stats, setStats] = useState({ totalIn: 0, totalOut: 0, logCount: 0 });

  const { data: swrRes } = useSWR('/api/stock/movement', fetcher);

  useEffect(() => {
    const applyOfflineTasks = async () => {
      let finalLogs: StockLog[] = [];
      if (swrRes) {
        finalLogs = Array.isArray(swrRes) ? [...swrRes] : [];
      } else {
        try {
          const cachedStr = localStorage.getItem('amroding_stock_logs_cache');
          if (cachedStr) {
            finalLogs = JSON.parse(cachedStr);
            if (finalLogs.length > 0) setLogs(finalLogs);
          }
        } catch {}
        try {
          const cached = await db.stockMovements.toArray();
          finalLogs = cached.map(m => ({
            id: m.id,
            date: m.date,
            product: products.find(p => p.id === m.productId)?.name || 'Unknown',
            sku: products.find(p => p.id === m.productId)?.sku || '',
            category: products.find(p => p.id === m.productId)?.category?.name || '',
            type: m.type,
            quantity: m.quantity,
            reference: m.reason,
            source: m.source,
            user: 'Offline User',
            productId: m.productId,
            isVoided: false
          })) as unknown as StockLog[];
          finalLogs.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        } catch (e) {
          console.warn('No stockMovements cache', e);
        }
      }
      
      try {
        const pendingTasks = await db.syncQueue
          .where('syncStatus')
          .anyOf(['pending', 'failed'])
          .toArray();
          
        for (const task of pendingTasks) {
          if (task.type === 'stock' && task.action === 'CREATE') {
            const payload = JSON.parse(task.payload);
            const productMatch = products.find(p => p.id === payload.productId);
            if (!finalLogs.find(l => l.id === task.id?.toString())) {
              finalLogs.unshift({
                id: task.id?.toString() || `OFF-${Date.now()}`,
                date: new Date(task.createdAt).toISOString(),
                product: productMatch?.name || 'Unknown Offline Product',
                sku: productMatch?.sku || '',
                category: productMatch?.category?.name || 'Uncategorized',
                type: payload.type,
                quantity: payload.quantity,
                reference: payload.reason || (payload.type === 'IN' ? 'Offline Stock Delivery' : 'Offline Stock Out'),
                source: payload.source,
                user: 'Offline User',
                productId: payload.productId,
                isVoided: false
              });
            }
          }
        }
      } catch (e) {
        console.warn('Failed to merge offline stock tasks', e);
      }
      
      setLogs(finalLogs);
      setLoading(false);
    };

    applyOfflineTasks();
  }, [swrRes, products]);

  useEffect(() => {
    if (!swrRes) {
      const t = setTimeout(() => setLoading(false), 2000);
      return () => clearTimeout(t);
    }
  }, [swrRes]);

  const fetchLogs = async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const res = await fetch('/api/stock/movement');
      if (!res.ok) throw new Error('Network response was not ok');
      const data = await res.json();
      setLogs(data);
      localStorage.setItem('amroding_stock_logs_cache', JSON.stringify(data));
      
      try {
        await db.stockMovements.clear();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await db.stockMovements.bulkAdd(data.map((l: any) => ({
          id: l.id,
          productId: l.productId,
          type: l.type,
          quantity: l.quantity,
          reason: l.reference,
          source: l.source,
          date: l.date
        })));
      } catch (e) {
        console.warn('Failed to update stockMovements cache in Dexie', e);
      }
    } catch (error: unknown) {
      if ((error as Error)?.message === 'Failed to fetch' || error instanceof TypeError) return;
      console.error('Failed to fetch stock logs', error);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products');
      if (!res.ok) throw new Error('Network response was not ok');
      const data = await res.json();
      setProducts(data);
      try {
        const cachedCats = await db.categories.toArray();
        if (cachedCats.length > 0) {
          setCategories(cachedCats.map(c => ({ id: c.id, name: c.name })));
        }
      } catch {}
    } catch {
      try {
        const cached = await db.products.toArray();
        if (cached.length > 0) {
          setProducts(cached.map(p => ({
            id: p.id,
            name: p.name,
            sku: p.sku,
            barcode: p.barcode,
            price: p.price,
            stock: p.stock,
            image: p.image,
            unit: (p as unknown as { unit?: string }).unit || p.uoms?.find(u => u.isBase)?.name || 'pcs',
            category: p.categoryName ? { name: p.categoryName } : null,
            uoms: p.uoms || []
          })));
        }
        const cachedCats = await db.categories.toArray();
        if (cachedCats.length > 0) {
          setCategories(cachedCats.map(c => ({ id: c.id, name: c.name })));
        }
      } catch {}
    }
  };

  const fetchStats = async (tf = statsTimeframe) => {
    try {
      const res = await fetch(`/api/stock/stats?timeframe=${tf}`);
      if (!res.ok) throw new Error('Network response was not ok');
      const data = await res.json();
      setStats(data);
    } catch (error: unknown) {
      if ((error as Error)?.message === 'Failed to fetch' || error instanceof TypeError) return;
      console.error('Failed to fetch stock stats', error);
    }
  };

  const loadReasons = () => {
    try {
      const savedIn = localStorage.getItem('amroding_in_reasons');
      const savedOut = localStorage.getItem('amroding_out_reasons');
      if (savedIn) setInReasons(JSON.parse(savedIn));
      if (savedOut) setOutReasons(JSON.parse(savedOut));
    } catch (e) {
      console.error('Failed to load reasons from local storage', e);
    }
  };

  const saveReasons = (newIn: string[], newOut: string[]) => {
    try {
      localStorage.setItem('amroding_in_reasons', JSON.stringify(newIn));
      localStorage.setItem('amroding_out_reasons', JSON.stringify(newOut));
      setInReasons(newIn);
      setOutReasons(newOut);
    } catch (e) {
      console.error('Failed to save reasons to local storage', e);
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchProducts();
    fetchStats();
    loadReasons();

    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          setLockStockVoid(data.lockStockVoid ?? true);
        }
      } catch {
        try {
          const cachedSettings = await db.settings.get('current');
          if (cachedSettings?.data) {
            const data = JSON.parse(cachedSettings.data);
            setLockStockVoid(data.lockStockVoid ?? true);
          }
        } catch {}
      }
    };
    fetchSettings();

    const handleAppSync = () => {
      fetchLogs();
      fetchProducts();
      fetchStats();
    };
    window.addEventListener('appDataSynced', handleAppSync);

    return () => {
      window.removeEventListener('appDataSynced', handleAppSync);
    };
  }, []);

  const openModal = (type: 'IN' | 'OUT') => {
    setModalType(type);
    setIsModalOpen(true);
  };

  const handleMovementSuccess = ({ productId, delta, finalQuantity, type, isOffline }: {
    productId: string;
    delta: number;
    finalQuantity: number;
    type: 'IN' | 'OUT';
    isOffline: boolean;
  }) => {
    if (!isOffline) {
      fetchLogs();
      fetchStats();
      fetchProducts();
    } else {
      setProducts(prev => prev.map(p => {
        if (p.id !== productId) return p;
        return { ...p, stock: Math.max(0, (p.stock || 0) + delta) };
      }));
      setStats(prev => ({
        ...prev,
        totalIn: type === 'IN' ? prev.totalIn + finalQuantity : prev.totalIn,
        totalOut: type === 'OUT' ? prev.totalOut + finalQuantity : prev.totalOut,
        logCount: prev.logCount + 1
      }));
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLog) return;
    setActionLoading(true);

    try {
      const logProduct = products.find(p => p.id === editingLog.productId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const multiplier = editSelectedUomId === 'BASE' ? 1 : (logProduct?.uoms?.find((u: any) => (u.id || u.name) === editSelectedUomId)?.multiplier || 1);
      const finalQuantity = editFormData.quantity * multiplier;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const selectedUomName = editSelectedUomId === 'BASE' ? (logProduct?.unit || 'pcs') : (logProduct?.uoms?.find((u: any) => (u.id || u.name) === editSelectedUomId)?.name || 'units');
      const actionText = editingLog.type === 'IN' ? 'Received' : 'Issued';
      const formattedReason = `${editFormData.reason} (${actionText} ${editFormData.quantity} ${selectedUomName})`;

      const isOffline = !isOnline;
      let networkFailed = false;

      if (!isOffline) {
        try {
          const moveRes = await fetch(`/api/stock/movement/${editingLog.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              quantity: finalQuantity,
              reason: formattedReason,
              productId: editFormData.productId,
              expiryDate: editExpiryDate || undefined,
              userId: session?.user?.id
            })
          });

          if (moveRes.ok) {
            setIsEditModalOpen(false);
            fetchLogs();
            fetchStats();
            fetchProducts();
            return;
          } else {
            const error = await moveRes.json();
            showAlert('error', 'Action Failed', 'Error: ' + error.error);
            return;
          }
        } catch (fetchErr) {
          console.warn('Network error, falling back to offline mode', fetchErr);
          networkFailed = true;
        }
      }

      if (isOffline || networkFailed) {
        await addSyncTask('stock', 'UPDATE', { id: editingLog.id, quantity: finalQuantity, reason: formattedReason, productId: editFormData.productId, expiryDate: editExpiryDate || undefined });
        setIsEditModalOpen(false);
        showToast('offline', 'Edit queued offline — will sync when connected');
        setLogs(prev => prev.map(l => l.id === editingLog.id ? { ...l, quantity: finalQuantity, reference: formattedReason } : l));
      }
    } catch {
      showAlert('error', 'Action Failed', 'Failed to update stock movement');
    } finally {
      setActionLoading(false);
    }
  };

  const handleVoidLog = async (id: string, type: string) => {
    if (!await showConfirm('Void Stock Log', `Are you sure you want to void this ${type} stock log? This will reverse the stock change.`)) return;
    
    const isOffline = !isOnline;
    let networkFailed = false;

    try {
      if (!isOffline) {
        try {
          const res = await fetch(`/api/stock/movement/${id}`, { method: 'DELETE' });
          if (res.ok) {
            showToast('success', 'Stock log has been voided and stock restored.');
            fetchLogs();
            fetchStats();
            fetchProducts();
            return;
          } else {
            const error = await res.json();
            showAlert('error', 'Action Failed', 'Failed to void: ' + error.error);
            return;
          }
        } catch (fetchErr) {
          console.warn('Network error, falling back to offline mode', fetchErr);
          networkFailed = true;
        }
      }

      if (isOffline || networkFailed) {
        await addSyncTask('stock', 'DELETE', { id, type });
        showToast('offline', 'Void queued offline — will sync when connected');
        setLogs(prev => prev.filter(l => l.id !== id));
      }
    } catch {
      showAlert('error', 'Action Failed', 'Failed to void stock log.');
    }
  };

  const filteredLogs = logs.filter(l => {
    const matchesSearch = l.product.toLowerCase().includes(search.toLowerCase()) || 
                          l.sku.toLowerCase().includes(search.toLowerCase()) ||
                          (l.reference || '').toLowerCase().includes(search.toLowerCase());
    
    let matchesDate = true;
    if (dateFilter) {
      const logDate = new Date(l.date);
      const year = logDate.getFullYear();
      const month = String(logDate.getMonth() + 1).padStart(2, '0');
      const day = String(logDate.getDate()).padStart(2, '0');
      matchesDate = `${year}-${month}-${day}` === dateFilter;
    }
    
    let matchesCategory = true;
    if (tableCategoryFilter !== 'ALL') {
      matchesCategory = l.category === tableCategoryFilter;
    }
    
    const matchesType = typeFilter === 'ALL' || l.type === typeFilter;
    
    let matchesSource = true;
    if (sourceFilter === 'STOCK_IN') {
      matchesSource = l.type === 'IN' && ['RECEIVE', 'MANUAL'].includes(l.source);
    } else if (sourceFilter === 'STOCK_OUT') {
      matchesSource = l.type === 'OUT' && l.source === 'MANUAL';
    } else if (sourceFilter !== 'ALL') {
      matchesSource = l.source === sourceFilter;
    }
    
    const matchesVoided = showVoided ? !!l.isVoided : !l.isVoided;
    
    return matchesSearch && matchesDate && matchesCategory && matchesType && matchesSource && matchesVoided;
  });

  const inReceiveCount = logs.filter(l => l.type === 'IN' && !l.isVoided).length;
  const outIssueCount = logs.filter(l => l.type === 'OUT').length;
  const walkInHomeCount = logs.filter(l => l.source === 'WALK_IN_HOME').length;
  const auditCount = logs.filter(l => l.source === 'AUDIT').length;
  const disposalCount = logs.filter(l => l.source === 'EXPIRY_TRACKING').length;

  const formatCount = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
  };

  const editReasons = editingLog?.type === 'IN' ? inReasons : outReasons;
  const timeframeLabel = statsTimeframe === 'today' ? 'Today' : statsTimeframe === 'week' ? 'This Week' : statsTimeframe === 'month' ? 'This Month' : statsTimeframe === 'year' ? 'This Year' : 'All Time';

  return (
    <>
      <div className="page-header" style={{ marginBottom: '16px' }}>
        <div>
          <h1 className="page-title">Stock In &amp; Out</h1>
          <p className="page-subtitle">Track and manage inventory movements</p>
        </div>
        <div className="page-header-actions" style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
          <button onClick={() => openModal('OUT')} className="btn btn-danger" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <ArrowUpRight size={18} />
            Issue Stock (Out)
          </button>
          <button onClick={() => openModal('IN')} className="btn btn-primary" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <ArrowDownRight size={18} />
            Receive Stock (In)
          </button>
        </div>
      </div>

      {!isOnline && (
        <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '14px', color: '#92400e', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={16} color="#d97706" style={{ flexShrink: 0 }} />
            Offline Mode — Showing local data. Changes will sync when reconnected.
          </span>
        </div>
      )}

      <div className="timeframe-container" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <select 
          id="stock-timeframe"
          name="statsTimeframe"
          aria-label="Select timeframe for stock stats"
          className="btn btn-outline timeframe-select" 
          style={{ width: 'auto', minWidth: '160px', appearance: 'auto', textAlign: 'left' }}
          value={statsTimeframe}
          onChange={(e) => {
            const val = e.target.value as 'today' | 'week' | 'month' | 'year' | 'all';
            setStatsTimeframe(val);
            fetchStats(val);
          }}
        >
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
          <option value="all">All Time</option>
        </select>
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
          <div className="stat-icon green"><ArrowDownRight size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Total Stock In</div>
            <div className="stat-value">{formatCount(stats.totalIn)}</div>
            <div className="stat-change positive">+{formatCount(stats.totalIn)} items ({timeframeLabel})</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon red"><ArrowUpRight size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Total Stock Out</div>
            <div className="stat-value">{formatCount(stats.totalOut)}</div>
            <div className="stat-change negative">-{formatCount(stats.totalOut)} items ({timeframeLabel})</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue"><Package size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Net Movement</div>
            <div className="stat-value">
              {formatCount(stats.totalIn - stats.totalOut)}
            </div>
            <div className="stat-change" style={{ color: (stats.totalIn - stats.totalOut) >= 0 ? 'var(--success-dark)' : 'var(--danger-dark)', background: 'transparent', padding: 0 }}>
              {(stats.totalIn - stats.totalOut) >= 0 ? `+${formatCount(stats.totalIn - stats.totalOut)} balance` : `${formatCount(stats.totalIn - stats.totalOut)} balance`} ({timeframeLabel})
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><Clock size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Total Transactions</div>
            <div className="stat-value">{formatCount(stats.logCount)}</div>
            <div className="stat-change neutral">{formatCount(stats.logCount)} logged ({timeframeLabel})</div>
          </div>
        </div>
      </div>
      )}

      {/* Movement History Table */}
      <div className="card">
        <div className="card-header filter-bar" style={{ display: 'flex', gap: '16px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div className="search-bar" style={{ flex: 1, minWidth: '240px', maxWidth: '400px' }}>
            <Search size={18} className="search-icon" />
            <input 
              id="stock-search"
              name="search"
              aria-label="Search by product, SKU, reference"
              type="text" 
              className="form-input" 
              placeholder="Search by product, SKU, reference..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="filter-dropdown-container" style={{ position: 'relative' }}>
            <button 
              onClick={() => setIsFilterOpen(!isFilterOpen)} 
              className="btn btn-outline filter-btn" 
              style={{ display: 'flex', gap: '8px', alignItems: 'center' }}
            >
              <Filter size={18} />
              Filter { (tableCategoryFilter !== 'ALL' || typeFilter !== 'ALL' || sourceFilter !== 'ALL' || dateFilter !== '' || showVoided) && <span style={{ width: '8px', height: '8px', background: 'var(--primary)', borderRadius: '50%' }}></span> }
            </button>

            {isFilterOpen && (
              <div className="filter-dropdown-menu" style={{
                position: 'absolute', top: '100%', right: 0, marginTop: '8px', zIndex: 50,
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
                padding: '20px', boxShadow: 'var(--shadow-xl)', width: '320px',
                backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)'
              }}>
                <h4 style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 600 }}>Filter Movements</h4>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label htmlFor="stock-table-category-filter" className="form-label" style={{ fontSize: '12px' }}>Category</label>
                  <select 
                    id="stock-table-category-filter"
                    name="tableCategoryFilter"
                    className="form-select"
                    value={tableCategoryFilter} 
                    onChange={(e) => setTableCategoryFilter(e.target.value)}
                  >
                    <option value="ALL">All Categories ({logs.length})</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.name}>
                        {cat.name} ({logs.filter(l => l.category === cat.name).length})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label htmlFor="stock-type-filter" className="form-label" style={{ fontSize: '12px' }}>Movement Type</label>
                  <select 
                    id="stock-type-filter"
                    name="typeFilter"
                    className="form-select"
                    value={typeFilter} 
                    onChange={(e) => setTypeFilter(e.target.value as 'ALL' | 'IN' | 'OUT')}
                  >
                    <option value="ALL">All Types</option>
                    <option value="IN">Receive Stock (IN)</option>
                    <option value="OUT">Issue Stock (OUT)</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label htmlFor="stock-source-filter" className="form-label" style={{ fontSize: '12px' }}>Source / Reason</label>
                  <select 
                    id="stock-source-filter"
                    name="sourceFilter"
                    className="form-select"
                    value={sourceFilter} 
                    onChange={(e) => setSourceFilter(e.target.value as any)}
                  >
                    <option value="ALL">All Sources</option>
                    <option value="STOCK_IN">Stock In / Deliveries ({inReceiveCount})</option>
                    <option value="STOCK_OUT">Stock Out / Issues ({outIssueCount})</option>
                    <option value="WALK_IN_HOME">Walk-in Sales ({walkInHomeCount})</option>
                    <option value="AUDIT">Inventory Audits ({auditCount})</option>
                    <option value="EXPIRY_TRACKING">Disposals / Expired ({disposalCount})</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label htmlFor="stock-date-filter" className="form-label" style={{ fontSize: '12px' }}>Date</label>
                  <input 
                    id="stock-date-filter"
                    name="dateFilter"
                    type="date" 
                    className="form-input" 
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label htmlFor="stock-show-voided" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: 500, color: 'var(--text-primary)' }}>
                    <input 
                      id="stock-show-voided"
                      name="showVoided"
                      type="checkbox" 
                      checked={showVoided} 
                      onChange={(e) => setShowVoided(e.target.checked)} 
                      style={{ accentColor: 'var(--primary)' }}
                    />
                    <label htmlFor="stock-show-voided" style={{ cursor: 'pointer' }}>Show Voided Only</label>
                  </label>
                </div>

                <button 
                  className="btn btn-outline" 
                  style={{ width: '100%' }}
                  onClick={() => {
                    setTableCategoryFilter('ALL');
                    setTypeFilter('ALL');
                    setSourceFilter('ALL');
                    setDateFilter('');
                    setShowVoided(false);
                    setIsFilterOpen(false);
                  }}
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="table-container">
          {loading ? (
            <table className="table stock-table mobile-stack">
              <thead>
                <tr>
                  <th style={{ width: '28%' }}>Product</th>
                  <th style={{ width: '16%' }}>Date &amp; Time</th>
                  <th style={{ width: '11%' }}>Type</th>
                  <th style={{ width: '11%', textAlign: 'right' }}>Quantity</th>
                  <th style={{ width: '22%' }}>Reference</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {Array(5).fill(0).map((_, idx) => (
                  <tr key={idx}>
                    <td><div className="skeleton" style={{ height: '20px', width: '80%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '60%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '50%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '40%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '70%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '50%' }} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="table stock-table mobile-stack">
              <thead>
                <tr>
                  <th style={{ width: '28%' }}>Product</th>
                  <th style={{ width: '16%' }}>Date &amp; Time</th>
                  <th style={{ width: '11%' }}>Type</th>
                  <th style={{ width: '11%', textAlign: 'right' }}>Quantity</th>
                  <th style={{ width: '22%' }}>Reference</th>
                  <th style={{ width: '12%', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredLogs.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                      No stock movements recorded yet. Use the buttons above to log movements.
                    </td>
                  </tr>
                ) : (
                  filteredLogs.map((log) => {
                    const matchedProduct = products.find(p => p.id === log.productId);
                    const displayImage = log.image || matchedProduct?.image;
                    const isOfflinePending = String(log.id).startsWith('OFF-');

                    return (
                      <tr key={log.id} style={{ opacity: log.isVoided ? 0.6 : 1, textDecoration: log.isVoided ? 'line-through' : 'none' }}>
                        <td data-label="Product">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'flex-start', textAlign: 'left', width: '100%', minWidth: 0 }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '4px', overflow: 'hidden', background: 'var(--bg-hover)', border: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {displayImage ? (
                                <Image width={400} height={400} src={displayImage} alt={log.product} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>No Img</span>
                              )}
                            </div>
                            <div style={{ textAlign: 'left', minWidth: 0, flex: 1, overflow: 'hidden' }}>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '320px' }} title={log.product}>{log.product}</div>
                              <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '320px' }} title={log.sku}>{log.sku}{log.category ? ` • ${log.category}` : ''}</div>
                            </div>
                          </div>
                        </td>
                        <td data-label="Date &amp; Time">
                          <div>
                            <div suppressHydrationWarning style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600, whiteSpace: 'nowrap' }}>
                              {new Date(log.date).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}
                            </div>
                            <div suppressHydrationWarning style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px', fontWeight: 500, whiteSpace: 'nowrap' }}>
                              {new Date(log.date).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                            </div>
                          </div>
                        </td>
                        <td data-label="Type">
                          <span className={`badge ${log.type === 'IN' ? 'badge-success' : 'badge-danger'}`} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                            {log.type === 'IN' ? 'Stock In' : 'Stock Out'}
                          </span>
                        </td>
                        <td data-label="Quantity" style={{ textAlign: 'right', fontWeight: 600, color: log.type === 'IN' ? 'var(--success-dark)' : 'var(--danger-dark)', whiteSpace: 'nowrap' }}>
                          {log.type === 'IN' ? `+${log.quantity}` : `-${log.quantity}`} {matchedProduct?.unit || 'Base'}
                        </td>
                        <td data-label="Reference">
                          <div style={{ color: 'var(--text-secondary)', fontSize: '13px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', textOverflow: 'ellipsis', wordBreak: 'break-word', lineHeight: '1.4' }} title={log.reference || '-'}>
                            {log.reference || '-'}
                          </div>
                          {isOfflinePending && (
                            <span style={{ fontSize: '10px', background: 'rgba(245, 158, 11, 0.15)', color: '#b45309', padding: '2px 6px', borderRadius: '4px', fontWeight: 600, display: 'inline-block', marginTop: '2px' }}>
                              Pending Sync
                            </span>
                          )}
                        </td>
                        <td data-label="Actions" style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            {/* Edit Button */}
                            {isAdmin && !log.isVoided && (
                              <button
                                className="btn btn-icon"
                                onClick={() => {
                                  const prod = products.find(p => p.id === log.productId);
                                  setEditingLog(log);
                                  const parsedReason = log.reference ? log.reference.split(' (')[0] : '';
                                  setEditFormData({
                                    quantity: log.quantity,
                                    reason: parsedReason || (log.type === 'IN' ? 'New Stock Delivery' : 'Damage/Spoilage'),
                                    productId: log.productId
                                  });
                                  setEditSelectedUomId('BASE');
                                  setEditExpiryDate('');
                                  setIsEditModalOpen(true); 
                                }}
                                data-tooltip="Edit Stock Movement"
                                style={{ 
                                  width: '34px', height: '34px', padding: 0,
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  background: 'var(--bg-main)',
                                  border: '1px solid var(--border)',
                                  color: 'var(--text-secondary)',
                                  borderRadius: '6px',
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-main)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                              >
                                <Edit size={16} />
                              </button>
                            )}

                            {/* Void Button */}
                            {(!lockStockVoid || isAdmin) && !log.isVoided && (
                              <button
                                className="btn btn-icon"
                                onClick={() => handleVoidLog(log.id, log.type)}
                                data-tooltip="Void Stock Log"
                                style={{ 
                                  width: '34px', height: '34px', padding: 0,
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  background: 'var(--bg-main)',
                                  border: '1px solid var(--border)',
                                  color: 'var(--danger)',
                                  borderRadius: '6px',
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                }}
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--danger)'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = 'var(--danger)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-main)'; e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Stock In/Out Modal */}
      <StockMovementModal
        isOpen={isModalOpen}
        modalType={modalType}
        products={products}
        categories={categories}
        inReasons={inReasons}
        outReasons={outReasons}
        isAdmin={isAdmin}
        isOnline={isOnline}
        userId={session?.user?.id}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleMovementSuccess}
        onSaveReasons={saveReasons}
      />

      {/* Edit Stock Movement Modal */}
      {isEditModalOpen && editingLog && (
        <div className="modal-overlay">
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <h2 className="modal-title">Edit Stock Movement</h2>
              <button className="btn btn-icon btn-ghost" onClick={() => setIsEditModalOpen(false)} aria-label="Close dialog">
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleEditSubmit} className="modal-layout-form">
              <div className="modal-body">
                
                {/* Read-Only Product Summary */}
                {(() => {
                  const p = products.find(prod => prod.id === editingLog.productId);
                  if (!p) return null;
                  return (
                    <div style={{ padding: '16px', background: 'var(--bg-main)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', display: 'flex', gap: '16px', alignItems: 'center' }}>
                      <div style={{ width: '64px', height: '64px', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                        {p.image ? (
                          <Image width={400} height={400} src={p.image} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <Package size={28} color="var(--text-tertiary)" />
                        )}
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{p.name} <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: '12px' }}>({p.sku})</span></div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Type: <strong style={{ color: editingLog.type === 'IN' ? 'var(--success-dark)' : 'var(--danger-dark)' }}>{editingLog.type}</strong></div>
                        <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Unit: <strong style={{ color: 'var(--text-primary)' }}>{p.unit || 'pcs'}</strong></span>
                          <span style={{ color: 'var(--text-secondary)' }}>Available Stock: <strong style={{ color: (p.stock || 0) <= 0 ? 'var(--danger)' : 'var(--success-dark)' }}>{p.stock ?? 'N/A'}</strong></span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                <div className="form-group" style={{ marginTop: '16px' }}>
                  {(() => {
                    const p = products.find(prod => prod.id === editingLog.productId);
                    if (p && p.uoms && p.uoms.length > 0) {
                      return (
                        <div style={{ marginBottom: '16px' }}>
                          <label htmlFor="stock-edit-uom" className="form-label">{editingLog.type === 'IN' ? 'Receive By *' : 'Issue By *'}</label>
                          <select 
                            id="stock-edit-uom"
                            name="editUom"
                            className="form-select"
                            value={editSelectedUomId}
                            onChange={(e) => setEditSelectedUomId(e.target.value)}
                          >
                            <option value="BASE">{p.unit || 'pcs'} (Base Unit)</option>
                            {p.uoms.map(uom => (
                              <option key={uom.id || uom.name} value={uom.id || uom.name}>
                                {uom.name} ({uom.multiplier} {p.unit || 'pcs'})
                              </option>
                            ))}
                          </select>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {(() => {
                    const p = products.find(prod => prod.id === editingLog.productId);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const uomName = editSelectedUomId === 'BASE' ? (p?.unit || 'pcs') : (p?.uoms?.find((u: any) => (u.id || u.name) === editSelectedUomId)?.name || '');
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const multiplier = editSelectedUomId === 'BASE' ? 1 : (p?.uoms?.find((u: any) => (u.id || u.name) === editSelectedUomId)?.multiplier || 1);
                    return (
                      <>
                        <label htmlFor="stock-edit-quantity" className="form-label">Quantity * <span style={{ fontWeight: 400, fontSize: '12px', color: 'var(--text-tertiary)' }}>({uomName})</span></label>
                        <input 
                          id="stock-edit-quantity"
                          name="editQuantity"
                          type="number" 
                          required
                          min="1" 
                          className="form-input" 
                          value={editFormData.quantity || ''}
                          onChange={e => setEditFormData({...editFormData, quantity: parseInt(e.target.value) || 0})}
                          onWheel={(e) => (e.target as HTMLElement).blur()}
                        />
                        {p && editSelectedUomId !== 'BASE' && (
                          <div style={{ marginTop: '8px', padding: '8px 12px', background: 'var(--success-light)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--success)', color: 'var(--success-dark)', fontSize: '12px', fontWeight: 500 }}>
                            Total {editingLog.type === 'IN' ? 'Added to' : 'Subtracted from'} Stocks: <strong>{editFormData.quantity * multiplier} {p.unit || 'pcs'}</strong>
                          </div>
                        )}
                        {editingLog.type === 'OUT' && p && (p.stock !== undefined) && ((editFormData.quantity * multiplier) - editingLog.quantity > p.stock) && (
                          <p style={{ marginTop: '6px', fontSize: '12px', color: 'var(--danger)', fontWeight: 500 }}>
                            <AlertTriangle size={14} style={{ display: 'inline', marginBottom: '-2px', marginRight: '4px' }} />
                            Warning: Increasing this issue by {(editFormData.quantity * multiplier) - editingLog.quantity} exceeds available base stock ({p.stock} {p.unit || 'pcs'} available)
                          </p>
                        )}
                      </>
                    );
                  })()}
                </div>
                
                {editingLog.type === 'IN' && (
                  <div className="form-group">
                    <label htmlFor="stock-edit-expiry" className="form-label">Expiry Date (Optional Override)</label>
                    <input 
                      id="stock-edit-expiry"
                      name="editExpiry"
                      type="date" 
                      className="form-input" 
                      value={editExpiryDate}
                      onChange={e => setEditExpiryDate(e.target.value)}
                    />
                  </div>
                )}

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label htmlFor="stock-edit-reason" className="form-label" style={{ marginBottom: 0 }}>Reference *</label>
                    {isAdmin && (
                      <button type="button" onClick={() => setEditManageReasonType(editingLog.type as 'IN' | 'OUT')} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 'var(--font-xs)', fontWeight: 600, cursor: 'pointer' }}>
                        Edit Reference List
                      </button>
                    )}
                  </div>
                  <select 
                    id="stock-edit-reason"
                    name="editReason"
                    aria-label="Reference"
                    className="form-select" 
                    required
                    value={editFormData.reason}
                    onChange={e => setEditFormData({...editFormData, reason: e.target.value})}
                  >
                    {editReasons.map(r => <option key={r} value={r}>{r}</option>)}
                    {editFormData.reason && !editReasons.includes(editFormData.reason) && (
                      <option value={editFormData.reason}>{editFormData.reason}</option>
                    )}
                  </select>
                </div>
              </div>
              
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsEditModalOpen(false)}>
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={actionLoading}
                  className="btn btn-primary"
                >
                  <Save size={18} style={{ marginRight: '8px' }} />
                  {actionLoading ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manage Reasons Modal (from Edit modal) */}
      {editManageReasonType && (
        <ManageReasonsModal
          type={editManageReasonType}
          reasons={editManageReasonType === 'IN' ? inReasons : outReasons}
          onClose={() => setEditManageReasonType(null)}
          onUpdate={(updated) => {
            if (editManageReasonType === 'IN') {
              setInReasons(updated);
              if (!updated.includes(editFormData.reason)) {
                setEditFormData(prev => ({ ...prev, reason: updated[0] || '' }));
              }
              saveReasons(updated, outReasons);
            } else {
              setOutReasons(updated);
              if (!updated.includes(editFormData.reason)) {
                setEditFormData(prev => ({ ...prev, reason: updated[0] || '' }));
              }
              saveReasons(inReasons, updated);
            }
          }}
        />
      )}
    </>
  );
}
