'use client';

import { useState, useEffect, useCallback } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { Search, RotateCcw, Package, Tag, BarChart2 } from 'lucide-react';
import { formatCurrency } from '@/lib/constants';
import { useDebounce } from '@/hooks/useDebounce';
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

// ── Helpers ───────────────────────────────────────────────────────────────────
type StockStatusKey = 'in_stock' | 'low_stock' | 'out_of_stock' | '';

function getStockStatus(stock: number, minStock: number): { label: string; className: string } {
  if (stock <= 0) return { label: 'Out of Stock', className: 'badge-danger' };
  if (stock <= minStock) return { label: 'Low Stock', className: 'badge-warning' };
  return { label: 'In Stock', className: 'badge-success' };
}

const PAGE_SIZE = 20;

// ── Component ─────────────────────────────────────────────────────────────────
export default function StockCheckerPage() {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedStockStatus, setSelectedStockStatus] = useState<StockStatusKey>('');
  const [currentPage, setCurrentPage] = useState(1);

  const debouncedSearch = useDebounce(search, 350);

  // Reset to page 1 whenever filters change
  useEffect(() => { setCurrentPage(1); }, [debouncedSearch, selectedCategory, selectedStockStatus]);

  // Build API URL
  const buildUrl = useCallback(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (selectedCategory) params.set('category', selectedCategory);
    if (selectedStockStatus) params.set('stockStatus', selectedStockStatus);
    params.set('page', String(currentPage));
    params.set('limit', String(PAGE_SIZE));
    return `/api/products?${params.toString()}`;
  }, [debouncedSearch, selectedCategory, selectedStockStatus, currentPage]);

  const { data: products, isLoading } = useSWR<Product[]>(buildUrl, fetcher, {
    keepPreviousData: true,
    refreshInterval: 30000,
  });

  const { data: categories } = useSWR<Category[]>('/api/categories', fetcher);

  // Read total from response header via a custom fetcher
  const [total, setTotal] = useState(0);
  useEffect(() => {
    if (!products) return;
    // SWR strips headers — fetch total via a HEAD-style concurrent request
    fetch(buildUrl(), { method: 'GET' }).then(res => {
      const count = res.headers.get('X-Total-Count');
      if (count) setTotal(parseInt(count));
    }).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const hasFilters = search || selectedCategory || selectedStockStatus;

  function clearFilters() {
    setSearch('');
    setSelectedCategory('');
    setSelectedStockStatus('');
    setCurrentPage(1);
  }

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

      {/* ── Search + Filters ─────────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '16px', padding: '16px' }}>
        {/* Search row */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px', flexWrap: 'wrap' }}>
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
              placeholder="Search product name, barcode or SKU…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ paddingLeft: '36px' }}
            />
          </div>
          <button className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}>
            <Search size={16} /> Search
          </button>
        </div>

        {/* Filter row */}
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Category / Brand filter */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '160px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Category</label>
            <select
              className="form-select"
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
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
              onChange={e => setSelectedStockStatus(e.target.value as StockStatusKey)}
            >
              <option value="">All</option>
              <option value="in_stock">In Stock</option>
              <option value="low_stock">Low Stock</option>
              <option value="out_of_stock">Out of Stock</option>
            </select>
          </div>

          {/* Brand label (mapped to category, shown for UI parity with reference) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', minWidth: '140px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Brand</label>
            <select
              className="form-select"
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
            >
              <option value="">All Brands</option>
              {(categories || []).map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Clear Filters */}
          {hasFilters && (
            <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', paddingBottom: '1px' }}>
              <button
                className="btn btn-secondary"
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
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: '48px' }}>#</th>
                <th>Product Name</th>
                <th>Barcode / SKU</th>
                <th>Category</th>
                <th>Selling Price</th>
                <th style={{ textAlign: 'center' }}>Current Stock</th>
                <th style={{ textAlign: 'center' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i}>
                    <td><div className="skeleton" style={{ width: '20px', height: '14px', borderRadius: '4px' }} /></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div className="skeleton" style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', flexShrink: 0 }} />
                        <div className="skeleton" style={{ width: '130px', height: '14px', borderRadius: '4px' }} />
                      </div>
                    </td>
                    <td><div className="skeleton" style={{ width: '100px', height: '14px', borderRadius: '4px' }} /></td>
                    <td><div className="skeleton" style={{ width: '90px', height: '14px', borderRadius: '4px' }} /></td>
                    <td><div className="skeleton" style={{ width: '60px', height: '14px', borderRadius: '4px' }} /></td>
                    <td style={{ textAlign: 'center' }}><div className="skeleton" style={{ width: '30px', height: '14px', borderRadius: '4px', margin: '0 auto' }} /></td>
                    <td style={{ textAlign: 'center' }}><div className="skeleton" style={{ width: '70px', height: '22px', borderRadius: '20px', margin: '0 auto' }} /></td>
                  </tr>
                ))
              ) : !products || products.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                      <Package size={40} style={{ margin: '0 auto 12px', opacity: 0.4 }} />
                      <p style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-secondary)' }}>No products found</p>
                      {hasFilters && (
                        <p style={{ fontSize: '13px', marginTop: '6px' }}>
                          Try adjusting your filters or{' '}
                          <button
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
                      <td style={{ color: 'var(--text-tertiary)', fontWeight: 500, fontSize: '13px' }}>
                        {rowNum}
                      </td>
                      <td>
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
                      <td style={{ color: 'var(--text-secondary)', fontSize: '13px', fontFamily: 'monospace' }}>
                        {displayBarcode}
                      </td>
                      <td>
                        {product.category ? (
                          <span className="badge badge-secondary" style={{ fontSize: '11px' }}>
                            {product.category.name}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>—</span>
                        )}
                      </td>
                      <td style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                        {formatCurrency(product.price)}
                      </td>
                      <td style={{ textAlign: 'center', fontWeight: 600, color: 'var(--text-primary)' }}>
                        {product.stock}
                      </td>
                      <td style={{ textAlign: 'center' }}>
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
        {!isLoading && products && products.length > 0 && (
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
                className="btn btn-secondary"
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
                    onClick={() => setCurrentPage(p as number)}
                    className={p === currentPage ? 'btn btn-primary' : 'btn btn-secondary'}
                    style={{ padding: '6px 10px', fontSize: '13px', minWidth: '34px' }}
                  >
                    {p}
                  </button>
                )
              )}

              <button
                className="btn btn-secondary"
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

      {/* ── Summary Cards ─────────────────────────────────────────────────── */}
      {!isLoading && products && products.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginTop: '16px' }}>
          {[
            {
              label: 'Total Products',
              value: total,
              icon: Package,
              color: 'var(--primary)',
              bg: 'var(--primary-light)',
            },
            {
              label: 'In Stock',
              value: products.filter(p => p.stock > p.minStock).length,
              icon: BarChart2,
              color: 'var(--success)',
              bg: 'var(--success-light)',
            },
            {
              label: 'Low Stock',
              value: products.filter(p => p.stock > 0 && p.stock <= p.minStock).length,
              icon: BarChart2,
              color: 'var(--warning)',
              bg: 'var(--warning-light)',
            },
            {
              label: 'Out of Stock',
              value: products.filter(p => p.stock <= 0).length,
              icon: BarChart2,
              color: 'var(--danger)',
              bg: 'var(--danger-light)',
            },
          ].map(stat => (
            <div key={stat.label} className="card" style={{ padding: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: 'var(--radius-md)',
                background: stat.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <stat.icon size={20} color={stat.color} />
              </div>
              <div>
                <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>{stat.value}</div>
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', fontWeight: 500 }}>{stat.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
