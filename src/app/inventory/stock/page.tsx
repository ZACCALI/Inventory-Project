'use client';

import { useState, useEffect, useRef } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { db } from '@/lib/db';
import { addSyncTask } from '@/lib/offlineSync';
import { useSession } from 'next-auth/react';
import {   Search, ArrowDownRight, ArrowUpRight, Clock, X, Trash2, ChevronDown, Package, Edit, Save, Filter,    AlertTriangle } from 'lucide-react';
import { useAlert } from '@/components/AlertModal';
import Image from "next/image";
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

interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  category: { name: string } | null;
  image?: string | null;
  unit?: string;
  stock?: number;
  price?: number;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  uoms?: any[];
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

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalType, setModalType] = useState<'IN' | 'OUT'>('IN');
  const [formData, setFormData] = useState({ sku: '', quantity: 1, reason: '', expiryDate: '', batchNumber: '' });
  const [selectedUomId, setSelectedUomId] = useState<string>('BASE');
  const [actionLoading, setActionLoading] = useState(false);
  const [lockStockVoid, setLockStockVoid] = useState(true); // default to true (locked)
  
  const [inReasons, setInReasons] = useState(['New Stock Delivery', 'Customer Return', 'Inventory Adjustment', 'Transfer In', 'Other']);
  const [outReasons, setOutReasons] = useState(['Damage/Spoilage', 'Expired', 'Internal Use', 'Inventory Adjustment', 'Customer Order', 'Transfer Out', 'Other']);
  const [manageReasonType, setManageReasonType] = useState<'IN' | 'OUT' | null>(null);
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingLog, setEditingLog] = useState<StockLog | null>(null);
  const [editFormData, setEditFormData] = useState({ quantity: 1, reason: '', productId: '' });
  const [editManageReasonType, setEditManageReasonType] = useState<'IN' | 'OUT' | null>(null);
  const [editSelectedUomId, setEditSelectedUomId] = useState<string>('BASE');
  const [editExpiryDate, setEditExpiryDate] = useState('');

  // Dashboard Stats State
  const [statsTimeframe, setStatsTimeframe] = useState<'today' | 'week' | 'month' | 'year' | 'all'>('today');
  const [stats, setStats] = useState({ totalIn: 0, totalOut: 0, logCount: 0 });

  // Product Dropdown State
  const [productSearch, setProductSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const { data: swrRes } = useSWR('/api/stock/movement', fetcher);

  useEffect(() => {
    const applyOfflineTasks = async () => {
      let finalLogs: StockLog[] = [];
      if (swrRes) {
        finalLogs = Array.isArray(swrRes) ? [...swrRes] : [];
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
            // Don't duplicate entries already in the server list
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

  // Stop skeleton after 2s if we're offline with no cache
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
    } catch (error: unknown) {
      if ((error as Error)?.message === 'Failed to fetch' || error instanceof TypeError) return;
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      setProducts(Array.isArray(data) ? data : []);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/categories');
      if (res.ok) {
        const data = await res.json();
        setCategories(data);
      }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        const data = await res.json();
        if (data.stockInReasons) {
          try { setInReasons(JSON.parse(data.stockInReasons)); } catch {}
        }
        if (data.stockOutReasons) {
          try { setOutReasons(JSON.parse(data.stockOutReasons)); } catch {}
        }
        if (data.lockStockVoid !== undefined) {
          setLockStockVoid(data.lockStockVoid);
        }
      }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
    }
  };

  const saveReasons = async (newInReasons: string[], newOutReasons: string[]) => {
    try {
      await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stockInReasons: JSON.stringify(newInReasons),
          stockOutReasons: JSON.stringify(newOutReasons)
        })
      });
// eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
    }
  };

  const fetchStats = async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const res = await fetch(`/api/stock/stats?timeframe=${statsTimeframe}`);
      if (!res.ok) throw new Error('Network response was not ok');
      const data = await res.json();
      setStats(data);
    } catch (error: unknown) {
      if ((error as Error)?.message === 'Failed to fetch' || error instanceof TypeError) return;
    }
  };

  useEffect(() => {
    fetchLogs();
    fetchProducts();
    fetchCategories();
    fetchSettings();

    // Realtime Auto-Polling
    const interval = setInterval(() => {
      fetchLogs();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    fetchStats();
    
    // Realtime Auto-Polling for Stats
    const interval = setInterval(() => {
      fetchStats();
    }, 5000);
    return () => clearInterval(interval);
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsTimeframe]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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

  // Reset highlight when search or category changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [productSearch, categoryFilter]);

  const openModal = (type: 'IN' | 'OUT') => {
    setModalType(type);
    const defaultReason = type === 'IN' ? (inReasons[0] || '') : (outReasons[0] || '');
    setFormData({ sku: '', quantity: 1, reason: defaultReason, expiryDate: '', batchNumber: '' });
    setSelectedProduct(null);
    setSelectedUomId('BASE');
    setProductSearch('');
    setCategoryFilter('ALL');
    setIsModalOpen(true);
  };

  const selectProduct = async (product: Product) => {
    setSelectedProduct(product);
    setSelectedUomId('BASE');
    setProductSearch(product.name);
    setIsDropdownOpen(false);
    
    if (modalType === 'IN') {
       try {
         const pendingBatches = await db.syncQueue.where('syncStatus').anyOf(['pending', 'failed']).toArray();
         const offlineCount = pendingBatches.filter(t => t.type === 'stock' && t.action === 'CREATE' && JSON.parse(t.payload).productId === product.id).length;
         
         let serverCount = 0;
         let isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
         
         if (!isOffline) {
           const res = await fetch(`/api/batches?productId=${product.id}&all=true`).catch(() => null);
           if (res && res.ok) {
             const batches = await res.json();
             serverCount = batches.length;
           }
         }
         
         setFormData({ ...formData, sku: product.sku, batchNumber: String(serverCount + offlineCount + 1) });
       } catch (e) {
         setFormData({ ...formData, sku: product.sku, batchNumber: '1' });
       }
    } else {
       setFormData({ ...formData, sku: product.sku });
    }
  };

  const filteredProductList = products.filter(p => {
    if (categoryFilter !== 'ALL' && p.category?.name !== categoryFilter) return false;
    const q = productSearch.toLowerCase();
    return p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || (p.barcode || '').toLowerCase().includes(q);
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isDropdownOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') setIsDropdownOpen(true);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev < filteredProductList.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredProductList.length > 0 && highlightedIndex >= 0) {
        selectProduct(filteredProductList[highlightedIndex]);
      }
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProduct) {
      showAlert('error', 'Action Failed', 'Please select a product from the list.');
      return;
    }
    setActionLoading(true);

    try {
      const determineSource = modalType === 'IN' ? 'RECEIVE' : 'MANUAL';
      
// eslint-disable-next-line @typescript-eslint/no-explicit-any
      const multiplier = selectedUomId === 'BASE' ? 1 : (selectedProduct.uoms?.find((u: any) => (u.id || u.name) === selectedUomId)?.multiplier || 1);
      const finalQuantity = formData.quantity * multiplier;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
      const selectedUomName = selectedUomId === 'BASE' ? (selectedProduct.unit || 'pcs') : (selectedProduct.uoms?.find((u: any) => (u.id || u.name) === selectedUomId)?.name || 'units');
      const actionText = modalType === 'IN' ? 'Received' : 'Issued';
      const formattedReason = `${formData.reason} (${actionText} ${formData.quantity} ${selectedUomName})`;

      const payload: any = {
        productId: selectedProduct.id,
        type: modalType,
        quantity: finalQuantity,
        reason: formattedReason,
        source: determineSource,
        expiryDate: modalType === 'IN' ? formData.expiryDate : undefined,
        batchNumber: modalType === 'IN' ? formData.batchNumber : undefined,
        userId: session?.user?.id
      };

      let isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      let networkFailed = false;

      if (!isOffline) {
        try {
          const moveRes = await fetch('/api/stock/movement', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (moveRes.ok) {
            setIsModalOpen(false);
            fetchLogs();
            fetchStats();
            fetchProducts();
            return;
          } else {
            const error = await moveRes.json();
            showAlert('error', 'Action Failed', 'Error: ' + error.error);
            return;
          }
        } catch (error) {
          console.warn('Network error detected, falling back to offline mode', error);
          networkFailed = true;
        }
      }

      if (isOffline || networkFailed) {
        payload.id = `OFF-${Date.now()}`;
        await addSyncTask('stock', 'CREATE', payload);
        setIsModalOpen(false);
        showAlert('success', 'Action queued offline', 'Your stock movement will sync when you reconnect.');
        
        // Optimistically update product stock count
        setProducts(prev => prev.map(p => {
          if (p.id !== selectedProduct.id) return p;
          const delta = modalType === 'IN' ? finalQuantity : -finalQuantity;
          return { ...p, stock: Math.max(0, (p.stock || 0) + delta) };
        }));

        // Optimistically update stats cards
        setStats(prev => ({
          ...prev,
          totalIn: modalType === 'IN' ? prev.totalIn + finalQuantity : prev.totalIn,
          totalOut: modalType === 'OUT' ? prev.totalOut + finalQuantity : prev.totalOut,
          logCount: prev.logCount + 1
        }));
        return;
      }

    } catch (error) {
      showAlert('error', 'Action Failed', 'Failed to process stock movement');
    } finally {
      setActionLoading(false);
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

      let isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      showAlert('error', 'Action Failed', 'Failed to update stock movement');
    } finally {
      setActionLoading(false);
    }
  };

  const handleVoidLog = async (id: string, type: string) => {
    if (!await showConfirm('Void Stock Log', `Are you sure you want to void this ${type} stock log? This will reverse the stock change.`)) return;
    
    let isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
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
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  const manualCount = logs.filter(l => l.source === 'MANUAL').length;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  const receiveCount = logs.filter(l => l.source === 'RECEIVE').length;
  const auditCount = logs.filter(l => l.source === 'AUDIT').length;
  const disposalCount = logs.filter(l => l.source === 'EXPIRY_TRACKING').length;

  const formatCount = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
  };

  const currentReasons = modalType === 'IN' ? inReasons : outReasons;
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

      <div className="timeframe-container" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '16px' }}>
        <select 
          id="stock-timeframe"
          name="statsTimeframe"
          aria-label="Select timeframe for stock stats"
          className="btn btn-outline timeframe-select" 
          style={{ width: 'auto', minWidth: '160px', appearance: 'auto', textAlign: 'left' }}
          value={statsTimeframe}
          onChange={(e) => setStatsTimeframe(e.target.value as "month" | "week" | "year" | "all" | "today")}
        >
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
          <option value="year">This Year</option>
          <option value="all">All Time</option>
        </select>
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
          <div className="stat-icon green"><ArrowDownRight size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Stock Received</div>
            <div className="stat-value">{formatCount(stats.totalIn)} items</div>
            <div className="stat-change" style={{ color: 'var(--text-tertiary)', background: 'transparent', padding: 0, fontWeight: 500, marginTop: '4px' }}>{timeframeLabel}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon red"><ArrowUpRight size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Stock Issued</div>
            <div className="stat-value">{formatCount(stats.totalOut)} items</div>
            <div className="stat-change" style={{ color: 'var(--text-tertiary)', background: 'transparent', padding: 0, fontWeight: 500, marginTop: '4px' }}>{timeframeLabel}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue"><Clock size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Total Movement Logs</div>
            <div className="stat-value">{formatCount(stats.logCount)}</div>
            <div className="stat-change" style={{ color: 'var(--text-tertiary)', background: 'transparent', padding: 0, fontWeight: 500, marginTop: '4px' }}>{timeframeLabel}</div>
          </div>
        </div>
      </div>
      )}

      <div className="card">
        <div className="card-header filter-bar" style={{ paddingTop: '24px', display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'center' }}>
          
          <div className="search-bar" style={{ flex: 1, maxWidth: '400px' }}>
            <Search size={18} className="search-icon" />
            <input 
              id="stock-search"
              name="search"
              aria-label="Search product or ref"
              type="text" 
              className="form-input" 
              placeholder="Search product or ref..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          
          <div className="filter-dropdown-container" style={{ position: 'relative' }}>
            <button 
              onClick={() => setIsFilterOpen(!isFilterOpen)} 
              className="btn btn-outline filter-btn" 
              style={{ display: 'flex', gap: '8px', alignItems: 'center', width: '100%', justifyContent: 'center' }}
            >
              <Filter size={18} />
              Filter { (typeFilter !== 'ALL' || sourceFilter !== 'ALL' || tableCategoryFilter !== 'ALL' || dateFilter !== '') && <span style={{ width: '8px', height: '8px', background: 'var(--primary)', borderRadius: '50%' }}></span> }
            </button>

            {isFilterOpen && (
              <div className="filter-dropdown-menu" style={{
                position: 'absolute', top: '100%', right: 0, marginTop: '8px', zIndex: 50,
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
                padding: '20px', boxShadow: 'var(--shadow-xl)', width: '300px',
                backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)'
              }}>
                <h4 style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 600 }}>Filter Stock Logs</h4>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label htmlFor="stock-movement-type" className="form-label" style={{ fontSize: '12px' }}>Movement Type</label>
                  <select 
                    id="stock-movement-type"
                    name="typeFilter"
                    className="form-select"
                    value={typeFilter}
                    onChange={(e) => setTypeFilter(e.target.value as "OUT" | "IN" | "ALL")}
                  >
                    <option value="ALL">All Types</option>
                    <option value="IN">Stock In ({formatCount(inReceiveCount)})</option>
                    <option value="OUT">Stock Out ({formatCount(outIssueCount)})</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label htmlFor="stock-source-type" className="form-label" style={{ fontSize: '12px' }}>Source or Module Type</label>
                  <select 
                    id="stock-source-type"
                    name="sourceFilter"
                    className="form-select"
                    value={sourceFilter}
                    onChange={(e) => setSourceFilter(e.target.value as "WALK_IN_STORE" | "WALK_IN_HOME" | "AUDIT" | "EXPIRY_TRACKING" | "ALL" | "STOCK_IN" | "STOCK_OUT")}
                  >
                    <option value="ALL">All Sources</option>
                    <option value="STOCK_IN">Stock In ({formatCount(logs.filter(l => l.type === 'IN' && ['RECEIVE', 'MANUAL'].includes(l.source)).length)})</option>
                    <option value="STOCK_OUT">Stock Out ({formatCount(logs.filter(l => l.type === 'OUT' && l.source === 'MANUAL').length)})</option>
                    <option value="EXPIRY_TRACKING">Expiry Tracking ({formatCount(disposalCount)})</option>
                    <option value="WALK_IN_HOME">Walk in Home ({formatCount(walkInHomeCount)})</option>
                    <option value="AUDIT">Barcode Scanner ({formatCount(auditCount)})</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label htmlFor="stock-category-filter" className="form-label" style={{ fontSize: '12px' }}>Category</label>
                  <select 
                    id="stock-category-filter"
                    name="tableCategoryFilter"
                    className="form-select"
                    value={tableCategoryFilter}
                    onChange={(e) => setTableCategoryFilter(e.target.value)}
                  >
                    <option value="ALL">All Categories</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.name}>
                        {c.name} ({formatCount(logs.filter(l => l.category === c.name).length)})
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label htmlFor="stock-date-filter" className="form-label" style={{ fontSize: '12px' }}>Date</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <input 
                      id="stock-date-filter"
                      name="dateFilter"
                      type="date"
                      className="form-input"
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value)}
                      data-tooltip="Filter by Date"
                      style={{ flex: 1 }}
                    />
                    {dateFilter && (
                      <button 
                        className="btn btn-icon btn-ghost" 
                        onClick={() => setDateFilter('')}
                        data-tooltip="Clear date filter"
                        style={{ color: 'var(--danger)', flexShrink: 0 }}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input 
                    type="checkbox" 
                    id="showVoidedToggle"
                    name="showVoidedToggle"
                    aria-label="Show Voided Only"
                    checked={showVoided}
                    onChange={(e) => setShowVoided(e.target.checked)}
                    style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                  />
                  <label htmlFor="showVoidedToggle" className="form-label" style={{ marginBottom: 0, fontSize: '14px', cursor: 'pointer' }}>Show Voided Only</label>
                </div>

                <button
                  className="btn btn-outline"
                  style={{ width: '100%' }}
                  onClick={() => { setTypeFilter('ALL'); setSourceFilter('ALL'); setTableCategoryFilter('ALL'); setDateFilter(''); setShowVoided(true); setIsFilterOpen(false); }}
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="table-container">
          {loading ? (
             <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>
          ) : (
            <table className="table">
              <thead>
                <tr>
                  <th>Product Details</th>
                  <th>Date / Time</th>
                  <th>Type</th>
                  <th style={{ textAlign: 'right' }}>Quantity</th>
                  <th>Reference</th>
                  <th>User</th>
                  {(isAdmin || !lockStockVoid) && <th style={{ width: '50px' }}></th>}
                </tr>
              </thead>
              <tbody>
                {filteredLogs.map((movement) => {
                  const isProtected = ['WALK_IN_HOME', 'WALK_IN_STORE', 'DELIVERY'].includes(movement.source);
                  return (
                  <tr key={movement.id} style={{ opacity: movement.isVoided ? 0.6 : 1, background: movement.isVoided ? 'var(--bg-main)' : 'transparent' }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'flex-start', textAlign: 'left', width: '100%' }}>
                        <div style={{
                          width: '40px', height: '40px', borderRadius: 'var(--radius-md)',
                          background: 'var(--bg-main)', border: '1px solid var(--border)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'
                        }}>
                          {movement.image ? (
                            <Image width={400} height={400} src={movement.image} alt={movement.product} style={{ width: '100%', height: '100%', objectFit: 'cover', filter: movement.isVoided ? 'grayscale(100%)' : 'none' }}  />
                          ) : (
                            <Package size={20} color="var(--text-tertiary)" />
                          )}
                        </div>
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontWeight: 600, color: movement.isVoided ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>{movement.product}</div>
                          <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)' }}>{movement.sku}</div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Date / Time" style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{new Date(movement.date).toLocaleString()}</td>
                    <td data-label="Type" style={{ whiteSpace: 'nowrap' }}>
                      {movement.type === 'IN' ? (
                        <span className="badge badge-success">IN (Receive)</span>
                      ) : (
                          <span className="badge badge-danger">OUT (Issue)</span>
                      )}
                    </td>
                    <td data-label="Quantity" style={{ textAlign: 'right', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                        <span style={{ color: movement.type === 'IN' ? 'var(--success-dark)' : 'var(--danger-dark)', textDecoration: movement.isVoided ? 'line-through' : 'none' }}>
                          {movement.type === 'IN' ? '+' : '-'}{movement.quantity}
                        </span>
                        {movement.isVoided && (
                          <span style={{ fontSize: '10px', color: 'var(--danger)', fontWeight: 800, letterSpacing: '0.5px', textTransform: 'uppercase' }}>Voided</span>
                        )}
                      </div>
                    </td>
                    <td data-label="Reference">
                      <div className="reference-cell-content">
                        <span style={{ 
                          color: movement.isVoided ? 'var(--text-tertiary)' : 'var(--text-link)', 
                          fontWeight: 500,
                          whiteSpace: 'normal',
                          wordBreak: 'break-word',
                          lineHeight: '1.2'
                        }}>
                          {movement.reference}
                        </span>
                        
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          {(() => {
                            const widgetStyle = (bg: string, text: string) => ({
                              backgroundColor: bg,
                              color: text,
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              fontSize: '11px',
                              fontWeight: 600,
                              letterSpacing: '0.2px',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                            });
                            
                            if (movement.source === 'WALK_IN_HOME') return <span style={widgetStyle('#4f46e5', '#ffffff')}>Walk in Home</span>;
                            if (movement.source === 'AUDIT') return <span style={widgetStyle('#0ea5e9', '#ffffff')}>Barcode Scanner</span>;
                            if (movement.source === 'EXPIRY_TRACKING') return <span style={widgetStyle('#ef4444', '#ffffff')}>Expiry Tracking</span>;
                            if (movement.type === 'IN') return <span style={widgetStyle('#10b981', '#ffffff')}>Stock In</span>;
                            return <span style={widgetStyle('#ef4444', '#ffffff')}>Stock Out</span>;
                          })()}
                        </div>
                      </div>
                    </td>
                    <td data-label="User">{movement.user}</td>
                    {(isAdmin || !lockStockVoid) && (
                      <td data-label="Actions" style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                          {isAdmin && (
                            <button 
                              className="btn btn-icon" 
                            onClick={() => { 
                              setEditingLog(movement); 
                              
                              const refRegex = /\((Received|Issued) (\d+) (.+?)\)$/i;
                              const match = (movement.reference || '').match(refRegex);
                              
                              let originalUomName = 'BASE';
                              let parsedQuantity = movement.quantity;
                              let originalReason = movement.reference || '';
                              
                              if (match) {
                                parsedQuantity = parseInt(match[2]) || movement.quantity;
                                originalUomName = match[3];
                                originalReason = movement.reference.replace(/\s*\((Received|Issued).*\)$/i, '').trim();
                              }

                              const logProduct = products.find(p => p.id === movement.productId);
                              let uomIdToSet = 'BASE';
                              
                              if (logProduct && originalUomName !== logProduct.unit && originalUomName !== 'pcs' && originalUomName !== 'BASE') {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
                                const matchedUom = logProduct.uoms?.find((u: any) => u.name === originalUomName);
                                if (matchedUom) {
                                  uomIdToSet = matchedUom.id || matchedUom.name;
                                }
                              }

                              setEditSelectedUomId(uomIdToSet);
                              setEditFormData({ quantity: parsedQuantity, reason: originalReason, productId: movement.productId }); 
                              setEditExpiryDate('');
                              setIsEditModalOpen(true); 
                            }}
                            data-tooltip="Edit Reference"
                            style={{ 
                              width: '32px', height: '32px', padding: 0,
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
                          {(isAdmin || !lockStockVoid) && (
                            <button 
                              className="btn btn-icon" 
                              onClick={() => {
                                if (movement.isVoided) {
                                  showAlert('error', 'Already Voided', 'This log is already voided.');
                                } else if (isProtected) {
                                  showAlert('warning', 'Protected Log', 'This system log is tied directly to an Order. To reverse this, please go to the All Orders page and cancel the original Order.');
                                } else {
                                  handleVoidLog(movement.id, movement.type);
                                }
                              }}
                              data-tooltip={movement.isVoided ? 'Already voided' : isProtected ? 'Protected: Go to original module to cancel' : 'Void Log'}
                              style={{ 
                                width: '32px', height: '32px', padding: 0,
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                background: 'var(--bg-main)',
                                border: '1px solid var(--border)',
                                color: movement.isVoided ? 'currentColor' : (isProtected ? 'var(--text-tertiary)' : 'var(--danger)'),
                                borderRadius: '6px',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                              }}
                              onMouseEnter={(e) => { 
                                if(!movement.isVoided && !isProtected) {
                                  e.currentTarget.style.background = 'var(--danger)'; 
                                  e.currentTarget.style.color = '#FFFFFF'; 
                                  e.currentTarget.style.borderColor = 'var(--danger)'; 
                                } else {
                                  e.currentTarget.style.background = 'var(--bg-hover)';
                                }
                              }}
                              onMouseLeave={(e) => { 
                                e.currentTarget.style.background = 'var(--bg-main)'; 
                                e.currentTarget.style.color = movement.isVoided ? 'currentColor' : (isProtected ? 'var(--text-tertiary)' : 'var(--danger)'); 
                                e.currentTarget.style.borderColor = 'var(--border)'; 
                              }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )})}
                {filteredLogs.length === 0 && (
                  <tr><td colSpan={isAdmin ? 7 : 6} style={{textAlign: 'center', padding: '20px'}}>No logs found</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Stock In/Out Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <h2 className="modal-title">
                {modalType === 'IN' ? 'Receive Stock (In)' : 'Issue Stock (Out)'}
              </h2>
              <button className="btn btn-icon btn-ghost" onClick={() => setIsModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="modal-layout-form">
              <div className="modal-body">
                
                <div className="form-group">
                  <label htmlFor="stock-modal-category" className="form-label">Category Filter</label>
                  <select 
                    id="stock-modal-category"
                    name="modalCategory"
                    className="form-select"
                    value={categoryFilter}
                    onChange={(e) => {
                      setCategoryFilter(e.target.value);
                      setIsDropdownOpen(true);
                      if (dropdownRef.current) {
                        const input = dropdownRef.current.querySelector('input');
                        if (input) input.focus();
                      }
                    }}
                  >
                    <option value="ALL">All Categories</option>
                    {categories.map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="stock-modal-product-search" className="form-label">Select Product *</label>
                  <div ref={dropdownRef} style={{ position: 'relative' }}>
                    <div 
                      style={{ 
                        display: 'flex', alignItems: 'center', gap: '8px',
                        border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                        padding: '0 12px', background: 'var(--bg-card)',
                        cursor: 'text'
                      }}
                      onClick={() => setIsDropdownOpen(true)}
                    >
                      <Search size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                      <input 
                        id="stock-modal-product-search"
                        name="modalProductSearch"
                        aria-label="Search product"
                        type="text" 
                        className="form-input" 
                        style={{ border: 'none', padding: '10px 0', boxShadow: 'none' }}
                        placeholder="Search product name, SKU, or barcode..."
                        value={productSearch}
                        onKeyDown={handleKeyDown}
                        onChange={e => {
                          setProductSearch(e.target.value);
                          setIsDropdownOpen(true);
                          if (selectedProduct && e.target.value !== selectedProduct.name) {
                            setSelectedProduct(null);
                            setFormData({ ...formData, sku: '' });
                          }
                        }}
                        onFocus={() => setIsDropdownOpen(true)}
                      />
                      <ChevronDown size={16} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                    </div>

                    {isDropdownOpen && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 100,
                        background: 'var(--bg-card)', border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
                        maxHeight: '220px', overflowY: 'auto', marginTop: '4px'
                      }}>
                        {filteredProductList.length === 0 ? (
                          <div style={{ padding: '16px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '14px' }}>
                            No products found in this category
                          </div>
                        ) : (
                          filteredProductList.map((p, index) => (
                            <div 
                              key={p.id}
                              onClick={() => selectProduct(p)}
                              style={{
                                display: 'flex', alignItems: 'center', gap: '12px',
                                padding: '10px 16px', cursor: 'pointer',
                                background: highlightedIndex === index || selectedProduct?.id === p.id ? 'var(--primary-light)' : 'transparent',
                                transition: 'background 0.15s',
                              }}
                              onMouseEnter={() => setHighlightedIndex(index)}
                            >
                              <div style={{
                                width: '36px', height: '36px', borderRadius: 'var(--radius-md)',
                                background: 'var(--bg-main)', color: 'var(--text-tertiary)',
                                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                                border: '1px solid var(--border)', overflow: 'hidden'
                              }}>
                                {p.image ? (
                                  <Image width={400} height={400} src={p.image} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}  />
                                ) : (
                                  <Package size={18} />
                                )}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{p.name}</div>
                                <div style={{ fontSize: '12px', color: 'var(--text-tertiary)', display: 'flex', gap: '8px' }}>
                                  <span>SKU: {p.sku}</span>
                                  {p.category && <span style={{ color: 'var(--primary)' }}>• {p.category.name}</span>}
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                  {selectedProduct && (
                    <div style={{ marginTop: '12px', padding: '16px', background: 'var(--bg-main)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', display: 'flex', gap: '16px', alignItems: 'center' }}>
                      <div style={{ width: '64px', height: '64px', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                        {selectedProduct.image ? (
                          <Image width={400} height={400} src={selectedProduct.image} alt={selectedProduct.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}  />
                        ) : (
                          <Package size={28} color="var(--text-tertiary)" />
                        )}
                      </div>
                      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>{selectedProduct.name} <span style={{ fontWeight: 400, color: 'var(--text-tertiary)', fontSize: '12px' }}>({selectedProduct.sku})</span></div>
                        <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>Category: {selectedProduct.category?.name || 'Uncategorized'}</div>
                        <div style={{ display: 'flex', gap: '16px', fontSize: '12px' }}>
                          <span style={{ color: 'var(--text-secondary)' }}>Unit: <strong style={{ color: 'var(--text-primary)' }}>{selectedProduct.unit || 'pcs'}</strong></span>
                          <span style={{ color: 'var(--text-secondary)' }}>Available Stock: <strong style={{ color: (selectedProduct.stock || 0) <= 0 ? 'var(--danger)' : 'var(--success-dark)' }}>{selectedProduct.stock ?? 'N/A'}</strong></span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                
                <div className="form-group">
                  {selectedProduct && selectedProduct.uoms && selectedProduct.uoms.length > 0 && (
                    <div style={{ marginBottom: '16px' }}>
                      <label htmlFor="stock-modal-uom" className="form-label">{modalType === 'IN' ? 'Receive By *' : 'Issue By *'}</label>
                      <select 
                        id="stock-modal-uom"
                        name="modalUom"
                        className="form-select"
                        value={selectedUomId}
                        onChange={(e) => setSelectedUomId(e.target.value)}
                      >
                        <option value="BASE">{selectedProduct.unit || 'pcs'} (Base Unit)</option>
{/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {selectedProduct.uoms.map((uom: any) => (
                          <option key={uom.id || uom.name} value={uom.id || uom.name}>
                            {uom.name} ({uom.multiplier} {selectedProduct.unit || 'pcs'})
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <label htmlFor="stock-modal-quantity" className="form-label">Quantity * <span style={{ fontWeight: 400, fontSize: '12px', color: 'var(--text-tertiary)' }}>({selectedUomId === 'BASE' ? (selectedProduct?.unit || 'pcs') : (selectedProduct?.uoms?.find((u: { id?: string, name: string }) => (u.id || u.name) === selectedUomId)?.name || '')})</span></label>
                  <input 
                    id="stock-modal-quantity"
                    name="modalQuantity"
                    type="number" 
                    required
                    min="1"
                    className="form-input" 
                    value={formData.quantity || ''}
                    onChange={e => setFormData({...formData, quantity: parseInt(e.target.value) || 0})}
                    onWheel={(e) => (e.target as HTMLElement).blur()}
                  />
                  {selectedProduct && selectedUomId !== 'BASE' && (
                    <div style={{ marginTop: '8px', padding: '8px 12px', background: 'var(--success-light)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--success)', color: 'var(--success-dark)', fontSize: '12px', fontWeight: 500 }}>
{/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      Total {modalType === 'IN' ? 'Added to' : 'Subtracted from'} Stocks: <strong>{formData.quantity * (selectedProduct.uoms?.find((u: any) => (u.id || u.name) === selectedUomId)?.multiplier || 1)} {selectedProduct.unit || 'pcs'}</strong>
                    </div>
                  )}
{/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  {modalType === 'OUT' && selectedProduct && (selectedProduct.stock !== undefined) && (formData.quantity * (selectedUomId === 'BASE' ? 1 : (selectedProduct.uoms?.find((u: any) => (u.id || u.name) === selectedUomId)?.multiplier || 1))) > selectedProduct.stock && (
                    <p style={{ marginTop: '6px', fontSize: '12px', color: 'var(--danger)', fontWeight: 500 }}><AlertTriangle size={14} style={{ display: 'inline', marginBottom: '-2px', marginRight: '4px' }} /> Warning: Total quantity exceeds available base stock ({selectedProduct.stock} {selectedProduct.unit || 'pcs'} available)</p>
                  )}
                </div>
                
                {modalType === 'IN' && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    <div className="form-group">
                      <label htmlFor="stock-modal-expiry" className="form-label">Expiry Date *</label>
                      <input 
                        id="stock-modal-expiry"
                        name="modalExpiry"
                        type="date" 
                        required
                        className="form-input" 
                        value={formData.expiryDate}
                        onChange={e => setFormData({...formData, expiryDate: e.target.value})}
                      />
                    </div>
                    <div className="form-group">
                      <label htmlFor="stock-modal-batch" className="form-label">Batch / Lot Number</label>
                      <input 
                        id="stock-modal-batch"
                        name="modalBatch"
                        type="text" 
                        className="form-input" 
                        placeholder="e.g. BATCH-2023-A"
                        value={formData.batchNumber} 
                        onChange={(e) => setFormData({...formData, batchNumber: e.target.value})} 
                      />
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label htmlFor="stock-modal-reason" className="form-label" style={{ marginBottom: 0 }}>Reference *</label>
                    {isAdmin && (
                      <button type="button" onClick={() => setManageReasonType(modalType)} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 'var(--font-xs)', fontWeight: 600, cursor: 'pointer' }}>
                        Edit Reference
                      </button>
                    )}
                  </div>
                  <select 
                    id="stock-modal-reason"
                    name="modalReason"
                    aria-label="Reference"
                    className="form-select"
                    required
                    value={formData.reason}
                    onChange={e => setFormData({...formData, reason: e.target.value})}
                  >
                    {currentReasons.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </button>
                <button 
                  type="submit" 
                  disabled={actionLoading || !selectedProduct}
                  className={modalType === 'IN' ? 'btn btn-success' : 'btn btn-danger'}
                >
                  {actionLoading ? 'Processing...' : `Confirm ${modalType === 'IN' ? 'Receive' : 'Issue'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Stock Movement Modal */}
      {isEditModalOpen && editingLog && (
        <div className="modal-overlay">
          <div className="modal" role="dialog" aria-modal="true">
            <div className="modal-header">
              <h2 className="modal-title">Edit Stock Movement</h2>
              <button className="btn btn-icon btn-ghost" onClick={() => setIsEditModalOpen(false)}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleEditSubmit} className="modal-layout-form">
              <div className="modal-body">
                
                {/* Read-Only Product Summary */}
                {(() => {
                  const p = products.find(p => p.id === editingLog.productId);
                  if (!p) return null;
                  return (
                    <div style={{ padding: '16px', background: 'var(--bg-main)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', display: 'flex', gap: '16px', alignItems: 'center' }}>
                      <div style={{ width: '64px', height: '64px', borderRadius: 'var(--radius-md)', background: 'var(--bg-card)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                        {p.image ? (
                          <Image width={400} height={400} src={p.image} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}  />
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
                    const p = products.find(p => p.id === editingLog.productId);
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
{/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {p.uoms.map((uom: any) => (
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
                    const p = products.find(p => p.id === editingLog.productId);
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
                          <p style={{ marginTop: '6px', fontSize: '12px', color: 'var(--danger)', fontWeight: 500 }}><AlertTriangle size={14} style={{ display: 'inline', marginBottom: '-2px', marginRight: '4px' }} /> Warning: Increasing this issue by {(editFormData.quantity * multiplier) - editingLog.quantity} exceeds available base stock ({p.stock} {p.unit || 'pcs'} available)</p>
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

      {/* Manage Reasons Modal (from Stock In/Out modal) */}
      {manageReasonType && (
        <ManageReasonsModal
          type={manageReasonType}
          reasons={manageReasonType === 'IN' ? inReasons : outReasons}
          onClose={() => setManageReasonType(null)}
          onUpdate={(updated) => {
            if (manageReasonType === 'IN') {
              setInReasons(updated);
              if (!updated.includes(formData.reason)) {
                setFormData(prev => ({ ...prev, reason: updated[0] || '' }));
              }
              saveReasons(updated, outReasons);
            } else {
              setOutReasons(updated);
              if (!updated.includes(formData.reason)) {
                setFormData(prev => ({ ...prev, reason: updated[0] || '' }));
              }
              saveReasons(inReasons, updated);
            }
          }}
        />
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

function ManageReasonsModal({ type, reasons, onClose, onUpdate }: { type: 'IN' | 'OUT', reasons: string[], onClose: () => void, onUpdate: (updated: string[]) => void }) {
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { showAlert, showConfirm, showToast } = useAlert();
  const [inputValue, setInputValue] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [localReasons, setLocalReasons] = useState<string[]>([...reasons]);

  const title = type === 'IN' ? 'Manage Stock In Reasons' : 'Manage Stock Out Reasons';

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    const trimmed = inputValue.trim();

    if (editingIndex !== null) {
      // Update existing
      const updated = [...localReasons];
      updated[editingIndex] = trimmed;
      setLocalReasons(updated);
      onUpdate(updated);
      setEditingIndex(null);
    } else {
      // Add new
      if (localReasons.includes(trimmed)) {
        showAlert('error', 'Action Failed', 'This reason already exists.');
        return;
      }
      const updated = [...localReasons, trimmed];
      setLocalReasons(updated);
      onUpdate(updated);
    }
    setInputValue('');
  };

  const handleDelete = async (index: number) => {
    const name = localReasons[index];
    if (!await showConfirm('Confirm', `Delete "${name}"?`)) return;
    const updated = localReasons.filter((_, i) => i !== index);
    setLocalReasons(updated);
    onUpdate(updated);
    if (editingIndex === index) {
      setEditingIndex(null);
      setInputValue('');
    }
  };

  const handleEdit = (index: number) => {
    setEditingIndex(index);
    setInputValue(localReasons[index]);
  };

  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: '400px' }}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose}><X size={20} /></button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <form onSubmit={handleSave} className="manage-list-form">
            <div className="manage-list-input">
              <input 
                id="stock-manage-reason-input"
                name="reasonName"
                aria-label="Type reason name"
                type="text" 
                className="form-input" 
                placeholder="Type reason name..." 
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                required
                style={{ width: '100%' }}
              />
            </div>
            <div className="manage-list-actions">
              <button type="submit" className="btn btn-primary">
                {editingIndex !== null ? 'Update' : 'Add'}
              </button>
              {editingIndex !== null && (
                <button type="button" className="btn btn-secondary" onClick={() => { setEditingIndex(null); setInputValue(''); }}>
                  Cancel
                </button>
              )}
            </div>
          </form>
          
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflowY: 'auto', maxHeight: '350px' }}>
            {localReasons.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)' }}>No reasons found. Add one above!</div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {localReasons.map((reason, index) => {
                  const isEditing = editingIndex === index;
                  return (
                    <li 
                      key={index} 
                      style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center', 
                        padding: '12px 16px', 
                        borderBottom: '1px solid var(--border-light)', 
                        background: isEditing ? 'var(--primary-light)' : 'transparent',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={(e) => { if(!isEditing) e.currentTarget.style.background = 'var(--bg-hover)'; }}
                      onMouseLeave={(e) => { if(!isEditing) e.currentTarget.style.background = 'transparent'; }}
                    >
                      <span style={{ fontSize: '14px', fontWeight: isEditing ? 600 : 500, color: isEditing ? 'var(--primary)' : 'inherit' }}>
                        {reason}
                      </span>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button 
                          type="button" 
                          className="btn btn-icon" 
                          onClick={() => handleEdit(index)} 
                          data-tooltip="Edit"
                          style={{ 
                            width: '32px', height: '32px', padding: 0,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: 'var(--bg-main)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-secondary)',
                            borderRadius: '6px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                          }}
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-main)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                        ><Edit size={16} /></button>
                        <button 
                          type="button" 
                          className="btn btn-icon" 
                          onClick={() => handleDelete(index)} 
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
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

