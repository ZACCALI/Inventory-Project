'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { Search, Filter,  Download, Edit, Eye, X, Save, Trash2, Archive, RefreshCw, DollarSign, ShoppingCart, User, Unlock, Lock,  ShoppingBag, Home, Truck, Store, Printer,  Receipt, MoreVertical, Package, Calendar, AlertCircle, Phone, Mail,    Star, Loader2 } from 'lucide-react';
import { APP_NAME, formatCurrency } from '@/lib/constants';
import { useAlert } from '@/components/AlertModal';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { useDebounce } from '@/hooks/useDebounce';
import { addSyncTask } from '@/lib/offlineSync';
import { db } from '@/lib/db';
import { printThermal } from '@/lib/printService';
import { loadPrinterConfig } from '@/lib/qzService';

import Image from "next/image";
interface Order {
  id: string;
  orderNumber: string;
  customer: { name: string; address?: string; phone?: string; email?: string; contactPerson?: string };
  totalAmount: number;
  discount: number;
  status: string;
  paymentStatus: string;
  orderType: string;
  notes: string | null;
  orderDate: string;
  createdAt: string;
  createdBy?: { name: string };
  items: Array<{
    quantity: number;
    price: number;
    subtotal: number;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    product: any;
    uomName?: string;
    multiplier?: number;
  }>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  delivery?: any;
  isArchived?: boolean;
}

export default function OrdersPage() {
  const { data: session } = useSession();
  const { showAlert, showConfirm, showToast } = useAlert();
  const isAdmin = session?.user?.role?.toLowerCase() === 'admin';
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const [isOnline, setIsOnline] = useState(true);
  useEffect(() => {
    setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true);
  }, []);
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);


  const [lockOrderCancel, setLockOrderCancel] = useState(true);
  const [lockOrderDelete, setLockOrderDelete] = useState(true);
  const [lockOrderEdit, setLockOrderEdit] = useState(false);
  const [companyName, setCompanyName] = useState('Amroding General Merchandise');
  const [paperWidth, setPaperWidth] = useState('58');
  const [receiptTab, setReceiptTab] = useState<'thermal' | 'bond'>('thermal');
  const [previewPaperWidth, setPreviewPaperWidth] = useState<'58' | '80'>('58');

  useEffect(() => {
    const loadConfig = async () => {
      const cfg = await loadPrinterConfig();
      if (cfg?.paperWidth) setPaperWidth(cfg.paperWidth);
    };
    loadConfig();
    const listener = () => { loadConfig(); };
    if (typeof window !== 'undefined') {
      window.addEventListener('printerConfigUpdated', listener);
      return () => window.removeEventListener('printerConfigUpdated', listener);
    }
  }, []);

  const [statusFilter, setStatusFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);

  const [page, setPage] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const limit = 50;

  const [isEditOpen, setIsEditOpen] = useState(false);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [originalItems, setOriginalItems] = useState<any[]>([]);
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [drivers, setDrivers] = useState<any[]>([]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [products, setProducts] = useState<any[]>([]);
  const [searchProduct, setSearchProduct] = useState('');
  const [showProductDropdown, setShowProductDropdown] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState('All');
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedProductForUom, setSelectedProductForUom] = useState<any>(null);
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [receiptOrder, setReceiptOrder] = useState<any>(null);

  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  // Auto-update amountPaid if paymentStatus is paid
  useEffect(() => {
    if (!editingOrder || editForm.paymentStatus !== 'paid') return;
    const subtotal = editingOrder.items?.reduce((sum, item) => sum + item.subtotal, 0) || editingOrder.totalAmount + (editingOrder.discount || 0);
    let parsedDiscount = parseFloat(editForm.discountValue) || 0;
    if (parsedDiscount < 0) parsedDiscount = 0;
    if (editForm.discountType === 'percent' && parsedDiscount > 100) parsedDiscount = 100;
    const flatDiscount = editForm.discountType === 'percent' ? (parsedDiscount / 100) * subtotal : parsedDiscount;
    const newTotal = Math.max(0, subtotal - flatDiscount);
    
    // Only update if it actually differs to prevent infinite loops
    if (parseFloat(editForm.amountPaid || '0') !== newTotal) {
      setEditForm(prev => ({ ...prev, amountPaid: newTotal.toString() }));
    }
  }, [editingOrder?.items, editForm.discountValue, editForm.discountType, editForm.paymentStatus, editingOrder?.totalAmount, editingOrder?.discount]);

  const getQueryString = () => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.append('search', debouncedSearch);
    if (statusFilter) params.append('status', statusFilter);
    if (paymentFilter) params.append('paymentStatus', paymentFilter);
    if (typeFilter) params.append('orderType', typeFilter);
    if (showArchived) params.append('archived', 'true');
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    return params.toString();
  };

  const { data: swrRes, error: swrError } = useSWR(
    session ? `/api/orders?${getQueryString()}` : null,
    async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      return { data, totalCount: parseInt(res.headers.get('X-Total-Count') || '0', 10) };
    }
  );

  // Stop skeleton after 2s if offline with no cache
  useEffect(() => {
    if (!swrRes && !swrError) {
      const t = setTimeout(() => setLoading(false), 2000);
      return () => clearTimeout(t);
    }

    const applyOfflineTasks = async () => {
      if (!swrRes && !swrError) return;
      
      try {
        const pendingTasks = await db.syncQueue
          .where('type')
          .equals('order')
          .and(t => t.syncStatus === 'pending' || t.syncStatus === 'failed')
          .toArray();

        let modifiedOrders = Array.isArray(swrRes?.data) ? [...(swrRes?.data || [])] : [];

        for (const task of pendingTasks) {
          try {
            const payload = JSON.parse(task.payload);
            
            if (task.action === 'DELETE') {
              modifiedOrders = modifiedOrders.filter(o => o.id !== payload.id);
            } else if (task.action === 'UPDATE') {
              modifiedOrders = modifiedOrders.map(o => o.id === payload.id ? { ...o, ...payload } : o);
            } else if (task.action === 'CREATE') {
              if (!modifiedOrders.find(o => o.id === payload.id)) {
                modifiedOrders.unshift(payload as unknown as Order);
              }
            }
          } catch {}
        }
        
        setOrders(modifiedOrders);
        setTotalOrders(swrRes?.totalCount || 0);
      } catch (err) {
        console.error('Failed to apply offline tasks', err);
        setOrders(Array.isArray(swrRes?.data) ? swrRes!.data : []);
        setTotalOrders(swrRes?.totalCount || 0);
      } finally {
        setLoading(false);
      }
    };

    if (swrRes || swrError) {
      applyOfflineTasks();
    }
  }, [swrRes, swrError]);

  useEffect(() => { 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleClickOutside = (e: any) => {
      if (e.target.closest('.action-dropdown-container')) return;
      setActiveDropdown(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handleClickOutside = (e: any) => {
      if (isFilterOpen && !e.target.closest('.filter-dropdown-container')) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isFilterOpen]);

  const fetchOrders = async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const res = await fetch(`/api/orders?${getQueryString()}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setOrders(data);
        const totalCount = res.headers.get('X-Total-Count');
        if (totalCount) setTotalOrders(parseInt(totalCount, 10));
      } else {
        setOrders([]);
        setTotalOrders(0);
      }
// eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      if (error?.message === 'Failed to fetch' || error instanceof TypeError) return; 
      console.error('Failed to fetch orders:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch('/api/products');
      const data = await res.json();
      if (Array.isArray(data)) setProducts(data);
    } catch (e) {
      console.error('Failed to fetch products:', e);
    }
  };

  const fetchDrivers = async () => {
    try {
      const res = await fetch('/api/drivers');
      const data = await res.json();
      if (Array.isArray(data)) setDrivers(data);
    } catch (e) {
      console.error('Failed to fetch drivers:', e);
    }
  };

  useEffect(() => {
    fetchOrders();
    fetchProducts();
    fetchDrivers();

    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/settings');
        if (!res.ok) throw new Error();
        const data = await res.json();
        setLockOrderCancel(data.lockOrderCancel ?? true);
        setLockOrderDelete(data.lockOrderDelete ?? true);
        setLockOrderEdit(data.lockOrderEdit ?? false);
        if (data.companyName) setCompanyName(data.companyName);
      } catch {
        try {
          const cachedSettings = await db.settings.get('current');
          if (cachedSettings?.data) {
            const data = JSON.parse(cachedSettings.data);
            setLockOrderCancel(data.lockOrderCancel ?? true);
            setLockOrderDelete(data.lockOrderDelete ?? true);
            setLockOrderEdit(data.lockOrderEdit ?? false);
            if (data.companyName) setCompanyName(data.companyName);
          }
        } catch (dexieErr) {
          console.warn('Failed to load settings from Dexie cache', dexieErr);
        }
      }
    };
    fetchSettings();

    const interval = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        fetchOrders();
      }
    }, 60000); // Poll every 60 seconds (online only)

    return () => clearInterval(interval);
// eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, statusFilter, paymentFilter, typeFilter, showArchived, page]);

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'badge-warning', confirmed: 'badge-primary', delivered: 'badge-success', cancelled: 'badge-danger',
      paid: 'badge-success', unpaid: 'badge-danger', partial: 'badge-warning',
    };
    return map[status.toLowerCase()] || 'badge-neutral';
  };

  const openEditModal = async (order: Order) => {
    setEditingOrder(order);
    
    // Fetch REAL payment total from the database instead of parsing notes
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

    // Fallback: parse from notes if payments API returned nothing
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

    // Auto-fill amountPaid based on payment status
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
    setOriginalItems(JSON.parse(JSON.stringify(order.items || [])));
    setIsUnlocked(false);
    setIsEditOpen(true);
  };

// eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleDeleteOrder = async (id: string) => {
    if (!await showConfirm('Archive Order', 'Are you sure you want to archive this order? Note: Stock will NOT be restored. To restore stock, cancel the order first.')) return;
    
    try {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      let networkFailed = false;

      if (!isOffline) {
        try {
          const res = await fetch(`/api/orders/${id}`, { method: 'DELETE' });
          if (res.ok) {
            fetchOrders();
            showToast('success', 'Order successfully archived.');
            return;
          } else {
            const data = await res.json();
            showAlert('error', 'Action Failed', data.error || 'Failed to delete order.');
            return;
          }
        } catch (fetchErr) {
          console.warn('Network error detected, falling back to offline mode', fetchErr);
          networkFailed = true;
        }
      }

      if (isOffline || networkFailed) {
        await addSyncTask('order', 'DELETE', { id });
        showToast('offline', 'Action queued offline — will sync when connected');
        setOrders(prev => prev.filter(o => o.id !== id));
        return;
      }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      showAlert('error', 'Action Failed', 'Failed to delete order due to a network error.');
    }
  };

  const handleArchiveOrder = async (id: string) => {
    if (!await showConfirm('Archive Order', 'Are you sure you want to archive this order?')) return;
    try {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      let networkFailed = false;

      if (!isOffline) {
        try {
          const res = await fetch(`/api/orders/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isArchived: true }),
          });
          if (res.ok) {
            fetchOrders();
            showToast('success', 'Order successfully archived.');
            return;
          } else {
            const data = await res.json();
            showAlert('error', 'Action Failed', data.error || 'Failed to archive order.');
            return;
          }
        } catch (fetchErr) {
          console.warn('Network error detected, falling back to offline mode', fetchErr);
          networkFailed = true;
        }
      }

      if (isOffline || networkFailed) {
        await addSyncTask('order', 'UPDATE', { id, isArchived: true });
        showToast('offline', 'Action queued offline — will sync when connected');
        setOrders(prev => prev.map(o => o.id === id ? { ...o, isArchived: true } as unknown as Order : o));
        return;
      }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      showAlert('error', 'Action Failed', 'Failed to archive order due to a network error.');
    }
  };

  const handleUnarchiveOrder = async (id: string) => {
    if (!await showConfirm('Unarchive Order', 'Are you sure you want to unarchive this order?')) return;
    try {
      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      let networkFailed = false;

      if (!isOffline) {
        try {
          const res = await fetch(`/api/orders/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isArchived: false }),
          });
          if (res.ok) {
            fetchOrders();
            showToast('success', 'Order successfully unarchived.');
            return;
          } else {
            const data = await res.json();
            showAlert('error', 'Action Failed', data.error || 'Failed to unarchive order.');
            return;
          }
        } catch (fetchErr) {
          console.warn('Network error detected, falling back to offline mode', fetchErr);
          networkFailed = true;
        }
      }

      if (isOffline || networkFailed) {
        await addSyncTask('order', 'UPDATE', { id, isArchived: false });
        showToast('offline', 'Action queued offline — will sync when connected');
        setOrders(prev => prev.map(o => o.id === id ? { ...o, isArchived: false } as unknown as Order : o));
        return;
      }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      showAlert('error', 'Action Failed', 'Failed to unarchive order due to a network error.');
    }
  };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
  const printThermalReceipt = async (order: any) => {
    if (!order) return;

    const orderNo    = ((order.orderNumber || '').split('-').pop() || '');
    const createdBy  = (order.createdBy?.name || 'ADMIN');
    const dateStr    = new Date(order.createdAt).toLocaleString('en-GB', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}).replace(',','');
    const subtotal   = order.totalAmount + (order.discount || 0);
    const deliv      = Array.isArray(order.delivery) ? order.delivery[0] : order.delivery;

    // Extract amount paid from payments array or notes
    let orderAmountPaid: number | undefined;
    if (order.paymentStatus === 'paid') {
      orderAmountPaid = order.totalAmount;
    } else if (order.paymentStatus === 'partial') {
      // Try payments array first
      if (order.payments?.length) {
        orderAmountPaid = order.payments.reduce((s: number, p: { amount: number }) => s + p.amount, 0);
      } else {
        // Fallback: parse from notes
        const amtMatch = order.notes?.match(/Amount Paid:\s*[₱P]?\s*([\d,.]+)/i);
        if (amtMatch) orderAmountPaid = parseFloat(amtMatch[1].replace(/,/g, ''));
      }
    }

    const result = await printThermal({
      companyName,
      orderNo,
      createdBy,
      dateStr,
      driverName:   deliv?.driverName || order.deliveryDriverName || undefined,
      deliveryDate: deliv?.scheduledDate ? new Date(deliv.scheduledDate).toLocaleDateString() : order.deliveryDate ? new Date(order.deliveryDate).toLocaleDateString() : undefined,
      notes:        order.notes || undefined,
      items:        order.items || [],
      subtotal,
      discount:     order.discount || 0,
      amountDue:    order.totalAmount,
      paymentStatus: order.paymentStatus || undefined,
      amountPaid:   orderAmountPaid,
    }, () => showToast('offline', 'QZ Tray not configured — using browser print. Set up Printer in Settings → Thermal Printer.'));

    if (result === 'error') {
      showAlert('error', 'Print Failed', 'Could not print receipt. Please allow popups or set up QZ Tray in Settings.');
    }
  };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
  const printBondReceipt = (order: any) => {
    if (!order) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) { showAlert('error', 'Action Failed', 'Please allow popups to print receipt.'); return; }

    const html = `
      <html>
        <head>
          <title>Receipt - ${escapeHtml(order.orderNumber || 'Order')}</title>
          <style>
            @page { margin: 15mm; }
            body { font-family: 'Segoe UI', Arial, sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; font-size: 13px; color: #222; }
            .header { text-align: center; margin-bottom: 24px; border-bottom: 2px solid #000000; padding-bottom: 16px; }
            .header h1 { font-size: 22px; font-weight: 800; color: #000000; margin: 0 0 4px; text-transform: uppercase; letter-spacing: 1px; }
            .header p { margin: 2px 0; color: #555; font-size: 12px; }
            .meta { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 16px; margin-bottom: 20px; padding: 12px 16px; background: #f5f7fa; border-radius: 8px; }
            .meta div { font-size: 12px; min-width: 120px; }
            .meta strong { display: block; font-size: 13px; color: #222; margin-bottom: 2px; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            thead th { background: #000000; color: #fff; padding: 10px 12px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; }
            thead th:nth-child(3), thead th:nth-child(4), thead th:nth-child(5) { text-align: right; }
            tbody td { padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 13px; }
            tbody td:nth-child(3), tbody td:nth-child(4), tbody td:nth-child(5) { text-align: right; }
            .totals { margin-left: auto; width: 280px; }
            .totals .row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
            .totals .row.grand { border-top: 2px solid #000000; padding-top: 12px; margin-top: 8px; font-size: 18px; font-weight: 800; color: #000000; }
            .totals .row.discount { color: #e53e3e; }
            .footer { text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #ddd; color: #888; font-size: 11px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${companyName}</h1>
            <p>Sarimanok St. Marawi City 2nd</p>
            <p style="margin-top: 8px; font-weight: 600; color: #000000;">OFFICIAL RECEIPT</p>
          </div>

          <div class="meta">
            <div>
              <strong>Order #${escapeHtml(order.orderNumber || '')}</strong>
              ${new Date(order.createdAt).toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })}
            </div>
            ${order.delivery ? `
            <div>
              <strong>Delivery Driver</strong>
              ${escapeHtml(order.delivery.driverName || 'N/A')}
            </div>
            <div>
              <strong>Delivery Date</strong>
              ${order.delivery.scheduledDate ? new Date(order.delivery.scheduledDate).toLocaleDateString() : 'N/A'}
            </div>
            ` : ''}
            <div style="text-align: right; flex-grow: 1;">
              <strong>Cashier</strong>
              ${escapeHtml(order.createdBy?.name || 'ADMIN')}
            </div>
            ${order.delivery ? `
            <div style="width: 100%; border-top: 1px dashed #ddd; margin-top: 8px; padding-top: 8px;">
              <strong>Delivery Details</strong>
              Customer: ${escapeHtml(order.customer?.name || 'Walk-in')}<br/>
              Address: ${escapeHtml(order.customer?.address || 'N/A')}
            </div>
            ` : ''}
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Price</th>
                <th>Total</th>
              </tr>
            </thead>
            <tbody>
              ${order.items.map((i: { product?: { name: string, unit?: string }, uomName?: string, quantity: number, price: number, subtotal: number }, idx: number) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td>${escapeHtml(i.product?.name || 'Item')} <small style="color:#000000;">(${escapeHtml((i.uomName || i.product?.unit || 'PCS').toUpperCase())})</small></td>
                  <td>${i.quantity}</td>
                  <td>${Number(i.price).toFixed(2)}</td>
                  <td><strong>${(Number(i.quantity) * Number(i.price)).toFixed(2)}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="totals">
            <div class="row">
              <span>Subtotal</span>
              <span>${(order.totalAmount + (order.discount || 0)).toFixed(2)}</span>
            </div>
            ${order.discount > 0 ? `
              <div class="row discount">
                <span>Discount</span>
                <span>-${order.discount.toFixed(2)}</span>
              </div>
            ` : ''}
            <div class="row grand">
              <span>Total</span>
              <span>₱${order.totalAmount.toFixed(2)}</span>
            </div>
          </div>

          <div class="footer">
            <p>Thank you for your purchase!</p>
            <p>Facebook: ${companyName.toUpperCase()}</p>
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 500);
  };

  const handleEditSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOrder) return;
    
    // Warn if changing status to cancelled
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

      // Compute flat discount from percentage
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

      // Guard: flat discount cannot exceed the subtotal
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

      const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;
      let networkFailed = false;

      if (!isOffline) {
        try {
          const res = await fetch(`/api/orders/${editingOrder.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (res.ok) {
            // Sync payment records: fetch existing payments and create a record for the difference
            if (['paid', 'partial'].includes(editForm.paymentStatus) && parsedAmount > 0) {
              try {
                const payRes = await fetch(`/api/orders/${editingOrder.id}/payments`);
                const existingPayments = payRes.ok ? await payRes.json() : [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
                const existingTotal = Array.isArray(existingPayments) ? existingPayments.reduce((sum: number, p: any) => sum + (p.amount || 0), 0) : 0;
                const difference = parsedAmount - existingTotal;

                if (difference > 0.01) {
                  await fetch(`/api/orders/${editingOrder.id}/payments`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ amount: difference, method: paymentMethod.toLowerCase(), notes: 'Payment recorded via order edit' }),
                  });
                }
              } catch {
                // Payment sync failed silently — the order itself is already saved
              }
            }

            await fetchOrders();
            setIsEditOpen(false);
            setEditingOrder(null);
            return;
          } else {
            const err = await res.json();
            showAlert('error', 'Action Failed', err.error || 'Failed to update order');
            return;
          }
        } catch (fetchErr) {
          console.warn('Network error detected, falling back to offline mode', fetchErr);
          networkFailed = true;
        }
      }

      if (isOffline || networkFailed) {
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
        setOrders(prev => prev.map(o => o.id === editingOrder.id ? {
          ...o,
          ...payload,
          ...(itemsModified ? { items: editingOrder.items } : {})
        } as unknown as Order : o));
        setIsEditOpen(false);
        setEditingOrder(null);
        setIsSaving(false);
        return;
      }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      showAlert('error', 'Action Failed', 'An unexpected error occurred.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateInvoice = (order: Order) => {
    const doc = new jsPDF();
    const formatPDFCurrency = (amount: number) => `PHP ${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // === Minimalist Modern Header ===
    // Premium Monogram Icon
    doc.setFillColor(0, 97, 255); // var(--primary)
    doc.roundedRect(14, 14, 10, 10, 2, 2, 'F');
    
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('A', 19, 21.2, { align: 'center' });
    
    // Brand name / System name
    doc.setFontSize(18);
    doc.setTextColor(0, 97, 255); // The exact system color
    doc.text(companyName, 28, 22);

    doc.setFontSize(24);
    doc.setTextColor(29, 78, 216); // Subtle primary color for INVOICE text
    doc.setFont('helvetica', 'bold');
    doc.text('INVOICE', 196, 26, { align: 'right' });

    // Subtle separator line
    doc.setDrawColor(229, 231, 235);
    doc.line(14, 35, 196, 35);

    // === Invoice Meta (Left side) ===
    doc.setFontSize(10);
    doc.setTextColor(44, 62, 80);
    doc.setFont('helvetica', 'bold');
    doc.text('Invoice #:', 14, 45);
    doc.setFont('helvetica', 'normal');
    doc.text(`${order.orderNumber}`, 40, 45);

    doc.setFont('helvetica', 'bold');
    doc.text('Date:', 14, 52);
    doc.setFont('helvetica', 'normal');
    doc.text(new Date(order.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' }), 40, 52);

    doc.setFont('helvetica', 'bold');
    doc.text('Type:', 14, 59);
    doc.setFont('helvetica', 'normal');
    doc.text((order.delivery && (!Array.isArray(order.delivery) || order.delivery.length > 0)) ? 'Walk-in Home (Delivery)' : 'Walk-in Home (Walk-in)', 40, 59);

    // === Bill To Section (Right side) ===
    doc.setFontSize(11);
    doc.setTextColor(44, 62, 80);
    doc.setFont('helvetica', 'bold');
    doc.text('BILL TO:', 120, 45);

    doc.setFontSize(10);
    doc.text(order.customer?.name || 'Walk-in Customer', 120, 52);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    let yPos = 57;
    if (order.customer?.contactPerson) { doc.text(`Contact: ${order.customer.contactPerson}`, 120, yPos); yPos += 5; }
    if (order.customer?.address) { doc.text(order.customer.address, 120, yPos); yPos += 5; }
    if (order.customer?.phone) { doc.text(`Phone: ${order.customer.phone}`, 120, yPos); yPos += 5; }
    if (order.customer?.email) { doc.text(`Email: ${order.customer.email}`, 120, yPos); yPos += 5; }

    // === Items Table ===
    const tableColumn = ["#", "Item Description", "SKU", "Qty", "Unit Price", "Total"];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tableRows: any[] = [];

    if (order.items && order.items.length > 0) {
      order.items.forEach((item, index) => {
        tableRows.push([
          (index + 1).toString(),
          item.product?.name || 'Unknown Item',
          item.product?.sku || '-',
          item.quantity.toString(),
          formatPDFCurrency(item.price),
          formatPDFCurrency(item.subtotal)
        ]);
      });
    }

    const startY = Math.max(yPos + 5, 75);

    autoTable(doc, {
      startY,
      head: [tableColumn],
      body: tableRows,
      theme: 'plain',
      headStyles: { fillColor: [248, 250, 252], textColor: [44, 62, 80], fontStyle: 'bold', fontSize: 9, lineWidth: 0 },
      styles: { fontSize: 9, cellPadding: 6, textColor: [71, 85, 105] },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bodyStyles: { lineWidth: { bottom: 0.1 } as any, lineColor: [229, 231, 235] },
      columnStyles: {
        0: { cellWidth: 12, halign: 'center' },
        3: { cellWidth: 15, halign: 'center' },
        4: { cellWidth: 35, halign: 'right' },
        5: { cellWidth: 35, halign: 'right' },
      },
      didDrawPage: (data) => {
        if (data.pageNumber > 1) {
          doc.setFillColor(0, 97, 255);
          doc.roundedRect(14, 10, 8, 8, 1.5, 1.5, 'F');
          doc.setFontSize(11);
          doc.setTextColor(255, 255, 255);
          doc.setFont('helvetica', 'bold');
          doc.text('A', 18, 15.8, { align: 'center' });
          
          doc.setFontSize(14);
          doc.setTextColor(0, 97, 255);
          doc.text(companyName, 25, 16);
          
          doc.setFontSize(16);
          doc.setTextColor(29, 78, 216);
          doc.text('INVOICE', 196, 17, { align: 'right' });
          
          doc.setDrawColor(229, 231, 235);
          doc.line(14, 21, 196, 21);
        }
      }
    });

    // === Totals Section ===
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalY = (doc as any).lastAutoTable.finalY || startY;
    const subtotal = order.items ? order.items.reduce((sum, item) => sum + item.subtotal, 0) : order.totalAmount;
    const discount = order.discount || 0;
    const total = order.totalAmount;

    // Check if totals section fits on current page
    let currentY = finalY + 15;
    const totalsHeight = 35; // approximate vertical space for payment status + total block
    if (currentY + totalsHeight > 270) {
      doc.addPage();
      currentY = 25;
    }

    // Status Badges
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(44, 62, 80);
    doc.text('Payment Status:', 14, currentY);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(order.paymentStatus === 'paid' ? 34 : 220, order.paymentStatus === 'paid' ? 197 : 38, order.paymentStatus === 'paid' ? 94 : 38);
    doc.text(order.paymentStatus.toUpperCase(), 45, currentY);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(44, 62, 80);
    doc.text('Order Status:', 14, currentY + 7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(order.status.toUpperCase(), 45, currentY + 7);

    // Totals on right
    const totalsX = 130;
    let totalsBlockY = currentY;

    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text('Subtotal:', totalsX, totalsBlockY);
    doc.setTextColor(44, 62, 80);
    doc.text(formatPDFCurrency(subtotal), 196, totalsBlockY, { align: 'right' });

    if (discount > 0) {
      totalsBlockY += 8;
      doc.setTextColor(231, 76, 60);
      doc.text('Discount:', totalsX, totalsBlockY);
      doc.text(`-${formatPDFCurrency(discount)}`, 196, totalsBlockY, { align: 'right' });
    }

    totalsBlockY += 10;
    doc.setDrawColor(229, 231, 235);
    doc.setLineWidth(0.5);
    doc.line(totalsX, totalsBlockY - 6, 196, totalsBlockY - 6);

    doc.setFontSize(13);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(29, 78, 216);
    doc.text('TOTAL:', totalsX, totalsBlockY);
    doc.text(formatPDFCurrency(total), 196, totalsBlockY, { align: 'right' });

    // === Notes ===
    if (order.notes) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(100, 116, 139);
      
      const splitNotes = doc.splitTextToSize(order.notes, 180);
      const linesCount = splitNotes.length;
      const notesHeight = linesCount * 4.5;
      
      let notesY = totalsBlockY + 15;
      if (notesY + notesHeight + 10 > 270) {
        doc.addPage();
        notesY = 25;
      }
      
      doc.text('Notes:', 14, notesY);
      doc.text(splitNotes, 14, notesY + 5);
    }

    // === Footers on all pages ===
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(149, 165, 166);
      doc.setFont('helvetica', 'normal');
      doc.text(`Thank you for your business! — Generated by ${APP_NAME} | Page ${i} of ${pageCount}`, 105, 285, { align: 'center' });
    }

    doc.save(`Invoice_${order.orderNumber}.pdf`);
  };

  const formatCount = (num: number) => {
    if (num >= 1000000) return (num / 1000000).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toString();
  };

  const escapeHtml = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

  const totalRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const walkInOrders = orders.filter(o => !o.delivery || (Array.isArray(o.delivery) && o.delivery.length === 0)).length;
  const deliveryOrders = orders.filter(o => o.delivery && (!Array.isArray(o.delivery) || o.delivery.length > 0)).length;

  let contextLabel = 'All Orders';
  if (search) contextLabel = `Search: ${search}`;
  else if (statusFilter || paymentFilter || typeFilter) contextLabel = [statusFilter, paymentFilter, typeFilter].filter(Boolean).join(' | ');
  
  const isStrictlyLocked = !isAdmin && lockOrderEdit;

  return (
    <>
      <div className="page-header mobile-col" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="page-title">Orders</h1>
          <p className="page-subtitle">Manage customer orders and track payments</p>
        </div>
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
          <div className="stat-icon green"><DollarSign size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Total Revenue</div>
            <div className="stat-value">{formatCurrency(totalRevenue)}</div>
            <div className="stat-change" style={{ color: 'var(--text-tertiary)', background: 'transparent', padding: 0, fontWeight: 500, marginTop: '4px' }}>{contextLabel}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue"><ShoppingCart size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Total Orders</div>
            <div className="stat-value">{formatCount(totalOrders)}</div>
            <div className="stat-change" style={{ color: 'var(--text-tertiary)', background: 'transparent', padding: 0, fontWeight: 500, marginTop: '4px' }}>{contextLabel}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><Store size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Walk-in Orders</div>
            <div className="stat-value">{formatCount(walkInOrders)}</div>
            <div className="stat-change" style={{ color: 'var(--text-tertiary)', background: 'transparent', padding: 0, fontWeight: 500, marginTop: '4px' }}>{contextLabel}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple"><Truck size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Delivery Orders</div>
            <div className="stat-value">{formatCount(deliveryOrders)}</div>
            <div className="stat-change" style={{ color: 'var(--text-tertiary)', background: 'transparent', padding: 0, fontWeight: 500, marginTop: '4px' }}>{contextLabel}</div>
          </div>
        </div>
      </div>
      )}

      <div className="card">
        <div className="card-header filter-bar mobile-col" style={{ marginBottom: 0 }}>
          <div className="search-bar mobile-full-width" style={{ position: 'relative', flex: 1, maxWidth: '400px' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
            <input
              id="order-search"
              name="search"
              aria-label="Search by order number or customer"
              type="text" className="form-input" placeholder="Search by order number or customer..."
              style={{ paddingLeft: '36px' }} value={search} onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="filter-dropdown-container mobile-col mobile-full-width" style={{ display: 'flex', gap: '8px', position: 'relative' }}>
            <button onClick={() => setIsFilterOpen(!isFilterOpen)} className="btn btn-outline mobile-full-width" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <Filter size={18} />
              Filter {(statusFilter || paymentFilter || typeFilter || showArchived) && <span style={{ width: '8px', height: '8px', background: 'var(--primary)', borderRadius: '50%' }}></span>}
            </button>

            {isFilterOpen && (
              <div style={{
                position: 'absolute', top: '100%', right: 0, marginTop: '8px', zIndex: 50,
                background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
                padding: '16px', boxShadow: 'var(--shadow-lg)', width: '250px'
              }}>
                <h4 style={{ marginBottom: '12px', fontSize: '14px' }}>Filter Orders</h4>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label htmlFor="order-type-filter" className="form-label" style={{ fontSize: '12px' }}>Order Type</label>
                  <select id="order-type-filter" name="typeFilter" className="form-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                    <option value="">All</option>
                    <option value="walkin">Walk-in Home</option>
                    <option value="delivery">Delivery</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '12px' }}>
                  <label htmlFor="order-status-filter" className="form-label" style={{ fontSize: '12px' }}>Order Status</label>
                  <select id="order-status-filter" name="statusFilter" className="form-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                    <option value="">All Statuses</option>
                    <option value="pending">Pending</option>
                    <option value="confirmed">Confirmed</option>
                    <option value="delivered">Delivered</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label htmlFor="order-payment-filter" className="form-label" style={{ fontSize: '12px' }}>Payment Status</label>
                  <select id="order-payment-filter" name="paymentFilter" className="form-select" value={paymentFilter} onChange={e => setPaymentFilter(e.target.value)}>
                    <option value="">All Payments</option>
                    <option value="unpaid">Unpaid</option>
                    <option value="partial">Partial</option>
                    <option value="paid">Paid</option>
                  </select>
                </div>

                <div className="form-group" style={{ marginBottom: '16px' }}>
                  <label htmlFor="order-show-archived" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', fontWeight: 500 }}>
                    <input 
                      id="order-show-archived"
                      name="showArchived"
                      type="checkbox" 
                      checked={showArchived} 
                      onChange={(e) => setShowArchived(e.target.checked)} 
                      style={{ width: '16px', height: '16px', accentColor: 'var(--primary)' }}
                    />
                    <label htmlFor="order-show-archived" style={{ cursor: 'pointer' }}>Show Archived Only</label>
                  </label>
                </div>

                <button
                  className="btn btn-outline"
                  style={{ width: '100%' }}
                  onClick={() => { setStatusFilter(''); setPaymentFilter(''); setTypeFilter(''); setShowArchived(false); setIsFilterOpen(false); }}
                >
                  Clear Filters
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="table-container" style={{ overflow: activeDropdown ? 'visible' : 'auto', minHeight: activeDropdown ? '250px' : 'auto' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Customer Order</th>
                <th>Date</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th>Status</th>
                <th>Payment</th>
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
              ) : orders.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                    No orders found.
                  </td>
                </tr>
              ) : (
                orders.map((order) => (
                  <tr key={order.id} style={{ opacity: order.isArchived ? 0.6 : 1, position: 'relative', zIndex: activeDropdown === order.id ? 50 : 1 }}>
                    <td data-label="Customer Order"> 
                      <div>
                        <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', fontWeight: 700, letterSpacing: '0.5px', marginBottom: '4px' }}>
                          #{order.orderNumber || order.id.substring(0, 8).toUpperCase()}
                        </div>
                        <div className="customer-name" style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' }}> 
                          {order.customer?.name?.replace(/\[|\]/g, '') || 'Walk-in'} 
                          {(!order.delivery || (Array.isArray(order.delivery) && order.delivery.length === 0)) && order.customer?.name && !order.customer.name.toLowerCase().includes('normal walk') && (
                            <Star size={14} fill="var(--warning)" color="var(--warning)" />
                          )}
                        </div> 
                        <div style={{ marginTop: '8px' }}> 
                          {(order.delivery && (!Array.isArray(order.delivery) || order.delivery.length > 0)) ? ( 
                            <span style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)', padding: '4px 8px', borderRadius: '100px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Truck size={12} /> Delivery Order</span> 
                          ) : ( 
                            <span style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#b45309', padding: '4px 8px', borderRadius: '100px', fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Store size={12} /> Walk-in Order</span> 
                          )} 
                        </div> 
                      </div>
                    </td> 
                    <td data-label="Date"> 
                      <div>
                        <div suppressHydrationWarning style={{ fontSize: '13px', color: 'var(--text-primary)', fontWeight: 600 }}> 
                          {new Date(order.orderDate || order.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })} 
                        </div> 
                        <div suppressHydrationWarning style={{ fontSize: '12px', color: 'var(--text-tertiary)', marginTop: '4px', fontWeight: 500 }}> 
                          {new Date(order.createdAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })} 
                        </div> 
                      </div>
                    </td> 
                    <td data-label="Total" style={{ textAlign: 'right' }}> 
                      <div style={{ fontWeight: 700, fontSize: '15px', color: 'var(--text-primary)', fontFamily: 'monospace' }}>
                        <span style={{ opacity: 0.5, fontWeight: 500, marginRight: '2px' }}>₱</span>{Number(order.totalAmount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                    </td> 
                    <td data-label="Status"> 
                      <span className={`badge ${statusBadge(order.status)}`} style={{ padding: '6px 12px', fontSize: '11px', fontWeight: 600, letterSpacing: '0.3px', textTransform: 'capitalize' }}> 
                        {order.status} 
                      </span> 
                    </td> 
                    <td data-label="Payment"> 
                      <span  
                        style={{  
                          background: order.paymentStatus === 'paid' ? 'var(--success-light)' :  
                                      order.paymentStatus === 'partial' ? 'var(--warning-light)' :  
                                      'var(--danger-light)', 
                          color: order.paymentStatus === 'paid' ? 'var(--success-dark)' :  
                                 order.paymentStatus === 'partial' ? 'var(--warning-dark)' :  
                                 'var(--danger-dark)', 
                          padding: '6px 12px',  
                          borderRadius: '100px',  
                          fontSize: '11px',  
                          fontWeight: 700,  
                          display: 'inline-block',  
                          whiteSpace: 'nowrap', 
                          textTransform: 'uppercase', 
                          letterSpacing: '0.5px' 
                        }} 
                      > 
                        {order.paymentStatus} 
                      </span> 
                    </td>
                    <td data-label="Actions" style={{ textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end', alignItems: 'center' }}>
                        <button
                          onClick={() => openEditModal(order)}
                          className="btn btn-icon"
                          style={{ 
                            width: '32px', height: '32px', padding: 0,
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            background: 'var(--bg-main)',
                            border: '1px solid var(--border)',
                            color: 'var(--text-secondary)',
                            borderRadius: '6px',
                            boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                          }}
                          data-tooltip="Manage Order"
                          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--primary)'; e.currentTarget.style.color = '#FFFFFF'; e.currentTarget.style.borderColor = 'var(--primary)'; }}
                          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-main)'; e.currentTarget.style.color = 'var(--text-secondary)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                        >
                          {isStrictlyLocked ? <Eye size={16} /> : <Edit size={16} />}
                        </button>
                        
                        <button onClick={() => setReceiptOrder(order)} className="btn btn-icon btn-ghost" title="Print & Preview Receipt"><Printer size={16} /></button>

                        <div className="action-dropdown-container" style={{ position: 'relative' }}>
                          <button
                            onClick={() => setActiveDropdown(activeDropdown === order.id ? null : order.id)}
                            className="btn btn-icon"
                            style={{ 
                              width: '32px', height: '32px', padding: 0,
                              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                              background: activeDropdown === order.id ? 'var(--bg-hover)' : 'var(--bg-main)',
                              border: '1px solid var(--border)',
                              color: 'var(--text-secondary)',
                              borderRadius: '6px',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                            }}
                            data-tooltip="More Actions"
                          >
                            <MoreVertical size={16} />
                          </button>
                          
                          {activeDropdown === order.id && (
                            <div 
                              style={{
                                position: 'absolute', top: '100%', right: 0, marginTop: '4px',
                                background: 'var(--bg-card)', border: '1px solid var(--border)',
                                borderRadius: 'var(--radius-md)', padding: '4px',
                                boxShadow: 'var(--shadow-lg)', zIndex: 50,
                                minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '2px'
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                className="dropdown-item"
                                onClick={() => { setReceiptOrder(order); setActiveDropdown(null); }}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', fontSize: '13px', color: 'var(--text-primary)', border: 'none', background: 'transparent', width: '100%', textAlign: 'left', borderRadius: '4px', cursor: 'pointer' }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                              >
                                <Printer size={14} /> Print Receipt
                              </button>
                              
                              <button
                                className="dropdown-item"
                                onClick={() => { setReceiptOrder(order); setActiveDropdown(null); }}
                                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', fontSize: '13px', color: 'var(--text-primary)', border: 'none', background: 'transparent', width: '100%', textAlign: 'left', borderRadius: '4px', cursor: 'pointer' }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                              >
                                <Download size={14} /> Download Invoice
                              </button>
                              
                              {(!lockOrderDelete || isAdmin) && (
                                <button
                                  className="dropdown-item"
                                  onClick={() => {
                                    if (order.isArchived) handleUnarchiveOrder(order.id);
                                    else handleArchiveOrder(order.id);
                                    setActiveDropdown(null);
                                  }}
                                  style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', fontSize: '13px', color: order.isArchived ? 'var(--success)' : 'var(--danger)', border: 'none', background: 'transparent', width: '100%', textAlign: 'left', borderRadius: '4px', cursor: 'pointer' }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--bg-hover)'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                                >
                                  {order.isArchived ? <RefreshCw size={14} /> : <Archive size={14} />} 
                                  {order.isArchived ? 'Unarchive Order' : 'Archive Order'}
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {totalOrders > limit && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px', borderTop: '1px solid var(--border)' }}>
            <button className="btn btn-secondary" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</button>
            <span style={{ fontSize: 'var(--font-sm)', color: 'var(--text-secondary)' }}>Page {page} of {Math.ceil(totalOrders / limit)}</span>
            <button className="btn btn-secondary" disabled={page >= Math.ceil(totalOrders / limit)} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        )}
      </div>

      {/* Edit Order Modal */}
      {isEditOpen && editingOrder && (
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
                <button className="btn btn-icon btn-ghost" onClick={() => setIsEditOpen(false)} style={{ margin: '-8px -8px 0 0' }}><X size={20} /></button>
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
                                  <Image width={400} height={400} src={product.image} alt={product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}  />
                                ) : (
                                  <ShoppingBag size={14} color="var(--text-tertiary)" />
                                )}
                              </div>
                              <div>
                                <div style={{ fontWeight: 500, fontSize: '13px' }}>{product.name}</div>
                                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{product.sku} | Stock: {product.stock}</div>
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
                                  <Image width={400} height={400} src={item.product.image} alt={item.product?.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}  />
                                ) : (
                                  <Package size={16} color="var(--text-tertiary)" />
                                )}
                              </div>
                            </td>
                            <td data-label="Product Details" style={{ padding: '12px 16px' }}>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '14px' }}>
                                {item.product?.name} 
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '4px' }}>
                                <span style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>{item.product?.sku}</span>
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
                  <div style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      <User size={16} /> Customer Info
                    </h4>
                    <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-primary)' }}>{editingOrder.customer?.name || 'Walk-in'}</div>
                    {editingOrder.customer?.contactPerson && <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}><User size={14} /> {editingOrder.customer.contactPerson}</div>}
                    {editingOrder.customer?.phone && <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}><Phone size={14} /> {editingOrder.customer.phone}</div>}
                    {editingOrder.customer?.email && <div style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}><Mail size={14} /> {editingOrder.customer.email}</div>}
                  </div>

                  {editingOrder.delivery && (!Array.isArray(editingOrder.delivery) || editingOrder.delivery.length > 0) && (
                    <div style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
                      <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        <Truck size={16} /> Delivery Details
                      </h4>
                      <div className="form-group" style={{ margin: 0, marginBottom: '12px' }}>
                        <label htmlFor="edit-order-driver" className="form-label" style={{ fontWeight: 500 }}>Driver</label>
                        <select 
                          id="edit-order-driver"
                          name="deliveryDriverName"
                          className="form-select" 
                          value={editForm.deliveryDriverName}
                          onChange={e => setEditForm({ ...editForm, deliveryDriverName: e.target.value })}
                          disabled={isStrictlyLocked || editingOrder.status === 'cancelled'}
                        >
                          <option value="">-- No driver --</option>
{/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                          {drivers.filter((d: any) => d.status === 'active' || d.name === editForm.deliveryDriverName).map(d => <option key={d.id} value={d.name}>{d.name}{d.status !== 'active' ? ' (Inactive)' : ''}</option>)}
                        </select>
                      </div>
                      <div className="form-group" style={{ margin: 0 }}>
                        <label htmlFor="edit-order-delivery-date" className="form-label" style={{ fontWeight: 500 }}>Scheduled Date</label>
                        <input 
                          id="edit-order-delivery-date"
                          name="deliveryDate"
                          type="date" 
                          className="form-input" 
                          value={editForm.deliveryDate}
                          onChange={e => setEditForm({ ...editForm, deliveryDate: e.target.value })}
                          disabled={isStrictlyLocked || editingOrder.status === 'cancelled'}
                        />
                      </div>
                    </div>
                  )}

                  <div style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
                    <div className="form-group" style={{ margin: 0, marginBottom: '16px' }}>
                      <label htmlFor="edit-order-status" className="form-label" style={{ fontWeight: 600, marginBottom: '8px' }}>Order Status</label>
                      <select id="edit-order-status" name="status" className="form-select" style={{ height: '42px', fontWeight: 500 }} value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })} disabled={isStrictlyLocked || editingOrder.status === 'cancelled'}>
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="delivered">Delivered</option>
                        {(editingOrder.status === 'cancelled' || !lockOrderCancel || isAdmin) && (
                          <option value="cancelled">Cancelled</option>
                        )}
                      </select>
                    </div>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label htmlFor="edit-order-payment-status" className="form-label" style={{ fontWeight: 600, marginBottom: '8px' }}>Payment Status</label>
                      <select 
                        id="edit-order-payment-status"
                        name="paymentStatus"
                        className="form-select" 
                        style={{ height: '42px', fontWeight: 500, width: '100%' }} 
                        value={editForm.paymentStatus} 
                        onChange={e => {
                          const newPayment = e.target.value;
                          const subtotal = editingOrder.items?.reduce((sum, i) => sum + i.subtotal, 0) || editingOrder.totalAmount + (editingOrder.discount || 0);
                          let parsedDiscount = parseFloat(editForm.discountValue) || 0;
                          if (parsedDiscount < 0) parsedDiscount = 0;
                          if (editForm.discountType === 'percent' && parsedDiscount > 100) parsedDiscount = 100;
                          const flatDiscount = editForm.discountType === 'percent' ? (parsedDiscount / 100) * subtotal : parsedDiscount;
                          const newTotal = Math.max(0, subtotal - flatDiscount);
                          setEditForm({ 
                            ...editForm, 
                            paymentStatus: newPayment,
                            amountPaid: newPayment === 'paid' ? newTotal.toString() : (newPayment === 'unpaid' ? '0' : editForm.amountPaid)
                          });
                        }} 
                        disabled={isStrictlyLocked || editingOrder.status === 'cancelled'}
                      >
                        <option value="unpaid">Unpaid</option>
                        <option value="partial">Partial</option>
                        <option value="paid">Paid</option>
                      </select>
                    </div>

                    {['partial', 'paid'].includes(editForm.paymentStatus) && (
                      <div className="form-group" style={{ marginTop: '16px', margin: 0, borderTop: '1px dashed var(--border)', paddingTop: '16px' }}>
                        <label htmlFor="edit-order-amount-paid" className="form-label" style={{ fontWeight: 600 }}>
                          Amount Paid (₱)
                          {editingOrder.paymentStatus === 'partial' && !editForm.amountPaid && <span style={{ color: 'var(--danger)', fontSize: '11px', marginLeft: '8px', fontWeight: 500 }}>(Record missing, please re-enter)</span>}
                        </label>
                        <input 
                          id="edit-order-amount-paid"
                          name="amountPaid"
                          type="number" 
                          step="0.01"
                          onWheel={(e) => (e.target as HTMLInputElement).blur()}
                          className="form-input" 
                          style={{ height: '42px', fontSize: '15px', fontWeight: 500 }}
                          value={editForm.amountPaid}
                          onChange={e => setEditForm({ ...editForm, amountPaid: e.target.value })}
                          disabled={isStrictlyLocked || editingOrder.status === 'cancelled' || editForm.paymentStatus === 'paid'}
                          placeholder="Enter exact amount paid"
                        />
                      </div>
                    )}
                  </div>

                  {/* Order Summary Card */}
                  <div style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: '12px', padding: '16px' }}>
                    <h4 style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      <Receipt size={16} /> Order Summary
                    </h4>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <div style={{ fontSize: '13px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>Subtotal:</span>
                        <span style={{ fontWeight: 500 }}>{formatCurrency(editingOrder.items?.reduce((sum, item) => sum + item.subtotal, 0) || 0)}</span>
                      </div>
                      <div className="form-group" style={{ marginBottom: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
                        <label htmlFor="edit-order-discount" className="form-label" style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                          Discount
                          <div style={{ display: 'flex', background: 'var(--bg-main)', borderRadius: '4px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                            <button 
                              type="button" 
                              onClick={() => {
                                if (editForm.discountType === 'percent') return;
                                setEditForm({ ...editForm, discountType: 'percent', discountValue: '' });
                              }} 
                              style={{ padding: '2px 8px', border: 'none', background: editForm.discountType === 'percent' ? 'var(--primary)' : 'transparent', color: editForm.discountType === 'percent' ? 'white' : 'var(--text-tertiary)', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                            >%</button>
                            <button 
                              type="button" 
                              onClick={() => {
                                if (editForm.discountType === 'flat') return;
                                setEditForm({ ...editForm, discountType: 'flat', discountValue: '' });
                              }} 
                              style={{ padding: '2px 8px', border: 'none', background: editForm.discountType === 'flat' ? 'var(--primary)' : 'transparent', color: editForm.discountType === 'flat' ? 'white' : 'var(--text-tertiary)', cursor: 'pointer', fontSize: '12px', fontWeight: 700 }}
                            >₱</button>
                          </div>
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <input 
                            id="edit-order-discount"
                            name="discountValue"
                            aria-label="Discount amount"
                            type="number" 
                            min="0"
                            max={editForm.discountType === 'percent' ? 100 : (editingOrder.items?.reduce((sum, i) => sum + i.subtotal, 0) || editingOrder.totalAmount + (editingOrder.discount || 0))}
                            step="0.01"
                            onWheel={(e) => (e.target as HTMLInputElement).blur()}
                            onBlur={(e) => {
                              // Clamp on blur: ensure value doesn't exceed subtotal (flat) or 100 (percent)
                              const v = parseFloat(e.target.value) || 0;
                              const sub = editingOrder.items?.reduce((sum, i) => sum + i.subtotal, 0) || editingOrder.totalAmount + (editingOrder.discount || 0);
                              const maxVal = editForm.discountType === 'percent' ? 100 : sub;
                              if (v < 0) setEditForm({ ...editForm, discountValue: '0' });
                              else if (v > maxVal) setEditForm({ ...editForm, discountValue: maxVal.toFixed(2) });
                            }}
                            className="form-input" 
                            style={{ height: '32px', fontSize: '13px', width: '80px', textAlign: 'right' }}
                            value={editForm.discountValue}
                            onChange={e => {
                              setEditForm({ ...editForm, discountValue: e.target.value });
                            }}
                            disabled={isStrictlyLocked || editingOrder.status === 'cancelled'}
                            placeholder="0"
                          />
                        </div>
                      </div>
                      {parseFloat(editForm.discountValue) > 0 && (
                        <div style={{ fontSize: '12px', color: 'var(--danger)', textAlign: 'right' }}>
                          −{formatCurrency(editForm.discountType === 'percent' ? ((parseFloat(editForm.discountValue) || 0) / 100) * (editingOrder.items?.reduce((sum, item) => sum + item.subtotal, 0) || 0) : (parseFloat(editForm.discountValue) || 0))}
                        </div>
                      )}
                      <div style={{ fontSize: '15px', display: 'flex', justifyContent: 'space-between', paddingTop: '10px', borderTop: '1px solid var(--border)', alignItems: 'center' }}>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>Total:</span>
                        <span style={{ fontWeight: 700, color: 'var(--primary)', fontSize: '16px' }}>
                          {formatCurrency(Math.max(0, (editingOrder.items?.reduce((sum, item) => sum + item.subtotal, 0) || 0) - (editForm.discountType === 'percent' ? ((parseFloat(editForm.discountValue) || 0) / 100) * (editingOrder.items?.reduce((sum, item) => sum + item.subtotal, 0) || 0) : (parseFloat(editForm.discountValue) || 0))))}
                        </span>
                      </div>
                    </div>
                  </div>

                </div>
              </div>
              <div className="modal-footer edit-modal-footer" style={{ background: 'var(--bg-main)', borderTop: '1px solid var(--border)', padding: '16px 24px' }}>
                <button type="button" className="btn btn-outline" onClick={() => { setReceiptOrder(editingOrder); setIsEditOpen(false); }} style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  <Printer size={16} /> Preview & Print Receipt
                </button>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setIsEditOpen(false)} disabled={isSaving}>Cancel</button>
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
      )}

      {/* UOM Selection Modal for Edit Items */}
      {selectedProductForUom && (
        <div className="modal-overlay">
          <div className="modal" role="dialog" aria-modal="true" style={{ width: '100%', maxWidth: '400px', minWidth: '320px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Select Unit</h2>
              <button className="btn btn-icon btn-ghost" onClick={() => setSelectedProductForUom(null)}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <button 
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
              
              {selectedProductForUom.uoms?.filter((u: { isBase?: boolean }) => !u.isBase).map((uom: { id: string, name: string, price: number, multiplier: number }) => (
                <button 
                  key={uom.id}
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

      {receiptOrder && (() => {
        const subtotal = receiptOrder.totalAmount + (receiptOrder.discount || 0);
        const totalItemsQty = receiptOrder.items?.reduce((sum: number, item: any) => sum + Number(item.quantity || item.qty || 1), 0) || 0;
        let paidAmount = 0;
        if (receiptOrder.paymentStatus === 'paid') {
          paidAmount = receiptOrder.totalAmount;
        } else if (receiptOrder.paymentStatus === 'partial') {
          if (receiptOrder.payments?.length) {
            paidAmount = receiptOrder.payments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
          } else {
            const match = receiptOrder.notes?.match(/Amount Paid:\s*[₱P]?\s*([\d,.]+)/i);
            if (match) paidAmount = parseFloat(match[1].replace(/,/g, ''));
          }
        }
        const balanceAmount = Math.max(0, receiptOrder.totalAmount - paidAmount);

        // Filter custom notes
        let customNotes = (receiptOrder.notes || '').replace(/₱/g, 'P').trim();
        if (/Paid via|Amount Paid:|Balance:/i.test(customNotes)) {
          const parts = customNotes.split(/\s*\|\s*Paid via|\s*Paid via/i);
          const userRef = parts[0]?.trim();
          customNotes = (userRef && !/^(Order|WALKIN|HOME|STORE|DELIVERY)$/i.test(userRef)) ? userRef : '';
        }

        const deliv = Array.isArray(receiptOrder.delivery) ? receiptOrder.delivery[0] : receiptOrder.delivery;
        const driverName = deliv?.driverName || receiptOrder.deliveryDriverName;
        const deliveryDate = deliv?.scheduledDate ? new Date(deliv.scheduledDate).toLocaleDateString() : receiptOrder.deliveryDate ? new Date(receiptOrder.deliveryDate).toLocaleDateString() : undefined;

        return (
          <div className="modal-overlay" style={{ zIndex: 1100 }}>
            <div className="modal" role="dialog" aria-modal="true" style={{ maxWidth: '720px', width: '100%', borderRadius: '20px', overflow: 'hidden', padding: 0, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
              
              {/* Modal Header */}
              <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Receipt size={20} color="var(--primary)" /> Receipt Preview & Print
                  </h2>
                  <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
                    Order No: <strong style={{ color: 'var(--primary)' }}>{receiptOrder.orderNumber}</strong> • {receiptOrder.customer?.name || 'Walk-in Customer'}
                  </p>
                </div>
                <button className="btn btn-icon btn-ghost" onClick={() => setReceiptOrder(null)} style={{ borderRadius: '50%' }}>
                  <X size={18} />
                </button>
              </div>

              {/* Format Switcher Tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', padding: '8px 16px', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setReceiptTab('thermal')}
                  style={{
                    flex: 1, padding: '10px 16px', borderRadius: '10px', border: 'none',
                    background: receiptTab === 'thermal' ? 'var(--primary)' : 'transparent',
                    color: receiptTab === 'thermal' ? '#ffffff' : 'var(--text-secondary)',
                    fontWeight: 700, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Receipt size={16} /> Thermal Roll ({previewPaperWidth}mm)
                </button>
                <button
                  type="button"
                  onClick={() => setReceiptTab('bond')}
                  style={{
                    flex: 1, padding: '10px 16px', borderRadius: '10px', border: 'none',
                    background: receiptTab === 'bond' ? 'var(--primary)' : 'transparent',
                    color: receiptTab === 'bond' ? '#ffffff' : 'var(--text-secondary)',
                    fontWeight: 700, fontSize: '13px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <Printer size={16} /> Bond Paper / Sales Invoice
                </button>
              </div>

              {/* Tab Body */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '20px', background: 'var(--bg-main)' }}>
                {receiptTab === 'thermal' ? (
                  <div>
                    {/* Thermal Controls Header */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '12px', background: 'var(--bg-card)', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600 }}>
                        <span>Paper Width:</span>
                        <div style={{ display: 'flex', background: 'var(--bg-main)', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border)' }}>
                          <button
                            type="button"
                            onClick={() => setPreviewPaperWidth('58')}
                            style={{
                              padding: '4px 12px', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                              background: previewPaperWidth === '58' ? 'var(--primary)' : 'transparent',
                              color: previewPaperWidth === '58' ? '#ffffff' : 'var(--text-secondary)'
                            }}
                          >
                            58mm
                          </button>
                          <button
                            type="button"
                            onClick={() => setPreviewPaperWidth('80')}
                            style={{
                              padding: '4px 12px', border: 'none', fontSize: '12px', fontWeight: 700, cursor: 'pointer',
                              background: previewPaperWidth === '80' ? 'var(--primary)' : 'transparent',
                              color: previewPaperWidth === '80' ? '#ffffff' : 'var(--text-secondary)'
                            }}
                          >
                            80mm
                          </button>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => printThermalReceipt(receiptOrder)}
                        className="btn btn-primary"
                        style={{ fontSize: '13px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Printer size={16} /> Print Thermal Receipt
                      </button>
                    </div>

                    {/* On-Screen Thermal Paper Live Preview */}
                    <div
                      style={{
                        background: '#ffffff', color: '#000000', padding: '16px', borderRadius: '6px',
                        fontFamily: '"Consolas", "Courier New", monospace', fontSize: '12px', lineHeight: 1.2,
                        width: previewPaperWidth === '58' ? '58mm' : '80mm', margin: '0 auto',
                        border: '1px solid #d1d5db', boxShadow: '0 8px 24px rgba(0,0,0,0.12)'
                      }}
                    >
                      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '13px' }}>AMRODING GENERAL MERCHANDISE</div>
                      <div style={{ textAlign: 'center', fontSize: '11px' }}>SARIMANOK ST. MARAWI CITY</div>
                      <div style={{ textAlign: 'center', fontSize: '11px' }}>2ND BRANCH</div>
                      <div style={{ textAlign: 'center', fontSize: '11px' }}>ALHAMDULILLAH</div>
                      <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }}></div>
                      
                      <div>Order No: {(receiptOrder.orderNumber || '').split('-').pop()}</div>
                      <div>By: {receiptOrder.createdBy?.name || 'ADMIN'}</div>
                      <div>{new Date(receiptOrder.createdAt).toLocaleString('en-GB', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',second:'2-digit'}).replace(',','')}</div>
                      {driverName && <div>Driver: {driverName}</div>}
                      {deliveryDate && <div>Date: {deliveryDate}</div>}
                      {customNotes && <div>Notes: {customNotes}</div>}
                      
                      <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }}></div>

                      {/* Items */}
                      {receiptOrder.items?.map((item: any, idx: number) => {
                        const uom = item.uomName || item.uom || item.product?.unit || '';
                        const uomStr = uom ? ` (${uom.toUpperCase()})` : '';
                        const qty = Number(item.quantity ?? item.qty ?? 1);
                        const price = Number(item.price ?? 0);
                        const lineTotal = (qty * price).toFixed(2);
                        return (
                          <div key={item.id || idx} style={{ marginBottom: '6px' }}>
                            <div style={{ fontWeight: 'bold', wordBreak: 'break-word' }}>
                              {(item.product?.name || item.name || 'Item').toUpperCase()}{uomStr}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span>&nbsp;&nbsp;{qty} x {price.toFixed(2)}</span>
                              <span>{lineTotal}</span>
                            </div>
                          </div>
                        );
                      })}

                      <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }}></div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span></span><span>({totalItemsQty}) Items</span>
                      </div>
                      <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }}></div>

                      {/* Totals */}
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>TOTAL SALE:</span><span>{subtotal.toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>DISCOUNT:</span><span>{(receiptOrder.discount || 0).toFixed(2)}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                        <span>AMOUNT DUE:</span><span>{receiptOrder.totalAmount.toFixed(2)}</span>
                      </div>

                      {/* Payment Status Banner */}
                      <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }}></div>
                      {receiptOrder.paymentStatus === 'paid' && (
                        <div style={{ textAlign: 'center', fontWeight: 'bold', padding: '2px 0' }}>** FULLY PAID **</div>
                      )}
                      {receiptOrder.paymentStatus === 'partial' && (
                        <div>
                          <div style={{ textAlign: 'center', fontWeight: 'bold' }}>PARTIAL PAYMENT</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>PAID:</span><span>{paidAmount.toFixed(2)}</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>BALANCE:</span><span>{balanceAmount.toFixed(2)}</span>
                          </div>
                        </div>
                      )}
                      {(!receiptOrder.paymentStatus || receiptOrder.paymentStatus === 'unpaid') && (
                        <div>
                          <div style={{ textAlign: 'center', fontWeight: 'bold' }}>UNPAID</div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>BALANCE:</span><span>{receiptOrder.totalAmount.toFixed(2)}</span>
                          </div>
                        </div>
                      )}

                      <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }}></div>
                      <div style={{ textAlign: 'center', marginTop: '8px' }}>** OFFICIAL RECEIPT **</div>
                      <div style={{ textAlign: 'center', fontSize: '10px' }}>FACEBOOK:</div>
                      <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '11px' }}>AMRODING GENERAL MERCHANDISE</div>
                    </div>
                  </div>
                ) : (
                  <div>
                    {/* Bond Controls Header */}
                    <div style={{ display: 'flex', justifyContent: 'between', alignItems: 'center', marginBottom: '16px', background: 'var(--bg-card)', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                      <div>
                        <span style={{ fontWeight: 600, fontSize: '13px' }}>Bond Paper Formal Invoice (A4 / Letter)</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => printBondReceipt(receiptOrder)}
                        className="btn btn-primary"
                        style={{ fontSize: '13px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                      >
                        <Printer size={16} /> Print Bond Paper
                      </button>
                    </div>

                    {/* Bond Paper On-Screen Live Invoice Preview */}
                    <div
                      style={{
                        background: '#ffffff', color: '#000000', padding: '24px', borderRadius: '8px',
                        fontFamily: 'Arial, sans-serif', fontSize: '12px', lineHeight: 1.4,
                        border: '1px solid #d1d5db', boxShadow: '0 8px 24px rgba(0,0,0,0.12)'
                      }}
                    >
                      <div style={{ textAlign: 'center', marginBottom: '20px', position: 'relative' }}>
                        <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#000000' }}>{companyName.toUpperCase()}</h2>
                        <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#555' }}>
                          Marawi City, Lanao del Sur, Philippines
                          <br />
                          VAT Reg. TIN: 000-000-000-00000
                        </p>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', borderTop: '2px solid #000', borderBottom: '2px solid #000', padding: '8px 0' }}>
                        <div>
                          <div><strong>SOLD TO:</strong> {receiptOrder.customer?.name || 'Walk-in Customer'}</div>
                          <div><strong>ADDRESS:</strong> {receiptOrder.customer?.address || 'N/A'}</div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div><strong>SALES INVOICE NO:</strong> <span style={{ color: '#d97706', fontWeight: 'bold' }}>{receiptOrder.orderNumber}</span></div>
                          <div><strong>DATE:</strong> {new Date(receiptOrder.createdAt).toLocaleDateString('en-US')}</div>
                          <div><strong>STATUS:</strong> <span style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>{receiptOrder.paymentStatus || 'UNPAID'}</span></div>
                        </div>
                      </div>

                      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '16px', fontSize: '12px' }}>
                        <thead>
                          <tr style={{ borderBottom: '2px solid #000', background: '#f3f4f6' }}>
                            <th style={{ textAlign: 'left', padding: '6px 4px' }}>Item Description</th>
                            <th style={{ textAlign: 'center', padding: '6px 4px' }}>Qty</th>
                            <th style={{ textAlign: 'right', padding: '6px 4px' }}>Unit Price</th>
                            <th style={{ textAlign: 'right', padding: '6px 4px' }}>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {receiptOrder.items?.map((item: any, idx: number) => {
                            const uom = item.uomName || item.uom || item.product?.unit || 'PCS';
                            const qty = Number(item.quantity ?? item.qty ?? 1);
                            const price = Number(item.price ?? 0);
                            const lineTotal = qty * price;
                            return (
                              <tr key={item.id || idx} style={{ borderBottom: '1px solid #e5e7eb' }}>
                                <td style={{ padding: '6px 4px' }}>
                                  <div style={{ fontWeight: 'bold' }}>{(item.product?.name || item.name || 'Item').toUpperCase()} ({uom.toUpperCase()})</div>
                                </td>
                                <td style={{ textAlign: 'center', padding: '6px 4px' }}>{qty}</td>
                                <td style={{ textAlign: 'right', padding: '6px 4px' }}>₱{price.toFixed(2)}</td>
                                <td style={{ textAlign: 'right', padding: '6px 4px' }}>₱{lineTotal.toFixed(2)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>

                      <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: '2px solid #000', paddingTop: '12px' }}>
                        <div style={{ width: '220px' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                            <span>Subtotal:</span><span>₱{subtotal.toFixed(2)}</span>
                          </div>
                          {receiptOrder.discount > 0 && (
                            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#dc2626' }}>
                              <span>Discount:</span><span>-₱{receiptOrder.discount.toFixed(2)}</span>
                            </div>
                          )}
                          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontWeight: 'bold', borderTop: '1px solid #000', fontSize: '13px' }}>
                            <span>TOTAL AMOUNT DUE:</span><span>₱{receiptOrder.totalAmount.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </>
  );
}
