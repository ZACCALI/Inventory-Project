import React from 'react';
import { } from '@/lib/constants';

interface ReceiptProps {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  order: any;
  companyName?: string;
}

export default function SalesInvoiceReceipt({ order, companyName = "AMRODING GENERAL MERCHANDISE" }: ReceiptProps) {
  if (!order) return null;

  // Assuming 12% VAT in Philippines
  const vatRate = 0.12;
  const totalAmount = order.totalAmount;
  
  // Calculate subtotal to find actual discount amount
// eslint-disable-next-line @typescript-eslint/no-explicit-any
  const calculatedSubtotal = order.items?.reduce((sum: number, item: any) => sum + (item.subtotal || item.quantity * item.price), 0) || totalAmount;
  const discountAmount = calculatedSubtotal > totalAmount ? calculatedSubtotal - totalAmount : 0;

  // Calculate VAT based on inclusive total: VAT = Total / 1.12 * 0.12
  const vatableSales = totalAmount / (1 + vatRate);
  const vatAmount = totalAmount - vatableSales;

  return (
    <div className="print-only receipt-container" style={{
      display: 'none', // Hidden on screen by default
      backgroundColor: 'white',
      color: 'black',
      fontFamily: 'Arial, sans-serif',
      fontSize: '12px',
      lineHeight: '1.4',
      padding: '20px',
      width: '100%',
      maxWidth: '210mm', // A4 width
      margin: '0 auto',
    }}>
      {/* HEADER */}
      <div style={{ textAlign: 'center', marginBottom: '20px', position: 'relative' }}>
        <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 'bold' }}>{companyName}</h1>
        <p style={{ margin: 0, fontSize: '11px' }}>
          Marawi City, Lanao del Sur, Philippines
          <br />
          VAT Reg. TIN: 000-000-000-00000
        </p>

        <div style={{ position: 'absolute', top: 0, right: 0, textAlign: 'right' }}>
          <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '4px' }}>SALES INVOICE</div>
          <div style={{ fontSize: '16px' }}>
            No. <span style={{ color: 'red', fontWeight: 'bold' }}>{order.orderNumber}</span>
          </div>
        </div>
      </div>

      {/* INFO BLOCK */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px', borderTop: '2px solid black', borderBottom: '2px solid black', padding: '10px 0' }}>
        <div style={{ flex: '0 0 65%' }}>
          <table style={{ width: '100%', fontSize: '12px' }}>
            <tbody>
              <tr>
                <td style={{ width: '90px', fontWeight: 'bold' }}>SOLD TO:</td>
                <td style={{ textTransform: 'uppercase', borderBottom: '1px solid #ccc' }}>{order.customer?.name}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 'bold' }}>ADDRESS:</td>
                <td style={{ textTransform: 'uppercase', borderBottom: '1px solid #ccc' }}>{order.customer?.address || 'N/A'}</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 'bold' }}>BUYER&apos;S TIN:</td>
                <td style={{ borderBottom: '1px solid #ccc' }}>N/A</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ flex: '0 0 32%' }}>
          <table style={{ width: '100%', fontSize: '12px' }}>
            <tbody>
              <tr>
                <td style={{ width: '80px', fontWeight: 'bold' }}>DATE:</td>
                <td style={{ borderBottom: '1px solid #ccc' }}>
                  {new Date(order.orderDate).toLocaleDateString('en-US')}
                </td>
              </tr>
              <tr>
                <td style={{ fontWeight: 'bold' }}>D.O. NO:</td>
                <td style={{ borderBottom: '1px solid #ccc' }}>N/A</td>
              </tr>
              <tr>
                <td style={{ fontWeight: 'bold' }}>TERMS:</td>
                <td style={{ borderBottom: '1px solid #ccc' }}>COD</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* ITEMS TABLE */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', fontSize: '12px' }}>
        <thead>
          <tr style={{ borderBottom: '2px solid black', borderTop: '1px solid black' }}>
            <th style={{ textAlign: 'left', padding: '8px 4px' }}>Item Description</th>
            <th style={{ textAlign: 'center', padding: '8px 4px' }}>Quantity</th>
            <th style={{ textAlign: 'right', padding: '8px 4px' }}>Unit Price</th>
            <th style={{ textAlign: 'right', padding: '8px 4px' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
{/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          {order.items?.map((item: any) => (
            <tr key={item.id}>
              <td style={{ padding: '8px 4px' }}>
                <div style={{ fontWeight: 'bold' }}>{item.product?.name} {item.uomName ? `(${item.uomName})` : ''}</div>
                <div style={{ fontSize: '10px', color: '#555' }}>{item.product?.sku}</div>
              </td>
              <td style={{ textAlign: 'center', padding: '8px 4px' }}>
                <div>{item.quantity} {item.uomName || item.product?.unit || 'pcs'}</div>
              </td>
              <td style={{ textAlign: 'right', padding: '8px 4px' }}>
                {Number(item.price).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
              <td style={{ textAlign: 'right', padding: '8px 4px' }}>
                {Number(item.subtotal).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            </tr>
          ))}
          {/* Fill empty space if few items */}
          {(!order.items || order.items.length < 5) && (
            <tr><td colSpan={4} style={{ padding: '40px' }}></td></tr>
          )}
        </tbody>
      </table>

      {/* TOTALS BLOCK */}
      <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '2px solid black', paddingTop: '10px', fontSize: '12px' }}>
        <div style={{ flex: '0 0 45%' }}>
          <table style={{ width: '100%' }}>
            <tbody>
              <tr>
                <td>VATABLE SALES</td>
                <td style={{ textAlign: 'right' }}>{vatableSales.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
              <tr>
                <td>VAT-EXEMPT SALES</td>
                <td style={{ textAlign: 'right' }}>0.00</td>
              </tr>
              <tr>
                <td>ZERO-RATED SALES</td>
                <td style={{ textAlign: 'right' }}>0.00</td>
              </tr>
              <tr>
                <td>VAT AMOUNT</td>
                <td style={{ textAlign: 'right' }}>{vatAmount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div style={{ flex: '0 0 45%' }}>
          <table style={{ width: '100%' }}>
            <tbody>
              {order.discount > 0 && (
                <tr>
                  <td>DISCOUNT ({order.discount}%)</td>
                  <td style={{ textAlign: 'right' }}>{discountAmount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                </tr>
              )}
              <tr>
                <td>TOTAL SALES (VAT INCLUSIVE)</td>
                <td style={{ textAlign: 'right' }}>{totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
              <tr>
                <td>LESS: VAT</td>
                <td style={{ textAlign: 'right' }}>{vatAmount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
              <tr>
                <td>AMOUNT NET OF VAT</td>
                <td style={{ textAlign: 'right' }}>{vatableSales.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
              <tr>
                <td>ADD VAT</td>
                <td style={{ textAlign: 'right' }}>{vatAmount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
              <tr style={{ fontWeight: 'bold', fontSize: '14px' }}>
                <td style={{ paddingTop: '8px' }}>TOTAL AMOUNT DUE</td>
                <td style={{ textAlign: 'right', paddingTop: '8px' }}>{totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* FOOTER */}
      <div style={{ marginTop: '40px', fontSize: '10px', borderTop: '1px solid black', paddingTop: '10px' }}>
        <p style={{ margin: '0 0 10px 0', textAlign: 'justify' }}>
          <strong>CONDITIONS:</strong> Cash unless otherwise arranged. It is agreed that if this bill is not paid within 30 days from date hereof, interest will be charged at 10% per annum on said bill after due date. The buyer hereby agrees to pay all attorney&apos;s fees and courts of Quezon City to collect the said court cost should seller institute legal action in the amount due us.
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '30px' }}>
          <div style={{ flex: '0 0 60%' }}>
            <p style={{ margin: 0 }}>We agree to all the conditions stipulated above and acknowledge receipt of the merchandise in good order and condition.</p>
            <div style={{ borderTop: '1px solid black', width: '80%', marginTop: '30px', textAlign: 'center', paddingTop: '4px' }}>
              Customer&apos;s Signature over Printed Name
            </div>
          </div>
          <div style={{ flex: '0 0 35%' }}>
            <div style={{ borderTop: '1px solid black', width: '100%', marginTop: '42px', textAlign: 'center', paddingTop: '4px' }}>
              Customer&apos;s Authorized Representative
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
