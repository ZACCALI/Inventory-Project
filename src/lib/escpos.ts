/**
 * ESC/POS Command Builder
 * Builds raw byte arrays for thermal receipt printers.
 * Supports 58mm (32 chars/line) and 80mm (48 chars/line) paper widths.
 */

// ─── ESC/POS Constants ────────────────────────────────────────────────────────
const ESC = 0x1b;
const GS  = 0x1d;
const LF  = 0x0a;
const NUL = 0x00;

export const CMD = {
  INIT:           [ESC, 0x40],               // Initialize printer
  LF:             [LF],                       // Line feed
  ALIGN_LEFT:     [ESC, 0x61, 0x00],         // Left align
  ALIGN_CENTER:   [ESC, 0x61, 0x01],         // Center align
  ALIGN_RIGHT:    [ESC, 0x61, 0x02],         // Right align
  BOLD_ON:        [ESC, 0x45, 0x01],         // Bold on
  BOLD_OFF:       [ESC, 0x45, 0x00],         // Bold off
  DOUBLE_HEIGHT:  [GS, 0x21, 0x01],          // Double height text
  DOUBLE_SIZE:    [GS, 0x21, 0x11],          // Double width + height
  NORMAL_SIZE:    [GS, 0x21, 0x00],          // Normal size
  CUT_FULL:       [GS, 0x56, 0x41, NUL],    // Full paper cut
  CUT_PARTIAL:    [GS, 0x56, 0x01],          // Partial paper cut (GS V 1 — avoids 0x42='B' bleed)
  FEED_3:         [ESC, 0x64, 0x03],         // Feed 3 lines
  UNDERLINE_ON:   [ESC, 0x2d, 0x01],        // Underline on
  UNDERLINE_OFF:  [ESC, 0x2d, 0x00],        // Underline off
} as const;

// ─── Paper Width Config ────────────────────────────────────────────────────────
export type PaperWidth = '58' | '80';

export function getLineWidth(paper: PaperWidth | string | number): number {
  return String(paper) === '80' ? 48 : 32;
}

// CP1252 extended character mapping for common Filipino/Latin characters
const CP1252_MAP: Record<number, number> = {
  0x00C0: 0xC0, // À
  0x00C1: 0xC1, // Á
  0x00C2: 0xC2, // Â
  0x00C3: 0xC3, // Ã
  0x00C4: 0xC4, // Ä
  0x00C5: 0xC5, // Å
  0x00C6: 0xC6, // Æ
  0x00C7: 0xC7, // Ç
  0x00C8: 0xC8, // È
  0x00C9: 0xC9, // É
  0x00CA: 0xCA, // Ê
  0x00CB: 0xCB, // Ë
  0x00CC: 0xCC, // Ì
  0x00CD: 0xCD, // Í
  0x00CE: 0xCE, // Î
  0x00CF: 0xCF, // Ï
  0x00D0: 0xD0, // Ð
  0x00D1: 0xD1, // Ñ (Filipino Ñ)
  0x00D2: 0xD2, // Ò
  0x00D3: 0xD3, // Ó
  0x00D4: 0xD4, // Ô
  0x00D5: 0xD5, // Õ
  0x00D6: 0xD6, // Ö
  0x00D8: 0xD8, // Ø
  0x00D9: 0xD9, // Ù
  0x00DA: 0xDA, // Ú
  0x00DB: 0xDB, // Û
  0x00DC: 0xDC, // Ü
  0x00DD: 0xDD, // Ý
  0x00DE: 0xDE, // Þ
  0x00DF: 0xDF, // ß
  0x00E0: 0xE0, // à
  0x00E1: 0xE1, // á
  0x00E2: 0xE2, // â
  0x00E3: 0xE3, // ã
  0x00E4: 0xE4, // ä
  0x00E5: 0xE5, // å
  0x00E6: 0xE6, // æ
  0x00E7: 0xE7, // ç
  0x00E8: 0xE8, // è
  0x00E9: 0xE9, // é
  0x00EA: 0xEA, // ê
  0x00EB: 0xEB, // ë
  0x00EC: 0xEC, // ì
  0x00ED: 0xED, // í
  0x00EE: 0xEE, // î
  0x00EF: 0xEF, // ï
  0x00F0: 0xF0, // ð
  0x00F1: 0xF1, // ñ (Filipino ñ)
  0x00F2: 0xF2, // ò
  0x00F3: 0xF3, // ó
  0x00F4: 0xF4, // ô
  0x00F5: 0xF5, // õ
  0x00F6: 0xF6, // ö
  0x00F8: 0xF8, // ø
  0x00F9: 0xF9, // ù
  0x00FA: 0xFA, // ú
  0x00FB: 0xFB, // û
  0x00FC: 0xFC, // ü
  0x00FD: 0xFD, // ý
  0x00FE: 0xFE, // þ
  0x00FF: 0xFF, // ÿ
};

function encodeText(text: string): number[] {
  text = text.replace(/₱/g, 'P');
  const bytes: number[] = [];
  // CP1252 extended character mappings for common Filipino/Latin chars
  const cp1252Map: Record<string, number> = {
    'À': 0xC0, 'Á': 0xC1, 'Â': 0xC2, 'Ã': 0xC3, 'Ä': 0xC4, 'Å': 0xC5,
    'Æ': 0xC6, 'Ç': 0xC7, 'È': 0xC8, 'É': 0xC9, 'Ê': 0xCA, 'Ë': 0xCB,
    'Ì': 0xCC, 'Í': 0xCD, 'Î': 0xCE, 'Ï': 0xCF, 'Ð': 0xD0, 'Ñ': 0xD1,
    'Ò': 0xD2, 'Ó': 0xD3, 'Ô': 0xD4, 'Õ': 0xD5, 'Ö': 0xD6, 'Ø': 0xD8,
    'Ù': 0xD9, 'Ú': 0xDA, 'Û': 0xDB, 'Ü': 0xDC, 'Ý': 0xDD, 'Þ': 0xDE,
    'ß': 0xDF, 'à': 0xE0, 'á': 0xE1, 'â': 0xE2, 'ã': 0xE3, 'ä': 0xE4,
    'å': 0xE5, 'æ': 0xE6, 'ç': 0xE7, 'è': 0xE8, 'é': 0xE9, 'ê': 0xEA,
    'ë': 0xEB, 'ì': 0xEC, 'í': 0xED, 'î': 0xEE, 'ï': 0xEF, 'ð': 0xF0,
    'ñ': 0xF1, 'ò': 0xF2, 'ó': 0xF3, 'ô': 0xF4, 'õ': 0xF5, 'ö': 0xF6,
    'ø': 0xF8, 'ù': 0xF9, 'ú': 0xFA, 'û': 0xFB, 'ü': 0xFC, 'ý': 0xFD,
    'þ': 0xFE, 'ÿ': 0xFF,
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const code = text.charCodeAt(i);
    if (code < 128) {
      bytes.push(code);
    } else if (cp1252Map[char] !== undefined) {
      bytes.push(cp1252Map[char]);
    } else {
      // Replace unmapped non-ASCII with '?'
      bytes.push(0x3f);
    }
  }
  return bytes;
}

// ─── Text Line Helpers ─────────────────────────────────────────────────────────

/**
 * Pad or truncate a string to exactly `width` chars.
 */
export function padRight(text: string, width: number): string {
  if (text.length >= width) return text.substring(0, width);
  return text + ' '.repeat(width - text.length);
}

export function padLeft(text: string, width: number): string {
  if (text.length >= width) return text.substring(0, width);
  return ' '.repeat(width - text.length) + text;
}

/**
 * Center a string within a given width.
 */
export function center(text: string, width: number): string {
  if (text.length >= width) return text.substring(0, width);
  const totalPad = width - text.length;
  const left = Math.floor(totalPad / 2);
  const right = totalPad - left;
  return ' '.repeat(left) + text + ' '.repeat(right);
}

/**
 * Create a two-column row: left text and right text on the same line.
 * If combined length exceeds width, left text is truncated.
 */
export function twoCol(left: string, right: string, width: number): string {
  const maxLeft = width - right.length - 1;
  const l = left.length > maxLeft ? left.substring(0, maxLeft) : left;
  return padRight(l, maxLeft) + ' ' + right;
}

/**
 * Wrap text to multiple lines at a given width.
 */
export function wrapText(text: string, width: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if ((current + (current ? ' ' : '') + word).length <= width) {
      current += (current ? ' ' : '') + word;
    } else {
      if (current) lines.push(current);
      // If word itself is too long, hard-break it
      if (word.length > width) {
        let remaining = word;
        while (remaining.length > width) {
          lines.push(remaining.substring(0, width));
          remaining = remaining.substring(width);
        }
        current = remaining;
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Create a dashed separator line.
 */
export function dashedLine(width: number): string {
  return '-'.repeat(width);
}

// ─── Builder Class ─────────────────────────────────────────────────────────────

export class EscPos {
  private bytes: number[] = [];
  private width: number;

  constructor(paper: PaperWidth = '58') {
    this.width = getLineWidth(paper);
    // Send a NUL byte first to flush any stale buffered bytes from a previous print job
    // (prevents carry-over 0x42='B' from CUT_PARTIAL bleeding into the next receipt)
    this.bytes.push(NUL);
    this.add(CMD.INIT);
  }

  private add(bytes: readonly number[] | number[]): this {
    this.bytes.push(...bytes);
    return this;
  }

  private text(str: string): this {
    this.bytes.push(...encodeText(str));
    return this;
  }

  lf(count = 1): this {
    for (let i = 0; i < count; i++) this.add(CMD.LF);
    return this;
  }

  // ── Alignment ──────────────────────────────────────────────────────────────

  left(): this   { return this.add(CMD.ALIGN_LEFT); }
  center(): this { return this.add(CMD.ALIGN_CENTER); }
  right(): this  { return this.add(CMD.ALIGN_RIGHT); }

  // ── Style ──────────────────────────────────────────────────────────────────

  bold(on = true): this    { return on ? this.add(CMD.BOLD_ON) : this.add(CMD.BOLD_OFF); }
  doubleHeight(): this     { return this.add(CMD.DOUBLE_HEIGHT); }
  doubleSize(): this       { return this.add(CMD.DOUBLE_SIZE); }
  normalSize(): this       { return this.add(CMD.NORMAL_SIZE); }
  underline(on = true): this { return on ? this.add(CMD.UNDERLINE_ON) : this.add(CMD.UNDERLINE_OFF); }

  // ── Text Lines ─────────────────────────────────────────────────────────────

  /** Print centered text line(s) using printer hardware alignment and word wrapping */
  centerLine(str: string, isDoubleSize = false): this {
    const maxChars = isDoubleSize ? Math.floor(this.width / 2) : this.width;
    const lines = wrapText(str, maxChars);
    this.center();
    if (isDoubleSize) this.doubleSize();
    for (const l of lines) {
      this.text(l).lf();
    }
    if (isDoubleSize) this.normalSize();
    this.left();
    return this;
  }

  /** Print a full-width left-aligned text line */
  line(str: string): this {
    return this.left().text(str).lf();
  }

  /** Print a two-column row (left label, right value) */
  row(leftText: string, rightText: string): this {
    return this.left().text(twoCol(leftText, rightText, this.width)).lf();
  }

  /** Print a dashed separator */
  divider(): this {
    return this.left().text(dashedLine(this.width)).lf();
  }

  /** Print text that wraps across multiple lines */
  wrappedLine(str: string, indent = 0): this {
    const lines = wrapText(str, this.width - indent);
    for (const l of lines) {
      this.left().text(' '.repeat(indent) + l).lf();
    }
    return this;
  }

  // ── Actions ────────────────────────────────────────────────────────────────

  /** Feed N lines and cut paper */
  cutPaper(): this {
    return this.add(CMD.FEED_3).add(CMD.CUT_PARTIAL);
  }

  /** Get the final byte array */
  build(): number[] {
    return [...this.bytes];
  }

  /** Get as Uint8Array */
  buildUint8(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}

// ─── Receipt Builder ───────────────────────────────────────────────────────────

export interface ReceiptData {
  companyName: string;
  address: string;
  branch: string;
  slogan: string;
  orderNo: string;
  createdBy: string;
  dateStr: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  driverName?: string;
  deliveryDate?: string;
  notes?: string;
  items: Array<{
    name: string;
    uom?: string;
    qty: number;
    price: number;
  }>;
  subtotal: number;
  discount: number;
  amountDue: number;
  cash?: number;
  change?: number;
  paymentStatus?: string;
  amountPaid?: number;
  orderStatus?: string;
}

/**
 * Build a complete receipt as ESC/POS bytes.
 */
export function buildReceipt(data: ReceiptData, paper: PaperWidth = '58'): number[] {
  const p = new EscPos(paper);
  const w = getLineWidth(paper);

  const cleanCompanyName = data.companyName.replace(/^[bB]\s*/, '').replace(/b(?=amroding)/i, '');

  // ── Header ──────────────────────────────────────────────────────────────────
  p.bold(true)
   .centerLine(cleanCompanyName.toUpperCase(), true)
   .normalSize()
   .bold(true);

  const addressLine = (data.address && data.address.trim() && !data.address.toLowerCase().includes('marawi')) 
    ? data.address.toUpperCase() 
    : 'MAUL ILIAN, MARANTAO LANAO DEL SUR';

  p.centerLine(addressLine);
  if (data.branch && !data.branch.toLowerCase().includes('2nd branch') && data.branch.trim()) {
    p.centerLine(data.branch.toUpperCase());
  }
  if (data.slogan && data.slogan.toUpperCase() !== 'ALHAMDULILLAH' && data.slogan.trim()) {
    p.centerLine(data.slogan.toUpperCase());
  }
  p.divider();

  if (data.orderStatus === 'cancelled') {
    p.bold(true).centerLine('*** CANCELLED / VOID ORDER ***').bold(false).divider();
  }

  // ── Order Info ──────────────────────────────────────────────────────────────
  p.left();
  if (String(paper) === '58' && data.orderNo.length > 22) {
    p.line('Order No:').line(data.orderNo);
  } else {
    p.line(`Order No: ${data.orderNo}`);
  }
  p.line(`By: ${data.createdBy}`)
   .line(data.dateStr);

  const rawCustName = data.customerName?.trim();
  const displayCustName = (!rawCustName || ['[normal walk-in]', 'normal walk-in', 'walk-in'].includes(rawCustName.toLowerCase())) ? 'BAIE' : rawCustName;
  p.line(`Customer: ${displayCustName}`);
  if (data.customerPhone) p.line(`Phone: ${data.customerPhone}`);
  if (data.customerAddress) p.line(`Address: ${data.customerAddress}`);

  if (data.driverName)   p.line(`Driver: ${data.driverName}`);
  if (data.notes) {
    // Strip all system payment tracking phrases
    let cleanNotes = data.notes.replace(/₱/g, 'P').trim();
    
    // If notes contains system payment tracking text, remove the payment part
    if (/Paid via|Amount Paid:|Balance:/i.test(cleanNotes)) {
      // Keep only text before "Paid via" or "|" if any
      const parts = cleanNotes.split(/\s*\|\s*Paid via|\s*Paid via/i);
      const userNote = parts[0]?.trim();
      cleanNotes = (userNote && userNote !== 'Order' && userNote !== 'Walk-in Order') ? userNote : '';
    }
    
    if (cleanNotes) {
      p.wrappedLine(`Notes: ${cleanNotes}`);
    }
  }

  p.divider();

  // ── Items ───────────────────────────────────────────────────────────────────
  let totalQty = 0;
  for (const item of data.items) {
    totalQty += item.qty;
    const uom = item.uom ? ` (${item.uom})` : '';
    const nameStr = `${item.name.toUpperCase()}${uom}`;
    const qtyStr  = `  ${item.qty} x ${item.price.toFixed(2)}`;
    const totStr  = (item.qty * item.price).toFixed(2);

    // Wrap long product names
    const nameLines = wrapText(nameStr, w);
    for (const l of nameLines) p.line(l);
    p.row(qtyStr, totStr);
  }

  // ── Totals ──────────────────────────────────────────────────────────────────
  p.divider()
   .row('', `(${totalQty}) Items`)
   .divider()
   .row('TOTAL SALE:', data.subtotal.toFixed(2))
   .row('DISCOUNT:', data.discount.toFixed(2))
   .bold(true)
   .row('AMOUNT DUE:', data.amountDue.toFixed(2))
   .bold(false);

  if (data.cash !== undefined)   p.row('CASH:', data.cash.toFixed(2));
  if (data.change !== undefined) p.row('CHANGE:', data.change.toFixed(2));

  // ── Payment Status ─────────────────────────────────────────────────────────
  if (data.paymentStatus || data.orderStatus === 'cancelled') {
    p.divider();
    if (data.orderStatus === 'cancelled') {
      p.bold(true).centerLine('*** VOID / CANCELLED ***').bold(false);
    } else if (data.paymentStatus === 'paid') {
      p.bold(true).centerLine('** FULLY PAID **').bold(false);
    } else if (data.paymentStatus === 'partial') {
      const paidAmt = (data.amountPaid ?? 0).toFixed(2);
      const balanceAmt = (data.amountDue - (data.amountPaid ?? 0)).toFixed(2);
      p.bold(true).centerLine('PARTIAL PAYMENT').bold(false);
      p.row('PAID:', paidAmt);
      p.row('BALANCE:', balanceAmt);
    } else {
      p.bold(true).centerLine('UNPAID').bold(false);
      p.row('BALANCE:', data.amountDue.toFixed(2));
    }
    p.divider();
  }

  // ── Footer ──────────────────────────────────────────────────────────────────
  p.divider()
   .lf(1)
   .centerLine('** OFFICIAL RECEIPT **')
   .centerLine('FACEBOOK:')
   .bold(true)
   .centerLine(cleanCompanyName.toUpperCase())
   .bold(false)
   .lf(1)
   .cutPaper();

  return p.build();
}
