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

// Common FMCG distributor brands to match reference image UI
const KNOWN_BRANDS = [
  'CDO',
  'Magnolia',
  'Purefoods',
  'Argentina',
  'Lucky Me',
  'Del Monte',
  'Nescafe',
  'Birch Tree',
  'San Miguel',
  'Universal Robina',
  'Monde Nissin',
  'Century',
  'Nestle',
];

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
  const canViewSellingPrice = userRole === 'admin' || userRole === 'cashier';

  const isOnline = useOnlineStatus();
  const [searchInput, setSearchInput] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedBrand, setSelectedBrand] = useState('');
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

  // Combined search term (includes brand filter if chosen)
  const effectiveSearch = useMemo(() => {
    const terms = [activeSearch.trim(), selectedBrand.trim()].filter(Boolean);
    return terms.join(' ');
  }, [activeSearch, selectedBrand]);

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
          minStock: p.minStock ?? 10,
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

  const hasFilters = Boolean(searchInput || selectedCategory || selectedBrand || selectedStockStatus);

  function clearFilters() {
    setSearchInput('');
    setActiveSearch('');
    setSelectedCategory('');
    setSelectedBrand('');
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
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1);
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
      <div className="page-header">
        <div>
          <h1 className="page-title">Stock &amp; Price Checker</h1>
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
          className={`stat-card ${selectedStockStatus === '' ? 'active-card' : ''}`}
          onClick={() => { setSelectedStockStatus(''); setCurrentPage(1); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedStockStatus(''); setCurrentPage(1); } }}
          style={{ cursor: 'pointer', border: selectedStockStatus === '' && hasFilters ? '2px solid var(--primary)' : undefined }}
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
          className={`stat-card ${selectedStockStatus === 'in_stock' ? 'active-card' : ''}`}
          onClick={() => { setSelectedStockStatus(prev => prev === 'in_stock' ? '' : 'in_stock'); setCurrentPage(1); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedStockStatus(prev => prev === 'in_stock' ? '' : 'in_stock'); setCurrentPage(1); } }}
          style={{ cursor: 'pointer', border: selectedStockStatus === 'in_stock' ? '2px solid var(--success)' : undefined }}
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
          className={`stat-card ${selectedStockStatus === 'low_stock' ? 'active-card' : ''}`}
          onClick={() => { setSelectedStockStatus(prev => prev === 'low_stock' ? '' : 'low_stock'); setCurrentPage(1); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedStockStatus(prev => prev === 'low_stock' ? '' : 'low_stock'); setCurrentPage(1); } }}
          style={{ cursor: 'pointer', border: selectedStockStatus === 'low_stock' ? '2px solid var(--warning)' : undefined }}
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
          className={`stat-card ${selectedStockStatus === 'out_of_stock' ? 'active-card' : ''}`}
          onClick={() => { setSelectedStockStatus(prev => prev === 'out_of_stock' ? '' : 'out_of_stock'); setCurrentPage(1); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedStockStatus(prev => prev === 'out_of_stock' ? '' : 'out_of_stock'); setCurrentPage(1); } }}
          style={{ cursor: 'pointer', border: selectedStockStatus === 'out_of_stock' ? '2px solid var(--danger)' : undefined }}
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

      {/* ── Search + Filters ─────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '16px', padding: '16px' }}>
        {/* Search row with form support */}
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
          <div style={{ position: 'relative', flex: '1 1 280px' }}>
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
              style={{ paddingLeft: '36px' }}
            />
          </div>
          <button type="submit" className="btn btn-primary" aria-label="Search products" style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
            <Search size={16} /> Search
          </button>
        </form>

        {/* Filter row */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Category filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '160px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Category</label>
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '140px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Stock Status</label>
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

          {/* Brand filter (filters product name keywords) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '140px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Brand</label>
            <select
              className="form-select"
              value={selectedBrand}
              onChange={e => { setSelectedBrand(e.target.value); setCurrentPage(1); }}
            >
              <option value="">All Brands</option>
              {KNOWN_BRANDS.map(brand => (
                <option key={brand} value={brand}>{brand}</option>
              ))}
            </select>
          </div>

          {/* Clear Filters */}
          {hasFilters && (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: '1px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                aria-label="Clear all filters"
                onClick={clearFilters}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap', marginTop: '20px' }}
              >
                <RotateCcw size={14} /> Clear Filters
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Table Card ───────────────────────────────────────────────────── */}
      <div className="card">
        <div className="table-container">
          <table className="table mobile-stack">
            <thead>
              <tr>
                <th style={{ width: '48px' }}>#</th>
                <th>Product Name</th>
                <th>Barcode / SKU</th>
                <th>Category</th>
                {canViewSellingPrice && <th>Selling Price</th>}
                <th style={{ textAlign: 'center' }}>Current Stock</th>
                <th style={{ textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && !products ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    <td data-label="#"><div className="skeleton" style={{ width: '20px', height: '14px', borderRadius: '4px' }} /></td>
                    <td data-label="Product Name">
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div className="skeleton" style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', flexShrink: 0 }} />
                        <div className="skeleton" style={{ width: '130px', height: '14px', borderRadius: '4px' }} />
                      </div>
                    </td>
                    <td data-label="Barcode / SKU"><div className="skeleton" style={{ width: '100px', height: '14px', borderRadius: '4px' }} /></td>
                    <td data-label="Category"><div className="skeleton" style={{ width: '90px', height: '14px', borderRadius: '4px' }} /></td>
                    {canViewSellingPrice && <td data-label="Selling Price"><div className="skeleton" style={{ width: '60px', height: '14px', borderRadius: '4px' }} /></td>}
                    <td data-label="Current Stock" style={{ textAlign: 'center' }}><div className="skeleton" style={{ width: '30px', height: '14px', borderRadius: '4px', margin: '0 auto' }} /></td>
                    <td data-label="Status" style={{ textAlign: 'center' }}><div className="skeleton" style={{ width: '70px', height: '22px', borderRadius: '20px', margin: '0 auto' }} /></td>
                  </tr>
                ))
              ) : !products || products.length === 0 ? (
                <tr>
                  <td colSpan={canViewSellingPrice ? 7 : 6}>
                    <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                      <Package size={40} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                      <p style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-secondary)' }}>No products found</p>
                      {hasFilters && (
                        <p style={{ fontSize: '13px', marginTop: '6px' }}>
                          Try adjusting your filters or{' '}
                          <button
                            type="button"
                            onClick={clearFilters}
                            style={{ color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, padding: 0 }}
                          >
                            clear all filters
                          </button>
                        </p>
                      )}
                    </div>
                  </td>
                </tr>
              ) : (
                products.map((product, idx) => {
                  const rowNum = (currentPage - 1) * PAGE_SIZE + idx + 1;
                  const status = getStockStatus(product.stock, product.minStock);
                  const displayBarcode = product.barcode || product.sku;

                  return (
                    <tr key={product.id}>
                      <td data-label="#" style={{ color: 'var(--text-tertiary)', fontWeight: 500, fontSize: '13px' }}>
                        {rowNum}
                      </td>
                      <td data-label="Product Name">
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
                      <td data-label="Barcode / SKU" style={{ color: 'var(--text-secondary)', fontSize: '13px', fontFamily: 'monospace' }}>
                        {displayBarcode}
                      </td>
                      <td data-label="Category">
                        {product.category ? (
                          <span className="badge badge-secondary" style={{ fontSize: '11px' }}>
                            {product.category.name}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>—</span>
                        )}
                      </td>
                      {canViewSellingPrice && (
                        <td data-label="Selling Price" style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                          {formatCurrency(product.price)}
                        </td>
                      )}
                      <td data-label="Current Stock" style={{ textAlign: 'center', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {product.stock}
                      </td>
                      <td data-label="Status" style={{ textAlign: 'center' }}>
                        <span className={`badge ${status.className}`} style={{ fontSize: '11px', fontWeight: 600 }}>
                          {status.label}
                        </span>
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
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '12px 16px', borderTop: '1px solid var(--border-light)', flexWrap: 'wrap', gap: '8px',
          }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Showing {(currentPage - 1) * PAGE_SIZE + 1} to{' '}
              {Math.min(currentPage * PAGE_SIZE, total)} of {total} products
            </span>

            <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary"
                aria-label="Previous page"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                style={{ padding: '6px 10px', fontSize: '13px' }}
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
                    className={p === currentPage ? 'btn btn-primary' : 'btn btn-secondary'}
                    style={{ padding: '6px 10px', fontSize: '13px', minWidth: '34px' }}
                  >
                    {p}
                  </button>
                )
              )}

              <button
                type="button"
                className="btn btn-secondary"
                aria-label="Next page"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                style={{ padding: '6px 10px', fontSize: '13px' }}
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
