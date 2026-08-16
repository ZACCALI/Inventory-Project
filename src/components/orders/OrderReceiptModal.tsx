'use client';

import React, { useState, useEffect } from 'react';
import { X, Receipt, Printer, AlertTriangle } from 'lucide-react';
import { useAlert } from '@/components/AlertModal';
import { useModalDismiss } from '@/hooks/useModalDismiss';
import { printThermal } from '@/lib/printService';

export interface OrderItem {
  id?: string;
  quantity: number;
  qty?: number;
  price: number;
  subtotal?: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  product?: any;
  name?: string;
  uomName?: string;
  uom?: string;
  multiplier?: number;
}

export interface OrderReceiptData {
  id: string;
  orderNumber: string;
  customer?: { name?: string; address?: string; phone?: string; email?: string; contactPerson?: string };
  totalAmount: number;
  discount?: number;
  status: string;
  paymentStatus?: string;
  orderType?: string;
  notes?: string | null;
  createdAt: string;
  createdBy?: { name?: string };
  items?: OrderItem[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delivery?: any;
  deliveryDriverName?: string;
  deliveryDate?: string;
  payments?: Array<{ amount: number }>;
}

export interface OrderReceiptModalProps {
  order: OrderReceiptData | null;
  companyName?: string;
  paperWidth?: string;
  onClose: () => void;
}

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function OrderReceiptModal({
  order,
  companyName = 'Amroding General Merchandise',
  paperWidth = '58',
  onClose
}: OrderReceiptModalProps) {
  const { showAlert, showConfirm, showToast } = useAlert();
  const [receiptTab, setReceiptTab] = useState<'thermal' | 'bond'>('thermal');
  const [previewPaperWidth, setPreviewPaperWidth] = useState<'58' | '80'>((paperWidth as '58' | '80') || '58');

  useModalDismiss(!!order, onClose);

  useEffect(() => {
    if (paperWidth === '58' || paperWidth === '80') {
      setPreviewPaperWidth(paperWidth);
    }
  }, [paperWidth]);

  if (!order) return null;

  const subtotal = order.totalAmount + (order.discount || 0);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const totalItemsQty = order.items?.reduce((sum: number, item: any) => sum + Number(item.quantity ?? item.qty ?? 1), 0) || 0;
  
  let paidAmount = 0;
  if (order.paymentStatus === 'paid') {
    paidAmount = order.totalAmount;
  } else if (order.paymentStatus === 'partial') {
    if (order.payments?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      paidAmount = order.payments.reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0);
    } else {
      const match = order.notes?.match(/Amount Paid:\s*[₱P]?\s*([\d,.]+)/i);
      if (match) paidAmount = parseFloat(match[1].replace(/,/g, ''));
    }
  }
  const balanceAmount = Math.max(0, order.totalAmount - paidAmount);

  // Filter custom notes
  let customNotes = (order.notes || '').replace(/₱/g, 'P').trim();
  if (/Paid via|Amount Paid:|Balance:/i.test(customNotes)) {
    const parts = customNotes.split(/\s*\|\s*Paid via|\s*Paid via/i);
    const userRef = parts[0]?.trim();
    customNotes = (userRef && !/^(Order|WALKIN|HOME|STORE|DELIVERY)$/i.test(userRef)) ? userRef : '';
  }

  const deliv = Array.isArray(order.delivery) ? order.delivery[0] : order.delivery;
  const driverName = deliv?.driverName || order.deliveryDriverName;
  const deliveryDate = deliv?.scheduledDate
    ? new Date(deliv.scheduledDate).toLocaleDateString()
    : order.deliveryDate
    ? new Date(order.deliveryDate).toLocaleDateString()
    : undefined;

  const printThermalReceipt = async (targetOrder: OrderReceiptData, overridePaperWidth?: '58' | '80') => {
    if (!targetOrder) return;

    const orderNo = targetOrder.orderNumber || '';
    const createdBy = targetOrder.createdBy?.name || 'ADMIN';
    const dateStr = new Date(targetOrder.createdAt).toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).replace(',', '');
    const orderSubtotal = targetOrder.totalAmount + (targetOrder.discount || 0);
    const targetDeliv = Array.isArray(targetOrder.delivery) ? targetOrder.delivery[0] : targetOrder.delivery;

    // Extract amount paid from payments array or notes
    let orderAmountPaid: number | undefined;
    if (targetOrder.paymentStatus === 'paid') {
      orderAmountPaid = targetOrder.totalAmount;
    } else if (targetOrder.paymentStatus === 'partial') {
      if (targetOrder.payments?.length) {
        orderAmountPaid = targetOrder.payments.reduce((s: number, p: { amount: number }) => s + p.amount, 0);
      } else {
        const amtMatch = targetOrder.notes?.match(/Amount Paid:\s*[₱P]?\s*([\d,.]+)/i);
        if (amtMatch) orderAmountPaid = parseFloat(amtMatch[1].replace(/,/g, ''));
      }
    }

    const result = await printThermal({
      companyName,
      orderNo,
      createdBy,
      dateStr,
      customerName: targetOrder.customer?.name || undefined,
      customerPhone: targetOrder.customer?.phone || undefined,
      customerAddress: targetOrder.customer?.address || undefined,
      driverName: targetDeliv?.driverName || targetOrder.deliveryDriverName || undefined,
      deliveryDate: targetDeliv?.scheduledDate ? new Date(targetDeliv.scheduledDate).toLocaleDateString() : targetOrder.deliveryDate ? new Date(targetOrder.deliveryDate).toLocaleDateString() : undefined,
      notes: targetOrder.notes || undefined,
      items: targetOrder.items || [],
      subtotal: orderSubtotal,
      discount: targetOrder.discount || 0,
      amountDue: targetOrder.totalAmount,
      paymentStatus: targetOrder.paymentStatus || undefined,
      amountPaid: orderAmountPaid,
      orderStatus: targetOrder.status,
      paperWidthOverride: overridePaperWidth || (previewPaperWidth as '58' | '80'),
    }, () => showToast('offline', 'QZ Tray not configured — using browser print. Set up Printer in Settings → Thermal Printer.'));

    if (result === 'error') {
      showAlert('error', 'Print Failed', 'Could not print receipt. Please allow popups or set up QZ Tray in Settings.');
    }
  };

  const printBondReceipt = (targetOrder: OrderReceiptData) => {
    if (!targetOrder) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      showAlert('error', 'Action Failed', 'Please allow popups to print receipt.');
      return;
    }

    const bondSubtotal = targetOrder.totalAmount + (targetOrder.discount || 0);

    const html = `
      <html>
        <head>
          <title>Receipt - ${escapeHtml(targetOrder.orderNumber || 'Order')}</title>
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
            <p>MAUL ILIAN, MARANTAO LANAO DEL SUR</p>
            <p style="margin-top: 8px; font-weight: 600; color: #000000;">OFFICIAL RECEIPT</p>
          </div>

          <div class="meta">
            <div>
              <strong>Order #${escapeHtml(targetOrder.orderNumber || '')}</strong>
              ${new Date(targetOrder.createdAt).toLocaleString('en-PH', { dateStyle: 'long', timeStyle: 'short' })}
            </div>
            ${targetOrder.delivery ? `
            <div>
              <strong>Delivery Driver</strong>
              ${escapeHtml((Array.isArray(targetOrder.delivery) ? targetOrder.delivery[0]?.driverName : targetOrder.delivery?.driverName) || 'N/A')}
            </div>
            <div>
              <strong>Delivery Date</strong>
              ${(Array.isArray(targetOrder.delivery) ? targetOrder.delivery[0]?.scheduledDate : targetOrder.delivery?.scheduledDate) ? new Date(Array.isArray(targetOrder.delivery) ? targetOrder.delivery[0].scheduledDate : targetOrder.delivery.scheduledDate).toLocaleDateString() : 'N/A'}
            </div>
            ` : ''}
            <div style="text-align: right; flex-grow: 1;">
              <strong>Cashier</strong>
              ${escapeHtml(targetOrder.createdBy?.name || 'ADMIN')}
            </div>
            ${targetOrder.customer ? `
            <div style="width: 100%; border-top: 1px dashed #ddd; margin-top: 8px; padding-top: 8px;">
              <strong>Customer Details</strong>
              Customer: ${escapeHtml(targetOrder.customer?.name || 'Walk-in')}<br/>
              ${targetOrder.customer?.phone ? `Phone: ${escapeHtml(targetOrder.customer.phone)}<br/>` : ''}
              Address: ${escapeHtml(targetOrder.customer?.address || 'N/A')}
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
              ${(targetOrder.items || []).map((i, idx: number) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td>${escapeHtml(i.product?.name || i.name || 'Item')} <small style="color:#000000;">(${escapeHtml((i.uomName || i.product?.unit || 'PCS').toUpperCase())})</small></td>
                  <td>${i.quantity || i.qty || 1}</td>
                  <td>${Number(i.price).toFixed(2)}</td>
                  <td><strong>${(Number(i.quantity || i.qty || 1) * Number(i.price)).toFixed(2)}</strong></td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="totals">
            <div class="row">
              <span>Subtotal</span>
              <span>${bondSubtotal.toFixed(2)}</span>
            </div>
            ${(targetOrder.discount || 0) > 0 ? `
              <div class="row discount">
                <span>Discount</span>
                <span>-${Number(targetOrder.discount).toFixed(2)}</span>
              </div>
            ` : ''}
            <div class="row grand">
              <span>Total</span>
              <span>₱${targetOrder.totalAmount.toFixed(2)}</span>
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
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  return (
    <div className="modal-overlay" style={{ zIndex: 1100 }}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        style={{ maxWidth: '720px', width: '100%', borderRadius: '20px', overflow: 'hidden', padding: 0, maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}
      >
        {/* Modal Header */}
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: 'var(--bg-main)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Receipt size={20} color="var(--primary)" /> Receipt Preview & Print
            </h2>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0' }}>
              Order No: <strong style={{ color: 'var(--primary)' }}>{order.orderNumber}</strong> • {!order.customer?.name || ['[normal walk-in]', 'normal walk-in', 'walk-in'].includes(order.customer.name.trim().toLowerCase()) ? 'BAIE' : order.customer.name}
            </p>
          </div>
          <button className="btn btn-icon btn-ghost" onClick={onClose} aria-label="Close dialog" style={{ borderRadius: '50%' }}>
            <X size={18} />
          </button>
        </div>

        {/* Cancelled Order Safety Banner */}
        {order.status === 'cancelled' && (
          <div style={{ background: '#fef2f2', borderBottom: '1px solid #fca5a5', padding: '10px 20px', color: '#991b1b', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertTriangle size={18} color="#dc2626" />
            <span>SAFETY WARNING: Order is CANCELLED. Any printed receipt will be watermarked as CANCELLED / VOID.</span>
          </div>
        )}

        {/* Format Switcher Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: 'var(--bg-card)', padding: '8px 16px', gap: '8px' }}>
          <button
            type="button"
            onClick={() => setReceiptTab('thermal')}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '10px',
              border: 'none',
              background: receiptTab === 'thermal' ? 'var(--primary)' : 'transparent',
              color: receiptTab === 'thermal' ? '#ffffff' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'all 0.2s ease'
            }}
          >
            <Receipt size={16} /> Thermal Roll ({previewPaperWidth}mm)
          </button>
          <button
            type="button"
            onClick={() => setReceiptTab('bond')}
            style={{
              flex: 1,
              padding: '10px 16px',
              borderRadius: '10px',
              border: 'none',
              background: receiptTab === 'bond' ? 'var(--primary)' : 'transparent',
              color: receiptTab === 'bond' ? '#ffffff' : 'var(--text-secondary)',
              fontWeight: 700,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
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
                        padding: '4px 12px',
                        border: 'none',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
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
                        padding: '4px 12px',
                        border: 'none',
                        fontSize: '12px',
                        fontWeight: 700,
                        cursor: 'pointer',
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
                  onClick={async () => {
                    if (order.status === 'cancelled') {
                      const confirmed = await showConfirm('Cancelled Order', 'Order is Cancelled. Printed receipt will be watermarked as CANCELLED. Proceed?');
                      if (!confirmed) return;
                    }
                    printThermalReceipt(order, previewPaperWidth);
                  }}
                  className="btn btn-primary"
                  style={{ fontSize: '13px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Printer size={16} /> Print Thermal Receipt
                </button>
              </div>

              {/* On-Screen Thermal Paper Live Preview */}
              <div
                style={{
                  position: 'relative',
                  background: '#ffffff',
                  color: '#000000',
                  padding: '16px',
                  borderRadius: '6px',
                  fontFamily: '"Consolas", "Courier New", monospace',
                  fontSize: '12px',
                  lineHeight: 1.2,
                  width: previewPaperWidth === '58' ? '58mm' : '80mm',
                  margin: '0 auto',
                  border: '1px solid #d1d5db',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                  overflow: 'hidden'
                }}
              >
                {order.status === 'cancelled' && (
                  <div style={{ position: 'absolute', top: '40%', left: '0', right: '0', textAlign: 'center', transform: 'rotate(-20deg)', color: 'rgba(220, 38, 38, 0.4)', fontSize: '24px', fontWeight: 900, pointerEvents: 'none', zIndex: 10, textTransform: 'uppercase', border: '4px solid rgba(220, 38, 38, 0.4)', padding: '8px', background: 'rgba(255, 255, 255, 0.7)' }}>
                    CANCELLED ORDER<br />VOID
                  </div>
                )}
                {order.status === 'cancelled' && (
                  <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '12px', color: '#000', borderBottom: '1px dashed #000', paddingBottom: '4px', marginBottom: '4px' }}>
                    *** CANCELLED / VOID ORDER ***
                  </div>
                )}
                <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '13px' }}>{companyName.toUpperCase()}</div>
                <div style={{ textAlign: 'center', fontSize: '11px', fontWeight: 'bold' }}>MAUL ILIAN, MARANTAO LANAO DEL SUR</div>
                <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }}></div>

                {previewPaperWidth === '58' && order.orderNumber && order.orderNumber.length > 22 ? (
                  <>
                    <div>Order No:</div>
                    <div>{order.orderNumber}</div>
                  </>
                ) : (
                  <div>Order No: {order.orderNumber || ''}</div>
                )}
                <div>By: {order.createdBy?.name || 'ADMIN'}</div>
                <div>{new Date(order.createdAt).toLocaleString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace(',', '')}</div>
                <div>Customer: {!order.customer?.name || ['[normal walk-in]', 'normal walk-in', 'walk-in'].includes(order.customer.name.trim().toLowerCase()) ? 'BAIE' : order.customer.name}</div>
                {order.customer?.phone && <div>Phone: {order.customer.phone}</div>}
                {order.customer?.address && <div>Address: {order.customer.address}</div>}
                {driverName && <div>Driver: {driverName}</div>}
                {deliveryDate && <div>Date: {deliveryDate}</div>}
                {customNotes && <div>Notes: {customNotes}</div>}

                <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }}></div>

                {/* Items */}
                {order.items?.map((item: OrderItem, idx: number) => {
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
                  <span>DISCOUNT:</span><span>{(order.discount || 0).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                  <span>AMOUNT DUE:</span><span>{order.totalAmount.toFixed(2)}</span>
                </div>

                {/* Payment Status Banner */}
                <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }}></div>
                {order.status === 'cancelled' ? (
                  <div style={{ textAlign: 'center', fontWeight: 'bold', padding: '2px 0' }}>*** VOID / CANCELLED ***</div>
                ) : order.paymentStatus === 'paid' ? (
                  <div style={{ textAlign: 'center', fontWeight: 'bold', padding: '2px 0' }}>** FULLY PAID **</div>
                ) : order.paymentStatus === 'partial' ? (
                  <div>
                    <div style={{ textAlign: 'center', fontWeight: 'bold' }}>PARTIAL PAYMENT</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>PAID:</span><span>{paidAmount.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>BALANCE:</span><span>{balanceAmount.toFixed(2)}</span>
                    </div>
                  </div>
                ) : (
                  <div>
                    <div style={{ textAlign: 'center', fontWeight: 'bold' }}>UNPAID</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>BALANCE:</span><span>{order.totalAmount.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                <div style={{ borderBottom: '1px dashed #000', margin: '6px 0' }}></div>
                <div style={{ textAlign: 'center', marginTop: '8px' }}>** OFFICIAL RECEIPT **</div>
                <div style={{ textAlign: 'center', fontSize: '10px' }}>FACEBOOK:</div>
                <div style={{ textAlign: 'center', fontWeight: 'bold', fontSize: '11px' }}>{companyName.toUpperCase()}</div>
              </div>
            </div>
          ) : (
            <div>
              {/* Bond Controls Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', background: 'var(--bg-card)', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border)' }}>
                <div>
                  <span style={{ fontWeight: 600, fontSize: '13px' }}>Bond Paper Formal Invoice (A4 / Letter)</span>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    if (order.status === 'cancelled') {
                      const confirmed = await showConfirm('Cancelled Order', 'Order is Cancelled. Printed receipt will be watermarked as CANCELLED. Proceed?');
                      if (!confirmed) return;
                    }
                    printBondReceipt(order);
                  }}
                  className="btn btn-primary"
                  style={{ fontSize: '13px', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Printer size={16} /> Print Bond Paper
                </button>
              </div>

              {/* Bond Paper On-Screen Live Invoice Preview */}
              <div
                style={{
                  background: '#ffffff',
                  color: '#000000',
                  padding: '24px',
                  borderRadius: '8px',
                  fontFamily: 'Arial, sans-serif',
                  fontSize: '12px',
                  lineHeight: 1.4,
                  border: '1px solid #d1d5db',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.12)'
                }}
              >
                <div style={{ textAlign: 'center', marginBottom: '20px', position: 'relative' }}>
                  {order.status === 'cancelled' && (
                    <div style={{
                      position: 'absolute',
                      top: '50%',
                      left: '50%',
                      transform: 'translate(-50%, -50%) rotate(-15deg)',
                      fontSize: '36px',
                      fontWeight: '900',
                      color: 'rgba(220, 38, 38, 0.4)',
                      border: '4px solid rgba(220, 38, 38, 0.4)',
                      padding: '8px 16px',
                      zIndex: 10,
                      textTransform: 'uppercase',
                      pointerEvents: 'none'
                    }}>
                      CANCELLED / VOID INVOICE
                    </div>
                  )}
                  <h2 style={{ margin: 0, fontSize: '20px', fontWeight: 'bold', color: '#000000' }}>{companyName.toUpperCase()}</h2>
                  <p style={{ margin: '4px 0 0', fontSize: '11px', color: '#555', fontWeight: 'bold' }}>
                    MAUL ILIAN, MARANTAO LANAO DEL SUR
                    <br />
                    VAT Reg. TIN: 000-000-000-00000
                  </p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', borderTop: '2px solid #000', borderBottom: '2px solid #000', padding: '8px 0' }}>
                  <div>
                    <div><strong>SOLD TO:</strong> {!order.customer?.name || ['[normal walk-in]', 'normal walk-in', 'walk-in'].includes(order.customer.name.trim().toLowerCase()) ? 'BAIE' : order.customer.name}</div>
                    <div><strong>ADDRESS:</strong> {order.customer?.address || 'N/A'}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div><strong>SALES INVOICE NO:</strong> <span style={{ color: '#d97706', fontWeight: 'bold' }}>{order.orderNumber}</span></div>
                    <div><strong>DATE:</strong> {new Date(order.createdAt).toLocaleDateString('en-US')}</div>
                    <div><strong>STATUS:</strong> <span style={{ fontWeight: 'bold', textTransform: 'uppercase' }}>{order.paymentStatus || 'UNPAID'}</span></div>
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
                    {order.items?.map((item: OrderItem, idx: number) => {
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
                    {(order.discount || 0) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0', color: '#dc2626' }}>
                        <span>Discount:</span><span>-₱{Number(order.discount).toFixed(2)}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontWeight: 'bold', borderTop: '1px solid #000', fontSize: '13px' }}>
                      <span>TOTAL AMOUNT DUE:</span><span>₱{order.totalAmount.toFixed(2)}</span>
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
}
export default OrderReceiptModal;
