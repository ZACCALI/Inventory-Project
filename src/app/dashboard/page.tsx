'use client';

import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Package, TrendingUp, AlertTriangle, ClipboardList,
  Truck, DollarSign, ArrowUpRight, ArrowDownRight, CheckCircle2
} from 'lucide-react';
import { formatCurrency } from '@/lib/constants';
import ExpiryAlertWidget from '@/components/ExpiryAlertWidget';

interface DashboardData {
  totalProducts: number;
  totalStock: number;
  totalStockValue: number;
  todaySales: number;
  todayCollections?: number;
  totalReceivables?: number;
  todayExpenses: number;
  lowStockCount: number;
  pendingOrders: number;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  recentDeliveries?: any[];
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    customer: { name: string };
    totalAmount: number;
    status: string;
    paymentStatus: string;
    createdAt: string;
  }>;
  lowStockProducts: Array<{
    id: string;
    name: string;
    stock: number;
    minStock: number;
    category: { name: string } | null;
  }>;
  deliveryStats?: Array<{ name: string; value: number }>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
const COLORS = ['#0061FF', '#2ECC71', '#E67E22', '#E74C3C', '#9B59B6', '#1ABC9C'];

export default function DashboardPage() {
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: session, status } = useSession();
  const router = useRouter();

  const { data: dashData, isLoading: isDashLoading, error: dashError, mutate: mutateDash } = useSWR<DashboardData>(
    status === 'authenticated' ? '/api/reports?type=dashboard' : null,
    fetcher,
    { refreshInterval: 60000 }
  );

  const { data: salesResult, isLoading: isSalesLoading, error: salesError, mutate: mutateSales } = useSWR(
    status === 'authenticated' ? '/api/reports?type=sales' : null,
    fetcher,
    { refreshInterval: 60000 }
  );

  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [pendingDeltas, setPendingDeltas] = useState({ products: 0, stockIn: 0, orders: 0 });

  useEffect(() => {
    const update = () => setIsOfflineMode(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);

  useEffect(() => {
    const computeDeltas = async () => {
      try {
        const { db } = await import('@/lib/db');
        const pending = await db.syncQueue.where('syncStatus').anyOf(['pending', 'failed']).toArray();
        setPendingDeltas({
          products: pending.filter(t => t.type === 'product' && t.action === 'CREATE').length,
          stockIn: pending.filter(t => t.type === 'stock' && t.action === 'CREATE' && JSON.parse(t.payload).type === 'IN').reduce((s, t) => s + (JSON.parse(t.payload).quantity || 0), 0),
          orders: pending.filter(t => t.type === 'order' && t.action === 'CREATE').length,
        });
      } catch (e) { /* ignore */ }
    };
    computeDeltas();
  }, [isOfflineMode]);

  const data = dashData;
  const salesData = salesResult?.dailySales || [];
  const loading = isDashLoading || isSalesLoading;

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  if (status === 'loading' || loading) {
    return (
      <div className="page-container" style={{ paddingTop: 'var(--space-lg)' }}>
        {/* Skeleton page header */}
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <div className="skeleton" style={{ height: '28px', width: '160px', marginBottom: '8px' }} />
          <div className="skeleton" style={{ height: '16px', width: '280px' }} />
        </div>
        {/* Skeleton stat cards */}
        <div className="stats-grid-3" style={{ marginBottom: 'var(--space-lg)' }}>
          {[1,2,3,4,5,6].map(i => (
            <div key={i} className="stat-card">
              <div className="skeleton" style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', flexShrink: 0 }} />
              <div className="stat-info">
                <div className="skeleton" style={{ height: '12px', width: '80px', marginBottom: '8px' }} />
                <div className="skeleton" style={{ height: '24px', width: '120px', marginBottom: '6px' }} />
                <div className="skeleton" style={{ height: '10px', width: '90px' }} />
              </div>
            </div>
          ))}
        </div>
        {/* Skeleton chart area */}
        <div className="skeleton" style={{ height: '320px', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-lg)' }} />
        {/* Skeleton table */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: 'var(--space-lg)', borderBottom: '1px solid var(--border-light)' }}>
            <div className="skeleton" style={{ height: '18px', width: '140px' }} />
          </div>
          <table className="table">
            <tbody>
              {[1,2,3,4,5].map(i => (
                <tr key={i} className="skeleton-row">
                  <td><div className="skeleton-cell" style={{ width: `${60 + i * 8}%` }} /></td>
                  <td><div className="skeleton-cell" style={{ width: '60%' }} /></td>
                  <td><div className="skeleton-cell" style={{ width: '40%' }} /></td>
                  <td><div className="skeleton-cell" style={{ width: '50%' }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="loading-page" style={{ textAlign: 'center', padding: '40px 20px' }}>
        <p style={{ marginBottom: '12px', color: 'var(--text-muted)' }}>{isOfflineMode ? '📡 You are offline.' : 'Failed to load dashboard data.'}</p>
        <button
          className="btn btn-outline"
          onClick={() => { mutateDash(); mutateSales(); }}
          style={{ fontSize: '14px' }}
        >
          Retry
        </button>
      </div>
    );
  }

// eslint-disable-next-line @typescript-eslint/no-unused-vars
  const deliveryData = data.deliveryStats || [
    { name: 'No Data', value: 1 }
  ];

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
    return map[status] || 'badge-neutral';
  };

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">Overview of your distribution operations</p>
        </div>
      </div>

      {/* Offline Banner */}
      {(isOfflineMode || dashError) && (
        <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '14px', color: '#92400e', fontWeight: 500 }}>⚠️ Offline Mode — Showing last cached data</span>
          <button onClick={() => { mutateDash(); mutateSales(); }} className="btn btn-outline" style={{ fontSize: '12px', padding: '4px 12px' }}>Retry</button>
        </div>
      )}
      {/* Stats Grid */}
      <div className="stats-grid-3">
        <div className="stat-card">
          <div className="stat-icon blue">
            <Package size={24} strokeWidth={1.75} />
          </div>
          <div className="stat-info">
            <div className="stat-label">Total Products</div>
            <div className="stat-value">{data.totalProducts}{pendingDeltas.products > 0 && <span style={{ fontSize: '13px', color: 'var(--warning)', marginLeft: '6px' }}>+{pendingDeltas.products} pending</span>}</div>
            <div className="stat-change positive">
              <ArrowUpRight size={12} style={{flexShrink: 0}} /> <span style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>{data.totalStock}{pendingDeltas.stockIn > 0 ? ` (+${pendingDeltas.stockIn} offline)` : ''} items stock</span>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon blue">
            <DollarSign size={24} strokeWidth={1.75} />
          </div>
          <div className="stat-info">
            <div className="stat-label">Gross Sales Today</div>
            <div className="stat-value">{formatCurrency(data.todaySales)}</div>
            <div className="stat-change positive">
              <TrendingUp size={12} style={{flexShrink: 0}} /> <span style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>Order volume</span>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon green">
            <DollarSign size={24} strokeWidth={1.75} />
          </div>
          <div className="stat-info">
            <div className="stat-label">Cash Collected Today</div>
            <div className="stat-value">{formatCurrency(data.todayCollections || 0)}</div>
            <div className="stat-change positive">
              <TrendingUp size={12} style={{flexShrink: 0}} /> <span style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>Actual cash received</span>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon orange">
            <AlertTriangle size={24} strokeWidth={1.75} />
          </div>
          <div className="stat-info">
            <div className="stat-label">Pending Receivables</div>
            <div className="stat-value">{formatCurrency(data.totalReceivables || 0)}</div>
            <div className="stat-change negative">
              <ArrowDownRight size={12} style={{flexShrink: 0}} /> <span style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>Unpaid balances</span>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon orange">
            <AlertTriangle size={24} strokeWidth={1.75} />
          </div>
          <div className="stat-info">
            <div className="stat-label">Low Stock Alerts</div>
            <div className="stat-value">{data.lowStockCount}</div>
            <div className="stat-change negative">
              <ArrowDownRight size={12} style={{flexShrink: 0}} /> <span style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>Needs restocking</span>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon red">
            <ClipboardList size={24} strokeWidth={1.75} />
          </div>
          <div className="stat-info">
            <div className="stat-label">Pending Orders</div>
            <div className="stat-value">{data.pendingOrders}</div>
            <div className="stat-change negative">
              <Truck size={12} style={{flexShrink: 0}} /> <span style={{overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>To be confirmed</span>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="charts-grid">
        <div className="chart-container">
          <div className="chart-header">
            <h3 className="card-title">This Week&apos;s Sales</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px 8px' }}>
            {salesData.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)' }}>No sales data available</p>
            ) : (
              [...salesData].reverse().slice(0, 7).map((day, index) => (
                <div key={index} className="alert-item" style={{ borderLeft: 'none' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 'var(--font-base)' }}>{day.date}</div>
                  </div>
                  <div style={{ textAlign: 'right', fontWeight: 700, fontSize: 'var(--font-base)', color: 'var(--text-primary)' }}>
                    {formatCurrency(day.sales)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="chart-container">
          <div className="chart-header">
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Truck size={20} color="var(--primary)" />
              Recent Deliveries
            </h3>
            <Link href="/delivery" style={{ fontSize: 'var(--font-sm)', fontWeight: 600 }}>View All →</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '16px 8px' }}>
            {(!data.recentDeliveries || data.recentDeliveries.length === 0) ? (
              <p style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)' }}>No deliveries yet</p>
            ) : (
// eslint-disable-next-line @typescript-eslint/no-explicit-any
              data.recentDeliveries.map((delivery: any) => (
                <div key={delivery.id} className="alert-item" style={{ cursor: 'pointer', borderLeft: 'none' }} onClick={() => router.push('/delivery')}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 'var(--font-base)' }}>
                      {delivery.trackingNumber || delivery.order?.orderNumber || 'Delivery'}
                    </div>
                    <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-secondary)' }}>
                      {delivery.driver?.name || 'Unassigned'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span className={`badge ${statusBadge(delivery.status)}`}>{delivery.status.replace(/_/g, ' ')}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row: Low Stock + Recent Orders */}
      <div className="charts-grid" style={{ marginTop: '0' }}>
        {/* Left Column: Alerts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <ExpiryAlertWidget />
          
          {/* Low Stock Alerts */}
          <div className="card">
          <div className="card-header">
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertTriangle size={20} color="var(--warning-dark)" />
              Low Stock Alerts
            </h3>
            <span className="badge badge-danger">{data.lowStockProducts.length} items</span>
          </div>
          <div className="alert-list">
            {data.lowStockProducts.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <CheckCircle2 size={18} color="var(--success)" />
                <span>All products are well stocked!</span>
              </div>
            ) : (
              data.lowStockProducts.slice(0, 5).map((product) => (
                <div key={product.id} className={`alert-item ${product.stock === 0 ? 'danger' : 'warning'}`}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 'var(--font-base)' }}>{product.name}</div>
                    <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-secondary)' }}>
                      {product.category?.name || 'Uncategorized'}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 700, color: product.stock <= 5 ? 'var(--danger)' : 'var(--warning)', fontSize: 'var(--font-md)' }}>
                      {product.stock}
                    </div>
                    <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-tertiary)' }}>
                      min: {product.minStock}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        </div>

        {/* Recent Orders */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ClipboardList size={20} color="var(--primary)" />
              Recent Orders
            </h3>
            <Link href="/orders" style={{ fontSize: 'var(--font-sm)', fontWeight: 600 }}>View All →</Link>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {data.recentOrders.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)' }}>
                No orders yet
              </p>
            ) : (
              data.recentOrders.map((order) => (
                <div
                  key={order.id}
                  className="alert-item"
                  style={{ cursor: 'pointer', borderLeft: 'none' }}
                  onClick={() => router.push('/orders')}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 'var(--font-base)' }}>
                      {order.orderNumber}
                    </div>
                    <div style={{ fontSize: 'var(--font-xs)', color: 'var(--text-secondary)' }}>
                      {order.customer.name}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                    <div style={{ fontWeight: 700, fontSize: 'var(--font-base)' }}>
                      {formatCurrency(order.totalAmount)}
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <span className={`badge ${statusBadge(order.status)}`}>{order.status}</span>
                      <span className={`badge ${statusBadge(order.paymentStatus)}`}>{order.paymentStatus}</span>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </>
  );
}
