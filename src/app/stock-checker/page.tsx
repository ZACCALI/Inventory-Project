'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { useSession } from 'next-auth/react';
import { Search, RotateCcw, Package, Tag, CheckCircle2, AlertTriangle, XCircle, CloudOff } from 'lucide-react';
import { formatCurrency } from '@/lib/constants';
import { useDebounce } from '@/hooks/useDebounce';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { db } from '@/lib/db';
import Image from 'next/image';

// ── Types ──────────────────────────────────────────────────────────────────────
interface Category {
  id: string;
  name: string;
}

interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  price: number;
  stock: number;
  minStock: number;
  image: string | null;
  category: Category | null;
}

interface ApiResponse {
  items: Product[];
  total: number;
  inStock: number;
  lowStock: number;
  outOfStock: number;
  baseTotal: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
type StockStatusKey = 'in_stock' | 'low_stock' | 'out_of_stock' | '';

function getStockStatus(stock: number, minStock: number): { label: string; className: string } {
  if (stock <= 0) return { label: 'Out of Stock', className: 'badge-danger' };
  if (stock <= minStock) return { label: 'Low Stock', className: 'badge-warning' };
  return { label: 'In Stock', className: 'badge-success' };
}

const PAGE_SIZE = 20;

const stockCheckerFetcher = async (url: string): Promise<ApiResponse> => {
  const res = await fetch(url);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || 'Failed to fetch products');
  }
  const items = await res.json();
  return {
    items,
    total: parseInt(res.headers.get('X-Total-Count') || '0', 10),
    inStock: parseInt(res.headers.get('X-In-Stock') || '0', 10),
    lowStock: parseInt(res.headers.get('X-Low-Stock') || '0', 10),
    outOfStock: parseInt(res.headers.get('X-Out-Of-Stock') || '0', 10),
    baseTotal: parseInt(res.headers.get('X-Base-Total') || '0', 10),
  };
};

// ── Component ─────────────────────────────────────────────────────────────────
export default function StockCheckerPage() {
  const { data: session } = useSession();
  const userRole = (session?.user as { role?: string })?.role?.toLowerCase();
  const canViewSellingPrice = userRole === 'admin' || userRole === 'cashier' || userRole === 'staff';

  const isOnline = useOnlineStatus();
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStockStatus, setSelectedStockStatus] = useState<StockStatusKey>('');
  const [currentPage, setCurrentPage] = useState(1);

  // Offline fallback products cache
  const [offlineProducts, setOfflineProducts] = useState<Product[]>([]);
  const [offlineCategories, setOfflineCategories] = useState<Category[]>([]);

  const debouncedSearch = useDebounce(searchInput, 350);

  // Keep activeSearch in sync with debouncedSearch
  useEffect(() => {
    setActiveSearch(debouncedSearch);
    setCurrentPage(1);
  }, [debouncedSearch]);

  const effectiveSearch = activeSearch.trim();

  // Build API URL
  const buildUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (effectiveSearch) params.set('search', effectiveSearch);
    if (selectedCategory) params.set('category', selectedCategory);
    if (selectedStockStatus) params.set('stockStatus', selectedStockStatus);
    params.set('page', String(currentPage));
    params.set('limit', String(PAGE_SIZE));
    return `/api/products?${params.toString()}`;
  }, [effectiveSearch, selectedCategory, selectedStockStatus, currentPage]);

  const { data, error, isLoading } = useSWR<ApiResponse>(isOnline ? buildUrl : null, stockCheckerFetcher, {
    keepPreviousData: true,
    refreshInterval: 30000,
  });

  const { data: onlineCategories } = useSWR<Category[]>(isOnline ? '/api/categories' : null, fetcher);

  // Load from Dexie cache for offline support and seamless fallback
  const loadOfflineData = useCallback(async () => {
    try {
      const [cached, cats] = await Promise.all([
        db.products.toArray(),
        db.categories.toArray(),
      ]);

      if (cached && cached.length > 0) {
        setOfflineProducts(cached.map(p => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          barcode: p.barcode,
          price: p.price,
          stock: p.stock,
          minStock: p.minStock ?? 0,
          image: p.image,
          category: p.categoryName ? { id: p.categoryName, name: p.categoryName } : null,
        })));
      }

      if (cats && cats.length > 0) {
        setOfflineCategories(cats.map(c => ({ id: c.id, name: c.name })));
      }
    } catch (err) {
      console.warn('Failed to load offline products from Dexie:', err);
    }
  }, []);

  useEffect(() => {
    loadOfflineData();
    window.addEventListener('amroding:data-changed', loadOfflineData);
    window.addEventListener('online', loadOfflineData);
    window.addEventListener('offline', loadOfflineData);
    return () => {
      window.removeEventListener('amroding:data-changed', loadOfflineData);
      window.removeEventListener('online', loadOfflineData);
      window.removeEventListener('offline', loadOfflineData);
    };
  }, [loadOfflineData]);

  // Compute offline data when disconnected or API is unavailable
  const offlineFiltered = useMemo(() => {
    let list = [...offlineProducts];

    // Tokenized search across name, sku, barcode
    if (effectiveSearch.trim()) {
      const tokens = effectiveSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
      list = list.filter(p => {
        const text = `${p.name} ${p.sku} ${p.barcode || ''}`.toLowerCase();
        return tokens.every(token => text.includes(token));
      });
    }

    // Resolve category ID to name for offline matching
    if (selectedCategory) {
      const activeCats = (isOnline && onlineCategories && onlineCategories.length > 0) ? onlineCategories : offlineCategories;
      const selectedCat = activeCats.find(c => c.id === selectedCategory || c.name === selectedCategory);
      const catName = selectedCat?.name || selectedCategory;
      list = list.filter(p => p.category?.name === catName || p.category?.id === selectedCategory);
    }

    // Capture base total before stockStatus filter
    const baseTotal = list.length;

    const inStock = list.filter(p => p.stock > p.minStock).length;
    const lowStock = list.filter(p => p.stock > 0 && p.stock <= p.minStock).length;
    const outOfStock = list.filter(p => p.stock <= 0).length;

    if (selectedStockStatus === 'in_stock') list = list.filter(p => p.stock > p.minStock);
    else if (selectedStockStatus === 'low_stock') list = list.filter(p => p.stock > 0 && p.stock <= p.minStock);
    else if (selectedStockStatus === 'out_of_stock') list = list.filter(p => p.stock <= 0);

    const total = list.length;
    const paged = list.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    return {
      items: paged,
      total,
      inStock,
      lowStock,
      outOfStock,
      baseTotal,
    };
  }, [offlineProducts, effectiveSearch, selectedCategory, isOnline, onlineCategories, offlineCategories, selectedStockStatus, currentPage]);

  const activeData = (isOnline && !error && data) ? data : offlineFiltered;
  const categories = (isOnline && onlineCategories && onlineCategories.length > 0) ? onlineCategories : offlineCategories;

  const products = activeData?.items;
  const total = activeData?.total ?? 0;
  const inStockCount = activeData?.inStock ?? 0;
  const lowStockCount = activeData?.lowStock ?? 0;
  const outOfStockCount = activeData?.outOfStock ?? 0;
  const baseTotalCount = activeData?.baseTotal ?? total;

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hasFilters = Boolean(searchInput || selectedCategory || selectedStockStatus);

  function clearFilters() {
    setSearchInput('');
    setActiveSearch('');
    setSelectedCategory('');
    setSelectedStockStatus('');
    setCurrentPage(1);
  }

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActiveSearch(searchInput);
    setCurrentPage(1);
  };

  // ── Pagination helper ───────────────────────────────────────────────────────
  function getPageNumbers(): (number | '...')[] {
    if (totalPages <= 5) return Array.from({ length: totalPages }, (_, i) => i + 1);
    const pages: (number | '...')[] = [1];
    if (currentPage > 3) pages.push('...');
    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
      pages.push(i);
    }
    if (currentPage < totalPages - 2) pages.push('...');
    pages.push(totalPages);
    return pages;
  }

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Page Header ──────────────────────────────────────────────────── */}
      <div className="page-header" style={{ marginBottom: '16px' }}>
        <div>
          <h1 className="page-title">Stock &amp; Price Check</h1>
          <p className="page-subtitle">View current stock levels and selling prices for all products</p>
        </div>
      </div>

      {/* ── Offline Banner (if disconnected) ─────────────────────────────── */}
      {!isOnline && (
        <div style={{
          background: 'var(--warning-light)', border: '1px solid var(--warning)',
          borderRadius: 'var(--radius-md)', padding: '10px 16px', marginBottom: '16px',
          display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text-primary)',
        }}>
          <CloudOff size={18} color="var(--warning)" style={{ flexShrink: 0 }} />
          <span>You are offline. Showing cached catalog from local storage.</span>
        </div>
      )}

      {/* ── Error Banner (if API fails) ──────────────────────────────────── */}
      {isOnline && error && (
        <div style={{
          background: 'var(--danger-light)', border: '1px solid var(--danger)',
          borderRadius: 'var(--radius-md)', padding: '10px 16px', marginBottom: '16px',
          display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--danger)',
        }}>
          <AlertTriangle size={18} style={{ flexShrink: 0 }} />
          <span>Error loading products: {error.message || 'Server connection issue'}. Please refresh or try again.</span>
        </div>
      )}

      {/* ── Summary Cards (Positioned on Top) ────────────────────────────── */}
      <div className="stats-grid" style={{ marginBottom: '16px' }}>
        {/* Total Products */}
        <div
          role="button"
          tabIndex={0}
          className="stat-card"
          onClick={() => { setSelectedStockStatus(''); setCurrentPage(1); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedStockStatus(''); setCurrentPage(1); } }}
          style={{
            cursor: 'pointer',
            border: selectedStockStatus === '' ? '1.5px solid var(--border)' : '1px solid var(--border)',
            transition: 'all var(--transition-fast)',
          }}
          title="Click to view all stock statuses"
          aria-label="View all stock statuses"
        >
          <div className="stat-icon blue">
            <Package size={22} />
          </div>
          <div className="stat-info">
            <div className="stat-label">Total Products</div>
            <div className="stat-value">{isLoading && !activeData ? '...' : baseTotalCount}</div>
          </div>
        </div>

        {/* In Stock */}
        <div
          role="button"
          tabIndex={0}
          className="stat-card"
          onClick={() => { setSelectedStockStatus(prev => prev === 'in_stock' ? '' : 'in_stock'); setCurrentPage(1); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedStockStatus(prev => prev === 'in_stock' ? '' : 'in_stock'); setCurrentPage(1); } }}
          style={{
            cursor: 'pointer',
            border: selectedStockStatus === 'in_stock' ? '1.5px solid var(--success)' : '1px solid var(--border)',
            background: selectedStockStatus === 'in_stock' ? 'var(--success-light)' : 'var(--bg-card)',
            transition: 'all var(--transition-fast)',
          }}
          title="Click to filter In Stock products"
          aria-label="Filter in stock products"
        >
          <div className="stat-icon green">
            <CheckCircle2 size={22} />
          </div>
          <div className="stat-info">
            <div className="stat-label">In Stock</div>
            <div className="stat-value">{isLoading && !activeData ? '...' : inStockCount}</div>
          </div>
        </div>

        {/* Low Stock */}
        <div
          role="button"
          tabIndex={0}
          className="stat-card"
          onClick={() => { setSelectedStockStatus(prev => prev === 'low_stock' ? '' : 'low_stock'); setCurrentPage(1); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedStockStatus(prev => prev === 'low_stock' ? '' : 'low_stock'); setCurrentPage(1); } }}
          style={{
            cursor: 'pointer',
            border: selectedStockStatus === 'low_stock' ? '1.5px solid var(--warning)' : '1px solid var(--border)',
            background: selectedStockStatus === 'low_stock' ? 'var(--warning-light)' : 'var(--bg-card)',
            transition: 'all var(--transition-fast)',
          }}
          title="Click to filter Low Stock products"
          aria-label="Filter low stock products"
        >
          <div className="stat-icon orange">
            <AlertTriangle size={22} />
          </div>
          <div className="stat-info">
            <div className="stat-label">Low Stock</div>
            <div className="stat-value" style={{ color: lowStockCount > 0 ? 'var(--warning)' : 'inherit' }}>
              {isLoading && !activeData ? '...' : lowStockCount}
            </div>
          </div>
        </div>

        {/* Out of Stock */}
        <div
          role="button"
          tabIndex={0}
          className="stat-card"
          onClick={() => { setSelectedStockStatus(prev => prev === 'out_of_stock' ? '' : 'out_of_stock'); setCurrentPage(1); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedStockStatus(prev => prev === 'out_of_stock' ? '' : 'out_of_stock'); setCurrentPage(1); } }}
          style={{
            cursor: 'pointer',
            border: selectedStockStatus === 'out_of_stock' ? '1.5px solid var(--danger)' : '1px solid var(--border)',
            background: selectedStockStatus === 'out_of_stock' ? 'var(--danger-light)' : 'var(--bg-card)',
            transition: 'all var(--transition-fast)',
          }}
          title="Click to filter Out of Stock products"
          aria-label="Filter out of stock products"
        >
          <div className="stat-icon red">
            <XCircle size={22} />
          </div>
          <div className="stat-info">
            <div className="stat-label">Out of Stock</div>
            <div className="stat-value" style={{ color: outOfStockCount > 0 ? 'var(--danger)' : 'inherit' }}>
              {isLoading && !activeData ? '...' : outOfStockCount}
            </div>
          </div>
        </div>
      </div>

      {/* ── Unified Single Card: Search, Filters, Table & Pagination ────────── */}
      <div className="card">
        {/* Filter Bar Header inside the Card */}
        <div className="card-header filter-bar" style={{
          padding: '16px 20px',
          borderBottom: '1px solid var(--border-light)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          margin: 0,
        }}>
          {/* Row 1: Search row with input and action button */}
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '10px', width: '100%', flexWrap: 'wrap' }}>
            <div className="search-bar" style={{ position: 'relative', flex: '1 1 240px' }}>
              <Search
                size={16}
                style={{
                  position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)',
                  color: 'var(--text-tertiary)', pointerEvents: 'none',
                }}
              />
              <input
                type="text"
                className="form-input"
                aria-label="Search product name, barcode or SKU"
                placeholder="Search product name, barcode or SKU…"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                style={{ paddingLeft: '36px', width: '100%' }}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              aria-label="Search products"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
            >
              <Search size={16} /> Search
            </button>
          </form>

          {/* Row 2: Filter dropdowns and reset */}
          <div style={{
            display: 'flex',
            gap: '12px',
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            width: '100%',
          }}>
            {/* Category filter */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '150px', flex: '0 1 220px' }}>
              <label className="form-label" style={{ fontSize: 'var(--font-xs)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 0 }}>
                Category
              </label>
              <select
                className="form-select"
                value={selectedCategory}
                onChange={e => { setSelectedCategory(e.target.value); setCurrentPage(1); }}
              >
                <option value="">All Categories</option>
                {(categories || []).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Stock Status filter */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '140px', flex: '0 1 180px' }}>
              <label className="form-label" style={{ fontSize: 'var(--font-xs)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 0 }}>
                Stock Status
              </label>
              <select
                className="form-select"
                value={selectedStockStatus}
                onChange={e => { setSelectedStockStatus(e.target.value as StockStatusKey); setCurrentPage(1); }}
              >
                <option value="">All</option>
                <option value="in_stock">In Stock</option>
                <option value="low_stock">Low Stock</option>
                <option value="out_of_stock">Out of Stock</option>
              </select>
            </div>

            {/* Clear Filters button */}
            {hasFilters && (
              <button
                type="button"
                className="btn btn-secondary"
                aria-label="Clear all filters"
                onClick={clearFilters}
                style={{
                  display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap',
                  height: '38px', marginLeft: 'auto',
                }}
              >
                <RotateCcw size={14} /> Clear Filters
              </button>
            )}
          </div>
        </div>

        {/* Table Container directly inside the single Card */}
        <div className="table-container">
          <table className="table mobile-stack">
            <thead>
              <tr>
                <th>Product</th>
                <th>Barcode / SKU</th>
                <th>Category</th>
                {canViewSellingPrice && <th style={{ textAlign: 'right' }}>Selling Price</th>}
                <th style={{ textAlign: 'right' }}>Current Stock</th>
                <th style={{ textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && !products ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    <td data-label="Product">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div className="skeleton" style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', flexShrink: 0 }} />
                        <div className="skeleton" style={{ width: '130px', height: '14px', borderRadius: 'var(--radius-sm)' }} />
                      </div>
                    </td>
                    <td data-label="Barcode / SKU"><div><div className="skeleton" style={{ width: '100px', height: '14px', borderRadius: 'var(--radius-sm)' }} /></div></td>
                    <td data-label="Category"><div><div className="skeleton" style={{ width: '90px', height: '14px', borderRadius: 'var(--radius-sm)' }} /></div></td>
                    {canViewSellingPrice && <td data-label="Selling Price" style={{ textAlign: 'right' }}><div><div className="skeleton" style={{ width: '60px', height: '14px', borderRadius: 'var(--radius-sm)', marginLeft: 'auto' }} /></div></td>}
                    <td data-label="Current Stock" style={{ textAlign: 'right' }}><div><div className="skeleton" style={{ width: '30px', height: '14px', borderRadius: 'var(--radius-sm)', marginLeft: 'auto' }} /></div></td>
                    <td data-label="Status" style={{ textAlign: 'center' }}><div><div className="skeleton" style={{ width: '70px', height: '22px', borderRadius: 'var(--radius-full)', margin: '0 auto' }} /></div></td>
                  </tr>
                ))
              ) : !products || products.length === 0 ? (
                <tr>
                  <td colSpan={canViewSellingPrice ? 6 : 5} style={{ padding: 0 }}>
                    <div
                      className="empty-state"
                      style={{
                        padding: '56px 24px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        textAlign: 'center',
                        width: '100%',
                        margin: '0 auto',
                      }}
                    >
                      <Package size={44} style={{ margin: '0 auto 12px', opacity: 0.35, color: 'var(--text-tertiary)' }} />
                      <h4 style={{ fontWeight: 600, fontSize: '16px', color: 'var(--text-primary)', marginBottom: '4px', textAlign: 'center', width: '100%' }}>
                        No products found
                      </h4>
                      {hasFilters ? (
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', margin: '4px auto 0', width: '100%' }}>
                          Try adjusting your filters or{' '}
                          <button
                            type="button"
                            onClick={clearFilters}
                            style={{ color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                          >
                            clear all filters
                          </button>
                        </p>
                      ) : (
                        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center', margin: '4px auto 0', width: '100%' }}>
                          No products are currently available in the catalog.
                        </p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                products.map((product) => {
                  const status = getStockStatus(product.stock, product.minStock);
                  const displayBarcode = product.barcode || product.sku;

                  return (
                    <tr key={product.id}>
                      <td data-label="Product">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          {/* Product thumbnail */}
                          <div
                            style={{
                              width: '36px', height: '36px', borderRadius: 'var(--radius-sm)',
                              background: 'var(--bg-hover)', border: '1px solid var(--border-light)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              flexShrink: 0, overflow: 'hidden',
                            }}
                          >
                            {product.image ? (
                              <Image
                                src={product.image}
                                alt={product.name}
                                width={36}
                                height={36}
                                style={{ objectFit: 'cover', width: '100%', height: '100%' }}
                              />
                            ) : (
                              <Tag size={16} color="var(--text-tertiary)" />
                            )}
                          </div>
                          <span style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '14px' }}>
                            {product.name}
                          </span>
                        </div>
                      </td>
                      <td data-label="Barcode / SKU" style={{ color: 'var(--text-secondary)', fontSize: 'var(--font-sm)', fontFamily: 'monospace' }}>
                        <div>{displayBarcode || '—'}</div>
                      </td>
                      <td data-label="Category">
                        <div>
                          {product.category ? (
                            <span className="badge badge-secondary" style={{ fontSize: 'var(--font-xs)' }}>
                              {product.category.name}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-tertiary)', fontSize: 'var(--font-sm)' }}>—</span>
                          )}
                        </div>
                      </td>
                      {canViewSellingPrice && (
                        <td data-label="Selling Price" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                          <div style={{ textAlign: 'right' }}>{formatCurrency(product.price)}</div>
                        </td>
                      )}
                      <td data-label="Current Stock" style={{ textAlign: 'right', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                        <div style={{ textAlign: 'right' }}>{product.stock}</div>
                      </td>
                      <td data-label="Status" style={{ textAlign: 'center' }}>
                        <div style={{ textAlign: 'center' }}>
                          <span className={`badge ${status.className}`} style={{ fontSize: 'var(--font-xs)', fontWeight: 600 }}>
                            {status.label}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ──────────────────────────────────────────────────── */}
        {products && products.length > 0 && (
          <div className="table-footer" style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', borderTop: '1px solid var(--border-light)', flexWrap: 'wrap', gap: '10px',
          }}>
            <span style={{ fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>
              Showing {(currentPage - 1) * PAGE_SIZE + 1} to{' '}
              {Math.min(currentPage * PAGE_SIZE, total)} of {total} products
            </span>

            <div style={{ display: 'flex', gap: '4px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                aria-label="Previous page"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{ padding: '6px 10px', minWidth: '32px' }}
              >
                ‹
              </button>

              {getPageNumbers().map((p, i) =>
                p === '...' ? (
                  <span key={`ellipsis-${i}`} style={{ padding: '0 4px', color: 'var(--text-tertiary)' }}>…</span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    aria-label={`Page ${p}`}
                    aria-current={p === currentPage ? 'page' : undefined}
                    onClick={() => setCurrentPage(p as number)}
                    className={p === currentPage ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm'}
                    style={{ padding: '6px 10px', minWidth: '32px' }}
                  >
                    {p}
                  </button>
                )
              )}

              <button
                type="button"
                className="btn btn-secondary btn-sm"
                aria-label="Next page"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                style={{ padding: '6px 10px', minWidth: '32px' }}
              >
                ›
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
