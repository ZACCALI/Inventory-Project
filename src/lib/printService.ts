/**
 * Universal Thermal Print Service
 *
 * Tries QZ Tray (ESC/POS raw) first.
 * Falls back to HTML window.print() if QZ Tray is not installed/connected.
 */

import { buildReceipt, type PaperWidth } from './escpos';
import { printRaw, loadPrinterConfig } from './qzService';

// ─── Receipt Data ──────────────────────────────────────────────────────────────

export interface ThermalReceiptData {
  companyName: string;
  orderNo: string;
  createdBy: string;
  dateStr: string;
  driverName?: string;
  deliveryDate?: string;
  notes?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  items: any[];
  subtotal: number;
  discount: number;
  amountDue: number;
  cash?: number;
  change?: number;
}

// ─── Main Print Function ───────────────────────────────────────────────────────

/**
 * Print a thermal receipt.
 * 1. Attempts QZ Tray raw ESC/POS printing.
 * 2. Falls back to HTML window.print() if QZ Tray unavailable.
 *
 * Returns: 'qz' | 'html' | 'error'
 */
export async function printThermal(
  data: ThermalReceiptData,
  onFallback?: () => void,
): Promise<'qz' | 'html' | 'error'> {
  // ── Try QZ Tray ─────────────────────────────────────────────────────────────
  const config = loadPrinterConfig();

  if (config?.printerName) {
    try {
      const paper: PaperWidth = config.paperWidth || '58';

      const receiptItems = data.items.map((i) => ({
        name: (i.product?.name || i.name || 'Item'),
        uom: i.uomName || i.uom || undefined,
        qty: Number(i.quantity ?? i.qty ?? 1),
        price: Number(i.price ?? 0),
      }));

      const bytes = buildReceipt({
        companyName: data.companyName,
        address: 'SARIMANOK ST. MARAWI CITY',
        branch: '2ND BRANCH',
        slogan: 'ALHAMDULILLAH',
        orderNo: data.orderNo,
        createdBy: data.createdBy,
        dateStr: data.dateStr,
        driverName: data.driverName,
        deliveryDate: data.deliveryDate,
        notes: data.notes,
        items: receiptItems,
        subtotal: data.subtotal,
        discount: data.discount,
        amountDue: data.amountDue,
        cash: data.cash,
        change: data.change,
      }, paper);

      const success = await printRaw(bytes);
      if (success) return 'qz';
    } catch (err) {
      console.warn('[PrintService] QZ Tray print failed, falling back to HTML:', err);
    }
  }

  // ── Fallback: HTML window.print() ───────────────────────────────────────────
  if (onFallback) onFallback();
  return printHtmlFallback(data) ? 'html' : 'error';
}

// ─── HTML Fallback ─────────────────────────────────────────────────────────────

function printHtmlFallback(data: ThermalReceiptData): boolean {
  try {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return false;

    let itemsHtml = '';
    let totalQty = 0;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data.items.forEach((i: any) => {
      const name = ((i.product?.name || i.name || 'Item')).toUpperCase();
      const uom = (i.uomName || i.uom) ? ` (${i.uomName || i.uom})` : '';
      const qty = Number(i.quantity ?? i.qty ?? 1);
      totalQty += qty;
      const price = Number(i.price ?? 0).toFixed(2);
      const total = (qty * Number(i.price ?? 0)).toFixed(2);
      itemsHtml += `
        <div style="margin-bottom:1px">${name}${uom}</div>
        <div class="flex-row">
          <span>&nbsp;&nbsp;${qty} x ${price}</span>
          <span>${total}</span>
        </div>
      `;
    });

    const cashRow    = data.cash    !== undefined ? `<div class="flex-row"><span>CASH:</span><span>${data.cash.toFixed(2)}</span></div>` : '';
    const changeRow  = data.change  !== undefined ? `<div class="flex-row"><span>CHANGE:</span><span>${data.change.toFixed(2)}</span></div>` : '';
    const driverHtml = data.driverName   ? `<div>Driver: ${data.driverName}</div>` : '';
    const dateHtml   = data.deliveryDate ? `<div>Delivery: ${data.deliveryDate}</div>` : '';
    const notesHtml  = data.notes        ? `<div>Notes: ${data.notes}</div>` : '';

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Receipt</title>
  <style>
    @page { size: auto; margin: 0; }
    @media print { html,body { width:100%; max-width:58mm; margin:0 auto!important; padding:0!important; background:#fff!important; color:#000!important; -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
    * { box-sizing:border-box; }
    body { width:100%; max-width:58mm; margin:0 auto!important; padding:0!important; font-family:"Consolas","Courier New",monospace!important; font-size:14px!important; line-height:1.15!important; font-weight:900!important; color:#000!important; background:#fff!important; }
    .center { text-align:center; }
    .flex-row { display:flex; justify-content:space-between; align-items:flex-start; width:100%; margin:0!important; padding:0!important; }
    .divider { border-bottom:1px dashed #000; margin:4px 0; width:100%; }
    div { margin:0!important; padding:0!important; }
    .title { font-size:16px!important; font-weight:900!important; }
  </style>
</head>
<body>
  <div class="center title">${data.companyName.toUpperCase()}</div>
  <div class="center title">SARIMANOK ST. MARAWI CITY</div>
  <div class="center title">2ND BRANCH</div>
  <div class="center title">ALHAMDULILLAH</div>
  <div class="divider"></div>
  <div>Order No: ${data.orderNo}</div>
  <div>By: ${data.createdBy}</div>
  <div>${data.dateStr}</div>
  ${driverHtml}${dateHtml}${notesHtml}
  <div class="divider"></div>
  ${itemsHtml}
  <div class="flex-row"><span></span><span>(${totalQty}) Items</span></div>
  <div class="divider"></div>
  <div class="flex-row"><span>TOTAL SALE:</span><span>${data.subtotal.toFixed(2)}</span></div>
  <div class="flex-row"><span>DISCOUNT:</span><span>${data.discount.toFixed(2)}</span></div>
  <div class="flex-row"><span>AMOUNT DUE:</span><span>${data.amountDue.toFixed(2)}</span></div>
  ${cashRow}${changeRow}
  <div class="divider"></div>
  <br/>
  <div class="center">** OFFICIAL RECEIPT **</div>
  <div class="center">FACEBOOK:</div>
  <div class="center title">${data.companyName.toUpperCase()}</div>
  <br/><br/>
</body>
</html>`;

    printWindow.document.write(html);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 800);
    return true;
  } catch {
    return false;
  }
}
