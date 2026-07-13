'use client';

import { useState, useEffect } from 'react';
import useSWR from 'swr';
import { fetcher } from '@/lib/fetcher';
import { BarChart3, TrendingUp, Package, Users, Calendar, Download, Activity, AlertTriangle, ShoppingCart, FileText, DollarSign } from 'lucide-react';
import { formatCurrency } from '@/lib/constants';
import { useAlert } from '@/components/AlertModal';
import { exportToPDF } from '@/lib/exportUtils';
import dynamic from 'next/dynamic';
const RevenueChart = dynamic(() => import('@/components/RevenueChart'), { ssr: false, loading: () => <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888' }}>Loading charts...</div> });
import ExcelJS from 'exceljs';

import Image from "next/image";
interface MonthlyData {
  month: string;
  revenue: number;
  cost: number;
  expenses: number;
  profit: number;
  orders: number;
  collections: number;
}

interface BestsellerData {
  product: { name: string; category?: { name: string }; image?: string | null };
  totalQuantity: number;
  totalRevenue: number;
}

export default function ReportsPage() {
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [bestsellers, setBestsellers] = useState<BestsellerData[]>([]);
  const [totalReceivables, setTotalReceivables] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [loadingReport, setLoadingReport] = useState<string | null>(null);
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { showAlert, showToast } = useAlert();

  const { data: monthlyRes, isLoading: isMonthlyLoading, error: monthlyError } = useSWR('/api/reports?type=monthly', fetcher, { refreshInterval: 60000 });
  const { data: bestRes, isLoading: isBestLoading, error: bestError } = useSWR('/api/reports?type=bestsellers', fetcher, { refreshInterval: 60000 });
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const update = () => setIsOffline(!navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update); };
  }, []);

  useEffect(() => {
    if (monthlyRes) {
      setMonthlyData(monthlyRes.monthly || []);
      setTotalReceivables(monthlyRes.totalReceivables || 0);
    }
    if (bestRes) {
      setBestsellers(bestRes.bestsellers || []);
    }
    if (!isMonthlyLoading && !isBestLoading) {
      setLoading(false);
    }
    if (monthlyError || bestError) {
      setLoading(false);
    }
  }, [monthlyRes, bestRes, isMonthlyLoading, isBestLoading, monthlyError, bestError]);

  const handleExportPDF = () => {
    const columns = [
      { header: 'Month', dataKey: 'month' },
      { header: 'Orders', dataKey: 'orders' },
      { header: 'Revenue', dataKey: 'revenue' },
      { header: 'Cost', dataKey: 'cost' },
      { header: 'Profit', dataKey: 'profit' },
      { header: 'Collections', dataKey: 'collections' }
    ];
    
    const exportData = filteredMonthlyData.map(m => ({
      month: m.month,
      orders: m.orders.toString(),
      revenue: formatCurrency(m.revenue),
      cost: formatCurrency(m.cost),
      profit: formatCurrency(m.profit),
      collections: formatCurrency(m.collections || 0)
    }));

    // Calculate Summary manually
    const summaryData = [
      { metric: 'Total Revenue', value: formatCurrency(totalRevenue) },
      { metric: 'Total Cash Collected', value: formatCurrency(totalCollections) },
      { metric: 'Pending Receivables', value: formatCurrency(totalReceivables) },
      { metric: 'Total Orders', value: totalOrders.toString() },
      { metric: 'Avg Order Value', value: formatCurrency(avgOrderValue) },
      { metric: 'Total Profit', value: formatCurrency(totalProfit) }
    ];

    exportToPDF(exportData, columns, 'monthly_financial_report', 'Monthly Financial Report', summaryData);
  };

  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Monthly Report');
    
    worksheet.addRow(['SUMMARY METRICS']);
    worksheet.addRow(['Total Revenue', totalRevenue]);
    worksheet.addRow(['Total Cash Collected', totalCollections]);
    worksheet.addRow(['Pending Receivables', totalReceivables]);
    worksheet.addRow(['Orders Fulfilled', totalOrders]);
    worksheet.addRow(['Avg Order Value', avgOrderValue]);
    worksheet.addRow(['Total Profit', totalProfit]);
    worksheet.addRow([]);
    worksheet.addRow(['MONTHLY BREAKDOWN']);
    
    worksheet.addRow(['Month', 'Orders', 'Revenue', 'Cost', 'Profit', 'Collections']);
    
    filteredMonthlyData.forEach(m => {
      worksheet.addRow([
        m.month,
        m.orders,
        m.revenue,
        m.cost,
        m.profit,
        m.collections || 0
      ]);
    });

    worksheet.getColumn(1).width = 25;
    worksheet.getColumn(2).width = 15;
    worksheet.getColumn(3).width = 15;
    worksheet.getColumn(4).width = 15;
    worksheet.getColumn(5).width = 15;
    worksheet.getColumn(6).width = 15;
    
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'Monthly_Report.xlsx';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleDownloadInventory = async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      showAlert('error', 'You are offline', 'Cannot download reports while offline. Please reconnect and try again.');
      return;
    }
    setLoadingReport('inventory');
    try {
      const res = await fetch('/api/products');
      if (!res.ok) throw new Error('Failed to fetch inventory data');
      const data = await res.json();
      
// eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exportData = data.map((p: any) => {
        let stockString = `${p.stock} ${p.unit || 'pcs'}`;
        if (p.uoms && p.uoms.length > 0 && p.stock > 0) {
 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sortedUoms = [...p.uoms].sort((a: any, b: any) => b.multiplier - a.multiplier);
          let remaining = p.stock;
          const parts = [];
          for (const uom of sortedUoms) {
            const qty = Math.floor(remaining / uom.multiplier);
            if (qty > 0) {
              parts.push(`${qty} ${uom.name}`);
              remaining %= uom.multiplier;
            }
          }
          if (parts.length > 0) {
            stockString += `\n(~ ${parts.join(' + ')})`;
          }
        }
        
        return {
          name: p.name,
          sku: p.sku,
          category: p.category?.name || 'Uncategorized',
          stock: stockString,
          cost: formatCurrency(p.costPrice || 0),
          price: formatCurrency(p.price || 0),
          value: formatCurrency((p.stock || 0) * (p.costPrice || p.price || 0))
        };
      });

      const columns = [
        { header: 'Product Name', dataKey: 'name' },
        { header: 'SKU', dataKey: 'sku' },
        { header: 'Category', dataKey: 'category' },
        { header: 'Stock', dataKey: 'stock' },
        { header: 'Cost Price', dataKey: 'cost' },
        { header: 'Selling Price', dataKey: 'price' },
        { header: 'Total Value', dataKey: 'value' }
      ];

      await exportToPDF(exportData, columns, 'inventory_report', 'Full Inventory Report');
    } catch (error) {
      console.error(error);
      showAlert('error', 'Download Failed', 'Could not generate Inventory Report');
    } finally {
      setLoadingReport(null);
    }
  };

  const handleDownloadStockLogs = async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      showAlert('error', 'You are offline', 'Cannot download reports while offline. Please reconnect and try again.');
      return;
    }
    setLoadingReport('stocklogs');
    try {
      const res = await fetch('/api/stock/movement');
      if (!res.ok) throw new Error('Failed to fetch stock logs');
      const data = await res.json();
      
// eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exportData = data.map((log: any) => ({
        date: new Date(log.date).toLocaleString(),
        type: log.type,
        product: log.product,
        sku: log.sku,
        qty: log.quantity,
        reason: log.reference,
        user: log.user
      }));

      const columns = [
        { header: 'Date', dataKey: 'date' },
        { header: 'Type', dataKey: 'type' },
        { header: 'Product', dataKey: 'product' },
        { header: 'SKU', dataKey: 'sku' },
        { header: 'Qty', dataKey: 'qty' },
        { header: 'Reason', dataKey: 'reason' },
        { header: 'User', dataKey: 'user' }
      ];

      await exportToPDF(exportData, columns, 'stock_movement_report', 'Stock Movement Report');
    } catch (error) {
      console.error(error);
      showAlert('error', 'Download Failed', 'Could not generate Stock Logs Report');
    } finally {
      setLoadingReport(null);
    }
  };

  const handleDownloadExpiry = async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      showAlert('error', 'You are offline', 'Cannot download reports while offline. Please reconnect and try again.');
      return;
    }
    setLoadingReport('expiry');
    try {
      const res = await fetch('/api/batches');
      if (!res.ok) throw new Error('Failed to fetch batches');
      const data = await res.json();
      
// eslint-disable-next-line @typescript-eslint/no-explicit-any
      const expiringBatches = data.filter((b: any) => b.stock > 0 && b.expiryDate)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((b: any) => {
          const expDate = new Date(b.expiryDate);
          const diffTime = expDate.getTime() - new Date().getTime();
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          return { ...b, daysLeft: diffDays };
        })
 
// eslint-disable-next-line @typescript-eslint/no-explicit-any
        .sort((a: any, b: any) => a.daysLeft - b.daysLeft);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exportData = expiringBatches.map((b: any) => ({
        name: b.product?.name,
        batch: b.batchNumber || 'N/A',
        stock: `${b.stock} ${b.product?.unit || 'pcs'}`,
        expiry: b.expiryDate ? new Date(b.expiryDate).toLocaleDateString() : 'N/A',
        days: b.daysLeft < 0 ? 'Expired' : `${b.daysLeft} days`,
        loss: formatCurrency(b.stock * (b.product?.costPrice || b.product?.price || 0))
      }));

      const columns = [
        { header: 'Product', dataKey: 'name' },
        { header: 'Batch No.', dataKey: 'batch' },
        { header: 'Stock', dataKey: 'stock' },
        { header: 'Expiry Date', dataKey: 'expiry' },
        { header: 'Status', dataKey: 'days' },
        { header: 'Est. Loss', dataKey: 'loss' }
      ];

      await exportToPDF(exportData, columns, 'expiry_report', 'Expiry Tracking Report');
    } catch (error) {
      console.error(error);
      showAlert('error', 'Download Failed', 'Could not generate Expiry Tracking Report');
    } finally {
      setLoadingReport(null);
    }
  };

  const handleDownloadOrders = async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      showAlert('error', 'You are offline', 'Cannot download reports while offline. Please reconnect and try again.');
      return;
    }
    setLoadingReport('orders');
    try {
      const res = await fetch('/api/orders');
      if (!res.ok) throw new Error('Failed to fetch orders');
      const data = await res.json();
      
// eslint-disable-next-line @typescript-eslint/no-explicit-any
      const exportData = data.map((o: any) => ({
        id: o.orderNumber,
        date: new Date(o.createdAt).toLocaleDateString(),
        customer: o.customer?.name || 'Walk-in',
        type: o.orderType === 'pos' ? 'Store POS' : 'Delivery',
        status: o.status,
        payment: o.paymentStatus,
        total: formatCurrency(o.totalAmount || 0)
      }));

      const columns = [
        { header: 'Order #', dataKey: 'id' },
        { header: 'Date', dataKey: 'date' },
        { header: 'Customer', dataKey: 'customer' },
        { header: 'Type', dataKey: 'type' },
        { header: 'Order Status', dataKey: 'status' },
        { header: 'Payment', dataKey: 'payment' },
        { header: 'Total', dataKey: 'total' }
      ];

      exportToPDF(exportData, columns, 'sales_orders_report', 'Sales & Orders Report');
    } catch (error) {
      console.error(error);
      showAlert('error', 'Download Failed', 'Could not generate Orders Report');
    } finally {
      setLoadingReport(null);
    }
  };

  const filteredMonthlyData = selectedYear === 'all' 
    ? monthlyData 
    : monthlyData.filter(m => m.month.includes(selectedYear));

  const totalRevenue = filteredMonthlyData.reduce((sum, m) => sum + m.revenue, 0);
  const totalOrders = filteredMonthlyData.reduce((sum, m) => sum + m.orders, 0);
  const avgOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;
  const totalProfit = filteredMonthlyData.reduce((sum, m) => sum + m.profit, 0);
  const totalCollections = filteredMonthlyData.reduce((sum, m) => sum + (m.collections || 0), 0);

  if (loading) {
    return (
      <>
        <div className="page-header">
          <div>
            <div className="skeleton" style={{ height: '32px', width: '200px', marginBottom: '8px', borderRadius: 'var(--radius-md)' }} />
            <div className="skeleton" style={{ height: '16px', width: '300px', borderRadius: 'var(--radius-sm)' }} />
          </div>
        </div>
        <div className="stats-grid-4" style={{ marginBottom: '24px' }}>
          {[1,2,3,4].map(i => (
            <div key={i} className="stat-card">
              <div className="skeleton" style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', flexShrink: 0 }} />
              <div className="stat-info">
                <div className="skeleton" style={{ height: '12px', width: '80px', marginBottom: '8px' }} />
                <div className="skeleton" style={{ height: '24px', width: '100px', marginBottom: '6px' }} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          <div className="card"><div className="skeleton" style={{ height: '300px', width: '100%', borderRadius: 'var(--radius-md)' }} /></div>
          <div className="card"><div className="skeleton" style={{ height: '300px', width: '100%', borderRadius: 'var(--radius-md)' }} /></div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reports & Analytics</h1>
          <p className="page-subtitle">Key performance metrics and insights for your business</p>
        </div>
        <div className="page-header-actions" style={{ display: 'flex', gap: '12px', width: '100%' }}>
          <div style={{ display: 'flex', flex: 1, alignItems: 'center', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '6px 12px' }}>
            <Calendar size={16} color="var(--text-secondary)" style={{ marginRight: '8px', flexShrink: 0 }} />
            <select 
              id="reports-year-filter"
              name="yearFilter"
              aria-label="Filter reports by year"
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              style={{ border: 'none', background: 'transparent', outline: 'none', fontSize: 'var(--font-sm)', fontWeight: 600, cursor: 'pointer', width: '100%' }}
            >
              <option value="all">All Time</option>
              {Array.from(new Set(monthlyData.map(m => {
                const parts = m.month.split(' ');
                return parts[parts.length - 1];
              }))).sort().reverse().map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>
          <button onClick={handleExportExcel} className="btn btn-outline" style={{ display: 'flex', gap: '8px', alignItems: 'center', color: '#107c41', borderColor: '#107c41' }}>
            <Download size={18} /> Export Excel
          </button>
          <button onClick={handleExportPDF} className="btn btn-outline" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Download size={18} /> Export PDF
          </button>
        </div>
      </div>

      {/* Offline Banner */}
      {(isOffline || monthlyError || bestError) && (
        <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 'var(--radius-md)', padding: '12px 16px', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <AlertTriangle size={16} color="#92400e" />
          <span style={{ fontSize: '14px', color: '#92400e', fontWeight: 500 }}>
            {isOffline ? '⚠️ You are offline — showing last cached data. Charts and downloads may be unavailable.' : 'Data may be outdated. Check your connection.'}
          </span>
        </div>
      )}

      {/* KPI Stats */}
      <div className="stats-grid-3">
        <div className="stat-card">
          <div className="stat-icon blue"><TrendingUp size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Total Revenue</div>
            <div className="stat-value">{formatCurrency(totalRevenue)}</div>
            <div className="stat-change positive">Gross Sales Volume</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><DollarSign size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Total Cash Collected</div>
            <div className="stat-value">{formatCurrency(totalCollections)}</div>
            <div className="stat-change positive">Actual cash received</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><AlertTriangle size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Pending Receivables</div>
            <div className="stat-value">{formatCurrency(totalReceivables)}</div>
            <div className="stat-change negative">Unpaid balances (All Time)</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><Package size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Orders Fulfilled</div>
            <div className="stat-value">{totalOrders}</div>
            <div className="stat-change positive">Total volume</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon orange"><BarChart3 size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Avg Order Value</div>
            <div className="stat-value">{formatCurrency(avgOrderValue)}</div>
            <div className="stat-change neutral">Based on history</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon red"><Users size={24} /></div>
          <div className="stat-info">
            <div className="stat-label">Total Profit</div>
            <div className="stat-value">{formatCurrency(totalProfit)}</div>
            <div className="stat-change positive">After {formatCurrency(filteredMonthlyData.reduce((sum, m) => sum + (m.expenses || 0), 0))} expenses</div>
          </div>
        </div>
      </div>

      {/* Chart Layouts */}
      <div className="charts-grid">
        <div className="card" style={{ minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
          <div className="card-header">
            <h2 className="card-title">Revenue & Profit Trend</h2>
          </div>
          <RevenueChart data={filteredMonthlyData} formatCurrency={formatCurrency} />
        </div>

        <div className="card" style={{ minHeight: '400px', display: 'flex', flexDirection: 'column' }}>
          <div className="card-header">
            <h2 className="card-title">Top Selling Products</h2>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
            {bestsellers.length === 0 ? (
              <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', marginTop: '40px' }}>No sales data yet</p>
            ) : (
              bestsellers.slice(0, 5).map((item, i) => {
                const maxQuantity = Math.max(...bestsellers.map(b => b.totalQuantity));
                const percentage = Math.max(10, (item.totalQuantity / maxQuantity) * 100);
                return (
                  <div key={i} style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center' }}>
                    <div style={{
                      width: '40px', height: '40px', borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-main)', border: '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0
                    }}>
                      {item.product?.image ? (
                        <Image width={400} height={400} src={item.product.image} alt={item.product?.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}  />
                      ) : (
                        <Package size={20} color="var(--text-tertiary)" />
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 'var(--font-sm)', marginBottom: '4px' }}>
                        <span style={{ fontWeight: 600 }}>{item.product?.name || 'Unknown'}</span>
                        <span style={{ color: 'var(--text-secondary)' }}>{item.totalQuantity} sold</span>
                      </div>
                      <div style={{ width: '100%', height: '8px', background: 'var(--bg-main)', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${percentage}%`, height: '100%', background: 'var(--primary)', borderRadius: '4px' }}></div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Detailed Reports Section */}
      <div style={{ marginTop: '40px' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '20px' }}>Detailed PDF Reports</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
          
          {/* Inventory Report Card */}
          <div style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '24px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
              <div style={{ background: 'var(--primary-light)', color: 'var(--primary-dark)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
                <Package size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Inventory Valuation</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Current stock & prices</p>
              </div>
            </div>
            <button 
              className="btn btn-outline" 
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={handleDownloadInventory}
              disabled={loadingReport !== null}
            >
              {loadingReport === 'inventory' ? 'Generating...' : <><FileText size={16} style={{ marginRight: '8px' }} /> Download PDF</>}
            </button>
          </div>

          {/* Stock Movement Logs Card */}
          <div style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '24px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
              <div style={{ background: 'var(--success-light)', color: 'var(--success-dark)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
                <Activity size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Stock Movements</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Historical IN/OUT logs</p>
              </div>
            </div>
            <button 
              className="btn btn-outline" 
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={handleDownloadStockLogs}
              disabled={loadingReport !== null}
            >
              {loadingReport === 'stocklogs' ? 'Generating...' : <><FileText size={16} style={{ marginRight: '8px' }} /> Download PDF</>}
            </button>
          </div>

          {/* Expiry Tracking Report Card */}
          <div style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '24px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
              <div style={{ background: 'var(--warning-light)', color: 'var(--warning-dark)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
                <AlertTriangle size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Expiry Tracking</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Expiring product details</p>
              </div>
            </div>
            <button 
              className="btn btn-outline" 
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={handleDownloadExpiry}
              disabled={loadingReport !== null}
            >
              {loadingReport === 'expiry' ? 'Generating...' : <><FileText size={16} style={{ marginRight: '8px' }} /> Download PDF</>}
            </button>
          </div>

          {/* Sales & Orders Report Card */}
          <div style={{ background: 'var(--bg-main)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)', padding: '24px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '16px' }}>
              <div style={{ background: 'var(--secondary-light)', color: 'var(--secondary-dark)', padding: '12px', borderRadius: 'var(--radius-md)' }}>
                <ShoppingCart size={24} />
              </div>
              <div>
                <h3 style={{ fontSize: '16px', fontWeight: 600 }}>Sales & Orders</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>Order fulfillment history</p>
              </div>
            </div>
            <button 
              className="btn btn-outline" 
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={handleDownloadOrders}
              disabled={loadingReport !== null}
            >
              {loadingReport === 'orders' ? 'Generating...' : <><FileText size={16} style={{ marginRight: '8px' }} /> Download PDF</>}
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
