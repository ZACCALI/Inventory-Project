'use client';

import React, { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { Search, ChevronDown, Package, Save, X, AlertTriangle } from 'lucide-react';
import { useAlert } from '@/components/AlertModal';
import { useModalDismiss } from '@/hooks/useModalDismiss';
import { addSyncTask } from '@/lib/offlineSync';
import { ManageReasonsModal } from './ManageReasonsModal';

export interface ProductUom {
  id?: string;
  name: string;
  barcode?: string | null;
  multiplier: number;
  price?: number;
  isBase?: boolean;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  barcode: string | null;
  category: { name: string } | null;
  image?: string | null;
  unit?: string;
  stock?: number;
  price?: number;
  uoms?: ProductUom[];
}

export interface StockMovementModalProps {
  isOpen: boolean;
  modalType: 'IN' | 'OUT';
  products: Product[];
  categories: { id: string; name: string }[];
  inReasons: string[];
  outReasons: string[];
  isAdmin: boolean;
  isOnline: boolean;
  userId?: string;
  onClose: () => void;
  onSuccess: (result: {
    productId: string;
    delta: number;
    finalQuantity: number;
    type: 'IN' | 'OUT';
    isOffline: boolean;
  }) => void;
  onSaveReasons: (inReasons: string[], outReasons: string[]) => void;
}

export function StockMovementModal({
  isOpen,
  modalType,
  products,
  categories,
  inReasons,
  outReasons,
  isAdmin,
  isOnline,
  userId,
  onClose,
  onSuccess,
  onSaveReasons
}: StockMovementModalProps) {
  const { showAlert } = useAlert();

  const [formData, setFormData] = useState({
    sku: '',
    quantity: 1,
    reason: '',
    expiryDate: '',
    batchNumber: ''
  });
  const [selectedUomId, setSelectedUomId] = useState<string>('BASE');
  const [actionLoading, setActionLoading] = useState(false);

  const [productSearch, setProductSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [manageReasonType, setManageReasonType] = useState<'IN' | 'OUT' | null>(null);

  useModalDismiss(isOpen && !manageReasonType, onClose);

  const currentReasons = modalType === 'IN' ? inReasons : outReasons;

  // Reset / init modal form whenever modal opens or modalType changes
  useEffect(() => {
    if (!isOpen) return;

    const reasons = modalType === 'IN' ? inReasons : outReasons;
    setFormData({
      sku: '',
      quantity: 1,
      reason: reasons[0] || (modalType === 'IN' ? 'New Stock Delivery' : 'Damage/Spoilage'),
      expiryDate: '',
      batchNumber: ''
    });
    setSelectedProduct(null);
    setProductSearch('');
    setSelectedUomId('BASE');
    setIsDropdownOpen(false);
    setCategoryFilter('ALL');
  }, [isOpen, modalType, inReasons, outReasons]);

  // Click outside to close product dropdown
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isOpen) return null;

  const filteredProductList = products.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(productSearch.toLowerCase()) ||
                          p.sku.toLowerCase().includes(productSearch.toLowerCase()) ||
                          (p.barcode && p.barcode.toLowerCase().includes(productSearch.toLowerCase()));
    const matchesCategory = categoryFilter === 'ALL' || p.category?.name === categoryFilter;
    return matchesSearch && matchesCategory;
  });

  const selectProduct = (product: Product) => {
    setSelectedProduct(product);
    setProductSearch(product.name);
    setFormData(prev => ({ ...prev, sku: product.sku }));
    setSelectedUomId('BASE');
    setIsDropdownOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isDropdownOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') {
        setIsDropdownOpen(true);
      }
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
      if (filteredProductList[highlightedIndex]) {
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

      const payload: {
        id?: string;
        productId: string;
        type: string;
        quantity: number;
        reason: string;
        source: string;
        expiryDate?: string;
        batchNumber?: string;
        userId?: string;
      } = {
        productId: selectedProduct.id,
        type: modalType,
        quantity: finalQuantity,
        reason: formattedReason,
        source: determineSource,
        expiryDate: modalType === 'IN' ? formData.expiryDate : undefined,
        batchNumber: modalType === 'IN' ? formData.batchNumber : undefined,
        userId: userId
      };

      const isOffline = !isOnline;
      let networkFailed = false;

      if (!isOffline) {
        try {
          const moveRes = await fetch('/api/stock/movement', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });

          if (moveRes.ok) {
            const delta = modalType === 'IN' ? finalQuantity : -finalQuantity;
            onSuccess({
              productId: selectedProduct.id,
              delta,
              finalQuantity,
              type: modalType,
              isOffline: false
            });
            onClose();
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
        showAlert('success', 'Action queued offline', 'Your stock movement will sync when you reconnect.');

        const delta = modalType === 'IN' ? finalQuantity : -finalQuantity;
        onSuccess({
          productId: selectedProduct.id,
          delta,
          finalQuantity,
          type: modalType,
          isOffline: true
        });
        onClose();
        return;
      }
    } catch {
      showAlert('error', 'Action Failed', 'Failed to process stock movement');
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      <div className="modal-overlay">
        <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: '650px' }}>
          <div className="modal-header">
            <h2 className="modal-title">
              {modalType === 'IN' ? 'Receive Stock (In)' : 'Issue Stock (Out)'}
            </h2>
            <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Close dialog">
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
                          setFormData(prev => ({ ...prev, sku: '' }));
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
                        <div style={{ padding: '12px 16px', color: 'var(--text-tertiary)', fontSize: '13px' }}>
                          {products.length === 0 ? 'Loading products...' : 'No products found matching your search.'}
                        </div>
                      ) : (
                        filteredProductList.map((product, idx) => (
                          <div
                            key={product.id}
                            style={{
                              padding: '10px 16px',
                              borderBottom: '1px solid var(--border-light)',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              background: highlightedIndex === idx ? 'var(--bg-hover)' : 'transparent',
                              transition: 'background 0.1s ease'
                            }}
                            onMouseEnter={() => setHighlightedIndex(idx)}
                            onClick={() => selectProduct(product)}
                          >
                            <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-main)', border: '1px solid var(--border-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 }}>
                              {product.image ? (
                                <Image width={400} height={400} src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <Package size={18} color="var(--text-tertiary)" />
                              )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {product.name}
                              </div>
                              <div style={{ display: 'flex', gap: '8px', fontSize: '11px', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                                <span>SKU: {product.sku}</span>
                                <span>•</span>
                                <span style={{ color: (product.stock || 0) <= 0 ? 'var(--danger)' : 'var(--success-dark)', fontWeight: 600 }}>Stock: {product.stock ?? 0} {product.unit || 'pcs'}</span>
                              </div>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {selectedProduct && selectedProduct.uoms && selectedProduct.uoms.length > 0 && (
                <div className="form-group">
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

              <div className="form-group">
                <label htmlFor="stock-modal-qty" className="form-label">
                  Quantity * {selectedProduct && selectedUomId !== 'BASE' && (
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    <span style={{ fontWeight: 400, fontSize: '12px', color: 'var(--text-tertiary)' }}>({selectedProduct.uoms?.find((u: any) => (u.id || u.name) === selectedUomId)?.name})</span>
                  )}
                </label>
                <input
                  id="stock-modal-qty"
                  name="modalQuantity"
                  type="number"
                  required
                  min="1"
                  className="form-input"
                  value={formData.quantity || ''}
                  onChange={e => setFormData({ ...formData, quantity: parseInt(e.target.value) || 0 })}
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
                  <p style={{ marginTop: '6px', fontSize: '12px', color: 'var(--danger)', fontWeight: 500 }}>
                    <AlertTriangle size={14} style={{ display: 'inline', marginBottom: '-2px', marginRight: '4px' }} />
                    Warning: Total quantity exceeds available base stock ({selectedProduct.stock} {selectedProduct.unit || 'pcs'} available)
                  </p>
                )}
              </div>

              {modalType === 'IN' && (
                <div className="form-grid-2" style={{ gap: '16px', marginBottom: '16px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="stock-modal-expiry" className="form-label">Expiry Date *</label>
                    <input
                      id="stock-modal-expiry"
                      name="modalExpiry"
                      type="date"
                      required
                      className="form-input"
                      value={formData.expiryDate}
                      onChange={e => setFormData({ ...formData, expiryDate: e.target.value })}
                    />
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="stock-modal-batch" className="form-label">Batch / Lot Number</label>
                    <input
                      id="stock-modal-batch"
                      name="modalBatch"
                      type="text"
                      className="form-input"
                      placeholder="e.g. BATCH-2023-A"
                      value={formData.batchNumber}
                      onChange={(e) => setFormData({ ...formData, batchNumber: e.target.value })}
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
                  onChange={e => setFormData({ ...formData, reason: e.target.value })}
                >
                  {currentReasons.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
            </div>

            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={actionLoading}>
                Cancel
              </button>
              <button
                type="submit"
                disabled={actionLoading || !selectedProduct}
                className={modalType === 'IN' ? 'btn btn-success' : 'btn btn-danger'}
              >
                <Save size={18} style={{ marginRight: '8px' }} />
                {actionLoading ? 'Processing...' : `Confirm ${modalType === 'IN' ? 'Receive' : 'Issue'}`}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Manage Reasons Modal */}
      {manageReasonType && (
        <ManageReasonsModal
          type={manageReasonType}
          reasons={manageReasonType === 'IN' ? inReasons : outReasons}
          onClose={() => setManageReasonType(null)}
          onUpdate={(updated) => {
            if (manageReasonType === 'IN') {
              if (!updated.includes(formData.reason)) {
                setFormData(prev => ({ ...prev, reason: updated[0] || '' }));
              }
              onSaveReasons(updated, outReasons);
            } else {
              if (!updated.includes(formData.reason)) {
                setFormData(prev => ({ ...prev, reason: updated[0] || '' }));
              }
              onSaveReasons(inReasons, updated);
            }
          }}
        />
      )}
    </>
  );
}
export default StockMovementModal;
