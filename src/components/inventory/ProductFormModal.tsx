'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { X, Save, Trash2, Info, AlertTriangle } from 'lucide-react';
import { useAlert } from '@/components/AlertModal';
import { useModalDismiss } from '@/hooks/useModalDismiss';
import { addSyncTask } from '@/lib/offlineSync';
import { broadcastDataChange } from '@/lib/constants';
import { db } from '@/lib/db';

export interface ProductUom {
  id?: string;
  name: string;
  barcode: string | null;
  multiplier: number | string;
  price: number | string;
  isBase?: boolean;
}

export interface Product {
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
  uoms?: ProductUom[];
  _count?: {
    orderItems: number;
    stockLogs: number;
  };
}

export interface Category {
  id: string;
  name: string;
}

export interface Unit {
  id: string;
  name: string;
}

export interface ProductFormModalProps {
  isOpen: boolean;
  editingProduct: Product | null;
  categories: Category[];
  units: Unit[];
  products: Product[];
  isAdmin: boolean;
  isOnline: boolean;
  initialBarcode?: string;
  onClose: () => void;
  onSaved: (savedProduct: Product, isEditing: boolean) => void;
  onOpenManageModal: (type: 'category' | 'unit') => void;
}

export function ProductFormModal({
  isOpen,
  editingProduct,
  categories,
  units,
  products,
  isAdmin,
  isOnline,
  initialBarcode,
  onClose,
  onSaved,
  onOpenManageModal
}: ProductFormModalProps) {
  const { showAlert, showToast } = useAlert();

  const [formData, setFormData] = useState({
    name: '',
    sku: '',
    barcode: '',
    price: '',
    costPrice: '',
    stock: '0',
    minStock: '10',
    unit: '',
    expiryDate: '',
    categoryId: '',
    image: '',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    uoms: [] as any[]
  });
  const [isSaving, setIsSaving] = useState(false);
  const [skuManuallyEdited, setSkuManuallyEdited] = useState(false);

  useModalDismiss(isOpen, onClose);

  useEffect(() => {
    if (editingProduct) {
      setSkuManuallyEdited(true);
      setFormData({
        name: editingProduct.name,
        sku: editingProduct.sku,
        price: editingProduct.price.toString(),
        costPrice: editingProduct.costPrice.toString(),
        stock: editingProduct.stock.toString(),
        minStock: editingProduct.minStock.toString(),
        unit: editingProduct.unit || '',
        barcode: editingProduct.barcode || '',
        image: editingProduct.image || '',
        expiryDate: editingProduct.expiryDate ? new Date(editingProduct.expiryDate).toISOString().split('T')[0] : '',
        categoryId: editingProduct.categoryId || '',
        uoms: editingProduct.uoms || []
      });
    } else {
      setSkuManuallyEdited(false);
      setFormData({
        name: '',
        sku: '',
        barcode: initialBarcode || '',
        price: '',
        costPrice: '',
        stock: '0',
        minStock: '10',
        unit: '',
        expiryDate: '',
        categoryId: '',
        image: '',
        uoms: []
      });
    }
  }, [editingProduct, initialBarcode, isOpen]);

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
            const isOffline = !isOnline;
            let networkFailed = false;

            if (!isOffline) {
              const uploadData = new FormData();
              uploadData.append('file', blob, 'image.jpg');
              try {
                const res = await fetch('/api/upload', { method: 'POST', body: uploadData });
                if (!res.ok) throw new Error('Upload failed');
                const { url } = await res.json();
                setFormData(prev => ({ ...prev, image: url }));
                return;
              } catch (error) {
                console.warn('Image upload network error, falling back to offline mode:', error);
                networkFailed = true;
              }
            }

            if (isOffline || networkFailed) {
              const base64Image = canvas.toDataURL('image/jpeg', 0.7);
              setFormData(prev => ({ ...prev, image: base64Image }));
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
      const isOffline = !isOnline;
      let networkFailed = false;

      const method = editingProduct ? 'PUT' : 'POST';
      const url = editingProduct ? `/api/products/${editingProduct.id}` : '/api/products';

      const productPayload = {
        ...formData,
        price: Number(formData.price) || 0,
        costPrice: Number(formData.costPrice) || 0,
        stock: Number(formData.stock) || 0,
        minStock: Number(formData.minStock) || 0,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        uoms: formData.uoms.map((u: any) => ({
          ...u,
          multiplier: Number(u.multiplier) || 1,
          price: Number(u.price) || 0
        }))
      };

      if (!isOffline) {
        try {
          const res = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(productPayload),
          });

          if (res.ok) {
            const savedData = await res.json().catch(() => null);
            const categoryObj = formData.categoryId ? categories.find(c => c.id === formData.categoryId) || null : null;
            const payload = (savedData || {
              ...productPayload,
              id: editingProduct ? editingProduct.id : `OPT-${Date.now()}`,
              category: categoryObj
            }) as unknown as Product;

            try {
              await db.products.put({
                id: payload.id,
                name: payload.name,
                sku: payload.sku,
                barcode: payload.barcode || null,
                price: Number(payload.price) || 0,
                costPrice: Number(payload.costPrice) || 0,
                stock: Number(payload.stock) || 0,
                image: payload.image || null,
                categoryName: categoryObj?.name || null,
                uoms: payload.uoms?.map(u => ({
                  id: u.id,
                  name: u.name,
                  barcode: u.barcode || null,
                  multiplier: Number(u.multiplier) || 1,
                  price: Number(u.price) || 0,
                  isBase: u.isBase
                })),
                lastSynced: Date.now()
              });
            } catch (dexieErr) {
              console.warn('Failed to update Dexie product cache', dexieErr);
            }

            onSaved(payload, !!editingProduct);
            broadcastDataChange('product');
            onClose();
            return;
          } else {
            networkFailed = true;
          }
        } catch (fetchErr) {
          console.warn('Network error detected, falling back to offline mode', fetchErr);
          networkFailed = true;
        }
      }

      if (isOffline || networkFailed) {
        const action = editingProduct ? 'UPDATE' : 'CREATE';
        const categoryObj = formData.categoryId ? categories.find(c => c.id === formData.categoryId) || null : null;
        const payload = {
          ...productPayload,
          id: editingProduct ? editingProduct.id : `OFF-${Date.now()}`,
          category: categoryObj
        } as unknown as Product;

        await addSyncTask('product', action, payload);
        showToast('offline', 'Action queued offline — will sync when connected');

        try {
          await db.products.put({
            id: payload.id,
            name: payload.name,
            sku: payload.sku,
            barcode: payload.barcode || null,
            price: Number(payload.price) || 0,
            costPrice: Number(payload.costPrice) || 0,
            stock: Number(payload.stock) || 0,
            image: payload.image || null,
            categoryName: categoryObj?.name || null,
            uoms: payload.uoms?.map(u => ({
              id: u.id,
              name: u.name,
              barcode: u.barcode || null,
              multiplier: Number(u.multiplier) || 1,
              price: Number(u.price) || 0,
              isBase: u.isBase
            })),
            lastSynced: Date.now()
          });
        } catch (dexieErr) {
          console.warn('Failed to update Dexie product cache offline', dexieErr);
        }

        onSaved(payload, !!editingProduct);
        broadcastDataChange('product');
        onClose();
        return;
      }
    } catch (error) {
      console.error('Save error', error);
      showAlert('error', 'Action Failed', 'An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: '800px' }}>
        <div className="modal-header">
          <h2 className="modal-title">{editingProduct ? 'Edit Product' : 'Add New Product'}</h2>
          <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Close dialog">
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
                  <Image width={400} height={400} src={formData.image} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setFormData({ ...formData, image: '' })} style={{ color: 'var(--danger)', width: '100%' }}>
                  Remove Image
                </button>
              )}
              <p style={{ fontSize: '11px', color: 'var(--text-tertiary)', textAlign: 'center' }}>
                Click area to upload.<br />Max size: 2MB
              </p>
            </div>

            {/* Right Side: Form Fields */}
            <div className="form-grid-2" style={{ gap: '16px' }}>

              <div className="form-group" style={{ gridColumn: '1 / -1', marginBottom: 0 }}>
                <label htmlFor="product-name" className="form-label">Product Name *</label>
                <input id="product-name" name="name" type="text" className="form-input" required value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="product-sku" className="form-label">SKU *</label>
                <input id="product-sku" name="sku" type="text" className="form-input" required value={formData.sku} onChange={e => { setFormData({ ...formData, sku: e.target.value }); setSkuManuallyEdited(true); }} />
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
                <input id="product-barcode" name="barcode" type="text" className="form-input" placeholder="Scan or type barcode" value={formData.barcode} onChange={e => setFormData({ ...formData, barcode: e.target.value })} />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label htmlFor="product-category" className="form-label" style={{ marginBottom: 0 }}>Category *</label>
                  {isAdmin && (
                    <button type="button" onClick={() => onOpenManageModal('category')} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 'var(--font-xs)', fontWeight: 600, cursor: 'pointer' }}>
                      Edit Category
                    </button>
                  )}
                </div>
                <select id="product-category" name="categoryId" aria-label="Category" className="form-select" required value={formData.categoryId} onChange={e => setFormData({ ...formData, categoryId: e.target.value })}>
                  <option value="">-- Select Category --</option>
                  {categories.map(cat => <option key={cat.id} value={cat.id}>{cat.name}{String(cat.id).startsWith('OFF-') ? ' (Pending Sync)' : ''}</option>)}
                </select>
                {formData.categoryId && String(formData.categoryId).startsWith('OFF-') && (
                  <p style={{ fontSize: '12px', color: 'var(--warning, #f59e0b)', marginTop: '4px', marginBottom: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertTriangle size={13} /> This category is pending sync. The product will be saved without the category link until both sync online.
                  </p>
                )}
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                  <label htmlFor="product-base-unit" className="form-label" style={{ marginBottom: 0 }}>Base Unit *</label>
                  {isAdmin && (
                    <button type="button" onClick={() => onOpenManageModal('unit')} style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 'var(--font-xs)', fontWeight: 600, cursor: 'pointer' }}>
                      Edit Unit
                    </button>
                  )}
                </div>
                <select id="product-base-unit" name="unit" aria-label="Base Unit" className="form-select" required value={formData.unit} onChange={e => setFormData({ ...formData, unit: e.target.value })}>
                  <option value="">-- Select Base Unit --</option>
                  {availableUnits.map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="product-cost-price" className="form-label">Base Cost Price (₱) *</label>
                <input id="product-cost-price" name="costPrice" type="number" step="0.01" min="0" className="form-input" required value={formData.costPrice} onChange={e => setFormData({ ...formData, costPrice: e.target.value })} onWheel={e => (e.target as HTMLElement).blur()} />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="product-selling-price" className="form-label">Base Selling Price (₱) *</label>
                <input id="product-selling-price" name="price" type="number" step="0.01" min="0" className="form-input" required value={formData.price} onChange={e => setFormData({ ...formData, price: e.target.value })} onWheel={e => (e.target as HTMLElement).blur()} />
              </div>

              <div className="form-group" style={{ marginBottom: 0 }}>
                <label htmlFor="product-min-stock" className="form-label">Min Stock Alert *</label>
                <input id="product-min-stock" name="minStock" type="number" min="0" className="form-input" required value={formData.minStock} onChange={e => setFormData({ ...formData, minStock: e.target.value })} onWheel={e => (e.target as HTMLElement).blur()} />
              </div>

              <div className="form-group" style={{ gridColumn: '1 / -1', marginTop: '8px', borderTop: '2px dashed var(--border)', paddingTop: '16px', marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div className="form-label" style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: 2 }}>Bulk Units (e.g. Box, Case)</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Add units that contain multiple base units for wholesale</div>
                  </div>
                  <button type="button" className="btn btn-sm btn-outline" style={{ background: 'var(--primary-light)', color: 'var(--primary)', position: 'relative', zIndex: 10 }} onClick={(e) => {
                    e.preventDefault();
                    setFormData({ ...formData, uoms: [...(formData.uoms || []), { name: '', barcode: '', multiplier: '', price: '' }] });
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
                      <input id={`uom-name-${index}`} name={`uomName${index}`} type="text" placeholder="Box" className="form-input" value={uom.name} onChange={e => { const newUoms = [...formData.uoms]; newUoms[index].name = e.target.value; setFormData({ ...formData, uoms: newUoms }); }} />
                    </div>
                    <div>
                      <label htmlFor={`uom-barcode-${index}`} className="form-label" style={{ fontSize: '11px', marginBottom: '4px' }}>Barcode (Optional)</label>
                      <input id={`uom-barcode-${index}`} name={`uomBarcode${index}`} type="text" placeholder="Barcode" className="form-input" value={uom.barcode || ''} onChange={e => { const newUoms = [...formData.uoms]; newUoms[index].barcode = e.target.value; setFormData({ ...formData, uoms: newUoms }); }} />
                    </div>
                    <div>
                      <label htmlFor={`uom-qty-${index}`} className="form-label" style={{ fontSize: '11px', marginBottom: '4px' }}>Items per Unit</label>
                      <input id={`uom-qty-${index}`} name={`uomQty${index}`} type="number" placeholder="Qty" min="1" className="form-input" value={uom.multiplier} disabled={!isAdmin} onChange={e => { const newUoms = [...formData.uoms]; newUoms[index].multiplier = e.target.value; setFormData({ ...formData, uoms: newUoms }); }} onWheel={e => (e.target as HTMLElement).blur()} />
                    </div>
                    <div>
                      <label htmlFor={`uom-price-${index}`} className="form-label" style={{ fontSize: '11px', marginBottom: '4px' }}>Selling Price</label>
                      <input id={`uom-price-${index}`} name={`uomPrice${index}`} type="number" step="0.01" min="0" placeholder="Price" className="form-input" value={uom.price} onChange={e => { const newUoms = [...formData.uoms]; newUoms[index].price = e.target.value; setFormData({ ...formData, uoms: newUoms }); }} onWheel={e => (e.target as HTMLElement).blur()} />
                    </div>
                    <button type="button" className="btn btn-icon btn-ghost" style={{ marginTop: 0, marginRight: 'auto', marginBottom: '4px', marginLeft: 'auto', width: '30px', height: '30px', padding: 0, color: 'var(--danger)', background: '#ffebee', display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => { const newUoms = formData.uoms.filter((_, i) => i !== index); setFormData({ ...formData, uoms: newUoms }); }}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSaving}>
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
  );
}
export default ProductFormModal;
