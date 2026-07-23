'use client';

import { useState, useEffect, useCallback } from 'react';
import { Printer, Wifi, WifiOff, CheckCircle, XCircle, RefreshCw, X, Settings } from 'lucide-react';
import {
  connectQZ,
  isQZConnected,
  getAvailablePrinters,
  savePrinterConfig,
  loadPrinterConfig,
  clearPrinterConfig,
  printRaw,
} from '@/lib/qzService';
import { buildReceipt, type PaperWidth } from '@/lib/escpos';

interface PrinterSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'failed';

export default function PrinterSetupModal({ isOpen, onClose }: PrinterSetupModalProps) {
  const [status, setStatus] = useState<ConnectionStatus>('idle');
  const [printers, setPrinters] = useState<string[]>([]);
  const [selectedPrinter, setSelectedPrinter] = useState('');
  const [paperWidth, setPaperWidth] = useState<PaperWidth>('58');
  const [isTestPrinting, setIsTestPrinting] = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'failed' | null>(null);
  const [isSaved, setIsSaved] = useState(false);

  // Load saved config on open
  useEffect(() => {
    if (!isOpen) return;
    const config = loadPrinterConfig();
    if (config) {
      setSelectedPrinter(config.printerName);
      setPaperWidth(config.paperWidth);
    }

    // Check if already connected
    isQZConnected().then(connected => {
      if (connected) {
        setStatus('connected');
        getAvailablePrinters().then(list => setPrinters(list));
      }
    });
  }, [isOpen]);

  const handleConnect = useCallback(async () => {
    setStatus('connecting');
    setTestResult(null);

    const connected = await connectQZ();
    if (connected) {
      setStatus('connected');
      const list = await getAvailablePrinters();
      setPrinters(list);
      if (!selectedPrinter && list.length > 0) {
        setSelectedPrinter(list[0]);
      }
    } else {
      setStatus('failed');
    }
  }, [selectedPrinter]);

  const handleSave = () => {
    if (!selectedPrinter) return;
    savePrinterConfig({ printerName: selectedPrinter, paperWidth });
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleClear = () => {
    clearPrinterConfig();
    setSelectedPrinter('');
    setPaperWidth('58');
    setStatus('idle');
    setPrinters([]);
  };

  const handleTestPrint = async () => {
    if (!selectedPrinter) return;
    // Save first so printRaw reads correct config
    savePrinterConfig({ printerName: selectedPrinter, paperWidth });

    setIsTestPrinting(true);
    setTestResult(null);

    const bytes = buildReceipt({
      companyName: 'AMRODING GENERAL MERCHANDISE',
      address: 'SARIMANOK ST. MARAWI CITY',
      branch: '2ND BRANCH',
      slogan: 'ALHAMDULILLAH',
      orderNo: 'TEST-001',
      createdBy: 'ADMIN',
      dateStr: new Date().toLocaleString('en-GB').replace(',', ''),
      items: [
        { name: 'SAMPLE PRODUCT', uom: 'PCS', qty: 2, price: 50.00 },
        { name: 'ANOTHER ITEM', qty: 1, price: 120.00 },
      ],
      subtotal: 220.00,
      discount: 0.00,
      amountDue: 220.00,
      cash: 300.00,
      change: 80.00,
    }, paperWidth);

    const success = await printRaw(bytes);
    setTestResult(success ? 'success' : 'failed');
    setIsTestPrinting(false);
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          width: '100%', maxWidth: '520px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 24px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Printer size={20} color="var(--primary)" />
            </div>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)', margin: 0 }}>Thermal Printer Setup</h2>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: 0 }}>Configure QZ Tray for direct ESC/POS printing</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px', borderRadius: 'var(--radius-sm)' }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>

          {/* QZ Tray Installation Notice */}
          <div style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              <Settings size={15} />
              Requirements
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.5 }}>
              QZ Tray must be installed and running on this PC.
              <br />
              <a href="https://qz.io/download/" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', fontWeight: 600 }}>
                → Download QZ Tray free at qz.io/download
              </a>
            </p>
          </div>

          {/* Connection Status */}
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
              QZ TRAY CONNECTION
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                flex: 1, padding: '12px 16px', borderRadius: 'var(--radius-md)',
                border: `1px solid ${status === 'connected' ? '#10b981' : status === 'failed' ? '#ef4444' : 'var(--border)'}`,
                background: status === 'connected' ? 'rgba(16,185,129,0.08)' : status === 'failed' ? 'rgba(239,68,68,0.08)' : 'var(--bg-hover)',
                display: 'flex', alignItems: 'center', gap: '10px',
              }}>
                {status === 'connected' ? (
                  <><Wifi size={16} color="#10b981" /><span style={{ fontSize: '13px', color: '#10b981', fontWeight: 600 }}>Connected to QZ Tray</span></>
                ) : status === 'failed' ? (
                  <><WifiOff size={16} color="#ef4444" /><span style={{ fontSize: '13px', color: '#ef4444', fontWeight: 600 }}>QZ Tray not detected</span></>
                ) : status === 'connecting' ? (
                  <><RefreshCw size={16} color="var(--primary)" style={{ animation: 'spin 1s linear infinite' }} /><span style={{ fontSize: '13px', color: 'var(--primary)', fontWeight: 600 }}>Connecting...</span></>
                ) : (
                  <><WifiOff size={16} color="var(--text-tertiary)" /><span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Not connected</span></>
                )}
              </div>
              <button
                onClick={handleConnect}
                disabled={status === 'connecting'}
                className="btn btn-primary"
                style={{ whiteSpace: 'nowrap', fontSize: '13px', padding: '10px 16px' }}
              >
                {status === 'connected' ? 'Refresh' : 'Connect'}
              </button>
            </div>
            {status === 'failed' && (
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 'var(--radius-md)', padding: '12px 14px', marginTop: '8px' }}>
                <p style={{ fontSize: '12px', color: '#b91c1c', margin: '0 0 8px', lineHeight: 1.5, fontWeight: 500 }}>
                  <strong>QZ Tray is running, but browser blocked the HTTPS connection.</strong>
                </p>
                <p style={{ fontSize: '12px', color: '#7f1d1d', margin: '0 0 10px', lineHeight: 1.5 }}>
                  Because your app is on HTTPS, Chrome/Edge requires accepting QZ Tray&apos;s local security certificate once.
                </p>
                <a
                  href="https://localhost:8181"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-secondary"
                  style={{ fontSize: '12px', padding: '6px 12px', background: '#fff', color: '#b91c1c', border: '1px solid #fca5a5', display: 'inline-flex', alignItems: 'center', gap: '6px', textDecoration: 'none' }}
                >
                  🔒 Allow HTTPS Certificate (Click Here) →
                </a>
                <p style={{ fontSize: '11px', color: '#991b1b', margin: '6px 0 0', lineHeight: 1.4 }}>
                  (Click the link above, click <strong>Advanced</strong> → <strong>Proceed to localhost (unsafe)</strong>, then come back and click <strong>Connect</strong>)
                </p>
              </div>
            )}
          </div>

          {/* Printer Selection */}
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
              SELECT PRINTER
            </label>
            {printers.length > 0 ? (
              <select
                value={selectedPrinter}
                onChange={e => setSelectedPrinter(e.target.value)}
                style={{
                  width: '100%', padding: '10px 12px', borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border)', background: 'var(--bg-hover)',
                  color: 'var(--text-primary)', fontSize: '14px', outline: 'none',
                }}
              >
                <option value="">— Choose a printer —</option>
                {printers.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            ) : (
              <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', border: '1px dashed var(--border)', background: 'var(--bg-hover)', fontSize: '13px', color: 'var(--text-secondary)', textAlign: 'center' }}>
                {status === 'connected' ? 'No printers found — make sure your printer is on.' : 'Connect to QZ Tray first to discover printers.'}
              </div>
            )}
            {selectedPrinter && printers.length === 0 && (
              <div style={{ marginTop: '8px', padding: '10px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', background: 'var(--bg-hover)', fontSize: '13px', color: 'var(--text-secondary)' }}>
                Previously saved: <strong style={{ color: 'var(--text-primary)' }}>{selectedPrinter}</strong>
              </div>
            )}
          </div>

          {/* Paper Width */}
          <div>
            <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '8px' }}>
              PAPER WIDTH
            </label>
            <div style={{ display: 'flex', gap: '12px' }}>
              {(['58', '80'] as PaperWidth[]).map(w => (
                <button
                  key={w}
                  onClick={() => setPaperWidth(w)}
                  style={{
                    flex: 1, padding: '14px 12px', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                    border: `2px solid ${paperWidth === w ? 'var(--primary)' : 'var(--border)'}`,
                    background: paperWidth === w ? 'var(--primary-light)' : 'var(--bg-hover)',
                    color: paperWidth === w ? 'var(--primary)' : 'var(--text-secondary)',
                    fontWeight: paperWidth === w ? 700 : 500, fontSize: '14px',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <Printer size={18} />
                  <span>{w}mm</span>
                  <span style={{ fontSize: '11px', fontWeight: 400, opacity: 0.7 }}>
                    {w === '58' ? '32 chars/line' : '48 chars/line'}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Test Print Result */}
          {testResult && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '12px 16px', borderRadius: 'var(--radius-md)',
              background: testResult === 'success' ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)',
              border: `1px solid ${testResult === 'success' ? '#10b981' : '#ef4444'}`,
            }}>
              {testResult === 'success'
                ? <><CheckCircle size={16} color="#10b981" /><span style={{ fontSize: '13px', color: '#10b981', fontWeight: 600 }}>Test print sent successfully!</span></>
                : <><XCircle size={16} color="#ef4444" /><span style={{ fontSize: '13px', color: '#ef4444', fontWeight: 600 }}>Test print failed — check printer connection.</span></>
              }
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: '10px', paddingTop: '4px' }}>
            <button
              onClick={handleTestPrint}
              disabled={!selectedPrinter || isTestPrinting}
              className="btn btn-secondary"
              style={{ flex: 1, fontSize: '13px' }}
            >
              {isTestPrinting ? 'Printing...' : '🖨 Test Print'}
            </button>
            <button
              onClick={handleSave}
              disabled={!selectedPrinter}
              className="btn btn-primary"
              style={{ flex: 1, fontSize: '13px' }}
            >
              {isSaved ? '✓ Saved!' : 'Save Config'}
            </button>
          </div>

          <button
            onClick={handleClear}
            style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', fontSize: '12px', cursor: 'pointer', textDecoration: 'underline', padding: 0, textAlign: 'center' }}
          >
            Clear saved printer config
          </button>
        </div>
      </div>
    </div>
  );
}
