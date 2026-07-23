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
  CUT_PARTIAL:    [GS, 0x56, 0x42, NUL],    // Partial paper cut
  FEED_3:         [ESC, 0x64, 0x03],         // Feed 3 lines
  UNDERLINE_ON:   [ESC, 0x2d, 0x01],        // Underline on
  UNDERLINE_OFF:  [ESC, 0x2d, 0x00],        // Underline off
} as const;

// ─── Paper Width Config ────────────────────────────────────────────────────────
export type PaperWidth = '58' | '80';

export function getLineWidth(paper: PaperWidth): number {
  return paper === '80' ? 48 : 32;
}

// ─── Text Encoding ─────────────────────────────────────────────────────────────
function encodeText(text: string): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code < 128) {
      bytes.push(code);
    } else {
      // Replace non-ASCII with '?' for thermal compatibility
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
}

/**
 * Build a complete receipt as ESC/POS bytes.
 */
export function buildReceipt(data: ReceiptData, paper: PaperWidth = '58'): number[] {
  const p = new EscPos(paper);
  const w = getLineWidth(paper);

  // ── Header ──────────────────────────────────────────────────────────────────
  p.bold(true)
   .centerLine(data.companyName.toUpperCase(), true)
   .normalSize()
   .bold(true)
   .centerLine(data.address.toUpperCase())
   .centerLine(data.branch.toUpperCase())
   .centerLine(data.slogan.toUpperCase())
   .divider();

  // ── Order Info ──────────────────────────────────────────────────────────────
  p.left()
   .line(`Order No: ${data.orderNo}`)
   .line(`By: ${data.createdBy}`)
   .line(data.dateStr);

  if (data.driverName)   p.line(`Driver: ${data.driverName}`);
  if (data.deliveryDate) p.line(`Date: ${data.deliveryDate}`);
  if (data.notes)        p.wrappedLine(`Notes: ${data.notes}`);

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

  // ── Footer ──────────────────────────────────────────────────────────────────
  p.divider()
   .lf(1)
   .centerLine('** OFFICIAL RECEIPT **')
   .centerLine('FACEBOOK:')
   .bold(true)
   .centerLine(data.companyName.toUpperCase())
   .bold(false)
   .lf(1)
   .cutPaper();

  return p.build();
}
