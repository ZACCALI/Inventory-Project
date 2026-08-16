'use client';

import { useState, useEffect, useCallback } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { useSession } from 'next-auth/react';
import { Plus, Search, Edit, Trash2, Filter, Package, AlertTriangle, XCircle, Archive, RefreshCw } from 'lucide-react';
import { formatCurrency } from '@/lib/constants';
import { useAlert } from '@/components/AlertModal';
import { useDebounce } from '@/hooks/useDebounce';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useModalDismiss } from '@/hooks/useModalDismiss';
import { addSyncTask } from '@/lib/offlineSync';
import { db } from '@/lib/db';
import Image from "next/image";
import { ProductFormModal, Product, Category, Unit } from '@/components/inventory/ProductFormModal';
import { ManageListModal } from '@/components/inventory/ManageListModal';

const SETTINGS_CACHE_KEY = 'amroding_settings_cache';

const getCachedSettingsSync = () => {
  if (typeof window !== 'undefined') {
    try {
      const cached = localStorage.getItem(SETTINGS_CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch {}
  }
  return null;
};

export default function InventoryPage() {
  const { data: session } = useSession();
  const isAdmin = session?.user?.role?.toLowerCase() === 'admin';
 
  const { showAlert, showConfirm, showToast } = useAlert();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const isOnline = useOnlineStatus();

  // SWR for instant caching
  const { data: swrProducts, error: swrError } = useSWR(
    typeof window !== 'undefined' ? `/api/products${showArchived ? '?archived=true' : ''}` : null,
    fetcher,
    { refreshInterval: 15000 }
  );

  useEffect(() => {
    const applyOfflineTasks = async () => {
      try {
        const pendingTasks = await db.syncQueue
          .where('syncStatus')
          .anyOf(['pending', 'failed'])
          .toArray();

        let baseProducts: Product[] = [];
        if (swrProducts) {
          baseProducts = [...swrProducts];
        } else {
          try {
            const cached = await db.products.toArray();
            baseProducts = cached.map(p => ({
              id: p.id,
              name: p.name,
              sku: p.sku,
              barcode: p.barcode,
              price: p.price,
              costPrice: p.costPrice,
              stock: p.stock,
              image: p.image,
              category: p.categoryName ? { name: p.categoryName } : null,
              uoms: p.uoms || [],
              _count: { orderItems: 0, stockLogs: 0 }
            })) as unknown as Product[];
          } catch (err) {
            console.error('Failed to load products from Dexie cache', err);
          }
        }
        let modifiedProducts = [...baseProducts];

        // Apply pending product CRUD tasks
        for (const task of pendingTasks) {
          if (task.type !== 'product') continue;
          try {
            const payload = JSON.parse(task.payload);
            if (task.action === 'DELETE') {
              modifiedProducts = modifiedProducts.filter(p => p.id !== payload.id);
            } else if (task.action === 'UPDATE') {
              modifiedProducts = modifiedProducts.map(p => p.id === payload.id ? { ...p, ...payload } : p);
            } else if (task.action === 'CREATE') {
              if (!modifiedProducts.find(p => p.id === payload.id)) {
                modifiedProducts.unshift({ ...payload, _count: { orderItems: 0, stockLogs: 0 } } as unknown as Product);
              }
            }
          } catch {}
        }

        // Apply pending stock movements to adjust local product stock counts
        for (const task of pendingTasks) {
          if (task.type !== 'stock' || task.action !== 'CREATE') continue;
          try {
            const sp = JSON.parse(task.payload);
            modifiedProducts = modifiedProducts.map(p => {
              if (p.id !== sp.productId) return p;
              const delta = sp.type === 'IN' ? sp.quantity : -sp.quantity;
              return { ...p, stock: Math.max(0, (p.stock || 0) + delta) };
            });
          } catch {}
        }
        
        setProducts(modifiedProducts);
      } catch (err) {
        console.error('Failed to apply offline tasks', err);
        if (swrProducts) setProducts(swrProducts);
      } finally {
        setLoading(false);
      }
    };

    if (swrProducts || swrError || !isOnline) {
      applyOfflineTasks();
    }
  }, [swrProducts, swrError, isOnline]);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const initialSettings = getCachedSettingsSync();
  const [cleanupMode, setCleanupMode] = useState<boolean>(initialSettings?.cleanupMode ?? false);
  const [lockProductDelete, setLockProductDelete] = useState<boolean>(initialSettings?.lockProductDelete ?? true);
  const [lockProductEdit, setLockProductEdit] = useState<boolean>(initialSettings?.lockProductEdit ?? false);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [initialBarcode, setInitialBarcode] = useState('');

  // Manage Modal State
  const [manageModal, setManageModal] = useState<'category' | 'unit' | null>(null);

  const fetchProducts = useCallback(async (archived = showArchived) => {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const res = await fetch(`/api/products${archived ? '?archived=true' : ''}`);
      if (!res.ok) throw new Error('Network response was not ok');
      const data = await res.json();
      setProducts(data);
    } catch (error: unknown) {
      if ((error as Error)?.message === 'Failed to fetch' || error instanceof TypeError) return; 
      console.error('Failed to fetch products', error);
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  const fetchDependencies = useCallback(async () => {
    try {
      const [catRes, unitRes, settingsRes] = await Promise.all([
        fetch('/api/categories').catch(() => null),
        fetch('/api/units').catch(() => null),
        fetch('/api/settings').catch(() => null)
      ]);
      const catData = catRes && catRes.ok ? await catRes.json() : [];
      const unitData = unitRes && unitRes.ok ? await unitRes.json() : [];
      let settingsData = settingsRes && settingsRes.ok ? await settingsRes.json() : null;
      
      let finalCats = Array.isArray(catData) && catData.length > 0 ? catData : [];
      if (finalCats.length === 0) {
        try {
          const cachedCats = await db.categories.toArray();
          finalCats = cachedCats.map(c => ({ id: c.id, name: c.name }));
        } catch {}
      }

      let finalUnits = Array.isArray(unitData) ? unitData : [];

      if (!settingsData) {
        try {
          const cachedSettings = await db.settings.get('current');
          if (cachedSettings?.data) {
            settingsData = JSON.parse(cachedSettings.data);
          }
        } catch {}
      }

      try {
        const pendingTasks = await db.syncQueue
          .where('syncStatus')
          .anyOf(['pending', 'failed'])
          .toArray();
          
        for (const task of pendingTasks) {
          const p = JSON.parse(task.payload);
          if (task.action === 'CREATE') {
            if (task.type === 'category' && !finalCats.find((c: { id: string }) => c.id === p.id)) {
              finalCats.push(p);
            } else if (task.type === 'unit' && !finalUnits.find((u: { id: string }) => u.id === p.id)) {
              finalUnits.push(p);
            }
          } else if (task.action === 'UPDATE') {
            if (task.type === 'category') finalCats = finalCats.map((c: { id: string }) => c.id === p.id ? { ...c, ...p } : c);
            else if (task.type === 'unit') finalUnits = finalUnits.map((u: { id: string }) => u.id === p.id ? { ...u, ...p } : u);
          } else if (task.action === 'DELETE') {
            if (task.type === 'category') finalCats = finalCats.filter((c: { id: string }) => c.id !== p.id);
            else if (task.type === 'unit') finalUnits = finalUnits.filter((u: { id: string }) => u.id !== p.id);
          }
        }
      } catch (e) {
        console.error('Failed to apply offline tasks to categories/units', e);
      }

      setCategories(finalCats);
      setUnits(finalUnits);
      if (settingsData) {
        try {
          localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(settingsData));
        } catch {}
        setCleanupMode(!!settingsData.cleanupMode);
        setLockProductDelete(settingsData.lockProductDelete ?? true);
        setLockProductEdit(settingsData.lockProductEdit ?? false);
      }
    } catch (error) {
      console.error('Failed to fetch dependencies', error);
    }
  }, []);

  useEffect(() => {
    const syncCachedSettings = async () => {
      try {
        const cached = await db.settings.get('current');
        if (cached?.data) {
          const parsed = JSON.parse(cached.data);
          try { localStorage.setItem(SETTINGS_CACHE_KEY, JSON.stringify(parsed)); } catch {}
          setCleanupMode(!!parsed.cleanupMode);
          setLockProductDelete(parsed.lockProductDelete ?? true);
          setLockProductEdit(parsed.lockProductEdit ?? false);
        }
      } catch {}
    };

    syncCachedSettings();

    const handleSettingsUpdated = () => {
      syncCachedSettings();
    };
    window.addEventListener('settingsUpdated', handleSettingsUpdated);
    return () => window.removeEventListener('settingsUpdated', handleSettingsUpdated);
  }, []);

  useEffect(() => {
    fetchDependencies();
    
    // Check for add new product from barcode scanner
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('add') === 'true') {
      const barcode = searchParams.get('barcode') || '';
      setInitialBarcode(barcode);
      setTimeout(() => {
        setEditingProduct(null);
        setIsModalOpen(true);
      }, 100);
    }

    const handleAppSync = () => {
      fetchProducts();
    };
    window.addEventListener('appDataSynced', handleAppSync);
    window.addEventListener('amroding:data-changed', handleAppSync);

    return () => {
      window.removeEventListener('appDataSynced', handleAppSync);
      window.removeEventListener('amroding:data-changed', handleAppSync);
    };
  }, [fetchDependencies, fetchProducts]);

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

  const filteredProducts = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(debouncedSearch.toLowerCase()) || p.sku.toLowerCase().includes(debouncedSearch.toLowerCase());
    let matchesStatus = true;
    if (statusFilter === 'out') matchesStatus = p.stock === 0;
    if (statusFilter === 'low') matchesStatus = p.stock > 0 && p.stock <= p.minStock;
    if (statusFilter === 'in') matchesStatus = p.stock > p.minStock;
    const matchesCategory = categoryFilter === 'all' || 
                            (categoryFilter === 'uncategorized' ? !p.categoryId : p.categoryId === categoryFilter);
    return matchesSearch && matchesStatus && matchesCategory;
  });

  const openModal = (product?: Product) => {
    setEditingProduct(product || null);
    setInitialBarcode('');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
    setInitialBarcode('');
  };

  useModalDismiss(!!manageModal, () => setManageModal(null));

  const handleProductSaved = (savedProduct: Product, isEditing: boolean) => {
    if (isEditing) {
      setProducts(prev => prev.map(p => p.id === savedProduct.id ? { ...p, ...savedProduct } : p));
    } else {
      setProducts(prev => [{ ...savedProduct, _count: { orderItems: 0, stockLogs: 0 } }, ...prev]);
    }
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    if (!await showConfirm(
      'Permanently Delete Product?', 
      `Permanently delete "${name}"?\n\n(Safe to delete: 0 sales, 0 stock logs.)\n\nThis cannot be undone.`
    )) return;
    try {
      const isOffline = !isOnline;
      let networkFailed = false;

      if (!isOffline) {
        try {
          const res = await fetch(`/api/products/${id}`, { method: 'DELETE' });
          if (res.ok) {
            await fetchProducts(showArchived);
            return;
          } else {
            const err = await res.json();
            showAlert('error', 'Action Failed', err.error || 'Failed to delete');
            return;
          }
        } catch (fetchErr) {
          console.warn('Network error detected, falling back to offline mode', fetchErr);
          networkFailed = true;
        }
      }

      if (isOffline || networkFailed) {
        await addSyncTask('product', 'DELETE', { id });
        showToast('offline', 'Action queued offline — will sync when connected');
        setProducts(prev => prev.filter(p => p.id !== id));
        return;
      }
    } catch (error: unknown) {
      console.error('Delete error', error);
      showAlert('error', 'Action Failed', (error as Error).message);
    }
  };

  const handleArchiveProduct = async (id: string, name: string) => {
    if (!await showConfirm('Confirm', `Are you sure you want to archive ${name}?`)) return;
    try {
      const isOffline = !isOnline;
      let networkFailed = false;

      if (!isOffline) {
        try {
          const res = await fetch(`/api/products/${id}`, { 
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isArchived: true }),
          });
          if (res.ok) {
            await fetchProducts(showArchived);
            return;
          } else {
            const err = await res.json();
            showAlert('error', 'Action Failed', err.error || 'Failed to archive');
            return;
          }
        } catch (fetchErr) {
          console.warn('Network error detected, falling back to offline mode', fetchErr);
          networkFailed = true;
        }
      }

      if (isOffline || networkFailed) {
        await addSyncTask('product', 'UPDATE', { id, isArchived: true });
        showToast('offline', 'Action queued offline — will sync when connected');
        setProducts(prev => prev.map(p => p.id === id ? { ...p, isArchived: true } : p));
        return;
      }
    } catch (error: unknown) {
      console.error('Archive error', error);
      showAlert('error', 'Action Failed', (error as Error).message);
    }
  };

  const handleUnarchiveProduct = async (id: string, name: string) => {
    if (!await showConfirm('Confirm', `Are you sure you want to unarchive ${name}?`)) return;
    try {
      const isOffline = !isOnline;
      let networkFailed = false;

      if (!isOffline) {
        try {
          const res = await fetch(`/api/products/${id}`, { 
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isArchived: false }),
          });
          if (res.ok) {
            await fetchProducts(showArchived);
            return;
          } else {
            const err = await res.json();
            showAlert('error', 'Action Failed', err.error || 'Failed to unarchive');
            return;
          }
        } catch (fetchErr) {
          console.warn('Network error detected, falling back to offline mode', fetchErr);
          networkFailed = true;
        }
      }

      if (isOffline || networkFailed) {
        await addSyncTask('product', 'UPDATE', { id, isArchived: false });
        showToast('offline', 'Action queued offline — will sync when connected');
        setProducts(prev => prev.map(p => p.id === id ? { ...p, isArchived: false } : p));
        return;
      }
    } catch (error: unknown) {
      console.error('Unarchive error', error);
      showAlert('error', 'Action Failed', (error as Error).message);
    }
  };

  const totalProducts = products.length;
  const lowStockAlerts = products.filter(p => p.stock <= p.minStock && p.stock > 0).length;
  const outOfStockAlerts = products.filter(p => p.stock <= 0).length;

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Inventory</h1>
          <p className="page-subtitle">Manage your product catalog and stock levels</p>
        </div>
        <div className="page-header-actions" style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={() => openModal()}>
            <Plus size={18} />
            Add Product
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
          <div className="stat-icon blue"><Package size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Total Products</div>
            <div className="stat-value">{totalProducts}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><AlertTriangle size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Low Stock Alerts</div>
            <div className="stat-value" style={{ color: lowStockAlerts > 0 ? 'var(--warning)' : 'inherit' }}>{lowStockAlerts} items</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon red"><XCircle size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Out of Stock</div>
            <div className="stat-value" style={{ color: outOfStockAlerts > 0 ? 'var(--danger)' : 'inherit' }}>{outOfStockAlerts} items</div>
          </div>
        </div>
      </div>
      )}

      <div className="card">
        <div className="card-header filter-bar" style={{ paddingTop: '16px', display: 'flex', flexWrap: 'wrap', gap: '16px', justifyContent: 'space-between', alignItems: 'center' }}>
          <div className="search-bar" style={{ flex: 1, maxWidth: '400px' }}>
            <Search size={18} className="search-icon" />
            <input 
              id="inventory-search"
              name="search"
              aria-label="Search products by name or SKU"
              type="text" 
              className="form-input" 
              placeholder="Search products by name or SKU..." 
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
              Filter { (categoryFilter !== 'all' || statusFilter !== 'all') && <span style={{ width: '8px', height: '8px', background: 'var(--primary)', borderRadius: '50%' }}></span> }
            </button>

            {isFilterOpen && (
              <div className="filter-dropdown-menu" style={{
                position: 'absolute', top: '100%', right: 0, marginTop: '8px', zIndex: 50,
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)',
                padding: '20px', boxShadow: 'var(--shadow-xl)', width: '300px',
                backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)'
              }}>
                <h4 style={{ marginBottom: '16px', fontSize: '14px', fontWeight: 600 }}>Filter Products</h4>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label htmlFor="inventory-category-filter" className="form-label" style={{ fontSize: '12px' }}>Category</label>
                  <select 
                    id="inventory-category-filter"
                    name="categoryFilter"
                    className="form-select" 
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                  >
                    <option value="all">All Categories ({products.length})</option>
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name} ({products.filter(p => p.categoryId === cat.id).length})
                      </option>
                    ))}
                    {products.some(p => !p.categoryId) && (
                      <option value="uncategorized">
                        Uncategorized ({products.filter(p => !p.categoryId).length})
                      </option>
                    )}
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label htmlFor="inventory-status-filter" className="form-label" style={{ fontSize: '12px' }}>Status</label>
                  <select 
                    id="inventory-status-filter"
                    name="statusFilter"
                    className="form-select" 
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">All Statuses</option>
                    <option value="in">In Stock</option>
                    <option value="low">Low Stock</option>
                    <option value="out">Out of Stock</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label htmlFor="inventory-show-archived" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: 500, color: 'var(--text-primary)' }}>
                    <input 
                      id="inventory-show-archived"
                      name="showArchived"
                      type="checkbox" 
                      checked={showArchived} 
                      onChange={(e) => setShowArchived(e.target.checked)} 
                      style={{ accentColor: 'var(--primary)' }}
                    />
                    <label htmlFor="inventory-show-archived" style={{ cursor: 'pointer' }}>Show Archived Only</label>
                  </label>
                </div>

                <button
                  className="btn btn-outline"
                  style={{ width: '100%' }}
                  onClick={() => { setCategoryFilter('all'); setStatusFilter('all'); setShowArchived(false); setIsFilterOpen(false); }}
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="table-container">
          <table className="table mobile-stack">
            <thead>
              <tr>
                <th style={{ width: '32%' }}>Product Details</th>
                <th style={{ width: '18%' }}>Category</th>
                <th style={{ textAlign: 'right', width: '14%' }}>Price</th>
                <th style={{ textAlign: 'right', width: '14%' }}>Stock</th>
                <th style={{ width: '12%' }}>Status</th>
                <th style={{ textAlign: 'right', width: '10%' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array(5).fill(0).map((_, idx) => (
                  <tr key={idx}>
                    <td><div className="skeleton" style={{ height: '20px', width: '80%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '60%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '70%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '90%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '50%' }} /></td>
                    <td><div className="skeleton" style={{ height: '20px', width: '50%' }} /></td>
                  </tr>
                ))
              ) : filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '40px', color: 'var(--text-tertiary)' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '100%', textAlign: 'center' }}>
                      No products found.
                    </div>
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => (
                  <tr key={product.id} style={{ opacity: product.isArchived ? 0.6 : 1 }}>
                    <td data-label="Product">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'flex-start', textAlign: 'left', width: '100%', minWidth: 0 }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '4px', overflow: 'hidden', background: 'var(--bg-hover)', border: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {product.image ? (
                            <Image width={400} height={400} src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}  />
                          ) : (
                            <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>No Img</span>
                          )}
                        </div>
                        <div style={{ textAlign: 'left', minWidth: 0, flex: 1, overflow: 'hidden' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '320px' }} title={product.name}>{product.name}</div>
                          <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '320px' }} title={product.sku}>{product.sku}</div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Category">{product.category?.name || '-'}</td>
                    <td data-label="Price" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        {/* Base Selling Price */}
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4px' }}>
                          <span style={{ color: 'var(--text-primary)', fontWeight: 500, fontSize: '15px' }}>{formatCurrency(product.price)}</span>
                          <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>/ {product.unit || 'Piece'}</span>
                        </div>
                        {/* Cost Price */}
                        {isAdmin && (
                          <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', background: 'var(--bg-hover)', padding: '2px 6px', borderRadius: '4px' }}>
                            Cost: {formatCurrency(product.costPrice)}
                          </div>
                        )}
                        {/* Bulk Pricing (if any) */}
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {product.uoms && product.uoms.filter((u: any) => !u.isBase).length > 0 && (
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                            {product.uoms.filter((u: any) => !u.isBase).map((uom: any) => (
                              <div key={uom.id || uom.name} style={{ fontSize: '10px', background: 'var(--primary-light)', color: 'var(--primary)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                {uom.name}: {formatCurrency(Number(uom.price))}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                    <td data-label="Stock" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                        {/* Primary Base Stock */}
                        <div style={{ 
                          fontWeight: 500, 
                          fontSize: '15px',
                          color: product.stock <= product.minStock ? 'var(--danger)' : 'var(--text-primary)' 
                        }}>
                          {product.stock} <span style={{ fontSize: '11px', fontWeight: 500, color: 'var(--text-tertiary)' }}>{product.unit || 'Base'}(s)</span>
                        </div>
                        
                        {/* Secondary Bulk Stock Estimation */}
                        {product.uoms && product.uoms.length > 0 && product.stock > 0 && (() => {
                          const sortedUoms = [...product.uoms].sort((a, b) => Number(b.multiplier) - Number(a.multiplier));
                          let remaining = product.stock;
                          const parts = [];
                          for (const uom of sortedUoms) {
                            const mult = Number(uom.multiplier);
                            if (mult > 1) {
                              const qty = Math.floor(remaining / mult);
                              if (qty > 0) {
                                parts.push(`${qty} ${uom.name}(s)`);
                                remaining %= mult;
                              }
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
                    <td data-label="Status" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {product.isArchived ? (
                        <span className="badge badge-neutral" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>Archived</span>
                      ) : product.stock === 0 ? (
                        <span className="badge badge-danger" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>Out of Stock</span>
                      ) : product.stock <= product.minStock ? (
                        <span className="badge badge-warning" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>Low Stock</span>
                      ) : (
                        <span className="badge badge-success" style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>In Stock</span>
                      )}
                    </td>
                    <td data-label="Actions" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                        {(!lockProductEdit || isAdmin) && (
                          <button 
                            className="btn btn-icon" 
                            onClick={() => openModal(product)}
                            data-tooltip="Edit Product"
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
                            <Edit size={18} />
                          </button>
                        )}
                        
                        {(() => {
                          const hasHistory = (product._count?.orderItems || 0) > 0 || (product._count?.stockLogs || 0) > 0;
                          
                          if (product.isArchived) {
                            return (
                              <button 
                                className="btn btn-icon" 
                                onClick={() => handleUnarchiveProduct(product.id, product.name)}
                                style={{ 
                                  width: '34px', height: '34px', padding: 0,
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  background: 'var(--bg-main)',
                                  border: '1px solid var(--border)',
                                  color: 'var(--success)',
                                  borderRadius: '6px',
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                }}
                                data-tooltip="Unarchive Product"
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--success)'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = 'var(--success)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-main)'; e.currentTarget.style.color = 'var(--success)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                              >
                                <RefreshCw size={18} />
                              </button>
                            );
                          } else if (isOnline && !swrProducts) {
                            return (
                              <div className="skeleton" style={{ width: '34px', height: '34px', borderRadius: '6px' }} />
                            );
                          } else if (hasHistory || !cleanupMode) {
                            if (lockProductDelete && !isAdmin) return null;
                            return (
                              <button 
                                className="btn btn-icon" 
                                onClick={() => handleArchiveProduct(product.id, product.name)}
                                style={{ 
                                  width: '34px', height: '34px', padding: 0,
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  background: 'var(--bg-main)',
                                  border: '1px solid var(--border)',
                                  color: 'var(--warning)',
                                  borderRadius: '6px',
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                }}
                                data-tooltip="Archive Product"
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--warning)'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = 'var(--warning)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-main)'; e.currentTarget.style.color = 'var(--warning)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                              >
                                <Archive size={18} />
                              </button>
                            );
                          } else {
                            if (lockProductDelete && !isAdmin) return null;
                            return (
                              <button 
                                className="btn btn-icon" 
                                onClick={() => handleDeleteProduct(product.id, product.name)}
                                style={{ 
                                  width: '34px', height: '34px', padding: 0,
                                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                  background: 'var(--bg-main)',
                                  border: '1px solid var(--border)',
                                  color: 'var(--danger)',
                                  borderRadius: '6px',
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                                }}
                                data-tooltip="Delete Product (Safe: 0 sales)"
                                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--danger)'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = 'var(--danger)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-main)'; e.currentTarget.style.color = 'var(--danger)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                              >
                                <Trash2 size={18} />
                              </button>
                            );
                          }
                        })()}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Product Form Modal */}
      <ProductFormModal
        isOpen={isModalOpen}
        editingProduct={editingProduct}
        categories={categories}
        units={units}
        products={products}
        isAdmin={isAdmin}
        isOnline={isOnline}
        initialBarcode={initialBarcode}
        onClose={closeModal}
        onSaved={handleProductSaved}
        onOpenManageModal={(type) => setManageModal(type)}
      />

      {/* Manage Categories / Units Modal */}
      {manageModal && (
        <ManageListModal
          type={manageModal}
          items={manageModal === 'category' ? categories : units}
          onClose={() => setManageModal(null)}
          onUpdate={fetchDependencies}
        />
      )}
    </>
  );
}
