'use client';

import { useState, useEffect, useCallback } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { useSession } from 'next-auth/react';
import { Plus, Search, Edit, Trash2, X, Save, Filter, Package, AlertTriangle, XCircle, Archive, RefreshCw, Info } from 'lucide-react';
import { formatCurrency } from '@/lib/constants';
import { useAlert } from '@/components/AlertModal';
import { useDebounce } from '@/hooks/useDebounce';
import { addSyncTask } from '@/lib/offlineSync';
import { db } from '@/lib/db';

import Image from "next/image";
interface Unit {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  price: number;
  costPrice: number;
  stock: number;
  minStock: number;
  unit: string;
  expiryDate: string | null;
  categoryId: string | null;

  barcode: string | null;
  image: string | null;
  category: { name: string } | null;

  isArchived?: boolean;
  uoms?: { id: string; name: string; barcode: string | null; multiplier: number; price: number; isBase: boolean }[];
  _count?: {
    orderItems: number;
    stockLogs: number;
  };
}

interface Category {
  id: string;
  name: string;
}



export default function InventoryPage() {
  const { data: session, status } = useSession();
  const isAdmin = session?.user?.role?.toLowerCase() === 'admin';
 
  const { showAlert, showConfirm, showToast } = useAlert();
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  // SWR for instant caching
  const { data: swrProducts, error: swrError } = useSWR(
    status === 'authenticated' ? `/api/products${showArchived ? '?archived=true' : ''}` : null,
    fetcher,
    { refreshInterval: 15000 }
  );

  useEffect(() => {
    // If both undefined, we're offline with no cache - stop skeleton after 2s
    if (!swrProducts && !swrError) {
      const t = setTimeout(() => setLoading(false), 2000);
      return () => clearTimeout(t);
    }

    const applyOfflineTasks = async () => {
      try {
        const pendingTasks = await db.syncQueue
          .where('syncStatus')
          .anyOf(['pending', 'failed'])
          .toArray();

        let modifiedProducts = swrProducts ? [...swrProducts] : [];

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

    if (swrProducts || swrError) {
      applyOfflineTasks();
    }
  }, [swrProducts, swrError]);

  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [cleanupMode, setCleanupMode] = useState(false);
  const [lockProductDelete, setLockProductDelete] = useState(true);
  const [lockProductEdit, setLockProductEdit] = useState(false);
  
  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  // Form State
  const [formData, setFormData] = useState({
    name: '', sku: '', barcode: '', price: '', costPrice: '', stock: '0', minStock: '10',
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    unit: '', expiryDate: '', categoryId: '', image: '', uoms: [] as any[]
  });
  const [isSaving, setIsSaving] = useState(false);
  const [skuManuallyEdited, setSkuManuallyEdited] = useState(false);

  // Manage Modal State
  const [manageModal, setManageModal] = useState<'category' | 'unit' | null>(null);
  const fetchProducts = useCallback(async (archived = showArchived) => {
    // Relying on SWR for initial fetch, this is kept for manual re-fetches
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
      const settingsData = settingsRes && settingsRes.ok ? await settingsRes.json() : {};
      
      let finalCats = Array.isArray(catData) ? catData : [];
      let finalUnits = Array.isArray(unitData) ? unitData : [];

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
      if (settingsData && settingsData.cleanupMode) {
        setCleanupMode(true);
      } else {
        setCleanupMode(false);
      }
      setLockProductDelete(settingsData?.lockProductDelete ?? true);
      setLockProductEdit(settingsData?.lockProductEdit ?? false);
    } catch (error) {
      console.error('Failed to fetch dependencies', error);
    }
  }, []);

  useEffect(() => {
    fetchDependencies();
    
    // Check for add new product from barcode scanner
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('add') === 'true') {
      const barcode = searchParams.get('barcode') || '';
      // Small timeout to allow state to initialize properly
      setTimeout(() => {
        setIsModalOpen(true);
        setFormData(prev => ({ ...prev, barcode }));
      }, 100);
    }
  }, [fetchDependencies]);



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

  // Auto-generate SKU
  useEffect(() => {
    if (!skuManuallyEdited && formData.name.trim()) {
      let categoryName = "UNCATEGORIZED";
      if (formData.categoryId) {
        const cat = categories.find(c => c.id === formData.categoryId);
        if (cat) categoryName = cat.name;
      }
      const catPart = categoryName.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const namePart = formData.name.toUpperCase().replace(/[^A-Z0-9]/g, '');
      const unitPart = (formData.unit || 'PCS').toUpperCase().replace(/[^A-Z0-9]/g, '');
      
      setFormData(prev => ({ ...prev, sku: `${catPart}-${namePart}-${unitPart}` }));
    }
  }, [formData.name, formData.categoryId, formData.unit, categories, skuManuallyEdited]);

  const availableUnits = Array.from(new Set([...units.map(u => u.name), formData.unit].filter(Boolean)));

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
    if (product) {
      setEditingProduct(product);
      setSkuManuallyEdited(true);
      setFormData({
        name: product.name,
        sku: product.sku,
        price: product.price.toString(),
        costPrice: product.costPrice.toString(),
        stock: product.stock.toString(),
        minStock: product.minStock.toString(),
        unit: product.unit || '',
        barcode: product.barcode || '',
        image: product.image || '',
        expiryDate: product.expiryDate ? new Date(product.expiryDate).toISOString().split('T')[0] : '',
        categoryId: product.categoryId || '',

        uoms: product.uoms || []
      });
    } else {
      setEditingProduct(null);
      setSkuManuallyEdited(false);
      setFormData({
        name: '', sku: '', barcode: '', price: '', costPrice: '', stock: '0', minStock: '10',
        unit: '', expiryDate: '', categoryId: '', image: '', uoms: []
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingProduct(null);
  };

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    // 1. Validate Pricing (Safety Feature)
    const priceNum = Number(formData.price);
    const costPriceNum = Number(formData.costPrice);
    if (costPriceNum > 0 && priceNum <= costPriceNum) {
      showAlert('error', 'Pricing Error', `Base Selling Price (${priceNum}) must be higher than Cost Price (${costPriceNum}).`);
      setIsSaving(false);
      return;
    }

    // 2. Validate Barcode Uniqueness (Against local state to protect offline queue)
    const allBarcodes: string[] = [];
    if (formData.barcode) allBarcodes.push(formData.barcode.trim());
    if (formData.uoms) {
      for (const u of formData.uoms) {
        if (u.barcode) {
          const trimmed = u.barcode.trim();
          if (allBarcodes.includes(trimmed)) {
            showAlert('error', 'Barcode Conflict', `The barcode '${trimmed}' is used multiple times. Base unit and Bulk units must have completely unique barcodes.`);
            setIsSaving(false);
            return;
          }
          allBarcodes.push(trimmed);
        }
      }
    }
    
    if (allBarcodes.length > 0) {
      const existingConflict = products.find(p => {
        if (editingProduct && p.id === editingProduct.id) return false;
        if (p.barcode && allBarcodes.includes(p.barcode)) return true;
        if (p.uoms && p.uoms.some((u: { barcode?: string | null }) => u.barcode && allBarcodes.includes(u.barcode))) return true;
        return false;
      });
      
      if (existingConflict) {
        showAlert('error', 'Barcode Conflict', `One of the provided barcodes is already used by another product (${existingConflict.name}).`);
        setIsSaving(false);
        return;
      }
    }

    try {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      let networkFailed = false;

      const method = editingProduct ? 'PUT' : 'POST';
      const url = editingProduct ? `/api/products/${editingProduct.id}` : '/api/products';
      
      if (!isOffline) {
        try {
          const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData),
          });
          
          if (res.ok) {
            await fetchProducts();
            closeModal();
            return;
          } else {
            const errorData = await res.json();
            showAlert('error', 'Action Failed', errorData.error || 'Failed to save product');
            return;
          }
        } catch (fetchErr) {
          console.warn('Network error detected, falling back to offline mode', fetchErr);
          networkFailed = true;
        }
      }

      if (isOffline || networkFailed) {
        const action = editingProduct ? 'UPDATE' : 'CREATE';
        const payload = { 
          ...formData, 
          id: editingProduct ? editingProduct.id : `OFF-${Date.now()}`,
          price: Number(formData.price),
          costPrice: Number(formData.costPrice),
          stock: Number(formData.stock),
          minStock: Number(formData.minStock),
          category: formData.categoryId ? categories.find(c => c.id === formData.categoryId) : null
        };
        await addSyncTask('product', action, payload);
        showToast('offline', 'Action queued offline — will sync when connected');
        
        // Optimistic UI Update
        if (editingProduct) {
          setProducts(prev => prev.map(p => p.id === payload.id ? { ...p, ...payload } as unknown as Product : p));
        } else {
          setProducts(prev => [{ ...payload, _count: { orderItems: 0, stockLogs: 0 } } as unknown as Product, ...prev]);
        }
        closeModal();
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

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const size = Math.min(img.width, img.height);
        const startX = (img.width - size) / 2;
        const startY = (img.height - size) / 2;

        const canvas = document.createElement('canvas');
        canvas.width = 500;
        canvas.height = 500;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, startX, startY, size, size, 0, 0, 500, 500);
          
          canvas.toBlob(async (blob) => {
            if (!blob) return;
            const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
            let networkFailed = false;

            if (!isOffline) {
              const uploadData = new FormData(); 
              uploadData.append('file', blob, 'image.jpg');
              try {
                const res = await fetch('/api/upload', { method: 'POST', body: uploadData });
                if (!res.ok) throw new Error('Upload failed');
                const { url } = await res.json();
                setFormData(prev => ({...prev, image: url}));
                return;
              } catch (error) {
                console.warn('Image upload network error, falling back to offline mode:', error);
                networkFailed = true;
              }
            }

            if (isOffline || networkFailed) {
              const base64Image = canvas.toDataURL('image/jpeg', 0.7);
              setFormData(prev => ({...prev, image: base64Image}));
              showToast('success', 'Photo saved locally for offline mode');
            }
          }, 'image/jpeg', 0.7);
        }
      };
      if (event.target?.result) {
        img.src = event.target.result as string;
      }
    };
    reader.readAsDataURL(file);
  };

  const handleDeleteProduct = async (id: string, name: string) => {
    if (!await showConfirm(
      'Permanently Delete Product?', 
      `Permanently delete "${name}"?\n\n(Safe to delete: 0 sales, 0 stock logs.)\n\nThis cannot be undone.`
    )) return;
    try {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
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
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
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
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
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
          <table className="table">
            <thead>
              <tr>
                <th>Product Details</th>
                <th>Category</th>
                <th style={{ textAlign: 'right' }}>Price</th>
                <th style={{ textAlign: 'right' }}>Stock</th>
                <th>Status</th>
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
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'flex-start', textAlign: 'left', width: '100%' }}>
                        <div style={{ width: '40px', height: '40px', borderRadius: '4px', overflow: 'hidden', background: 'var(--bg-hover)', border: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {product.image ? (
                            <Image width={400} height={400} src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}  />
                          ) : (
                            <span style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>No Img</span>
                          )}
                        </div>
                        <div style={{ textAlign: 'left' }}>
                          <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{product.name}</div>
                          <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)' }}>{product.sku}</div>
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
                              <div key={uom.id} style={{ fontSize: '10px', background: 'var(--primary-light)', color: 'var(--primary)', padding: '2px 6px', borderRadius: '4px', fontWeight: 600 }}>
                                {uom.name}: {formatCurrency(uom.price)}
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
                          const sortedUoms = [...product.uoms].sort((a, b) => b.multiplier - a.multiplier);
                          let remaining = product.stock;
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
                    <td data-label="Status" style={{ whiteSpace: 'nowrap' }}>
                      {product.isArchived ? (
                        <span className="badge badge-neutral">Archived</span>
                      ) : product.stock === 0 ? (
                        <span className="badge badge-danger">Out of Stock</span>
                      ) : product.stock <= product.minStock ? (
                        <span className="badge badge-warning">Low Stock</span>
                      ) : (
                        <span className="badge badge-success">In Stock</span>
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
                          } else if (hasHistory || !cleanupMode) {
                            if ((lockProductEdit || lockProductDelete) && !isAdmin) return null;
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
                                data-tooltip="Delete Product"
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

      {/* Product Modal */}
      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: '800px' }}>
            <div className="modal-header">
              <h2 className="modal-title">{editingProduct ? 'Edit Product' : 'Add New Product'}</h2>
              <button className="btn btn-icon btn-ghost" onClick={closeModal}>
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSaveProduct} className="modal-layout-form">
              <div className="modal-body modal-split-layout">
                
                {/* Left Side: Image Upload */}
                <div style={{ width: '180px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '8px', margin: '0 auto' }}>
                  <div className="form-label">Product Image</div>
                  <div style={{ 
                    width: '100%', aspectRatio: '1/1', border: '2px dashed var(--border)', borderRadius: '8px', 
                    display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                    background: 'var(--bg-hover)', position: 'relative'
                  }}>
                    {formData.image ? (
                      <Image width={400} height={400} src={formData.image} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }}  />
                    ) : (
                      <div style={{ color: 'var(--text-tertiary)', textAlign: 'center', padding: '10px' }}>
                        <span style={{ fontSize: '12px' }}>No Image</span>
                      </div>
                    )}
                    <input 
                      id="product-image-upload"
                      name="productImage"
                      aria-label="Upload Product Image"
                      type="file" 
                      accept="image/*"
                      style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }}
                      onChange={handleImageUpload}
                    />
                  </div>
                  {formData.image && (
                    <button type="button" className="btn btn-sm btn-ghost" onClick={() => setFormData({...formData, image: ''})} style={{ color: 'var(--danger)', width: '100%' }}>
                      Remove Image
                    </button>
                  )}
                  <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                    Click area to upload.<br/>Max size: 2MB
                  </p>
                </div>

                {/* Right Side: Form Fields */}
                <div className="form-grid-2" style={{ gap: '16px' }}>
                  
                  <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
                    <label htmlFor="product-name" className="form-label">Product Name *</label>
                    <input id="product-name" name="name" type="text" className="form-input" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="product-sku" className="form-label">SKU *</label>
                    <input id="product-sku" name="sku" type="text" className="form-input" required value={formData.sku} onChange={e => { setFormData({...formData, sku: e.target.value}); setSkuManuallyEdited(true); }} />
                    {editingProduct && (
                      <div style={{ 
                        display: 'flex', gap: '8px', alignItems: 'flex-start',
                        background: 'var(--primary-light)', color: 'var(--text-primary)',
                        padding: '10px 12px', borderRadius: '8px', marginTop: '10px',
                      }}>
                        <Info size={16} style={{ color: 'var(--primary)', flexShrink: 0, marginTop: '1px' }} />
                        <div style={{ fontSize: '11.5px', lineHeight: '1.4', fontWeight: 500 }}>
                          <span style={{ fontWeight: 700, color: 'var(--primary)' }}>Locked during edits.</span> SKUs do not auto-update to protect your physical barcode labels. Please edit manually if needed.
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="product-barcode" className="form-label">Barcode (Optional)</label>
                    <input id="product-barcode" name="barcode" type="text" className="form-input" placeholder="Scan or type barcode" value={formData.barcode} onChange={e => setFormData({...formData, barcode: e.target.value})} />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label htmlFor="product-category" className="form-label" style={{ marginBottom: 0 }}>Category *</label>
                      {isAdmin && (
                        <button type="button" onClick={() => setManageModal('category')} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 'var(--font-xs)', fontWeight: 600, cursor: 'pointer' }}>
                          Edit Category
                        </button>
                      )}
                    </div>
                    <select id="product-category" name="categoryId" aria-label="Category" className="form-select" required value={formData.categoryId} onChange={e => setFormData({...formData, categoryId: e.target.value})}>
                      <option value="">-- Select Category --</option>
                      {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                      <label htmlFor="product-base-unit" className="form-label" style={{ marginBottom: 0 }}>Base Unit *</label>
                      {isAdmin && (
                        <button type="button" onClick={() => setManageModal('unit')} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 'var(--font-xs)', fontWeight: 600, cursor: 'pointer' }}>
                          Edit Unit
                        </button>
                      )}
                    </div>
                    <select id="product-base-unit" name="unit" aria-label="Base Unit" className="form-select" required value={formData.unit} onChange={e => setFormData({...formData, unit: e.target.value})}>
                      <option value="">-- Select Base Unit --</option>
                      {availableUnits.map(u => (
                        <option key={u} value={u}>{u}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="product-cost-price" className="form-label">Base Cost Price (₱) *</label>
                    <input id="product-cost-price" name="costPrice" type="number" step="0.01" min="0" className="form-input" required value={formData.costPrice} onChange={e => setFormData({...formData, costPrice: e.target.value})} onWheel={e => (e.target as HTMLElement).blur()} />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="product-selling-price" className="form-label">Base Selling Price (₱) *</label>
                    <input id="product-selling-price" name="price" type="number" step="0.01" min="0" className="form-input" required value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} onWheel={e => (e.target as HTMLElement).blur()} />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="product-min-stock" className="form-label">Min Stock Alert *</label>
                    <input id="product-min-stock" name="minStock" type="number" min="0" className="form-input" required value={formData.minStock} onChange={e => setFormData({...formData, minStock: e.target.value})} onWheel={e => (e.target as HTMLElement).blur()} />
                  </div>

                  <div className="form-group" style={{ gridColumn: '1 / -1', marginTop: '8px', borderTop: '2px dashed var(--border)', paddingTop: '16px', marginBottom: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div className="form-label" style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>Bulk Units (e.g. Box, Case)</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Add units that contain multiple base units for wholesale</div>
                      </div>
                      <button type="button" className="btn btn-sm btn-outline" style={{ background: 'var(--primary-light)', color: 'var(--primary)', position: 'relative', zIndex: 10 }} onClick={(e) => { 
                        e.preventDefault(); 
                        setFormData({...formData, uoms: [...(formData.uoms || []), { name: '', barcode: '', multiplier: '', price: '' }]}); 
                        setTimeout(() => {
                          const modalBody = document.querySelector('.modal-body');
                          if (modalBody) {
                            modalBody.scrollTo({ top: modalBody.scrollHeight, behavior: 'smooth' });
                          }
                        }, 50);
                      }}>
                        + Add Bulk Unit
                      </button>
                    </div>
                    {formData.uoms.map((uom, index) => (
                      <div key={index} className="uom-grid">
                        <div>
                          <label htmlFor={`uom-name-${index}`} className="form-label" style={{ fontSize: '11px', marginBottom: '4px' }}>Unit Name (e.g. Box)</label>
                          <input id={`uom-name-${index}`} name={`uomName${index}`} type="text" placeholder="Box" className="form-input" value={uom.name} onChange={e => { const newUoms = [...formData.uoms]; newUoms[index].name = e.target.value; setFormData({...formData, uoms: newUoms}) }} />
                        </div>
                        <div>
                          <label htmlFor={`uom-barcode-${index}`} className="form-label" style={{ fontSize: '11px', marginBottom: '4px' }}>Barcode (Optional)</label>
                          <input id={`uom-barcode-${index}`} name={`uomBarcode${index}`} type="text" placeholder="Barcode" className="form-input" value={uom.barcode || ''} onChange={e => { const newUoms = [...formData.uoms]; newUoms[index].barcode = e.target.value; setFormData({...formData, uoms: newUoms}) }} />
                        </div>
                        <div>
                          <label htmlFor={`uom-qty-${index}`} className="form-label" style={{ fontSize: '11px', marginBottom: '4px' }}>Items per Unit</label>
                          <input id={`uom-qty-${index}`} name={`uomQty${index}`} type="number" placeholder="Qty" min="1" className="form-input" value={uom.multiplier} disabled={!isAdmin} onChange={e => { const newUoms = [...formData.uoms]; newUoms[index].multiplier = e.target.value; setFormData({...formData, uoms: newUoms}) }} onWheel={e => (e.target as HTMLElement).blur()} />
                        </div>
                        <div>
                          <label htmlFor={`uom-price-${index}`} className="form-label" style={{ fontSize: '11px', marginBottom: '4px' }}>Selling Price</label>
                          <input id={`uom-price-${index}`} name={`uomPrice${index}`} type="number" step="0.01" min="0" placeholder="Price" className="form-input" value={uom.price} onChange={e => { const newUoms = [...formData.uoms]; newUoms[index].price = e.target.value; setFormData({...formData, uoms: newUoms}) }} onWheel={e => (e.target as HTMLElement).blur()} />
                        </div>
                        <button type="button" className="btn btn-icon btn-ghost" style={{ marginTop: 0, marginRight: 'auto', marginBottom: '4px', marginLeft: 'auto', width: '30px', height: '30px', padding: 0, color: 'var(--danger)', background: '#ffebee', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => { const newUoms = formData.uoms.filter((_, i) => i !== index); setFormData({...formData, uoms: newUoms}) }}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                  </div>

                </div>
              </div>
              
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal} disabled={isSaving}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                  <Save size={18} style={{ marginRight: '8px' }} />
                  {isSaving ? 'Saving...' : 'Save Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

function ManageListModal({ type, items, onClose, onUpdate }: { type: 'category' | 'unit', items: {id: string, name: string}[], onClose: () => void, onUpdate: () => void }) {
 
  const { showAlert, showConfirm, showToast } = useAlert();
  const [inputValue, setInputValue] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const title = type === 'category' ? 'Manage Categories' : 'Manage Units';
  const apiPath = type === 'category' ? '/api/categories' : '/api/units';

  useEffect(() => {
    onUpdate();
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    setLoading(true);
    try {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      let networkFailed = false;

      if (!isOffline) {
        try {
          const url = editingId ? `${apiPath}/${editingId}` : apiPath;
          const method = editingId ? 'PUT' : 'POST';
          const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: inputValue.trim() })
          });

          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Operation failed');
          }
          setInputValue('');
          setEditingId(null);
          onUpdate();
          return;
        } catch (fetchErr: unknown) {
          if (fetchErr instanceof Error && fetchErr.message !== 'Failed to fetch') {
             throw fetchErr;
          }
          console.warn('Network error detected, falling back to offline mode', fetchErr);
          networkFailed = true;
        }
      }

      if (isOffline || networkFailed) {
        const action = editingId ? 'UPDATE' : 'CREATE';
        const payload = {
          id: editingId || `OFF-${Date.now()}`,
          name: inputValue.trim()
        };
        const entityName = type === 'category' ? 'category' : 'unit';
        await addSyncTask(entityName, action, payload);
        showToast('offline', 'Action queued offline — will sync when connected');
        
        setInputValue('');
        setEditingId(null);
        // Optimistically update the UI by calling onUpdate, 
        // though the parent might fail to fetch. We'll just close it or rely on parent's SWR error handling.
        onUpdate();
        return;
      }
    } catch (err: unknown) {
      showAlert('error', 'Action Failed', (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!await showConfirm('Confirm', `Delete ${name}?`)) return;
    try {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      let networkFailed = false;

      if (!isOffline) {
        try {
          const res = await fetch(`${apiPath}/${id}`, { method: 'DELETE' });
          if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || 'Failed to delete');
          }
          onUpdate();
          return;
        } catch (fetchErr: unknown) {
          if (fetchErr instanceof Error && fetchErr.message !== 'Failed to fetch') {
             throw fetchErr;
          }
          console.warn('Network error detected, falling back to offline mode', fetchErr);
          networkFailed = true;
        }
      }

      if (isOffline || networkFailed) {
        const entityName = type === 'category' ? 'category' : 'unit';
        await addSyncTask(entityName, 'DELETE', { id });
        showToast('offline', 'Action queued offline — will sync when connected');
        onUpdate();
        return;
      }
    } catch (err: unknown) {
      showAlert('error', 'Action Failed', (err as Error).message);
    }
  };

  const handleEdit = (item: {id: string, name: string}) => {
    setEditingId(item.id);
    setInputValue(item.name);
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
                id="manage-list-input"
                name="manageListItem"
                aria-label={`Type ${type} name`}
                type="text" 
                className="form-input" 
                placeholder={`Type ${type} name...`} 
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                required
                style={{ width: '100%' }}
              />
            </div>
            <div className="manage-list-actions">
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {editingId ? 'Update' : 'Add'}
              </button>
              {editingId && (
                <button type="button" className="btn btn-secondary" onClick={() => { setEditingId(null); setInputValue(''); }}>
                  Cancel
                </button>
              )}
            </div>
          </form>
          
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflowY: 'auto', maxHeight: '350px' }}>
            {items.length === 0 ? (
              <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-tertiary)' }}>No items found. Add one above!</div>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {items.map(item => {
                  const isEditing = editingId === item.id;
                  return (
                    <li 
                      key={item.id} 
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
                        {item.name}
                      </span>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button 
                          type="button" 
                          className="btn btn-icon" 
                          onClick={() => handleEdit(item)} 
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
                          onClick={() => handleDelete(item.id, item.name)} 
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
