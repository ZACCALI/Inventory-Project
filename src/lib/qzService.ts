/**
 * QZ Tray Service
 * Manages connection to QZ Tray (localhost:8181) and sends
 * raw ESC/POS byte data directly to the thermal printer.
 *
 * QZ Tray must be installed on the cashier's PC:
 * https://qz.io/download/
 */

import type { PaperWidth } from './escpos';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface PrinterConfig {
  printerName: string;
  paperWidth: PaperWidth;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QZ = any;

// ─── State ─────────────────────────────────────────────────────────────────────

let qzInstance: QZ = null;
let loadPromise: Promise<QZ> | null = null;

// ─── Load QZ Tray Script ───────────────────────────────────────────────────────

function loadQzScript(): Promise<QZ> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    // Check if already loaded globally
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof window !== 'undefined' && (window as any).qz) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      resolve((window as any).qz);
      return;
    }

    const script = document.createElement('script');
    // Load QZ Tray v2.2.6 from jsDelivr CDN
    script.src = 'https://cdn.jsdelivr.net/npm/qz-tray@2.2.6/qz-tray.min.js';
    script.async = true;
    script.onload = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const qz = (window as any).qz;
      if (qz) {
        resolve(qz);
      } else {
        reject(new Error('QZ Tray script loaded but qz global not found'));
      }
    };
    script.onerror = () => {
      loadPromise = null;
      reject(new Error('Failed to load QZ Tray script'));
    };
    document.head.appendChild(script);
  });

  return loadPromise;
}

// ─── Connection ────────────────────────────────────────────────────────────────

/**
 * Try to connect to QZ Tray. Returns true if connected, false otherwise.
 */
export async function connectQZ(): Promise<boolean> {
  try {
    const qz = await loadQzScript();

    if (qz.websocket.isActive()) {
      qzInstance = qz;
      return true;
    }

    // Allow unsigned connections — QZ Tray will show an approval prompt on the PC
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    qz.security.setCertificatePromise(function(resolve: any) {
      resolve(); // No certificate needed — allow unsigned
    });
    qz.security.setSignatureAlgorithm('SHA512');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    qz.security.setSignaturePromise(function() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return function(resolve: any) {
        resolve(); // No signature needed — allow unsigned
      };
    });

    await qz.websocket.connect({ retries: 3, delay: 1 });
    qzInstance = qz;
    console.log('[QZ] Connected successfully to QZ Tray');
    return true;
  } catch (err) {
    console.error('[QZ] Connection failed:', err);
    qzInstance = null;
    return false;
  }
}

/**
 * Check if QZ Tray WebSocket is currently connected.
 */
export async function isQZConnected(): Promise<boolean> {
  try {
    if (!qzInstance) return false;
    return qzInstance.websocket.isActive();
  } catch {
    return false;
  }
}

// ─── Printer Discovery ─────────────────────────────────────────────────────────

/**
 * Get list of available printers from QZ Tray.
 */
export async function getAvailablePrinters(): Promise<string[]> {
  try {
    const connected = await connectQZ();
    if (!connected) return [];
    const printers: string[] = await qzInstance.printers.find();
    return printers;
  } catch {
    return [];
  }
}

// ─── Config Persistence ────────────────────────────────────────────────────────

const STORAGE_KEY = 'qz_printer_config';

export function savePrinterConfig(config: PrinterConfig): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    window.dispatchEvent(new Event('printerConfigUpdated'));
  }
}

export function loadPrinterConfig(): PrinterConfig | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as PrinterConfig;
  } catch {
    return null;
  }
}

export function clearPrinterConfig(): void {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event('printerConfigUpdated'));
  }
}

// ─── Print ─────────────────────────────────────────────────────────────────────

/**
 * Send raw ESC/POS bytes to the configured printer via QZ Tray.
 * Returns true on success, false on failure.
 */
export async function printRaw(bytes: number[]): Promise<boolean> {
  try {
    const config = loadPrinterConfig();
    if (!config?.printerName) {
      console.warn('[QZ] No printer configured');
      return false;
    }

    const connected = await connectQZ();
    if (!connected) return false;

    // Convert byte array to Base64 binary string to guarantee exact ESC/POS byte delivery
    const uint8 = new Uint8Array(bytes);
    let binary = '';
    for (let i = 0; i < uint8.length; i++) {
      binary += String.fromCharCode(uint8[i]);
    }
    const base64Data = btoa(binary);

    const printConfig = qzInstance.configs.create(config.printerName, {
      raw: true,
      encoding: 'Cp1252',
    });

    await qzInstance.print(printConfig, [
      {
        type: 'raw',
        format: 'command',
        flavor: 'base64',
        data: base64Data,
      },
    ]);

    return true;
  } catch (err) {
    console.error('[QZ] Print failed:', err);
    return false;
  }
}
