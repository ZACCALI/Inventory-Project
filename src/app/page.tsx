'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import {
  Package, TrendingUp, AlertTriangle, ClipboardList,
  Truck, DollarSign, ArrowUpRight, ArrowDownRight,
} from 'lucide-react';
import { formatCurrency } from '@/lib/constants';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, Legend,
} from 'recharts';

interface DashboardData {
  totalProducts: number;
  totalStock: number;
  totalStockValue: number;
  todaySales: number;
  lowStockCount: number;
  pendingOrders: number;
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

const COLORS = ['#0061FF', '#2ECC71', '#E67E22', '#E74C3C', '#9B59B6', '#1ABC9C'];

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [salesData, setSalesData] = useState<Array<{ date: string; sales: number }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    }
  }, [status, router]);

  const fetchDashboard = async () => {
    try {
      const [dashRes, salesRes] = await Promise.all([
        fetch('/api/reports?type=dashboard'),
        fetch('/api/reports?type=sales'),
      ]);
      const dashData = await dashRes.json();
      const salesResult = await salesRes.json();
      setData(dashData);
      setSalesData(salesResult.dailySales || []);
    } catch (error) {
      console.error('Failed to fetch dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status === 'authenticated') {
      fetchDashboard();
    }
  }, [status]);

  if (status === 'loading' || loading) {
    return (
      <div className="loading-page">
        <div className="loading-spinner lg" />
        <p>Loading dashboard...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="loading-page">
        <p>Failed to load dashboard data</p>
      </div>
    );
  }

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

      {/* Stats Grid */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue">
            <Package size={24} strokeWidth={1.75} />
          </div>
          <div className="stat-info">
            <div className="stat-label">Total Products</div>
            <div className="stat-value">{data.totalProducts}</div>
            <div className="stat-change positive">
              <ArrowUpRight size={12} /> {data.totalStock} units in stock
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-icon green">
            <DollarSign size={24} strokeWidth={1.75} />
          </div>
          <div className="stat-info">
            <div className="stat-label">Sales Today</div>
            <div className="stat-value">{formatCurrency(data.todaySales)}</div>
            <div className="stat-change positive">
              <TrendingUp size={12} /> Stock value: {formatCurrency(data.totalStockValue)}
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
              <ArrowDownRight size={12} /> Products need restocking
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
              <Truck size={12} /> Awaiting confirmation
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="charts-grid">
        <div className="chart-container">
          <div className="chart-header">
            <h3 className="card-title">Sales Overview (Last 7 Days)</h3>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={salesData.slice(-7)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E8ECF0" />
              <XAxis dataKey="date" fontSize={12} tick={{ fill: '#7F8C8D' }} />
              <YAxis fontSize={12} tick={{ fill: '#7F8C8D' }} tickFormatter={(v) => `₱${(v/1000).toFixed(0)}k`} />
              <Tooltip
                formatter={(value: any) => [formatCurrency(Number(value) || 0), 'Sales']}
                contentStyle={{ borderRadius: '8px', border: '1px solid #E8ECF0', fontFamily: 'Plus Jakarta Sans' }}
              />
              <Bar dataKey="sales" fill="#0061FF" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="chart-container">
          <div className="chart-header">
            <h3 className="card-title">Delivery Status</h3>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie
                data={deliveryData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
              >
                {deliveryData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Legend
                verticalAlign="bottom"
                height={36}
                formatter={(value) => <span style={{ color: '#2C3E50', fontSize: '13px' }}>{value}</span>}
              />
              <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #E8ECF0' }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Row: Low Stock + Recent Orders */}
      <div className="charts-grid" style={{ marginTop: '0' }}>
        {/* Low Stock Alerts */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">⚠️ Low Stock Alerts</h3>
            <span className="badge badge-danger">{data.lowStockProducts.length} items</span>
          </div>
          <div className="alert-list">
            {data.lowStockProducts.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)' }}>
                All products are well stocked! 🎉
              </p>
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

        {/* Recent Orders */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">📋 Recent Orders</h3>
            <a href="/orders" style={{ fontSize: 'var(--font-sm)', fontWeight: 600 }}>View All →</a>
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
                  onClick={() => router.push(`/orders/${order.id}`)}
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
