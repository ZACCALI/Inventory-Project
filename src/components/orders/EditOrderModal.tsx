'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  X, Save, Trash2, Printer, Package, Calendar, Truck, Home, ShoppingBag,
  Search, Unlock, Lock, AlertCircle, Loader2
} from 'lucide-react';
import { formatCurrency, broadcastDataChange } from '@/lib/constants';
import { useAlert } from '@/components/AlertModal';
import { useModalDismiss } from '@/hooks/useModalDismiss';
import { addSyncTask } from '@/lib/offlineSync';

export interface OrderItem {
  id?: string;
  productId?: string;
  quantity: number;
  price: number;
  subtotal: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  product?: any;
  uomName?: string;
  multiplier?: number;
}

export interface OrderCustomer {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  contactPerson?: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  customer: OrderCustomer;
  totalAmount: number;
  discount: number;
  status: string;
  paymentStatus: string;
  orderType: string;
  notes: string | null;
  orderDate: string;
  createdAt: string;
  createdBy?: { name: string };
  items: OrderItem[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delivery?: any;
  isArchived?: boolean;
}

export interface EditOrderModalProps {
  isOpen: boolean;
  order: Order | null;
  isAdmin: boolean;
  isOnline: boolean;
  lockOrderEdit?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  drivers?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  products?: any[];
  onClose: () => void;
  onSaveSuccess: (updatedOrder: Order) => void;
  onOpenReceipt: (order: Order) => void;
}

export function EditOrderModal({
  isOpen,
  order,
  isAdmin,
  isOnline,
  lockOrderEdit = false,
  drivers = [],
  products = [],
  onClose,
  onSaveSuccess,
  onOpenReceipt
}: EditOrderModalProps) {
  const { showAlert, showConfirm, showToast } = useAlert();

  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [originalItems, setOriginalItems] = useState<any[]>([]);
  const [editForm, setEditForm] = useState({
    status: '',
    paymentStatus: '',
    notes: '',
    deliveryDriverName: '',
    deliveryDate: '',
    amountPaid: '',
    orderReference: '',
    discountValue: '',
    discountType: 'percent' as 'percent' | 'flat'
  });
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [searchProduct, setSearchProduct] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('All');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedProductForUom, setSelectedProductForUom] = useState<any>(null);

  useModalDismiss(isOpen && !!editingOrder, onClose);
  useModalDismiss(!!selectedProductForUom, () => setSelectedProductForUom(null));

  // Initialize edit form when order changes or modal opens
  useEffect(() => {
    if (!order || !isOpen) {
      setEditingOrder(null);
      return;
    }

    setEditingOrder(JSON.parse(JSON.stringify(order)));
    setOriginalItems(JSON.parse(JSON.stringify(order.items || [])));
    setIsUnlocked(false);

    const initOrderForm = async () => {
      let amountPaid = '';
      let orderRef = '';

      try {
        const payRes = await fetch(`/api/orders/${order.id}/payments`);
        if (payRes.ok) {
          const payments = await payRes.json();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const totalPaid = Array.isArray(payments) ? payments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0) : 0;
          amountPaid = totalPaid > 0 ? totalPaid.toString() : '';
        }
      } catch {
        // Fallback to notes parsing if API fails
      }

      if (!amountPaid && order.notes) {
        const parts = order.notes.split(' | ');
        orderRef = parts[0] || '';
        const amountMatch = order.notes.match(/Amount Paid: [^\d]*([\d,.]+)/);
        if (amountMatch) {
          amountPaid = amountMatch[1].replace(/,/g, '');
        }
      } else if (order.notes) {
        const parts = order.notes.split(' | ');
        orderRef = parts[0] || '';
      }

      if (order.paymentStatus === 'paid' && !amountPaid) {
        amountPaid = order.totalAmount.toString();
      }

      const deliv = Array.isArray(order.delivery) ? order.delivery[0] : order.delivery;
      const finalDriver = deliv?.driverName || '';
      const finalDate = deliv?.scheduledDate ? new Date(deliv.scheduledDate).toISOString().split('T')[0] : '';

      setEditForm({
        status: order.status,
        paymentStatus: order.paymentStatus,
        notes: order.notes || '',
        amountPaid,
        orderReference: orderRef,
        deliveryDriverName: finalDriver,
        deliveryDate: finalDate,
        discountValue: order.discount ? order.discount.toString() : '',
        discountType: 'flat'
      });
    };

    initOrderForm();
  }, [order, isOpen]);

  // Auto-update amountPaid if paymentStatus is paid
  useEffect(() => {
    if (!editingOrder || editForm.paymentStatus !== 'paid') return;
    const subtotal = editingOrder.items?.reduce((sum, item) => sum + item.subtotal, 0) || editingOrder.totalAmount + (editingOrder.discount || 0);
    let parsedDiscount = parseFloat(editForm.discountValue) || 0;
    if (parsedDiscount < 0) parsedDiscount = 0;
    if (editForm.discountType === 'percent' && parsedDiscount > 100) parsedDiscount = 100;
    const flatDiscount = editForm.discountType === 'percent' ? (parsedDiscount / 100) * subtotal : parsedDiscount;
    const newTotal = Math.max(0, subtotal - flatDiscount);

    if (parseFloat(editForm.amountPaid || '0') !== newTotal) {
      setEditForm(prev => ({ ...prev, amountPaid: newTotal.toString() }));
    }
  }, [editingOrder?.items, editForm.discountValue, editForm.discountType, editForm.paymentStatus, editingOrder?.totalAmount, editingOrder?.discount]);

  if (!isOpen || !editingOrder) return null;

  const isStrictlyLocked = !isAdmin && lockOrderEdit;

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'badge-warning',
      confirmed: 'badge-primary',
      delivered: 'badge-success',
      cancelled: 'badge-danger',
      paid: 'badge-success',
      unpaid: 'badge-danger',
      partial: 'badge-warning',
    };
    return map[status.toLowerCase()] || 'badge-neutral';
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;

    if (editForm.status === 'cancelled' && editingOrder.status !== 'cancelled') {
      const isConfirmed = await showConfirm(
        'Cancel Order',
        'Are you sure you want to completely cancel this order? This action will void the transaction and return all items back into your active inventory stock.'
      );
      if (!isConfirmed) return;
    }

    setIsSaving(true);
    try {
      let updatedNotes = editForm.notes;
      const paymentMethodMatch = editingOrder.notes?.match(/Paid via ([A-Za-z]+)/);
      const paymentMethod = paymentMethodMatch ? paymentMethodMatch[1] : 'Cash';
      const parsedAmount = parseFloat(editForm.amountPaid || '0');

      const subtotal = editingOrder.items?.reduce((sum, item) => sum + item.subtotal, 0) || (editingOrder.totalAmount + (editingOrder.discount || 0));
      let parsedDiscount = parseFloat(editForm.discountValue) || 0;
      if (parsedDiscount < 0) {
        showAlert('error', 'Validation Error', 'Discount cannot be negative.');
        setIsSaving(false);
        return;
      }
      if (editForm.discountType === 'percent' && parsedDiscount > 100) parsedDiscount = 100;

      const flatDiscount = editForm.discountType === 'percent'
        ? (parsedDiscount / 100) * subtotal
        : parsedDiscount;

      if (flatDiscount > subtotal + 0.01) {
        showAlert('error', 'Validation Error', `Discount (₱${flatDiscount.toFixed(2)}) cannot exceed the order subtotal (₱${subtotal.toFixed(2)}).`);
        setIsSaving(false);
        return;
      }

      const newTotal = Math.max(0, subtotal - flatDiscount);

      if (editForm.paymentStatus === 'paid') {
        updatedNotes = `${editForm.orderReference || 'Order'} | Paid via ${paymentMethod} (Amount Paid: P${newTotal.toFixed(2)}, Balance: P0.00)`;
      } else {
        if (parsedAmount > newTotal + 0.01) {
          showAlert('error', 'Validation Error', `Payment amount (₱${parsedAmount.toFixed(2)}) cannot exceed the total bill (₱${newTotal.toFixed(2)})`);
          setIsSaving(false);
          return;
        }
        const calculatedBalance = Math.max(0, newTotal - parsedAmount);
        updatedNotes = `${editForm.orderReference || 'Order'} | Paid via ${paymentMethod} (Amount Paid: P${parsedAmount.toFixed(2)}, Balance: P${calculatedBalance.toFixed(2)})`;
      }

      const itemsModified = JSON.stringify(originalItems) !== JSON.stringify(editingOrder.items);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const payload: any = {
        status: editForm.status,
        paymentStatus: editForm.paymentStatus,
        notes: updatedNotes,
        deliveryDriverName: editForm.deliveryDriverName,
        deliveryDate: editForm.deliveryDate,
        discount: flatDiscount > 0 ? flatDiscount : undefined,
        orderReference: editForm.orderReference || undefined,
      };

      if (itemsModified) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        payload.items = editingOrder.items.map((i: any) => ({
          productId: i.productId || i.product?.id,
          qty: i.quantity,
          price: i.price,
          uomName: i.uomName,
          multiplier: i.multiplier
        }));
      }

      if (isOnline) {
        // Optimistic UI Update
        const updatedOrder: Order = {
          ...editingOrder,
          ...payload,
          totalAmount: newTotal,
          discount: flatDiscount,
          items: editingOrder.items
        };
        if (payload.items) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          updatedOrder.items = payload.items.map((i: any) => ({
            ...i,
            quantity: i.qty,
            subtotal: i.qty * i.price
          }));
        }

        onSaveSuccess(updatedOrder);
        onClose();
        setIsSaving(false);
        broadcastDataChange('order');

        // Background fetch
        fetch(`/api/orders/${editingOrder.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }).then(res => {
          if (res.ok) {
            if (['paid', 'partial'].includes(editForm.paymentStatus) && parsedAmount > 0) {
              fetch(`/api/orders/${editingOrder.id}/payments`).then(payRes => payRes.json()).then(existingPayments => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const existingTotal = Array.isArray(existingPayments) ? existingPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0) : 0;
                const difference = parsedAmount - existingTotal;
                if (difference > 0.01) {
                  fetch(`/api/orders/${editingOrder.id}/payments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ amount: difference, method: paymentMethod.toLowerCase(), notes: 'Payment recorded via order edit' }),
                  });
                }
              }).catch(() => {});
            }
          }
        }).catch(err => {
          console.warn('Network error, background update failed', err);
        });

        return;
      }

      // Offline flow
      await addSyncTask('order', 'UPDATE', { ...payload, id: editingOrder.id });

      if (['paid', 'partial'].includes(editForm.paymentStatus) && parsedAmount > 0) {
        const match = editingOrder.notes?.match(/Amount Paid: [^\d]*([\d,.]+)/);
        const previousTotalPaid = match ? parseFloat(match[1].replace(/,/g, '')) || 0 : 0;
        const difference = parsedAmount - previousTotalPaid;

        if (difference > 0.01) {
          await addSyncTask('payment', 'CREATE', {
            orderId: editingOrder.id,
            amount: difference,
            method: paymentMethod.toLowerCase(),
            notes: 'Payment recorded via order edit (offline)'
          });
        }
      }

      showToast('offline', 'Action queued offline — will sync when connected');
      const updatedOrderOffline: Order = {
        ...editingOrder,
        ...payload,
        totalAmount: newTotal,
        discount: flatDiscount,
        ...(itemsModified ? { items: editingOrder.items } : {})
      };
      onSaveSuccess(updatedOrderOffline);
      onClose();
      setIsSaving(false);
    } catch {
      showAlert('error', 'Action Failed', 'An unexpected error occurred.');
      setIsSaving(false);
    }
  };

  const calculatedSubtotal = editingOrder.items?.reduce((sum, item) => sum + item.subtotal, 0) || 0;
  const currentParsedDiscount = parseFloat(editForm.discountValue) || 0;
  const currentFlatDiscount = editForm.discountType === 'percent'
    ? (currentParsedDiscount / 100) * calculatedSubtotal
    : currentParsedDiscount;
  const calculatedGrandTotal = Math.max(0, calculatedSubtotal - currentFlatDiscount);

  return (
    <>
      <div className="modal-overlay">
        <div className="modal edit-order-modal" style={{ maxWidth: '1100px', width: '95vw', display: 'flex', flexDirection: 'column', background: 'var(--bg-main)', border: '1px solid var(--border)', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>

          {/* Enterprise Header */}
          <div style={{ padding: '20px 24px', background: 'var(--bg-card)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  {editingOrder.orderNumber}
                </h2>
                <span className={`badge ${statusBadge(editingOrder.status)}`} style={{ fontSize: '11px', padding: '2px 8px' }}>
                  {editingOrder.status.toUpperCase()}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <Calendar size={14} />
                {new Date(editingOrder.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                <span style={{ color: 'var(--border)' }}>|</span>
                {(editingOrder.delivery && (!Array.isArray(editingOrder.delivery) || editingOrder.delivery.length > 0)) ? <Truck size={14} /> : <Home size={14} />}
                {(editingOrder.delivery && (!Array.isArray(editingOrder.delivery) || editingOrder.delivery.length > 0)) ? 'Delivery Order' : 'Walk-in Order'}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Close dialog" style={{ margin: '-8px -8px 0 0' }}>
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Delivery Warning Banner */}
          {(() => {
            const deliv = Array.isArray(editingOrder.delivery) ? editingOrder.delivery[0] : editingOrder.delivery;
            if (deliv && ['failed', 'cancelled'].includes(deliv.status) && editingOrder.status !== 'cancelled') {
              return (
                <div style={{ background: '#fffbeb', borderBottom: '1px solid #fde68a', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <AlertCircle size={20} color="#d97706" style={{ flexShrink: 0 }} />
                  <div style={{ fontSize: '13px', color: '#92400e', lineHeight: 1.5 }}>
                    <strong>Action Required: Failed Delivery.</strong> The delivery for this order was marked as {deliv.status}.
                    The items are still technically reserved in the system. Once the stock is physically returned to the warehouse,
                    please change the Order Status to <strong>Cancelled</strong> below to release the items back into available inventory.
                  </div>
                </div>
              );
            }
            return null;
          })()}

          <form onSubmit={handleEditSave} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'visible', minHeight: 0 }}>
            <div className="edit-modal-grid" style={{ flex: 1, overflow: 'visible', minHeight: 0 }}>

              {/* LEFT COLUMN: Order Items */}
              <div style={{ overflowY: 'auto', padding: '24px', borderRight: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Package size={18} /> Order Items
                  </h3>
                  {isAdmin && ['confirmed', 'delivered'].includes(editingOrder.status) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-card)', padding: '4px 10px', borderRadius: '100px', border: '1px solid var(--border)' }}>
                      <span style={{ fontSize: '11px', fontWeight: 600, color: isUnlocked ? 'var(--danger)' : 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', transition: 'color 0.3s' }}>
                        {isUnlocked ? 'Unlocked' : 'Unlock to Edit'}
                      </span>
                      <button
                        type="button"
                        onClick={() => !isStrictlyLocked && setIsUnlocked(!isUnlocked)}
                        style={{
                          position: 'relative', width: '36px', height: '20px',
                          backgroundColor: isUnlocked ? 'var(--danger)' : 'var(--border)',
                          borderRadius: '100px', border: 'none', cursor: 'pointer',
                          transition: 'background-color 0.3s', padding: 0,
                          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.1)'
                        }}
                      >
                        <div style={{
                          position: 'absolute', top: '2px', left: isUnlocked ? '18px' : '2px',
                          width: '16px', height: '16px', backgroundColor: '#fff',
                          borderRadius: '50%', transition: 'left 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                          boxShadow: '0 2px 4px rgba(0,0,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                          {isUnlocked ? <Unlock size={10} color="var(--danger)" /> : <Lock size={10} color="var(--text-tertiary)" />}
                        </div>
                      </button>
                    </div>
                  )}
                </div>

                {/* Search Bar */}
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', position: 'relative' }}>
                  <div className="search-bar" style={{ position: 'relative', flex: 1 }}>
                    <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
                    <input
                      id="order-add-product-search"
                      name="addProductSearch"
                      aria-label="Search to add new product"
                      type="text"
                      className="form-input"
                      placeholder="Search to add new product..."
                      style={{ paddingLeft: '36px' }}
                      value={searchProduct}
                      onChange={(e) => {
                        setSearchProduct(e.target.value);
                        setShowProductDropdown(true);
                      }}
                      onFocus={() => setShowProductDropdown(true)}
                      disabled={isStrictlyLocked || (['cancelled', 'confirmed', 'delivered'].includes(editingOrder.status) && !isUnlocked)}
                    />
                  </div>

                  <select
                    id="order-add-product-category"
                    name="addProductCategory"
                    aria-label="Filter products by category"
                    className="form-select"
                    style={{ width: '150px' }}
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    disabled={isStrictlyLocked || (['cancelled', 'confirmed', 'delivered'].includes(editingOrder.status) && !isUnlocked)}
                  >
                    <option value="All">All Categories</option>
                    {Array.from(new Set(products.filter(p => p.category?.name).map(p => p.category.name))).map(cat => (
                      <option key={cat as string} value={cat as string}>{cat as string}</option>
                    ))}
                  </select>

                  {showProductDropdown && searchProduct && (
                    <div style={{
                      position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px',
                      background: 'var(--bg-card)', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
                      zIndex: 100, maxHeight: '250px', overflowY: 'auto'
                    }}>
                      {products.filter(p => {
                        const matchesSearch = p.name.toLowerCase().includes(searchProduct.toLowerCase()) || p.sku.toLowerCase().includes(searchProduct.toLowerCase());
                        const matchesCategory = categoryFilter === 'All' || p.category?.name === categoryFilter;
                        return matchesSearch && matchesCategory;
                      }).map(product => (
                        <div
                          key={product.id}
                          style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                          onClick={() => {
                            setSelectedProductForUom(product);
                            setSearchProduct('');
                            setShowProductDropdown(false);
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '4px', overflow: 'hidden', background: 'var(--bg-main)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {product.image ? (
                                <Image width={400} height={400} src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <ShoppingBag size={14} color="var(--text-tertiary)" />
                              )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontWeight: 500, fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{product.name}</div>
                              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }} title={`${product.sku} | Stock: ${product.stock}`}>{product.sku} | Stock: {product.stock}</div>
                            </div>
                          </div>
                          <div style={{ fontWeight: 600, color: 'var(--primary)', fontSize: '13px' }}>{formatCurrency(product.price)}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
                  <table className="table" style={{ fontSize: '13px', margin: 0 }}>
                    <thead style={{ background: 'var(--bg-card)' }}>
                      <tr>
                        <th style={{ padding: '12px 16px', width: '50px' }}>Photo</th>
                        <th style={{ padding: '12px 16px' }}>Product & Unit</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', width: '100px' }}>Qty</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right' }}>Price</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right' }}>Total</th>
                        <th style={{ padding: '12px 16px', textAlign: 'center', width: '50px' }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {editingOrder.items?.map((item, i) => (
                        <tr key={i}>
                          <td data-label="Photo" style={{ padding: '12px 16px' }}>
                            <div style={{ width: '40px', height: '40px', borderRadius: '6px', overflow: 'hidden', background: 'var(--bg-main)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {item.product?.image ? (
                                <Image width={400} height={400} src={item.product.image} alt={item.product?.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <Package size={16} color="var(--text-tertiary)" />
                              )}
                            </div>
                          </td>
                          <td data-label="Product Details" style={{ padding: '12px 16px', minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '240px' }} title={item.product?.name}>
                              {item.product?.name}
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                              <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '200px' }} title={item.product?.sku}>{item.product?.sku}</span>
                              {item.uomName ? (
                                <span style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)', padding: '2px 8px', borderRadius: '100px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>
                                  {item.uomName} (×{item.multiplier || 1} pcs)
                                </span>
                              ) : (
                                <span style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: '100px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase' }}>
                                  Base Unit (1 pc)
                                </span>
                              )}
                            </div>
                          </td>
                          <td data-label="Qty" style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <input
                              id={`order-item-qty-${i}`}
                              name={`itemQty${i}`}
                              aria-label="Item quantity"
                              type="number"
                              min="1"
                              onWheel={(e) => (e.target as HTMLInputElement).blur()}
                              className="form-input"
                              style={{ padding: '6px', textAlign: 'center', height: '34px', fontSize: '14px', fontWeight: 600, width: '80px' }}
                              value={item.quantity || ''}
                              disabled={isStrictlyLocked || (['cancelled', 'confirmed', 'delivered'].includes(editingOrder.status) && !isUnlocked)}
                              onChange={(e) => {
                                const newItems = [...editingOrder.items];
                                newItems[i].quantity = parseInt(e.target.value) || 0;
                                newItems[i].subtotal = newItems[i].quantity * newItems[i].price;
                                setEditingOrder({ ...editingOrder, items: newItems });
                              }}
                            />
                          </td>
                          <td data-label="Price" style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>{formatCurrency(item.price)}</td>
                          <td data-label="Total" style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }}>{formatCurrency((item.quantity || 0) * (item.price || 0))}</td>
                          <td data-label="Actions" style={{ padding: '12px 16px', textAlign: 'center' }}>
                            <button
                              type="button"
                              className="btn btn-icon btn-ghost"
                              style={{ color: 'var(--danger)', width: '28px', height: '28px', minWidth: '28px', padding: 0 }}
                              disabled={isStrictlyLocked || (['cancelled', 'confirmed', 'delivered'].includes(editingOrder.status) && !isUnlocked)}
                              onClick={() => {
                                const newItems = editingOrder.items.filter((_, index) => index !== i);
                                setEditingOrder({ ...editingOrder, items: newItems });
                              }}
                            >
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {(!editingOrder.items || editingOrder.items.length === 0) && (
                        <tr>
                          <td colSpan={6} style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                            <Package size={32} style={{ opacity: 0.2, marginBottom: '8px' }} />
                            <div>No items found in this order.</div>
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot style={{ background: 'var(--bg-card)', borderTop: '1px solid var(--border)' }}>
                      <tr>
                        <td colSpan={6} style={{ padding: '16px' }}>
                          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '12px' }}>
                            <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>Total Products</span>
                            {(() => {
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              const bulkCount = editingOrder.items?.filter((item: any) => item.uomName).reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || 0;
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              const baseCount = editingOrder.items?.filter((item: any) => !item.uomName).reduce((sum: number, item: any) => sum + (item.quantity || 0), 0) || 0;

                              return (
                                <div style={{ display: 'flex', gap: '8px' }}>
                                  {bulkCount > 0 && (
                                    <div style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)', padding: '4px 12px', borderRadius: '100px', fontSize: '13px', fontWeight: 700 }}>
                                      {bulkCount} Bulk
                                    </div>
                                  )}
                                  {baseCount > 0 && (
                                    <div style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', padding: '4px 12px', borderRadius: '100px', fontSize: '13px', fontWeight: 700 }}>
                                      {baseCount} Base Units
                                    </div>
                                  )}
                                  {bulkCount === 0 && baseCount === 0 && (
                                    <div style={{ background: 'var(--bg-hover)', color: 'var(--text-tertiary)', padding: '4px 12px', borderRadius: '100px', fontSize: '13px', fontWeight: 700 }}>
                                      0 Items
                                    </div>
                                  )}
                                </div>
                              );
                            })()}
                          </div>
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* RIGHT COLUMN: Details & Payment */}
              <div style={{ overflowY: 'auto', padding: '24px', background: 'var(--bg-card)' }}>

                {editingOrder.status === 'cancelled' && (
                  <div style={{ padding: '16px', background: 'var(--danger-light)', borderRadius: 'var(--radius-md)', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px', border: '1px solid var(--danger)' }}>
                    <Lock size={24} style={{ color: 'var(--danger)', flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 700, color: 'var(--danger-dark)', fontSize: '14px', marginBottom: '2px' }}>Cancelled</div>
                      <div style={{ fontSize: '13px', color: 'var(--danger-dark)', opacity: 0.85 }}>Stock restored. Create new order instead.</div>
                    </div>
                  </div>
                )}

                {/* Customer Card */}
                <div style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '16px', marginBottom: '20px' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>Customer Information</div>
                  <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)', marginBottom: '4px' }}>
                    {editingOrder.customer?.name || 'Walk-in Customer'}
                  </div>
                  {editingOrder.customer?.phone && (
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                      Phone: {editingOrder.customer.phone}
                    </div>
                  )}
                  {editingOrder.customer?.address && (
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                      Address: {editingOrder.customer.address}
                    </div>
                  )}
                </div>

                {/* Status & Delivery Fields */}
                <div className="form-grid-2" style={{ gap: '16px', marginBottom: '20px' }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="edit-order-status" className="form-label">Order Status</label>
                    <select
                      id="edit-order-status"
                      name="status"
                      className="form-select"
                      value={editForm.status}
                      disabled={isStrictlyLocked || editingOrder.status === 'cancelled'}
                      onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    >
                      <option value="pending">Pending</option>
                      <option value="confirmed">Confirmed</option>
                      <option value="delivered">Delivered</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label htmlFor="edit-order-payment-status" className="form-label">Payment Status</label>
                    <select
                      id="edit-order-payment-status"
                      name="paymentStatus"
                      className="form-select"
                      value={editForm.paymentStatus}
                      disabled={isStrictlyLocked || editingOrder.status === 'cancelled'}
                      onChange={(e) => setEditForm({ ...editForm, paymentStatus: e.target.value })}
                    >
                      <option value="unpaid">Unpaid</option>
                      <option value="partial">Partial</option>
                      <option value="paid">Paid</option>
                    </select>
                  </div>

                  {editingOrder.delivery && (!Array.isArray(editingOrder.delivery) || editingOrder.delivery.length > 0) && (
                    <>
                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="edit-order-driver" className="form-label">Delivery Driver</label>
                        <select
                          id="edit-order-driver"
                          name="deliveryDriverName"
                          className="form-select"
                          value={editForm.deliveryDriverName}
                          disabled={isStrictlyLocked || editingOrder.status === 'cancelled'}
                          onChange={(e) => setEditForm({ ...editForm, deliveryDriverName: e.target.value })}
                        >
                          <option value="">-- Select Driver --</option>
                          {drivers.map(d => (
                            <option key={d.id} value={d.name}>{d.name}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-group" style={{ marginBottom: 0 }}>
                        <label htmlFor="edit-order-delivery-date" className="form-label">Delivery Date</label>
                        <input
                          id="edit-order-delivery-date"
                          name="deliveryDate"
                          type="date"
                          className="form-input"
                          value={editForm.deliveryDate}
                          disabled={isStrictlyLocked || editingOrder.status === 'cancelled'}
                          onChange={(e) => setEditForm({ ...editForm, deliveryDate: e.target.value })}
                        />
                      </div>
                    </>
                  )}
                </div>

                {/* Financial Summary */}
                <div style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: 'var(--text-secondary)' }}>
                    <span>Subtotal</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{formatCurrency(calculatedSubtotal)}</span>
                  </div>

                  {/* Discount Controls */}
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <label htmlFor="edit-order-discount" className="form-label" style={{ fontSize: '11px', marginBottom: '4px' }}>Discount</label>
                      <div style={{ display: 'flex', gap: '4px' }}>
                        <input
                          id="edit-order-discount"
                          name="discountValue"
                          type="number"
                          step="0.01"
                          min="0"
                          className="form-input"
                          placeholder="0.00"
                          style={{ height: '32px', fontSize: '12px' }}
                          value={editForm.discountValue}
                          disabled={isStrictlyLocked || editingOrder.status === 'cancelled'}
                          onChange={(e) => setEditForm({ ...editForm, discountValue: e.target.value })}
                        />
                        <select
                          id="edit-order-discount-type"
                          name="discountType"
                          aria-label="Discount Type"
                          className="form-select"
                          style={{ width: '80px', height: '32px', fontSize: '12px', padding: '0 8px' }}
                          value={editForm.discountType}
                          disabled={isStrictlyLocked || editingOrder.status === 'cancelled'}
                          onChange={(e) => setEditForm({ ...editForm, discountType: e.target.value as 'percent' | 'flat' })}
                        >
                          <option value="percent">%</option>
                          <option value="flat">₱</option>
                        </select>
                      </div>
                    </div>
                    {currentFlatDiscount > 0 && (
                      <div style={{ fontSize: '12px', color: 'var(--danger)', fontWeight: 600, paddingTop: '16px' }}>
                        -{formatCurrency(currentFlatDiscount)}
                      </div>
                    )}
                  </div>

                  {/* Amount Paid Field */}
                  {['partial', 'unpaid'].includes(editForm.paymentStatus) && (
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label htmlFor="edit-order-amount-paid" className="form-label" style={{ fontSize: '11px', marginBottom: '4px' }}>Amount Paid (₱)</label>
                      <input
                        id="edit-order-amount-paid"
                        name="amountPaid"
                        type="number"
                        step="0.01"
                        min="0"
                        className="form-input"
                        placeholder="0.00"
                        style={{ height: '32px', fontSize: '12px' }}
                        value={editForm.amountPaid}
                        disabled={isStrictlyLocked || editingOrder.status === 'cancelled'}
                        onChange={(e) => setEditForm({ ...editForm, amountPaid: e.target.value })}
                      />
                    </div>
                  )}

                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>Grand Total</span>
                    <span style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary)' }}>
                      {formatCurrency(calculatedGrandTotal)}
                    </span>
                  </div>
                </div>

              </div>
            </div>
            <div className="modal-footer edit-modal-footer" style={{ background: 'var(--bg-main)', borderTop: '1px solid var(--border)', padding: '16px 24px' }}>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  onOpenReceipt(editingOrder);
                  onClose();
                }}
                style={{ display: 'flex', gap: '6px', alignItems: 'center' }}
              >
                <Printer size={16} /> Preview & Print Receipt
              </button>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button type="button" className="btn btn-secondary" onClick={onClose} disabled={isSaving}>Cancel</button>
                {!isStrictlyLocked && (
                  <button type="submit" className="btn btn-primary" disabled={isSaving || editingOrder.status === 'cancelled'} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 24px' }}>
                    {isSaving ? <Loader2 size={18} className="spin" /> : <Save size={18} />} {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* UOM Selection Modal for Line Items */}
      {selectedProductForUom && (
        <div className="modal-overlay">
          <div className="modal" role="dialog" aria-modal="true" style={{ width: '100%', maxWidth: '400px', minWidth: '320px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Select Unit</h2>
              <button className="btn btn-icon btn-ghost" onClick={() => setSelectedProductForUom(null)} aria-label="Close dialog">
                <X size={20} />
              </button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button
                type="button"
                className="btn btn-outline"
                style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', height: 'auto', textAlign: 'left' }}
                onClick={() => {
                  const newItems = [...(editingOrder?.items || []), {
                    productId: selectedProductForUom.id,
                    product: selectedProductForUom,
                    quantity: 1,
                    price: selectedProductForUom.price,
                    subtotal: selectedProductForUom.price,
                    uomName: undefined,
                    multiplier: 1
                  }];
                  if (editingOrder) setEditingOrder({ ...editingOrder, items: newItems });
                  setSelectedProductForUom(null);
                }}
              >
                <div>
                  {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                  <div style={{ fontWeight: 600, fontSize: '16px' }}>{selectedProductForUom.uoms?.find((u: any) => u.isBase)?.name || 'Base Unit'}</div>
                  <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>1 {selectedProductForUom.unit || 'pcs'}</div>
                </div>
                <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--primary)' }}>
                  {formatCurrency(selectedProductForUom.price)}
                </div>
              </button>

              {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
              {selectedProductForUom.uoms?.filter((u: any) => !u.isBase).map((uom: any) => (
                <button
                  key={uom.id || uom.name}
                  type="button"
                  className="btn btn-outline"
                  style={{ display: 'flex', justifyContent: 'space-between', padding: '16px', height: 'auto', textAlign: 'left' }}
                  onClick={() => {
                    const newItems = [...(editingOrder?.items || []), {
                      productId: selectedProductForUom.id,
                      product: selectedProductForUom,
                      quantity: 1,
                      price: uom.price,
                      subtotal: uom.price,
                      uomName: uom.name,
                      multiplier: uom.multiplier
                    }];
                    if (editingOrder) setEditingOrder({ ...editingOrder, items: newItems });
                    setSelectedProductForUom(null);
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '16px' }}>{uom.name}</div>
                    <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Contains {uom.multiplier} {selectedProductForUom.unit || 'pcs'}</div>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '16px', color: 'var(--primary)' }}>
                    {formatCurrency(uom.price)}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
export default EditOrderModal;
