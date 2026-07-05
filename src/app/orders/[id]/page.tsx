'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { ArrowLeft, Edit, Printer, Package, User, Truck, Calendar, Hash, CreditCard, Clock, MapPin, Phone, FileText, AlertCircle, Home } from 'lucide-react';
import { formatCurrency } from '@/lib/constants';
import SalesInvoiceReceipt from '@/components/SalesInvoiceReceipt';

import Image from "next/image";
interface OrderDetail {
  id: string;
  orderNumber: string;
  orderType: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  discount: number;
  notes: string | null;
  orderDate: string;
  createdAt: string;
  customer: {
    id: string;
    name: string;
    contactPerson: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
  };
  items: {
    id: string;
    productId: string;
    quantity: number;
    price: number;
    subtotal: number;
    product: {
      id: string;
      name: string;
      sku: string;
      image: string | null;
      unit: string;
    };
  }[];
  delivery: {
    id: string;
    status: string;
    driverName: string | null;
    driverPhone: string | null;
    scheduledDate: string | null;
    deliveredAt: string | null;
    proofPhoto: string | null;
  } | null;
  createdBy: {
    id: string;
    name: string;
    email: string;
    role: string;
  };
}

const statusColors: Record<string, string> = {
  pending: '#f59e0b',
  confirmed: '#3b82f6',
  delivered: '#10b981',
  cancelled: '#ef4444',
};

const paymentStatusColors: Record<string, string> = {
  unpaid: '#ef4444',
  partial: '#f59e0b',
  paid: '#10b981',
};

export default function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = React.use(params);
  const router = useRouter();
// eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { data: session } = useSession();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [companyName, setCompanyName] = useState('Amroding General Merchandise');

  useEffect(() => {
    async function fetchOrder() {
      try {
        const res = await fetch(`/api/orders/${id}`);
        if (res.ok) {
          const data = await res.json();
          setOrder(data);
        } else {
          setError('Order not found');
        }
      } catch {
        setError('Failed to load order');
      } finally {
        setLoading(false);
      }
    }
    
    async function fetchSettings() {
      try {
        const res = await fetch('/api/settings');
        if (res.ok) {
          const data = await res.json();
          if (data.companyName) setCompanyName(data.companyName);
        }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (err) {}
    }
    
    fetchOrder();
    fetchSettings();
  }, [id]);

  if (loading) {
    return (
      <div className="loading-page">
        <div className="loading-spinner lg" />
        <p>Loading order details...</p>
      </div>
    );
  }

  if (error || !order) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '400px', gap: '16px' }}>
        <AlertCircle size={48} color="var(--danger)" />
        <h2>{error || 'Order not found'}</h2>
        <button className="btn btn-primary" onClick={() => router.push('/orders')}>
          <ArrowLeft size={18} /> Back to Orders
        </button>
      </div>
    );
  }

  const subtotal = order.items.reduce((sum, item) => sum + item.subtotal, 0);

  function handlePrint() {
    window.print();
  }

  return (
    <>
      <div style={{ display: 'none' }}>
        <style dangerouslySetInnerHTML={{ __html: `
          @media print {
            body * { visibility: hidden; }
            .print-only, .print-only * { visibility: visible; }
            .print-only { position: absolute; left: 0; top: 0; width: 100%; }
          }
        ` }} />
      </div>
      <SalesInvoiceReceipt order={order} companyName={companyName} />
      <div className="page-header print-hide">
        <div>
          <h1 className="page-title">Order {order.orderNumber}</h1>
          <p className="page-subtitle">
            Walk in Home • Created {new Date(order.createdAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => router.push('/orders')} className="btn btn-outline" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <ArrowLeft size={18} /> Back
          </button>
          <button onClick={handlePrint} className="btn btn-outline" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Printer size={18} /> Print
          </button>
          {order.status === 'pending' && (
            <button onClick={() => router.push(`/orders/${id}/edit`)} className="btn btn-primary" style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <Edit size={18} /> Edit Order
            </button>
          )}
        </div>
      </div>

      {/* Status Badges Row */}
      <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
        <span className="badge" style={{ background: statusColors[order.status] || '#6b7280', color: '#fff', padding: '6px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: 600, textTransform: 'capitalize' }}>
          {order.status}
        </span>
        <span className="badge" style={{ background: paymentStatusColors[order.paymentStatus] || '#6b7280', color: '#fff', padding: '6px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: 600, textTransform: 'capitalize' }}>
          {order.paymentStatus}
        </span>
        <span className="badge" style={{ background: 'var(--bg-hover)', color: 'var(--text-secondary)', padding: '6px 16px', borderRadius: '20px', fontSize: '13px', fontWeight: 600 }}>
          <Home size={16} style={{ display: 'inline', marginBottom: '-3px', marginRight: '6px' }} /> Walk in Home
        </span>
      </div>

      <div className="responsive-grid-2" style={{ gap: '24px', marginBottom: '24px' }}>
        {/* Customer Info Card */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <User size={18} color="var(--primary)" /> Customer
            </h2>
          </div>
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, marginBottom: '4px' }}>Name</div>
              <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>{order.customer.name}</div>
            </div>
            {order.customer.contactPerson && (
              <div>
                <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, marginBottom: '4px' }}>Contact Person</div>
                <div style={{ fontSize: '14px', color: 'var(--text-primary)' }}>{order.customer.contactPerson}</div>
              </div>
            )}
            {order.customer.phone && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Phone size={14} color="var(--text-tertiary)" />
                <span style={{ fontSize: '14px' }}>{order.customer.phone}</span>
              </div>
            )}
            {order.customer.address && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MapPin size={14} color="var(--text-tertiary)" />
                <span style={{ fontSize: '14px' }}>{order.customer.address}</span>
              </div>
            )}
          </div>
        </div>

        {/* Order Info Card */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <FileText size={18} color="var(--primary)" /> Order Details
            </h2>
          </div>
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                <Hash size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                Order Number
              </span>
              <span style={{ fontWeight: 600, fontFamily: 'monospace' }}>{order.orderNumber}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                <Calendar size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                Order Date
              </span>
              <span style={{ fontWeight: 500 }}>{new Date(order.orderDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                <CreditCard size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                Payment
              </span>
              <span style={{ fontWeight: 600, color: paymentStatusColors[order.paymentStatus], textTransform: 'capitalize' }}>{order.paymentStatus}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
                <Clock size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: '4px' }} />
                Created By
              </span>
              <span style={{ fontWeight: 500 }}>{order.createdBy?.name || 'N/A'}</span>
            </div>
            {order.notes && (
              <div style={{ marginTop: '4px', padding: '10px', background: 'var(--bg-main)', borderRadius: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
                <strong>Note:</strong> {order.notes}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delivery Info */}
      {order.delivery && (
        <div className="card" style={{ marginBottom: '24px' }}>
          <div className="card-header">
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Truck size={18} color="var(--primary)" /> Delivery
            </h2>
            <span className="badge" style={{ background: statusColors[order.delivery.status] || '#6b7280', color: '#fff', padding: '4px 12px', borderRadius: '16px', fontSize: '12px', fontWeight: 600, textTransform: 'capitalize' }}>
              {order.delivery.status}
            </span>
          </div>
          <div className="responsive-grid-3" style={{ padding: '20px' }}>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, marginBottom: '4px' }}>Driver</div>
              <div style={{ fontSize: '14px', fontWeight: 500 }}>{order.delivery.driverName || '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, marginBottom: '4px' }}>Scheduled Date</div>
              <div style={{ fontSize: '14px', fontWeight: 500 }}>{order.delivery.scheduledDate ? new Date(order.delivery.scheduledDate).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600, marginBottom: '4px' }}>Delivered At</div>
              <div style={{ fontSize: '14px', fontWeight: 500 }}>{order.delivery.deliveredAt ? new Date(order.delivery.deliveredAt).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}</div>
            </div>
          </div>
        </div>
      )}

      {/* Order Items Table */}
      <div className="card" style={{ marginBottom: '24px' }}>
        <div className="card-header">
          <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Package size={18} color="var(--primary)" /> Items ({order.items.length})
          </h2>
        </div>
        <div className="table-container" style={{ border: 'none', boxShadow: 'none' }}>
          <table className="table">
            <thead>
              <tr>
                <th>Product</th>
                <th style={{ textAlign: 'center' }}>Qty</th>
                <th style={{ textAlign: 'right' }}>Unit Price</th>
                <th style={{ textAlign: 'right' }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {order.items.map((item) => (
                <tr key={item.id}>
                  <td data-label="Product" style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '8px', overflow: 'hidden', background: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, border: '1px solid var(--border)' }}>
                        {item.product.image ? (
                          <Image width={400} height={400} src={item.product.image} alt={item.product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }}  />
                        ) : (
                          <Package size={16} color="var(--text-tertiary)" opacity={0.4} />
                        )}
                      </div>
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '14px' }}>{item.product.name}</div>
                        <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>SKU: {item.product.sku} · {item.product.unit}</div>
                      </div>
                    </div>
                  </td>
                  <td data-label="Qty" style={{ textAlign: 'center', fontWeight: 600, fontSize: '15px' }}>{item.quantity}</td>
                  <td data-label="Unit Price" style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{formatCurrency(item.price)}</td>
                  <td data-label="Total" style={{ textAlign: 'right', fontWeight: 600 }}>{formatCurrency(item.subtotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Totals */}
        <div style={{ padding: '20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end' }}>
          <div style={{ width: '280px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-secondary)' }}>
              <span>Subtotal</span>
              <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{formatCurrency(subtotal)}</span>
            </div>
            {order.discount > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--danger)' }}>
                <span>Discount</span>
                <span>-{formatCurrency(order.discount)}</span>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '12px', borderTop: '2px solid var(--border)', fontSize: '18px', fontWeight: 700 }}>
              <span>Total</span>
              <span style={{ color: 'var(--primary)' }}>{formatCurrency(order.totalAmount)}</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
