'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import {
  Search, Filter, Download, Edit, Eye, Archive, RefreshCw, DollarSign,
  ShoppingCart, Truck, Store, Printer, MoreVertical, Star
} from 'lucide-react';
import { APP_NAME, formatCurrency } from '@/lib/constants';
import { useAlert } from '@/components/AlertModal';
import { useDebounce } from '@/hooks/useDebounce';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { addSyncTask } from '@/lib/offlineSync';
import { db } from '@/lib/db';
import { loadPrinterConfig } from '@/lib/qzService';
import { EditOrderModal, Order } from '@/components/orders/EditOrderModal';
import { OrderReceiptModal } from '@/components/orders/OrderReceiptModal';

export default function OrdersPage() {
  const { data: session } = useSession();
  const { showAlert, showConfirm, showToast } = useAlert();
  const isAdmin = session?.user?.role?.toLowerCase() === 'admin';
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  const isOnline = useOnlineStatus();

  const [lockOrderDelete, setLockOrderDelete] = useState(true);
  const [lockOrderEdit, setLockOrderEdit] = useState(false);
  const [companyName, setCompanyName] = useState('Amroding General Merchandise');
  const [paperWidth, setPaperWidth] = useState('58');

  useEffect(() => {
    const loadConfig = async () => {
      const cfg = await loadPrinterConfig();
      if (cfg?.paperWidth) {
        setPaperWidth(cfg.paperWidth);
      }
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
  const [editingOrder, setEditingOrder] = useState<Order | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [drivers, setDrivers] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [products, setProducts] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [receiptOrder, setReceiptOrder] = useState<any>(null);

  const [activeDropdown, setActiveDropdown] = useState<string | null>(null);

  const getQueryString = useCallback(() => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.append('search', debouncedSearch);
    if (statusFilter) params.append('status', statusFilter);
    if (paymentFilter) params.append('paymentStatus', paymentFilter);
    if (typeFilter) params.append('orderType', typeFilter);
    if (showArchived) params.append('archived', 'true');
    params.append('page', page.toString());
    params.append('limit', limit.toString());
    return params.toString();
  }, [debouncedSearch, statusFilter, paymentFilter, typeFilter, showArchived, page, limit]);

  const fetchOrders = useCallback(async () => {
    if (typeof document !== 'undefined' && document.hidden) return;
    try {
      const isOffline = !isOnline;
      if (!isOffline) {
        const res = await fetch(`/api/orders?${getQueryString()}`);
        if (!res.ok) throw new Error('Network response not ok');
        const data = await res.json();
        
        let orderList: Order[] = [];
        if (Array.isArray(data)) {
          orderList = data;
          setTotalOrders(data.length);
        } else if (data.orders) {
          orderList = data.orders;
          setTotalOrders(data.total || data.orders.length);
        }

        // Apply offline pending tasks
        try {
          const pendingTasks = await db.syncQueue
            .where('syncStatus')
            .anyOf(['pending', 'failed'])
            .toArray();

          for (const task of pendingTasks) {
            if (task.type !== 'order') continue;
            const payload = JSON.parse(task.payload);
            if (task.action === 'DELETE') {
              orderList = orderList.filter(o => o.id !== payload.id);
            } else if (task.action === 'UPDATE') {
              orderList = orderList.map(o => o.id === payload.id ? { ...o, ...payload } : o);
            } else if (task.action === 'CREATE') {
              if (!orderList.find(o => o.id === payload.id)) {
                orderList.unshift(payload as Order);
              }
            }
          }
        } catch (dexieErr) {
          console.warn('Failed to apply offline sync tasks to order list', dexieErr);
        }

        setOrders(orderList);
        return;
      }

      // Offline flow: load from Dexie cache
      const cached = await db.orders.toArray();
      let orderList: Order[] = cached.map(o => ({
        id: o.id,
        orderNumber: o.orderNumber,
        customer: { name: o.customerName || 'Walk-in Customer' },
        totalAmount: o.totalAmount,
        discount: o.discount || 0,
        status: o.status,
        paymentStatus: o.paymentStatus,
        orderType: o.orderType,
        notes: o.notes || '',
        orderDate: o.createdAt,
        createdAt: o.createdAt,
        items: o.items || [],
      })) as unknown as Order[];

      const pendingTasks = await db.syncQueue
        .where('syncStatus')
        .anyOf(['pending', 'failed'])
        .toArray();

      for (const task of pendingTasks) {
        if (task.type !== 'order') continue;
        const payload = JSON.parse(task.payload);
        if (task.action === 'DELETE') {
          orderList = orderList.filter(o => o.id !== payload.id);
        } else if (task.action === 'UPDATE') {
          orderList = orderList.map(o => o.id === payload.id ? { ...o, ...payload } : o);
        } else if (task.action === 'CREATE') {
          if (!orderList.find(o => o.id === payload.id)) {
            orderList.unshift(payload as Order);
          }
        }
      }

      setOrders(orderList);
      setTotalOrders(orderList.length);
    } catch (err) {
      console.warn('Fetch orders error', err);
    } finally {
      setLoading(false);
    }
  }, [getQueryString, isOnline]);

  useEffect(() => {
    fetchOrders();

    const fetchDependencies = async () => {
      try {
        const prodRes = await fetch('/api/products');
        if (prodRes.ok) {
          const prodData = await prodRes.json();
          if (Array.isArray(prodData)) setProducts(prodData);
        }
      } catch {}

      try {
        const userRes = await fetch('/api/users?role=driver');
        if (userRes.ok) {
          const data = await userRes.json();
          if (Array.isArray(data)) setDrivers(data);
        }
      } catch {}
    };
    fetchDependencies();

    const fetchSettings = async () => {
      try {
        const res = await fetch('/api/settings');
        if (!res.ok) throw new Error();
        const data = await res.json();
        setLockOrderDelete(data.lockOrderDelete ?? true);
        setLockOrderEdit(data.lockOrderEdit ?? false);
        if (data.companyName) setCompanyName(data.companyName);
      } catch {
        try {
          const cachedSettings = await db.settings.get('current');
          if (cachedSettings?.data) {
            const data = JSON.parse(cachedSettings.data);
            setLockOrderDelete(data.lockOrderDelete ?? true);
            setLockOrderEdit(data.lockOrderEdit ?? false);
            if (data.companyName) setCompanyName(data.companyName);
          }
        } catch {}
      }
    };
    fetchSettings();

    const interval = setInterval(() => {
      if (typeof navigator !== 'undefined' && navigator.onLine) {
        fetchOrders();
      }
    }, 60000);

    const handleAppSync = () => {
      fetchOrders();
    };
    window.addEventListener('appDataSynced', handleAppSync);

    return () => {
      clearInterval(interval);
      window.removeEventListener('appDataSynced', handleAppSync);
    };
  }, [fetchOrders]);

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      pending: 'badge-warning', confirmed: 'badge-primary', delivered: 'badge-success', cancelled: 'badge-danger',
      paid: 'badge-success', unpaid: 'badge-danger', partial: 'badge-warning',
    };
    return map[status.toLowerCase()] || 'badge-neutral';
  };

  const openEditModal = (order: Order) => {
    setEditingOrder(order);
    setIsEditOpen(true);
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
    } catch {
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
    } catch {
      showAlert('error', 'Action Failed', 'Failed to unarchive order due to a network error.');
    }
  };

  const handleGenerateInvoice = async (order: Order) => {
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import('jspdf'),
      import('jspdf-autotable'),
    ]);
    const doc = new jsPDF();
    const formatPDFCurrency = (amount: number) => `PHP ${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Minimalist Modern Header
    doc.setFillColor(0, 97, 255);
    doc.roundedRect(14, 14, 10, 10, 2, 2, 'F');
    
    doc.setFontSize(14);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('A', 19, 21.2, { align: 'center' });
    
    doc.setFontSize(18);
    doc.setTextColor(0, 97, 255);
    doc.text(companyName, 28, 22);

    doc.setFontSize(24);
    doc.setTextColor(29, 78, 216);
    doc.setFont('helvetica', 'bold');
    doc.text('INVOICE', 196, 26, { align: 'right' });

    doc.setDrawColor(229, 231, 235);
    doc.line(14, 35, 196, 35);

    // Invoice Meta
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

    // Bill To Section
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const finalY = (doc as any).lastAutoTable.finalY || startY;
    const subtotal = order.items ? order.items.reduce((sum, item) => sum + item.subtotal, 0) : order.totalAmount;
    const discount = order.discount || 0;
    const total = order.totalAmount;

    let currentY = finalY + 15;
    const totalsHeight = 35;
    if (currentY + totalsHeight > 270) {
      doc.addPage();
      currentY = 25;
    }

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

  const totalRevenue = orders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);
  const walkInOrders = orders.filter(o => !o.delivery || (Array.isArray(o.delivery) && o.delivery.length === 0)).length;
  const deliveryOrders = orders.filter(o => o.delivery && (!Array.isArray(o.delivery) || o.delivery.length > 0)).length;

  let contextLabel = 'All Orders';
  if (search) contextLabel = `Search: ${search}`;
  else if (statusFilter || paymentFilter || typeFilter) contextLabel = [statusFilter, paymentFilter, typeFilter].filter(Boolean).join(' | ');
  
  const isStrictlyLocked = !isAdmin && lockOrderEdit;

  const handleOrderSaved = (updatedOrder: Order) => {
    setOrders(prev => prev.map(o => o.id === updatedOrder.id ? updatedOrder : o));
  };

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

        <div className="table-container">
          <table className="table mobile-stack">
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
                        
                        <button 
                          onClick={() => setReceiptOrder(order)} 
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
                          data-tooltip="Print & Preview Receipt"
                        >
                          <Printer size={16} />
                        </button>

                        <div className="action-dropdown-container" style={{ position: 'relative', zIndex: activeDropdown === order.id ? 100 : 1 }}>
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
                                boxShadow: 'var(--shadow-lg)', zIndex: 100,
                                minWidth: '160px', display: 'flex', flexDirection: 'column', gap: '2px'
                              }}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <button
                                className="dropdown-item"
                                onClick={() => { handleGenerateInvoice(order); setActiveDropdown(null); }}
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
      <EditOrderModal
        isOpen={isEditOpen}
        order={editingOrder}
        isAdmin={isAdmin}
        isOnline={isOnline}
        lockOrderEdit={lockOrderEdit}
        drivers={drivers}
        products={products}
        onClose={() => {
          setIsEditOpen(false);
          setEditingOrder(null);
        }}
        onSaveSuccess={handleOrderSaved}
        onOpenReceipt={(orderToReceipt) => setReceiptOrder(orderToReceipt)}
      />

      {/* Order Receipt Modal */}
      <OrderReceiptModal
        order={receiptOrder}
        companyName={companyName}
        paperWidth={paperWidth}
        onClose={() => setReceiptOrder(null)}
      />
    </>
  );
}
